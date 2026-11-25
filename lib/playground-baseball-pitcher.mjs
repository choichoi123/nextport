import { BASEBALL_RULES } from './playground-baseball.mjs'
import { BASEBALL_PITCHER_RELEASE_SPRITE } from './playground-baseball-layout.mjs'

export const BASEBALL_PITCHER_BLEND_MS = 32
export const BASEBALL_PITCHER_TIMELINE = Object.freeze([
  { startMs: 0, frame: 0 },
  { startMs: 200, frame: 1 },
  { startMs: 550, frame: 2 },
  { startMs: 820, frame: 3 },
  { startMs: BASEBALL_RULES.windupMs, frame: 4 },
  { startMs: 1296, frame: 5 },
  { startMs: 1466, frame: 6 },
  { startMs: 1686, frame: 7 },
].map(Object.freeze))

function geometryFor(pitcherHandedness) {
  const source = BASEBALL_PITCHER_RELEASE_SPRITE
  const flipX = pitcherHandedness === 'left'
  const mirrored = point => Object.freeze({ x: flipX ? source.cellWidth - point.x : point.x, y: point.y })
  return Object.freeze({
    pitcherHandedness,
    flipX,
    releaseFrame: source.frame,
    cellWidth: source.cellWidth,
    cellHeight: source.cellHeight,
    // Source-cell coordinates AFTER the render flip, never full-atlas coordinates.
    hand: mirrored(source.hand),
    foot: mirrored(source.foot),
  })
}

const GEOMETRIES = Object.freeze({ right: geometryFor('right'), left: geometryFor('left') })

export function getBaseballPitcherSpriteGeometry(pitcherHandedness = 'right') {
  return GEOMETRIES[pitcherHandedness === 'left' ? 'left' : 'right']
}

const layer = (frame, alpha) => ({ frame, alpha, offsetX: 0, offsetY: 0 })

/** Presentation only: elapsedMs is since windup began, not since ball release.
 * Transitions finish at each key pose. The 1200ms release is a single frame 4,
 * never a blend or a second flight clock. Frame 4 stays alone through 1264ms
 * before the 32ms follow-through blend, covering every 30Hz sampling phase.
 * All registration offsets stay zero
 * until there is reviewed source-image evidence for per-pose foot corrections.
 */
export function sampleBaseballPitcherMotion(elapsedMs, pitcherHandedness = 'right') {
  const geometry = getBaseballPitcherSpriteGeometry(pitcherHandedness)
  const validTime = typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) && elapsedMs >= 0
  const time = validTime ? elapsedMs : 0
  const released = validTime && time >= BASEBALL_RULES.windupMs
  let frame = 0
  let layers = [layer(0, 1)]
  for (let index = 1; index < BASEBALL_PITCHER_TIMELINE.length; index++) {
    const next = BASEBALL_PITCHER_TIMELINE[index]
    if (time >= next.startMs) {
      frame = next.frame
      layers = [layer(frame, 1)]
      continue
    }
    const blendStart = next.startMs - BASEBALL_PITCHER_BLEND_MS
    if (time > blendStart) {
      const progress = (time - blendStart) / BASEBALL_PITCHER_BLEND_MS
      const alpha = progress * progress * (3 - 2 * progress)
      if (alpha >= 1) {
        frame = next.frame
        layers = [layer(frame, 1)]
      } else if (alpha > 0) {
        layers = [layer(frame, 1 - alpha), layer(next.frame, alpha)]
        if (alpha >= 0.5) frame = next.frame
      }
    }
    break
  }
  return { frame, flipX: geometry.flipX, released, layers }
}
