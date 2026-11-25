-- Development-only three-game career saves. Apply as the baseball_dev owner.
-- Existing ten-pitch and at-bat-practice tables/functions remain unchanged.
BEGIN;
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
END
$guard$;

CREATE TABLE IF NOT EXISTS baseball_private.career_saves(
  career_id uuid PRIMARY KEY,
  owner_hash text NOT NULL CHECK(owner_hash~'^[a-f0-9]{64}$'),
  revision integer NOT NULL CHECK(revision>=1),
  snapshot jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX IF NOT EXISTS baseball_career_saves_owner_idx ON baseball_private.career_saves(owner_hash,updated_at DESC,career_id);
CREATE TABLE IF NOT EXISTS baseball_private.career_commands(
  command_id uuid PRIMARY KEY,
  career_id uuid NOT NULL REFERENCES baseball_private.career_saves(career_id),
  payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK(kind IN('career','at-bat')),
  revision integer NOT NULL CHECK(revision>=1),
  at_bat_receipt jsonb,
  received_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX IF NOT EXISTS baseball_career_commands_career_idx ON baseball_private.career_commands(career_id,command_id);
CREATE TABLE IF NOT EXISTS baseball_private.career_at_bats(
  at_bat_id uuid PRIMARY KEY,
  career_id uuid NOT NULL REFERENCES baseball_private.career_saves(career_id),
  game_index integer NOT NULL CHECK(game_index BETWEEN 0 AND 2),
  slot integer NOT NULL CHECK(slot BETWEEN 1 AND 2),
  source text NOT NULL CHECK(source IN('manual','development','automatic')),
  revision integer NOT NULL CHECK(revision>=1),
  snapshot jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE(career_id,game_index,slot)
);
CREATE TABLE IF NOT EXISTS baseball_private.career_rate_limits(
  owner_hash text PRIMARY KEY CHECK(owner_hash~'^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK(requests>=1)
);
CREATE OR REPLACE FUNCTION baseball_private.baseball_take_career_rate_limit(p_owner text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE n integer; t timestamptz:=clock_timestamp();
BEGIN
  IF p_owner IS NULL OR p_owner!~'^[a-f0-9]{64}$' THEN RETURN false; END IF;
  INSERT INTO baseball_private.career_rate_limits AS r(owner_hash,window_started_at,requests)VALUES(p_owner,t,1)
  ON CONFLICT(owner_hash)DO UPDATE SET
    window_started_at=CASE WHEN r.window_started_at<=t-interval '1 minute' THEN t ELSE r.window_started_at END,
    requests=CASE WHEN r.window_started_at<=t-interval '1 minute' THEN 1 ELSE LEAST(r.requests+1,601) END
  RETURNING requests INTO n;
  RETURN n<=600;
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_list_careers(p_owner text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE result jsonb;
BEGIN
  IF p_owner IS NULL OR p_owner!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
  IF NOT baseball_private.baseball_take_career_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',career_id,'revision',revision,'profile',snapshot->'profile','status',snapshot->>'status',
    'completedGames',(snapshot->>'currentGameIndex')::integer,'updatedAt',updated_at)ORDER BY updated_at DESC,career_id),'[]'::jsonb)INTO result
    FROM(SELECT s.career_id,s.revision,s.snapshot,s.updated_at FROM baseball_private.career_saves s WHERE s.owner_hash=p_owner
      ORDER BY s.updated_at DESC,s.career_id LIMIT 20)rows;
  RETURN jsonb_build_object('status','ok','careers',result);
END
$function$;
CREATE OR REPLACE FUNCTION baseball_private.baseball_read_career(p_owner text,p_id uuid,p_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE prior baseball_private.career_saves%ROWTYPE; cmd baseball_private.career_commands%ROWTYPE; command_value jsonb:='null'::jsonb;
BEGIN
  IF p_owner IS NULL OR p_id IS NULL OR p_owner!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
  IF NOT baseball_private.baseball_take_career_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  SELECT s.* INTO prior FROM baseball_private.career_saves s WHERE career_id=p_id AND s.owner_hash=p_owner;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  IF p_command_id IS NOT NULL THEN
    SELECT * INTO cmd FROM baseball_private.career_commands WHERE command_id=p_command_id AND career_id=p_id;
    IF FOUND THEN command_value:=jsonb_build_object('hash',cmd.payload_hash,'revision',cmd.revision,'atBatReceipt',cmd.at_bat_receipt,'kind',cmd.kind); END IF;
  END IF;
  RETURN jsonb_build_object('status','ok','snapshot',prior.snapshot,'command',command_value);
END
$function$;
CREATE OR REPLACE FUNCTION baseball_private.baseball_read_career_at_bat(p_owner text,p_id uuid,p_at_bat_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE prior baseball_private.career_at_bats%ROWTYPE;
BEGIN
  IF p_owner IS NULL OR p_id IS NULL OR p_at_bat_id IS NULL OR p_owner!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
  IF NOT baseball_private.baseball_take_career_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  SELECT b.* INTO prior FROM baseball_private.career_at_bats b WHERE b.career_id=p_id AND b.at_bat_id=p_at_bat_id
    AND EXISTS(SELECT 1 FROM baseball_private.career_saves s WHERE s.career_id=p_id AND s.owner_hash=p_owner);
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  RETURN jsonb_build_object('status','ok','snapshot',prior.snapshot,'source',prior.source,'gameIndex',prior.game_index,'slot',prior.slot,'revision',prior.revision);
END
$function$;

CREATE OR REPLACE FUNCTION baseball_private.baseball_save_career(
  p_owner text,p_id uuid,p_expected_revision integer,p_command_id uuid,p_hash text,p_snapshot jsonb,p_at_bats jsonb,p_at_bat_receipt jsonb
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,baseball_private AS $function$
DECLARE
  prior baseball_private.career_saves%ROWTYPE; cmd baseball_private.career_commands%ROWTYPE; bat baseball_private.career_at_bats%ROWTYPE;
  item jsonb; old_item jsonb; new_item jsonb; old_count integer; new_count integer; n integer; slot_index integer;
BEGIN
  IF p_owner IS NULL OR p_id IS NULL OR p_command_id IS NULL OR p_hash IS NULL OR p_expected_revision IS NULL OR p_snapshot IS NULL OR p_at_bats IS NULL
    OR p_owner!~'^[a-f0-9]{64}$' OR p_hash!~'^[a-f0-9]{64}$' OR p_expected_revision<0 OR p_expected_revision>=2147483647
    OR jsonb_typeof(p_snapshot)IS DISTINCT FROM 'object' OR p_snapshot->>'id' IS DISTINCT FROM p_id::text
    OR p_snapshot->>'schemaVersion' IS DISTINCT FROM '1' OR coalesce(p_snapshot->>'source','')NOT IN('manual','development')
    OR p_snapshot->>'revision' IS DISTINCT FROM(p_expected_revision+1)::text OR jsonb_typeof(p_snapshot->'ledger')IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_snapshot->'games')IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'games')<>3
    OR jsonb_typeof(p_at_bats)IS DISTINCT FROM 'array' OR jsonb_array_length(p_at_bats)>6 THEN
    RETURN jsonb_build_object('status','error','code','invalid_command');
  END IF;
  IF octet_length(p_snapshot::text)>8388608 OR octet_length(p_at_bats::text)>16777216 THEN RETURN jsonb_build_object('status','error','code','storage_capacity'); END IF;
  IF NOT baseball_private.baseball_take_career_rate_limit(p_owner) THEN RETURN jsonb_build_object('status','error','code','rate_limited'); END IF;
  -- An owner lock makes the twenty-save capacity check atomic across creates.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner,20));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,19));
  SELECT * INTO prior FROM baseball_private.career_saves WHERE career_id=p_id FOR UPDATE;
  IF FOUND AND prior.owner_hash<>p_owner THEN
    RETURN jsonb_build_object('status','error','code','command_conflict');
  END IF;
  SELECT * INTO cmd FROM baseball_private.career_commands WHERE command_id=p_command_id;
  IF FOUND THEN
    IF cmd.career_id<>p_id OR cmd.payload_hash<>p_hash OR prior.career_id IS NULL THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
    RETURN jsonb_build_object('status','stored','snapshot',prior.snapshot,'duplicate',true,'atBatReceipt',cmd.at_bat_receipt,
      'receipt',jsonb_build_object('sessionId',p_id,'commandId',p_command_id,'revision',cmd.revision));
  END IF;
  IF prior.career_id IS NULL THEN
    IF(SELECT count(*) FROM baseball_private.career_saves WHERE owner_hash=p_owner)>=20 THEN RETURN jsonb_build_object('status','error','code','storage_capacity'); END IF;
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
    old_count:=jsonb_array_length(prior.snapshot->'ledger');new_count:=jsonb_array_length(p_snapshot->'ledger');
    IF new_count<old_count OR new_count>old_count+3 THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
    IF old_count>0 THEN FOR n IN 0..old_count-1 LOOP
      IF prior.snapshot->'ledger'->n IS DISTINCT FROM p_snapshot->'ledger'->n THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
    END LOOP;END IF;
    FOR slot_index IN 0..2 LOOP
      old_item:=prior.snapshot->'games'->slot_index;new_item:=p_snapshot->'games'->slot_index;
      IF(old_item-'status'-'preparation'-'appearances'-'stats')IS DISTINCT FROM(new_item-'status'-'preparation'-'appearances'-'stats')
        OR old_item->'preparation'<>'null'::jsonb AND old_item->'preparation'IS DISTINCT FROM new_item->'preparation'
        OR old_item->>'status'='complete' AND old_item IS DISTINCT FROM new_item THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      old_count:=jsonb_array_length(old_item->'appearances');new_count:=jsonb_array_length(new_item->'appearances');
      IF new_count<old_count OR new_count>old_count+1 THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      IF old_count>0 THEN FOR n IN 0..old_count-1 LOOP
        IF old_item->'appearances'->n IS DISTINCT FROM new_item->'appearances'->n THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
      END LOOP;END IF;
    END LOOP;
  END IF;
  -- Validate every child before writing any career or at-bat data.
  FOR item IN SELECT value FROM jsonb_array_elements(p_at_bats) LOOP
    IF jsonb_typeof(item)IS DISTINCT FROM 'object' OR coalesce(item->>'gameIndex','')NOT IN('0','1','2') OR coalesce(item->>'slot','')NOT IN('1','2')
      OR coalesce(item->>'source','')NOT IN('manual','development','automatic')
      OR jsonb_typeof(item->'snapshot')IS DISTINCT FROM 'object' OR item->'snapshot'->>'id'IS DISTINCT FROM item->>'id'
      OR item->'snapshot'->>'source'IS DISTINCT FROM item->>'source'
      OR item->'snapshot'->>'revision'IS DISTINCT FROM((item->>'expectedRevision')::integer+1)::text
      OR coalesce(item->>'id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR coalesce(item->>'expectedRevision','')!~'^[0-9]{1,9}$'
      OR item->'snapshot'->'state'->>'id'IS DISTINCT FROM item->>'id' THEN RETURN jsonb_build_object('status','error','code','invalid_command'); END IF;
    IF octet_length((item->'snapshot')::text)>8388608 THEN RETURN jsonb_build_object('status','error','code','storage_capacity'); END IF;
    SELECT * INTO bat FROM baseball_private.career_at_bats WHERE at_bat_id=(item->>'id')::uuid FOR UPDATE;
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
      IF(item->>'expectedRevision')::integer<>0 OR EXISTS(SELECT 1 FROM baseball_private.career_at_bats WHERE career_id=p_id AND game_index=(item->>'gameIndex')::integer AND slot=(item->>'slot')::integer)THEN RETURN jsonb_build_object('status','error','code','command_conflict'); END IF;
    END IF;
  END LOOP;
  INSERT INTO baseball_private.career_saves(career_id,owner_hash,revision,snapshot)
    VALUES(p_id,p_owner,p_expected_revision+1,p_snapshot)
    ON CONFLICT(career_id)DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot,updated_at=clock_timestamp();
  FOR item IN SELECT value FROM jsonb_array_elements(p_at_bats) LOOP
    INSERT INTO baseball_private.career_at_bats(at_bat_id,career_id,game_index,slot,source,revision,snapshot)
      VALUES((item->>'id')::uuid,p_id,(item->>'gameIndex')::integer,(item->>'slot')::integer,item->>'source',(item->>'expectedRevision')::integer+1,item->'snapshot')
      ON CONFLICT(at_bat_id)DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot,updated_at=clock_timestamp();
  END LOOP;
  INSERT INTO baseball_private.career_commands(command_id,career_id,payload_hash,kind,revision,at_bat_receipt)
    VALUES(p_command_id,p_id,p_hash,CASE WHEN p_at_bat_receipt IS NULL OR p_at_bat_receipt='null'::jsonb THEN 'career' ELSE 'at-bat' END,p_expected_revision+1,p_at_bat_receipt);
  RETURN jsonb_build_object('status','stored','snapshot',p_snapshot,'duplicate',false,'atBatReceipt',p_at_bat_receipt,
    'receipt',jsonb_build_object('sessionId',p_id,'commandId',p_command_id,'revision',p_expected_revision+1));
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('status','error','code','command_conflict');
END
$function$;

REVOKE ALL ON baseball_private.career_saves,baseball_private.career_commands,baseball_private.career_at_bats,baseball_private.career_rate_limits FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_take_career_rate_limit(text) FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_list_careers(text) FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_read_career(text,uuid,uuid) FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_read_career_at_bat(text,uuid,uuid) FROM PUBLIC,baseball_runtime;
REVOKE ALL ON FUNCTION baseball_private.baseball_save_career(text,uuid,integer,uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC,baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_list_careers(text) TO baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_read_career(text,uuid,uuid) TO baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_read_career_at_bat(text,uuid,uuid) TO baseball_runtime;
GRANT EXECUTE ON FUNCTION baseball_private.baseball_save_career(text,uuid,integer,uuid,text,jsonb,jsonb,jsonb) TO baseball_runtime;
COMMIT;
