-- Store the explicit final choice with the tenth-season settlement.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $guard$
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
  IF pg_catalog.to_regprocedure('baseball_private.baseball_continue_career_annual(text,uuid,text,jsonb,jsonb,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('baseball_private.baseball_read_career_annual_history_with_winter(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply the winter migration first';
  END IF;
END
$guard$;
SET LOCAL ROLE baseball_prod_owner;

ALTER TABLE baseball_private.career_annual_receipts
  ADD COLUMN IF NOT EXISTS career_finish text;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='baseball_private.career_annual_receipts'::regclass AND conname='career_annual_valid_finish') THEN
    ALTER TABLE baseball_private.career_annual_receipts ADD CONSTRAINT career_annual_valid_finish CHECK (
      career_finish IS NULL OR (season_number=10 AND career_finish IN ('active','retired'))
    );
  END IF;
END
$constraints$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_continue_career_annual_with_finish(
  p_actor text, p_season uuid, p_hash text, p_setup jsonb, p_snapshot jsonb, p_at_bats jsonb, p_finish text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,baseball_private,pg_temp AS $function$
DECLARE
  saved_finish text;
  result jsonb;
BEGIN
  IF p_finish IS NULL OR p_finish NOT IN ('active','retired')
    OR p_setup->'continuation'->'seasonNumber' IS DISTINCT FROM '10'::jsonb
    OR p_setup ? 'winter' THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;

  result := baseball_private.baseball_continue_career_annual(p_actor,p_season,p_hash,p_setup,p_snapshot,p_at_bats);
  IF result->>'status' IS DISTINCT FROM 'stored' THEN RETURN result; END IF;
  IF result->'duplicate'='true'::jsonb THEN
    SELECT career_finish INTO saved_finish
      FROM baseball_private.career_annual_receipts WHERE career_id=p_season;
    IF saved_finish IS DISTINCT FROM p_finish THEN
      RETURN jsonb_build_object('status','error','code','season_conflict');
    END IF;
  ELSE
    -- A failure rolls back the related season, appearances, and receipt.
    UPDATE baseball_private.career_annual_receipts SET career_finish=p_finish
      WHERE career_id=p_season AND season_number=10 AND career_finish IS NULL AND payload_hash=p_hash;
    IF NOT FOUND THEN RAISE EXCEPTION 'Could not attach the final choice to the settled season'; END IF;
  END IF;
  RETURN jsonb_set(result,'{receipt,finish}',to_jsonb(p_finish));
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_read_career_annual_history_with_winter(p_actor text,p_root uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,baseball_private,pg_temp AS $function$
DECLARE
  result jsonb;
  plans jsonb;
  final_choice text;
BEGIN
  result := baseball_private.baseball_read_career_annual_history(p_actor,p_root);
  IF result->>'status' IS DISTINCT FROM 'ok' THEN RETURN result; END IF;
  SELECT jsonb_object_agg(r.season_number::text,r.winter_plan) INTO plans
    FROM baseball_private.career_annual_receipts r
    WHERE r.root_career_id=p_root AND r.winter_plan IS NOT NULL
      AND (result->'history') @> jsonb_build_array(jsonb_build_object('seasonId',r.career_id));
  IF plans IS NOT NULL THEN
    result := result || jsonb_build_object('winter',plans);
  END IF;
  IF result->'latest'->>'seasonNumber'='10' THEN
    SELECT r.career_finish INTO final_choice
      FROM baseball_private.career_annual_receipts r
      WHERE r.root_career_id=p_root AND r.season_number=10
        AND r.career_id=(result->'latest'->>'seasonId')::uuid;
    IF final_choice IS NOT NULL THEN
      result := result || jsonb_build_object('finish',final_choice);
    END IF;
  END IF;
  RETURN result;
END
$function$;

REVOKE ALL ON TABLE baseball_private.career_annual_receipts FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_continue_career_annual_with_finish(text,uuid,text,jsonb,jsonb,jsonb,text) FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_read_career_annual_history_with_winter(text,uuid) FROM PUBLIC,baseball_prod_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_continue_career_annual_with_finish(text,uuid,text,jsonb,jsonb,jsonb,text) TO baseball_prod_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_read_career_annual_history_with_winter(text,uuid) TO baseball_prod_runtime;
COMMIT;
