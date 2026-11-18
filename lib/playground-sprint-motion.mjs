import { getSprintPose } from './playground-sprint-pose.mjs'

const FRAME_COUNT = 16
const SPRITE_ROOT = '/images/playground/sprint/motion/20261117'
const FLIGHT_FRAMES = new Set([5, 6, 13, 14])
const HEAD_TO_GROUND_HEIGHT = 120

// Normalized landmarks measured from the approved 4×4 source cells.
// Align supported feet exactly, while preserving clearance in flight poses.
const LANDMARKS = {
  realistic: {
    headX: [.6014, .5931, .5735, .5523, .6035, .5979, .5777, .5668, .6037, .5917, .5644, .5530, .6096, .6018, .5802, .5655],
    headY: [.2737, .2690, .2676, .2691, .2280, .2238, .2232, .2270, .1812, .1825, .1812, .1841, .1389, .1400, .1459, .1425],
    soleY: [.9840, .9872, .9840, .9840, .9389, .8650, .9003, .9389, .9006, .9038, .9071, .9071, .8585, .8006, .8296, .8553],
  },
  pixel: {
    headX: [.6351, .6327, .6355, .6408, .6385, .6407, .6397, .6427, .6367, .6365, .6388, .6421, .6408, .6428, .6417, .6428],
    headY: [.1042, .1040, .1041, .1068, .1099, .1098, .1107, .1109, .1063, .1073, .1060, .1074, .1153, .1170, .1155, .1171],
    soleY: [.9808, .9808, .9808, .9808, .9744, .8494, .9327, .9615, .9904, .9904, .9839, .9582, .9679, .8782, .9615, .9679],
  },
}

function spriteSet(art, landmarks) {
  const supportedHeights = landmarks.soleY
    .map((sole, index) => sole - landmarks.headY[index])
    .filter((_, index) => !FLIGHT_FRAMES.has(index))
    .sort((a, b) => a - b)
  const middle = supportedHeights.length / 2
  const nominal = (supportedHeights[middle - 1] + supportedHeights[middle]) / 2
  const displayHeight = HEAD_TO_GROUND_HEIGHT / nominal
  return Object.freeze({
    src: `${SPRITE_ROOT}/runner-${art === 'pixel' ? 'voxel' : art}-run.png`,
    columns: 4,
    rows: 4,
    frames: Object.freeze(landmarks.headX.map((headX, index) => {
      const grounded = !FLIGHT_FRAMES.has(index)
      return Object.freeze({
        anchorX: headX - .13,
        anchorY: grounded ? landmarks.soleY[index] : landmarks.headY[index] + nominal,
        displayHeight,
        grounded,
      })
    })),
  })
}

export const SPRINT_RUN_SPRITES = Object.freeze({
  realistic: spriteSet('realistic', LANDMARKS.realistic),
  pixel: spriteSet('pixel', LANDMARKS.pixel),
})

/** Read the current distance phase without advancing input, timing or replay. */
export function getSprintRunSample(race, art = 'realistic') {
  if (!race || typeof race !== 'object') return null
  const pose = getSprintPose(race)
  if (!pose.moving) return null
  const sheet = Object.hasOwn(SPRINT_RUN_SPRITES, art) ? SPRINT_RUN_SPRITES[art] : SPRINT_RUN_SPRITES.realistic
  const position = pose.phase * FRAME_COUNT
  const index = Math.min(FRAME_COUNT - 1, Math.floor(position))
  return {
    index,
    phase: pose.phase,
    fraction: position - index,
    ...sheet.frames[index],
  }
}

/** Shared rounded edges cover the atlas once, including non-divisible sizes. */
export function getSprintRunRect(imageWidth, imageHeight, index) {
  if (!Number.isSafeInteger(imageWidth) || !Number.isSafeInteger(imageHeight)
    || imageWidth < 4 || imageHeight < 4
    || !Number.isInteger(index) || index < 0 || index >= FRAME_COUNT) return null
  const column = index % 4
  const row = Math.floor(index / 4)
  const x = Math.round(column * imageWidth / 4)
  const y = Math.round(row * imageHeight / 4)
  const right = Math.round((column + 1) * imageWidth / 4)
  const bottom = Math.round((row + 1) * imageHeight / 4)
  return { x, y, width: right - x, height: bottom - y }
}
