import test from 'node:test'
import assert from 'node:assert/strict'
import { BASEBALL_TEAMS } from '../lib/playground-baseball-teams.mjs'
import { BASEBALL_REGULAR_SEASON_ID, getBaseballRegularSeasonSchedule } from '../lib/playground-baseball-career-schedule.mjs'
import { getBaseballCareerAdvancePlan, getBaseballCareerHighlight, getBaseballCareerNextHighlight } from '../lib/playground-baseball-career-highlights.mjs'

const games = getBaseballRegularSeasonSchedule('heroes')
const careerAt = (currentGameIndex, changes = {}) => ({
  games, currentGameIndex, scheduleId:BASEBALL_REGULAR_SEASON_ID, status:'active', activeAtBat:null, ...changes,
})

test('each team gets one highlight per six games with opening, midpoint and final games pinned', () => {
  for (const {id} of BASEBALL_TEAMS) {
    const schedule = getBaseballRegularSeasonSchedule(id)
    const highlights = schedule.map((_, index) => getBaseballCareerHighlight(schedule, index))
    assert.equal(highlights.filter(Boolean).length, 24, id)
    for (let start = 0; start < schedule.length; start += 6) {
      assert.equal(highlights.slice(start, start + 6).filter(Boolean).length, 1, id)
    }
    assert.equal(highlights[0], 'opener')
    assert.equal(highlights[72], 'midseason')
    assert.equal(highlights[143], 'finale')
    for (let index = 1; index < highlights.length; index++) {
      if (highlights[index] !== 'series') continue
      assert.ok(schedule[index].opponentId !== schedule[index - 1].opponentId
        || schedule[index].home !== schedule[index - 1].home, id)
    }
  }
})

test('a series or week stops at its boundary and an earlier highlight takes priority', () => {
  assert.deepEqual(getBaseballCareerAdvancePlan(careerAt(1), 'series'), {
    startIndex:1, endIndex:2, count:1, stopReason:'series',
  })
  assert.deepEqual(getBaseballCareerAdvancePlan(careerAt(70), 'week'), {
    startIndex:70, endIndex:71, count:1, stopReason:'week',
  })
  for (const scope of ['week', 'highlight']) {
    assert.deepEqual(getBaseballCareerAdvancePlan(careerAt(1), scope), {
      startIndex:1, endIndex:6, count:5, stopReason:'highlight',
    })
  }
  assert.deepEqual(getBaseballCareerAdvancePlan(careerAt(137), 'highlight'), {
    startIndex:137, endIndex:143, count:6, stopReason:'highlight',
  })
})

test('highlight progression pauses for a decision and blocks advancement during a manual appearance', () => {
  for (const scope of ['series', 'week', 'highlight']) {
    assert.deepEqual(getBaseballCareerAdvancePlan(careerAt(0), scope), {
      startIndex:0, endIndex:0, count:0, stopReason:'highlight',
    })
  }
  assert.deepEqual(getBaseballCareerAdvancePlan(careerAt(0), 'current'), {
    startIndex:0, endIndex:1, count:1, stopReason:'current',
  })
  for (const scope of ['series', 'week', 'highlight', 'current']) {
    assert.deepEqual(getBaseballCareerAdvancePlan(careerAt(0, {activeAtBat:{}}), scope), {
      startIndex:0, endIndex:0, count:0, stopReason:'active',
    })
  }
  assert.deepEqual(getBaseballCareerAdvancePlan(careerAt(143), 'current'), {
    startIndex:143, endIndex:144, count:1, stopReason:'complete',
  })
  assert.equal(getBaseballCareerAdvancePlan(careerAt(144, {status:'complete'}), 'highlight').count, 0)
  assert.equal(getBaseballCareerAdvancePlan(careerAt(0, {scheduleId:undefined}), 'current').stopReason, 'unavailable')
})

test('the next highlight lookup includes the current game and respects the season end', () => {
  assert.deepEqual(getBaseballCareerNextHighlight(games, 0), {index:0, reason:'opener', game:games[0]})
  assert.deepEqual(getBaseballCareerNextHighlight(games, 1), {index:6, reason:'series', game:games[6]})
  assert.deepEqual(getBaseballCareerNextHighlight(games, 142), {index:143, reason:'finale', game:games[143]})
  assert.equal(getBaseballCareerNextHighlight(games, 144), null)
})
