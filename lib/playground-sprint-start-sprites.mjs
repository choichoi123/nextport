import { loadSprintImage } from './playground-sprint-image-cache.mjs'
import { getSprintStartSample } from './playground-sprint-start.mjs'

const ROOT = '/images/playground/sprint/start/20261118'
const COLUMNS = 4
const ROWS = 2

// Measured alpha bounds of the unmodified 1774x887 PNGs. Match frame zero to
// the existing standing height, then retain that one pixel scale for all poses.
const LANDMARKS = {
  realistic: {
    runner: { displayHeight: 129.83977900552486 * 444 / 412, anchorX: [.5, .5, .5, .5, .5, .5, .5, .5],
      anchorY: [429 / 444, 427 / 444, 426 / 444, 427 / 444, 424 / 443, 424 / 443, 421 / 443, 421 / 443] },
    boss: { displayHeight: 120.88452088452088 * 444 / 419, anchorX: [.5, .5, .5, .5, .5, .5, .5, .5],
      anchorY: [429 / 444, 428 / 444, 427 / 444, 427 / 444, 427 / 443, 427 / 443, 426 / 443, 429 / 443] },
  },
  pixel: {
    runner: { displayHeight: 132.58563535911603 * 444 / 406, anchorX: [.5, .5, .5, .5, .5, .5, .5, .5],
      anchorY: [425 / 444, 425 / 444, 422 / 444, 422 / 444, 421 / 443, 421 / 443, 420 / 443, 420 / 443] },
    boss: { displayHeight: 120.59113300492612 * 444 / 406, anchorX: [.5, .5, .5, .5, .5, .5, .5, .5],
      anchorY: [421 / 444, 418 / 444, 417 / 444, 419 / 444, 412 / 443, 412 / 443, 408 / 443, 408 / 443] },
  },
}

export const SPRINT_START_SPRITES = Object.freeze(Object.fromEntries(['realistic', 'pixel'].map(art => [art,
  Object.freeze(Object.fromEntries(['runner', 'boss'].map(actor => {
    const landmarks = LANDMARKS[art][actor]
    return [actor, Object.freeze({
      src: `${ROOT}/${actor === 'boss' ? 'lusain' : 'runner'}-${art === 'pixel' ? 'voxel' : art}-start.png`,
      columns: COLUMNS, rows: ROWS,
      frames: Object.freeze(Array.from({ length: 8 }, (_, index) => Object.freeze({
        anchorX: landmarks.anchorX[index], anchorY: landmarks.anchorY[index],
        displayHeight: landmarks.displayHeight,
      }))),
    })]
  }))),
])))

export function getSprintStartAssets(art = 'realistic', actor = 'runner') {
  const style = Object.hasOwn(SPRINT_START_SPRITES, art) ? art : 'realistic'
  return SPRINT_START_SPRITES[style][actor === 'boss' ? 'boss' : 'runner']
}

export function getSprintStartSpriteRect(width, height, index) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < COLUMNS || height < ROWS
    || !Number.isInteger(index) || index < 0 || index >= COLUMNS * ROWS) return null
  const left = Math.round(index % COLUMNS * width / COLUMNS)
  const top = Math.round(Math.floor(index / COLUMNS) * height / ROWS)
  const right = Math.round((index % COLUMNS + 1) * width / COLUMNS)
  const bottom = Math.round((Math.floor(index / COLUMNS) + 1) * height / ROWS)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Timing is shared with the UI; no input, race clock or replay is advanced. */
export function getSprintStartSpriteSample(race, art = 'realistic', actor = 'runner', view = 'side') {
  if (view !== 'side') return null
  const timing = getSprintStartSample(race)
  if (!timing.active || timing.frame === null) return null
  const asset = getSprintStartAssets(art, actor)
  return { ...asset.frames[timing.frame], src: asset.src, sheet: 'start', index: timing.frame,
    phase: timing.phase, kind: 'start' }
}

/** Decode before the countdown starts. Reuses the scene/portrait image cache. */
export async function preloadSprintStartAssets(art = 'realistic', bossEnabled = false, load = loadSprintImage) {
  const descriptors = [getSprintStartAssets(art), ...(bossEnabled ? [getSprintStartAssets(art, 'boss')] : [])]
  const failedSources = []
  await Promise.all(descriptors.map(async descriptor => {
    try {
      const state = await load(descriptor.src)
      if (state.status === 'ready' && getSprintStartSpriteRect(state.image?.naturalWidth, state.image?.naturalHeight, 7)) return
    } catch { /* Report a terminal asset error without exposing a rejected promise. */ }
    failedSources.push(descriptor.src)
  }))
  return { status: failedSources.length ? 'error' : 'ready', failedSources }
}

export function drawSprintStartSprite(ctx, x, y, image, sample, { scale = 1, shadow = true } = {}) {
  const source = getSprintStartSpriteRect(image?.naturalWidth, image?.naturalHeight, sample?.index)
  if (!source) return false
  const height = sample.displayHeight * scale
  const width = height * source.width / source.height
  ctx.save()
  try {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (shadow) {
      ctx.beginPath()
      ctx.ellipse(x - 1, y + 3, 23 * scale, 3.5 * scale, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(24,31,24,.24)'
      ctx.fill()
    }
    ctx.drawImage(image, source.x, source.y, source.width, source.height,
      x - width * sample.anchorX, y - height * sample.anchorY, width, height)
    return true
  } catch {
    return false
  } finally {
    ctx.restore()
  }
}
