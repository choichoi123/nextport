import { getSprintPose } from './playground-sprint-pose.mjs'

const ROOT = '/images/playground/sprint/boss/20261117'
const LAYOUTS = Object.freeze({
  run: Object.freeze({ columns: 4, rows: 4 }),
  poses: Object.freeze({ columns: 4, rows: 2 }),
  top: Object.freeze({ columns: 4, rows: 2 }),
})
const FLIGHT = new Set([5, 6, 13, 14])
export const SPRINT_BOSS_CHARACTER_SIZE = 1.08
export const SPRINT_BOSS_GESTURE_MS = 2600

// Landmarks measured against the unmodified generated PNGs. The realistic run
// sheet has uneven row spacing; its transparent gaps define the source rows.
// Keep one pixel scale per atlas so neither a stride nor raised arms resize it.
const LANDMARKS = {
  realistic: {
    run: {
      rows: [0, 336, 632, 939, 1254],
      headX: [187.905, 189.277, 167.190, 169.619, 190.404, 188.866, 174.897, 173.584, 188.215, 182.447, 164.818, 171.517, 192.601, 190.457, 174.920, 174.679],
      headY: [50, 54, 51, 53, 17, 15, 18, 19, 17, 21, 18, 19, 21, 21, 24, 23],
      soleY: [317, 316, 316, 318, 275, 256, 267, 275, 283, 283, 282, 283, 285, 259, 284, 286],
    },
    poses: { nominal: 407, soleY: [423, 423, 423, 423, 422, 422, 422, 421] },
  },
  pixel: {
    run: {
      rows: [0, 314, 627, 941, 1254],
      headX: [188.809, 186.136, 183.471, 187.098, 188.562, 186.781, 188.571, 189.416, 188.919, 187.802, 189.036, 188.424, 190.714, 188.521, 189.894, 190.008],
      headY: [14, 15, 14, 15, 13, 16, 15, 13, 16, 15, 16, 15, 16, 17, 16, 17],
      soleY: [307, 307, 307, 303, 304, 263, 294, 306, 308, 308, 308, 303, 301, 268, 305, 305],
    },
    poses: { nominal: 406, soleY: [421, 421, 421, 421, 421, 420, 421, 421] },
  },
}

function calibratedFrames(art, sheet) {
  const run = sheet === 'run'
  const top = sheet === 'top'
  const size = run ? [1254, 1254] : [1774, 887]
  const rows = run ? LANDMARKS[art].run.rows : [0, 444, 887]
  const landmark = LANDMARKS[art][sheet]
  const heights = run ? landmark.soleY.map((sole, index) => sole - landmark.headY[index])
    .filter((_, index) => !FLIGHT.has(index)).sort((a, b) => a - b) : []
  const nominal = run ? (heights[5] + heights[6]) / 2 : landmark?.nominal
  return Object.freeze(Array.from({ length: run ? 16 : 8 }, (_, index) => {
    const column = index % 4
    const row = Math.floor(index / 4)
    const left = Math.round(column * size[0] / 4)
    const right = Math.round((column + 1) * size[0] / 4)
    const width = right - left
    const height = rows[row + 1] - rows[row]
    const grounded = !run || !FLIGHT.has(index)
    return Object.freeze({
      anchorX: run ? landmark.headX[index] / width - .13 : .5,
      anchorY: top ? .5 : (run && !grounded ? landmark.headY[index] + nominal : landmark.soleY[index]) / height,
      displayHeight: top ? 108 * height / width : 120 * height / nominal,
      displayWidth: top ? 108 : 120 * width / nominal,
      grounded,
      // The voxel overhead resting/gesture row faces north in the source.
      // Rotate only those cells at draw time to match the race's eastward view.
      rotation: top && art === 'pixel' && index >= 4 ? Math.PI / 2 : 0,
      sourceRect: Object.freeze([left / size[0], rows[row] / size[1], right / size[0], rows[row + 1] / size[1]]),
    })
  }))
}

function spriteSet(art) {
  const filename = art === 'pixel' ? 'voxel' : art
  return Object.freeze({
    run: Object.freeze({ src: `${ROOT}/${filename}-run-side.png`, ...LAYOUTS.run, frames: calibratedFrames(art, 'run') }),
    poses: Object.freeze({ src: `${ROOT}/${filename}-poses-side.png`, ...LAYOUTS.poses, frames: calibratedFrames(art, 'poses') }),
    top: Object.freeze({ src: `${ROOT}/${filename}-top.png`, ...LAYOUTS.top, frames: calibratedFrames(art, 'top') }),
  })
}

