-- Extend the existing v2 career RPC for development regular-season saves.
-- Install after v2 and recovery. Previously saved trial careers keep their rules.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $guard$
BEGIN
  IF pg_catalog.current_database()<>'baseball_dev' OR pg_catalog.to_regnamespace('baseball_private') IS NULL THEN
    RAISE EXCEPTION 'The dedicated baseball development database is required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_runtime')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='baseball_runtime' AND(rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname='baseball_runtime') THEN
    RAISE EXCEPTION 'The existing restricted baseball role is required';
  END IF;
  IF pg_catalog.to_regclass('baseball_private.career_v2_at_bats') IS NULL
    OR pg_catalog.to_regprocedure('baseball_private.baseball_save_career_v2(text,uuid,integer,uuid,text,jsonb,jsonb,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('baseball_private.baseball_list_careers_v2(text)') IS NULL
    OR pg_catalog.to_regprocedure('baseball_private.baseball_list_accessible_careers(text,integer)') IS NULL THEN
    RAISE EXCEPTION 'Apply the existing career v2 and recovery migrations first';
  END IF;
END
$guard$;

-- Keep the v1 constraint and all existing rows. The RPC still enforces trial bounds.
ALTER TABLE baseball_private.career_v2_at_bats DROP CONSTRAINT IF EXISTS career_v2_at_bats_game_index_check;
DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='baseball_private.career_v2_at_bats'::regclass AND conname='baseball_career_v2_game_index_range') THEN
    ALTER TABLE baseball_private.career_v2_at_bats
      ADD CONSTRAINT baseball_career_v2_game_index_range CHECK(game_index BETWEEN 0 AND 143);
  END IF;
