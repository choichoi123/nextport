-- Keep previous season snapshots and allow three appearances in new annual seasons.
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
  IF pg_catalog.to_regprocedure('baseball_private.baseball_store_career_annual_episode(text,uuid,text,jsonb,jsonb,boolean)') IS NULL
    OR pg_catalog.to_regprocedure('baseball_private.baseball_continue_career_annual_with_finish(text,uuid,text,jsonb,jsonb,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply the career finish migration first';
  END IF;
END
$guard$;

-- The older per-command career RPC still validates two appearances.
ALTER TABLE baseball_private.career_v2_at_bats DROP CONSTRAINT IF EXISTS career_v2_at_bats_slot_check;
DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='baseball_private.career_v2_at_bats'::regclass AND conname='baseball_career_v2_slot_range') THEN
    ALTER TABLE baseball_private.career_v2_at_bats
      ADD CONSTRAINT baseball_career_v2_slot_range CHECK(slot BETWEEN 1 AND 3);
  END IF;
END
$constraint$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_store_career_annual_episode(
  p_owner text, p_career uuid, p_hash text, p_snapshot jsonb, p_at_bats jsonb, p_is_continuation boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,baseball_private,pg_temp AS $function$
DECLARE
  looking_up boolean := p_snapshot IS NULL AND p_at_bats IS NULL;
  prior_owner text;
  prior_hash text;
  saved_at timestamptz;
  season_stats jsonb;
  appearances_per_game integer;
BEGIN
  IF p_is_continuation IS NULL OR p_owner IS NULL OR p_owner!~'^[a-f0-9]{64}$' OR p_career IS NULL
    OR p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;
  IF NOT looking_up THEN
    IF p_snapshot IS NULL OR p_at_bats IS NULL OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
      OR jsonb_typeof(p_snapshot->'games') IS DISTINCT FROM 'array' OR jsonb_typeof(p_at_bats) IS DISTINCT FROM 'array'
      OR p_snapshot->>'id' IS DISTINCT FROM p_career::text OR p_snapshot->>'schemaVersion' IS DISTINCT FROM '2'
      OR p_snapshot->>'scheduleId' IS DISTINCT FROM 'regular-144-v1' OR p_snapshot->>'status' IS DISTINCT FROM 'complete'
      OR p_snapshot->>'currentGameIndex' IS DISTINCT FROM '144' OR p_snapshot->'activeAtBat' IS DISTINCT FROM 'null'::jsonb
      OR p_snapshot->'stats'->>'G' IS DISTINCT FROM '144'
      OR coalesce(p_snapshot->>'revision','')!~'^[1-9][0-9]{0,8}$' THEN
      RETURN jsonb_build_object('status','error','code','invalid_command');
    END IF;
    IF (p_snapshot?'startingGrowth') IS DISTINCT FROM p_is_continuation THEN
      RETURN jsonb_build_object('status','error','code','invalid_command');
    END IF;
    IF p_snapshot?'appearancesPerGame' AND p_snapshot->'appearancesPerGame' IS DISTINCT FROM '3'::jsonb THEN
      RETURN jsonb_build_object('status','error','code','invalid_command');
    END IF;
    appearances_per_game := CASE WHEN p_snapshot?'appearancesPerGame' THEN 3 ELSE 2 END;
    IF p_snapshot->'stats'->'PA' IS DISTINCT FROM to_jsonb(144 * appearances_per_game)
      OR jsonb_array_length(p_snapshot->'games')<>144
      OR jsonb_array_length(p_at_bats)<>144 * appearances_per_game THEN
      RETURN jsonb_build_object('status','error','code','invalid_command');
    END IF;
    IF octet_length(p_snapshot::text)>4194304 OR octet_length(p_at_bats::text)>33554432 THEN
      RETURN jsonb_build_object('status','error','code','storage_capacity');
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_snapshot->'games') AS games(game)
      WHERE CASE WHEN jsonb_typeof(game->'appearances')='array'
        THEN jsonb_array_length(game->'appearances')<>appearances_per_game ELSE true END
    ) THEN
      RETURN jsonb_build_object('status','error','code','invalid_command');
    END IF;
    -- Use the same owner lock as creation in the existing career RPC.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_owner,20));
  END IF;

  SELECT s.owner_hash,r.payload_hash,r.confirmed_at,s.snapshot->'stats'
    INTO prior_owner,prior_hash,saved_at,season_stats
    FROM baseball_private.career_v2_saves s
    LEFT JOIN baseball_private.career_annual_receipts r USING(career_id)
    WHERE s.career_id=p_career;
  IF FOUND THEN
    IF prior_owner<>p_owner OR prior_hash IS DISTINCT FROM p_hash THEN
      RETURN jsonb_build_object('status','error','code','season_conflict');
    END IF;
    RETURN jsonb_build_object('status','stored','duplicate',true,'receipt',jsonb_build_object(
      'careerId',p_career,'seasonId',p_career,'seasonNumber',1,'savedAt',saved_at,'stats',season_stats));
  END IF;
  IF looking_up THEN RETURN jsonb_build_object('status','unconfirmed'); END IF;
  IF NOT baseball_private.baseball_take_career_v2_rate_limit(p_owner) THEN
    RETURN jsonb_build_object('status','error','code','rate_limited');
  END IF;
  IF NOT p_is_continuation AND (SELECT count(*) FROM baseball_private.career_v2_saves s
    LEFT JOIN baseball_private.career_annual_receipts r USING(career_id)
    WHERE s.owner_hash=p_owner AND coalesce(r.season_number,1)=1)>=20 THEN
    RETURN jsonb_build_object('status','error','code','storage_capacity');
  END IF;

  -- Each replayed child must occupy the exact slot recorded in the completed season.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_at_bats) WITH ORDINALITY AS bats(entry,position)
    CROSS JOIN LATERAL (SELECT p_snapshot->'games'->(((position-1)/appearances_per_game)::integer)->'appearances'->(((position-1)%appearances_per_game)::integer) AS appearance) AS game
    WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object'
      OR entry->>'gameIndex' IS DISTINCT FROM ((position-1)/appearances_per_game)::text
      OR entry->>'slot' IS DISTINCT FROM (((position-1)%appearances_per_game)+1)::text
      OR entry->>'expectedRevision' IS DISTINCT FROM '0'
      OR coalesce(entry->>'id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$'
      OR coalesce(entry->>'source','') NOT IN ('manual','development','automatic')
      OR jsonb_typeof(entry->'snapshot') IS DISTINCT FROM 'object'
      OR entry->'snapshot'->>'id' IS DISTINCT FROM entry->>'id'
      OR entry->'snapshot'->>'source' IS DISTINCT FROM entry->>'source'
      OR entry->'snapshot'->>'schemaVersion' IS DISTINCT FROM '2'
      OR coalesce(entry->'snapshot'->>'revision','')!~'^[1-9][0-9]{0,8}$'
      OR entry->'snapshot'->'state'->>'status' IS DISTINCT FROM 'complete'
      OR entry->'snapshot'->'state'->>'id' IS DISTINCT FROM entry->>'id'
      OR entry->'snapshot'->'growthSnapshot'->>'careerId' IS DISTINCT FROM p_career::text
      OR entry->'snapshot'->'growthSnapshot'->>'gameIndex' IS DISTINCT FROM entry->>'gameIndex'
      OR entry->'snapshot'->'growthSnapshot'->>'slot' IS DISTINCT FROM entry->>'slot'
      OR entry->>'id' IS DISTINCT FROM game.appearance->>'id'
      OR entry->>'source' IS DISTINCT FROM game.appearance->>'source'
      OR entry->'snapshot'->'state'->>'outcome' IS DISTINCT FROM game.appearance->>'outcome'
      OR entry->'snapshot'->'state'->>'pitchCount' IS DISTINCT FROM game.appearance->>'pitchCount'
      OR entry->'snapshot'->'state'->'stats' IS DISTINCT FROM game.appearance->'stats'
      OR entry->'snapshot'->'growthSnapshot' IS DISTINCT FROM game.appearance->'growthSnapshot'
  ) THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;

  saved_at:=clock_timestamp();
  INSERT INTO baseball_private.career_v2_saves (career_id,owner_hash,revision,snapshot,created_at,updated_at)
    VALUES (p_career,p_owner,(p_snapshot->>'revision')::integer,p_snapshot,saved_at,saved_at);
  INSERT INTO baseball_private.career_v2_at_bats (at_bat_id,career_id,game_index,slot,source,revision,snapshot,created_at,updated_at)
    SELECT (entry->>'id')::uuid,p_career,(entry->>'gameIndex')::integer,(entry->>'slot')::integer,
      entry->>'source',(entry->'snapshot'->>'revision')::integer,entry->'snapshot',saved_at,saved_at
    FROM jsonb_array_elements(p_at_bats) AS bats(entry);
  INSERT INTO baseball_private.career_annual_receipts (career_id,payload_hash,confirmed_at)
    VALUES (p_career,p_hash,saved_at);
  RETURN jsonb_build_object('status','stored','duplicate',false,'receipt',jsonb_build_object(
    'careerId',p_career,'seasonId',p_career,'seasonNumber',1,'savedAt',saved_at,'stats',p_snapshot->'stats'));
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status','error','code','season_conflict');
END
$function$;

COMMIT;
