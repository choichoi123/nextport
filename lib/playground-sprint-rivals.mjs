import { SPRINT_TRACK } from './playground-sprint-track.mjs'

// Cosmetic, deterministic opponents. These samples never advance the player's
// race, create input events, or participate in the official score validation.
export const SPRINT_RIVAL_VERSION = 'ghost-v3'
export const SPRINT_RACE_MODES = Object.freeze(['solo', 'competition'])
export const SPRINT_RIVALS = Object.freeze([
  Object.freeze({ id: 'rival-1', nameKey: 'rival1', lane: 0, acceleration: 3, maxSpeed: 10.2 }),
  Object.freeze({ id: 'rival-2', nameKey: 'rival2', lane: 1, acceleration: 3, maxSpeed: 10.6 }),
  Object.freeze({ id: 'rival-3', nameKey: 'rival3', lane: 3, acceleration: 3, maxSpeed: 11.0 }),
  Object.freeze({ id: 'rival-4', nameKey: 'rival4', lane: 4, acceleration: 3, maxSpeed: 11.4 }),
  Object.freeze({ id: 'rival-5', nameKey: 'rival5', lane: 5, acceleration: 3, maxSpeed: 11.8 }),
])
export const SPRINT_BOSS_PROFILE = Object.freeze({
  id: 'lusain-volt', nameKey: 'lusainVolt', isBoss: true,
  lane: 5, acceleration: 2.5, maxSpeed: 11.9,
})

const DISTANCE = 100
const STATUSES = new Set(['idle', 'countdown', 'running', 'finished', 'interrupted'])
const MAX_SEED = 0xffffffff
const MAX_CACHED_FIELDS = 32

/** Zero preserves the original fixed field and older in-memory replays. */
export function normalizeSprintRivalSeed(seed) {
  return Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED ? seed >>> 0 : 0
}

/** Call once when a race is created; rendering and replay never draw entropy. */
export function createSprintRivalSeed(randomValue = Math.random()) {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) return 0
  return Math.floor(randomValue * MAX_SEED) + 1
}

export function isSprintRaceMode(mode) {
  return mode === 'solo' || mode === 'competition'
}

/** Keep the six race lanes together when the eight-lane top view shifts the player. */
export function getSprintRivalLane(lane, view = 'side') {
  if (!SPRINT_RIVALS.some(rival => rival.lane === lane) || (view !== 'side' && view !== 'top')) return null
  return lane + SPRINT_TRACK[view].activeLane - SPRINT_TRACK.side.activeLane
}

function positiveTime(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function travel(profile, seconds) {
  return profile.maxSpeed * (seconds + Math.expm1(-profile.acceleration * seconds) / profile.acceleration)
}

function finishTime(profile) {
  let low = 0
  let high = DISTANCE / profile.maxSpeed + 1 / profile.acceleration
  // The upper bound is already past 100m. Fixed bisection is independent of
  // the browser's frame rate and of the order in which a replay is sampled.
  for (let step = 0; step < 64; step += 1) {
    const middle = (low + high) / 2
    if (travel(profile, middle) < DISTANCE) low = middle
    else high = middle
  }
  return high * 1000
}

const FIXED_FIELD = Object.freeze(SPRINT_RIVALS.map(profile => Object.freeze({ profile, finishTimeMs: finishTime(profile) })))
const FIXED_BOSS_FIELD = Object.freeze(FIXED_FIELD.map(entry => entry.profile.lane === SPRINT_BOSS_PROFILE.lane
  ? Object.freeze({ profile: SPRINT_BOSS_PROFILE, finishTimeMs: finishTime(SPRINT_BOSS_PROFILE) })
  : entry))
const fieldCache = new Map()

function seededRandom(seed) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ state >>> 15, state | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 0x100000000
  }
}

