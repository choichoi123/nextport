-- A saved four-pitch mix may switch to the eight-pitch mix when the next season settles.
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
    OR pg_catalog.to_regprocedure('baseball_private.baseball_continue_career_annual_with_finish(text,uuid,text,jsonb,jsonb,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply the career finish migration first';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_continue_career_annual(
  p_actor text, p_season uuid, p_hash text, p_setup jsonb, p_snapshot jsonb, p_at_bats jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,baseball_private,pg_temp AS $function$
DECLARE
  looking_up boolean := p_snapshot IS NULL AND p_at_bats IS NULL;
  details jsonb := p_setup->'continuation';
  root_id uuid;
  previous_id uuid;
  ordinal integer;
  access jsonb;
  season_owner text;
  current_history jsonb;
  latest jsonb;
  stored record;
  result jsonb;
BEGIN
  IF p_actor IS NULL OR p_actor!~'^[a-f0-9]{64}$' OR p_season IS NULL OR p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$'
    OR p_setup->>'id' IS DISTINCT FROM p_season::text
    OR jsonb_typeof(details) IS DISTINCT FROM 'object'
    OR coalesce(details->>'careerId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR coalesce(details->>'previousSeasonId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR jsonb_typeof(details->'seasonNumber') IS DISTINCT FROM 'number'
    OR coalesce(details->>'seasonNumber','')!~'^([2-9]|10)$' THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;
  root_id:=(details->>'careerId')::uuid;
  previous_id:=(details->>'previousSeasonId')::uuid;
  ordinal:=(details->>'seasonNumber')::integer;
  IF p_season=root_id OR p_season=previous_id THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;

  access:=baseball_private.baseball_resolve_career_owner(p_actor,root_id,2);
  IF access->>'status' IS DISTINCT FROM 'ok' THEN RETURN jsonb_build_object('status','not_found'); END IF;
  season_owner:=access->>'ownerHash';
  IF NOT looking_up THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(season_owner,20));
    -- A recovery grant must still be current when the transaction writes.
    IF p_actor<>season_owner THEN
      PERFORM 1 FROM baseball_private.career_recovery_codes c
        JOIN baseball_private.career_recovery_grants g USING(career_id,career_version,generation)
        WHERE c.career_id=root_id AND c.career_version=2 AND c.active AND g.actor_hash=p_actor
        FOR SHARE OF c,g;
      IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
    END IF;
  END IF;

  SELECT s.owner_hash,r.payload_hash,r.confirmed_at,r.root_career_id,r.previous_season_id,r.season_number,s.snapshot->'stats' AS stats
    INTO stored FROM baseball_private.career_v2_saves s LEFT JOIN baseball_private.career_annual_receipts r USING(career_id)
    WHERE s.career_id=p_season;
  IF FOUND THEN
    IF stored.owner_hash IS DISTINCT FROM season_owner OR stored.payload_hash IS DISTINCT FROM p_hash
      OR stored.root_career_id IS DISTINCT FROM root_id OR stored.previous_season_id IS DISTINCT FROM previous_id
      OR stored.season_number IS DISTINCT FROM ordinal THEN
      RETURN jsonb_build_object('status','error','code','season_conflict');
    END IF;
    RETURN jsonb_build_object('status','stored','duplicate',true,'receipt',jsonb_build_object(
      'careerId',root_id,'seasonId',p_season,'seasonNumber',ordinal,'savedAt',stored.confirmed_at,'stats',stored.stats));
  END IF;

  current_history:=baseball_private.baseball_read_career_annual_history(p_actor,root_id);
  IF current_history->>'status' IS DISTINCT FROM 'ok' THEN RETURN current_history; END IF;
  latest:=current_history->'latest';
  IF latest->>'seasonId' IS DISTINCT FROM previous_id::text OR latest->>'seasonNumber' IS DISTINCT FROM (ordinal-1)::text
    OR current_history->'history' IS DISTINCT FROM details->'history'
    OR latest->'growth' IS DISTINCT FROM details->'startingGrowth'
    OR latest->'profile' IS DISTINCT FROM p_setup->'profile'
    OR (latest->'settings' IS DISTINCT FROM p_setup->'settings' AND NOT (
      latest->'settings'->>'pitchMode' IS NOT DISTINCT FROM 'mixed'
      AND (latest->'settings' || '{"pitchMode":"mixed-eight"}'::jsonb) IS NOT DISTINCT FROM p_setup->'settings'
    ))
    OR latest->'source' IS DISTINCT FROM p_setup->'source' THEN
    RETURN jsonb_build_object('status','error','code','season_conflict');
  END IF;
  IF looking_up THEN RETURN jsonb_build_object('status','unconfirmed'); END IF;
  IF latest->'growth' IS DISTINCT FROM p_snapshot->'startingGrowth'
    OR latest->'profile' IS DISTINCT FROM p_snapshot->'profile'
    OR p_setup->'settings' IS DISTINCT FROM p_snapshot->'settings'
    OR latest->'source' IS DISTINCT FROM p_snapshot->'source' THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;

  result:=baseball_private.baseball_store_career_annual_episode(season_owner,p_season,p_hash,p_snapshot,p_at_bats,true);
  IF result->>'status' IS DISTINCT FROM 'stored' THEN RETURN result; END IF;
  UPDATE baseball_private.career_annual_receipts
    SET continuation_root_id=root_id,previous_season_id=previous_id,season_number=ordinal WHERE career_id=p_season;
  RETURN jsonb_set(jsonb_set(result,'{receipt,careerId}',to_jsonb(root_id)),'{receipt,seasonNumber}',to_jsonb(ordinal));
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status','error','code','season_conflict');
END
$function$;

COMMIT;
