import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import * as bossSprites from '../lib/playground-sprint-boss-sprites.mjs'

const require = createRequire(import.meta.url)
const babel = require('next/dist/compiled/babel/core')
const { code } = babel.transformSync(readFileSync(new URL('../components/playground/boss-character.js', import.meta.url), 'utf8'), {
  filename: 'boss-character.js', babelrc: false, configFile: false,
  presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
  plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
})

// Exercise the component's effect lifecycle and canvas output without DOM,
// image decoding, network access or a second copy of its selection logic.
function portrait(cache) {
  const hooks = []
  const pending = []
  const draws = []
  const notices = []
  let cursor = 0
  let dirty = false
  let fallbackCalls = 0
  let props = { art: 'realistic', phase: 'intro', elapsedMs: 1000, durationMs: 2600 }
  let tree
  const context = new Proxy({}, {
    get: (_target, key) => (...args) => {
      if (key === 'drawImage') {
        if (args[0].failDraw) throw new Error('Synthetic draw failure')
        draws.push(args[0])
      }
      if (key === 'fillText') notices.push(args[0])
    },
    set: () => true,
  })
  const canvas = { width: 360, height: 360, dataset: {}, getContext: () => context,
    getBoundingClientRect: () => ({ width: 360, height: 360 }) }
  const react = {
    useRef(value) {
      const index = cursor++
      if (!hooks[index]) hooks[index] = { current: value }
      return hooks[index]
    },
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      return [hooks[index], value => { hooks[index] = value; dirty = true }]
    },
    useEffect(effect, dependencies) {
      const index = cursor++
      const previous = hooks[index]
      if (previous && dependencies.every((value, at) => value === previous.dependencies[at])) return
      const next = { dependencies }
      hooks[index] = next
      pending.push(() => { previous?.cleanup?.(); next.cleanup = effect() })
    },
  }
  const testModule = { exports: {} }
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports,
    window: { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} },
    require: name => {
      if (name === 'react') return react
      if (name === '@/lib/playground-sprint-image-cache.mjs') return cache
      if (name === '@/lib/playground-sprint-boss-sprites.mjs') return {
        ...bossSprites, drawSprintBossFallback() { fallbackCalls++ },
      }
      return require(name)
    },
  })
  function flush(nextProps = {}) {
    props = { ...props, ...nextProps }
    do {
      dirty = false
      cursor = 0
      tree = testModule.exports.default(props)
      tree.ref.current = canvas
      while (pending.length) pending.shift()()
    } while (dirty)
  }
  flush()
  return { canvas, draws, notices, flush, get state() { return tree.props['data-boss-state'] },
    get fallbackCalls() { return fallbackCalls },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()) },
  }
}

const sprite = art => ({ naturalWidth: 1774, naturalHeight: 887, art })
const ready = art => ({ status: 'ready', image: sprite(art) })
const artOf = src => src.includes('voxel-') ? 'pixel' : 'realistic'
function delayedCache(initial = {}) {
  const entries = new Map(Object.entries(initial))
  const resolves = new Map()
  return {
    peekSprintImage: src => entries.get(artOf(src)) || null,
    loadSprintImage: src => new Promise(resolve => resolves.set(artOf(src), resolve)),
    async settle(art, result) {
      entries.set(art, result)
      resolves.get(art)?.(result)
      await Promise.resolve()
    },
  }
}

test('a pending art switch keeps the previous decoded portrait and the current gesture clock', async () => {
  const cache = delayedCache({ realistic: ready('realistic') })
  const view = portrait(cache)
  assert.equal(view.canvas.dataset.bossDisplayedArt, 'realistic')
  view.flush({ art: 'pixel', phase: 'victory', elapsedMs: 1700 })
  assert.equal(view.state, 'loading')
  assert.equal(view.canvas.dataset.bossRenderer, 'sprite')
  assert.equal(view.canvas.dataset.bossDisplayedArt, 'realistic')
  assert.equal(view.canvas.dataset.bossFrame, '5')
  assert.equal(view.draws.at(-1).art, 'realistic')
  assert.equal(view.fallbackCalls, 0)
  await cache.settle('pixel', ready('pixel'))
  view.flush()
  assert.equal(view.state, 'ready')
  assert.equal(view.canvas.dataset.bossDisplayedArt, 'pixel')
  assert.equal(view.draws.at(-1).art, 'pixel')
  assert.equal(view.canvas.dataset.bossFrame, '5')
  assert.equal(view.fallbackCalls, 0)
})

test('cold loading is neutral, while a genuine first-load error is explicitly distinguished', async () => {
  const cache = delayedCache()
  const view = portrait(cache)
  assert.equal(view.state, 'loading')
  assert.equal(view.canvas.dataset.bossRenderer, 'loading')
  assert.equal(view.fallbackCalls, 0)
  assert.match(view.notices.at(-1), /준비 중/)
  await cache.settle('realistic', { status: 'error', image: null })
  view.flush()
  assert.equal(view.state, 'error')
  assert.equal(view.canvas.dataset.bossRenderer, 'fallback')
  assert.ok(view.fallbackCalls > 0)
  assert.match(view.notices.at(-1), /로드 실패/)
})

test('failed and invalid replacement atlases preserve the previous normal sprite with an error state', async () => {
  for (const failure of [{ status: 'error', image: null },
    { status: 'ready', image: { naturalWidth: 0, naturalHeight: 0 } },
    { status: 'ready', image: { ...sprite('pixel'), failDraw: true } }]) {
    const cache = delayedCache({ realistic: ready('realistic') })
    const view = portrait(cache)
    view.flush({ art: 'pixel', locale: 'en' })
    await cache.settle('pixel', failure)
    view.flush()
    assert.equal(view.state, 'error')
    assert.equal(view.canvas.dataset.bossRenderer, 'sprite')
    assert.equal(view.canvas.dataset.bossDisplayedArt, 'realistic')
    assert.equal(view.draws.at(-1).art, 'realistic')
    assert.equal(view.fallbackCalls, 0)
    assert.match(view.notices.at(-1), /unavailable/)
  }
})

test('obsolete and unmounted image completions cannot replace the current portrait', async () => {
  const cache = delayedCache()
  const view = portrait(cache)
  view.flush({ art: 'pixel' })
  await cache.settle('realistic', ready('realistic'))
  view.flush()
  assert.equal(view.state, 'loading')
  assert.equal(view.draws.length, 0)
  view.unmount()
  await cache.settle('pixel', ready('pixel'))
  assert.equal(view.draws.length, 0)
  assert.equal(view.fallbackCalls, 0)
})

test('cached switches reuse ready atlases without a procedural frame', () => {
  const view = portrait(delayedCache({ realistic: ready('realistic'), pixel: ready('pixel') }))
  for (const art of ['pixel', 'realistic', 'pixel', 'realistic']) {
    view.flush({ art, phase: 'victory', elapsedMs: 2600 })
    assert.equal(view.state, 'ready')
    assert.equal(view.canvas.dataset.bossDisplayedArt, art)
    assert.equal(view.canvas.dataset.bossFrame, '4')
    assert.equal(view.fallbackCalls, 0)
  }
})
