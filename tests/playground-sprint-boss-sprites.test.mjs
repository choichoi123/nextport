import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SPRINT_POSE } from '../lib/playground-sprint-pose.mjs'
import {
  SPRINT_BOSS_SPRITES,
  SPRINT_BOSS_CHARACTER_SIZE,
  getSprintBossAssets,
  getSprintBossGestureFrame,
  getSprintBossSample,
  getSprintBossPortraitSample,
  getSprintBossPortraitScale,
  getSprintBossSpriteRect,
  drawSprintBossSprite,
} from '../lib/playground-sprint-boss-sprites.mjs'

const runningAt = phase => ({ status: 'running', speed: 10, distance: phase * SPRINT_POSE.cycleDistance })
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)
const dimensions = src => {
  const data = readFileSync(new URL(`../public${src}`, import.meta.url))
  assert.equal(data.subarray(1, 4).toString(), 'PNG')
  return [data.readUInt32BE(16), data.readUInt32BE(20)]
}

test('six immutable boss atlases are available as their own assets', () => {
  const paths = new Set()
  assert.ok(Object.isFrozen(SPRINT_BOSS_SPRITES))
  for (const assets of Object.values(SPRINT_BOSS_SPRITES)) {
    assert.ok(Object.isFrozen(assets))
    for (const [kind, sheet] of Object.entries(assets)) {
      paths.add(sheet.src)
      assert.ok(Object.isFrozen(sheet) && Object.isFrozen(sheet.frames))
      assert.deepEqual(dimensions(sheet.src), kind === 'run' ? [1254, 1254] : [1774, 887])
      assert.equal(sheet.frames.length, kind === 'run' ? 16 : 8)
      for (const frame of sheet.frames) {
        assert.ok(Object.isFrozen(frame) && Object.isFrozen(frame.sourceRect))
        assert.ok(frame.anchorX > 0 && frame.anchorX < 1)
        assert.ok(frame.anchorY > 0 && frame.anchorY < 1)
        assert.ok(frame.displayHeight > 0 && frame.displayWidth > 0)
      }
    }
  }
  assert.equal(paths.size, 6)
  assert.equal(SPRINT_BOSS_CHARACTER_SIZE, 1.08)
  assert.equal(getSprintBossAssets('__proto__'), getSprintBossAssets('realistic'))
})

test('live and replay distance phases select all 16 side and four overhead running frames', () => {
  for (const art of ['realistic', 'pixel']) {
    for (let index = 0; index < 16; index += 1) {
      const phase = (index + .5) / 16
      const race = Object.freeze(runningAt(phase))
      const before = structuredClone(race)
      const side = getSprintBossSample(race, 'side', art)
      const top = getSprintBossSample(race, 'top', art)
      assert.equal(side.sheet, 'run')
      assert.equal(side.index, index)
      assert.equal(top.sheet, 'top')
      assert.equal(top.index, Math.floor(phase * 4))
      assert.deepEqual(race, before)
      near(side.phase, top.phase)
      near(side.phase, getSprintBossSample(runningAt(phase + 11), 'side', art).phase)
    }
    assert.equal(getSprintBossSample(runningAt(1 - 1e-9), 'side', art).index, 15)
    assert.equal(getSprintBossSample(runningAt(1), 'side', art).index, 0)
  }
})

test('idle, countdown, slow and losing finish states retain their distinct resting poses', () => {
  for (const status of ['idle', 'countdown', 'interrupted']) {
    const race = { status, distance: 30, speed: 10 }
    assert.equal(getSprintBossSample(race).index, 0)
    assert.equal(getSprintBossSample(race).sheet, 'poses')
    assert.equal(getSprintBossSample(race, 'top').index, 4)
  }
  assert.equal(getSprintBossSample({ status: 'running', distance: 50, speed: .15 }).sheet, 'poses')
  const finish = Object.freeze({ status: 'finished', distance: 100, speed: 0, finishTimeMs: 10200 })
  assert.equal(getSprintBossSample(finish).index, 1)
  assert.equal(getSprintBossSample(finish, 'top').index, 5)
  assert.equal(getSprintBossSample(finish, 'side', 'pixel', { won: false, celebrationElapsedMs: 2600 }).index, 1)
  assert.equal(finish.finishTimeMs, 10200)
})

