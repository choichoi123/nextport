-- 야구 운영 002 단계. 원본: db/migrations/20261124-baseball-at-bat-sessions.sql
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
  FOREACH required_table IN ARRAY ARRAY[
    'practices',
    'pitch_attempts',
    'rate_limits'
  ] LOOP
    IF pg_catalog.to_regclass('baseball_private.'||required_table) IS NULL THEN
      RAISE EXCEPTION 'Apply the preceding production table migrations first';
    END IF;
  END LOOP;
  FOREACH required_function IN ARRAY ARRAY[
    'baseball_private.baseball_take_rate_limit(text)',
    'baseball_private.baseball_save_practice(text,uuid,integer,text,jsonb)',
    'baseball_private.baseball_get_practices(text)'
  ] LOOP
    IF pg_catalog.to_regprocedure(required_function) IS NULL THEN
      RAISE EXCEPTION 'Apply the preceding production RPC migrations first';
    END IF;
  END LOOP;
END
$guard$;
SET LOCAL ROLE baseball_prod_owner;

CREATE TABLE IF NOT EXISTS baseball_private.at_bats (
  session_id uuid PRIMARY KEY,
  owner_hash text NOT NULL CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
  revision integer NOT NULL CHECK (revision >= 1),
  snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX IF NOT EXISTS baseball_at_bats_owner_time_idx ON baseball_private.at_bats(owner_hash,updated_at DESC,session_id);

CREATE TABLE IF NOT EXISTS baseball_private.at_bat_commands (
  command_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES baseball_private.at_bats(session_id),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  revision integer NOT NULL CHECK (revision >= 1),
  received_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE(session_id,revision)
);
CREATE INDEX IF NOT EXISTS baseball_at_bat_commands_session_idx ON baseball_private.at_bat_commands(session_id,command_id);

CREATE TABLE IF NOT EXISTS baseball_private.at_bat_rate_limits (
  owner_hash text PRIMARY KEY CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests >= 1)
);
CREATE OR REPLACE FUNCTION baseball_private.baseball_take_at_bat_rate_limit(p_owner text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
DECLARE n integer; t timestamptz := clock_timestamp();
BEGIN
  INSERT INTO baseball_private.at_bat_rate_limits AS r(owner_hash,window_started_at,requests) VALUES(p_owner,t,1)
  ON CONFLICT(owner_hash) DO UPDATE SET
    window_started_at=CASE WHEN r.window_started_at<=t-interval '1 minute' THEN t ELSE r.window_started_at END,
    requests=CASE WHEN r.window_started_at<=t-interval '1 minute' THEN 1 ELSE LEAST(r.requests+1,361) END
  RETURNING requests INTO n;
  RETURN n<=360;
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_list_at_bats(p_owner text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
DECLARE result jsonb;
BEGIN
  IF p_owner IS NULL OR p_owner !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
  IF NOT baseball_private.baseball_take_at_bat_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',session_id,'revision',revision,
      'status',snapshot->'state'->>'status','pitchCount',(snapshot->'state'->>'pitchCount')::integer,
      'balls',(snapshot->'state'->>'balls')::integer,'strikes',(snapshot->'state'->>'strikes')::integer,
      'outcome',snapshot->'state'->'outcome','source',snapshot->>'source','updatedAt',updated_at)
      ORDER BY updated_at DESC,session_id),'[]'::jsonb) INTO result
    FROM (SELECT session_id,revision,snapshot,updated_at FROM baseball_private.at_bats
      WHERE owner_hash=p_owner ORDER BY updated_at DESC,session_id LIMIT 20) rows;
  RETURN jsonb_build_object('status','ok','atBats',result);
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_read_at_bat(p_owner text,p_id uuid,p_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
DECLARE prior baseball_private.at_bats%ROWTYPE; command_row baseball_private.at_bat_commands%ROWTYPE; command_value jsonb := 'null'::jsonb;
BEGIN
  IF p_owner IS NULL OR p_id IS NULL OR p_owner !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
  IF NOT baseball_private.baseball_take_at_bat_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  SELECT * INTO prior FROM baseball_private.at_bats WHERE session_id=p_id AND owner_hash=p_owner;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  IF p_command_id IS NOT NULL THEN
    SELECT * INTO command_row FROM baseball_private.at_bat_commands WHERE command_id=p_command_id AND session_id=p_id;
    IF FOUND THEN command_value:=jsonb_build_object('hash',command_row.payload_hash,'revision',command_row.revision); END IF;
  END IF;
  RETURN jsonb_build_object('status','ok','snapshot',prior.snapshot,'command',command_value);
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_save_at_bat(
  p_owner text,p_id uuid,p_expected_revision integer,p_command_id uuid,p_hash text,p_snapshot jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
DECLARE
  prior baseball_private.at_bats%ROWTYPE;
  command_row baseball_private.at_bat_commands%ROWTYPE;
  old_item jsonb; new_item jsonb;
  old_count integer; new_count integer; n integer;
BEGIN
  IF p_owner IS NULL OR p_id IS NULL OR p_command_id IS NULL OR p_expected_revision IS NULL OR p_hash IS NULL OR p_snapshot IS NULL
    OR p_owner !~ '^[a-f0-9]{64}$' OR p_hash !~ '^[a-f0-9]{64}$' OR p_expected_revision < 0 OR p_expected_revision >= 2147483647
    OR jsonb_typeof(p_snapshot)<>'object' OR p_snapshot->>'id' IS DISTINCT FROM p_id::text
    OR p_snapshot->>'schemaVersion' IS DISTINCT FROM '1'
    OR coalesce(p_snapshot->>'source','') NOT IN ('manual','development')
    OR p_snapshot->>'revision' IS DISTINCT FROM (p_expected_revision+1)::text
    OR jsonb_typeof(p_snapshot->'state') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_snapshot->'state'->'history') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_snapshot->'attempts') IS DISTINCT FROM 'array'
    OR p_snapshot->'state'->>'id' IS DISTINCT FROM p_id::text THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;
  IF octet_length(p_snapshot::text)>8388608 THEN RETURN jsonb_build_object('status','error','code','storage_capacity'); END IF;
  IF NOT baseball_private.baseball_take_at_bat_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  -- Serializes two creates as well as competing updates of an existing session.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,7));
  SELECT * INTO prior FROM baseball_private.at_bats WHERE session_id=p_id FOR UPDATE;
  IF FOUND AND prior.owner_hash<>p_owner THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
  -- A retry is looked up before revision comparison, even after later commands.
  SELECT * INTO command_row FROM baseball_private.at_bat_commands WHERE command_id=p_command_id;
  IF FOUND THEN
    IF command_row.session_id<>p_id OR command_row.payload_hash<>p_hash OR prior.session_id IS NULL THEN
      RETURN jsonb_build_object('status','error','code','command_conflict');
    END IF;
    RETURN jsonb_build_object('status','stored','snapshot',prior.snapshot,'duplicate',true,
      'receipt',jsonb_build_object('sessionId',p_id,'commandId',p_command_id,'revision',command_row.revision));
  END IF;
  IF prior.session_id IS NULL THEN
    IF p_expected_revision<>0 OR jsonb_array_length(p_snapshot->'state'->'history')<>0
      OR jsonb_array_length(p_snapshot->'attempts')<>0 OR p_snapshot->'state'->>'status' IS DISTINCT FROM 'active'
      OR p_snapshot->'pending' IS DISTINCT FROM 'null'::jsonb OR p_snapshot->'finalReceipt' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object('status','error','code','revision_conflict');
    END IF;
  ELSE
    IF p_expected_revision<>prior.revision THEN RETURN jsonb_build_object('status','error','code','revision_conflict'); END IF;
    IF prior.snapshot->'state'->>'status'='complete'
      OR (p_snapshot-'revision'-'updatedAt'-'state'-'pending'-'attempts'-'finalReceipt')
        IS DISTINCT FROM (prior.snapshot-'revision'-'updatedAt'-'state'-'pending'-'attempts'-'finalReceipt')
      OR ((p_snapshot->'state')-'balls'-'strikes'-'pitchCount'-'status'-'outcome'-'history'-'stats')
        IS DISTINCT FROM ((prior.snapshot->'state')-'balls'-'strikes'-'pitchCount'-'status'-'outcome'-'history'-'stats') THEN
      RETURN jsonb_build_object('status','error','code','command_conflict');
    END IF;
    old_count:=jsonb_array_length(prior.snapshot->'state'->'history'); new_count:=jsonb_array_length(p_snapshot->'state'->'history');
    IF new_count<old_count OR new_count>old_count+1 THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
    IF old_count>0 THEN
      FOR n IN 0..old_count-1 LOOP
        IF prior.snapshot->'state'->'history'->n IS DISTINCT FROM p_snapshot->'state'->'history'->n THEN
          RETURN jsonb_build_object('status','error','code','command_conflict');
        END IF;
      END LOOP;
    END IF;
    old_count:=jsonb_array_length(prior.snapshot->'attempts'); new_count:=jsonb_array_length(p_snapshot->'attempts');
    IF new_count<old_count OR new_count>old_count+1 THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
    IF old_count>0 THEN
      FOR n IN 0..old_count-1 LOOP
        old_item:=prior.snapshot->'attempts'->n; new_item:=p_snapshot->'attempts'->n;
        IF (old_item-'status'-'pausedAt'-'inputAcceptedAt'-'resolvedAt'-'input'-'pauseReason')
          IS DISTINCT FROM (new_item-'status'-'pausedAt'-'inputAcceptedAt'-'resolvedAt'-'input'-'pauseReason')
          OR old_item->>'id' IS DISTINCT FROM prior.snapshot->'pending'->>'attemptId' AND old_item IS DISTINCT FROM new_item
          OR old_item->'input'<>'null'::jsonb AND old_item->'input' IS DISTINCT FROM new_item->'input'
          OR old_item->'input'<>'null'::jsonb AND old_item->'inputAcceptedAt' IS DISTINCT FROM new_item->'inputAcceptedAt'
          OR old_item->>'status' IN ('resolved','superseded') AND old_item IS DISTINCT FROM new_item
          OR old_item->'input'<>'null'::jsonb AND new_item->>'status'='superseded' THEN
          RETURN jsonb_build_object('status','error','code','command_conflict');
        END IF;
      END LOOP;
    END IF;
  END IF;
  INSERT INTO baseball_private.at_bats(session_id,owner_hash,revision,snapshot)
    VALUES(p_id,p_owner,p_expected_revision+1,p_snapshot)
    ON CONFLICT(session_id) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot,updated_at=clock_timestamp();
  INSERT INTO baseball_private.at_bat_commands(command_id,session_id,payload_hash,revision)
    VALUES(p_command_id,p_id,p_hash,p_expected_revision+1);
  RETURN jsonb_build_object('status','stored','snapshot',p_snapshot,'duplicate',false,
    'receipt',jsonb_build_object('sessionId',p_id,'commandId',p_command_id,'revision',p_expected_revision+1));
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status','error','code','command_conflict');
END
$function$;

