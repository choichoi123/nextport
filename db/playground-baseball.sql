-- Development baseball database only. Execute as its owner, not the app role.
-- No credentials, production IDs, ranking records, IPs or profile names here.
BEGIN;

DO $roles$
BEGIN
  IF pg_catalog.current_database() <> 'baseball_dev' THEN
    RAISE EXCEPTION 'This migration requires the dedicated development database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'baseball_runtime') THEN
    CREATE ROLE baseball_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'baseball_runtime'
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname='baseball_runtime') THEN
    RAISE EXCEPTION 'The application role must not have administrative capabilities';
  END IF;
  EXECUTE pg_catalog.format('REVOKE ALL ON DATABASE %I FROM PUBLIC', pg_catalog.current_database());
  EXECUTE pg_catalog.format('GRANT CONNECT ON DATABASE %I TO baseball_runtime', pg_catalog.current_database());
END
$roles$;

CREATE SCHEMA IF NOT EXISTS baseball_private;
REVOKE ALL ON SCHEMA baseball_private FROM PUBLIC;
GRANT USAGE ON SCHEMA baseball_private TO baseball_runtime;

-- The managed role was initially provisioned read-only on an empty public
-- schema. Remove those direct/default grants inside this database only.
REVOKE ALL ON SCHEMA public FROM PUBLIC, baseball_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM baseball_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM baseball_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM baseball_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM baseball_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM baseball_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM baseball_runtime;

CREATE TABLE IF NOT EXISTS baseball_private.practices (
  session_id uuid PRIMARY KEY,
  owner_hash text NOT NULL CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 1000000),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(snapshot) = 'object' AND pg_catalog.octet_length(snapshot::text) <= 524288),
  completed integer NOT NULL CHECK (completed BETWEEN 0 AND 10),
  aborted integer NOT NULL CHECK (aborted BETWEEN 0 AND 100),
  swings integer NOT NULL CHECK (swings BETWEEN 0 AND 100),
  received_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX IF NOT EXISTS baseball_practices_owner_time_idx ON baseball_private.practices(owner_hash, received_at DESC);

CREATE TABLE IF NOT EXISTS baseball_private.pitch_attempts (
  attempt_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES baseball_private.practices(session_id),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
  state text NOT NULL CHECK (state IN ('started','completed','aborted')),
  payload jsonb NOT NULL,
  server_result jsonb,
  UNIQUE (session_id, ordinal)
);

CREATE TABLE IF NOT EXISTS baseball_private.rate_limits (
  owner_hash text PRIMARY KEY CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests >= 1)
);

