const ROOT = '/images/playground/sprint/reactions/20261118'
export const SPRINT_DEFEAT_DURATION_MS = 2400

// Read-only landmark measurements from the approved 1774×887 PNGs. The same
// pixel scale is used through a reaction, so leaning lowers the head naturally.
// Its initial standing height/overhead length matches the existing idle atlas.
const LANDMARKS = {
  realistic: {
    side: {
      nominal: 407, idleSize: (349 - 19) * 142 / 362,
      soleY: [428, 429, 429, 432, 428, 427, 428, 428],
      footX: [222.5, 214, 206.5, 198, 210.5, 206, 205.5, 200],
    },
    top: {
      nominal: 326, idleSize: (435 - 88) * 100 / 512,
      shoeX: [91.787, 79.791, 71.372, 61.357, 92.235, 80.214, 71.510, 61.596],
      shoeY: [253.863, 248.049, 246.915, 247.643, 240.115, 240.882, 240.715, 240.885],
    },
  },
  pixel: {
    side: {
      nominal: 408, idleSize: (350 - 15) * 142 / 362,
      soleY: [427, 427, 427, 427, 426, 426, 426, 426],
      footX: [228, 226.5, 223.5, 220, 219.5, 219.5, 221.5, 225.5],
    },
    top: {
      nominal: 305, idleSize: (428 - 78) * 100 / 512,
      shoeX: [106.390, 105.075, 101.531, 100.199, 105.644, 104.014, 102.895, 100.974],
      shoeY: [226.875, 227.164, 226.992, 226.567, 226.027, 226.994, 226.971, 225.752],
    },
  },
}

function frames(art, view) {
  const landmarks = LANDMARKS[art][view]
  const pixelScale = landmarks.idleSize / landmarks.nominal
  return Object.freeze(Array.from({ length: 8 }, (_, index) => {
    const column = index % 4
    const row = Math.floor(index / 4)
    const left = Math.round(column * 1774 / 4)
    const right = Math.round((column + 1) * 1774 / 4)
    const upper = Math.round(row * 887 / 2)
    const lower = Math.round((row + 1) * 887 / 2)
    const width = right - left
    const height = lower - upper
    return Object.freeze({
      anchorX: (view === 'side' ? landmarks.footX[index] : landmarks.shoeX[index] + 222 - landmarks.shoeX[0]) / width,
      anchorY: (view === 'side' ? landmarks.soleY[index] : landmarks.shoeY[index] + 222 - landmarks.shoeY[0]) / height,
      displayHeight: height * pixelScale,
      displayWidth: width * pixelScale,
      rotation: 0,
      sourceRect: Object.freeze([left / 1774, upper / 887, right / 1774, lower / 887]),
    })
  }))
}

function assets(art) {
  return Object.freeze(Object.fromEntries(['side', 'top'].map(view => [view, Object.freeze({
    src: `${ROOT}/${art === 'pixel' ? 'voxel' : art}-${view}.png`,
    columns: 4,
    rows: 2,
    frames: frames(art, view),
  })])))
}

export const SPRINT_REACTION_SPRITES = Object.freeze({
  realistic: assets('realistic'),
  pixel: assets('pixel'),
})

export function getSprintReactionAssets(art = 'realistic', view = 'side') {
  const style = Object.hasOwn(SPRINT_REACTION_SPRITES, art) ? art : 'realistic'
  return SPRINT_REACTION_SPRITES[style][view === 'top' ? 'top' : 'side']
}

/** Presentation only: the reaction clock never changes race or replay time. */
export function getSprintReactionSample(celebration, view = 'side', art = 'realistic') {
  if (celebration?.kind !== 'defeat') return null
  const elapsedMs = Number.isFinite(celebration.elapsedMs) ? Math.max(0, celebration.elapsedMs) : 0
  const durationMs = Number.isFinite(celebration.durationMs) && celebration.durationMs > 0
    ? celebration.durationMs : SPRINT_DEFEAT_DURATION_MS
  const index = Math.min(7, Math.floor(Math.min(1, elapsedMs / durationMs) * 8))
  const asset = getSprintReactionAssets(art, view)
  return { ...asset.frames[index], index, src: asset.src, view: view === 'top' ? 'top' : 'side', kind: 'defeat' }
}

/** A winning boss is drawn after the player without altering lane or position. */
export function splitSprintRivalLayers(rivals, bossState) {
  const back = []
  const front = []
  for (const rival of rivals) (rival.isBoss && bossState?.won ? front : back).push(rival)
  return { back, front }
}

