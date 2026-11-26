import assert from 'node:assert/strict'
import test from 'node:test'
import { getBaseballCareerStory, getBaseballCareerStoryMatchup } from '../lib/playground-baseball-career-story.mjs'

function stats({ games = 144, hits = 0, doubles = 0, triples = 0, homeRuns = 0, walks = 0, strikeouts = 0 } = {}) {
  const appearances = games * 2
  return { G: games, PA: appearances, AB: appearances - walks, H: hits, '2B': doubles, '3B': triples, HR: homeRuns, BB: walks, SO: strikeouts }
}

const history = (...rows) => rows.map((stats, index) => ({ seasonNumber: index + 1, stats }))

test('story waits for the supported year and required game phase', () => {
  assert.equal(getBaseballCareerStory({ year: 1, stats: stats({ games: 0 }) }), null)
  assert.equal(getBaseballCareerStory({ year: 1, stats: { ...stats({ games: 0 }), G: 1 } }), null)
  assert.equal(getBaseballCareerStory({ year: 11, stats: stats(), history: history(...Array.from({ length: 10 }, () => stats())) }), null)
  for (const year of [5, 10]) {
    assert.equal(getBaseballCareerStory({
      year, stats: stats(), history: history(...Array.from({ length: year - 1 }, () => stats())),
    }), null)
  }
})

test('rookie story switches from a first-hit goal to earned hits only', () => {
  const hitless = getBaseballCareerStory({ year: 1, stats: stats({ games: 1, strikeouts: 2 }) })
  const hit = getBaseballCareerStory({ year: 1, stats: stats({ games: 1, hits: 1 }) })
  const finishedHitless = getBaseballCareerStory({ year: 1, stats: stats(), complete: true })
  assert.equal(hitless.variant, 'first-hit')
  assert.deepEqual(hitless.goal, { kind: 'count', metric: 'hits', scope: 'season', current: 0, target: 1 })
  assert.equal(hitless.evidence.firstHitYear, null)
  assert.equal(hit.variant, 'hits-recorded')
  assert.equal(hit.evidence.firstHitYear, 1)
  assert.equal(hit.goal.target, 2)
  assert.equal(finishedHitless.goal.scope, 'next-season')
  assert.equal(finishedHitless.goal.target, 1)
})

test('year two draws different goals from actual first-year tendencies', () => {
  const opener = stats({ games: 0 })
  const noExtraBases = getBaseballCareerStory({ year: 2, stats: opener, history: history(stats({ hits: 20 })) })
  const strikesOut = getBaseballCareerStory({
    year: 2, stats: opener, history: history(stats({ hits: 20, doubles: 5, strikeouts: 96 })),
  })
  const steady = getBaseballCareerStory({
    year: 2, stats: stats({ games: 4, hits: 1 }), history: history(stats({ hits: 30, doubles: 1, strikeouts: 95 })),
  })
  const firstDouble = getBaseballCareerStory({
    year: 2, stats: stats({ games: 1, hits: 1, doubles: 1 }), history: history(stats({ hits: 20 })),
  })
  assert.equal(noExtraBases.variant, 'first-extra-base-hit')
  assert.deepEqual(noExtraBases.goal, { kind: 'count', metric: 'extraBases', scope: 'season', current: 0, target: 1 })
  assert.equal(strikesOut.variant, 'reduce-strikeouts')
  assert.equal(strikesOut.goal.current, null)
  assert.equal(strikesOut.goal.target, (96 / 288) - 0.03)
  assert.equal(steady.variant, 'hold-hits')
  assert.equal(steady.goal.target, 30)
  assert.equal(firstDouble.variant, 'first-extra-base-hit-recorded')
  assert.equal(firstDouble.goal.current, 1)
  assert.equal(firstDouble.goal.target, 1)
})