REVOKE ALL ON baseball_private.at_bats,baseball_private.at_bat_commands FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON baseball_private.at_bat_rate_limits FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_take_at_bat_rate_limit(text) FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_list_at_bats(text) FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_read_at_bat(text,uuid,uuid) FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_save_at_bat(text,uuid,integer,uuid,text,jsonb) FROM PUBLIC,baseball_prod_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_list_at_bats(text) TO baseball_prod_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_read_at_bat(text,uuid,uuid) TO baseball_prod_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_save_at_bat(text,uuid,integer,uuid,text,jsonb) TO baseball_prod_runtime;

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
    'rate_limits',
    'at_bats',
    'at_bat_commands',
    'at_bat_rate_limits'
  ] LOOP
    IF pg_catalog.to_regclass('baseball_private.'||required_name) IS NULL THEN
      RAISE EXCEPTION 'A required production table is missing';
    END IF;
  END LOOP;
  FOREACH required_name IN ARRAY ARRAY[
    'baseball_private.baseball_take_rate_limit(text)',
    'baseball_private.baseball_save_practice(text,uuid,integer,text,jsonb)',
    'baseball_private.baseball_get_practices(text)',
    'baseball_private.baseball_take_at_bat_rate_limit(text)',
    'baseball_private.baseball_list_at_bats(text)',
    'baseball_private.baseball_read_at_bat(text,uuid,uuid)',
    'baseball_private.baseball_save_at_bat(text,uuid,integer,uuid,text,jsonb)'
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