CREATE OR REPLACE FUNCTION baseball_private.baseball_take_rate_limit(p_owner text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private AS $function$
DECLARE n integer; t timestamptz := clock_timestamp();
BEGIN
  INSERT INTO baseball_private.rate_limits AS r(owner_hash,window_started_at,requests)
  VALUES (p_owner,t,1)
  ON CONFLICT (owner_hash) DO UPDATE SET
    window_started_at=CASE WHEN r.window_started_at <= t-interval '1 minute' THEN t ELSE r.window_started_at END,
    requests=CASE WHEN r.window_started_at <= t-interval '1 minute' THEN 1 ELSE LEAST(r.requests+1,121) END
  RETURNING requests INTO n;
  RETURN n <= 120;
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_save_practice(
  p_owner text, p_id uuid, p_revision integer, p_hash text, p_snapshot jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private AS $function$
DECLARE
  prior baseball_private.practices%ROWTYPE;
  incoming jsonb;
  prior_session jsonb;
  old_attempt jsonb;
  new_attempt jsonb;
  item jsonb;
  n integer; old_count integer; completed_count integer; aborted_count integer; swing_count integer;
BEGIN
  IF p_owner IS NULL OR p_id IS NULL OR p_revision IS NULL OR p_hash IS NULL OR p_snapshot IS NULL
    OR p_owner !~ '^[a-f0-9]{64}$' OR p_hash !~ '^[a-f0-9]{64}$' OR p_revision NOT BETWEEN 1 AND 1000000
    OR jsonb_typeof(p_snapshot) <> 'object' OR octet_length(p_snapshot::text)>524288
    OR p_snapshot->>'schemaVersion' <> '1' OR p_snapshot->>'trust' <> 'local-unverified'
    OR p_snapshot->>'storage' <> 'memory' OR jsonb_typeof(p_snapshot->'sessions') <> 'array'
    OR jsonb_array_length(p_snapshot->'sessions') <> 1 THEN
    RETURN jsonb_build_object('status','error','code','invalid_submission');
  END IF;
  incoming := p_snapshot->'sessions'->0;
  IF incoming->>'sessionId' IS DISTINCT FROM p_id::text OR jsonb_typeof(incoming->'attempts') <> 'array'
    OR jsonb_array_length(incoming->'attempts')>100 THEN
    RETURN jsonb_build_object('status','error','code','invalid_submission');
  END IF;
  IF NOT baseball_private.baseball_take_rate_limit(p_owner) THEN
    RETURN jsonb_build_object('status','error','code','rate_limited');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  SELECT * INTO prior FROM baseball_private.practices WHERE session_id=p_id FOR UPDATE;
  IF FOUND THEN
    IF prior.owner_hash <> p_owner THEN RETURN jsonb_build_object('status','error','code','session_conflict'); END IF;
    IF p_revision < prior.revision THEN RETURN jsonb_build_object('status','error','code','stale_revision'); END IF;
    IF p_revision = prior.revision THEN
      IF prior.payload_hash <> p_hash OR prior.snapshot IS DISTINCT FROM p_snapshot THEN
        RETURN jsonb_build_object('status','error','code','session_conflict');
      END IF;
      RETURN jsonb_build_object('status','stored','sessionId',p_id,'revision',p_revision,'completed',prior.completed,'aborted',prior.aborted,'serverComputed',true);
    END IF;
    prior_session := prior.snapshot->'sessions'->0;
    IF (incoming-'attempts'-'endedAt'-'status'-'endReason') IS DISTINCT FROM (prior_session-'attempts'-'endedAt'-'status'-'endReason')
      OR prior_session->>'status'='ended' AND incoming IS DISTINCT FROM prior_session THEN
      RETURN jsonb_build_object('status','error','code','session_conflict');
    END IF;
    old_count := jsonb_array_length(prior_session->'attempts');
    IF jsonb_array_length(incoming->'attempts')<old_count THEN RETURN jsonb_build_object('status','error','code','session_conflict'); END IF;
    IF old_count>0 THEN
      FOR n IN 0..old_count-1 LOOP
        old_attempt:=prior_session->'attempts'->n; new_attempt:=incoming->'attempts'->n;
        IF old_attempt->>'state'<>'started' THEN
          IF old_attempt IS DISTINCT FROM new_attempt THEN RETURN jsonb_build_object('status','error','code','session_conflict'); END IF;
        ELSE
          IF (old_attempt-'endedAt'-'state'-'result'-'abortReason'-'elapsedMs'-'swingAtMs'-'aim'-'input')
            IS DISTINCT FROM (new_attempt-'endedAt'-'state'-'result'-'abortReason'-'elapsedMs'-'swingAtMs'-'aim'-'input') THEN
            RETURN jsonb_build_object('status','error','code','session_conflict');
          END IF;
          IF old_attempt->'swingAtMs'<>'null'::jsonb AND
            (old_attempt->'swingAtMs' IS DISTINCT FROM new_attempt->'swingAtMs' OR old_attempt->'aim' IS DISTINCT FROM new_attempt->'aim' OR old_attempt->'input' IS DISTINCT FROM new_attempt->'input') THEN
            RETURN jsonb_build_object('status','error','code','session_conflict');
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;
  -- A UUID cannot be reassigned to another practice, even under the same owner.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(incoming->'attempts') v
    JOIN baseball_private.pitch_attempts a ON a.attempt_id=(v->>'attemptId')::uuid
    WHERE a.session_id<>p_id OR a.ordinal<>(v->>'attemptNumber')::integer) THEN
    RETURN jsonb_build_object('status','error','code','session_conflict');
  END IF;
  SELECT count(*) FILTER (WHERE v->>'state'='completed'), count(*) FILTER (WHERE v->>'state'='aborted'),
    count(*) FILTER (WHERE v->'swingAtMs'<>'null'::jsonb)
    INTO completed_count,aborted_count,swing_count FROM jsonb_array_elements(incoming->'attempts') v;
  INSERT INTO baseball_private.practices(session_id,owner_hash,revision,payload_hash,snapshot,completed,aborted,swings)
    VALUES (p_id,p_owner,p_revision,p_hash,p_snapshot,completed_count,aborted_count,swing_count)
  ON CONFLICT (session_id) DO UPDATE SET revision=EXCLUDED.revision,payload_hash=EXCLUDED.payload_hash,
    snapshot=EXCLUDED.snapshot,completed=EXCLUDED.completed,aborted=EXCLUDED.aborted,swings=EXCLUDED.swings,received_at=clock_timestamp();
  FOR item IN SELECT value FROM jsonb_array_elements(incoming->'attempts') LOOP
    INSERT INTO baseball_private.pitch_attempts(attempt_id,session_id,ordinal,state,payload,server_result)
      VALUES ((item->>'attemptId')::uuid,p_id,(item->>'attemptNumber')::integer,item->>'state',item,item->'result')
    ON CONFLICT (attempt_id) DO UPDATE SET state=EXCLUDED.state,payload=EXCLUDED.payload,server_result=EXCLUDED.server_result;
  END LOOP;
  RETURN jsonb_build_object('status','stored','sessionId',p_id,'revision',p_revision,'completed',completed_count,'aborted',aborted_count,'serverComputed',true);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status','error','code','session_conflict');
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_get_practices(p_owner text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private AS $function$
DECLARE result jsonb;
BEGIN
  IF p_owner IS NULL OR p_owner !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','error','code','invalid_submission'); END IF;
  IF NOT baseball_private.baseball_take_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('sessionId',session_id,'revision',revision,'status',snapshot->'sessions'->0->>'status',
    'completed',completed,'aborted',aborted,'swings',swings,'receivedAt',received_at,'serverComputed',true)
    ORDER BY received_at DESC),'[]'::jsonb) INTO result
    FROM (SELECT * FROM baseball_private.practices WHERE owner_hash=p_owner ORDER BY received_at DESC,session_id LIMIT 20) rows;
  RETURN jsonb_build_object('status','ok','practices',result);
END
$function$;

REVOKE ALL ON ALL TABLES IN SCHEMA baseball_private FROM PUBLIC, baseball_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA baseball_private FROM PUBLIC, baseball_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA baseball_private FROM PUBLIC, baseball_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA baseball_private REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA baseball_private REVOKE ALL ON FUNCTIONS FROM PUBLIC;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_save_practice(text,uuid,integer,text,jsonb) TO baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_get_practices(text) TO baseball_runtime;
COMMIT;