export const SPRINT_BOSS_SPRITES = Object.freeze({
  realistic: spriteSet('realistic'),
  pixel: spriteSet('pixel'),
})

export function getSprintBossAssets(art = 'realistic') {
  return Object.hasOwn(SPRINT_BOSS_SPRITES, art) ? SPRINT_BOSS_SPRITES[art] : SPRINT_BOSS_SPRITES.realistic
}

function progress(elapsedMs, durationMs) {
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : SPRINT_BOSS_GESTURE_MS
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  return Math.min(1, elapsed / duration)
}

/** The intro lowers the arms again; a winner holds the signature final pose. */
export function getSprintBossGestureFrame(phase = 'intro', elapsedMs = 0, durationMs = SPRINT_BOSS_GESTURE_MS) {
  const t = progress(elapsedMs, durationMs)
  if (phase === 'victory') {
    if (t < .08) return 1
    if (t < .2) return 2
    if (t < .34) return 3
    if (t < .55) return 4
    if (t < .88) return 5
    return 4
  }
  if (t < .08) return 0
  if (t < .2) return 2
  if (t < .34) return 3
  if (t < .55) return 4
  if (t < .76) return 5
  if (t < .9) return 6
  return 7
}

/** Only presentation data: never advances a race or changes an input event. */
export function getSprintBossSample(race, view = 'side', art = 'realistic', victory = null) {
  const assets = getSprintBossAssets(art)
  const top = view === 'top'
  const pose = getSprintPose(race || { status: 'idle', distance: 0, speed: 0 })
  const won = Boolean(victory?.won && race?.status === 'finished')
  let sheet = top ? 'top' : 'poses'
  let index = top ? 4 : race?.status === 'finished' ? 1 : 0
  if (pose.moving) {
    sheet = top ? 'top' : 'run'
    index = Math.min(top ? 3 : 15, Math.floor(pose.phase * (top ? 4 : 16)))
  } else if (race?.status === 'finished') {
    index = top ? 5 : 1
  }
  if (won) {
    const elapsedMs = victory.celebrationElapsedMs
    const durationMs = victory.celebrationDurationMs
    index = top
      ? (progress(elapsedMs, durationMs) < .3 ? 6 : 7)
      : getSprintBossGestureFrame('victory', elapsedMs, durationMs)
  }
  const asset = assets[sheet]
  return { sheet, index, src: asset.src, ...asset.frames[index], phase: pose.phase, jump: 0, won }
}

export function getSprintBossPortraitSample(art, phase, elapsedMs, durationMs) {
  const asset = getSprintBossAssets(art).poses
  const index = getSprintBossGestureFrame(phase, elapsedMs, durationMs)
  return { sheet: 'poses', index, src: asset.src, ...asset.frames[index], phase: 0, jump: 0, won: phase === 'victory' }
}

/** Shared rounded edges avoid seams and neighboring-cell leakage. */
export function getSprintBossSpriteRect(width, height, sheet, index, sourceRect) {
  const layout = Object.hasOwn(LAYOUTS, sheet) ? LAYOUTS[sheet] : null
  if (!layout || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < layout.columns || height < layout.rows || !Number.isInteger(index)
    || index < 0 || index >= layout.columns * layout.rows) return null
  if (sourceRect !== undefined) {
    if (!Array.isArray(sourceRect) || sourceRect.length !== 4 || !sourceRect.every(Number.isFinite)
      || sourceRect[0] < 0 || sourceRect[1] < 0 || sourceRect[2] > 1 || sourceRect[3] > 1
      || sourceRect[0] >= sourceRect[2] || sourceRect[1] >= sourceRect[3]) return null
    const x = Math.round(sourceRect[0] * width)
    const y = Math.round(sourceRect[1] * height)
    const right = Math.round(sourceRect[2] * width)
    const bottom = Math.round(sourceRect[3] * height)
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
  }
  const column = index % layout.columns
  const row = Math.floor(index / layout.columns)
  const x = Math.round(column * width / layout.columns)
  const y = Math.round(row * height / layout.rows)
  const right = Math.round((column + 1) * width / layout.columns)
  const bottom = Math.round((row + 1) * height / layout.rows)
  return { x, y, width: right - x, height: bottom - y }
}

