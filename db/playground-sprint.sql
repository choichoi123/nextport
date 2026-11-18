-- Run as the dedicated development database owner, never the application role.
-- Idempotent installation. Set sprint_runtime's password separately, outside Git/logs.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sprint_runtime') THEN
    CREATE ROLE sprint_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS sprint_private;
REVOKE ALL ON SCHEMA sprint_private FROM PUBLIC;
GRANT USAGE ON SCHEMA sprint_private TO sprint_runtime;

CREATE TABLE IF NOT EXISTS sprint_private.sprint_boards (
  id text PRIMARY KEY,
  game_key text NOT NULL,
  rule_version text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz,
  UNIQUE (game_key, rule_version)
);

CREATE SEQUENCE IF NOT EXISTS sprint_private.sprint_registration_seq AS bigint;

CREATE TABLE IF NOT EXISTS sprint_private.sprint_records (
  id uuid PRIMARY KEY,
  board_id text NOT NULL REFERENCES sprint_private.sprint_boards(id),
  -- Deliberately no FK to attempts: expiry cleanup must never delete a TOP10 record.
  attempt_id uuid NOT NULL UNIQUE,
  participant_hash text NOT NULL CHECK (participant_hash ~ '^[a-f0-9]{64}$'),
  player_name text NOT NULL CHECK (char_length(player_name) BETWEEN 1 AND 16),
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  time_cs integer NOT NULL CHECK (time_cs BETWEEN 1 AND 12000),
  recorded_at timestamptz NOT NULL,
  registration_seq bigint NOT NULL,
  UNIQUE (board_id, participant_hash)
);
CREATE INDEX IF NOT EXISTS sprint_records_ranking_idx
  ON sprint_private.sprint_records(board_id, time_cs, registration_seq, id);

CREATE TABLE IF NOT EXISTS sprint_private.sprint_attempts (
  id uuid PRIMARY KEY,
  board_id text NOT NULL REFERENCES sprint_private.sprint_boards(id),
  participant_hash text NOT NULL CHECK (participant_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  finish_hash text CHECK (finish_hash ~ '^[a-f0-9]{64}$'),
  verified_time_cs integer CHECK (verified_time_cs BETWEEN 1 AND 12000),
  finish_result jsonb,
  registration_hash text CHECK (registration_hash ~ '^[a-f0-9]{64}$'),
  registration_result jsonb,
  consumed_at timestamptz,
  CHECK ((finish_hash IS NULL) = (finish_result IS NULL)),
  CHECK ((registration_hash IS NULL) = (registration_result IS NULL))
);
CREATE INDEX IF NOT EXISTS sprint_attempts_expiry_idx
  ON sprint_private.sprint_attempts(expires_at);

CREATE TABLE IF NOT EXISTS sprint_private.sprint_rate_limits (
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL,
  PRIMARY KEY (subject_hash, action)
);

INSERT INTO sprint_private.sprint_boards(id, game_key, rule_version)
VALUES ('sprint-100m:sprint-v1', 'sprint-100m', 'sprint-v1'),
  ('sprint-100m:sprint-v2', 'sprint-100m', 'sprint-v2')
ON CONFLICT (id) DO NOTHING;

-- This helper is intentionally inaccessible to the runtime role.
CREATE OR REPLACE FUNCTION sprint_private.sprint_snapshot(p_board text)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path = pg_catalog, sprint_private
AS $function$
  SELECT jsonb_build_object(
    'records', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank', ranked.rank, 'playerName', ranked.player_name,
        'countryCode', ranked.country_code, 'timeCs', ranked.time_cs,
        'recordedAt', ranked.recorded_at
      ) ORDER BY ranked.rank)
      FROM (
        SELECT row_number() OVER (ORDER BY time_cs, registration_seq, id) AS rank,
          player_name, country_code, time_cs, recorded_at
        FROM sprint_private.sprint_records WHERE board_id = p_board
        ORDER BY time_cs, registration_seq, id LIMIT 10
      ) ranked
    ), '[]'::jsonb),
    'updatedAt', (SELECT updated_at FROM sprint_private.sprint_boards WHERE id = p_board)
  );
$function$;

CREATE OR REPLACE FUNCTION sprint_private.sprint_get_leaderboard(p_board text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, sprint_private
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sprint_private.sprint_boards WHERE id = p_board AND enabled) THEN
    RETURN jsonb_build_object('status', 'unavailable', 'code', 'not_configured');
  END IF;
  RETURN jsonb_build_object('status', 'ok') || sprint_private.sprint_snapshot(p_board);
END;
$function$;

