import test from 'node:test'
import assert from 'node:assert/strict'
import { SPRINT_POSE, getSprintPose } from '../lib/playground-sprint-pose.mjs'
import {
  SPRINT_RULES,
  startSprintRace,
  applySprintStride,
} from '../lib/playground-sprint.mjs'
import { createSprintReplay, getSprintReplayFrame } from '../lib/playground-sprint-replay.mjs'
import {
  SPRINT_SPRITES,
  getSprintSpriteFrame,
  getSprintSpriteRect,
} from '../lib/playground-sprint-sprites.mjs'

const runningAt = phase => ({ status: 'running', speed: 10, distance: phase * SPRINT_POSE.cycleDistance })
const finished = Object.freeze({ status: 'finished', speed: 0, distance: 100, elapsedMs: 12345, finishTimeMs: 12345 })

test('each art style has immutable camera metadata and pixel resolves to the voxel atlas', () => {
  for (const [art, sheets] of Object.entries(SPRINT_SPRITES)) {
    assert.ok(Object.isFrozen(sheets))
    for (const [view, sheet] of Object.entries(sheets)) {
      assert.ok(Object.isFrozen(sheet))
      assert.equal(sheet.src, `/images/playground/sprint/sprites/20261117/runner-${art === 'pixel' ? 'voxel' : 'realistic'}-${view}.png`)
      assert.equal(sheet.columns * sheet.rows, view === 'side' ? 12 : 6)
      assert.equal(sheet.displayWidth, view === 'side' ? 142 : 100)
      assert.equal(sheet.displayHeight, sheet.displayWidth)
      assert.equal(sheet.anchorX, .5)
      assert.ok(sheet.anchorY > 0 && sheet.anchorY <= 1)
      if (view === 'side') assert.ok(sheet.runAnchorY > 0 && sheet.runAnchorY <= 1)
    }
  }
  assert.ok(Object.isFrozen(SPRINT_SPRITES))
})

