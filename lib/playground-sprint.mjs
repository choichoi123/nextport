import { normalizeSprintScore } from './playground-sprint-score.mjs'
import { SPRINT_RULE_VERSION, isSupportedSprintRuleVersion } from './playground-sprint-rules.mjs'

// One simulation is shared by every camera and art style.
export const SPRINT_RULES = Object.freeze({
  distance: 100,
  countdownMs: 4000,
  maxSpeed: 12.2,
  drag: 0.85,
  strideImpulse: 1.9,
  cheerImpulse: 0.6,
  cheerCooldownMs: 350,
  cheerStrideWindowMs: 500,
})

export function createSprintRace(ruleVersion = SPRINT_RULE_VERSION) {
  if (!isSupportedSprintRuleVersion(ruleVersion)) throw new RangeError('Sprint rule version is not supported.')
  return {
    ruleVersion,
    status: 'idle',
    distance: 0,
    speed: 0,
    elapsedMs: 0,
    steps: 0,
    lastFoot: null,
    lastStrideAt: null,
    lastCheerAt: null,
    cheers: 0,
    firstStrideAt: null,
    startedAt: null,
    updatedAt: null,
    countdownEndsAt: null,
    finishTimeMs: null,
  }
}

function validTime(nowMs) {
  return Number.isFinite(nowMs) && nowMs >= 0
}

export function startSprintRace(nowMs, ruleVersion = SPRINT_RULE_VERSION) {
  const race = createSprintRace(ruleVersion)
  if (!validTime(nowMs)) return race
  const gunAt = nowMs + SPRINT_RULES.countdownMs
  return {
    ...race,
    status: 'countdown',
    startedAt: gunAt,
    updatedAt: nowMs,
    countdownEndsAt: gunAt,
  }
}

export function advanceSprintRace(race, nowMs) {
  if (!validTime(nowMs) || nowMs < race.updatedAt || !['countdown', 'running'].includes(race.status)) return race
  if (race.status === 'countdown' && nowMs < race.countdownEndsAt) {
    return nowMs === race.updatedAt ? race : { ...race, updatedAt: nowMs }
  }

  const from = race.status === 'countdown' ? race.countdownEndsAt : race.updatedAt
  const seconds = (nowMs - from) / 1000
  const { drag, distance: finishDistance } = SPRINT_RULES
  // Integrating exponential drag exactly keeps motion independent of RAF rate.
  const movement = race.speed * -Math.expm1(-drag * seconds) / drag
  const remaining = finishDistance - race.distance
  const crossingFraction = remaining * drag / race.speed
  if (race.speed > 0 && crossingFraction < 1 && movement >= remaining) {
    const crossingSeconds = -Math.log1p(-crossingFraction) / drag
    const finishAt = from + crossingSeconds * 1000
    const finishTimeMs = finishAt - race.startedAt
    return {
      ...race,
      status: 'finished',
      distance: finishDistance,
      speed: 0,
      elapsedMs: finishTimeMs,
      updatedAt: finishAt,
      finishTimeMs,
    }
  }

  return {
    ...race,
    status: 'running',
    // Do not round an asymptotic approach into a completed finish.
    distance: Math.min(finishDistance - Number.EPSILON * finishDistance, race.distance + movement),
    speed: race.speed * Math.exp(-drag * seconds),
    elapsedMs: nowMs - race.startedAt,
    updatedAt: nowMs,
  }
}

export function applySprintStride(race, foot, nowMs) {
  if (!['left', 'right'].includes(foot) || !validTime(nowMs) || nowMs < race.updatedAt) return race
  const next = advanceSprintRace(race, nowMs)
  if (next.status !== 'running' || next.lastFoot === foot) return next
  return {
    ...next,
    speed: Math.min(SPRINT_RULES.maxSpeed, next.speed + SPRINT_RULES.strideImpulse),
    steps: next.steps + 1,
    lastFoot: foot,
    lastStrideAt: nowMs,
    // Presentation only: official elapsed time still starts at the gun.
    firstStrideAt: next.firstStrideAt ?? nowMs,
  }
}

/** A small, bounded impulse while alternating strides; presentation/audio is separate. */
export function applySprintCheer(race, nowMs) {
  if (!validTime(nowMs) || nowMs < race.updatedAt) return race
  const next = advanceSprintRace(race, nowMs)
  if (next.ruleVersion !== SPRINT_RULE_VERSION || next.status !== 'running' || next.steps < 2 ||
      !Number.isFinite(next.lastStrideAt) || nowMs - next.lastStrideAt > SPRINT_RULES.cheerStrideWindowMs ||
      (next.lastCheerAt !== null && nowMs - next.lastCheerAt < SPRINT_RULES.cheerCooldownMs)) return next
  const speed = Math.min(SPRINT_RULES.maxSpeed, next.speed + SPRINT_RULES.cheerImpulse)
  // A capped input has no movement effect and is not part of the official input log.
  if (speed <= next.speed) return next
  return { ...next, speed, cheers: next.cheers + 1, lastCheerAt: nowMs }
}

export function interruptSprintRace(race, nowMs) {
  const next = advanceSprintRace(race, nowMs)
  if (!validTime(nowMs) || nowMs < race.updatedAt || !['countdown', 'running'].includes(next.status)) return next
  return { ...next, status: 'interrupted', speed: 0 }
}

export function formatSprintTime(ms) {
  const value = Number.isFinite(ms) ? Math.max(0, ms) : 0
  return value > 0 ? (normalizeSprintScore(value) / 100).toFixed(2) : '0.00'
}