function rivalField(seed, bossEncounter = false) {
  const normalized = normalizeSprintRivalSeed(seed)
  const boss = bossEncounter === true
  const key = `${normalized}:${boss ? 'boss' : 'ordinary'}`
  if (!normalized) return boss ? FIXED_BOSS_FIELD : FIXED_FIELD
  if (fieldCache.has(key)) {
    const field = fieldCache.get(key)
    fieldCache.delete(key)
    fieldCache.set(key, field)
    return field
  }
  const random = seededRandom(normalized)
  // Modest per-run changes allow neighboring lane strengths to cross. The
  // curves remain fixed throughout the race, including slow-motion replays.
  const field = Object.freeze(SPRINT_RIVALS.map(base => {
    // Draw the ordinary lane's entropy even when the boss replaces it, so the
    // remaining four runners are identical for the same seed in both modes.
    const speedOffset = (random() - .5) * .84
    const accelerationOffset = (random() - .5) * .7
    const isBoss = boss && base.lane === SPRINT_BOSS_PROFILE.lane
    const profile = Object.freeze({
      ...(isBoss ? SPRINT_BOSS_PROFILE : base),
      maxSpeed: isBoss ? SPRINT_BOSS_PROFILE.maxSpeed + speedOffset / 7 : base.maxSpeed + speedOffset,
      acceleration: isBoss ? SPRINT_BOSS_PROFILE.acceleration + accelerationOffset * (6 / 35) : base.acceleration + accelerationOffset,
    })
    return Object.freeze({ profile, finishTimeMs: finishTime(profile) })
  }))
  fieldCache.set(key, field)
  if (fieldCache.size > MAX_CACHED_FIELDS) fieldCache.delete(fieldCache.keys().next().value)
  return field
}

function raceClock(race) {
  const status = STATUSES.has(race?.status) ? race.status : 'idle'
  if (status === 'idle' || status === 'countdown') return { status, elapsedMs: 0 }
  const elapsedMs = status === 'finished' && Number.isFinite(race.finishTimeMs) && race.finishTimeMs >= 0
    ? race.finishTimeMs
    : positiveTime(race?.elapsedMs)
  return { status, elapsedMs }
}

/** Seeded pace curves share only the race clock, never the player's progress. */
export function getSprintRivals(race, mode = 'solo', seed = 0, bossEncounter = false) {
  if (mode !== 'competition') return []
  const clock = raceClock(race)
  return rivalField(seed, bossEncounter).map(({ profile, finishTimeMs }) => {
    const finished = clock.elapsedMs >= finishTimeMs
    const atMs = Math.min(clock.elapsedMs, finishTimeMs)
    const seconds = atMs / 1000
    const stopped = clock.status === 'idle' || clock.status === 'countdown' || clock.status === 'interrupted'
    return {
      id: profile.id,
      nameKey: profile.nameKey,
      ...(profile.isBoss ? { isBoss: true } : {}),
      lane: profile.lane,
      distance: finished ? DISTANCE : Math.max(0, Math.min(DISTANCE, travel(profile, seconds))),
      speed: finished || stopped ? 0 : profile.maxSpeed * -Math.expm1(-profile.acceleration * seconds),
      status: finished ? 'finished' : clock.status === 'finished' ? 'running' : clock.status,
      elapsedMs: atMs,
      finishTimeMs: finished ? finishTimeMs : null,
    }
  })
}

/** Exact virtual crossing times, separate from the player's official record. */
export function getSprintRivalFinishResults(seed = 0, bossEncounter = false) {
  return rivalField(seed, bossEncounter).map(({ profile, finishTimeMs }) => ({
    id: profile.id, lane: profile.lane, isBoss: profile.isBoss === true, finishTimeMs,
  }))
}

/** Race position is cosmetic; it is separate from the database's TOP10 rank.
 * Exact distance ties, or exact finish-time ties, place the player first.
 * Finish comparisons use the full crossing time, never the displayed 0.01s.
 */
export function getSprintCompetitionStanding(race, mode = 'solo', seed = 0, bossEncounter = false) {
  if (mode !== 'competition') return null
  const rivals = getSprintRivals(race, mode, seed, bossEncounter)
  const distance = Number.isFinite(race?.distance) ? Math.max(0, Math.min(DISTANCE, race.distance)) : 0
  const clock = raceClock(race)
  const ahead = clock.status === 'finished'
    ? rivals.filter(rival => rival.finishTimeMs !== null && rival.finishTimeMs < clock.elapsedMs).length
    : rivals.filter(rival => rival.distance > distance).length
  return {
    position: ahead + 1,
    total: SPRINT_RIVALS.length + 1,
    finishedRivals: rivals.filter(rival => rival.status === 'finished').length,
    leaderGapMeters: Math.max(0, ...rivals.map(rival => rival.distance - distance)),
  }
}