/** A single containing scale keeps portrait poses stable, including raised hands. */
export function getSprintBossPortraitScale(art, width = 360, height = 360, padding = 18) {
  const frames = getSprintBossAssets(art).poses.frames
  const left = Math.max(...frames.map(frame => frame.anchorX * frame.displayWidth))
  const right = Math.max(...frames.map(frame => (1 - frame.anchorX) * frame.displayWidth))
  const above = Math.max(...frames.map(frame => frame.anchorY * frame.displayHeight))
  const below = Math.max(...frames.map(frame => (1 - frame.anchorY) * frame.displayHeight))
  return Math.max(.01, Math.min((width - padding * 2) / (2 * Math.max(left, right)), (height - padding * 2) / (above + below)))
}

/** Used by the race canvas and by the intro/victory portrait. */
export function drawSprintBossSprite(ctx, x, y, image, sample, { shadow = true, scale = 1 } = {}) {
  const source = getSprintBossSpriteRect(image?.naturalWidth, image?.naturalHeight, sample.sheet, sample.index, sample.sourceRect)
  if (!source) return false
  const top = sample.sheet === 'top'
  const height = top ? sample.displayWidth * source.height / source.width * scale : sample.displayHeight * scale
  const width = top ? sample.displayWidth * scale : height * source.width / source.height
  ctx.save()
  try {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (shadow) {
      ctx.beginPath()
      ctx.ellipse(x - 1, y + (top ? 4 : 3), (top ? 29 : 25) * scale, (top ? 10 : 3.8) * scale, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(32,28,12,.24)'
      ctx.fill()
    }
    ctx.translate(x, y - sample.jump)
    if (sample.rotation) ctx.rotate(sample.rotation)
    ctx.drawImage(image, source.x, source.y, source.width, source.height,
      -width * sample.anchorX, -height * sample.anchorY, width, height)
    return true
  } catch {
    return false
  } finally {
    ctx.restore()
  }
}

/** A visible gold/green fallback keeps a missing boss image distinct from rivals. */
export function drawSprintBossFallback(ctx, x, y, sample, scale = 1) {
  const top = sample.sheet === 'top'
  const swing = Math.sin(sample.phase * Math.PI * 2)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const line = (points, color, width) => {
    ctx.beginPath()
    ctx.moveTo(...points[0])
    points.slice(1).forEach(point => ctx.lineTo(...point))
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.stroke()
  }
  if (top) {
    line([[-8, -6], [-28 + swing * 12, -11]], '#75462e', 8)
    line([[-8, 6], [-28 - swing * 12, 11]], '#965d3a', 8)
    line([[-28 + swing * 12, -11], [-34 + swing * 12, -11]], '#d7ed46', 6)
    line([[-28 - swing * 12, 11], [-34 - swing * 12, 11]], '#d7ed46', 6)
    line([[6, 0], [-10, 0]], '#192923', 18)
    line([[5, -5], [19, -5]], '#edd23e', 11)
    line([[5, 5], [19, 5]], '#edd23e', 11)
    line([[3, -10], [-4 - swing * 12, -20]], '#855130', 6)
    line([[3, 10], [-4 + swing * 12, 20]], '#a56b43', 6)
    ctx.fillStyle = '#29241c'
    ctx.beginPath(); ctx.arc(27, 0, 8, 0, Math.PI * 2); ctx.fill()
  } else {
    line([[-5, -51], [-18 + swing * 19, -27], [-22 + swing * 28, -3]], '#75462e', 9)
    line([[5, -51], [17 - swing * 18, -29], [20 - swing * 28, -3]], '#9a5f3a', 9)
    line([[-22 + swing * 28, -2], [-12 + swing * 28, -2]], '#d7ed46', 6)
    line([[20 - swing * 28, -2], [30 - swing * 28, -2]], '#d7ed46', 6)
    line([[-7, -54], [8, -54]], '#192923', 20)
    line([[-2, -90], [1, -63]], '#efd138', 27)
    line([[-13, -85], [-10, -65]], '#1e7750', 5)
    const bolt = sample.sheet === 'poses' && sample.index >= 3 && sample.index <= 5
    if (bolt) {
      line([[2, -88], [30, -107], [58, -130]], '#9a5f3a', 7)
      line([[-7, -88], [-28, -91], [-2, -111]], '#75462e', 7)
    } else {
      line([[-9, -87], [-22 - swing * 12, -70], [-9 - swing * 14, -61]], '#75462e', 7)
      line([[9, -87], [22 + swing * 12, -72], [30 + swing * 14, -86]], '#9a5f3a', 7)
    }
    ctx.fillStyle = '#8c5534'
    ctx.beginPath(); ctx.arc(7, -108, 10, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#25231d'
    ctx.beginPath(); ctx.ellipse(6, -113, 10, 6, 0, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}
