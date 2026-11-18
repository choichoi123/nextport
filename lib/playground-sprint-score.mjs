/** Round an actual finish time to the centiseconds used for leaderboard ties. */
export function normalizeSprintScore(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    const error = new Error('Finish time must be positive and finite.')
    error.code = 'invalid_run'
    throw error
  }
  const timeCs = Math.round(ms / 10)
  if (!Number.isSafeInteger(timeCs)) {
    const error = new Error('Finish time is outside the supported score range.')
    error.code = 'invalid_run'
    throw error
  }
  return timeCs
}
