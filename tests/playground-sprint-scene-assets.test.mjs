import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import * as pose from '../lib/playground-sprint-pose.mjs'
import * as sprites from '../lib/playground-sprint-sprites.mjs'
import * as motion from '../lib/playground-sprint-motion.mjs'
import * as track from '../lib/playground-sprint-track.mjs'
import * as rivals from '../lib/playground-sprint-rivals.mjs'
import * as boss from '../lib/playground-sprint-boss.mjs'
import * as bossSprites from '../lib/playground-sprint-boss-sprites.mjs'
import * as reactions from '../lib/playground-sprint-reactions.mjs'
import * as finish from '../lib/playground-sprint-finish-reaction.mjs'
import * as assets from '../lib/playground-sprint-scene-assets.mjs'
import * as startSprites from '../lib/playground-sprint-start-sprites.mjs'
import * as viewport from '../lib/playground-sprint-viewport.mjs'
import { startSprintRace, advanceSprintRace, applySprintStride } from '../lib/playground-sprint.mjs'

const require = createRequire(import.meta.url)
const babel = require('next/dist/compiled/babel/core')
const { code } = babel.transformSync(readFileSync(new URL('../components/playground/sprint-scene.js', import.meta.url), 'utf8'), {
  filename: 'sprint-scene.js', babelrc: false, configFile: false,
  presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
  plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
})
const libraries = { 'playground-sprint-pose': pose, 'playground-sprint-sprites': sprites,
  'playground-sprint-motion': motion, 'playground-sprint-track': track, 'playground-sprint-rivals': rivals,
  'playground-sprint-boss': boss, 'playground-sprint-boss-sprites': bossSprites,
  'playground-sprint-reactions': reactions, 'playground-sprint-finish-reaction': finish,
  'playground-sprint-start-sprites': startSprites, 'playground-sprint-viewport': viewport }
const drain = async () => { for (let count = 0; count < 16; count++) await Promise.resolve() }
const artOf = src => src.includes('voxel') ? 'pixel' : 'realistic'
const isBossSource = src => src.includes('/boss/') || src.includes('/lusain-')

function controlledImages() {
  const entries = new Map()
  return {
    entries,
    load(src) {
      if (!entries.has(src)) {
        let resolve
        const promise = new Promise(yes => { resolve = yes })
        entries.set(src, { promise, resolve, status: 'loading' })
      }
      return entries.get(src).promise
    },
    async settle(predicate = () => true, error = () => false) {
      for (const [src, entry] of entries) {
        if (entry.status !== 'loading' || !predicate(src)) continue
        entry.status = error(src) ? 'error' : 'ready'
        entry.image = entry.status === 'ready' ? { src, naturalWidth: 2000, naturalHeight: 2000 } : null
        entry.resolve({ src, status: entry.status, image: entry.image })
      }
      await drain()
    },
  }
}

// Exercise the actual component's hooks, loaders and canvas telemetry. The fake
// canvas only supplies drawing primitives; selection and animation remain real.
function scene(cache, initial = {}) {
  const hooks = [], effects = [], draws = [], notices = [], states = []
  let cursor = 0
  let props = { art: 'realistic', view: 'side', locale: 'ko', raceMode: 'solo',
    race: Object.freeze({ status: 'running', distance: 18, speed: 10, elapsedMs: 2000, startedAt: 0, updatedAt: 2000 }),
    onAssetsStateChange: state => states.push(state), ...initial }
  const makeContext = main => new Proxy({}, {
    get(_target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} })
      return (...args) => {
        if (main && key === 'drawImage' && args[0]?.src) draws.push(args[0])
        if (main && key === 'fillText') notices.push(args[0])
      }
    },
    set: () => true,
  })
  const context = makeContext(true)
  const cssProperties = new Map()
  const canvas = { width: 960, height: 500, dataset: {}, attributes: {}, getContext: () => context,
    style: { getPropertyValue: name => cssProperties.get(name) || '', setProperty: (name, value) => cssProperties.set(name, String(value)) },
    getBoundingClientRect: () => ({ width: 960, height: 500 }), setAttribute(name, value) { this.attributes[name] = value } }
  const react = {
    useRef(value) { const at = cursor++; if (!hooks[at]) hooks[at] = { current: value }; return hooks[at] },
    useEffect(effect, dependencies) {
      const at = cursor++, previous = hooks[at]
      if (previous && dependencies.every((value, index) => value === previous.dependencies[index])) return
      const next = { dependencies }
      hooks[at] = next
      effects.push(() => { previous?.cleanup?.(); next.cleanup = effect() })
    },
  }
  const testModule = { exports: {} }
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => makeContext(false) }) },
    window: { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'react') return react
      if (name === '@/lib/playground-sprint-scene-assets.mjs') return {
        ...assets, loadSprintSceneFamily: request => assets.loadSprintSceneFamily(request, src => cache.load(src)),
      }
      const match = /^@\/lib\/(.*)\.mjs$/.exec(name)
      if (match && libraries[match[1]]) return libraries[match[1]]
      return require(name)
    },
  })
  function flush(next = {}) {
    props = { ...props, ...next }
    cursor = 0
    const tree = testModule.exports.default(props)
    tree.ref.current = canvas
    while (effects.length) effects.shift()()
  }
  flush()
  return { canvas, draws, notices, states, flush, get props() { return props },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()) } }
}