test('one stride selects all eight side frames and four top frames in order', () => {
  const side = []
  const top = []
  for (let eighth = 0; eighth < 8; eighth += 1) {
    const race = runningAt((eighth + .5) / 8)
    side.push(getSprintSpriteFrame(race).index)
    top.push(getSprintSpriteFrame(race, 'top').index)
  }
  assert.deepEqual(side, [0, 1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(top, [0, 0, 1, 1, 2, 2, 3, 3])
})

test('the stride wraps at a full cycle and camera choice uses the same phase', () => {
  for (const phase of [.000001, .1875, .6875, .999999]) {
    const first = getSprintSpriteFrame(runningAt(phase))
    const repeated = getSprintSpriteFrame(runningAt(phase + 12))
    assert.equal(first.index, repeated.index)
    assert.ok(Math.abs(first.phase - repeated.phase) < 1e-12)
    assert.equal(getSprintSpriteFrame(runningAt(phase), 'top').phase, first.phase)
  }
  assert.equal(getSprintSpriteFrame(runningAt(1 - 1e-9)).index, 7)
  assert.equal(getSprintSpriteFrame(runningAt(1)).index, 0)
  assert.equal(getSprintSpriteFrame(runningAt(1)).phase, 0)
})

test('idle, countdown, interrupted and stopped runners use standing frames', () => {
  for (const race of [
    { status: 'idle', speed: 0, distance: 0 },
    { status: 'countdown', speed: 0, distance: 0 },
    { status: 'interrupted', speed: 0, distance: 59 },
    { status: 'running', speed: .15, distance: 59 },
    { status: 'running', speed: 0, distance: 59 },
  ]) {
    assert.deepEqual(getSprintSpriteFrame(race), { index: 8, columns: 4, rows: 3, jump: 0, phase: 0 })
    assert.deepEqual(getSprintSpriteFrame(race, 'top'), { index: 4, columns: 3, rows: 2, jump: 0, phase: 0 })
  }
  assert.equal(getSprintSpriteFrame({ status: 'running', speed: .150001, distance: 2.2 }).index, 4)
  assert.equal(getSprintSpriteFrame(finished).index, 9)
  assert.equal(getSprintSpriteFrame(finished, 'top').index, 4)
})

test('celebration raises the sprite, then reverses through its poses and returns to rest', () => {
  const durationMs = 2400
  const elapsed = [0, 120, 264, 528, 1680, 2040, 2328, 2400]
  assert.deepEqual(elapsed.map(elapsedMs => getSprintSpriteFrame(finished, 'side', { elapsedMs, durationMs }).index), [9, 9, 10, 11, 11, 10, 9, 9])
  assert.deepEqual(elapsed.map(elapsedMs => getSprintSpriteFrame(finished, 'top', { elapsedMs, durationMs }).index), [4, 4, 5, 5, 5, 5, 4, 4])
  const celebration = { elapsedMs: 636, durationMs }
  const pose = getSprintPose(finished, celebration)
  assert.ok(pose.jump > 9)
  assert.equal(getSprintSpriteFrame(finished, 'side', celebration).jump, pose.jump)
  assert.equal(getSprintSpriteFrame(finished, 'top', celebration).jump, pose.jump * .4)
  assert.equal(getSprintSpriteFrame(finished, 'side', { elapsedMs: durationMs, durationMs }).jump, 0)
})

test('invalid celebrations and an active run keep their ordinary sprite frame', () => {
  const race = Object.freeze(runningAt(.69))
  for (const celebration of [
    null,
    { elapsedMs: -1, durationMs: 2400 },
    { elapsedMs: 2400, durationMs: 2400 },
    { elapsedMs: 300, durationMs: 0 },
    { elapsedMs: NaN, durationMs: 2400 },
    { elapsedMs: 300, durationMs: Infinity },
  ]) {
    assert.deepEqual(getSprintSpriteFrame(finished, 'side', celebration), getSprintSpriteFrame(finished))
  }
  assert.deepEqual(getSprintSpriteFrame(race, 'side', { elapsedMs: 1000, durationMs: 2400 }), getSprintSpriteFrame(race))
})

test('replay seeks sample the same sprite independently of playback order and preserve race state', () => {
  let race = startSprintRace(0)
  const events = []
  for (let step = 0; step < 200 && race.status !== 'finished'; step += 1) {
    const atMs = step * 175
    const foot = step % 2 ? 'right' : 'left'
    const next = applySprintStride(race, foot, SPRINT_RULES.countdownMs + atMs)
    if (next.steps > race.steps) events.push({ atMs, foot })
    race = next
  }
  assert.equal(race.status, 'finished')
  const before = structuredClone(race)
  Object.freeze(race)
  const clip = createSprintReplay({ events, finishTimeMs: race.finishTimeMs })
  const samples = new Map()
  for (const atMs of [0, 350, 1777, 3456, 7890, race.finishTimeMs]) {
    const frame = Object.freeze(getSprintReplayFrame(clip, atMs))
    const frameBefore = structuredClone(frame)
    samples.set(atMs, { side: getSprintSpriteFrame(frame), top: getSprintSpriteFrame(frame, 'top') })
    assert.deepEqual(frame, frameBefore)
  }
  for (const atMs of [7890, 350, race.finishTimeMs, 1777, 0, 3456, 7890]) {
    const frame = getSprintReplayFrame(clip, atMs)
    assert.deepEqual({ side: getSprintSpriteFrame(frame), top: getSprintSpriteFrame(frame, 'top') }, samples.get(atMs))
  }
  const celebration = Object.freeze({ elapsedMs: 636, durationMs: 2400 })
  getSprintSpriteFrame(race, 'side', celebration)
  getSprintSpriteFrame(race, 'top', celebration)
  assert.deepEqual(race, before)
  assert.deepEqual(celebration, { elapsedMs: 636, durationMs: 2400 })
})

test('atlas corners map to the correct source cells', () => {
  assert.deepEqual(getSprintSpriteRect(2048, 1536, 'side', 0), { x: 0, y: 0, width: 512, height: 512 })
  assert.deepEqual(getSprintSpriteRect(2048, 1536, 'side', 3), { x: 1536, y: 0, width: 512, height: 512 })
  assert.deepEqual(getSprintSpriteRect(2048, 1536, 'side', 8), { x: 0, y: 1024, width: 512, height: 512 })
  assert.deepEqual(getSprintSpriteRect(2048, 1536, 'side', 11), { x: 1536, y: 1024, width: 512, height: 512 })
  assert.deepEqual(getSprintSpriteRect(1536, 1024, 'top', 5), { x: 1024, y: 512, width: 512, height: 512 })
})

test('non-divisible atlas dimensions give contiguous integer source rectangles with no overflow', () => {
  for (const [view, columns, rows] of [['side', 4, 3], ['top', 3, 2]]) {
    for (const [imageWidth, imageHeight] of [[1537, 1025], [1001, 667], [columns, rows]]) {
      let area = 0
      for (let index = 0; index < columns * rows; index += 1) {
        const rect = getSprintSpriteRect(imageWidth, imageHeight, view, index)
        assert.ok(Object.values(rect).every(Number.isInteger))
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0)
        assert.ok(rect.x + rect.width <= imageWidth && rect.y + rect.height <= imageHeight)
        area += rect.width * rect.height
        if (index % columns < columns - 1) {
          const right = getSprintSpriteRect(imageWidth, imageHeight, view, index + 1)
          assert.equal(rect.x + rect.width, right.x)
        }
        if (index < columns * (rows - 1)) {
          const below = getSprintSpriteRect(imageWidth, imageHeight, view, index + columns)
          assert.equal(rect.y + rect.height, below.y)
        }
      }
      const last = getSprintSpriteRect(imageWidth, imageHeight, view, columns * rows - 1)
      assert.equal(last.x + last.width, imageWidth)
      assert.equal(last.y + last.height, imageHeight)
      assert.equal(area, imageWidth * imageHeight)
    }
  }
})

test('invalid dimensions, view and frame indexes return no source rectangle', () => {
  for (const invalid of [undefined, null, '1024', 0, -1, 1.5, NaN, Infinity]) {
    assert.equal(getSprintSpriteRect(invalid, 1024, 'side', 0), null)
    assert.equal(getSprintSpriteRect(1536, invalid, 'side', 0), null)
  }
  assert.equal(getSprintSpriteRect(3, 3, 'side', 0), null)
  assert.equal(getSprintSpriteRect(4, 2, 'side', 0), null)
  for (const invalid of [undefined, null, '0', -1, .5, 12, NaN, Infinity]) assert.equal(getSprintSpriteRect(1536, 1024, 'side', invalid), null)
  assert.equal(getSprintSpriteRect(1536, 1024, 'top', 6), null)
  for (const view of [undefined, null, 'overhead', 'toString', '__proto__']) assert.equal(getSprintSpriteRect(1536, 1024, view, 0), null)
})
