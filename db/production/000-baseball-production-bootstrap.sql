-- 야구 운영 기반 전용. 승인된 빈 baseball_prod DB의 관리 연결로만 실행한다.
-- 비밀번호/연결 문자열/서명 비밀은 포함하지 않는다. 검수·운영 비밀번호는 외부에서 각각 설정한다.
-- 앱/개발/100m의 연결로 실행하지 않으며 업무 행을 생성하거나 삭제하지 않는다.
BEGIN;
SET LOCAL search_path=pg_catalog;

DO $bootstrap$
BEGIN
  IF pg_catalog.current_database() <> 'baseball_prod' OR current_user <> session_user
    OR current_user IN ('baseball_prod_owner','baseball_prod_runtime','baseball_runtime')
    OR NOT pg_catalog.pg_has_role(session_user,(SELECT datdba FROM pg_catalog.pg_database WHERE datname='baseball_prod'),'USAGE') THEN
    RAISE EXCEPTION 'Use the approved database-owner migrator in baseball_prod';
  END IF;
  -- 같은 신규 프로젝트의 기본 DB만 대상으로 한다. 다른 DB의 권한은 변경하지 않는다.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname='neondb') THEN
    IF NOT pg_catalog.pg_has_role(session_user,
      (SELECT datdba FROM pg_catalog.pg_database WHERE datname='neondb'),'USAGE') THEN
      RAISE EXCEPTION 'The approved migrator must also control the new default database';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_prod_owner') THEN
    CREATE ROLE baseball_prod_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_prod_runtime') THEN
    CREATE ROLE baseball_prod_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_prod_owner'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_prod_runtime'
      AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member
      WHERE r.rolname IN ('baseball_prod_owner','baseball_prod_runtime')) THEN
    RAISE EXCEPTION 'Existing production roles must already be non-administrative and isolated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='baseball_private'
    AND nspowner <> 'baseball_prod_owner'::regrole) THEN
    RAISE EXCEPTION 'Do not adopt an existing foreign-owned schema';
  END IF;
END
$bootstrap$;

-- 명시 SET만 허용하고 자동 상속은 주지 않는다. 앱 runtime은 어떤 역할의 member도 아니다.
GRANT baseball_prod_owner TO CURRENT_USER WITH SET TRUE;
GRANT baseball_prod_owner TO CURRENT_USER WITH INHERIT FALSE;
REVOKE ALL ON DATABASE baseball_prod FROM PUBLIC,baseball_prod_owner,baseball_prod_runtime;
GRANT CONNECT ON DATABASE baseball_prod TO baseball_prod_runtime;
-- PUBLIC 기본 CONNECT/TEMP가 신규 runtime에 우회 권한을 주지 않도록 기본 DB만 닫는다.
DO $default_database$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname='neondb') THEN
    EXECUTE 'REVOKE ALL ON DATABASE neondb FROM PUBLIC,baseball_prod_owner,baseball_prod_runtime';
  END IF;
END
$default_database$;
CREATE SCHEMA IF NOT EXISTS baseball_private AUTHORIZATION baseball_prod_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC,baseball_prod_owner,baseball_prod_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM baseball_prod_owner,baseball_prod_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM baseball_prod_owner,baseball_prod_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM baseball_prod_owner,baseball_prod_runtime;

SET LOCAL ROLE baseball_prod_owner;
REVOKE ALL ON SCHEMA baseball_private FROM PUBLIC,baseball_prod_runtime;
GRANT USAGE ON SCHEMA baseball_private TO baseball_prod_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA baseball_private FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA baseball_private FROM PUBLIC,baseball_prod_runtime;
-- 재실행 시 승인 RPC의 runtime 권한은 유지하고 PUBLIC 실행 권한만 모두 회수한다.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA baseball_private FROM PUBLIC;

-- IN SCHEMA만의 REVOKE로 전역 기본 PUBLIC EXECUTE를 지울 수 없어 owner 전역에서 먼저 회수한다.
ALTER DEFAULT PRIVILEGES FOR ROLE baseball_prod_owner REVOKE ALL ON TABLES FROM PUBLIC,baseball_prod_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE baseball_prod_owner REVOKE ALL ON SEQUENCES FROM PUBLIC,baseball_prod_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE baseball_prod_owner REVOKE ALL ON FUNCTIONS FROM PUBLIC,baseball_prod_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE baseball_prod_owner IN SCHEMA baseball_private REVOKE ALL ON TABLES FROM PUBLIC,baseball_prod_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE baseball_prod_owner IN SCHEMA baseball_private REVOKE ALL ON SEQUENCES FROM PUBLIC,baseball_prod_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE baseball_prod_owner IN SCHEMA baseball_private REVOKE ALL ON FUNCTIONS FROM PUBLIC,baseball_prod_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE baseball_prod_owner IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC,baseball_prod_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE baseball_prod_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC,baseball_prod_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE baseball_prod_owner IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC,baseball_prod_runtime;

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
  FOREACH required_name IN ARRAY ARRAY[]::text[] LOOP
    IF pg_catalog.to_regclass('baseball_private.'||required_name) IS NULL THEN
      RAISE EXCEPTION 'A required production table is missing';
    END IF;
  END LOOP;
  FOREACH required_name IN ARRAY ARRAY[]::text[] LOOP
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
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname='neondb') THEN
    IF pg_catalog.has_database_privilege('baseball_prod_runtime','neondb','CONNECT,TEMP,CREATE') THEN
      RAISE EXCEPTION 'Production runtime must not access the new default database';
    END IF;
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
