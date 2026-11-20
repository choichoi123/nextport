import { SPRINT_TRACK } from './playground-sprint-track.mjs'

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))

/** CSS cover crops the existing 960×500 drawing; it never rescales athletes
 * independently or changes the world camera. Keep a side-view athlete's feet
 * just above the lower edge, or center the top-view lanes in the available crop.
 */
export function getSprintViewportCamera({ width, height, view = 'side', focusY } = {}) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return { scale: 0, visibleHeight: SPRINT_TRACK.HEIGHT, cropTop: 0, objectPositionY: 50 }
  }
  const scale = Math.max(width / SPRINT_TRACK.WIDTH, height / SPRINT_TRACK.HEIGHT)
  const visibleHeight = Math.min(SPRINT_TRACK.HEIGHT, height / scale)
  const cropRange = SPRINT_TRACK.HEIGHT - visibleHeight
  if (cropRange <= 1e-8) return { scale, visibleHeight, cropTop: 0, objectPositionY: 50 }
  const groundY = Number.isFinite(focusY) ? clamp(focusY, 0, SPRINT_TRACK.HEIGHT) : SPRINT_TRACK.side.runnerY
  const topTrackCenter = SPRINT_TRACK.top.top + SPRINT_TRACK.top.lanes * SPRINT_TRACK.top.laneHeight / 2
  const cropTop = clamp(view === 'top' ? topTrackCenter - visibleHeight / 2 : groundY + 8 - visibleHeight, 0, cropRange)
  return { scale, visibleHeight, cropTop, objectPositionY: cropTop / cropRange * 100 }
}
