import { BASEBALL_RULES } from './playground-baseball.mjs'

// Presentation coordinates for the approved 1672×941 ballpark image.
// These source-pixel landmarks never change pitch or batting rules.
export const BASEBALL_BALLPARK_LANDMARKS = Object.freeze({
  width: 1672,
  height: 941,
  // Source-pixel edges: the visible white front edge spans x773 through x902.
  plateFrontLeft: Object.freeze({ x: 773, y: 724 }),
  plateFrontRight: Object.freeze({ x: 903, y: 724 }),
  plateFront: Object.freeze({ x: 838, y: 724 }),
  plateBack: Object.freeze({ x: 838, y: 774 }),
  mound: Object.freeze({ x: 838, y: 456 }),
})
const BALLPARK = BASEBALL_BALLPARK_LANDMARKS

// All points are local raw pixels of frame 4, not coordinates in the full atlas.
export const BASEBALL_PITCHER_RELEASE_SPRITE = Object.freeze({
  frame: 4,
  cellWidth: 443.5,
  cellHeight: 443.5,
  hand: Object.freeze({ x: 180, y: 80 }),
  foot: Object.freeze({ x: 265, y: 430 }),
})
const DEFAULT_RELEASE = Object.freeze({ x: -0.34, y: 1.8, z: BASEBALL_RULES.releaseDistanceM })
const BOXES = Object.freeze({
  right: Object.freeze([[500, 675], [740, 675], [700, 853], [332, 851]].map(Object.freeze)),
  left: Object.freeze([[935, 675], [1175, 675], [1334, 853], [982, 853]].map(Object.freeze)),
})
// Conservative source-pixel interior for visual shoe audits, separately from
// the painted-line centre used for the established camera/stance. The ragged
// paint was reviewed visually; these are not surveyed or official rule edges.
const BOX_INTERIORS = Object.freeze({
  right: Object.freeze([[508, 684], [727, 684], [682, 837], [369, 837]].map(Object.freeze)),
  left: Object.freeze([[946, 684], [1169, 684], [1309, 837], [995, 837]].map(Object.freeze)),
})
// Midpoint of both soles in each ready image, relative to its front-sole anchor.
// Keep the existing per-frame front-sole registration throughout the swing.
const STANCE_OFFSET = Object.freeze({
  right: Object.freeze({ x: -140, y: 70 }),
  left: Object.freeze({ x: 180, y: 70 }),
})
// Whole-pose support-centre registration: one scale for all eight poses and a
// source-image-relative ceiling, with the existing viewport safety caps below.
// The default fit remains available for the original front-sole comparison.
export const BASEBALL_BATTER_FIT_OPTIONS = Object.freeze({
  anchorOffset: Object.freeze({ x: 0, y: 0 }),
  maxSourceScale: 0.42,
})
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const cross = (a, b) => a.x * b.y - a.y * b.x
const difference = (a, b) => ({ x: a[0] - b[0], y: a[1] - b[1] })

function sourcePoint(stage, point) {
  const scale = stage.background.width / BALLPARK.width
  return { x: stage.background.x + point.x * scale, y: stage.background.y + point.y * scale }
}

function groundDepth() {
  const endZ = BASEBALL_RULES.plateEndZ
  const releaseZ = BASEBALL_RULES.releaseDistanceM
  const ratio = (BALLPARK.plateBack.y - BALLPARK.plateFront.y) / (BALLPARK.mound.y - BALLPARK.plateFront.y)
  return endZ * releaseZ * (1 - ratio) / (ratio * releaseZ - endZ)
}

function boxCenter([a, b, c, d]) {
  // The crossing of diagonals is the perspective image of a rectangle's center.
  const ac = difference(c, a)
  const bd = difference(d, b)
  const amount = cross(difference(b, a), bd) / cross(ac, bd)
  return { x: a[0] + ac.x * amount, y: a[1] + ac.y * amount }
}

