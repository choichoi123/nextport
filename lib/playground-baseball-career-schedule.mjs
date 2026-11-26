export const BASEBALL_REGULAR_SEASON_ID = 'regular-144-v1'
export const BASEBALL_REGULAR_SEASON_GAMES = 144

// The team order is part of this schedule version. Changes to roster display
// order must not rearrange a season already pinned in a save.
const clubIds = ['heroes', 'lions', 'landers', 'wiz', 'tigers', 'twins', 'bears', 'dinos', 'eagles', 'giants']
const seriesLengths = [2, 3, 3, 2, 3, 3]

function createSchedules() {
  const fixtures = Object.fromEntries(clubIds.map(id => [id, []]))
  const rotation = [...clubIds]
  const pairings = Array.from({ length: clubIds.length - 1 }, (_, round) => {
    const pairs = rotation.slice(0, rotation.length / 2).map((club, index) => {
      const other = rotation[rotation.length - index - 1]
      return (round + index) % 2 === 0 ? [club, other] : [other, club]
    })
    rotation.splice(1, 0, rotation.pop())
    return pairs
  })
  let day = 1
  let series = 0
  for (const [leg, length] of seriesLengths.entries()) {
    for (const round of pairings) {
      series++
      for (let game = 0; game < length; game++, day++) {
        for (const [first, second] of round) {
          const [home, away] = leg % 2 === 0 ? [first, second] : [second, first]
          fixtures[home].push(Object.freeze({ day, opponentId: away, home: true }))
          fixtures[away].push(Object.freeze({ day, opponentId: home, home: false }))
        }
      }
      if (series % 2 === 0) day++
    }
  }
  return Object.freeze(Object.fromEntries(clubIds.map(id => [id, Object.freeze(fixtures[id])])))
}

const schedules = createSchedules()

export function getBaseballRegularSeasonSchedule(teamId) {
  return Object.hasOwn(schedules, teamId) ? schedules[teamId] : undefined
}

export function getBaseballRegularTrainingGain(previousSameTrainingCount) {
  return previousSameTrainingCount % 2 === 1 ? 1 : 0
}
