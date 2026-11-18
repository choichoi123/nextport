import test from 'node:test'
import assert from 'node:assert/strict'
import { createSprintImageCache } from '../lib/playground-sprint-image-cache.mjs'
import { loadSprintSceneFamily, selectSprintSceneFamily } from '../lib/playground-sprint-scene-assets.mjs'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('a source shares one load/decode promise and the same decoded image across consumers', async () => {
  const images = []
  const cache = createSprintImageCache(() => {
    const image = { naturalWidth: 1254, naturalHeight: 1254, decode: async () => {} }
    images.push(image)
    return image
  })
  assert.equal(images.length, 0)
  assert.equal(cache.peek('/runner.png'), null)
  const first = cache.load('/runner.png')
  assert.strictEqual(first, cache.load('/runner.png'))
  assert.equal(images.length, 1)
  await images[0].onload()
  const state = await first
  assert.equal(state.status, 'ready')
  assert.strictEqual(state.image, images[0])
  assert.strictEqual(cache.peek('/runner.png'), state)
  assert.strictEqual(cache.load('/runner.png'), first)
  assert.equal(images[0].onload, null)
})

test('onload alone never exposes an image while its decode is pending', async () => {
  const decode = deferred()
  const image = { naturalWidth: 1254, naturalHeight: 1254, decode: () => decode.promise }
  const cache = createSprintImageCache(() => image)
  const pending = cache.load('/slow.png')
  const onload = image.onload()
  assert.deepEqual(cache.peek('/slow.png'), { src: '/slow.png', status: 'loading', image: null })
  decode.resolve()
  await onload
  assert.equal((await pending).status, 'ready')
})

test('network/decode failures are cached errors without exposing an old image or retrying forever', async () => {
  for (const failure of ['network', 'decode']) {
    let created = 0
    const image = { naturalWidth: 1254, naturalHeight: 1254,
      decode: async () => { throw new Error('Synthetic decode failure') } }
    const cache = createSprintImageCache(() => { created++; return image })
    const pending = cache.load('/failed.png')
    if (failure === 'network') image.onerror()
    else await image.onload()
    assert.deepEqual(await pending, { src: '/failed.png', status: 'error', image: null })
    assert.strictEqual(cache.load('/failed.png'), pending)
    assert.equal(created, 1)
  }
})

test('invalid sources, failed constructors and empty images settle safely as errors', async () => {
  const cache = createSprintImageCache(() => { throw new Error('Synthetic missing Image') })
  for (const source of [null, undefined, '', '/constructor-error.png']) assert.equal((await cache.load(source)).status, 'error')
  const image = { naturalWidth: 0, naturalHeight: 0 }
  const empty = createSprintImageCache(() => image)
  const pending = empty.load('/empty.png')
  await image.onload()
  assert.equal((await pending).status, 'error')
})

const ready = src => ({ src, status: 'ready', image: { src, naturalWidth: 2000, naturalHeight: 2000 } })

test('the complete side family waits for run16 even when the old pose sheet is already decoded', async () => {
  const run = deferred()
  let complete = false
  const pending = loadSprintSceneFamily({ art: 'pixel', view: 'side' }, src => src.includes('/motion/') ? run.promise : Promise.resolve(ready(src)))
  void pending.then(() => { complete = true })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(complete, false)
  const previous = { art: 'realistic', view: 'side', status: 'ready' }
  assert.strictEqual(selectSprintSceneFamily(previous, { status: 'loading' }), previous)
  run.resolve(ready('/images/playground/sprint/motion/20261117/runner-voxel-run.png'))
  const family = await pending
  assert.equal(family.status, 'ready')
  assert.equal(family.runSprite.status, 'ready')
  assert.strictEqual(selectSprintSceneFamily(previous, family), family)
})

test('core warming omits optional boss/reaction sheets and top view omits the side run sheet', async () => {
  for (const [art, view, expected] of [['pixel', 'side', 3], ['realistic', 'side', 4], ['pixel', 'top', 1], ['realistic', 'top', 2]]) {
    const requested = []
    const family = await loadSprintSceneFamily({ art, view }, async src => { requested.push(src); return ready(src) })
    assert.equal(family.status, 'ready')
    assert.equal(requested.length, expected)
    assert.ok(requested.every(src => !src.includes('/boss/') && !src.includes('/reactions/')))
    assert.equal(family.boss.status, 'off')
    assert.equal(family.reaction.status, 'off')
  }
})

test('required boss/reaction errors are explicit and cannot replace a different ready style', async () => {
  const requested = []
  const family = await loadSprintSceneFamily({ art: 'pixel', view: 'side', bossEnabled: true, defeat: true }, async src => {
    requested.push(src)
    return src.includes('/boss/') ? { src, status: 'error', image: null } : ready(src)
  })
  assert.equal(requested.length, 7)
  assert.equal(family.status, 'error')
  assert.equal(family.boss.status, 'error')
  assert.equal(family.reaction.status, 'ready')
  assert.equal(family.failedSources.length, 2)
  const previous = { art: 'realistic', view: 'side', status: 'ready' }
  assert.strictEqual(selectSprintSceneFamily(previous, family), previous)
  assert.strictEqual(selectSprintSceneFamily(null, family), family)
  assert.strictEqual(selectSprintSceneFamily({ art: 'pixel', view: 'side', status: 'ready' }, family), family)
})

test('a decoded but invalid atlas is an error, never a partially ready family', async () => {
  const family = await loadSprintSceneFamily({ art: 'pixel', view: 'side' }, async src => ({
    src, status: 'ready', image: { naturalWidth: 1, naturalHeight: 1 },
  }))
  assert.equal(family.status, 'error')
  assert.equal(family.sprite.status, 'error')
  assert.equal(family.runSprite.status, 'error')
  assert.equal(family.failedSources.length, 3)
})
