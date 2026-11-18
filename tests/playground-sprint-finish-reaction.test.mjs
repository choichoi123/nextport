import test from 'node:test'
import assert from 'node:assert/strict'
import { getSprintFinishReaction } from '../lib/playground-sprint-finish-reaction.mjs'
import { getSprintRivalFinishResults } from '../lib/playground-sprint-rivals.mjs'

const finished = (finishTimeMs, extra = {}) => ({ status: 'finished', distance: 100, finishTimeMs, ...extra })
const fastest = (seed = 0, boss = false) => Math.min(...getSprintRivalFinishResults(seed, boss).map(rival => rival.finishTimeMs))

test('only a finished player can select a Space finish reaction', () => {
  for (const race of [undefined, null, {}, ...['idle', 'countdown', 'running', 'interrupted', 'unknown'].map(status => ({ status, distance: 100, finishTimeMs: 30000 }))]) {
    assert.equal(getSprintFinishReaction(race), null)
    assert.equal(getSprintFinishReaction(race, 'competition', 1, true), null)
  }
})

test('solo completion celebrates regardless of virtual opponent settings or demo flags', () => {
  assert.equal(getSprintFinishReaction(finished(30000)), 'victory')
  for (const demo of [false, true]) {
    assert.equal(getSprintFinishReaction(finished(30000, { demo }), 'solo', 1, true), 'victory')
  }
})

test('competition reacts to a loss against ordinary rivals even without a boss', () => {
  assert.equal(getSprintFinishReaction(finished(8000), 'competition'), 'victory')
  assert.equal(getSprintFinishReaction(finished(fastest() + 1), 'competition'), 'defeat')
  const lastTime = Math.max(...getSprintRivalFinishResults().map(rival => rival.finishTimeMs))
  assert.equal(getSprintFinishReaction(finished(lastTime + 1000), 'competition'), 'defeat')
})

test('an exact crossing tie favors the player, but sub-display differences still decide a loss', () => {
  const crossing = fastest(37)
  const later = crossing + .001
  assert.equal((crossing / 1000).toFixed(2), (later / 1000).toFixed(2))
  assert.equal(getSprintFinishReaction(finished(crossing), 'competition', 37), 'victory')
  assert.equal(getSprintFinishReaction(finished(later), 'competition', 37), 'defeat')
})

test('the selected seed and boss field determine the result without rolling a new field', () => {
  const betweenSeedResults = (fastest(1) + fastest(2)) / 2
  assert.equal(getSprintFinishReaction(finished(betweenSeedResults), 'competition', 1), 'victory')
  assert.equal(getSprintFinishReaction(finished(betweenSeedResults), 'competition', 2), 'defeat')
  const betweenBossResults = (fastest(1) + fastest(1, true)) / 2
  assert.equal(getSprintFinishReaction(finished(betweenBossResults), 'competition', 1, false), 'victory')
  assert.equal(getSprintFinishReaction(finished(betweenBossResults), 'competition', 1, true), 'defeat')
  assert.equal(getSprintFinishReaction(finished(fastest(1, true)), 'competition', 1, true), 'victory')
})

test('official raw finish time wins over presentation clocks, distance and stored ranks', () => {
  for (const demo of [false, true]) {
    assert.equal(getSprintFinishReaction(finished(8000, { elapsedMs: 100000, distance: 0, position: 6, rank: 10, demo }), 'competition', 1, true), 'victory')
    assert.equal(getSprintFinishReaction(finished(30000, { elapsedMs: 0, distance: 1000, position: 1, rank: 1, demo }), 'competition', 1, true), 'defeat')
  }
})

test('invalid modes and malformed clocks retain existing no-opponent and clock fallback behavior', () => {
  for (const mode of [null, '', 'COMPETITION', 'unknown', 0]) {
    assert.equal(getSprintFinishReaction(finished(30000), mode, 1, true), 'victory')
  }
  for (const finishTimeMs of [undefined, null, -1, NaN, Infinity, '8000']) {
    assert.equal(getSprintFinishReaction(finished(finishTimeMs, { elapsedMs: 30000 }), 'competition'), 'defeat')
    assert.equal(getSprintFinishReaction(finished(finishTimeMs, { elapsedMs: NaN }), 'competition'), 'victory')
  }
})

test('repeated replay samples leave the frozen player record and reaction unchanged', () => {
  const race = Object.freeze(finished(9000, { elapsedMs: 9500, speed: 0, demo: false }))
  const before = { ...race }
  const expected = getSprintFinishReaction(race, 'competition', 1, true)
  for (const time of [0, 4000, 10000, 8000, 2000, 30000]) {
    getSprintFinishReaction({ status: 'running', elapsedMs: time, distance: 50 }, 'competition', 2, false)
    assert.equal(getSprintFinishReaction(race, 'competition', 1, true), expected)
  }
  assert.equal(expected, 'defeat')
  assert.deepEqual(race, before)
})
