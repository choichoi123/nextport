import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPRINT_START_SPRITES, getSprintStartAssets, getSprintStartSpriteRect,
  getSprintStartSpriteSample, preloadSprintStartAssets, drawSprintStartSprite,
} from '../lib/playground-sprint-start-sprites.mjs'
import { startSprintRace, advanceSprintRace, applySprintStride } from '../lib/playground-sprint.mjs'
import { loadSprintSceneFamily } from '../lib/playground-sprint-scene-assets.mjs'

test('both approved runner/boss styles use separate immutable eight-cell start atlases', () => {
  const sources = new Set()
  assert.ok(Object.isFrozen(SPRINT_START_SPRITES))
  for (const art of ['realistic', 'pixel']) for (const actor of ['runner', 'boss']) {
    const asset = getSprintStartAssets(art, actor)
    assert.ok(Object.isFrozen(asset) && Object.isFrozen(asset.frames))
    assert.equal(asset.columns, 4)
    assert.equal(asset.rows, 2)
    assert.equal(asset.frames.length, 8)
    assert.ok(asset.frames.every(frame => Object.isFrozen(frame) && frame.displayHeight > 0
      && Number.isFinite(frame.anchorX) && Number.isFinite(frame.anchorY)))
    assert.match(asset.src, /\/start\/20261118\/(runner|lusain)-(realistic|voxel)-start\.png$/)
    sources.add(asset.src)
  }
  assert.equal(sources.size, 4)
})

test('rounded cell edges cover a non-divisible atlas without missing or overlapping pixels', () => {
  const width = 1774, height = 887
  const rectangles = Array.from({ length: 8 }, (_, index) => getSprintStartSpriteRect(width, height, index))
  assert.equal(rectangles.reduce((area, rect) => area + rect.width * rect.height, 0), width * height)
  for (let index = 0; index < 8; index++) {
    const rect = rectangles[index]
    assert.ok(rect.width > 0 && rect.height > 0)
    if (index % 4 < 3) assert.equal(rect.x + rect.width, rectangles[index + 1].x)
    if (index < 4) assert.equal(rect.y + rect.height, rectangles[index + 4].y)
  }
  for (const [w, h, index] of [[0, 10, 0], [10, 0, 0], [3, 2, 0], [10, 10, -1], [10, 10, 8], [10.5, 10, 0], [10, Infinity, 0]]) {
    assert.equal(getSprintStartSpriteRect(w, h, index), null)
  }
})

test('standing uses the approved existing pose before all four actors sample the shared marks/set timing', () => {
  const initial = startSprintRace(1000)
  assert.equal(getSprintStartSpriteSample(advanceSprintRace(initial, 1999)), null)
  for (const art of ['realistic', 'pixel']) for (const actor of ['runner', 'boss']) {
    for (const [at, frame, phase] of [[2000, 0, 'lowering'], [2649, 3, 'lowering'], [2650, 4, 'crouch'], [3700, 5, 'set'], [4999, 5, 'set']]) {
      const race = Object.freeze(advanceSprintRace(initial, at))
      const sample = getSprintStartSpriteSample(race, art, actor)
      assert.equal(sample.index, frame)
      assert.equal(sample.phase, phase)
      assert.equal(sample.src, getSprintStartAssets(art, actor).src)
      assert.equal(race.updatedAt, at)
    }
  }
})

test('a late first input holds SET, then shows only the two launch cells before the existing run motion', () => {
  const waiting = advanceSprintRace(startSprintRace(1000), 6200)
  assert.equal(getSprintStartSpriteSample(waiting).index, 5)
  const first = applySprintStride(waiting, 'left', 6200)
  assert.equal(getSprintStartSpriteSample(first).index, 6)
  assert.equal(getSprintStartSpriteSample(advanceSprintRace(first, 6309)).index, 6)
  assert.equal(getSprintStartSpriteSample(advanceSprintRace(first, 6310)).index, 7)
  assert.equal(getSprintStartSpriteSample(advanceSprintRace(first, 6420)), null)
  assert.equal(first.firstStrideAt, 6200)
  assert.equal(first.steps, 1)
})