END
$constraint$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_list_careers_v2(p_owner text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
DECLARE result jsonb;
BEGIN
  IF p_owner IS NULL OR p_owner!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
  IF NOT baseball_private.baseball_take_career_v2_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',career_id,'revision',revision,'profile',snapshot->'profile','status',snapshot->>'status',
    'completedGames',(snapshot->>'currentGameIndex')::integer,'totalGames',jsonb_array_length(snapshot->'games'),'updatedAt',updated_at)ORDER BY updated_at DESC,career_id),'[]'::jsonb)INTO result
    FROM(SELECT s.career_id,s.revision,s.snapshot,s.updated_at FROM baseball_private.career_v2_saves s WHERE s.owner_hash=p_owner
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
      FROM(SELECT s.career_id,s.revision,s.snapshot,s.updated_at FROM baseball_private.career_v2_saves s WHERE s.owner_hash=p_actor OR EXISTS(
        SELECT 1 FROM baseball_private.career_recovery_grants g JOIN baseball_private.career_recovery_codes c USING(career_version,career_id)
          WHERE g.actor_hash=p_actor AND g.career_version=2 AND g.career_id=s.career_id AND c.active AND g.generation=c.generation)
        ORDER BY s.updated_at DESC,s.career_id LIMIT 20)rows;
  END IF;
  RETURN jsonb_build_object('status','ok','careers',result);
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_save_career_v2(
  p_owner text,p_id uuid,p_expected_revision integer,p_command_id uuid,p_hash text,p_snapshot jsonb,p_at_bats jsonb,p_at_bat_receipt jsonb
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, baseball_private, pg_temp AS $function$
DECLARE
  prior baseball_private.career_v2_saves%ROWTYPE; cmd baseball_private.career_v2_commands%ROWTYPE; bat baseball_private.career_v2_at_bats%ROWTYPE;
  item jsonb; old_item jsonb; new_item jsonb; old_count integer; new_count integer; n integer; slot_index integer;
  game_count integer:=3; current_game integer; batch_game integer; batch_slot integer:=1; ledger_limit integer:=3;
BEGIN
  IF p_owner IS NULL OR p_id IS NULL OR p_command_id IS NULL OR p_hash IS NULL OR p_expected_revision IS NULL OR p_snapshot IS NULL OR p_at_bats IS NULL
    OR p_owner!~'^[a-f0-9]{64}$' OR p_hash!~'^[a-f0-9]{64}$' OR p_expected_revision<0 OR p_expected_revision>=2147483647
    OR jsonb_typeof(p_snapshot)IS DISTINCT FROM 'object' OR p_snapshot->>'id' IS DISTINCT FROM p_id::text
    OR p_snapshot->>'schemaVersion' IS DISTINCT FROM '2' OR coalesce(p_snapshot->>'source','')NOT IN('manual','development')
    OR p_snapshot->'versions'->>'careerId' IS DISTINCT FROM 'baseball-career-v2'
    OR p_snapshot->'versions'->>'growthPolicyId' IS DISTINCT FROM 'baseball-career-growth-v2'
    OR coalesce(p_snapshot->'versions'->>'growthHash','')!~'^[a-f0-9]{64}$'
    OR jsonb_typeof(p_snapshot->'growth'->'mit') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_snapshot->'growth'->'power') IS DISTINCT FROM 'number'
    OR coalesce(p_snapshot->'growth'->>'mit','')!~'^[0-9]{1,3}$'
    OR coalesce(p_snapshot->'growth'->>'power','')!~'^[0-9]{1,3}$'
    OR p_snapshot->>'revision' IS DISTINCT FROM(p_expected_revision+1)::text OR jsonb_typeof(p_snapshot->'ledger')IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_snapshot->'games')IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_at_bats)IS DISTINCT FROM 'array' OR jsonb_array_length(p_at_bats)>6 THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;
  IF p_snapshot?'scheduleId' THEN
    IF p_snapshot->>'scheduleId' IS DISTINCT FROM 'regular-144-v1' THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
    game_count:=144;
  END IF;
  IF jsonb_array_length(p_snapshot->'games')<>game_count OR (game_count=144 AND jsonb_array_length(p_at_bats)>2) THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;
  IF (p_snapshot->'growth'->>'mit')::integer NOT BETWEEN 0 AND 100
    OR (p_snapshot->'growth'->>'power')::integer NOT BETWEEN 0 AND 100 THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;
  IF octet_length(p_snapshot::text)>8388608 OR octet_length(p_at_bats::text)>16777216 THEN RETURN jsonb_build_object('status','error','code','storage_capacity'); END IF;
  IF NOT baseball_private.baseball_take_career_v2_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  -- An owner lock makes the twenty-save capacity check atomic across creates.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner,20));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,19));
  SELECT * INTO prior FROM baseball_private.career_v2_saves WHERE career_id=p_id FOR UPDATE;
  IF FOUND AND prior.owner_hash<>p_owner THEN
    RETURN jsonb_build_object('status','error','code','command_conflict');
  END IF;
  SELECT * INTO cmd FROM baseball_private.career_v2_commands WHERE command_id=p_command_id;
  IF FOUND THEN
    IF cmd.career_id<>p_id OR cmd.payload_hash<>p_hash OR prior.career_id IS NULL THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
    RETURN jsonb_build_object('status','stored','snapshot',prior.snapshot,'duplicate',true,'atBatReceipt',cmd.at_bat_receipt,
      'receipt',jsonb_build_object('sessionId',p_id,'commandId',p_command_id,'revision',cmd.revision));
  END IF;
  IF prior.career_id IS NULL THEN
    IF(SELECT count(*) FROM baseball_private.career_v2_saves WHERE owner_hash=p_owner)>=20 THEN RETURN jsonb_build_object('status','error','code','storage_capacity'); END IF;
    IF p_expected_revision<>0
      OR jsonb_array_length(p_snapshot->'ledger')<>0 OR jsonb_array_length(p_at_bats)<>0
      OR p_snapshot->>'status' IS DISTINCT FROM 'active' OR p_snapshot->'activeAtBat' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object('status','error','code','invalid_command');
    END IF;
  ELSE
    IF p_expected_revision<>prior.revision THEN RETURN jsonb_build_object('status','error','code','revision_conflict'); END IF;
    IF prior.snapshot->>'status'='complete'
      OR(p_snapshot-'revision'-'updatedAt'-'games'-'growth'-'ledger'-'activeAtBat'-'currentGameIndex'-'status'-'stats')
        IS DISTINCT FROM(prior.snapshot-'revision'-'updatedAt'-'games'-'growth'-'ledger'-'activeAtBat'-'currentGameIndex'-'status'-'stats') THEN
      RETURN jsonb_build_object('status','error','code','command_conflict');
    END IF;
    IF game_count=144 THEN
      current_game:=(prior.snapshot->>'currentGameIndex')::integer;
      IF current_game IS NULL OR current_game NOT BETWEEN 0 AND game_count-1 THEN
        RETURN jsonb_build_object('status','error','code','command_conflict');
      END IF;
    END IF;
    -- A two-row batch completes only the prepared, otherwise untouched current game.
    -- A game with one finished appearance uses the existing single-child path.
    IF game_count=144 AND jsonb_array_length(p_at_bats)=2 THEN
      batch_game:=current_game;
      old_item:=prior.snapshot->'games'->batch_game;new_item:=p_snapshot->'games'->batch_game;
      IF prior.snapshot->'activeAtBat' IS DISTINCT FROM 'null'::jsonb
        OR old_item->'preparation' IS NULL OR old_item->'preparation'='null'::jsonb
        OR jsonb_array_length(old_item->'appearances') IS DISTINCT FROM 0
        OR new_item->>'status' IS DISTINCT FROM 'complete'
        OR jsonb_array_length(new_item->'appearances') IS DISTINCT FROM 2
        OR p_snapshot->>'currentGameIndex' IS DISTINCT FROM (batch_game+1)::text
        OR p_snapshot->'activeAtBat' IS DISTINCT FROM 'null'::jsonb
        OR (p_at_bat_receipt IS NOT NULL AND p_at_bat_receipt<>'null'::jsonb) THEN
        RETURN jsonb_build_object('status','error','code','command_conflict');
      END IF;
      ledger_limit:=4;
    END IF;
    old_count:=jsonb_array_length(prior.snapshot->'ledger');new_count:=jsonb_array_length(p_snapshot->'ledger');
    IF new_count<old_count OR new_count>old_count+ledger_limit THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
    IF old_count>0 THEN FOR n IN 0..old_count-1 LOOP
      IF prior.snapshot->'ledger'->n IS DISTINCT FROM p_snapshot->'ledger'->n THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
    END LOOP;END IF;
    FOR slot_index IN 0..game_count-1 LOOP
      old_item:=prior.snapshot->'games'->slot_index;new_item:=p_snapshot->'games'->slot_index;
      IF game_count=144 AND slot_index<>current_game THEN
        IF old_item IS DISTINCT FROM new_item THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
        CONTINUE;
      END IF;
      IF(old_item-'status'-'preparation'-'appearances'-'stats')IS DISTINCT FROM(new_item-'status'-'preparation'-'appearances'-'stats')
        OR old_item->'preparation'<>'null'::jsonb AND old_item->'preparation'IS DISTINCT FROM new_item->'preparation'
        OR old_item->>'status'='complete' AND old_item IS DISTINCT FROM new_item THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      old_count:=jsonb_array_length(old_item->'appearances');new_count:=jsonb_array_length(new_item->'appearances');
      IF new_count<old_count OR new_count>old_count+(CASE WHEN slot_index=batch_game THEN 2 ELSE 1 END) THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      IF old_count>0 THEN FOR n IN 0..old_count-1 LOOP
        IF old_item->'appearances'->n IS DISTINCT FROM new_item->'appearances'->n THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      END LOOP;END IF;
    END LOOP;
  END IF;
  -- Validate every child before writing any career or at-bat data.
  FOR item IN SELECT value FROM jsonb_array_elements(p_at_bats) LOOP
    IF jsonb_typeof(item)IS DISTINCT FROM 'object' OR coalesce(item->>'gameIndex','')!~'^(0|[1-9][0-9]{0,2})$' OR coalesce(item->>'slot','')NOT IN('1','2')
      OR coalesce(item->>'source','')NOT IN('manual','development','automatic')
      OR jsonb_typeof(item->'snapshot')IS DISTINCT FROM 'object' OR item->'snapshot'->>'id'IS DISTINCT FROM item->>'id'
      OR item->'snapshot'->>'source'IS DISTINCT FROM item->>'source'
      OR item->'snapshot'->>'schemaVersion' IS DISTINCT FROM '2'
      OR item->'snapshot'->'growthSnapshot' IS DISTINCT FROM item->'snapshot'->'state'->'growthSnapshot'
      OR item->'snapshot'->>'revision'IS DISTINCT FROM((item->>'expectedRevision')::integer+1)::text
      OR coalesce(item->>'id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR coalesce(item->>'expectedRevision','')!~'^[0-9]{1,9}$'
      OR item->'snapshot'->'state'->>'id'IS DISTINCT FROM item->>'id' THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
    IF (item->>'gameIndex')::integer>=game_count OR (game_count=144 AND (item->>'gameIndex')::integer<>current_game) THEN
      RETURN jsonb_build_object('status','error','code','invalid_command');
    END IF;
    IF batch_game IS NOT NULL THEN
      IF (item->>'gameIndex')::integer<>batch_game OR (item->>'slot')::integer<>batch_slot
        OR item->>'expectedRevision' IS DISTINCT FROM '0' OR item->>'source' IS DISTINCT FROM 'automatic'
        OR item->'snapshot'->>'mode' IS DISTINCT FROM 'automatic'
        OR item->'snapshot'->'state'->>'status' IS DISTINCT FROM 'complete' THEN
        RETURN jsonb_build_object('status','error','code','invalid_command');
      END IF;
      batch_slot:=batch_slot+1;
    END IF;
    IF octet_length((item->'snapshot')::text)>8388608 THEN RETURN jsonb_build_object('status','error','code','storage_capacity'); END IF;
    SELECT * INTO bat FROM baseball_private.career_v2_at_bats WHERE at_bat_id=(item->>'id')::uuid FOR UPDATE;
    IF FOUND THEN
      IF bat.career_id<>p_id OR bat.game_index<>(item->>'gameIndex')::integer OR bat.slot<>(item->>'slot')::integer OR bat.source<>item->>'source'
        OR bat.source='automatic' OR bat.snapshot->'state'->>'status'='complete'
        OR(bat.snapshot-'revision'-'updatedAt'-'state'-'pending'-'attempts'-'finalReceipt')
          IS DISTINCT FROM((item->'snapshot')-'revision'-'updatedAt'-'state'-'pending'-'attempts'-'finalReceipt')
        OR((bat.snapshot->'state')-'balls'-'strikes'-'pitchCount'-'status'-'outcome'-'history'-'stats')
          IS DISTINCT FROM((item->'snapshot'->'state')-'balls'-'strikes'-'pitchCount'-'status'-'outcome'-'history'-'stats') THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      IF bat.revision<>(item->>'expectedRevision')::integer THEN RETURN jsonb_build_object('status','error','code','revision_conflict'); END IF;
      old_count:=jsonb_array_length(bat.snapshot->'state'->'history');new_count:=jsonb_array_length(item->'snapshot'->'state'->'history');
      IF new_count<old_count OR new_count>old_count+1 THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      IF old_count>0 THEN FOR n IN 0..old_count-1 LOOP
        IF bat.snapshot->'state'->'history'->n IS DISTINCT FROM item->'snapshot'->'state'->'history'->n THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      END LOOP;END IF;
      old_count:=jsonb_array_length(bat.snapshot->'attempts');new_count:=jsonb_array_length(item->'snapshot'->'attempts');
      IF new_count<old_count OR new_count>old_count+1 THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      IF old_count>0 THEN FOR n IN 0..old_count-1 LOOP
        old_item:=bat.snapshot->'attempts'->n;new_item:=item->'snapshot'->'attempts'->n;
        IF(old_item-'status'-'pausedAt'-'inputAcceptedAt'-'resolvedAt'-'input'-'pauseReason')IS DISTINCT FROM(new_item-'status'-'pausedAt'-'inputAcceptedAt'-'resolvedAt'-'input'-'pauseReason')
          OR old_item->>'id'IS DISTINCT FROM bat.snapshot->'pending'->>'attemptId' AND old_item IS DISTINCT FROM new_item
          OR old_item->>'status'IN('resolved','superseded') AND old_item IS DISTINCT FROM new_item
          OR old_item->'input'<>'null'::jsonb AND(old_item->'input'IS DISTINCT FROM new_item->'input' OR old_item->'inputAcceptedAt'IS DISTINCT FROM new_item->'inputAcceptedAt' OR new_item->>'status'='superseded')
          THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      END LOOP;END IF;
    ELSE
      IF(item->>'expectedRevision')::integer<>0 OR EXISTS(SELECT 1 FROM baseball_private.career_v2_at_bats WHERE career_id=p_id AND game_index=(item->>'gameIndex')::integer AND slot=(item->>'slot')::integer)THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      IF prior.career_id IS NULL OR NOT baseball_private.baseball_valid_career_v2_growth(
        item->'snapshot'->'growthSnapshot',p_id,(item->>'gameIndex')::integer,(item->>'slot')::integer,p_expected_revision,
        (prior.snapshot->'growth'->>'mit')::integer,(prior.snapshot->'growth'->>'power')::integer
      ) THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
    END IF;
    IF item->'snapshot'->'state'->>'status'='complete' THEN
      new_item:=p_snapshot->'games'->(item->>'gameIndex')::integer->'appearances'->((item->>'slot')::integer-1);
      IF new_item->>'id' IS DISTINCT FROM item->>'id'
        OR new_item->'growthSnapshot' IS DISTINCT FROM item->'snapshot'->'growthSnapshot'
        THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
    ELSIF p_snapshot->'activeAtBat'->>'id' IS DISTINCT FROM item->>'id'
      OR p_snapshot->'activeAtBat'->'growthSnapshot' IS DISTINCT FROM item->'snapshot'->'growthSnapshot'
      THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
  END LOOP;
  INSERT INTO baseball_private.career_v2_saves(career_id,owner_hash,revision,snapshot)
    VALUES(p_id,p_owner,p_expected_revision+1,p_snapshot)
    ON CONFLICT(career_id)DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot,updated_at=clock_timestamp();
  FOR item IN SELECT value FROM jsonb_array_elements(p_at_bats) LOOP
    INSERT INTO baseball_private.career_v2_at_bats(at_bat_id,career_id,game_index,slot,source,revision,snapshot)
      VALUES((item->>'id')::uuid,p_id,(item->>'gameIndex')::integer,(item->>'slot')::integer,item->>'source',(item->>'expectedRevision')::integer+1,item->'snapshot')
      ON CONFLICT(at_bat_id)DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot,updated_at=clock_timestamp();
  END LOOP;
  INSERT INTO baseball_private.career_v2_commands(command_id,career_id,payload_hash,kind,revision,at_bat_receipt)
    VALUES(p_command_id,p_id,p_hash,CASE WHEN p_at_bat_receipt IS NULL OR p_at_bat_receipt='null'::jsonb THEN 'career' ELSE 'at-bat' END,p_expected_revision+1,p_at_bat_receipt);
  RETURN jsonb_build_object('status','stored','snapshot',p_snapshot,'duplicate',false,'atBatReceipt',p_at_bat_receipt,
    'receipt',jsonb_build_object('sessionId',p_id,'commandId',p_command_id,'revision',p_expected_revision+1));
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('status','error','code','command_conflict');
END
$function$;

COMMIT;
