import { SPRINT_RULES } from './playground-sprint.mjs'

export const SPRINT_START_TIMING = Object.freeze({
  standingMs: 1000,
  loweringMs: 650,
  setStartsAtMs: 2700,
  countdownMs: SPRINT_RULES.countdownMs,
  launchMs: 220,
})

const OFF = Object.freeze({ active: false, phase: 'off', frame: null, count: null, label: null, elapsedMs: null, progress: 0 })

function sample(phase, frame, elapsedMs, progress, count = null, label = null) {
  return { active: true, phase, frame, count, label, elapsedMs, progress }
}

/** Read preparation/first-stride presentation without advancing a race or score. */
export function getSprintStartSample(race) {
  if (!race || typeof race !== 'object') return { ...OFF }
  const timing = SPRINT_START_TIMING
  if (race.status === 'countdown') {
    if (!Number.isFinite(race.countdownEndsAt) || !Number.isFinite(race.updatedAt)) return { ...OFF }
    const elapsedMs = race.updatedAt - race.countdownEndsAt + timing.countdownMs
    if (elapsedMs < 0 || elapsedMs >= timing.countdownMs) return { ...OFF }
    if (elapsedMs < timing.standingMs) return sample('standing', null, elapsedMs, elapsedMs / timing.standingMs)
    const count = Math.ceil((timing.countdownMs - elapsedMs) / 1000)
    const label = 'ON YOUR MARK'
    const loweringEndsAt = timing.standingMs + timing.loweringMs
    if (elapsedMs < loweringEndsAt) {
      const progress = (elapsedMs - timing.standingMs) / timing.loweringMs
      return sample('lowering', Math.min(3, Math.floor(progress * 4)), elapsedMs, progress, count, label)
    }
    if (elapsedMs < timing.setStartsAtMs) {
      return sample('crouch', 4, elapsedMs, (elapsedMs - loweringEndsAt) / (timing.setStartsAtMs - loweringEndsAt), count, label)
    }
    return sample('set', 5, elapsedMs, (elapsedMs - timing.setStartsAtMs) / (timing.countdownMs - timing.setStartsAtMs), count, label)
  }
  if (race.status !== 'running' || !Number.isFinite(race.elapsedMs) || race.elapsedMs < 0) return { ...OFF }
  const label = race.elapsedMs < timing.launchMs ? 'GO' : null
  if (race.firstStrideAt === null && race.steps === 0) return sample('set', 5, race.elapsedMs, 1, null, label)
  // Legacy/virtual snapshots without the new presentation field keep running.
  if (!Number.isFinite(race.firstStrideAt) || !Number.isFinite(race.updatedAt)) return { ...OFF }
  const elapsedMs = race.updatedAt - race.firstStrideAt
  if (elapsedMs < 0 || elapsedMs >= timing.launchMs) return { ...OFF }
  return sample('launch', elapsedMs < timing.launchMs / 2 ? 6 : 7, elapsedMs, elapsedMs / timing.launchMs, null, label)
}