test('top view and non-active states never receive a side-view crouch; running replay times get launch only', () => {
  const countdown = advanceSprintRace(startSprintRace(1000), 2800)
  assert.equal(getSprintStartSpriteSample(countdown, 'pixel', 'boss', 'top'), null)
  for (const status of ['idle', 'finished', 'interrupted', 'unknown']) {
    assert.equal(getSprintStartSpriteSample({ ...countdown, status }), null)
  }
  const replay = { status: 'running', elapsedMs: 50, startedAt: 4000, updatedAt: 4050, firstStrideAt: 4000, steps: 1 }
  assert.equal(getSprintStartSpriteSample(replay).phase, 'launch')
  assert.equal(getSprintStartSpriteSample({ ...replay, elapsedMs: 1000, updatedAt: 5000 }), null)
})

test('start drawing keeps every source-cell ground anchor fixed and scales the boss without moving its lane', () => {
  for (const art of ['realistic', 'pixel']) for (const actor of ['runner', 'boss']) {
    const asset = getSprintStartAssets(art, actor)
    for (let index = 0; index < 8; index++) {
      const draws = []
      const ctx = new Proxy({}, { get: (_target, key) => (...args) => { if (key === 'drawImage') draws.push(args) }, set: () => true })
      const sample = { ...asset.frames[index], index }
      const scale = actor === 'boss' ? 1.08 : 1
      assert.equal(drawSprintStartSprite(ctx, 200, 400, { naturalWidth: 1774, naturalHeight: 887 }, sample, { scale }), true)
      const args = draws[0]
      assert.ok(Math.abs(args[6] + args[8] * sample.anchorY - 400) < 1e-9)
      assert.ok(Math.abs(args[5] + args[7] * sample.anchorX - 200) < 1e-9)
    }
  }
  assert.equal(drawSprintStartSprite({}, 0, 0, null, { index: 4 }), false)
})

test('measured start standing height matches the approved idle model without resizing crouch poses', () => {
  const measured = [
    ['realistic', 'runner', 412, 210, 129.83977900552486],
    ['pixel', 'runner', 406, 227, 132.58563535911603],
    ['realistic', 'boss', 419, 218, 120.88452088452088],
    ['pixel', 'boss', 406, 212, 120.59113300492612],
  ]
  for (const [art, actor, standingPixels, crouchPixels, expected] of measured) {
    const { frames } = getSprintStartAssets(art, actor)
    assert.ok(Math.abs(frames[0].displayHeight * standingPixels / 444 - expected) < 1e-9)
    assert.ok(frames.every(frame => frame.displayHeight === frames[0].displayHeight))
    assert.ok(frames[4].displayHeight * crouchPixels / 443 < expected * .7)
  }
})

test('countdown preloading validates only player and the optional boss using terminal error results', async () => {
  const calls = []
  const load = async src => { calls.push(src); return { src, status: 'ready', image: { naturalWidth: 1774, naturalHeight: 887 } } }
  assert.deepEqual(await preloadSprintStartAssets('pixel', false, load), { status: 'ready', failedSources: [] })
  assert.equal(calls.length, 1)
  assert.equal(calls[0], getSprintStartAssets('pixel').src)
  calls.length = 0
  assert.equal((await preloadSprintStartAssets('realistic', true, load)).status, 'ready')
  assert.equal(calls.length, 2)
  const failed = await preloadSprintStartAssets('pixel', true, async () => { throw new Error('Synthetic load failure') })
  assert.equal(failed.status, 'error')
  assert.equal(failed.failedSources.length, 2)
})

test('an otherwise ready scene family cannot commit until its player/boss start atlas is decoded', async () => {
  let resolve
  const start = new Promise(yes => { resolve = yes })
  let ready = false
  const bossSource = getSprintStartAssets('pixel', 'boss').src
  const loaded = src => ({ src, status: 'ready', image: { src, naturalWidth: 1774, naturalHeight: 887 } })
  const pending = loadSprintSceneFamily({ art: 'pixel', view: 'side', bossEnabled: true }, async src => src === bossSource ? start : loaded(src))
  void pending.then(() => { ready = true })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(ready, false)
  resolve(loaded(bossSource))
  const family = await pending
  assert.equal(family.status, 'ready')
  assert.equal(family.start.status, 'ready')
  assert.equal(family.boss.images.start.src, bossSource)
})
