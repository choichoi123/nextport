-- Apply after 20261118-sprint-registration-ips.sql as the dedicated database owner.
-- Only the DB execution time, success flag and confirmed deletion count are kept.
-- No request data, credentials, IP values or exception details enter this history.
-- Reapplying preserves existing history, records and IP expiry policy.
BEGIN;

CREATE TABLE IF NOT EXISTS sprint_private.sprint_ip_cleanup_runs (
  executed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  succeeded boolean NOT NULL,
  deleted_count integer,
  CHECK (
    (succeeded AND deleted_count IS NOT NULL AND deleted_count >= 0)
    OR (NOT succeeded AND deleted_count IS NULL)
  )
);
REVOKE ALL ON TABLE sprint_private.sprint_ip_cleanup_runs FROM PUBLIC, sprint_runtime;

-- Keep the existing zero-argument RPC and its successful public response shape.
CREATE OR REPLACE FUNCTION sprint_private.sprint_purge_registration_ips()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, sprint_private
AS $function$
DECLARE
  v_executed_at timestamptz := clock_timestamp();
  v_succeeded boolean := false;
  v_deleted integer;
BEGIN
  -- This exception block is a subtransaction: a failed purge cannot partly delete IPs.
  BEGIN
    DELETE FROM sprint_private.sprint_record_ips WHERE expires_at <= clock_timestamp();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    -- A failed deletion has no confirmed count. Do not retain SQL/error text.
    v_deleted := NULL;
  END;

  -- Intentionally outside the exception block. If history cannot be stored, fail
  -- the whole RPC transaction, rolling back a successful deletion as well.
  INSERT INTO sprint_private.sprint_ip_cleanup_runs(executed_at, succeeded, deleted_count)
  VALUES (v_executed_at, v_succeeded, v_deleted);

  IF NOT v_succeeded THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'deletedCount', v_deleted);
END;
$function$;

REVOKE ALL ON FUNCTION sprint_private.sprint_purge_registration_ips() FROM PUBLIC, sprint_runtime;
GRANT EXECUTE ON FUNCTION sprint_private.sprint_purge_registration_ips() TO sprint_runtime;

COMMIT;
