import { BASEBALL_REGULAR_SEASON_GAMES, BASEBALL_REGULAR_SEASON_ID } from './playground-baseball-career-schedule.mjs'

const HIGHLIGHT_BLOCK = 6
const advanceScopes = new Set(['series', 'week', 'highlight', 'current'])

function sameSeries(first, second) {
  return first.opponentId === second.opponentId && first.home === second.home
}

function seasonWeek(game) {
  return Math.floor((game.day - 1) / 7)
}

export function getBaseballCareerHighlight(games, index) {
  if (games?.length !== BASEBALL_REGULAR_SEASON_GAMES || !Number.isInteger(index) || index < 0 || index >= games.length) return null

  const first = Math.floor(index / HIGHLIGHT_BLOCK) * HIGHLIGHT_BLOCK
  if (first === 0) return index === 0 ? 'opener' : null
  if (first === games.length / 2) return index === first ? 'midseason' : null
  if (first === games.length - HIGHLIGHT_BLOCK) return index === games.length - 1 ? 'finale' : null

  // Every other block features its first series opener. A block without
  // one still has a highlight at its first game.
  for (let candidate = first; candidate < first + HIGHLIGHT_BLOCK; candidate++) {
    if (!sameSeries(games[candidate - 1], games[candidate])) return candidate === index ? 'series' : null
  }
  return index === first ? 'series' : null
}

export function getBaseballCareerNextHighlight(games, fromIndex) {
  if (games?.length !== BASEBALL_REGULAR_SEASON_GAMES || !Number.isInteger(fromIndex) || fromIndex < 0) return null

  for (let index = fromIndex; index < games.length; index++) {
    const reason = getBaseballCareerHighlight(games, index)
    if (reason) return {index, reason, game:games[index]}
  }
  return null
}

export function getBaseballCareerAdvancePlan(career, scope) {
  const {games, currentGameIndex:startIndex = 0} = career || {}
  const plan = (endIndex, stopReason) => ({startIndex, endIndex, count:endIndex - startIndex, stopReason})

  if (!advanceScopes.has(scope) || career?.scheduleId !== BASEBALL_REGULAR_SEASON_ID
    || games?.length !== BASEBALL_REGULAR_SEASON_GAMES || !Number.isInteger(startIndex)
    || startIndex < 0 || startIndex > games.length) return plan(startIndex, 'unavailable')
  if (career.status === 'complete' || startIndex === games.length) return plan(startIndex, 'complete')
  if (career.status !== 'active') return plan(startIndex, 'unavailable')
  if (career.activeAtBat) return plan(startIndex, 'active')
  if (scope === 'current') return plan(startIndex + 1, startIndex + 1 === games.length ? 'complete' : 'current')

  const startGame = games[startIndex]
  for (let index = startIndex; index < games.length; index++) {
    if (getBaseballCareerHighlight(games, index)) return plan(index, 'highlight')
    if (scope === 'series' && !sameSeries(startGame, games[index])) return plan(index, 'series')
    if (scope === 'week' && seasonWeek(startGame) !== seasonWeek(games[index])) return plan(index, 'week')
  }
  return plan(games.length, 'complete')
}