test('cold loading and a ready pose sheet never flash procedural or run8 before run16 is decoded', async () => {
  const cache = controlledImages(), view = scene(cache)
  assert.equal(view.canvas.dataset.runnerRenderer, 'loading')
  await cache.settle(src => artOf(src) === 'realistic' && !src.includes('/motion/'))
  assert.equal(view.canvas.dataset.runnerRenderer, 'loading')
  assert.equal(view.draws.length, 0)
  await cache.settle(src => artOf(src) === 'realistic')
  assert.equal(view.canvas.dataset.runnerRenderer, 'sprite')
  assert.equal(view.canvas.dataset.runnerMotion, 'calibrated-16')
})

test('a delayed art switch continues the original decoded runner at the current race frame', async () => {
  const cache = controlledImages(), view = scene(cache)
  await cache.settle(src => artOf(src) === 'realistic')
  view.flush({ art: 'pixel' })
  await cache.settle(src => artOf(src) === 'pixel' && !src.includes('/motion/'))
  const race = Object.freeze({ ...view.props.race, distance: 31, elapsedMs: 3200, updatedAt: 3200 })
  view.flush({ race })
  assert.equal(view.canvas.dataset.requestedArt, 'pixel')
  assert.equal(view.canvas.dataset.renderedArt, 'realistic')
  assert.equal(view.canvas.dataset.sceneAssetsState, 'loading')
  assert.equal(view.canvas.dataset.runnerMotion, 'calibrated-16')
  assert.equal(Number(view.canvas.dataset.runnerFrame), motion.getSprintRunSample(race, 'realistic').index)
  assert.equal(Number(view.canvas.dataset.trackCamera), track.getSprintTrackFrame(race.distance, 'side').cameraX)
  await cache.settle(src => artOf(src) === 'pixel')
  assert.equal(view.canvas.dataset.renderedArt, 'pixel')
  assert.equal(view.canvas.dataset.runnerMotion, 'calibrated-16')
  assert.equal(race.distance, 31)
})

test('a genuine replacement failure keeps the previous normal sprite and displays an explicit error', async () => {
  const cache = controlledImages(), view = scene(cache, { locale: 'en' })
  await cache.settle(src => artOf(src) === 'realistic')
  view.flush({ art: 'pixel' })
  await cache.settle(src => artOf(src) === 'pixel', src => src.includes('/motion/'))
  assert.equal(view.canvas.dataset.renderedArt, 'realistic')
  assert.equal(view.canvas.dataset.runnerRenderer, 'sprite')
  assert.equal(view.canvas.dataset.sceneAssetsState, 'error')
  assert.match(view.canvas.attributes['aria-description'], /Image load failed/)
  assert.ok(view.notices.some(text => /keeping the current style/.test(text)))
})

test('first-load run failure uses an explicitly marked fallback instead of the old pose atlas', async () => {
  const cache = controlledImages(), view = scene(cache)
  await cache.settle(src => artOf(src) === 'realistic', src => src.includes('/motion/'))
  assert.equal(view.canvas.dataset.sceneAssetsState, 'error')
  assert.equal(view.canvas.dataset.runnerRenderer, 'procedural')
  assert.equal(view.canvas.dataset.runnerState, 'error')
  assert.ok(view.draws.every(image => !image.src.includes('/sprites/')))
  assert.match(view.canvas.attributes['aria-description'], /로딩 실패/)
})

