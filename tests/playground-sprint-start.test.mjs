import test from 'node:test'
import assert from 'node:assert/strict'
import { SPRINT_RULES, startSprintRace, advanceSprintRace, applySprintStride, interruptSprintRace } from '../lib/playground-sprint.mjs'
import { SPRINT_START_TIMING, getSprintStartSample } from '../lib/playground-sprint-start.mjs'
import { createSprintReplay, getSprintReplayFrame } from '../lib/playground-sprint-replay.mjs'

const origin = 123.5
const gunAt = origin + SPRINT_RULES.countdownMs
const at = elapsed => advanceSprintRace(startSprintRace(origin), origin + elapsed)

test('four-second preparation has one second standing before the original three countdown seconds', () => {
  assert.ok(Object.isFrozen(SPRINT_START_TIMING))
  assert.equal(SPRINT_RULES.countdownMs, 4000)
  assert.equal(SPRINT_START_TIMING.countdownMs - SPRINT_START_TIMING.standingMs, 3000)
  for (const elapsed of [0, 999]) {
    const sample = getSprintStartSample(at(elapsed))
    assert.equal(sample.phase, 'standing')
    assert.equal(sample.active, true)
    assert.equal(sample.frame, null)
    assert.equal(sample.count, null)
    assert.equal(sample.label, null)
  }
  for (const [elapsed, count] of [[1000, 3], [1999, 3], [2000, 2], [2999, 2], [3000, 1], [3999, 1]]) {
    const sample = getSprintStartSample(at(elapsed))
    assert.equal(sample.count, count)
    assert.equal(sample.label, 'ON YOUR MARK')
  }
})

test('lowering, crouch and set boundaries select the eight-frame atlas without restarting the clock', () => {
  for (const [elapsed, phase, frame] of [[1000, 'lowering', 0], [1162.5, 'lowering', 1],
    [1325, 'lowering', 2], [1487.5, 'lowering', 3], [1649.999, 'lowering', 3],
    [1650, 'crouch', 4], [2699.999, 'crouch', 4], [2700, 'set', 5], [3999.999, 'set', 5]]) {
    const race = Object.freeze(at(elapsed))
    const before = { ...race }
    const sample = getSprintStartSample(race)
    assert.equal(sample.phase, phase)
    assert.equal(sample.frame, frame)
    assert.ok(sample.progress >= 0 && sample.progress < 1)
    assert.ok(Math.abs(sample.elapsedMs - elapsed) < 1e-8)
    assert.deepEqual(race, before)
  }
})

test('GO starts the official clock exactly but holds set until the first accepted stride', () => {
  for (const elapsedMs of [0, 219, 220, 5000]) {
    const race = advanceSprintRace(startSprintRace(origin), gunAt + elapsedMs)
    const sample = getSprintStartSample(race)
    assert.equal(race.status, 'running')
    assert.equal(race.elapsedMs, elapsedMs)
    assert.equal(race.steps, 0)
    assert.equal(sample.phase, 'set')
    assert.equal(sample.frame, 5)
    assert.equal(sample.count, null)
    assert.equal(sample.label, elapsedMs < SPRINT_START_TIMING.launchMs ? 'GO' : null)
  }
})

test('a delayed first stride plays frames six and seven once while preserving the original gun time', () => {
  const firstAt = gunAt + 850
  const first = applySprintStride(startSprintRace(origin), 'left', firstAt)
  for (const [elapsed, frame] of [[0, 6], [109, 6], [110, 7], [219, 7]]) {
    const race = advanceSprintRace(first, firstAt + elapsed)
    const sample = getSprintStartSample(race)
    assert.equal(sample.phase, 'launch')
    assert.equal(sample.frame, frame)
    assert.equal(sample.label, null)
    assert.equal(race.elapsedMs, 850 + elapsed)
    assert.equal(race.startedAt, gunAt)
  }
  const after = advanceSprintRace(first, firstAt + SPRINT_START_TIMING.launchMs)
  assert.equal(getSprintStartSample(after).active, false)
  const nextStride = applySprintStride(after, 'right', firstAt + 300)
  assert.equal(nextStride.firstStrideAt, firstAt)
  assert.equal(getSprintStartSample(nextStride).phase, 'off')
  const atGun = applySprintStride(startSprintRace(origin), 'left', gunAt)
  assert.equal(getSprintStartSample(atGun).label, 'GO')
})

test('preparation cancellation, completed runs and legacy snapshots never accidentally trigger a start pose', () => {
  for (const race of [null, undefined, {}, { status: 'idle' }, { status: 'finished', elapsedMs: 0 },
    interruptSprintRace(startSprintRace(origin), gunAt - 1), interruptSprintRace(startSprintRace(origin), gunAt),
    { status: 'running', elapsedMs: 100, steps: 5 }, { status: 'countdown', countdownEndsAt: NaN, updatedAt: 0 },
    { status: 'countdown', countdownEndsAt: gunAt, updatedAt: origin - 1 }]) {
    assert.equal(getSprintStartSample(race).active, false)
    assert.equal(getSprintStartSample(race).frame, null)
  }
})

test('virtual starts can sample their own gun independently of a delayed player input', () => {
  const waiting = advanceSprintRace(startSprintRace(origin), gunAt + 150)
  assert.equal(getSprintStartSample(waiting).phase, 'set')
  const virtual = { ...waiting, firstStrideAt: waiting.startedAt, steps: 1 }
  assert.equal(getSprintStartSample(virtual).phase, 'launch')
  assert.equal(getSprintStartSample(virtual).frame, 7)
  assert.equal(getSprintStartSample(virtual).label, 'GO')
  assert.equal(waiting.firstStrideAt, null)
})

test('relative-event replays reconstruct the first stride without adding the preparation to the saved time', () => {
  let race = startSprintRace(origin)
  const events = []
  for (let index = 0; index < 200 && race.status !== 'finished'; index++) {
    const atMs = 500 + index * 175
    const foot = index % 2 ? 'right' : 'left'
    const next = applySprintStride(race, foot, gunAt + atMs)
    if (next.steps > race.steps) events.push({ atMs, foot })
    race = next
  }
  const clip = createSprintReplay({ events, finishTimeMs: race.finishTimeMs })
  for (const [atMs, phase, frame] of [[0, 'set', 5], [499, 'set', 5], [500, 'launch', 6], [610, 'launch', 7], [720, 'off', null]]) {
    const replay = getSprintReplayFrame(clip, atMs)
    const sample = getSprintStartSample(replay)
    assert.equal(replay.status, 'running')
    assert.equal(replay.elapsedMs, atMs)
    assert.equal(sample.phase, phase)
    assert.equal(sample.frame, frame)
  }
  assert.equal(clip.events[0].atMs, 500)
  assert.equal(clip.finishTimeMs, race.finishTimeMs)
  assert.equal(getSprintReplayFrame(clip, 610).firstStrideAt, SPRINT_RULES.countdownMs + 500)
})
