-- Development-only player recovery. Apply after both career migrations.
-- No raw recovery code, IP, cookie or signing secret is stored here.
BEGIN;
DO $guard$
BEGIN
  IF pg_catalog.current_database()<>'baseball_dev'
    OR pg_catalog.to_regclass('baseball_private.career_saves') IS NULL
    OR pg_catalog.to_regclass('baseball_private.career_v2_saves') IS NULL THEN
    RAISE EXCEPTION 'The dedicated baseball development database and both career tables are required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_runtime')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_runtime' AND(rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname='baseball_runtime') THEN
    RAISE EXCEPTION 'The existing restricted baseball role is required';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS baseball_private.career_recovery_codes(
  career_version integer NOT NULL CHECK(career_version IN(1,2)),
  career_id uuid NOT NULL,
  generation integer NOT NULL CHECK(generation>=1),
  lookup_hash text UNIQUE CHECK(lookup_hash~'^[a-f0-9]{64}$'),
  encrypted_code text CHECK(octet_length(encrypted_code) BETWEEN 40 AND 512),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(career_version,career_id),
  CHECK(active AND lookup_hash IS NOT NULL AND encrypted_code IS NOT NULL
    OR NOT active AND lookup_hash IS NULL AND encrypted_code IS NULL)
);
CREATE TABLE IF NOT EXISTS baseball_private.career_recovery_grants(
  career_version integer NOT NULL,
  career_id uuid NOT NULL,
  actor_hash text NOT NULL CHECK(actor_hash~'^[a-f0-9]{64}$'),
  generation integer NOT NULL CHECK(generation>=1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(career_version,career_id,actor_hash),
  FOREIGN KEY(career_version,career_id) REFERENCES baseball_private.career_recovery_codes(career_version,career_id)
);
CREATE INDEX IF NOT EXISTS baseball_career_recovery_grants_actor_idx
  ON baseball_private.career_recovery_grants(actor_hash,career_version,career_id);
CREATE TABLE IF NOT EXISTS baseball_private.career_recovery_limits(
  bucket text PRIMARY KEY CHECK(bucket~'^(actor|code):[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK(requests>=1)
);
CREATE INDEX IF NOT EXISTS baseball_career_recovery_limits_window_idx
  ON baseball_private.career_recovery_limits(window_started_at);

CREATE OR REPLACE FUNCTION baseball_private.baseball_take_career_recovery_rate(p_actor text,p_hash text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE t timestamptz:=clock_timestamp(); n integer; bucket_name text; item text;
BEGIN
  IF p_actor IS NULL OR p_actor!~'^[a-f0-9]{64}$' OR p_hash IS NOT NULL AND p_hash!~'^[a-f0-9]{64}$' THEN RETURN false; END IF;
  -- A fixed cap and bounded expiry cleanup also bound random-code bucket growth.
  PERFORM pg_advisory_xact_lock(hashtextextended('baseball-career-recovery-rate-cap',0));
  DELETE FROM baseball_private.career_recovery_limits WHERE bucket IN(
    SELECT bucket FROM baseball_private.career_recovery_limits WHERE window_started_at<t-interval '1 hour' LIMIT 250);
  FOREACH item IN ARRAY ARRAY['actor:'||p_actor,CASE WHEN p_hash IS NULL THEN NULL ELSE 'code:'||p_hash END] LOOP
    IF item IS NULL THEN CONTINUE; END IF;
    bucket_name:=item;
    IF NOT EXISTS(SELECT 1 FROM baseball_private.career_recovery_limits WHERE bucket=bucket_name)
      AND(SELECT count(*) FROM baseball_private.career_recovery_limits)>=10000 THEN RETURN false; END IF;
    INSERT INTO baseball_private.career_recovery_limits AS r(bucket,window_started_at,requests)VALUES(bucket_name,t,1)
      ON CONFLICT(bucket)DO UPDATE SET
        window_started_at=CASE WHEN r.window_started_at<=t-interval '1 minute' THEN t ELSE r.window_started_at END,
        requests=CASE WHEN r.window_started_at<=t-interval '1 minute' THEN 1 ELSE LEAST(r.requests+1,31) END
      RETURNING requests INTO n;
    IF n>(CASE WHEN item LIKE 'actor:%' THEN 30 ELSE 5 END) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_career_source_owner(p_id uuid,p_version integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE source_owner text;
BEGIN
  IF p_version=1 THEN SELECT owner_hash INTO source_owner FROM baseball_private.career_saves WHERE career_id=p_id;
  ELSIF p_version=2 THEN SELECT owner_hash INTO source_owner FROM baseball_private.career_v2_saves WHERE career_id=p_id;
  END IF;
  RETURN source_owner;
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_career_recovery_code(p_actor text,p_id uuid,p_version integer,p_action text,p_hash text DEFAULT NULL,p_encrypted text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE prior baseball_private.career_recovery_codes%ROWTYPE; next_generation integer;
BEGIN
  IF p_actor IS NULL OR p_actor!~'^[a-f0-9]{64}$' OR p_id IS NULL OR p_version IS NULL OR p_version NOT IN(1,2)
    OR p_action IS NULL OR p_action NOT IN('read','issue','rotate','revoke') THEN RETURN jsonb_build_object('status','error','code','recovery_unavailable'); END IF;
  IF NOT baseball_private.baseball_take_career_recovery_rate(p_actor) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  IF baseball_private.baseball_career_source_owner(p_id,p_version) IS DISTINCT FROM p_actor THEN
    RETURN jsonb_build_object('status','error','code','recovery_unavailable');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('baseball-career-recovery:'||p_version||':'||p_id,0));
  SELECT * INTO prior FROM baseball_private.career_recovery_codes WHERE career_version=p_version AND career_id=p_id FOR UPDATE;
  IF p_action='read' OR p_action='issue' AND prior.active IS TRUE THEN
    RETURN jsonb_build_object('status','ok','state',CASE WHEN prior.active IS TRUE THEN 'active' WHEN prior.career_id IS NULL THEN 'absent' ELSE 'revoked' END,
      'encryptedCode',prior.encrypted_code);
  END IF;
  IF p_action='revoke' THEN
    IF prior.active IS TRUE THEN
      UPDATE baseball_private.career_recovery_codes SET active=false,lookup_hash=NULL,encrypted_code=NULL,generation=generation+1,updated_at=clock_timestamp()
        WHERE career_version=p_version AND career_id=p_id;
    END IF;
    RETURN jsonb_build_object('status','ok','state',CASE WHEN prior.career_id IS NULL THEN 'absent' ELSE 'revoked' END,'encryptedCode',NULL);
  END IF;
  IF p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' OR p_encrypted IS NULL OR octet_length(p_encrypted) NOT BETWEEN 40 AND 512
    OR p_encrypted!~'^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN RETURN jsonb_build_object('status','error','code','recovery_unavailable'); END IF;
  next_generation:=coalesce(prior.generation,0)+1;
  INSERT INTO baseball_private.career_recovery_codes(career_version,career_id,generation,lookup_hash,encrypted_code)
    VALUES(p_version,p_id,next_generation,p_hash,p_encrypted)
    ON CONFLICT(career_version,career_id)DO UPDATE SET generation=EXCLUDED.generation,lookup_hash=EXCLUDED.lookup_hash,
      encrypted_code=EXCLUDED.encrypted_code,active=true,updated_at=clock_timestamp();
  RETURN jsonb_build_object('status','ok','state','active','encryptedCode',p_encrypted);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('status','error','code','recovery_unavailable');
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_redeem_career_code(p_actor text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE selected baseball_private.career_recovery_codes%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_actor!~'^[a-f0-9]{64}$' OR p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','error','code','recovery_unavailable'); END IF;
  IF NOT baseball_private.baseball_take_career_recovery_rate(p_actor,p_hash) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  SELECT * INTO selected FROM baseball_private.career_recovery_codes WHERE lookup_hash=p_hash AND active FOR UPDATE;
  IF NOT FOUND OR baseball_private.baseball_career_source_owner(selected.career_id,selected.career_version) IS NULL THEN
    RETURN jsonb_build_object('status','error','code','recovery_unavailable');
  END IF;
  INSERT INTO baseball_private.career_recovery_grants(career_version,career_id,actor_hash,generation)
    VALUES(selected.career_version,selected.career_id,p_actor,selected.generation)
    ON CONFLICT(career_version,career_id,actor_hash)DO UPDATE SET generation=EXCLUDED.generation,created_at=clock_timestamp();
  RETURN jsonb_build_object('status','ok','careerId',selected.career_id,'version',selected.career_version);
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_resolve_career_owner(p_actor text,p_id uuid,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE source_owner text;
BEGIN
  IF p_actor IS NULL OR p_actor!~'^[a-f0-9]{64}$' OR p_id IS NULL OR p_version IS NULL OR p_version NOT IN(1,2) THEN RETURN jsonb_build_object('status','not_found'); END IF;
  source_owner:=baseball_private.baseball_career_source_owner(p_id,p_version);
  IF source_owner IS NULL OR source_owner<>p_actor AND NOT EXISTS(
    SELECT 1 FROM baseball_private.career_recovery_grants g JOIN baseball_private.career_recovery_codes c
      USING(career_version,career_id) WHERE g.actor_hash=p_actor AND g.career_id=p_id AND g.career_version=p_version AND c.active AND g.generation=c.generation
  ) THEN RETURN jsonb_build_object('status','not_found'); END IF;
  RETURN jsonb_build_object('status','ok','ownerHash',source_owner);
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_list_accessible_careers(p_actor text,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE result jsonb;
BEGIN
  IF p_actor IS NULL OR p_actor!~'^[a-f0-9]{64}$' OR p_version IS NULL OR p_version NOT IN(1,2) THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
  IF NOT baseball_private.baseball_take_career_rate_limit(p_actor) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  IF p_version=1 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',career_id,'revision',revision,'profile',snapshot->'profile','status',snapshot->>'status',
      'completedGames',(snapshot->>'currentGameIndex')::integer,'updatedAt',updated_at)ORDER BY updated_at DESC,career_id),'[]'::jsonb)INTO result
      FROM(SELECT s.career_id,s.revision,s.snapshot,s.updated_at FROM baseball_private.career_saves s WHERE s.owner_hash=p_actor OR EXISTS(
        SELECT 1 FROM baseball_private.career_recovery_grants g JOIN baseball_private.career_recovery_codes c USING(career_version,career_id)
          WHERE g.actor_hash=p_actor AND g.career_version=1 AND g.career_id=s.career_id AND c.active AND g.generation=c.generation)
        ORDER BY s.updated_at DESC,s.career_id LIMIT 20)rows;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',career_id,'revision',revision,'profile',snapshot->'profile','status',snapshot->>'status',
      'completedGames',(snapshot->>'currentGameIndex')::integer,'updatedAt',updated_at)ORDER BY updated_at DESC,career_id),'[]'::jsonb)INTO result
      FROM(SELECT s.career_id,s.revision,s.snapshot,s.updated_at FROM baseball_private.career_v2_saves s WHERE s.owner_hash=p_actor OR EXISTS(
        SELECT 1 FROM baseball_private.career_recovery_grants g JOIN baseball_private.career_recovery_codes c USING(career_version,career_id)
          WHERE g.actor_hash=p_actor AND g.career_version=2 AND g.career_id=s.career_id AND c.active AND g.generation=c.generation)
        ORDER BY s.updated_at DESC,s.career_id LIMIT 20)rows;
  END IF;
  RETURN jsonb_build_object('status','ok','careers',result);
END
$function$;

REVOKE ALL ON baseball_private.career_recovery_codes,baseball_private.career_recovery_grants,baseball_private.career_recovery_limits FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_take_career_recovery_rate(text,text) FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_career_source_owner(uuid,integer) FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_career_recovery_code(text,uuid,integer,text,text,text) FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_redeem_career_code(text,text) FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_resolve_career_owner(text,uuid,integer) FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_list_accessible_careers(text,integer) FROM PUBLIC,baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_career_recovery_code(text,uuid,integer,text,text,text) TO baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_redeem_career_code(text,text) TO baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_resolve_career_owner(text,uuid,integer) TO baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_list_accessible_careers(text,integer) TO baseball_runtime;
COMMIT;
