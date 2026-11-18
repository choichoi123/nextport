import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SPRINT_DEFEAT_DURATION_MS,
  SPRINT_REACTION_SPRITES,
  getSprintReactionAssets,
  getSprintReactionSample,
  getSprintReactionRect,
  drawSprintReactionSprite,
  splitSprintRivalLayers,
  getSprintRivalOpacity,
} from '../lib/playground-sprint-reactions.mjs'

test('only a winning boss moves to the opaque foreground; other rivals retain their order', () => {
  const rivals = Object.freeze([
    Object.freeze({ id: 'a', lane: 0, distance: 100, finishTimeMs: 10300 }),
    Object.freeze({ id: 'boss', lane: 5, distance: 100, finishTimeMs: 8800, isBoss: true }),
    Object.freeze({ id: 'b', lane: 1, distance: 97, finishTimeMs: null }),
  ])
  const before = structuredClone(rivals)
  const won = Object.freeze({ won: true })
  const layers = splitSprintRivalLayers(rivals, won)
  assert.deepEqual(layers.back.map(rival => rival.id), ['a', 'b'])
  assert.deepEqual(layers.front.map(rival => rival.id), ['boss'])
  assert.equal(layers.front[0], rivals[1])
  assert.deepEqual(layers.back.map(rival => getSprintRivalOpacity(rival, won)), [.4, .4])
  assert.equal(getSprintRivalOpacity(layers.front[0], won), 1)
  assert.deepEqual(splitSprintRivalLayers(rivals, { won: false }), { back: [...rivals], front: [] })
  assert.deepEqual(splitSprintRivalLayers(rivals, null), { back: [...rivals], front: [] })
  assert.equal(getSprintRivalOpacity(rivals[1], { won: false }), .78)
  assert.equal(getSprintRivalOpacity(rivals[0], won), .4)
  assert.deepEqual(rivals, before)
  assert.deepEqual(won, { won: true })
})

test('empty, solo and boss-free scenes have no foreground layer', () => {
  assert.deepEqual(splitSprintRivalLayers([], { won: true }), { back: [], front: [] })
  const ordinary = [{ id: 'a' }, { id: 'b', isBoss: false }]
  assert.deepEqual(splitSprintRivalLayers(ordinary, { won: true }), { back: ordinary, front: [] })
})

test('defeat is an isolated 2.4-second presentation with eight poses and a stable final frame', () => {
  assert.equal(SPRINT_DEFEAT_DURATION_MS, 2400)
  for (const art of ['realistic', 'pixel']) {
    for (const view of ['side', 'top']) {
      for (let frame = 0; frame < 8; frame++) {
        const celebration = Object.freeze({ kind: 'defeat', elapsedMs: frame * 300 + 100, durationMs: 2400 })
        const sample = getSprintReactionSample(celebration, view, art)
        assert.equal(sample.index, frame)
        assert.equal(sample.kind, 'defeat')
        assert.equal(sample.view, view)
        assert.equal(sample.src, getSprintReactionAssets(art, view).src)
        assert.equal(celebration.elapsedMs, frame * 300 + 100)
      }
      assert.equal(getSprintReactionSample({ kind: 'defeat', elapsedMs: 2399 }, view, art).index, 7)
      assert.equal(getSprintReactionSample({ kind: 'defeat', elapsedMs: 2400 }, view, art).index, 7)
      assert.equal(getSprintReactionSample({ kind: 'defeat', elapsedMs: 1e8 }, view, art).index, 7)
    }
  }
})

test('ordinary celebration and replay poses are not reinterpreted as defeat', () => {
  for (const celebration of [null, undefined, {}, { elapsedMs: 1200 }, { kind: 'victory', elapsedMs: 1200 }]) {
    assert.equal(getSprintReactionSample(celebration), null)
  }
  assert.equal(getSprintReactionSample({ kind: 'defeat', elapsedMs: -10 }).index, 0)
  assert.equal(getSprintReactionSample({ kind: 'defeat', elapsedMs: NaN }).index, 0)
  assert.equal(getSprintReactionSample({ kind: 'defeat', elapsedMs: 600, durationMs: 1200 }).index, 4)
  assert.equal(getSprintReactionSample({ kind: 'defeat', elapsedMs: 600, durationMs: 0 }).index, 2)
  assert.equal(getSprintReactionAssets('__proto__', '__proto__'), getSprintReactionAssets())
})

