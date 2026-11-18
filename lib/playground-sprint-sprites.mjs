import { getSprintPose } from './playground-sprint-pose.mjs'

const SPRITE_ROOT = '/images/playground/sprint/sprites/20261117'
const SHEETS = Object.freeze({
  side: Object.freeze({ columns: 4, rows: 3, runFrames: 8, idleFrame: 8, finishFrame: 9 }),
  top: Object.freeze({ columns: 3, rows: 2, runFrames: 4, idleFrame: 4, finishFrame: 4 }),
})

function spriteSet(art) {
  return Object.freeze({
    side: Object.freeze({
      src: `${SPRITE_ROOT}/runner-${art}-side.png`,
      columns: SHEETS.side.columns,
      rows: SHEETS.side.rows,
      anchorX: .5,
      anchorY: art === 'voxel' ? 350 / 362 : 349 / 362,
      runAnchorY: art === 'voxel' ? 333 / 362 : 349 / 362,
      displayWidth: 142,
      displayHeight: 142,
    }),
    top: Object.freeze({
      src: `${SPRITE_ROOT}/runner-${art}-top.png`,
      columns: SHEETS.top.columns,
      rows: SHEETS.top.rows,
      anchorX: .5,
      anchorY: .5,
      displayWidth: 100,
      displayHeight: 100,
    }),
  })
}

export const SPRINT_SPRITES = Object.freeze({
  realistic: spriteSet('realistic'),
  pixel: spriteSet('voxel'),
})

/** Sample the existing distance/celebration pose, without advancing the race. */
export function getSprintSpriteFrame(race, view = 'side', celebration = null) {
  const camera = view === 'top' ? 'top' : 'side'
  const sheet = SHEETS[camera]
  const pose = getSprintPose(race, celebration)
  let index = race.status === 'finished' ? sheet.finishFrame : sheet.idleFrame

  if (pose.moving) index = Math.min(sheet.runFrames - 1, Math.floor(pose.phase * sheet.runFrames))
  if (pose.celebrating) {
    index = camera === 'top'
      ? (pose.celebrationProgress < .45 ? 4 : 5)
      : (pose.celebrationProgress < .2 ? 9 : pose.celebrationProgress < .7 ? 10 : 11)
  }

  return {
    index,
    columns: sheet.columns,
    rows: sheet.rows,
    jump: pose.jump * (camera === 'top' ? .4 : 1),
    phase: pose.phase,
  }
}

/** Round shared cell edges so non-divisible pixel dimensions stay in bounds. */
export function getSprintSpriteRect(imageWidth, imageHeight, view, index) {
  const sheet = Object.hasOwn(SHEETS, view) ? SHEETS[view] : null
  if (!sheet || !Number.isInteger(imageWidth) || !Number.isInteger(imageHeight)
    || imageWidth < sheet.columns || imageHeight < sheet.rows
    || !Number.isInteger(index) || index < 0 || index >= sheet.columns * sheet.rows) return null

  const column = index % sheet.columns
  const row = Math.floor(index / sheet.columns)
  const x = Math.round(column * imageWidth / sheet.columns)
  const y = Math.round(row * imageHeight / sheet.rows)
  const right = Math.round((column + 1) * imageWidth / sheet.columns)
  const bottom = Math.round((row + 1) * imageHeight / sheet.rows)
  return { x, y, width: right - x, height: bottom - y }
}
