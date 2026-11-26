-- Link completed seasons after the original annual career migration.
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
  IF pg_catalog.to_regclass('baseball_private.career_annual_receipts') IS NULL THEN
    RAISE EXCEPTION 'Apply the original annual career migration first';
  END IF;
END
$guard$;
SET LOCAL ROLE baseball_prod_owner;

-- Existing receipts automatically resolve to their own first-season career.
ALTER TABLE baseball_private.career_annual_receipts
  ADD COLUMN IF NOT EXISTS continuation_root_id uuid REFERENCES baseball_private.career_annual_receipts(career_id),
  ADD COLUMN IF NOT EXISTS previous_season_id uuid REFERENCES baseball_private.career_annual_receipts(career_id),
  ADD COLUMN IF NOT EXISTS season_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS root_career_id uuid GENERATED ALWAYS AS (coalesce(continuation_root_id,career_id)) STORED;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='baseball_private.career_annual_receipts'::regclass AND conname='career_annual_valid_lineage') THEN
    ALTER TABLE baseball_private.career_annual_receipts ADD CONSTRAINT career_annual_valid_lineage CHECK (
      (season_number=1 AND continuation_root_id IS NULL AND previous_season_id IS NULL)
      OR (season_number BETWEEN 2 AND 10 AND continuation_root_id IS NOT NULL AND previous_season_id IS NOT NULL
        AND continuation_root_id<>career_id AND previous_season_id<>career_id)
    );
  END IF;
END
$constraints$;
CREATE UNIQUE INDEX IF NOT EXISTS career_annual_root_and_season
  ON baseball_private.career_annual_receipts(root_career_id,season_number);

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
      OR p_snapshot->'stats'->>'G' IS DISTINCT FROM '144' OR p_snapshot->'stats'->>'PA' IS DISTINCT FROM '288'
      OR coalesce(p_snapshot->>'revision','')!~'^[1-9][0-9]{0,8}$' THEN
      RETURN jsonb_build_object('status','error','code','invalid_command');
    END IF;
    IF (p_snapshot?'startingGrowth') IS DISTINCT FROM p_is_continuation THEN
      RETURN jsonb_build_object('status','error','code','invalid_command');
    END IF;
    IF jsonb_array_length(p_snapshot->'games')<>144 OR jsonb_array_length(p_at_bats)<>288 THEN
      RETURN jsonb_build_object('status','error','code','invalid_command');
    END IF;
    IF octet_length(p_snapshot::text)>4194304 OR octet_length(p_at_bats::text)>33554432 THEN
      RETURN jsonb_build_object('status','error','code','storage_capacity');
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
    CROSS JOIN LATERAL (SELECT p_snapshot->'games'->(((position-1)/2)::integer)->'appearances'->(((position-1)%2)::integer) AS appearance) AS game
    WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object'
      OR entry->>'gameIndex' IS DISTINCT FROM ((position-1)/2)::text
      OR entry->>'slot' IS DISTINCT FROM (((position-1)%2)+1)::text
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


