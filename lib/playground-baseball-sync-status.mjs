// 공개 가능한 고정 오류 코드만 표시한다. 원문 오류/응답/저널은 반환하지 않는다.
const groups = Object.freeze({
  version_mismatch:'version', result_mismatch:'result',
  invalid_submission:'format', invalid_snapshot:'format', local_data_invalid:'format',
  local_conflict:'conflict', stale_revision:'conflict', session_conflict:'conflict',
  network_unavailable:'network', not_configured:'configuration', database_unavailable:'server',
  storage_unavailable:'local', storage_full:'capacity', local_capacity:'capacity',
  body_too_large:'request-capacity', invalid_response:'receipt',
  invalid_pitch:'pitch', rate_limited:'limited', verification_unavailable:'verification',
})

export function getBaseballSyncDiagnostic(persistence) {
  const rawCode = persistence?.code
  const known = typeof rawCode === 'string' && Object.hasOwn(groups,rawCode)
  const code = known ? rawCode : rawCode === null || rawCode === undefined ? null : 'unknown'
  let kind
  if (!persistence || persistence.state === 'loading') kind = 'loading'
  else if (persistence.sync === 'syncing') kind = 'syncing'
  else if (known) kind = groups[code]
  else if (code === 'unknown' || persistence.sync === 'error') kind = 'unknown'
  else if (persistence.state === 'capacity') kind = 'capacity'
  else if (persistence.state === 'unavailable') kind = 'local'
  else kind = 'ready'
  return Object.freeze({code,kind})
}