export function getSprintRivalOpacity(rival, bossState) {
  return rival.isBoss ? bossState?.won ? 1 : .78 : .4
}

export function getSprintReactionRect(width, height, index, sourceRect) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 4 || height < 2
    || !Number.isInteger(index) || index < 0 || index > 7) return null
  let bounds = sourceRect
  if (bounds === undefined) {
    const column = index % 4
    const row = Math.floor(index / 4)
    bounds = [column / 4, row / 2, (column + 1) / 4, (row + 1) / 2]
  }
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)
    || bounds[0] < 0 || bounds[1] < 0 || bounds[2] > 1 || bounds[3] > 1
    || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) return null
  const x = Math.round(bounds[0] * width)
  const y = Math.round(bounds[1] * height)
  const right = Math.round(bounds[2] * width)
  const bottom = Math.round(bounds[3] * height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

export function drawSprintReactionSprite(ctx, x, y, image, sample) {
  const source = getSprintReactionRect(image?.naturalWidth, image?.naturalHeight, sample.index, sample.sourceRect)
  if (!source) return false
  const top = sample.view === 'top'
  const height = top ? sample.displayWidth * source.height / source.width : sample.displayHeight
  const width = top ? sample.displayWidth : height * source.width / source.height
  ctx.save()
  try {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.beginPath()
    ctx.ellipse(x - 1, y + (top ? 4 : 3), top ? 27 : 23, top ? 10 : 3.5, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(24,31,24,.24)'
    ctx.fill()
    ctx.translate(x, y)
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

/** An unavailable defeat atlas must never display the existing victory pose. */
export function drawSprintDefeatFallback(ctx, x, y, sample) {
  const knees = sample.index >= 2 && sample.index <= 4
  const forehead = sample.index === 5
  const pixel = sample.src.includes('voxel')
  ctx.save()
  ctx.translate(x, y)
  ctx.lineCap = pixel ? 'square' : 'round'
  ctx.lineJoin = pixel ? 'miter' : 'round'
  const line = (points, color, width) => {
    ctx.beginPath()
    ctx.moveTo(...points[0])
    points.slice(1).forEach(point => ctx.lineTo(...point))
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.stroke()
  }
  if (sample.view === 'top') {
    line([[-9, -8], [-33, -10]], '#b78157', 8)
    line([[-9, 8], [-33, 10]], '#cf9969', 8)
    line([[-32, -10], [-39, -10]], '#e4dfbb', 6)
    line([[-32, 10], [-39, 10]], '#e4dfbb', 6)
    line([[2, 0], [-12, 0]], '#233c31', 19)
    line([[6, 0], [20, 0]], '#3b8068', 23)
    line([[5, -11], [knees ? -13 : 14, -21], [knees ? -28 : forehead ? 28 : 0, -12]], '#b78157', 6)
    line([[5, 11], [knees ? -13 : 14, 21], [knees ? -28 : 0, 13]], '#cf9969', 6)
    ctx.fillStyle = '#d19b68'
    ctx.beginPath(); ctx.arc(knees ? 18 : 27, 0, 9, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#29382d'
    ctx.beginPath(); ctx.ellipse(knees ? 17 : 26, -1, 8, 7, 0, 0, Math.PI * 2); ctx.fill()
  } else {
    const shoulder = knees ? [12, -73] : [0, -84]
    const head = knees ? [23, -87] : [8, -105]
    line([[-6, -52], [-13, -28], [-16, -2]], '#b78157', 9)
    line([[5, -52], [14, -29], [18, -2]], '#cf9969', 9)
    line([[-17, -2], [-7, -2]], '#dedaba', 6)
    line([[17, -2], [27, -2]], '#eee5bc', 6)
    line([[-7, -53], [8, -53]], '#233c31', 21)
    line([shoulder, [0, -63]], '#3b8068', 27)
    line([[shoulder[0] - 10, shoulder[1]], knees ? [-11, -54] : [-19, -63], knees ? [-12, -34] : [-17, -46]], '#b78157', 7)
    line([[shoulder[0] + 9, shoulder[1]], forehead ? [26, -80] : knees ? [24, -54] : [20, -63], forehead ? [17, -103] : knees ? [15, -34] : [18, -46]], '#cf9969', 7)
    ctx.fillStyle = '#d19b68'
    ctx.beginPath(); ctx.ellipse(head[0], head[1], 10, 11, .25, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#29382d'
    ctx.beginPath(); ctx.ellipse(head[0] - 2, head[1] - 4, 10, 7, .25, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}
