// The stored pitch mode preserves the original count/ledger policy for older saves.
// Only v2 requires pinned growth.
import { BASEBALL_RULES } from './playground-baseball.mjs'
import { validateBaseballGrowthSnapshot } from './playground-baseball-growth.mjs'
import { createBaseballPracticePitch, isBaseballAtBatPitchMode, selectBaseballAtBatPitchType } from './playground-baseball-practice-pitches.mjs'

// A local practice state machine. It consumes engine results, not browser time,
// server receipts, identity or career rewards.
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
const clone = value => JSON.parse(JSON.stringify(value))
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const hands = new Set(['left', 'right'])
const sources = new Set(['manual', 'automatic', 'development'])
const fieldOutcomes = new Set(['single', 'double', 'triple', 'home-run', 'flyout', 'lineout', 'groundout'])
const engineOutcomes = new Set(['ball', 'called-strike', 'miss', 'foul', 'contact', 'perfect'])
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value)
const finite = value => typeof value === 'number' && Number.isFinite(value)
const uint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(value)
const zeroStats = () => ({ PA:0, AB:0, H:0, '2B':0, '3B':0, HR:0, BB:0, SO:0 })

export const BASEBALL_AT_BAT_RULES = freeze({
  id:'baseball-at-bat-v2',
  pitchPolicyId:'baseball-at-bat-pitches-v2',
  ballsToWalk:4,
  strikesToOut:3,
  policy:{ strikeChance:0.60, perBall:0.035, perStrike:-0.04, minimumStrikeChance:0.45, maximumStrikeChance:0.74 },
})

function statistics(outcome) {
  const stats = zeroStats()
  if (!outcome) return stats
  stats.PA = 1
  if (outcome === 'walk') stats.BB = 1
  else {
    stats.AB = 1
    if (outcome.startsWith('strikeout-')) stats.SO = 1
    else if (['single', 'double', 'triple', 'home-run'].includes(outcome)) {
      stats.H = 1
      if (outcome === 'double') stats['2B'] = 1
      if (outcome === 'triple') stats['3B'] = 1
      if (outcome === 'home-run') stats.HR = 1
    }
  }
  return stats
}

function validateState(state) {
  validateBaseballGrowthSnapshot(state?.growthSnapshot)
  if (!object(state) || !validId(state.id) || !hands.has(state.handedness) || !hands.has(state.pitcherHandedness)
    || !uint32(state.seed) || !isBaseballAtBatPitchMode(state.pitchMode) || !finite(state.baseSpeedKmh)
    || state.baseSpeedKmh < BASEBALL_RULES.minimumSpeedKmh || state.baseSpeedKmh > BASEBALL_RULES.maximumSpeedKmh
    || state.rulesVersion !== BASEBALL_AT_BAT_RULES.id || state.pitchPolicyVersion !== BASEBALL_AT_BAT_RULES.pitchPolicyId
    || !Number.isSafeInteger(state.pitchCount) || state.pitchCount < 0 || !Array.isArray(state.history) || state.history.length !== state.pitchCount
    || !Number.isInteger(state.balls) || !Number.isInteger(state.strikes)
    || !['active', 'complete'].includes(state.status)) throw new TypeError('Invalid at-bat state.')
  const complete = state.status === 'complete'
  if (state.balls < 0 || state.balls > (complete ? 4 : 3) || state.strikes < 0 || state.strikes > (complete ? 3 : 2)
    || (!complete && state.outcome !== null)
    || (complete && !['walk', 'strikeout-looking', 'strikeout-swinging', ...fieldOutcomes].includes(state.outcome))
    || (state.balls === 4 && state.outcome !== 'walk') || (state.outcome === 'walk' && state.balls !== 4)
    || (state.strikes === 3 && !state.outcome?.startsWith('strikeout-'))
    || (state.outcome?.startsWith('strikeout-') && state.strikes !== 3)
    || canonical(state.stats) !== canonical(statistics(state.outcome))) throw new TypeError('Invalid at-bat count or result.')
}

export function createBaseballAtBat({ id = 'local-at-bat', handedness = 'right', pitcherHandedness = 'right', baseSpeedKmh = 120, pitchMode = 'mixed', seed = 1, growthSnapshot } = {}) {
  validateBaseballGrowthSnapshot(growthSnapshot)
  const state = { id, handedness, pitcherHandedness, baseSpeedKmh, pitchMode, seed, growthSnapshot:clone(growthSnapshot),
    rulesVersion:BASEBALL_AT_BAT_RULES.id, pitchPolicyVersion:BASEBALL_AT_BAT_RULES.pitchPolicyId,
    balls:0, strikes:0, pitchCount:0, status:'active', outcome:null, history:[], stats:zeroStats() }
  validateState(state)
  return freeze(state)
}

function mix(value) {
  let seed = value >>> 0
  seed = Math.imul(seed ^ seed >>> 16, 0x21f0aaad)
  seed = Math.imul(seed ^ seed >>> 15, 0x735a2d97)
  return (seed ^ seed >>> 15) >>> 0
}
const unit = seed => mix(seed) / 0x100000000
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))

