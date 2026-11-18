export const SPRINT_SECRET_TAP_COUNT = 5
export const SPRINT_SECRET_WINDOW_MS = 3000

/** A new pointer activation counts once; DOM handlers reject held/repeated input. */
export function recordSprintSecretTap(previousTimestamps, now) {
  if (!Number.isFinite(now) || now < 0) return { taps: [], activated: false }
  const recent = Array.isArray(previousTimestamps)
    ? previousTimestamps.filter(at => Number.isFinite(at) && at >= 0 && at <= now && now - at <= SPRINT_SECRET_WINDOW_MS)
    : []
  const taps = [...recent.slice(-(SPRINT_SECRET_TAP_COUNT - 1)), now]
  return taps.length >= SPRINT_SECRET_TAP_COUNT
    ? { taps: [], activated: true }
    : { taps, activated: false }
}

export function isSprintVoltCommand(name) {
  return typeof name === 'string' && name.trim().toLowerCase() === '/volt'
}

/** Keep the previous nickname while a player types the hidden command. */
export function isSprintVoltCommandPrefix(name) {
  if (typeof name !== 'string') return false
  const value = name.trim().toLowerCase()
  return value.length > 0 && '/volt'.startsWith(value)
}

/** Consume the queued call at GO, preserving it through all preparation cancels. */
export function shouldConsumeSprintSecretCall(race, mode, usedSecret) {
  if (mode !== 'competition' || usedSecret !== true) return false
  if (race?.status === 'running' || race?.status === 'finished') return true
  // The engine sets startedAt to the future gun time during the countdown.
  // An interruption can cross GO before the next animation frame is rendered.
  return race?.status === 'interrupted'
    && Number.isFinite(race.startedAt) && Number.isFinite(race.updatedAt)
    && race.updatedAt >= race.startedAt
}