test('year three uses actual preparation and condition alongside the prior season', () => {
  const prior = history(stats(), stats({ hits: 25, doubles: 12, walks: 7, strikeouts: 99 }))
  const data = { year: 3, stats: stats({ games: 0 }), history: prior }
  const recovery = getBaseballCareerStory({ ...data, preparation: 'rest', condition: 74 })
  const lowCondition = getBaseballCareerStory({ ...data, condition: 50 })
  const power = getBaseballCareerStory({ ...data, preparation: 'power', condition: 49 })
  const discipline = getBaseballCareerStory({ ...data, preparation: 'discipline', condition: 72 })
  const noPreparation = getBaseballCareerStory({ ...data, preparation: 'fabricated', condition: 130 })
  assert.equal(recovery.variant, 'routine-recovery')
  assert.equal(recovery.evidence.preparation, 'rest')
  assert.deepEqual(recovery.goal, { kind: 'count', metric: 'recovery', scope: 'preparation', current: 1, target: 1 })
  assert.equal(lowCondition.goal.current, 0)
  assert.equal(power.variant, 'routine-power')
  assert.deepEqual(power.goal, { kind: 'count', metric: 'extraBases', scope: 'season', current: 0, target: 13 })
  assert.equal(discipline.variant, 'routine-discipline')
  assert.equal(discipline.goal.metric, 'strikeoutRate')
  assert.equal(discipline.goal.current, null)
  assert.equal(noPreparation.evidence.condition, null)
  assert.equal(noPreparation.evidence.preparation, null)
  assert.equal(noPreparation.variant, 'routine-power')
})

test('year four uses complete, preceding games against the current club', () => {
  const game = (opponentId, options, status = 'complete') => ({ opponentId, status, appearances: [{}, {}], stats: stats({ games: 1, ...options }) })
  const games = [
    game('twins', { strikeouts: 1 }),
    game('bears', { hits: 2, doubles: 2 }),
    game('twins', { hits: 2 }, 'active'),
    game('twins', { hits: 1, doubles: 1 }),
    game('twins', { hits: 2, doubles: 2 }),
  ]
  const current = { year: 4, stats: stats({ games: 4, hits: 4 }), history: history(stats(), stats(), stats({ hits: 16 })) }
  assert.equal(getBaseballCareerStoryMatchup(games, 'not-in-season', 3), null)
  assert.equal(getBaseballCareerStoryMatchup(games, 'twins', -1), null)
  assert.deepEqual(getBaseballCareerStoryMatchup(games, 'twins', 0), { opponentId: 'twins', stats: null })

  const first = getBaseballCareerStory({ ...current, matchup: getBaseballCareerStoryMatchup(games, 'twins', 0) })
  const hitless = getBaseballCareerStory({ ...current, matchup: getBaseballCareerStoryMatchup(games, 'twins', 3) })
  const played = getBaseballCareerStory({ ...current, matchup: getBaseballCareerStoryMatchup(games, 'twins', 4) })
  const unavailable = getBaseballCareerStory(current)
  assert.equal(first.variant, 'matchup-first')
  assert.equal(first.goal.scope, 'matchup')
  assert.equal(hitless.variant, 'matchup-opportunity')
  assert.equal(hitless.goal.metric, 'hits')
  assert.equal(played.variant, 'matchup-build')
  assert.deepEqual(played.evidence.matchup, { opponentId: 'twins', stats: stats({ games: 2, hits: 1, doubles: 1, strikeouts: 1 }) })
  assert.deepEqual(played.goal, { kind: 'count', metric: 'extraBases', scope: 'matchup', current: 1, target: 2 })
  assert.equal(unavailable.evidence.matchup, null)
  assert.deepEqual(unavailable.goal, { kind: 'count', metric: 'hits', scope: 'season', current: 4, target: 16 })
})