test('obsolete/unmounted completions do not replace the scene and warm switches reuse decoded images', async () => {
  const cache = controlledImages(), view = scene(cache)
  await cache.settle(src => artOf(src) === 'realistic')
  view.flush({ art: 'pixel' })
  view.flush({ art: 'realistic' })
  await drain()
  await cache.settle(src => artOf(src) === 'pixel')
  assert.equal(view.canvas.dataset.renderedArt, 'realistic')
  const count = cache.entries.size
  for (const art of ['pixel', 'realistic', 'pixel', 'realistic']) {
    view.flush({ art })
    await drain()
    assert.equal(view.canvas.dataset.renderedArt, art)
    assert.equal(view.canvas.dataset.runnerRenderer, 'sprite')
  }
  assert.equal(cache.entries.size, count)
  view.flush({ view: 'top' })
  view.unmount()
  const draws = view.draws.length
  await cache.settle()
  assert.equal(view.draws.length, draws)
})

test('a new boss is not drawn as procedural while required sheets load into an existing normal family', async () => {
  const cache = controlledImages(), view = scene(cache)
  await cache.settle(src => artOf(src) === 'realistic')
  view.flush({ raceMode: 'competition', rivalSeed: 1, bossEncounter: true })
  assert.equal(view.canvas.dataset.bossRenderer, 'loading')
  assert.equal(view.canvas.dataset.runnerRenderer, 'sprite')
  await cache.settle(src => isBossSource(src) && src.includes('realistic'))
  assert.equal(view.canvas.dataset.bossRenderer, 'sprite')
  assert.equal(view.canvas.dataset.rivalCount, '5')
})

test('a failed new style still completes a new boss in the retained style instead of hiding it forever', async () => {
  const cache = controlledImages(), view = scene(cache)
  await cache.settle(src => artOf(src) === 'realistic')
  view.flush({ art: 'pixel', raceMode: 'competition', rivalSeed: 1, bossEncounter: true })
  await cache.settle(src => artOf(src) === 'pixel', src => src.includes('/boss/'))
  assert.equal(view.canvas.dataset.renderedArt, 'realistic')
  await cache.settle(src => artOf(src) === 'realistic' && isBossSource(src))
  assert.equal(view.canvas.dataset.bossRenderer, 'sprite')
  assert.equal(view.canvas.dataset.sceneAssetsState, 'error')
})

test('defeat loading keeps the approved finish sprite, then style changes preserve the current reaction frame', async () => {
  const cache = controlledImages(), view = scene(cache)
  await cache.settle()
  const race = Object.freeze({ ...view.props.race, status: 'finished', distance: 100, speed: 0,
    elapsedMs: 9000, finishTimeMs: 9000, updatedAt: 9000 })
  view.flush({ race, raceMode: 'competition', rivalSeed: 1,
    celebration: { kind: 'defeat', elapsedMs: 100, durationMs: 2400 } })
  assert.equal(view.canvas.dataset.runnerRenderer, 'sprite')
  assert.equal(view.canvas.dataset.reactionState, 'loading')
  await cache.settle(src => src.includes('/reactions/') && artOf(src) === 'realistic')
  assert.equal(view.canvas.dataset.runnerRenderer, 'reaction')
  view.flush({ art: 'pixel', celebration: { kind: 'defeat', elapsedMs: 1000, durationMs: 2400 } })
  assert.equal(view.canvas.dataset.renderedArt, 'realistic')
  assert.equal(view.canvas.dataset.runnerRenderer, 'reaction')
  assert.equal(Number(view.canvas.dataset.runnerFrame), 3)
  await cache.settle(src => src.includes('/reactions/') && artOf(src) === 'pixel')
  assert.equal(view.canvas.dataset.renderedArt, 'pixel')
  assert.equal(view.canvas.dataset.runnerRenderer, 'reaction')
  assert.equal(Number(view.canvas.dataset.runnerFrame), 3)
  assert.equal(race.finishTimeMs, 9000)
})

