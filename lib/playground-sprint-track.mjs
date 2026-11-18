// Rendering geometry only. Race distance, input cadence and scoring do not
// depend on this scale or on the camera position.
const SIDE_METERS_TO_PIXELS = 56
const OVERVIEW_FINISH_X = 850
const CAMERA_TARGET_X = 320
const CAMERA_FEATHER = 96

export const SPRINT_TRACK = Object.freeze({
  WIDTH: 960,
  HEIGHT: 500,
  startX: 112,
  finishX: 112 + 100 * SIDE_METERS_TO_PIXELS,
  metersToPixels: SIDE_METERS_TO_PIXELS,
  side: Object.freeze({ top: 288, laneHeight: 32, lanes: 6, activeLane: 2, runnerY: 368 }),
  top: Object.freeze({ top: 144, laneHeight: 36, lanes: 8, activeLane: 3, runnerY: 270 }),
})

function clampDistance(distance) {
  return Number.isFinite(distance) ? Math.max(0, Math.min(100, distance)) : 0
}

// A C1-continuous clamp. In each 96px shoulder the camera velocity eases
// between zero and the runner velocity, never overtaking the runner.
function cameraClamp(value, maximum) {
  const half = CAMERA_FEATHER / 2
  if (value <= -half) return 0
  if (value < half) return (value + half) ** 2 / (2 * CAMERA_FEATHER)
  if (value <= maximum - half) return value
  if (value < maximum + half) return maximum - (maximum + half - value) ** 2 / (2 * CAMERA_FEATHER)
  return maximum
}

/** All returned x coordinates are screen coordinates, after camera motion. */
export function getSprintTrackFrame(distance, view = 'side') {
  const topView = view === 'top'
  const layout = topView ? SPRINT_TRACK.top : SPRINT_TRACK.side
  const finish = topView ? OVERVIEW_FINISH_X : SPRINT_TRACK.finishX
  const metersToPixels = topView ? (finish - SPRINT_TRACK.startX) / 100 : SIDE_METERS_TO_PIXELS
  const runnerWorldX = SPRINT_TRACK.startX + clampDistance(distance) * metersToPixels
  const cameraX = topView ? 0 : cameraClamp(runnerWorldX - CAMERA_TARGET_X, finish - OVERVIEW_FINISH_X)
  return {
    cameraX,
    runnerX: runnerWorldX - cameraX,
    startX: SPRINT_TRACK.startX - cameraX,
    finishX: finish - cameraX,
    metersToPixels,
    ...layout,
  }
}

/** Visible 2m ticks, with separate 10m labels and start/finish semantics. */
export function getSprintTrackMarkers(distance, view = 'side') {
  const frame = getSprintTrackFrame(distance, view)
  const markers = []
  for (let meter = 0; meter <= 100; meter += 2) {
    const x = frame.startX + meter * frame.metersToPixels
    if (x < -16 || x > SPRINT_TRACK.WIDTH + 16) continue
    markers.push({ meter, x, major: meter % 10 === 0, kind: meter === 0 ? 'start' : meter === 100 ? 'finish' : 'distance' })
  }
  return markers
}