test('four reaction assets and their presentation metadata are immutable', () => {
  assert.ok(Object.isFrozen(SPRINT_REACTION_SPRITES))
  const paths = new Set()
  for (const [art, styles] of Object.entries(SPRINT_REACTION_SPRITES)) {
    assert.ok(Object.isFrozen(styles))
    for (const [view, asset] of Object.entries(styles)) {
      paths.add(asset.src)
      assert.equal(asset.src, `/images/playground/sprint/reactions/20261118/${art === 'pixel' ? 'voxel' : art}-${view}.png`)
      assert.ok(Object.isFrozen(asset) && Object.isFrozen(asset.frames))
      assert.equal(asset.frames.length, 8)
      for (const frame of asset.frames) {
        assert.ok(Object.isFrozen(frame))
        assert.ok(frame.anchorX > 0 && frame.anchorX < 1)
        assert.ok(frame.anchorY > 0 && frame.anchorY < 1)
        assert.ok(frame.displayHeight > 0 && frame.displayWidth > 0)
      }
    }
  }
  assert.equal(paths.size, 4)
})

test('non-divisible atlases use eight contiguous cells without neighboring-cell leakage', () => {
  for (const [width, height] of [[1774, 887], [1775, 889], [4, 2]]) {
    let area = 0
    for (let index = 0; index < 8; index++) {
      const rect = getSprintReactionRect(width, height, index)
      assert.ok(Object.values(rect).every(Number.isInteger))
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0)
      assert.ok(rect.x + rect.width <= width && rect.y + rect.height <= height)
      if (index % 4 < 3) assert.equal(rect.x + rect.width, getSprintReactionRect(width, height, index + 1).x)
      if (index < 4) assert.equal(rect.y + rect.height, getSprintReactionRect(width, height, index + 4).y)
      area += rect.width * rect.height
    }
    assert.equal(area, width * height)
  }
  assert.deepEqual(getSprintReactionRect(1774, 887, 0, [0, 0, .25, .5]), { x: 0, y: 0, width: 444, height: 444 })
})

test('invalid rectangles fail without accepting unbounded or empty crops', () => {
  for (const bad of [null, undefined, '1774', -1, 0, 1, 1.5, NaN, Infinity]) {
    assert.equal(getSprintReactionRect(bad, 887, 0), null)
    assert.equal(getSprintReactionRect(1774, bad, 0), null)
  }
  for (const bad of [null, undefined, '0', -1, .5, 8, NaN, Infinity]) {
    assert.equal(getSprintReactionRect(1774, 887, bad), null)
  }
  for (const bad of [[], [0, 0, 0, 1], [1, 0, 2, 1], [0, .8, 1, .2], [0, 0, NaN, 1]]) {
    assert.equal(getSprintReactionRect(1774, 887, 0, bad), null)
  }
})

test('reaction drawing preserves canvas state on success and image failure', () => {
  const calls = []
  const ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]), set: () => true })
  const sample = getSprintReactionSample({ kind: 'defeat', elapsedMs: 1000 })
  assert.equal(drawSprintReactionSprite(ctx, 240, 350, { naturalWidth: 1774, naturalHeight: 887 }, sample), true)
  assert.deepEqual(calls.find(call => call[0] === 'translate'), ['translate', 240, 350])
  assert.equal(calls.filter(call => call[0] === 'save').length, 1)
  assert.equal(calls.filter(call => call[0] === 'restore').length, 1)
  const saved = { saves: 0, restores: 0 }
  const failed = new Proxy({}, { get: (_, key) => () => {
    if (key === 'save') saved.saves++
    if (key === 'restore') saved.restores++
    if (key === 'drawImage') throw new Error('unavailable')
  }, set: () => true })
  assert.equal(drawSprintReactionSprite(failed, 240, 350, { naturalWidth: 1774, naturalHeight: 887 }, sample), false)
  assert.deepEqual(saved, { saves: 1, restores: 1 })
  assert.equal(drawSprintReactionSprite(ctx, 240, 350, null, sample), false)
})

