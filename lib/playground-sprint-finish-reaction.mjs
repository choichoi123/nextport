import { getSprintCompetitionStanding } from './playground-sprint-rivals.mjs'

/** The finish celebration follows the race result, never the TOP10 DB rank. */
export function getSprintFinishReaction(race, mode = 'solo', seed = 0, bossEncounter = false) {
  if (race?.status !== 'finished') return null
  const standing = getSprintCompetitionStanding(race, mode, seed, bossEncounter)
  // Non-competition modes have no opponents. The shared standing helper owns
  // clock normalization and compares full crossing times, with player-first ties.
  return standing && standing.position > 1 ? 'defeat' : 'victory'
}
