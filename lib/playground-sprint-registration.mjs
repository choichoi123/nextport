function invalidResponse() {
  throw new Error('invalid_response')
}

function positiveCentiseconds(value) {
  return Number.isSafeInteger(value) && value > 0
}

/** A server-confirmed result only; never infer a historical record from TOP10 rank. */
export function normalizeSprintWorldRecord(value, { registrationStatus, timeCs } = {}) {
  // Older, already cached registrations have no historical-record classification.
  if (value === undefined || value === null) return null
  if (registrationStatus !== 'registered' || typeof value !== 'object' || Array.isArray(value)
    || !['first', 'broken', 'tied', 'unchanged'].includes(value.status)
    || !positiveCentiseconds(value.timeCs) || value.timeCs !== timeCs
    || !Number.isSafeInteger(value.improvementCs) || value.improvementCs < 0) invalidResponse()

  const { status, previousTimeCs, improvementCs } = value
  if (status === 'first') {
    if (previousTimeCs !== null || improvementCs !== 0) invalidResponse()
  } else {
    if (!positiveCentiseconds(previousTimeCs)) invalidResponse()
    if (status === 'broken' && (previousTimeCs <= timeCs || improvementCs !== previousTimeCs - timeCs)) invalidResponse()
    if (status === 'tied' && (previousTimeCs !== timeCs || improvementCs !== 0)) invalidResponse()
    if (status === 'unchanged' && (previousTimeCs >= timeCs || improvementCs !== 0)) invalidResponse()
  }
  return { status, timeCs, previousTimeCs, improvementCs }
}

function publicRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || !Number.isInteger(record.rank) || record.rank < 1 || record.rank > 10
    || typeof record.playerName !== 'string' || typeof record.countryCode !== 'string'
    || !positiveCentiseconds(record.timeCs) || typeof record.recordedAt !== 'string'
    || !Number.isFinite(Date.parse(record.recordedAt))) invalidResponse()
  const { rank, playerName, countryCode, timeCs, recordedAt } = record
  return { rank, playerName, countryCode, timeCs, recordedAt }
}

export function normalizeSprintPublicRecords(records) {
  if (!Array.isArray(records) || records.length > 10) invalidResponse()
  return records.map(publicRecord)
}

/** Validate before updating client state, and retain only fields used by the UI. */
export function normalizeSprintRegistrationResult(data) {
  if (!data || !['registered', 'not_qualified', 'not_improved'].includes(data.status)) invalidResponse()
  const records = normalizeSprintPublicRecords(data.records)
  const record = data.record === undefined || data.record === null ? null : publicRecord(data.record)
  if (data.status === 'registered' && !record) invalidResponse()
  const worldRecord = normalizeSprintWorldRecord(data.worldRecord, { registrationStatus: data.status, timeCs: record?.timeCs })
  const updatedAt = typeof data.updatedAt === 'string' && Number.isFinite(Date.parse(data.updatedAt)) ? data.updatedAt : null
  return { status: data.status, record, records, updatedAt, worldRecord }
}
