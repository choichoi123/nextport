import {
  startSprintRace,
  advanceSprintRace,
  applySprintStride,
  applySprintCheer,
} from './playground-sprint.mjs'
import { SPRINT_RULE_VERSION, LEGACY_SPRINT_RULE_VERSION, isSupportedSprintRuleVersion } from './playground-sprint-rules.mjs'
import { normalizeSprintScore } from './playground-sprint-score.mjs'

export { SPRINT_RULE_VERSION }
export { normalizeSprintScore }

const MAX_EVENTS = 4096
const MAX_RUN_MS = 120000
const FINISH_TOLERANCE_MS = 1
// sprint-v1 finish hashes include the exact canonical double, so keep the old
// arithmetic origin even when the client's presentation countdown gets longer.
const SPRINT_V1_SIMULATION_GUN_MS = 3000
const SPRINT_V2_SIMULATION_GUN_MS = 4000

function invalidRun(message) {
  const error = new Error(message)
  error.code = 'invalid_run'
  return error
}

/**
 * Replay valid input events with the shared engine, independently of the claimed score.
 * This checks a run's consistency; it cannot distinguish human and synthetic input.
 */
export function validateSprintSubmission(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidRun('A completed run is required.')
  const { events, finishTimeMs, ruleVersion = SPRINT_RULE_VERSION } = input
  if (!isSupportedSprintRuleVersion(ruleVersion)) {
    const error = new Error('Sprint rule version is not supported.')
    error.code = 'invalid_rule'
    throw error
  }
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS) {
    throw invalidRun('A run must contain between 1 and 4096 strides.')
  }
  if (!Number.isFinite(finishTimeMs) || finishTimeMs <= 0 || finishTimeMs > MAX_RUN_MS) {
    throw invalidRun('Finish time must be positive, finite, and at most 120 seconds.')
  }

  const gunAt = ruleVersion === LEGACY_SPRINT_RULE_VERSION ? SPRINT_V1_SIMULATION_GUN_MS : SPRINT_V2_SIMULATION_GUN_MS
  const prepared = { ...startSprintRace(0, ruleVersion), startedAt: gunAt, countdownEndsAt: gunAt }
  let race = advanceSprintRace(prepared, gunAt)
  let previousAt = 0
  let previousFoot = null
  const normalizedEvents = []

  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw invalidRun('Each event must identify a stride or cheer.')
    }
    const cheer = ruleVersion !== LEGACY_SPRINT_RULE_VERSION && event.action === 'cheer' && event.foot === undefined
    const stride = ['left', 'right'].includes(event.foot) &&
      (ruleVersion === LEGACY_SPRINT_RULE_VERSION || event.action === undefined)
    if (!cheer && !stride) throw invalidRun('Each event must identify a stride or cheer.')
    if (!Number.isFinite(event.atMs) || event.atMs < previousAt || event.atMs > MAX_RUN_MS || event.atMs >= finishTimeMs) {
      throw invalidRun('Stride times must be finite, ordered, and before the finish within 120 seconds of the start.')
    }
    if (stride && event.foot === previousFoot) throw invalidRun('Strides must alternate feet.')

    // sprint-v1 deliberately allows alternating strides at the same timestamp.
    const next = cheer ? applySprintCheer(race, gunAt + event.atMs) : applySprintStride(race, event.foot, gunAt + event.atMs)
    if (next.status !== 'running' || (cheer ? next.cheers !== race.cheers + 1 : next.steps !== race.steps + 1)) {
      throw invalidRun('The run contains an invalid event or an event at or after the finish.')
    }
    const atMs = event.atMs === 0 ? 0 : event.atMs
    normalizedEvents.push(Object.freeze(cheer ? { atMs, action: 'cheer' } : { atMs, foot: event.foot }))
    previousAt = atMs
    if (stride) previousFoot = event.foot
    race = next
  }

  // The submitted finish time never drives the simulation or the stored score.
  const finish = advanceSprintRace(race, gunAt + MAX_RUN_MS)
  const canonicalTimeMs = finish.finishTimeMs
  if (finish.status !== 'finished' || !Number.isFinite(canonicalTimeMs) || canonicalTimeMs <= 0 ||
      canonicalTimeMs > MAX_RUN_MS || previousAt >= canonicalTimeMs ||
      Math.abs(canonicalTimeMs - finishTimeMs) > FINISH_TOLERANCE_MS) {
    throw invalidRun('Finish time does not match a completed run.')
  }

  return {
    timeCs: normalizeSprintScore(canonicalTimeMs),
    canonicalTimeMs,
    normalizedEvents: Object.freeze(normalizedEvents),
  }
}
