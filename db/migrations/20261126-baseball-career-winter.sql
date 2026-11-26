-- Attach winter preparation to the settled second-season receipt.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $guard$
BEGIN
  IF pg_catalog.current_database()<>'baseball_dev'
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='baseball_private') THEN
    RAISE EXCEPTION 'The dedicated baseball development database is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_runtime')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_runtime'
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member
      WHERE r.rolname='baseball_runtime') THEN
    RAISE EXCEPTION 'The existing restricted baseball role is required';
  END IF;
  IF pg_catalog.to_regprocedure('baseball_private.baseball_continue_career_annual(text,uuid,text,jsonb,jsonb,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('baseball_private.baseball_read_career_annual_history(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply the multiseason migration first';
  END IF;
END
$guard$;

ALTER TABLE baseball_private.career_annual_receipts
  ADD COLUMN IF NOT EXISTS winter_plan jsonb,
  ADD COLUMN IF NOT EXISTS winter_goal jsonb;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='baseball_private.career_annual_receipts'::regclass AND conname='career_annual_valid_winter_plan') THEN
    ALTER TABLE baseball_private.career_annual_receipts ADD CONSTRAINT career_annual_valid_winter_plan CHECK (
      winter_plan IS NULL OR (
        season_number=2 AND winter_plan IN (
          '{"version":1,"direction":"recovery"}'::jsonb,
          '{"version":1,"direction":"discipline"}'::jsonb,
          '{"version":1,"direction":"power"}'::jsonb,
          '{"version":1,"direction":"balanced"}'::jsonb
        )
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='baseball_private.career_annual_receipts'::regclass AND conname='career_annual_winter_goal_present') THEN
    ALTER TABLE baseball_private.career_annual_receipts ADD CONSTRAINT career_annual_winter_goal_present
      CHECK ((winter_plan IS NULL AND winter_goal IS NULL)
        OR (winter_plan IS NOT NULL AND jsonb_typeof(winter_goal) IS NOT DISTINCT FROM 'object'));
  END IF;
END
$constraints$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_continue_career_annual_with_winter(
  p_actor text, p_season uuid, p_hash text, p_setup jsonb, p_snapshot jsonb, p_at_bats jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,baseball_private,pg_temp AS $function$
DECLARE
  plan jsonb := p_setup->'winter';
  saved_plan jsonb;
  first_stats jsonb;
  goal jsonb;
  previous_count integer;
  result jsonb;
BEGIN
  IF p_setup->'continuation'->'seasonNumber' IS DISTINCT FROM '2'::jsonb
    OR plan IS NULL OR plan NOT IN (
      '{"version":1,"direction":"recovery"}'::jsonb,
      '{"version":1,"direction":"discipline"}'::jsonb,
      '{"version":1,"direction":"power"}'::jsonb,
      '{"version":1,"direction":"balanced"}'::jsonb
    ) THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;

  result := baseball_private.baseball_continue_career_annual(p_actor,p_season,p_hash,p_setup,p_snapshot,p_at_bats);
  IF result->>'status' IS DISTINCT FROM 'stored' THEN RETURN result; END IF;
  IF result->'duplicate'='true'::jsonb THEN
    SELECT winter_plan INTO saved_plan FROM baseball_private.career_annual_receipts WHERE career_id=p_season;
    IF saved_plan IS DISTINCT FROM plan THEN
      RETURN jsonb_build_object('status','error','code','season_conflict');
    END IF;
  ELSE
    -- The continuation RPC already compared these first-season stats to its stored receipt.
    first_stats := p_setup->'continuation'->'history'->0->'stats';
    CASE plan->>'direction'
      WHEN 'recovery' THEN goal := jsonb_build_object('kind','recovery','games',3,'sessions',1);
      WHEN 'balanced' THEN goal := jsonb_build_object('kind','balanced');
      WHEN 'discipline' THEN
        previous_count := (first_stats->>'BB')::integer;
        goal := jsonb_build_object('kind','walks','previous',previous_count,
          'target',least((first_stats->>'PA')::integer,previous_count+3));
      WHEN 'power' THEN
        previous_count := (first_stats->>'2B')::integer + (first_stats->>'3B')::integer + (first_stats->>'HR')::integer;
        goal := jsonb_build_object('kind','extra_base_hits','previous',previous_count,
          'target',least((first_stats->>'PA')::integer,previous_count+3));
    END CASE;
    -- An error here rolls back the related receipt, season and appearances.
    UPDATE baseball_private.career_annual_receipts SET winter_plan=plan,winter_goal=goal
      WHERE career_id=p_season AND season_number=2 AND winter_plan IS NULL AND payload_hash=p_hash;
    IF NOT FOUND THEN RAISE EXCEPTION 'Could not attach winter plan to the settled season'; END IF;
  END IF;
  RETURN jsonb_set(result,'{receipt,winter}',plan);
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_read_career_annual_history_with_winter(p_actor text,p_root uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,baseball_private,pg_temp AS $function$
DECLARE
  result jsonb;
  plans jsonb;
BEGIN
  result := baseball_private.baseball_read_career_annual_history(p_actor,p_root);
  IF result->>'status' IS DISTINCT FROM 'ok' THEN RETURN result; END IF;
  SELECT jsonb_object_agg(r.season_number::text,r.winter_plan) INTO plans
    FROM baseball_private.career_annual_receipts r
    WHERE r.root_career_id=p_root AND r.winter_plan IS NOT NULL
      AND (result->'history') @> jsonb_build_array(jsonb_build_object('seasonId',r.career_id));
  IF plans IS NULL THEN RETURN result; END IF;
  RETURN result || jsonb_build_object('winter',plans);
END
$function$;

REVOKE ALL ON TABLE baseball_private.career_annual_receipts FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_continue_career_annual_with_winter(text,uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_read_career_annual_history_with_winter(text,uuid) FROM PUBLIC,baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_continue_career_annual_with_winter(text,uuid,text,jsonb,jsonb,jsonb) TO baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_read_career_annual_history_with_winter(text,uuid) TO baseball_runtime;
COMMIT;