-- One atomic shared fixed window; caller cannot choose its own window or quota.
CREATE OR REPLACE FUNCTION sprint_private.sprint_take_rate_limit(p_key text, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, sprint_private
AS $function$
DECLARE
  v_limit integer;
  v_seconds integer;
  v_now timestamptz := clock_timestamp();
  v_row sprint_private.sprint_rate_limits%ROWTYPE;
BEGIN
  CASE p_action
    WHEN 'attempts' THEN v_limit := 10; v_seconds := 600;
    WHEN 'finish' THEN v_limit := 20; v_seconds := 600;
    WHEN 'records' THEN v_limit := 20; v_seconds := 600;
    WHEN 'attempts_ip' THEN v_limit := 40; v_seconds := 600;
    WHEN 'finish_ip' THEN v_limit := 80; v_seconds := 600;
    WHEN 'records_ip' THEN v_limit := 80; v_seconds := 600;
    WHEN 'leaderboard' THEN v_limit := 120; v_seconds := 60;
    ELSE RETURN jsonb_build_object('allowed', false, 'retryAfter', 600);
  END CASE;
  IF p_key IS NULL OR p_key !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('allowed', false, 'retryAfter', 600);
  END IF;
  INSERT INTO sprint_private.sprint_rate_limits(subject_hash, action, window_start, request_count)
  VALUES (p_key, p_action, v_now, 1)
  ON CONFLICT (subject_hash, action) DO UPDATE SET
    window_start = CASE WHEN sprint_private.sprint_rate_limits.window_start <= v_now - make_interval(secs => v_seconds)
      THEN v_now ELSE sprint_private.sprint_rate_limits.window_start END,
    request_count = CASE WHEN sprint_private.sprint_rate_limits.window_start <= v_now - make_interval(secs => v_seconds)
      THEN 1 ELSE LEAST(sprint_private.sprint_rate_limits.request_count + 1, v_limit + 1) END
  RETURNING * INTO v_row;
  -- Bounded opportunistic cleanup; nothing is retained as an IP address or cookie.
  DELETE FROM sprint_private.sprint_rate_limits WHERE (subject_hash, action) IN (
    SELECT subject_hash, action FROM sprint_private.sprint_rate_limits
    WHERE window_start < v_now - interval '1 day' LIMIT 100 FOR UPDATE SKIP LOCKED
  );
  RETURN jsonb_build_object('allowed', v_row.request_count <= v_limit,
    'retryAfter', GREATEST(1, ceil(extract(epoch FROM v_row.window_start + make_interval(secs => v_seconds) - v_now))::integer));
END;
$function$;

CREATE OR REPLACE FUNCTION sprint_private.sprint_create_attempt(p_id uuid, p_participant text, p_board text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, sprint_private
AS $function$
DECLARE
  v_board sprint_private.sprint_boards%ROWTYPE;
  v_now timestamptz;
BEGIN
  SELECT * INTO v_board FROM sprint_private.sprint_boards WHERE id = p_board FOR UPDATE;
  IF NOT FOUND OR NOT v_board.enabled THEN
    RETURN jsonb_build_object('status', 'unavailable', 'code', 'not_configured');
  END IF;
  v_now := clock_timestamp();
  INSERT INTO sprint_private.sprint_attempts(id, board_id, participant_hash, created_at, expires_at)
  VALUES (p_id, p_board, p_participant, v_now, v_now + interval '10 minutes');
  DELETE FROM sprint_private.sprint_attempts WHERE id IN (
    SELECT id FROM sprint_private.sprint_attempts
    WHERE expires_at < v_now - interval '24 hours' LIMIT 100 FOR UPDATE SKIP LOCKED
  );
  RETURN jsonb_build_object('attemptId', p_id, 'ruleVersion', v_board.rule_version,
    'expiresAt', v_now + interval '10 minutes');
END;
$function$;

CREATE OR REPLACE FUNCTION sprint_private.sprint_get_attempt(p_id uuid, p_participant text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, sprint_private
AS $function$
DECLARE v_attempt sprint_private.sprint_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM sprint_private.sprint_attempts
  WHERE id = p_id AND participant_hash = p_participant;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'code', 'attempt_not_found'); END IF;
  IF v_attempt.expires_at <= clock_timestamp() AND v_attempt.finish_result IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'attempt_expired');
  END IF;
  RETURN jsonb_build_object('attemptId', v_attempt.id, 'ruleVersion',
    (SELECT rule_version FROM sprint_private.sprint_boards WHERE id = v_attempt.board_id),
    'expiresAt', v_attempt.expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION sprint_private.sprint_finish_attempt(
  p_id uuid, p_participant text, p_input_hash text, p_time_cs integer, p_canonical_ms double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, sprint_private
AS $function$
DECLARE
  v_board text;
  v_attempt sprint_private.sprint_attempts%ROWTYPE;
  v_existing integer;
  v_count integer;
  v_worst integer;
  v_eligible boolean;
  v_result jsonb;
  v_now timestamptz;
BEGIN
  SELECT board_id INTO v_board FROM sprint_private.sprint_attempts
    WHERE id = p_id AND participant_hash = p_participant;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'code', 'attempt_not_found'); END IF;
  -- All mutators acquire board, then attempt. The empty leaderboard is protected too.
  PERFORM 1 FROM sprint_private.sprint_boards WHERE id = v_board AND enabled FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unavailable', 'code', 'not_configured'); END IF;
  SELECT * INTO v_attempt FROM sprint_private.sprint_attempts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'code', 'attempt_not_found'); END IF;
  IF v_attempt.finish_result IS NOT NULL THEN
    IF v_attempt.finish_hash = p_input_hash THEN RETURN v_attempt.finish_result; END IF;
    RETURN jsonb_build_object('status', 'error', 'code', 'attempt_conflict');
  END IF;
  v_now := clock_timestamp();
  IF v_attempt.expires_at <= v_now THEN RETURN jsonb_build_object('status', 'error', 'code', 'attempt_expired'); END IF;
  IF p_canonical_ms IS NULL OR NOT (p_canonical_ms > 0 AND p_canonical_ms <= 120000)
    OR p_time_cs IS NULL OR p_time_cs <> floor(p_canonical_ms / 10 + 0.5)::integer
    OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'invalid_submission');
  END IF;
  IF p_canonical_ms > extract(epoch FROM v_now - v_attempt.created_at) * 1000 + 1500 THEN
    RETURN jsonb_build_object('status', 'error', 'code', 'attempt_too_early');
  END IF;
  SELECT time_cs INTO v_existing FROM sprint_private.sprint_records
    WHERE board_id = v_board AND participant_hash = p_participant;
  SELECT count(*), max(time_cs) INTO v_count, v_worst
    FROM sprint_private.sprint_records WHERE board_id = v_board;
  v_eligible := CASE WHEN v_existing IS NOT NULL THEN p_time_cs < v_existing
    ELSE v_count < 10 OR p_time_cs < v_worst END;
  v_result := jsonb_build_object('status', 'verified', 'attemptId', p_id,
    'timeCs', p_time_cs, 'eligible', v_eligible);
  UPDATE sprint_private.sprint_attempts SET finish_hash = p_input_hash,
    verified_time_cs = p_time_cs, finish_result = v_result WHERE id = p_id;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION sprint_private.sprint_register_record(
  p_id uuid, p_participant text, p_submission_hash text, p_player_name text, p_country_code text)
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
BEGIN
  SELECT board_id INTO v_board FROM sprint_private.sprint_attempts
    WHERE id = p_id AND participant_hash = p_participant;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'code', 'attempt_not_found'); END IF;
  PERFORM 1 FROM sprint_private.sprint_boards WHERE id = v_board AND enabled FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unavailable', 'code', 'not_configured'); END IF;
  SELECT * INTO v_attempt FROM sprint_private.sprint_attempts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'code', 'attempt_not_found'); END IF;
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
    -- Allocate both fields after taking the board lock, including improvements.
    v_now := clock_timestamp();
    v_seq := nextval('sprint_private.sprint_registration_seq'::regclass);
    INSERT INTO sprint_private.sprint_records(id, board_id, attempt_id, participant_hash,
      player_name, country_code, time_cs, recorded_at, registration_seq)
    VALUES (gen_random_uuid(), v_board, p_id, p_participant, p_player_name, p_country_code,
      v_attempt.verified_time_cs, v_now, v_seq)
    ON CONFLICT (board_id, participant_hash) DO UPDATE SET
      attempt_id = EXCLUDED.attempt_id, player_name = EXCLUDED.player_name,
      country_code = EXCLUDED.country_code, time_cs = EXCLUDED.time_cs,
      recorded_at = EXCLUDED.recorded_at, registration_seq = EXCLUDED.registration_seq;
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

REVOKE ALL ON ALL TABLES IN SCHEMA sprint_private FROM PUBLIC, sprint_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sprint_private FROM PUBLIC, sprint_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sprint_private FROM PUBLIC, sprint_runtime;
GRANT EXECUTE ON FUNCTION sprint_private.sprint_get_leaderboard(text),
  sprint_private.sprint_take_rate_limit(text, text),
  sprint_private.sprint_create_attempt(uuid, text, text),
  sprint_private.sprint_get_attempt(uuid, text),
  sprint_private.sprint_finish_attempt(uuid, text, text, integer, double precision),
  sprint_private.sprint_register_record(uuid, text, text, text, text)
TO sprint_runtime;

COMMIT;