-- Preserve the original first-season endpoint and its receipt shape.
CREATE OR REPLACE FUNCTION baseball_private.baseball_settle_career_annual(
  p_owner text, p_career uuid, p_hash text, p_snapshot jsonb, p_at_bats jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,baseball_private,pg_temp AS $function$
BEGIN
  IF EXISTS(SELECT 1 FROM baseball_private.career_annual_receipts WHERE career_id=p_career AND season_number<>1) THEN
    RETURN jsonb_build_object('status','error','code','season_conflict');
  END IF;
  RETURN baseball_private.baseball_store_career_annual_episode(p_owner,p_career,p_hash,p_snapshot,p_at_bats,false);
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_read_career_annual_history(p_actor text,p_root uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,baseball_private,pg_temp AS $function$
DECLARE
  access jsonb;
  history jsonb;
  latest jsonb;
BEGIN
  access:=baseball_private.baseball_resolve_career_owner(p_actor,p_root,2);
  IF access->>'status' IS DISTINCT FROM 'ok' THEN RETURN jsonb_build_object('status','not_found'); END IF;
  WITH seasons AS (
    SELECT r.career_id,r.season_number,s.snapshot
    FROM baseball_private.career_annual_receipts r
    JOIN baseball_private.career_v2_saves s USING(career_id)
    WHERE r.root_career_id=p_root AND s.owner_hash=(access->>'ownerHash')
  )
  SELECT (SELECT jsonb_agg(jsonb_build_object('seasonId',career_id,'seasonNumber',season_number,'stats',snapshot->'stats')
      ORDER BY season_number) FROM seasons),
    (SELECT jsonb_build_object('seasonId',career_id,'seasonNumber',season_number,'growth',snapshot->'growth',
      'profile',snapshot->'profile','settings',snapshot->'settings','source',snapshot->'source')
      FROM seasons ORDER BY season_number DESC LIMIT 1)
    INTO history,latest;
  IF history IS NULL THEN RETURN jsonb_build_object('status','not_found'); END IF;
  RETURN jsonb_build_object('status','ok','careerId',p_root,'history',history,'latest',latest);
END
$function$;

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
    OR latest->'profile' IS DISTINCT FROM p_setup->'profile' OR latest->'settings' IS DISTINCT FROM p_setup->'settings'
    OR latest->'source' IS DISTINCT FROM p_setup->'source' THEN
    RETURN jsonb_build_object('status','error','code','season_conflict');
  END IF;
  IF looking_up THEN RETURN jsonb_build_object('status','unconfirmed'); END IF;
  IF latest->'growth' IS DISTINCT FROM p_snapshot->'startingGrowth'
    OR latest->'profile' IS DISTINCT FROM p_snapshot->'profile' OR latest->'settings' IS DISTINCT FROM p_snapshot->'settings'
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

CREATE OR REPLACE FUNCTION baseball_private.baseball_list_careers_v2(p_owner text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
DECLARE result jsonb;
BEGIN
  IF p_owner IS NULL OR p_owner!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
  IF NOT baseball_private.baseball_take_career_v2_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',career_id,'revision',revision,'profile',snapshot->'profile','status',snapshot->>'status',
    'completedGames',(snapshot->>'currentGameIndex')::integer,'totalGames',jsonb_array_length(snapshot->'games'),'updatedAt',updated_at)ORDER BY updated_at DESC,career_id),'[]'::jsonb)INTO result
    FROM(SELECT s.career_id,s.revision,s.snapshot,s.updated_at FROM baseball_private.career_v2_saves s LEFT JOIN baseball_private.career_annual_receipts r USING(career_id)
      WHERE s.owner_hash=p_owner AND coalesce(r.season_number,1)=1
      ORDER BY s.updated_at DESC,s.career_id LIMIT 20)rows;
  RETURN jsonb_build_object('status','ok','careers',result);
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_list_accessible_careers(p_actor text,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
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
      'completedGames',(snapshot->>'currentGameIndex')::integer,'totalGames',jsonb_array_length(snapshot->'games'),'updatedAt',updated_at)ORDER BY updated_at DESC,career_id),'[]'::jsonb)INTO result
      FROM(SELECT s.career_id,s.revision,s.snapshot,s.updated_at FROM baseball_private.career_v2_saves s LEFT JOIN baseball_private.career_annual_receipts r USING(career_id)
      WHERE coalesce(r.season_number,1)=1 AND (s.owner_hash=p_actor OR EXISTS(
        SELECT 1 FROM baseball_private.career_recovery_grants g JOIN baseball_private.career_recovery_codes c USING(career_version,career_id)
          WHERE g.actor_hash=p_actor AND g.career_version=2 AND g.career_id=s.career_id AND c.active AND g.generation=c.generation))
        ORDER BY s.updated_at DESC,s.career_id LIMIT 20)rows;
  END IF;
  RETURN jsonb_build_object('status','ok','careers',result);
END
$function$;

REVOKE ALL ON TABLE baseball_private.career_annual_receipts FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_store_career_annual_episode(text,uuid,text,jsonb,jsonb,boolean) FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_settle_career_annual(text,uuid,text,jsonb,jsonb) FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_continue_career_annual(text,uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC,baseball_prod_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_read_career_annual_history(text,uuid) FROM PUBLIC,baseball_prod_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_settle_career_annual(text,uuid,text,jsonb,jsonb) TO baseball_prod_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_continue_career_annual(text,uuid,text,jsonb,jsonb,jsonb) TO baseball_prod_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_read_career_annual_history(text,uuid) TO baseball_prod_runtime;
COMMIT;
