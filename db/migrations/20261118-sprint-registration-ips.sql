-- Apply after db/playground-sprint.sql as the dedicated database owner.
-- Registration IPs are private, expire after 30 days, and never enter public JSON.
-- Reapplying this migration preserves existing records and original IP expiry.
BEGIN;

CREATE TABLE IF NOT EXISTS sprint_private.sprint_record_ips (
  record_id uuid PRIMARY KEY REFERENCES sprint_private.sprint_records(id) ON DELETE CASCADE,
  registration_ip inet NOT NULL,
  recorded_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at = recorded_at + interval '30 days')
);
CREATE INDEX IF NOT EXISTS sprint_record_ips_expiry_idx
  ON sprint_private.sprint_record_ips(expires_at);
REVOKE ALL ON TABLE sprint_private.sprint_record_ips FROM PUBLIC, sprint_runtime;

CREATE OR REPLACE FUNCTION sprint_private.sprint_purge_registration_ips()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, sprint_private
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM sprint_private.sprint_record_ips WHERE expires_at <= clock_timestamp();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('status', 'ok', 'deletedCount', v_deleted);
END;
$function$;

CREATE OR REPLACE FUNCTION sprint_private.sprint_register_record(
  p_id uuid, p_participant text, p_submission_hash text, p_player_name text, p_country_code text,
  p_registration_ip inet)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, sprint_private
AS $function$
DECLARE
  v_board text;
  v_attempt sprint_private.sprint_attempts%ROWTYPE;
  v_existing sprint_private.sprint_records%ROWTYPE;
  v_count integer;
  v_worst integer;
  v_status text;
  v_result jsonb;
  v_record jsonb;
  v_snapshot jsonb;
  v_now timestamptz;
  v_seq bigint;
  v_rank integer;
  v_record_id uuid;
