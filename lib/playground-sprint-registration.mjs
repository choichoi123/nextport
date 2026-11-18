function invalidResponse() {
  throw new Error('invalid_response')
}

function positiveCentiseconds(value) {
  return Number.isSafeInteger(value) && value > 0
}

/** Presentation only: use the confirmed registration outcome before the finish candidate. */
export function getSprintRecordAction(run, registration) {
  if (registration?.status === 'registered') return { labelKey: 'registrationResult', disabled: false }
  if (['not_improved', 'not_qualified'].includes(registration?.status)) return { labelKey: 'recordResult', disabled: false }
  if (registration?.status === 'saving') return { labelKey: 'recordSaving', disabled: true }
  if (run?.status === 'verifying') return { labelKey: 'recordChecking', disabled: true }
  if (run?.status === 'verified') return { labelKey: run.eligible === true ? 'onlineRegister' : 'recordResult', disabled: false }
  return { labelKey: 'register', disabled: false }
}

/** Only server-supplied eligibility metadata can identify this browser's best. */
export function normalizeSprintEligibility(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !positiveCentiseconds(value.timeCs) || value.timeCs > 12000
    || typeof value.eligible !== 'boolean') invalidResponse()
  const hasBest = Object.hasOwn(value, 'personalBestTimeCs')
  const hasReason = Object.hasOwn(value, 'ineligibleReason')
  // An older server or cached finish can lack both fields. Do not infer ownership
  // from the public leaderboard, a nickname, or the best time of this visit.
  if (!hasBest && !hasReason) return { personalBestTimeCs: null, ineligibleReason: null }
  if (!hasBest || !hasReason) invalidResponse()
  const { personalBestTimeCs, ineligibleReason } = value
  if (personalBestTimeCs !== null && (!positiveCentiseconds(personalBestTimeCs) || personalBestTimeCs > 12000)) invalidResponse()
  if (![null, 'not_improved', 'not_qualified'].includes(ineligibleReason)) invalidResponse()
  if (value.eligible) {
    if (ineligibleReason !== null || (personalBestTimeCs !== null && value.timeCs >= personalBestTimeCs)) invalidResponse()
  } else if (ineligibleReason === 'not_improved') {
    if (personalBestTimeCs === null || value.timeCs < personalBestTimeCs) invalidResponse()
  } else if (ineligibleReason !== 'not_qualified' || personalBestTimeCs !== null) invalidResponse()
  return { personalBestTimeCs, ineligibleReason }
}

/** Shared wording for the finish screen and the read-only online result dialog. */
export function getSprintIneligibilityNotice(run, locale = 'ko', registration) {
  if (run?.status !== 'verified') return null
  // Registration rechecks under a lock. A different tab may have improved the
  // record since finish verification; this authenticated result carries our record.
  if (registration?.status === 'not_improved' && positiveCentiseconds(registration.record?.timeCs)) {
    run = { ...run, eligible: false, personalBestTimeCs: registration.record.timeCs, ineligibleReason: 'not_improved' }
  }
  if (run.eligible !== false) return null
  const en = locale === 'en'
  const policy = en
    ? 'One best record is kept for this browser. Changing your nickname does not create a separate participant.'
    : '이 브라우저의 최고 기록 1개만 보관합니다. 닉네임을 바꿔도 같은 참가자로 처리합니다.'
  let metadata
  try { metadata = normalizeSprintEligibility(run) } catch { metadata = { personalBestTimeCs: null, ineligibleReason: null } }
  const { personalBestTimeCs, ineligibleReason } = metadata
  if (ineligibleReason === 'not_improved') {
    const best = (personalBestTimeCs / 100).toFixed(2)
    const current = (run.timeCs / 100).toFixed(2)
    const difference = ((run.timeCs - personalBestTimeCs) / 100).toFixed(2)
    const tied = run.timeCs === personalBestTimeCs
    return {
      title: en ? 'Server verified · existing personal best kept' : '서버 검증 완료 · 기존 개인 최고 유지',
      description: en
        ? tied ? `Your ${current}s finish matches your existing best of ${best}s, so it was not registered again.` : `Your ${current}s finish is ${difference}s slower than your existing best of ${best}s, so it was not registered.`
        : tied ? `이번 기록 ${current}초가 기존 개인 최고 ${best}초와 같아 다시 등록하지 않았습니다.` : `이번 기록 ${current}초가 기존 개인 최고 ${best}초보다 ${difference}초 느려 등록하지 않았습니다.`,
      shortText: en
        ? `Server verified · personal best ${best}s kept (${tied ? 'equal time' : `${difference}s slower`}).`
        : `서버 검증 완료 · 기존 최고 ${best}초 유지 (${tied ? '같은 기록' : `${difference}초 느림`}).`,
      personalBestTimeCs, policy,
    }
  }
  return {
    title: en ? 'Server verified · not registered' : '서버 검증 완료 · 등록 제외',
    description: ineligibleReason === 'not_qualified'
      ? en ? 'This finish does not meet the current TOP10 cutoff. Your finish time and replay are still available.' : '현재 TOP10 진입 기준보다 빠르지 않아 등록되지 않았습니다. 완주 기록과 리플레이는 그대로 확인할 수 있습니다.'
      : en ? 'The server excluded this finish from registration based on your existing best and the current TOP10 criteria.' : '서버가 기존 최고 기록과 현재 TOP10 기준에 따라 이번 기록을 등록 대상에서 제외했습니다.',
    shortText: en ? 'Server verified · this finish was not registered.' : '서버 검증 완료 · 이번 기록은 등록되지 않았습니다.',
    personalBestTimeCs: null, policy,
  }
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