test('the actual unmodified PNGs use calibrated, contiguous full-body source cells', () => {
  for (const styles of Object.values(SPRINT_REACTION_SPRITES)) {
    for (const asset of Object.values(styles)) {
      const png = readFileSync(new URL(`../public${asset.src}`, import.meta.url))
      assert.equal(png.subarray(1, 4).toString(), 'PNG')
      const width = png.readUInt32BE(16)
      const height = png.readUInt32BE(20)
      assert.deepEqual([width, height], [1774, 887])
      let area = 0
      for (const [index, frame] of asset.frames.entries()) {
        assert.ok(Object.isFrozen(frame.sourceRect))
        const rect = getSprintReactionRect(width, height, index, frame.sourceRect)
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height)
        assert.equal(rect.width, index % 2 ? 443 : 444)
        assert.equal(rect.height, index < 4 ? 444 : 443)
        area += rect.width * rect.height
      }
      assert.equal(area, width * height)
    }
  }
})

test('side soles stay planted while the reaction preserves the existing idle size and pixel scale', () => {
  const measured = {
    realistic: { headY: 21, sole: [428, 429, 429, 432, 428, 427, 428, 428], target: (349 - 19) * 142 / 362 },
    pixel: { headY: 19, sole: [427, 427, 427, 427, 426, 426, 426, 426], target: (350 - 15) * 142 / 362 },
  }
  for (const [art, values] of Object.entries(measured)) {
    const frames = getSprintReactionAssets(art, 'side').frames
    const initialScale = frames[0].displayHeight / 444
    const initialHeight = (frames[0].anchorY - values.headY / 444) * frames[0].displayHeight
    assert.ok(Math.abs(initialHeight - values.target) < 1e-9)
    for (const [index, frame] of frames.entries()) {
      const rect = getSprintReactionRect(1774, 887, index, frame.sourceRect)
      assert.ok(Math.abs((values.sole[index] / rect.height - frame.anchorY) * frame.displayHeight) < 1e-9)
      assert.ok(Math.abs(frame.displayHeight / rect.height - initialScale) < 1e-9)
    }
  }
})

test('overhead shoe landmarks remain stable across the eight poses without rotating the source', () => {
  const measured = {
    realistic: { x: [91.787, 79.791, 71.372, 61.357, 92.235, 80.214, 71.510, 61.596], y: [253.863, 248.049, 246.915, 247.643, 240.115, 240.882, 240.715, 240.885] },
    pixel: { x: [106.390, 105.075, 101.531, 100.199, 105.644, 104.014, 102.895, 100.974], y: [226.875, 227.164, 226.992, 226.567, 226.027, 226.994, 226.971, 225.752] },
  }
  for (const [art, values] of Object.entries(measured)) {
    const frames = getSprintReactionAssets(art, 'top').frames
    const firstX = (values.x[0] / 444 - frames[0].anchorX) * frames[0].displayWidth
    const firstY = (values.y[0] / 444 - frames[0].anchorY) * frames[0].displayHeight
    for (const [index, frame] of frames.entries()) {
      const rect = getSprintReactionRect(1774, 887, index, frame.sourceRect)
      const x = (values.x[index] / rect.width - frame.anchorX) * frame.displayWidth
      const y = (values.y[index] / rect.height - frame.anchorY) * frame.displayHeight
      assert.ok(Math.abs(x - firstX) < 1e-9)
      assert.ok(Math.abs(y - firstY) < 1e-9)
      assert.equal(frame.rotation, 0)
    }
  }
})