test('a paused replay keeps its clock through camera loading and asset state callbacks do not loop per frame', async () => {
  const cache = controlledImages(), view = scene(cache)
  await cache.settle(src => artOf(src) === 'realistic')
  const initial = view.states.length
  for (let frame = 0; frame < 5; frame++) view.flush({ race: { ...view.props.race } })
  assert.equal(view.states.length, initial)
  const before = { ...view.props.race }
  view.flush({ view: 'top' })
  assert.equal(view.canvas.dataset.renderedView, 'side')
  await cache.settle(src => artOf(src) === 'realistic')
  assert.equal(view.canvas.dataset.renderedView, 'top')
  assert.equal(view.canvas.dataset.runnerRenderer, 'sprite')
  assert.deepEqual(view.props.race, before)
})

test('player and Lusain share marks/crouch/set frames after the initial approved standing pose', async () => {
  for (const art of ['realistic', 'pixel']) {
    const cache = controlledImages()
    const initial = startSprintRace(1000)
    const view = scene(cache, { art, race: advanceSprintRace(initial, 1500), raceMode: 'competition', bossEncounter: true, rivalSeed: 1 })
    await cache.settle()
    assert.equal(view.canvas.dataset.runnerMotion, 'poses')
    let positions = JSON.parse(view.canvas.dataset.rivalPositions)
    assert.equal(positions.find(rival => rival.isBoss).sheet, 'poses')
    const beforeX = view.canvas.dataset.runnerX
    const beforeY = view.canvas.dataset.runnerY
    for (const [at, index] of [[2000, 0], [2649, 3], [2800, 4], [4000, 5]]) {
      view.flush({ race: advanceSprintRace(initial, at) })
      assert.equal(view.canvas.dataset.runnerMotion, 'start-8')
      assert.equal(Number(view.canvas.dataset.runnerFrame), index)
      positions = JSON.parse(view.canvas.dataset.rivalPositions)
      assert.ok(positions.every(rival => rival.sheet === 'start' && rival.frame === index))
      assert.equal(view.canvas.dataset.runnerX, beforeX)
      assert.equal(view.canvas.dataset.runnerY, beforeY)
      assert.equal(view.canvas.dataset.runnerRenderer, 'sprite')
    }
  }
})

test('late player input holds SET while rivals run; accepted input launches once into run16', async () => {
  const cache = controlledImages()
  const waiting = advanceSprintRace(startSprintRace(1000), 5500)
  const view = scene(cache, { race: waiting, raceMode: 'competition', bossEncounter: true, rivalSeed: 1 })
  await cache.settle()
  assert.equal(view.canvas.dataset.runnerMotion, 'start-8')
  assert.equal(view.canvas.dataset.runnerFrame, '5')
  assert.equal(JSON.parse(view.canvas.dataset.rivalPositions).find(rival => rival.isBoss).sheet, 'run')
  assert.equal(waiting.distance, 0)
  const first = applySprintStride(waiting, 'left', 5500)
  view.flush({ race: first })
  assert.equal(view.canvas.dataset.runnerFrame, '6')
  view.flush({ race: advanceSprintRace(first, 5610) })
  assert.equal(view.canvas.dataset.runnerFrame, '7')
  view.flush({ race: advanceSprintRace(first, 5720) })
  assert.equal(view.canvas.dataset.runnerMotion, 'calibrated-16')
  assert.equal(first.steps, 1)
})

test('a delayed alternate start atlas retains current crouch timing and swaps the complete family only when decoded', async () => {
  const cache = controlledImages()
  const initial = startSprintRace(1000)
  const view = scene(cache, { race: advanceSprintRace(initial, 2500) })
  await cache.settle(src => artOf(src) === 'realistic')
  view.flush({ art: 'pixel' })
  await cache.settle(src => artOf(src) === 'pixel' && !src.includes('/start/'))
  view.flush({ race: advanceSprintRace(initial, 4000) })
  assert.equal(view.canvas.dataset.renderedArt, 'realistic')
  assert.equal(view.canvas.dataset.runnerMotion, 'start-8')
  assert.equal(view.canvas.dataset.runnerFrame, '5')
  await cache.settle(src => artOf(src) === 'pixel' && src.includes('/start/'))
  assert.equal(view.canvas.dataset.renderedArt, 'pixel')
  assert.equal(view.canvas.dataset.runnerMotion, 'start-8')
  assert.equal(view.canvas.dataset.runnerFrame, '5')
  assert.equal(view.canvas.dataset.runnerRenderer, 'sprite')
})
