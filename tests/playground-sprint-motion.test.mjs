import test from 'node:test'
import assert from 'node:assert/strict'
import { SPRINT_POSE } from '../lib/playground-sprint-pose.mjs'
import { SPRINT_RULES, startSprintRace, advanceSprintRace, applySprintStride } from '../lib/playground-sprint.mjs'
import { createSprintReplay, getSprintReplayFrame } from '../lib/playground-sprint-replay.mjs'
import { SPRINT_RUN_SPRITES, getSprintRunSample, getSprintRunRect } from '../lib/playground-sprint-motion.mjs'

const runningAt = phase => ({ status: 'running', speed: 10, distance: phase * SPRINT_POSE.cycleDistance })
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`)
const measured = {
  realistic: {
    head: [.2737, .2690, .2676, .2691, .2280, .2238, .2232, .2270, .1812, .1825, .1812, .1841, .1389, .1400, .1459, .1425],
    sole: [.9840, .9872, .9840, .9840, .9389, .8650, .9003, .9389, .9006, .9038, .9071, .9071, .8585, .8006, .8296, .8553],
  },
  pixel: {
    head: [.1042, .1040, .1041, .1068, .1099, .1098, .1107, .1109, .1063, .1073, .1060, .1074, .1153, .1170, .1155, .1171],
    sole: [.9808, .9808, .9808, .9808, .9744, .8494, .9327, .9615, .9904, .9904, .9839, .9582, .9679, .8782, .9615, .9679],
  },
}

test('run sheets and all calibrated frames are immutable and use the approved 16-frame assets', () => {
  assert.ok(Object.isFrozen(SPRINT_RUN_SPRITES))
  for (const [art, sheet] of Object.entries(SPRINT_RUN_SPRITES)) {
    assert.ok(Object.isFrozen(sheet) && Object.isFrozen(sheet.frames))
    assert.equal(sheet.src, `/images/playground/sprint/motion/20261117/runner-${art === 'pixel' ? 'voxel' : art}-run.png`)
    assert.equal(sheet.columns, 4)
    assert.equal(sheet.rows, 4)
    assert.equal(sheet.frames.length, 16)
    for (const frame of sheet.frames) {
      assert.ok(Object.isFrozen(frame))
      assert.ok(frame.anchorX > 0 && frame.anchorX < 1)
      assert.ok(frame.anchorY > 0 && frame.anchorY <= 1)
      assert.equal(frame.displayHeight, sheet.frames[0].displayHeight)
    }
  }
})

test('a complete distance cycle selects all 16 poses with a continuous local fraction', () => {
  for (const art of ['realistic', 'pixel']) {
    for (let index = 0; index < 16; index += 1) {
      for (const fraction of [.125, .5, .875]) {
        const sample = getSprintRunSample(runningAt((index + fraction) / 16), art)
        assert.equal(sample.index, index)
        near(sample.fraction, fraction)
        assert.equal(sample.anchorX, SPRINT_RUN_SPRITES[art].frames[index].anchorX)
        assert.equal(sample.anchorY, SPRINT_RUN_SPRITES[art].frames[index].anchorY)
      }
    }
  }
})

test('the stride wraps across its final frame and style changes share the original phase', () => {
  assert.equal(getSprintRunSample(runningAt(1 - 1e-9)).index, 15)
  assert.equal(getSprintRunSample(runningAt(1)).index, 0)
  for (const phase of [.000001, .12345, .515, .99999]) {
    const first = getSprintRunSample(runningAt(phase))
    const repeated = getSprintRunSample(runningAt(phase + 17), 'pixel')
    assert.equal(first.index, repeated.index)
    near(first.phase, repeated.phase)
    near(first.fraction, repeated.fraction)
  }
})

test('non-moving states leave idle, finish and celebration rendering to the existing renderer', () => {
  for (const status of ['idle', 'countdown', 'interrupted', 'finished']) {
    assert.equal(getSprintRunSample({ status, speed: 10, distance: 20 }), null)
  }
  for (const speed of [0, .15, -1, NaN]) assert.equal(getSprintRunSample({ status: 'running', speed, distance: 20 }), null)
  for (const race of [null, undefined, false]) assert.equal(getSprintRunSample(race), null)
  assert.ok(getSprintRunSample({ status: 'running', speed: .150001, distance: 20 }))
  assert.deepEqual(getSprintRunSample(runningAt(.25), '__proto__'), getSprintRunSample(runningAt(.25)))
})

test('measured supported soles stay on the ground and flight poses keep positive clearance', () => {
  for (const [art, sheet] of Object.entries(SPRINT_RUN_SPRITES)) {
    const flights = []
    for (const [index, frame] of sheet.frames.entries()) {
      const footOffset = (measured[art].sole[index] - frame.anchorY) * frame.displayHeight
      if (frame.grounded) near(footOffset, 0)
      else {
        flights.push(index)
        assert.ok(footOffset < -2, `${art} frame ${index} retains flight clearance`)
      }
    }
    assert.deepEqual(flights, [5, 6, 13, 14])
  }
})

test('both styles keep a 120-unit median head-to-ground height without per-frame scaling', () => {
  for (const [art, sheet] of Object.entries(SPRINT_RUN_SPRITES)) {
    const heights = sheet.frames.filter(frame => frame.grounded).map(frame => {
      const index = sheet.frames.indexOf(frame)
      return (frame.anchorY - measured[art].head[index]) * frame.displayHeight
    }).sort((a, b) => a - b)
    near((heights[5] + heights[6]) / 2, 120)
    // Keep the small measured head bob rather than resizing every pose.
    for (const height of heights) assert.ok(Math.abs(height - 120) < 4)
    for (const [index, frame] of sheet.frames.entries()) {
      if (!frame.grounded) near((frame.anchorY - measured[art].head[index]) * frame.displayHeight, 120)
    }
  }
})

test('replay seeking and live sampling agree while preserving race, input history and finish time', () => {
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
  const original = structuredClone(race)
  Object.freeze(race)
  const clip = createSprintReplay({ events, finishTimeMs: race.finishTimeMs })
  for (const atMs of [350, 1777, 3456, 7890, 350]) {
    let live = advanceSprintRace(startSprintRace(0), SPRINT_RULES.countdownMs)
    for (const event of events) {
      if (event.atMs > atMs) break
      live = applySprintStride(live, event.foot, SPRINT_RULES.countdownMs + event.atMs)
    }
    live = Object.freeze(advanceSprintRace(live, SPRINT_RULES.countdownMs + atMs))
    const before = structuredClone(live)
    const replay = Object.freeze(getSprintReplayFrame(clip, atMs))
    for (const art of ['realistic', 'pixel']) assert.deepEqual(getSprintRunSample(replay, art), getSprintRunSample(live, art))
    assert.deepEqual(live, before)
  }
  assert.equal(getSprintRunSample(race), null)
  assert.deepEqual(race, original)
  assert.equal(clip.finishTimeMs, original.finishTimeMs)
})

test('actual non-divisible atlas sizes partition into 16 contiguous cells with no overflow', () => {
  for (const [width, height] of [[1262, 1246], [1261, 1247], [4, 4], [2048, 2048]]) {
    let area = 0
    for (let index = 0; index < 16; index += 1) {
      const rect = getSprintRunRect(width, height, index)
      assert.ok(Object.values(rect).every(Number.isInteger))
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0)
      assert.ok(rect.x + rect.width <= width && rect.y + rect.height <= height)
      if (index % 4 < 3) assert.equal(rect.x + rect.width, getSprintRunRect(width, height, index + 1).x)
      if (index < 12) assert.equal(rect.y + rect.height, getSprintRunRect(width, height, index + 4).y)
      area += rect.width * rect.height
    }
    assert.equal(area, width * height)
    const last = getSprintRunRect(width, height, 15)
    assert.equal(last.x + last.width, width)
    assert.equal(last.y + last.height, height)
  }
  assert.deepEqual(getSprintRunRect(1262, 1246, 15), { x: 947, y: 935, width: 315, height: 311 })
})

test('invalid atlas dimensions and out-of-range frame indexes return no rectangle', () => {
  for (const invalid of [undefined, null, '1262', -1, 0, 3, 4.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(getSprintRunRect(invalid, 1246, 0), null)
    assert.equal(getSprintRunRect(1262, invalid, 0), null)
  }
  for (const invalid of [undefined, null, '0', -1, .5, 16, Infinity, NaN]) assert.equal(getSprintRunRect(1262, 1246, invalid), null)
})
