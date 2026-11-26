-- 야구 운영 001 단계. 원본: db/playground-baseball.sql
-- 기존 개발 SQL은 수정하지 않는다. 함수 본문·테이블·저장 계약은 원본과 같다.
-- 000 및 선행 단계를 적용한 관리 연결로만 실행한다. 비밀값/업무 데이터 없음.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $guard$
DECLARE
  required_table text;
  required_function text;
BEGIN
  IF pg_catalog.current_database() <> 'baseball_prod' OR current_user <> session_user
    OR current_user IN ('baseball_prod_owner','baseball_prod_runtime') THEN
    RAISE EXCEPTION 'Use the approved migrator in the dedicated baseball production database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_prod_owner'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_prod_runtime'
      AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member
      WHERE r.rolname IN ('baseball_prod_owner','baseball_prod_runtime')) THEN
    RAISE EXCEPTION 'The isolated production owner and restricted runtime roles are required';
  END IF;
  IF NOT pg_catalog.pg_has_role(session_user,'baseball_prod_owner','MEMBER')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace
      WHERE nspname='baseball_private' AND nspowner='baseball_prod_owner'::regrole) THEN
    RAISE EXCEPTION 'Apply the production bootstrap and verify migrator SET ROLE first';
  END IF;
  FOREACH required_table IN ARRAY ARRAY[]::text[] LOOP
    IF pg_catalog.to_regclass('baseball_private.'||required_table) IS NULL THEN
      RAISE EXCEPTION 'Apply the preceding production table migrations first';
    END IF;
  END LOOP;
  FOREACH required_function IN ARRAY ARRAY[]::text[] LOOP
    IF pg_catalog.to_regprocedure(required_function) IS NULL THEN
      RAISE EXCEPTION 'Apply the preceding production RPC migrations first';
    END IF;
  END LOOP;
END
$guard$;
SET LOCAL ROLE baseball_prod_owner;

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
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
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
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
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
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
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

REVOKE ALL ON ALL TABLES IN SCHEMA baseball_private FROM PUBLIC, baseball_prod_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA baseball_private FROM PUBLIC, baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_take_rate_limit(text) FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_save_practice(text,uuid,integer,text,jsonb) FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_get_practices(text) FROM PUBLIC,baseball_prod_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_save_practice(text,uuid,integer,text,jsonb) TO baseball_prod_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_get_practices(text) TO baseball_prod_runtime;

-- 읽기 전용 카탈로그 검사. 업무 행을 만들거나 수정하지 않는다.
DO $catalog$
DECLARE
  allowed_tables text[] := ARRAY[
    'practices',
    'pitch_attempts',
    'rate_limits',
    'at_bats',
    'at_bat_commands',
    'at_bat_rate_limits',
    'career_saves',
    'career_commands',
    'career_at_bats',
    'career_rate_limits',
    'career_v2_saves',
    'career_v2_commands',
    'career_v2_at_bats',
    'career_v2_rate_limits',
    'career_recovery_codes',
    'career_recovery_grants',
    'career_recovery_limits'
  ];
  allowed_functions text[] := ARRAY[
    'baseball_private.baseball_take_rate_limit(text)',
    'baseball_private.baseball_save_practice(text,uuid,integer,text,jsonb)',
    'baseball_private.baseball_get_practices(text)',
    'baseball_private.baseball_take_at_bat_rate_limit(text)',
    'baseball_private.baseball_list_at_bats(text)',
    'baseball_private.baseball_read_at_bat(text,uuid,uuid)',
    'baseball_private.baseball_save_at_bat(text,uuid,integer,uuid,text,jsonb)',
    'baseball_private.baseball_take_career_rate_limit(text)',
    'baseball_private.baseball_list_careers(text)',
    'baseball_private.baseball_read_career(text,uuid,uuid)',
    'baseball_private.baseball_read_career_at_bat(text,uuid,uuid)',
    'baseball_private.baseball_save_career(text,uuid,integer,uuid,text,jsonb,jsonb,jsonb)',
    'baseball_private.baseball_valid_career_v2_growth(jsonb,uuid,integer,integer,integer,integer,integer)',
    'baseball_private.baseball_take_career_v2_rate_limit(text)',
    'baseball_private.baseball_list_careers_v2(text)',
    'baseball_private.baseball_read_career_v2(text,uuid,uuid)',
    'baseball_private.baseball_read_career_v2_at_bat(text,uuid,uuid)',
    'baseball_private.baseball_save_career_v2(text,uuid,integer,uuid,text,jsonb,jsonb,jsonb)',
    'baseball_private.baseball_take_career_recovery_rate(text,text)',
    'baseball_private.baseball_career_source_owner(uuid,integer)',
    'baseball_private.baseball_career_recovery_code(text,uuid,integer,text,text,text)',
    'baseball_private.baseball_redeem_career_code(text,text)',
    'baseball_private.baseball_resolve_career_owner(text,uuid,integer)',
    'baseball_private.baseball_list_accessible_careers(text,integer)'
  ];
  allowed_rpc text[] := ARRAY[
    'baseball_private.baseball_save_practice(text,uuid,integer,text,jsonb)',
    'baseball_private.baseball_get_practices(text)',
    'baseball_private.baseball_list_at_bats(text)',
    'baseball_private.baseball_read_at_bat(text,uuid,uuid)',
    'baseball_private.baseball_save_at_bat(text,uuid,integer,uuid,text,jsonb)',
    'baseball_private.baseball_list_careers(text)',
    'baseball_private.baseball_read_career(text,uuid,uuid)',
    'baseball_private.baseball_read_career_at_bat(text,uuid,uuid)',
    'baseball_private.baseball_save_career(text,uuid,integer,uuid,text,jsonb,jsonb,jsonb)',
    'baseball_private.baseball_list_careers_v2(text)',
    'baseball_private.baseball_read_career_v2(text,uuid,uuid)',
    'baseball_private.baseball_read_career_v2_at_bat(text,uuid,uuid)',
    'baseball_private.baseball_save_career_v2(text,uuid,integer,uuid,text,jsonb,jsonb,jsonb)',
    'baseball_private.baseball_career_recovery_code(text,uuid,integer,text,text,text)',
    'baseball_private.baseball_redeem_career_code(text,text)',
    'baseball_private.baseball_resolve_career_owner(text,uuid,integer)',
    'baseball_private.baseball_list_accessible_careers(text,integer)'
  ];
  object_row record;
  required_name text;
  approved boolean;
