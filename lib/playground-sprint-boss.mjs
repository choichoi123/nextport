import {
  getSprintRivals,
  getSprintRivalFinishResults,
  normalizeSprintRivalSeed,
  SPRINT_BOSS_PROFILE,
} from './playground-sprint-rivals.mjs'

export const SPRINT_BOSS = Object.freeze({
  id: SPRINT_BOSS_PROFILE.id,
  name: 'Lusain Volt',
  nameKo: '루사인 볼트',
  spawnProbability: .3,
  introDurationMs: 2600,
  celebrationDurationMs: 2600,
})

function bossRoll(seed) {
  // A separate hash stream keeps entry selection independent of lane pace.
  let value = (seed ^ 0xb05f00d) >>> 0
  value = Math.imul(value ^ value >>> 16, 0x21f0aaad)
  value = Math.imul(value ^ value >>> 15, 0x735a2d97)
  return ((value ^ value >>> 15) >>> 0) / 0x100000000
}

/** Call once at race creation and persist the result beside the rival seed.
 * The development preview override must be gated by the caller's build mode.
 */
export function selectSprintBoss(seed, mode = 'solo', preview = 'auto') {
  if (mode !== 'competition') return false
  if (preview === 'always') return true
  if (preview === 'never') return false
  const normalized = normalizeSprintRivalSeed(seed)
  return normalized > 0 && bossRoll(normalized) < SPRINT_BOSS.spawnProbability
}

function clockFor(race) {
  const status = ['running', 'finished', 'interrupted'].includes(race?.status) ? race.status : 'idle'
  const time = status === 'finished' && Number.isFinite(race.finishTimeMs) && race.finishTimeMs >= 0
    ? race.finishTimeMs : race?.elapsedMs
  return {
    status,
    elapsedMs: status === 'idle' ? 0 : Number.isFinite(time) && time >= 0 ? time : 0,
  }
}

/** The winner and ceremony are sampled from the original clock, never RAF time.
 * Exact ties favor the player, and ties between virtual runners do not award
 * the boss a sole first-place ceremony.
 */
export function getSprintBossState(race, mode = 'solo', seed = 0, bossEncounter = false) {
  if (mode !== 'competition' || bossEncounter !== true) return null
  const rivals = getSprintRivals(race, mode, seed, true)
  const boss = rivals.find(rival => rival.isBoss)
  const results = getSprintRivalFinishResults(seed, true)
  const result = results.find(rival => rival.id === SPRINT_BOSS.id)
  if (!boss || !result) return null
  const clock = clockFor(race)
  const finished = clock.elapsedMs >= result.finishTimeMs
  const rivalsAhead = results.filter(rival => rival.id !== result.id && rival.finishTimeMs <= result.finishTimeMs).length
  const playerAhead = clock.status === 'finished' && clock.elapsedMs <= result.finishTimeMs
  const won = finished && rivalsAhead === 0 && !playerAhead
  const elapsed = won ? Math.max(0, clock.elapsedMs - result.finishTimeMs) : 0
  const duration = SPRINT_BOSS.celebrationDurationMs
  return {
    ...boss,
    raceStatus: clock.status,
    finishTimeMs: result.finishTimeMs,
    finished,
    won,
    celebrationElapsedMs: Math.min(duration, elapsed),
    celebrationDurationMs: duration,
    celebrating: won && clock.status !== 'interrupted' && elapsed < duration,
  }
}

/** Complete a won ceremony after the player finishes, without advancing the
 * world clock or changing the original input clip. Replays pass their sampled
 * post-finish presentation time so pause, seek and speed changes stay deterministic.
 */
export function withSprintBossPresentation(state, extraMs = 0) {
  if (!state || typeof state !== 'object' || !state.won || state.raceStatus === 'interrupted') return state
  const duration = state.celebrationDurationMs
  const elapsed = state.celebrationElapsedMs
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(elapsed)) return state
  const extra = Number.isFinite(extraMs) && extraMs > 0 ? extraMs : 0
  const celebrationElapsedMs = Math.max(0, Math.min(duration, elapsed + extra))
  return {
    ...state,
    celebrationElapsedMs,
    celebrating: state.raceStatus !== 'interrupted' && celebrationElapsedMs < duration,
  }
}