test('midpoint comparison uses actual fractions, preserves record ties, and covers no at-bats', () => {
  const past = history(
    stats({ hits: 81, doubles: 15 }),
    stats({ hits: 81, doubles: 13, triples: 2 }),
    stats({ hits: 38, doubles: 5 }),
    stats({ hits: 71, walks: 1 }),
  )
  const lowerAverage = getBaseballCareerStory({ year: 5, stats: stats({ hits: 70, walks: 5 }), history: past, complete: true })
  assert.equal((71 / 287).toFixed(3), (70 / 283).toFixed(3))
  assert.equal(lowerAverage.variant, 'average-down')
  assert.equal(lowerAverage.goal.metric, 'battingAverage')
  assert.equal(lowerAverage.goal.target, 71 / 287)
  assert.deepEqual(lowerAverage.evidence.bestHits, { count: 81, years: [1, 2] })
  assert.deepEqual(lowerAverage.evidence.bestExtraBases, { count: 15, years: [1, 2] })
  const tie = getBaseballCareerStory({
    year: 5, stats: stats({ hits: 70, walks: 8 }),
    history: [...past.slice(0, 3), { seasonNumber: 4, stats: stats({ hits: 71, walks: 4 }) }], complete: true,
  })
  const higherAverage = getBaseballCareerStory({ year: 5, stats: stats({ hits: 73 }), history: past, complete: true })
  const onlyWalks = getBaseballCareerStory({ year: 5, stats: stats({ walks: 288 }), history: past, complete: true })
  assert.equal(tie.variant, 'average-tied')
  assert.equal(tie.goal.target, 70)
  assert.equal(higherAverage.variant, 'average-up')
  assert.equal(onlyWalks.variant, 'average-unavailable')
  assert.equal(onlyWalks.goal.target, 1)
})

test('year six uses complete-season trends and keeps the threshold independent of partial results', () => {
  const firstThree = [stats({ hits: 100 }), stats(), stats()]
  const lowered = history(...firstThree, stats({ hits: 71, walks: 1 }), stats({ hits: 70, walks: 5 }))
  const up = history(...firstThree, stats({ hits: 72 }), stats({ hits: 80 }))
  const tie = history(...firstThree, stats({ hits: 70, walks: 8 }), stats({ hits: 71, walks: 4 }))
  const current = stats({ games: 3, hits: 5 })
  const downStory = getBaseballCareerStory({ year: 6, stats: current, history: lowered })
  const upStory = getBaseballCareerStory({ year: 6, stats: current, history: up })
  const tieStory = getBaseballCareerStory({ year: 6, stats: current, history: tie })
  const complete = getBaseballCareerStory({ year: 6, stats: stats({ hits: 81 }), history: lowered, complete: true })
  const noAtBats = getBaseballCareerStory({ year: 6, stats: current, history: history(...firstThree, stats(), stats({ walks: 288 })) })
  assert.equal(downStory.variant, 'bounce-back')
  assert.deepEqual(downStory.evidence.trend, { earlier: lowered[3].stats, latest: lowered[4].stats, earlierYear: 4, latestYear: 5 })
  assert.deepEqual(downStory.goal, { kind: 'rate', metric: 'battingAverage', scope: 'season', current: 5 / 6, target: 71 / 287 })
  assert.equal(upStory.variant, 'form-up')
  assert.equal(upStory.goal.target, 101)
  assert.equal(tieStory.variant, 'form-steady')
  assert.equal(tieStory.goal.target, 70 / 280)
  assert.equal(complete.variant, 'form-up')
  assert.equal(complete.evidence.trend.earlierYear, 5)
  assert.equal(complete.evidence.trend.latestYear, 6)
  assert.equal(complete.goal.scope, 'next-season')
  assert.equal(noAtBats.variant, 'form-baseline')
})

