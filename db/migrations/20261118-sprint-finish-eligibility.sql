-- Apply as the database owner after the base installation.
-- Explain the existing finish eligibility decision without changing record policy.
-- Cached finish results and registration functions remain unchanged.
BEGIN;

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
    'timeCs', p_time_cs, 'eligible', v_eligible,
    'personalBestTimeCs', v_existing,
    'ineligibleReason', CASE WHEN v_eligible THEN NULL
      WHEN v_existing IS NOT NULL THEN 'not_improved' ELSE 'not_qualified' END);
  UPDATE sprint_private.sprint_attempts SET finish_hash = p_input_hash,
    verified_time_cs = p_time_cs, finish_result = v_result WHERE id = p_id;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION sprint_private.sprint_finish_attempt(uuid, text, text, integer, double precision)
FROM PUBLIC, sprint_runtime;
GRANT EXECUTE ON FUNCTION sprint_private.sprint_finish_attempt(uuid, text, text, integer, double precision)
TO sprint_runtime;

COMMIT;