BEGIN
  IF current_user <> 'baseball_prod_owner' OR pg_catalog.current_database() <> 'baseball_prod' THEN
    RAISE EXCEPTION 'Production objects must be created as the isolated owner';
  END IF;
  FOREACH required_name IN ARRAY ARRAY[
    'practices',
    'pitch_attempts',
    'rate_limits'
  ] LOOP
    IF pg_catalog.to_regclass('baseball_private.'||required_name) IS NULL THEN
      RAISE EXCEPTION 'A required production table is missing';
    END IF;
  END LOOP;
  FOREACH required_name IN ARRAY ARRAY[
    'baseball_private.baseball_take_rate_limit(text)',
    'baseball_private.baseball_save_practice(text,uuid,integer,text,jsonb)',
    'baseball_private.baseball_get_practices(text)'
  ] LOOP
    IF pg_catalog.to_regprocedure(required_name) IS NULL THEN
      RAISE EXCEPTION 'A required production function is missing';
    END IF;
  END LOOP;
  IF NOT pg_catalog.has_database_privilege('baseball_prod_runtime','baseball_prod','CONNECT')
    OR pg_catalog.has_database_privilege('baseball_prod_runtime','baseball_prod','CREATE,TEMP')
    OR NOT pg_catalog.has_schema_privilege('baseball_prod_runtime','baseball_private','USAGE')
    OR pg_catalog.has_schema_privilege('baseball_prod_runtime','baseball_private','CREATE')
    OR pg_catalog.has_schema_privilege('baseball_prod_runtime','public','USAGE,CREATE') THEN
    RAISE EXCEPTION 'Production runtime database or schema privileges are not restricted';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='baseball_private'
      AND nspowner <> 'baseball_prod_owner'::regrole) THEN
    RAISE EXCEPTION 'The production schema owner does not match';
  END IF;
  FOR object_row IN SELECT c.* FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='baseball_private' LOOP
    IF object_row.relowner <> 'baseball_prod_owner'::regrole OR object_row.relkind NOT IN ('r','i')
      OR object_row.relkind='r' AND NOT object_row.relname=ANY(allowed_tables) THEN
      RAISE EXCEPTION 'Unexpected production relation or ownership';
    END IF;
    IF object_row.relkind='r' AND (
      pg_catalog.has_table_privilege('baseball_prod_runtime',object_row.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR pg_catalog.has_any_column_privilege('baseball_prod_runtime',object_row.oid,'SELECT,INSERT,UPDATE,REFERENCES')) THEN
      RAISE EXCEPTION 'Production runtime must not access tables or columns directly';
    END IF;
  END LOOP;
  FOR object_row IN SELECT p.* FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='baseball_private' LOOP
    IF object_row.proowner <> 'baseball_prod_owner'::regrole
      OR NOT EXISTS (SELECT 1 FROM unnest(allowed_functions) AS candidate(signature) WHERE pg_catalog.to_regprocedure(candidate.signature)=object_row.oid) THEN
      RAISE EXCEPTION 'Unexpected production function or ownership';
    END IF;
    IF object_row.proname='baseball_valid_career_v2_growth' THEN
      IF object_row.prosecdef OR NOT coalesce(object_row.proconfig,ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog'] THEN
        RAISE EXCEPTION 'The pure growth validator must keep its catalog-only path';
      END IF;
    ELSIF NOT object_row.prosecdef
      OR NOT coalesce(object_row.proconfig,ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog, baseball_private, pg_temp'] THEN
      RAISE EXCEPTION 'Production SECURITY DEFINER functions need a fixed trusted search path';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(object_row.proacl,pg_catalog.acldefault('f',object_row.proowner))) a
      WHERE a.grantee=0 OR a.grantee='baseball_prod_runtime'::regrole AND a.is_grantable) THEN
      RAISE EXCEPTION 'PUBLIC execution and runtime grant options are forbidden';
    END IF;
    approved := EXISTS (SELECT 1 FROM unnest(allowed_rpc) AS candidate(signature) WHERE pg_catalog.to_regprocedure(candidate.signature)=object_row.oid);
    IF pg_catalog.has_function_privilege('baseball_prod_runtime',object_row.oid,'EXECUTE') IS DISTINCT FROM approved THEN
      RAISE EXCEPTION 'Only the approved production RPC signatures may be executable';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
    WHERE d.defaclrole='baseball_prod_owner'::regrole AND d.defaclobjtype IN ('r','S','f')
      AND a.grantee IN (0,'baseball_prod_runtime'::regrole)) THEN
    RAISE EXCEPTION 'Owner default privileges must not auto-grant PUBLIC or runtime access';
  END IF;
END
$catalog$;

COMMIT;