test('years seven and eight suggest different real-record goals for each conversation choice', () => {
  const six = Array.from({ length: 6 }, () => stats())
  six[5] = stats({ hits: 32, doubles: 12, walks: 8 })
  const mentor = getBaseballCareerStory({ year: 7, stats: stats({ games: 0 }), history: history(...six) })
  const chosen = getBaseballCareerStory({
    year: 7, stats: stats({ games: 0 }), history: history(...six), winterPlan: { direction: 'discipline' },
  })
  const mentorWithoutResults = getBaseballCareerStory({ year: 7, stats: stats({ games: 0 }), history: history(...six.slice(0, 5), stats()) })
  assert.equal(mentor.variant, 'mentor-power')
  assert.equal(mentor.goal.target, 12)
  assert.equal(chosen.variant, 'mentor-discipline')
  assert.equal(chosen.goal.target, 8)
  assert.deepEqual(chosen.options.map(({ id, goal }) => [id, goal.metric]), [['share-routine', 'walks'], ['focus-self', 'hits']])
  assert.equal(mentorWithoutResults.variant, 'mentor-work-in-progress')
  assert.equal(mentorWithoutResults.goal.target, 1)

  const team = getBaseballCareerStory({ year: 8, stats: stats({ games: 0 }), history: history(...six, stats({ hits: 18, walks: 10, strikeouts: 108 })) })
  const onlyContact = getBaseballCareerStory({ year: 8, stats: stats({ games: 0 }), history: history(...six, stats({ hits: 20 })) })
  const power = getBaseballCareerStory({ year: 8, stats: stats({ games: 0 }), history: history(...six, stats({ hits: 20, doubles: 8 })) })
  assert.equal(team.variant, 'team-fundamentals')
  assert.equal(team.goal.target, 11)
  assert.deepEqual(team.options.map(({ id, variant }) => [id, variant]), [['work-together', 'team-fundamentals'], ['personal-routine', 'personal-discipline']])
  assert.equal(onlyContact.variant, 'team-contact')
  assert.equal(onlyContact.options[1].variant, 'personal-contact')
  assert.equal(onlyContact.options[1].goal.target, 21)
  assert.equal(power.options[1].variant, 'personal-power')
  assert.equal(power.options[1].goal.target, 9)
})
test('year nine retains the same milestone after it is reached', () => {
  const past = history(stats({ hits: 198, doubles: 5 }), ...Array.from({ length: 7 }, () => stats()))
  const before = getBaseballCareerStory({ year: 9, stats: stats({ games: 0 }), history: past })
  const after = getBaseballCareerStory({ year: 9, stats: stats({ games: 3, hits: 5 }), history: past })
  assert.equal(before.variant, 'milestone-ahead')
  assert.deepEqual(before.goal, { kind: 'count', metric: 'hits', scope: 'career', current: 198, target: 200 })
  assert.equal(after.variant, 'milestone-reached')
  assert.deepEqual(after.goal, { ...before.goal, current: 203 })

  const noHitsOrWalks = getBaseballCareerStory({
    year: 9, stats: stats({ games: 0 }), history: history(...Array.from({ length: 8 }, () => stats())),
  })
  assert.equal(noHitsOrWalks.goal.target, 1)
})

test('the tenth-year review counts completed records and records only earned milestones', () => {
  const rows = Array.from({ length: 9 }, () => stats())
  rows[1] = stats({ hits: 5, doubles: 2 })
  rows[5] = stats({ hits: 2, homeRuns: 1 })
  const finale = getBaseballCareerStory({ year: 10, stats: stats({ hits: 20 }), history: history(...rows), complete: true })
  assert.equal(finale.variant, 'home-runs-recorded')
  assert.equal(finale.evidence.firstHitYear, 2)
  assert.equal(finale.evidence.firstHomeRunYear, 6)
  assert.equal(finale.evidence.total.G, 1_440)
  assert.equal(finale.evidence.total.PA, 2_880)
  assert.equal(finale.evidence.total.H, 27)
  assert.deepEqual(finale.goal, { kind: 'review', scope: 'career' })
  rows[5] = stats()
  const noHomeRuns = getBaseballCareerStory({ year: 10, stats: stats(), history: history(...rows), complete: true })
  const noHits = getBaseballCareerStory({
    year: 10, stats: stats(), history: history(...Array.from({ length: 9 }, () => stats())), complete: true,
  })
  assert.equal(noHomeRuns.variant, 'hits-only')
  assert.equal(noHomeRuns.evidence.firstHomeRunYear, null)
  assert.equal(noHits.variant, 'no-hits')
  assert.equal(noHits.evidence.firstHitYear, null)
  assert.equal(noHits.evidence.bestExtraBases, null)
})

test('invalid prior records stay absent instead of supplying invented narrative numbers', () => {
  const current = stats({ games: 0 })
  assert.equal(getBaseballCareerStory({ year: 2, stats: current, history: [{ seasonNumber: 2, stats: stats() }] }), null)
  assert.equal(getBaseballCareerStory({ year: 2, stats: current, history: history(stats({ games: 10 })) }), null)
  assert.equal(getBaseballCareerStory({ year: 2, stats: current, history: history({ ...stats(), H: -1 }) }), null)
  assert.equal(getBaseballCareerStory({ year: 2, stats: { ...current, G: 145 }, history: history(stats()) }), null)
})