test('intro raises and lowers the signature gesture, while a winner holds it', () => {
  const times = [0, 300, 600, 1000, 1700, 2200, 2600]
  assert.deepEqual(times.map(ms => getSprintBossGestureFrame('intro', ms)), [0, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(times.map(ms => getSprintBossGestureFrame('victory', ms)), [1, 2, 3, 4, 5, 5, 4])
  assert.equal(getSprintBossGestureFrame('intro', -100), 0)
  assert.equal(getSprintBossGestureFrame('victory', 1e8), 4)
  assert.equal(getSprintBossGestureFrame('intro', NaN, 0), 0)
  for (const art of ['realistic', 'pixel']) {
    for (const ms of times) {
      const portrait = getSprintBossPortraitSample(art, 'victory', ms, 2600)
      const finished = getSprintBossSample({ status: 'finished', distance: 100, speed: 0 }, 'side', art, {
        won: true, celebrationElapsedMs: ms, celebrationDurationMs: 2600,
      })
      assert.equal(portrait.index, finished.index)
      assert.equal(finished.sheet, 'poses')
      assert.equal(finished.won, true)
    }
    const winner = { won: true, celebrationElapsedMs: 2600, celebrationDurationMs: 2600 }
    assert.equal(getSprintBossSample({ status: 'finished' }, 'top', art, winner).index, 7)
    assert.equal(getSprintBossSample({ status: 'running', speed: 10, distance: 60 }, 'side', art, winner).sheet, 'run')
  }
})

test('calibrated rectangles contain whole sprites and partition the actual PNGs without seams', () => {
  for (const assets of Object.values(SPRINT_BOSS_SPRITES)) {
    for (const [kind, sheet] of Object.entries(assets)) {
      const [width, height] = dimensions(sheet.src)
      let area = 0
      const rects = sheet.frames.map((frame, index) => getSprintBossSpriteRect(width, height, kind, index, frame.sourceRect))
      for (const [index, rect] of rects.entries()) {
        assert.ok(Object.values(rect).every(Number.isInteger))
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0)
        assert.ok(rect.x + rect.width <= width && rect.y + rect.height <= height)
        if (index % 4 < 3) assert.equal(rect.x + rect.width, rects[index + 1].x)
        if (index < rects.length - 4) assert.equal(rect.y + rect.height, rects[index + 4].y)
        area += rect.width * rect.height
      }
      assert.equal(area, width * height)
    }
  }
  const run = SPRINT_BOSS_SPRITES.realistic.run
  assert.deepEqual(getSprintBossSpriteRect(1254, 1254, 'run', 0, run.frames[0].sourceRect), { x: 0, y: 0, width: 314, height: 336 })
  assert.deepEqual(getSprintBossSpriteRect(1254, 1254, 'run', 4, run.frames[4].sourceRect), { x: 0, y: 336, width: 314, height: 296 })
})

test('supported soles share ground, flight frames keep clearance and atlas pixel scale remains fixed', () => {
  const soles = {
    realistic: [317, 316, 316, 318, 275, 256, 267, 275, 283, 283, 282, 283, 285, 259, 284, 286],
    pixel: [307, 307, 307, 303, 304, 263, 294, 306, 308, 308, 308, 303, 301, 268, 305, 305],
  }
  for (const [art, assets] of Object.entries(SPRINT_BOSS_SPRITES)) {
    const scales = []
    const flights = []
    for (const [index, frame] of assets.run.frames.entries()) {
      const source = getSprintBossSpriteRect(1254, 1254, 'run', index, frame.sourceRect)
      const footOffset = (soles[art][index] / source.height - frame.anchorY) * frame.displayHeight
      scales.push(frame.displayHeight / source.height)
      if (frame.grounded) near(footOffset, 0)
      else {
        assert.ok(footOffset < -1, `${art} frame ${index}: ${footOffset}`)
        flights.push(index)
      }
    }
    assert.deepEqual(flights, [5, 6, 13, 14])
    scales.forEach(scale => near(scale, scales[0]))
  }
})

test('all eight portrait cells fit one stable containing scale, including raised hands', () => {
  for (const art of ['realistic', 'pixel']) {
    const scale = getSprintBossPortraitScale(art)
    const frames = getSprintBossAssets(art).poses.frames
    const ground = 18 + Math.max(...frames.map(frame => frame.anchorY * frame.displayHeight)) * scale
    for (const frame of frames) {
      assert.ok(180 - frame.anchorX * frame.displayWidth * scale >= 18 - 1e-8)
      assert.ok(180 + (1 - frame.anchorX) * frame.displayWidth * scale <= 342 + 1e-8)
      assert.ok(ground - frame.anchorY * frame.displayHeight * scale >= 18 - 1e-8)
      assert.ok(ground + (1 - frame.anchorY) * frame.displayHeight * scale <= 342 + 1e-8)
    }
  }
})

test('only north-facing voxel resting and celebration overhead cells rotate at draw time', () => {
  for (const [art, assets] of Object.entries(SPRINT_BOSS_SPRITES)) {
    for (const [sheet, asset] of Object.entries(assets)) {
      asset.frames.forEach((frame, index) => assert.equal(frame.rotation, art === 'pixel' && sheet === 'top' && index >= 4 ? Math.PI / 2 : 0))
    }
  }
  const calls = []
  const ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]), set: () => true })
  const sample = getSprintBossSample({ status: 'idle' }, 'top', 'pixel')
  assert.equal(drawSprintBossSprite(ctx, 300, 200, { naturalWidth: 1774, naturalHeight: 887 }, sample), true)
  assert.deepEqual(calls.find(call => call[0] === 'translate'), ['translate', 300, 200])
  assert.deepEqual(calls.find(call => call[0] === 'rotate'), ['rotate', Math.PI / 2])
  assert.equal(calls.filter(call => call[0] === 'save').length, 1)
  assert.equal(calls.filter(call => call[0] === 'restore').length, 1)
})

test('invalid sources fail visibly and draw exceptions restore the canvas state', () => {
  for (const bad of [null, undefined, '1254', 0, 3, -1, 4.5, NaN, Infinity]) {
    assert.equal(getSprintBossSpriteRect(bad, 1254, 'run', 0), null)
    assert.equal(getSprintBossSpriteRect(1254, bad, 'run', 0), null)
  }
  for (const bad of [-1, .5, 16, undefined, null, '0']) assert.equal(getSprintBossSpriteRect(1254, 1254, 'run', bad), null)
  for (const bad of [[0, 0, 2, 1], [.7, 0, .2, 1], [0, NaN, 1, 1], []]) {
    assert.equal(getSprintBossSpriteRect(1254, 1254, 'run', 0, bad), null)
  }
  const state = { saves: 0, restores: 0 }
  const ctx = { save() { state.saves++ }, restore() { state.restores++ }, translate() {}, drawImage() { throw new Error('image failed') } }
  assert.equal(drawSprintBossSprite(ctx, 0, 0, { naturalWidth: 1254, naturalHeight: 1254 }, getSprintBossSample(runningAt(.1)), { shadow: false }), false)
  assert.deepEqual(state, { saves: 1, restores: 1 })
})