export function createBaseballStage(width, height, handedness = 'right') {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('Invalid baseball stage size.')
  const hand = handedness === 'left' ? 'left' : 'right'
  const center = boxCenter(BOXES[hand])
  const scale = Math.max(width / BALLPARK.width, height / BALLPARK.height)
  const imageWidth = BALLPARK.width * scale
  const imageHeight = BALLPARK.height * scale
  const centeredX = (width - imageWidth) / 2
  // Portrait cover cropping otherwise puts the active box against the screen edge.
  // Move the complete background camera, including its plate/ball projection origin.
  const preferredX = width / height < 1.35
    ? width * (hand === 'right' ? 0.34 : 0.66) - center.x * scale
    : centeredX
  const x = clamp(preferredX, width - imageWidth, 0)
  // Wide desktop fields must retain the foreground box instead of cropping its floor.
  const margin = Math.min(12, width * 0.025)
  const lowestBoxY = Math.max(...BOXES[hand].map(([, sourceY]) => sourceY))
  const y = clamp(Math.min((height - imageHeight) / 2, height - margin - lowestBoxY * scale), height - imageHeight, 0)
  const project = ([sourceX, sourceY]) => ({ x: x + sourceX * scale, y: y + sourceY * scale })
  const stage = {
    width, height, hand,
    sourceScale: scale,
    background: { x, y, width: imageWidth, height: imageHeight },
    centerX: x + BALLPARK.plateFront.x * scale,
    cameraShiftY: y - (height - imageHeight) / 2,
    box: BOXES[hand].map(project),
    boxInterior: BOX_INTERIORS[hand].map(project),
    stance: project([center.x, center.y]),
  }
  stage.landmarks = Object.fromEntries(['plateFrontLeft', 'plateFrontRight', 'plateFront', 'plateBack', 'mound'].map(name => [name, sourcePoint(stage, BALLPARK[name])]))
  return stage
}

export function createBaseballProjection(stage) {
  if (!stage?.background || ![stage.width, stage.height, stage.background.width, stage.background.height].every(value => Number.isFinite(value) && value > 0) ||
      ![stage.background.x, stage.background.y].every(Number.isFinite)) throw new TypeError('Invalid baseball stage.')
  const { width, height } = stage
  const front = sourcePoint(stage, BALLPARK.plateFront)
  const mound = sourcePoint(stage, BALLPARK.mound)
  const centerX = front.x
  const nearGround = front.y
  const moundGround = mound.y
  // A 17-inch plate and the picture's 130px front edge define one shared m→px scale.
  // There is deliberately no mobile-only minimum: that would enlarge the ball/bat
  // relative to the photographed plate while leaving the background unchanged.
  const nearScale = (BALLPARK.plateFrontRight.x - BALLPARK.plateFrontLeft.x) * stage.background.width / BALLPARK.width / -BASEBALL_RULES.plateEndZ
  const depth = groundDepth()
  const moundBlend = BASEBALL_RULES.releaseDistanceM / (BASEBALL_RULES.releaseDistanceM + depth)
  function plane(z) {
    if (!Number.isFinite(z)) throw new TypeError('Invalid baseball projection depth.')
    const distance = Math.max(-depth + 0.001, z)
    const scale = nearScale / (1 + distance / depth)
    const blend = distance / (distance + depth)
    const ground = nearGround + (moundGround - nearGround) * blend / moundBlend
    return { scale, ground }
  }
  return {
    width, height, centerX, nearScale, nearGround, moundGround, depth,
    project({ x, y, z = 0 }) {
      if (![x, y].every(Number.isFinite)) throw new TypeError('Invalid baseball projection point.')
      const { scale, ground } = plane(z)
      return { x: centerX + x * scale, y: ground - y * scale, scale, ground }
    },
    unproject(x, y) {
      if (![x, y].every(Number.isFinite)) throw new TypeError('Invalid baseball screen point.')
      return {
        x: clamp((x - centerX) / nearScale, BASEBALL_RULES.aimBounds.left, BASEBALL_RULES.aimBounds.right),
        y: clamp((nearGround - y) / nearScale, BASEBALL_RULES.aimBounds.bottom, BASEBALL_RULES.aimBounds.top),
      }
    },
  }
}