/** Repeated preparation after a pause returns this same logical pitch. */
export function nextBaseballAtBatPitch(state) {
  validateState(state)
  if (state.status === 'complete') return null
  const number = state.pitchCount + 1
  const seed = mix(state.seed ^ Math.imul(number, 0x9e3779b9) ^ state.balls * 0x10001 ^ state.strikes * 0x1000001)
  const policy = BASEBALL_AT_BAT_RULES.policy
  const strikeChance = clamp(policy.strikeChance + state.balls * policy.perBall + state.strikes * policy.perStrike,
    policy.minimumStrikeChance, policy.maximumStrikeChance)
  const zone = BASEBALL_RULES.zone
  const x = unit(seed ^ 0xa511e9b3), y = unit(seed ^ 0x6d2b79f5)
  let target
  if (unit(seed ^ 0xb5297a4d) < strikeChance) {
    target = { x:zone.left + 0.02 + x * (zone.right - zone.left - 0.04), y:zone.bottom + 0.02 + y * (zone.top - zone.bottom - 0.04) }
  } else {
    const side = Math.floor(unit(seed ^ 0x68e31da4) * 4)
    target = side < 2
      ? { x:(side === 0 ? zone.left - 0.055 - x * 0.15 : zone.right + 0.055 + x * 0.15), y:zone.bottom + y * (zone.top - zone.bottom) }
      : { x:zone.left + x * (zone.right - zone.left), y:side === 2 ? zone.bottom - 0.055 - y * 0.17 : zone.top + 0.055 + y * 0.24 }
  }
  const fastballShare = clamp(0.45 + state.balls * 0.035 - state.strikes * 0.025, 0.35, 0.58)
  const pitchType = selectBaseballAtBatPitchType(state.pitchMode, unit(seed ^ 0x1b56c4e9), fastballShare)
  const pitch = createBaseballPracticePitch({ seed, target, pitcherHandedness:state.pitcherHandedness, pitchType,
    baseSpeedKmh:state.baseSpeedKmh })
  return freeze({ pitchId:`${state.id}:pitch:${number}`, number, index:number - 1, pitch })
}

function validJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(validJson)
  return object(value) && Object.values(value).every(validJson)
}
function eventValue({ pitchId, pitch, result, fieldResult = null, source = 'manual' }) {
  if (typeof pitchId !== 'string' || !object(pitch) || !object(result) || !validJson(pitch) || !validJson(result)
    || !engineOutcomes.has(result.outcome) || typeof result.contacted !== 'boolean' || !sources.has(source)) throw new TypeError('Invalid pitch event.')
  const contact = ['foul', 'contact', 'perfect'].includes(result.outcome)
  const fair = ['contact', 'perfect'].includes(result.outcome)
  if (result.contacted !== contact) throw new TypeError('Pitch contact and result disagree.')
  if (fair ? !object(fieldResult) || !fieldOutcomes.has(fieldResult.outcome) || !validJson(fieldResult) : fieldResult !== null) {
    throw new TypeError('A fair ball needs a resolved field result, and other pitches must not have one.')
  }
  const recordedResult = clone(result)
  if (pitch.practiceType) recordedResult.pitchType = pitch.practiceType
  return { pitchId, pitch:clone(pitch), result:recordedResult, fieldResult:clone(fieldResult), source }
}

/** Only an accepted completed pitch changes a count; pauses do not call this. */
export function resolveBaseballAtBatPitch(state, options = {}) {
  validateState(state)
  const event = eventValue(options)
  const previous = state.history.find(row => row.pitchId === event.pitchId)
  if (previous) {
    const accepted = { pitchId:previous.pitchId, pitch:previous.pitch, result:previous.result, fieldResult:previous.fieldResult, source:previous.source }
    if (canonical(accepted) !== canonical(event)) throw new Error('Conflicting result for an already resolved pitch.')
    return state
  }
  const expected = nextBaseballAtBatPitch(state)
  if (!expected || expected.pitchId !== event.pitchId || canonical(expected.pitch) !== canonical(event.pitch)) throw new Error('Pitch is not the next issued pitch.')
  let balls = state.balls, strikes = state.strikes, outcome = null
  switch (event.result.outcome) {
    case 'ball': balls += 1; if (balls === 4) outcome = 'walk'; break
    case 'called-strike': strikes += 1; if (strikes === 3) outcome = 'strikeout-looking'; break
    case 'miss': strikes += 1; if (strikes === 3) outcome = 'strikeout-swinging'; break
    case 'foul': strikes = Math.min(2, strikes + 1); break
    default: outcome = event.fieldResult.outcome
  }
  const next = { ...state, balls, strikes, pitchCount:state.pitchCount + 1, status:outcome ? 'complete' : 'active', outcome,
    history:[...state.history, { ...event, number:expected.number, index:expected.index,
      countBefore:{ balls:state.balls, strikes:state.strikes }, countAfter:{ balls, strikes }, terminalOutcome:outcome }],
    stats:statistics(outcome) }
  validateState(next)
  return freeze(next)
}