BEGIN
  SELECT board_id INTO v_board FROM sprint_private.sprint_attempts
    WHERE id = p_id AND participant_hash = p_participant;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'code', 'attempt_not_found'); END IF;
  -- Keep the existing board -> attempt lock order for all ranking mutations.
  PERFORM 1 FROM sprint_private.sprint_boards WHERE id = v_board AND enabled FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unavailable', 'code', 'not_configured'); END IF;
  SELECT * INTO v_attempt FROM sprint_private.sprint_attempts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'code', 'attempt_not_found'); END IF;
  -- A retry returns the stored public result before touching the IP or expiry.
  IF v_attempt.registration_result IS NOT NULL THEN
    IF v_attempt.registration_hash = p_submission_hash THEN RETURN v_attempt.registration_result; END IF;
    RETURN jsonb_build_object('status', 'error', 'code', 'attempt_conflict');
  END IF;
  v_now := clock_timestamp();
  IF v_attempt.expires_at <= v_now THEN RETURN jsonb_build_object('status', 'error', 'code', 'attempt_expired'); END IF;
  IF v_attempt.finish_result IS NULL THEN RETURN jsonb_build_object('status', 'error', 'code', 'attempt_not_verified'); END IF;
  IF p_player_name IS NULL OR char_length(p_player_name) NOT BETWEEN 1 AND 16
    OR p_country_code IS NULL OR p_country_code !~ '^[A-Z]{2}$'
    OR p_submission_hash IS NULL OR p_submission_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'invalid_player');
  END IF;
  SELECT * INTO v_existing FROM sprint_private.sprint_records
    WHERE board_id = v_board AND participant_hash = p_participant;
  SELECT count(*), max(time_cs) INTO v_count, v_worst
    FROM sprint_private.sprint_records WHERE board_id = v_board;
  IF v_existing.id IS NOT NULL AND v_attempt.verified_time_cs >= v_existing.time_cs THEN
    v_status := 'not_improved';
  ELSIF v_existing.id IS NULL AND v_count >= 10 AND v_attempt.verified_time_cs >= v_worst THEN
    v_status := 'not_qualified';
  ELSE
    -- Allocate registration time/sequence only after acquiring the board lock.
    v_now := clock_timestamp();
    v_seq := nextval('sprint_private.sprint_registration_seq'::regclass);
    INSERT INTO sprint_private.sprint_records(id, board_id, attempt_id, participant_hash,
      player_name, country_code, time_cs, recorded_at, registration_seq)
    VALUES (gen_random_uuid(), v_board, p_id, p_participant, p_player_name, p_country_code,
      v_attempt.verified_time_cs, v_now, v_seq)
    ON CONFLICT (board_id, participant_hash) DO UPDATE SET
      attempt_id = EXCLUDED.attempt_id, player_name = EXCLUDED.player_name,
      country_code = EXCLUDED.country_code, time_cs = EXCLUDED.time_cs,
      recorded_at = EXCLUDED.recorded_at, registration_seq = EXCLUDED.registration_seq
    RETURNING id INTO v_record_id;
    IF p_registration_ip IS NULL THEN
      -- A new best with unknown IP must not inherit the previous registration's IP.
      DELETE FROM sprint_private.sprint_record_ips WHERE record_id = v_record_id;
    ELSE
      INSERT INTO sprint_private.sprint_record_ips(record_id, registration_ip, recorded_at, expires_at)
      VALUES (v_record_id, p_registration_ip, v_now, v_now + interval '30 days')
      ON CONFLICT (record_id) DO UPDATE SET
        registration_ip = EXCLUDED.registration_ip,
        recorded_at = EXCLUDED.recorded_at, expires_at = EXCLUDED.expires_at;
    END IF;
    -- Removed TOP10 entries automatically remove their private IP metadata too.
    DELETE FROM sprint_private.sprint_records WHERE id IN (
      SELECT id FROM sprint_private.sprint_records WHERE board_id = v_board
      ORDER BY time_cs, registration_seq, id OFFSET 10
    );
    UPDATE sprint_private.sprint_boards SET updated_at = v_now WHERE id = v_board;
    v_status := 'registered';
  END IF;
  IF v_status <> 'not_qualified' THEN
    SELECT ranked.rank INTO v_rank FROM (
      SELECT participant_hash, row_number() OVER (ORDER BY time_cs, registration_seq, id)::integer AS rank
      FROM sprint_private.sprint_records WHERE board_id = v_board
    ) ranked WHERE ranked.participant_hash = p_participant;
    SELECT jsonb_build_object('rank', v_rank, 'playerName', player_name,
      'countryCode', country_code, 'timeCs', time_cs, 'recordedAt', recorded_at)
    INTO v_record FROM sprint_private.sprint_records
    WHERE board_id = v_board AND participant_hash = p_participant;
  END IF;
  v_snapshot := sprint_private.sprint_snapshot(v_board);
  v_result := jsonb_build_object('status', v_status, 'record', v_record) || v_snapshot;
  UPDATE sprint_private.sprint_attempts SET registration_hash = p_submission_hash,
    registration_result = v_result, consumed_at = clock_timestamp() WHERE id = p_id;
  RETURN v_result;
END;
$function$;

-- Old application versions keep working without attributing a stale/unknown IP.
CREATE OR REPLACE FUNCTION sprint_private.sprint_register_record(
  p_id uuid, p_participant text, p_submission_hash text, p_player_name text, p_country_code text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, sprint_private
AS $function$
  SELECT sprint_private.sprint_register_record(
    p_id, p_participant, p_submission_hash, p_player_name, p_country_code, NULL::inet);
$function$;

-- Owner-only inspection. Expired metadata is hidden even before scheduled purge.
CREATE OR REPLACE VIEW sprint_private.sprint_registration_ip_admin AS
SELECT record.id AS record_id, record.board_id, record.player_name, record.country_code,
  record.time_cs, record.recorded_at, host(ip.registration_ip) AS registration_ip, ip.expires_at
FROM sprint_private.sprint_records AS record
JOIN sprint_private.sprint_record_ips AS ip ON ip.record_id = record.id
WHERE ip.expires_at > clock_timestamp();
REVOKE ALL ON TABLE sprint_private.sprint_registration_ip_admin FROM PUBLIC, sprint_runtime;

REVOKE ALL ON FUNCTION sprint_private.sprint_register_record(uuid, text, text, text, text),
  sprint_private.sprint_register_record(uuid, text, text, text, text, inet),
  sprint_private.sprint_purge_registration_ips()
FROM PUBLIC, sprint_runtime;
GRANT EXECUTE ON FUNCTION sprint_private.sprint_register_record(uuid, text, text, text, text),
  sprint_private.sprint_register_record(uuid, text, text, text, text, inet),
  sprint_private.sprint_purge_registration_ips()
TO sprint_runtime;

COMMIT;
