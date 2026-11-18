import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPRINT_BOSS,
  selectSprintBoss,
  getSprintBossState,
  withSprintBossPresentation,
} from '../lib/playground-sprint-boss.mjs'
import {
  getSprintRivals,
  getSprintRivalFinishResults,
  getSprintCompetitionStanding,
  SPRINT_BOSS_PROFILE,
} from '../lib/playground-sprint-rivals.mjs'
import { startSprintRace, applySprintStride, SPRINT_RULES } from '../lib/playground-sprint.mjs'

const running = (elapsedMs, distance = 50) => ({ status: 'running', elapsedMs, distance })
const crossingFor = seed => getSprintRivalFinishResults(seed, true).find(rival => rival.isBoss).finishTimeMs
const finishAt = time => ({ status: 'finished', distance: 100, elapsedMs: time, finishTimeMs: time })

test('the boss configuration is immutable and names the approved event timing', () => {
  assert.ok(Object.isFrozen(SPRINT_BOSS))
  assert.ok(Object.isFrozen(SPRINT_BOSS_PROFILE))
  assert.equal(SPRINT_BOSS.id, 'lusain-volt')
  assert.equal(SPRINT_BOSS.name, 'Lusain Volt')
  assert.equal(SPRINT_BOSS.spawnProbability, .3)
  assert.equal(SPRINT_BOSS.introDurationMs, 2600)
  assert.equal(SPRINT_BOSS.celebrationDurationMs, 2600)
})

test('automatic entry is deterministic, competition-only and reserves legacy seed zero', () => {
  const fixtures = [[1, false], [2, false], [3, false], [4, true], [5, true], [6, false], [0xffffffff, false]]
  for (const [seed, expected] of fixtures) {
    for (let repeat = 0; repeat < 5; repeat += 1) assert.equal(selectSprintBoss(seed, 'competition'), expected)
  }
  for (const seed of [undefined, null, 0, -1, .3, '4', Infinity, NaN, 0x100000000]) assert.equal(selectSprintBoss(seed, 'competition'), false)
  for (const mode of [undefined, null, 'solo', 'unknown']) {
    assert.equal(selectSprintBoss(4, mode), false)
    assert.equal(selectSprintBoss(4, mode, 'always'), false)
  }
  assert.equal(selectSprintBoss(1, 'competition', 'always'), true)
  assert.equal(selectSprintBoss(4, 'competition', 'never'), false)
  assert.equal(selectSprintBoss(0, 'competition', 'always'), true)
})

test('the independent seed stream samples approximately thirty percent without entropy during rendering', () => {
  let entries = 0
  const originalRandom = Math.random
  Math.random = () => { throw new Error('Unexpected entropy during sampling') }
  try {
    for (let seed = 1; seed <= 100000; seed += 1) if (selectSprintBoss(seed, 'competition')) entries += 1
    const original = getSprintRivals(running(5000), 'competition', 4, true)
    assert.deepEqual(getSprintRivals(running(5000), 'competition', 4, true), original)
    assert.equal(getSprintBossState(running(9000), 'competition', 4, true).id, SPRINT_BOSS.id)
  } finally { Math.random = originalRandom }
  assert.ok(entries >= 29500 && entries <= 30500, `Unexpected entry frequency: ${entries}/100000`)
})

test('one boss replaces only lane six and leaves four ordinary profiles and total six intact', () => {
  for (const seed of [0, 1, 4, 999, 0xffffffff]) {
    const ordinary = getSprintRivals(running(5000), 'competition', seed)
    const field = getSprintRivals(running(5000), 'competition', seed, true)
    assert.equal(field.length, 5)
    assert.equal(field.filter(rival => rival.isBoss).length, 1)
    assert.deepEqual(field.slice(0, 4), ordinary.slice(0, 4))
    assert.equal(field[4].id, SPRINT_BOSS.id)
    assert.equal(field[4].nameKey, 'lusainVolt')
    assert.equal(field[4].lane, 5)
    assert.equal(new Set([...field.map(rival => rival.lane), 2]).size, 6)
    assert.equal(getSprintCompetitionStanding(running(5000), 'competition', seed, true).total, 6)
    assert.deepEqual(getSprintRivals(running(5000), 'solo', seed, true), [])
    assert.equal(getSprintBossState(running(5000), 'solo', seed, true), null)
    assert.equal(getSprintBossState(running(5000), 'competition', seed, false), null)
    assert.equal(getSprintBossState(running(5000), 'competition', seed, 'true'), null)
  }
})

