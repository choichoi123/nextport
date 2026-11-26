import { sumBaseballCareerStats } from './playground-baseball-career-v2.mjs'
import { BASEBALL_REGULAR_SEASON_GAMES } from './playground-baseball-career-schedule.mjs'

const seasonPlateAppearances = BASEBALL_REGULAR_SEASON_GAMES * 2
const extraBaseHits = stats => stats['2B'] + stats['3B'] + stats.HR
const boundedIncrease = count => Math.min(seasonPlateAppearances, count + 1)

function countGoal(metric, scope, current, target) {
  return { kind: 'count', metric, scope, current, target }
}

function strikeoutGoal(stats, previous, scope) {
  const current = stats.PA ? stats.SO / stats.PA : null
  const target = (previous.SO * 100 - previous.PA * 3) / (previous.PA * 100)
  return { kind: 'rate', metric: 'strikeoutRate', scope, current, target }
}

function battingAverageGoal(stats, reference, scope) {
  const current = stats.AB ? stats.H / stats.AB : null
  return { kind: 'rate', metric: 'battingAverage', scope, current, target: reference.H / reference.AB }
}

function bestCount(rows, getValue) {
  const count = Math.max(...rows.map(row => getValue(row.stats)))
  if (!count) return null
  return { count, years: rows.filter(row => getValue(row.stats) === count).map(row => row.seasonNumber) }
}

function rookieScene(stats, complete) {
  const scope = complete ? 'next-season' : 'season'
  const target = complete ? Math.max(1, stats.H) : Math.min(seasonPlateAppearances, stats.H + 1)
  return { variant: stats.H ? 'hits-recorded' : 'first-hit', goal: countGoal('hits', scope, stats.H, target) }
}

function secondYearScene(stats, previous) {
  if (extraBaseHits(previous) === 0) {
    const current = extraBaseHits(stats)
    return {
      variant: current ? 'first-extra-base-hit-recorded' : 'first-extra-base-hit',
      goal: countGoal('extraBases', 'season', current, 1),
    }
  }
  if (previous.SO * 3 >= previous.PA) {
    return { variant: 'reduce-strikeouts', goal: strikeoutGoal(stats, previous, 'season') }
  }
  return { variant: 'hold-hits', goal: countGoal('hits', 'season', stats.H, previous.H) }
}

function routineScene({ season, previous, preparation, condition, complete }) {
  const scope = complete ? 'next-season' : 'season'
  if (preparation === 'rest' || (!preparation && condition !== null && condition <= 50)) {
    const recoveryScope = complete ? 'next-season' : 'preparation'
    return { variant: 'routine-recovery', goal: countGoal('recovery', recoveryScope, Number(preparation === 'rest'), 1) }
  }
  const power = extraBaseHits(previous)
  if (preparation === 'power' || (!preparation && power >= 12 && power > previous.BB)) {
    return { variant: 'routine-power', goal: countGoal('extraBases', scope, extraBaseHits(season), boundedIncrease(power)) }
  }
  const goal = previous.SO * 3 >= previous.PA
    ? strikeoutGoal(season, previous, scope)
    : countGoal('walks', scope, season.BB, boundedIncrease(previous.BB))
  return { variant: 'routine-discipline', goal }
}

/** Only completed games before this fixture contribute to the current-season matchup. */
export function getBaseballCareerStoryMatchup(games, opponentId, beforeIndex) {
  if (!Array.isArray(games) || !Number.isInteger(beforeIndex) || beforeIndex < 0 || beforeIndex > games.length
    || typeof opponentId !== 'string' || !opponentId || !games.some(game => game?.opponentId === opponentId)) return null
  const completed = games.slice(0, beforeIndex).filter(game => game?.opponentId === opponentId
    && game.status === 'complete' && Array.isArray(game.appearances) && game.appearances.length === 2
    && game.stats?.G === 1 && game.stats.PA === 2)
  try {
    return { opponentId, stats: completed.length ? sumBaseballCareerStats(completed.map(game => game.stats)).stats : null }
  } catch {
    return { opponentId, stats: null }
  }
}