/** Uniform transform shared by every atlas pose; only frame 4 supplies calibration.
 * Hand X/Y coincide with the physical release and the front sole shares mound Y.
 * Foot X may differ slightly from mound center; we never stretch the body to force it.
 */
export function createBaseballPitcherPlacement(projection, options = {}) {
  if (typeof projection?.project !== 'function') throw new TypeError('Invalid baseball projection.')
  const { cellWidth = BASEBALL_PITCHER_RELEASE_SPRITE.cellWidth, cellHeight = BASEBALL_PITCHER_RELEASE_SPRITE.cellHeight,
    hand = BASEBALL_PITCHER_RELEASE_SPRITE.hand, foot = BASEBALL_PITCHER_RELEASE_SPRITE.foot,
    release = DEFAULT_RELEASE } = options
  if (![cellWidth, cellHeight].every(value => Number.isFinite(value) && value > 0) ||
      ![hand?.x, hand?.y, foot?.x, foot?.y, release?.x, release?.y, release?.z].every(Number.isFinite) ||
      hand.x < 0 || hand.x > cellWidth || foot.x < 0 || foot.x > cellWidth || hand.y < 0 || foot.y > cellHeight ||
      foot.y <= hand.y || release.y <= 0 || release.z <= 0) throw new RangeError('Invalid pitcher release geometry.')
  const releasePoint = projection.project(release)
  const moundPoint = projection.project({ x: 0, y: 0, z: release.z })
  const scale = (moundPoint.ground - releasePoint.y) / (foot.y - hand.y)
  const width = cellWidth * scale
  const height = cellHeight * scale
  const x = releasePoint.x - hand.x * scale
  const y = moundPoint.ground - foot.y * scale
  return {
    x, y, width, height, scale,
    // Compatible with the existing drawFrame(..., centerX, floorY, height) contract.
    centerX: x + width / 2,
    floorY: y + height * 0.985,
    releasePoint,
    handPoint: { x: x + hand.x * scale, y: y + hand.y * scale },
    footPoint: { x: x + foot.x * scale, y: y + foot.y * scale },
    moundPoint,
    source: { cellWidth, cellHeight, hand: { ...hand }, foot: { ...foot } },
  }
}

/** Bounds cover all decoded poses relative to the selected registration anchor. */
export function fitBaseballBatter(stage, bounds, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Invalid batter fit options.')
  const offset = options.anchorOffset === undefined ? STANCE_OFFSET[stage.hand] : options.anchorOffset
  if (!offset || ![offset.x, offset.y].every(Number.isFinite)) throw new TypeError('Invalid batter registration offset.')
  if (options.maxSourceScale !== undefined && (!Number.isFinite(options.maxSourceScale) || options.maxSourceScale <= 0)) {
    throw new RangeError('Invalid batter source scale cap.')
  }
  if (!bounds || ![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite) ||
      bounds.left >= bounds.right || bounds.top >= bounds.bottom) throw new RangeError('Invalid batter pose bounds.')
  const left = bounds.left - offset.x
  const right = bounds.right - offset.x
  const top = bounds.top - offset.y
  const bottom = bounds.bottom - offset.y
  const margin = Math.min(12, stage.width * 0.025)
  const fits = [stage.height * 0.86 / (bottom - top)]
  if (options.maxSourceScale !== undefined) {
    if (!Number.isFinite(stage.sourceScale) || stage.sourceScale <= 0) throw new TypeError('Invalid baseball source scale.')
    fits.push(stage.sourceScale * options.maxSourceScale)
  }
  if (left < 0) fits.push((stage.stance.x - margin) / -left)
  if (right > 0) fits.push((stage.width - margin - stage.stance.x) / right)
  if (top < 0) fits.push((stage.stance.y - margin) / -top)
  if (bottom > 0) fits.push((stage.height - margin - stage.stance.y) / bottom)
  const scale = Math.max(0.001, Math.min(...fits))
  return {
    x: stage.stance.x - offset.x * scale,
    y: stage.stance.y - offset.y * scale,
    scale,
    stance: stage.stance,
  }
}