test('the seeded boss accelerates monotonically, respects the finish and remains beatable', () => {
  let player = startSprintRace(0)
  for (let step = 0; step < 1000 && player.status !== 'finished'; step += 1) {
    player = applySprintStride(player, step % 2 ? 'right' : 'left', SPRINT_RULES.countdownMs + step * 75)
  }
  assert.equal(player.status, 'finished')
  for (const seed of [0, 1, 4, 65, 123456, 0xffffffff]) {
    const finishTime = crossingFor(seed)
    assert.ok(finishTime > 8700 && finishTime < 8900)
    assert.ok(player.finishTimeMs < finishTime)
    let previousDistance = 0
    for (let elapsedMs = 0; elapsedMs <= 10000; elapsedMs += 100) {
      const boss = getSprintRivals(running(elapsedMs), 'competition', seed, true).find(rival => rival.isBoss)
      assert.ok(boss.distance >= previousDistance && boss.distance <= 100)
      assert.ok(boss.speed >= 0 && boss.speed <= SPRINT_BOSS_PROFILE.maxSpeed + .06)
      previousDistance = boss.distance
    }
    assert.equal(getSprintBossState(running(finishTime - .001), 'competition', seed, true).finished, false)
    assert.equal(getSprintBossState(running(finishTime), 'competition', seed, true).finished, true)
  }
})

test('a first-place boss starts the ceremony at its exact crossing before the player finishes', () => {
  const finishTime = crossingFor(1)
  const before = getSprintBossState(running(finishTime - .001, 89), 'competition', 1, true)
  assert.equal(before.won, false)
  assert.equal(before.celebrating, false)
  const at = getSprintBossState(running(finishTime, 89), 'competition', 1, true)
  assert.equal(at.finished, true)
  assert.equal(at.won, true)
  assert.equal(at.celebrating, true)
  assert.equal(at.celebrationElapsedMs, 0)
  const midway = getSprintBossState(running(finishTime + 1250, 95), 'competition', 1, true)
  assert.equal(midway.celebrationElapsedMs, 1250)
  assert.equal(midway.celebrating, true)
  const end = getSprintBossState(running(finishTime + 2600, 99), 'competition', 1, true)
  assert.equal(end.won, true)
  assert.equal(end.celebrationElapsedMs, 2600)
  assert.equal(end.celebrating, false)
  assert.equal(getSprintBossState(running(finishTime + 50000, 99), 'competition', 1, true).celebrationElapsedMs, 2600)
})

test('earlier or exactly tied player finishes do not award the boss first place', () => {
  const finishTime = crossingFor(1)
  const playerFirst = getSprintBossState(finishAt(finishTime - .001), 'competition', 1, true)
  assert.equal(playerFirst.finished, false)
  assert.equal(playerFirst.won, false)
  const exactTie = getSprintBossState(finishAt(finishTime), 'competition', 1, true)
  assert.equal(exactTie.finished, true)
  assert.equal(exactTie.won, false)
  assert.equal(exactTie.celebrating, false)
  const bossFirst = getSprintBossState(finishAt(finishTime + .001), 'competition', 1, true)
  assert.equal(bossFirst.won, true)
  assert.equal(bossFirst.celebrating, true)
})