function matchupScene({ season, previous, matchup, complete }) {
  if (!matchup) {
    const scope = complete ? 'next-season' : 'season'
    return { variant: 'matchup-first', goal: countGoal('hits', scope, season.H, Math.max(1, previous.H)) }
  }
  const scope = complete ? 'next-season' : 'matchup'
  const played = matchup.stats
  if (!played) return { variant: 'matchup-first', goal: countGoal('hits', scope, 0, 1) }
  if (!played.H) return { variant: 'matchup-opportunity', goal: countGoal('hits', scope, 0, 1) }
  return { variant: 'matchup-build', goal: countGoal('extraBases', scope, extraBaseHits(played), boundedIncrease(extraBaseHits(played))) }
}

function midpointScene(stats, previous) {
  let variant = 'average-unavailable'
  if (stats.AB > 0 && previous.AB > 0) {
    const comparison = stats.H * previous.AB - previous.H * stats.AB
    if (comparison < 0) {
      return {
        variant: 'average-down',
        goal: { kind: 'rate', metric: 'battingAverage', scope: 'next-season', current: stats.H / stats.AB, target: previous.H / previous.AB },
      }
    }
    variant = comparison > 0 ? 'average-up' : 'average-tied'
  }
  return { variant, goal: countGoal('hits', 'next-season', stats.H, Math.max(1, stats.H)) }
}

function formScene({ season, complete, trend, reference }) {
  const { earlier, latest } = trend
  const scope = complete ? 'next-season' : 'season'
  if (!earlier.AB || !latest.AB) {
    return { variant: 'form-baseline', goal: countGoal('hits', scope, season.H, Math.max(1, latest.H)) }
  }
  const comparison = latest.H * earlier.AB - earlier.H * latest.AB
  if (comparison < 0) return { variant: 'bounce-back', goal: battingAverageGoal(season, earlier, scope) }
  if (comparison === 0) return { variant: 'form-steady', goal: battingAverageGoal(season, latest, scope) }
  return { variant: 'form-up', goal: countGoal('hits', scope, season.H, boundedIncrease(reference)) }
}

function withChoice(first, second) {
  return { variant: first.variant, goal: first.goal, options: [first, second] }
}

function mentorScene({ season, previous, complete }, winterPlan) {
  const scope = complete ? 'next-season' : 'season'
  const power = extraBaseHits(previous)
  const preferDiscipline = winterPlan?.direction === 'discipline' || (winterPlan?.direction !== 'power' && previous.BB >= power)
  const shareWalks = previous.BB > 0 && (!power || preferDiscipline)
  const shared = { id: 'share-routine', variant: 'mentor-work-in-progress', goal: countGoal('hits', scope, season.H, Math.max(1, previous.H)) }
  if (shareWalks) {
    shared.variant = 'mentor-discipline'
    shared.goal = countGoal('walks', scope, season.BB, previous.BB)
  } else if (power) {
    shared.variant = 'mentor-power'
    shared.goal = countGoal('extraBases', scope, extraBaseHits(season), power)
  }
  const personal = { id: 'focus-self', variant: 'mentor-personal', goal: countGoal('hits', scope, season.H, boundedIncrease(previous.H)) }
  return withChoice(shared, personal)
}

function teamScene({ season, previous, complete }) {
  const scope = complete ? 'next-season' : 'season'
  const team = previous.BB > 0
    ? { id: 'work-together', variant: 'team-fundamentals', goal: countGoal('walks', scope, season.BB, boundedIncrease(previous.BB)) }
    : { id: 'work-together', variant: 'team-contact', goal: countGoal('hits', scope, season.H, Math.max(1, previous.H)) }
  let personal
  if (previous.SO * 3 >= previous.PA) {
    personal = { id: 'personal-routine', variant: 'personal-discipline', goal: strikeoutGoal(season, previous, scope) }
  } else if (extraBaseHits(previous) > 0) {
    personal = { id: 'personal-routine', variant: 'personal-power', goal: countGoal('extraBases', scope, extraBaseHits(season), boundedIncrease(extraBaseHits(previous))) }
  } else {
    personal = { id: 'personal-routine', variant: 'personal-contact', goal: countGoal('hits', scope, season.H, boundedIncrease(previous.H)) }
  }
  return withChoice(team, personal)
}

function nextMilestone(count, steps) {
  const cadence = steps.at(-1)
  return steps.find(step => step > count) ?? (Math.floor(count / cadence) + 1) * cadence
}

