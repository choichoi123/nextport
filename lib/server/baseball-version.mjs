// Build-time identity only. Never import this module from browser components.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES } from '../playground-baseball.mjs'

export const BASEBALL_ENGINE_SOURCE_FILES = Object.freeze(['lib/playground-baseball.mjs'])
export const BASEBALL_PRESENTATION_SOURCE_FILES = Object.freeze([
  'components/playground/baseball-game.js',
  'components/playground/baseball-scene.js',
  'lib/playground-baseball-input.mjs',
  'lib/playground-baseball-focus.mjs',
  'lib/playground-baseball-layout.mjs',
  'lib/playground-baseball-animation.mjs',
  'lib/playground-baseball-pitcher.mjs',
  'lib/playground-baseball-presentation.mjs',
  'lib/playground-baseball-feedback.mjs',
  'lib/playground-baseball-audio.mjs',
  'components/playground/use-baseball-feedback.js',
  'components/playground/use-baseball-live-feedback.js',
  'components/playground/baseball-feedback-panel.js',
  'styles/playground-baseball-feedback.module.css',
  'components/playground/baseball-at-bat-game.js',
  'components/playground/use-baseball-postplay.js',
  'lib/playground-baseball-field-presentation.mjs',
  'lib/playground-baseball-postplay.mjs',
  'lib/playground-baseball-postplay-art.mjs',
  'styles/playground-baseball-scene.module.css',
  'components/playground/baseball-career-game.js',
  'components/playground/baseball-entrance-overlay.js',
  'components/playground/use-baseball-entrance.js',
  'lib/playground-baseball-entrance.mjs',
  'styles/playground-baseball-entrance.module.css',
  'lib/playground-baseball-home-run.mjs',
  'components/playground/baseball-home-run-overlay.js',
  'styles/playground-baseball-home-run.module.css',
  'lib/playground-baseball-contact-boost.mjs',
  'components/playground/baseball-contact-boost-overlay.js',
  'styles/playground-baseball-contact-boost.module.css',
  'lib/playground-baseball-career-view.mjs',
])

const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export function canonicalBaseballVersionJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalBaseballVersionJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalBaseballVersionJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** Git line-ending conversion must not invent a different gameplay version. */
export function normalizeBaseballVersionSource(value) {
  const text = typeof value === 'string' ? value : new TextDecoder('utf-8', { fatal:true }).decode(value)
  return text.replace(/\r\n?/g, '\n')
}

export function hashBaseballVersionContent(value) {
  return createHash('sha256').update(value).digest('hex')
}

// Only this known source/rules pair may replay the previous 20ms policy.
// These are public source identities, not database or participant identifiers.
const legacyEngineV1 = freeze({
  algorithm:'sha256',
  hash:'9ce1dd986b9d3f00bbc3c42ee89c346bd87ecead5d760eb5e4fc8063f2874f32',
  files:[{ path:'lib/playground-baseball.mjs', hash:'d095122187b7f637b4f547e9817ab2bfdbc6eefb6bc98556b855d13e537939f4' }],
})
const legacyRulesV1Hash = 'f058ccdf82c8cd06f458421a2de09e5a03d0444f9d817cc82465193f70c095c5'
// Updating the shared engine requires an explicit legacy replay review. A new
// hash must not silently reinterpret already queued v1 practice records.
const legacyCompatibleCurrentEngineHash = '88d5a74356ca25cb229c05ee08a7a2913b1d5df12cd103ed5bffd3cba87b0f12'

export function isBaseballLegacyV1DataVersion(submitted, current) {
  if (submitted?.schemaVersion !== 1 || current?.schemaVersion !== 1 ||
    current.rules?.id !== 'baseball-fixed-center-8cm-v2' ||
    current.engine?.hash !== legacyCompatibleCurrentEngineHash ||
    current.rules?.snapshot?.rules?.batActiveStartMs !== 0) return false
  const snapshot = JSON.parse(JSON.stringify(current.rules.snapshot))
  snapshot.rules.batActiveStartMs = 20
  if (hashBaseballVersionContent(canonicalBaseballVersionJson(snapshot)) !== legacyRulesV1Hash) return false
  const rules = { id:'baseball-fixed-center-8cm-v1', hash:legacyRulesV1Hash, snapshot }
  return canonicalBaseballVersionJson(submitted.engine) === canonicalBaseballVersionJson(legacyEngineV1) &&
    canonicalBaseballVersionJson(submitted.rules) === canonicalBaseballVersionJson(rules)
}

/** Fixed public source paths only; no environment, credentials, or Git metadata. */
export async function createBaseballDataVersions({ readSource = file => readFile(path.join(process.cwd(), file)) } = {}) {
  const identify = async files => {
    const entries = await Promise.all(files.map(async file => ({ path:file, hash:hashBaseballVersionContent(normalizeBaseballVersionSource(await readSource(file))) })))
    return { hash:hashBaseballVersionContent(canonicalBaseballVersionJson(entries)), files:entries }
  }
  const [engine, presentation] = await Promise.all([
    identify(BASEBALL_ENGINE_SOURCE_FILES),
    identify(BASEBALL_PRESENTATION_SOURCE_FILES),
  ])
  // Copy before freezing: never mutate the engine's imported settings.
  const snapshot = JSON.parse(JSON.stringify({ rules:BASEBALL_RULES, pitchTypes:BASEBALL_PITCH_TYPES }))
  return freeze({
    schemaVersion:1,
    engine:{ algorithm:'sha256', ...engine },
    rules:{ id:'baseball-fixed-center-8cm-v2', hash:hashBaseballVersionContent(canonicalBaseballVersionJson(snapshot)), snapshot },
    presentation,
  })
}
