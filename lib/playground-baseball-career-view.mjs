// Ephemeral navigation only. Storage, requests, audio and game rules stay with
// their existing owners; accepting a checkpoint never implies reopening a view.
const tabs = new Set(['home', 'schedule', 'records', 'player'])
const id = value => typeof value === 'string' && value.length > 0 && value.trim() === value
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const revision = value => Number.isSafeInteger(value) && value >= 1
const freeze = value => Object.freeze({ ...value, intent: value.intent ? Object.freeze({ ...value.intent }) : null })
const validView = value => object(value) && ['manage', 'prepare', 'batting'].includes(value.view)
  && tabs.has(value.tab) && (value.careerId === null || id(value.careerId))
  && (value.atBatId === null || id(value.atBatId)) && Number.isSafeInteger(value.epoch) && value.epoch >= 0
const next = (state, values) => state.epoch < Number.MAX_SAFE_INTEGER
  ? freeze({ ...state, ...values, epoch: state.epoch + 1 }) : state
const sameIntent = (state, action) => Boolean(state.intent && action.epoch === state.intent.epoch
  && action.careerId === state.intent.careerId && action.careerId === state.careerId)

export function createBaseballCareerView({ careerId = null } = {}) {
  return freeze({ view: 'manage', tab: 'home', careerId: id(careerId) ? careerId : null,
    atBatId: null, epoch: 0, intent: null })
}

/**
 * request-manual: {type, atBatId:null|existingId}; caller reads next.intent before
 * awaiting. manual-ready: {type, epoch:intent.epoch, careerId, atBatId:session.id}.
 * A cancelled request may still save successfully; only its view intent expires.
 */
export function reduceBaseballCareerView(state, action) {
  if (!validView(state) || !object(action)) return state
  switch (action.type) {
    case 'select-career':
      if (action.careerId !== null && !id(action.careerId)) return state
      return next(state, { view: 'manage', tab: 'home', careerId: action.careerId, atBatId: null, intent: null })
    case 'manage':
      if (action.tab !== undefined && !tabs.has(action.tab)) return state
      return next(state, { view: 'manage', tab: action.tab ?? state.tab, intent: null })
    case 'prepare':
      if (!state.careerId || state.view === 'prepare') return state
      return next(state, { view: 'prepare', intent: null })
    case 'request-manual': {
      if (!state.careerId || state.view !== 'prepare' || state.intent
        || (action.atBatId !== null && !id(action.atBatId)) || state.epoch === Number.MAX_SAFE_INTEGER) return state
      const epoch = state.epoch + 1
      return freeze({ ...state, epoch, intent: { epoch, careerId: state.careerId, atBatId: action.atBatId } })
    }
    case 'manual-ready':
      if (state.view !== 'prepare' || !sameIntent(state, action) || !id(action.atBatId)
        || (state.intent.atBatId !== null && state.intent.atBatId !== action.atBatId)) return state
      return freeze({ ...state, view: 'batting', atBatId: action.atBatId, intent: null })
    case 'manual-failed':
      return sameIntent(state, action) ? next(state, { intent: null }) : state
    case 'cancel':
      return next(state, { view: 'manage', intent: null })
    default:
      return state
  }
}

/** Reuse this ID and adapter; a resume is not a start-manual command. */
export function getBaseballCareerResumeId(career) {
  return career?.status === 'active' && id(career.activeAtBat?.id) ? career.activeAtBat.id : null
}

const sameStats = (left, right) => {
  if (!object(left) || !object(right)) return false
  const keys = Object.keys(left)
  return keys.length > 0 && keys.length === Object.keys(right).length && keys.every(key =>
    Number.isSafeInteger(left[key]) && left[key] >= 0 && left[key] === right[key])
}
const appearanceFor = (career, atBatId) => {
  if (!Array.isArray(career?.games)) return null
  const rows = career.games.flatMap(game => Array.isArray(game?.appearances) ? game.appearances : [])
    .filter(row => row?.id === atBatId)
  return rows.length === 1 ? rows[0] : null
}

/**
 * Presentation guard for already validated checkpoints, not a replacement for
 * engine/server validation. Both latest session and enclosing career must agree.
 */
export function selectBaseballCareerCompletedAppearance({ career, atBatId, session } = {}) {
  if (!id(career?.id) || !id(atBatId) || career.activeAtBat !== null || session?.id !== atBatId
    || !revision(session.revision) || session.state?.status !== 'complete') return null
  const receipt = session.finalReceipt, row = appearanceFor(career, atBatId)
  if (!row || receipt?.id !== `${atBatId}:final` || receipt.revision !== session.revision
    || typeof receipt.completedAt !== 'string' || receipt.completedAt !== session.updatedAt
    || receipt.completedAt !== row.finishedAt || !id(session.state.outcome)
    || receipt.outcome !== session.state.outcome || row.outcome !== receipt.outcome
    || row.pitchCount !== session.state.pitchCount || !sameStats(session.state.stats, receipt.stats)
    || !sameStats(row.stats, receipt.stats)) return null
  return row
}

/** Reject callbacks from an old child, older session revision or another PA. */
export function isBaseballCareerSessionCurrent({ career, atBatId, currentSession = null, nextSession } = {}) {
  if (!id(career?.id) || !id(atBatId) || nextSession?.id !== atBatId || !revision(nextSession.revision)
    || !['active', 'complete'].includes(nextSession.state?.status)) return false
  if (currentSession !== null && (currentSession?.id !== atBatId || !revision(currentSession.revision)
    || nextSession.revision < currentSession.revision
    || (currentSession.state?.status === 'complete' && nextSession.state.status !== 'complete'))) return false
  if (career.activeAtBat !== null) return getBaseballCareerResumeId(career) === atBatId
  return selectBaseballCareerCompletedAppearance({ career, atBatId, session: nextSession }) !== null
}