function milestoneScene(baseline, total) {
  const metrics = [
    { metric: 'hits', baseline: baseline.H, current: total.H, steps: [1, 10, 25, 50] },
    { metric: 'extraBases', baseline: extraBaseHits(baseline), current: extraBaseHits(total), steps: [1, 5, 10] },
    { metric: 'walks', baseline: baseline.BB, current: total.BB, steps: [1, 5, 10] },
  ]
  const candidates = metrics.filter(row => row.baseline > 0).map(row => {
    const target = nextMilestone(row.baseline, row.steps)
    return { ...row, target, distance: target - row.baseline }
  })
  const best = candidates.reduce((current, row) => !current || row.distance < current.distance ? row : current, null)
  const goal = best ? countGoal(best.metric, 'career', best.current, best.target)
    : countGoal('hits', 'career', total.H, 1)
  return { variant: goal.current >= goal.target ? 'milestone-reached' : 'milestone-ahead', goal }
}

function finaleScene(total) {
  const variant = total.HR > 0 ? 'home-runs-recorded' : total.H > 0 ? 'hits-only' : 'no-hits'
  return { variant, goal: { kind: 'review', scope: 'career' } }
}

/** Stories are derived from the current season and previously settled rows. */
export function getBaseballCareerStory({ year, stats, history = [], complete = false, preparation, condition, matchup, winterPlan } = {}) {
  if (!Number.isInteger(year) || year < 1 || year > 10 || !stats || !Array.isArray(history) || history.length !== year - 1
    || (year === 1 && (!stats.G || !stats.PA)) || ((year === 5 || year === 10) && !complete)
    || (complete && (stats.G !== BASEBALL_REGULAR_SEASON_GAMES || stats.PA !== seasonPlateAppearances))
    || !history.every((row, index) => row?.seasonNumber === index + 1
      && row.stats?.G === BASEBALL_REGULAR_SEASON_GAMES && row.stats.PA === seasonPlateAppearances)) return null

  const previous = history.at(-1)?.stats ?? null
  const rows = [...history, { seasonNumber: year, stats }]
  if (rows.some(row => row.stats.G > BASEBALL_REGULAR_SEASON_GAMES || row.stats.PA > row.stats.G * 2)) return null
  let total, baseline
  try {
    total = sumBaseballCareerStats(rows.map(row => row.stats)).stats
    if (year === 9) baseline = sumBaseballCareerStats(history.map(row => row.stats)).stats
  } catch {
    return null
  }

  const evidence = {
    season: stats,
    previous,
    total,
    complete,
    bestHits: bestCount(rows, row => row.H),
    bestExtraBases: bestCount(rows, extraBaseHits),
    firstHitYear: rows.find(row => row.stats.H > 0)?.seasonNumber ?? null,
    firstHomeRunYear: rows.find(row => row.stats.HR > 0)?.seasonNumber ?? null,
  }
  let scene
  switch (year) {
    case 1: scene = rookieScene(stats, complete); break
    case 2: scene = secondYearScene(stats, previous); break
    case 3:
      evidence.preparation = ['rest', 'discipline', 'power', 'mit', 'stamina'].includes(preparation) ? preparation : null
      evidence.condition = Number.isInteger(condition) && condition >= 0 && condition <= 100 ? condition : null
      scene = routineScene(evidence)
      break
    case 4:
      evidence.matchup = matchup ?? null
      scene = matchupScene(evidence)
      break
    case 5: scene = midpointScene(stats, previous); break
    case 6: {
      const latestIndex = complete ? year - 1 : year - 2
      const earlier = rows[latestIndex - 1]
      const latest = rows[latestIndex]
      evidence.trend = { earlier: earlier.stats, latest: latest.stats, earlierYear: earlier.seasonNumber, latestYear: latest.seasonNumber }
      evidence.reference = Math.max(...rows.slice(0, latestIndex + 1).map(row => row.stats.H))
      scene = formScene(evidence)
      break
    }
    case 7: scene = mentorScene(evidence, winterPlan); break
    case 8: scene = teamScene(evidence); break
    case 9: scene = milestoneScene(baseline, total); break
    case 10: scene = finaleScene(total); break
  }
  return { year, evidence, ...scene }
}