test('an ordinary virtual runner can beat the boss without triggering a false ceremony', () => {
  const seed = 65
  const results = getSprintRivalFinishResults(seed, true)
  const finishTime = crossingFor(seed)
  assert.ok(results.some(rival => !rival.isBoss && rival.finishTimeMs < finishTime))
  const state = getSprintBossState(running(20000, 80), 'competition', seed, true)
  assert.equal(state.finished, true)
  assert.equal(state.won, false)
  assert.equal(state.celebrating, false)
  assert.equal(state.celebrationElapsedMs, 0)
})

test('the original finish clock and interruption stop time without mutating the race', () => {
  const finishTime = crossingFor(1)
  const race = Object.freeze({ ...finishAt(finishTime + 500), elapsedMs: 99999 })
  const before = structuredClone(race)
  const sampled = getSprintBossState(race, 'competition', 1, true)
  assert.equal(sampled.celebrationElapsedMs, 500)
  assert.deepEqual(race, before)
  const interrupted = getSprintBossState({ status: 'interrupted', elapsedMs: finishTime + 500, distance: 90 }, 'competition', 1, true)
  assert.equal(interrupted.won, true)
  assert.equal(interrupted.celebrating, false)
  assert.equal(interrupted.celebrationElapsedMs, 500)
})

test('boss fields and victory replays remain identical after arbitrary seek order and cache eviction', () => {
  const seed = 4
  const times = [0, 5000, crossingFor(seed), crossingFor(seed) + 1000, 20000]
  const expected = new Map(times.map(time => [time, getSprintBossState(running(time, 80), 'competition', seed, true)]))
  for (let other = 1; other <= 100; other += 1) {
    getSprintRivals(running(20000), 'competition', other, false)
    getSprintRivals(running(20000), 'competition', other, true)
  }
  for (const time of [...times].reverse().concat(times)) assert.deepEqual(getSprintBossState(running(time, 80), 'competition', seed, true), expected.get(time))
  const mutable = getSprintRivalFinishResults(seed, true)
  mutable[0].finishTimeMs = 1
  mutable[4].isBoss = false
  assert.equal(getSprintRivalFinishResults(seed, true)[4].isBoss, true)
  assert.notEqual(getSprintRivalFinishResults(seed, true)[0].finishTimeMs, 1)
})

test('presentation time finishes only a won ceremony without changing its result or official time', () => {
  const crossing = crossingFor(1)
  const state = Object.freeze(getSprintBossState(finishAt(crossing + 300), 'competition', 1, true))
  const before = structuredClone(state)
  const shown = withSprintBossPresentation(state, 500)
  assert.equal(shown.celebrationElapsedMs, 800)
  assert.equal(shown.celebrating, true)
  assert.equal(shown.finishTimeMs, state.finishTimeMs)
  assert.equal(shown.won, state.won)
  const finished = withSprintBossPresentation(state, 99999)
  assert.equal(finished.celebrationElapsedMs, 2600)
  assert.equal(finished.celebrating, false)
  assert.deepEqual(withSprintBossPresentation(state, 0), state)
  for (const extra of [undefined, null, -1, NaN, Infinity, '500']) assert.deepEqual(withSprintBossPresentation(state, extra), state)
  assert.deepEqual(state, before)
  const loss = getSprintBossState(finishAt(crossing - 1), 'competition', 1, true)
  assert.equal(withSprintBossPresentation(loss, 1000), loss)
  assert.equal(withSprintBossPresentation(null, 1000), null)
  const interrupted = getSprintBossState({ status: 'interrupted', elapsedMs: crossing + 200, distance: 90 }, 'competition', 1, true)
  assert.equal(withSprintBossPresentation(interrupted, 1000), interrupted)
})

test('invalid clocks do not finish or celebrate an encounter', () => {
  for (const elapsedMs of [undefined, null, '10000', NaN, Infinity, -1]) {
    const state = getSprintBossState(running(elapsedMs), 'competition', 1, true)
    assert.equal(state.finished, false)
    assert.equal(state.won, false)
    assert.equal(state.celebrating, false)
  }
  for (const status of ['idle', 'countdown', 'unknown']) assert.equal(getSprintBossState({ status, elapsedMs: 99000 }, 'competition', 1, true).finished, false)
})
