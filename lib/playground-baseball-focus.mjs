import { BASEBALL_RULES } from './playground-baseball.mjs'

// One shared axis includes slow curves above the zone as well as fastball flight.
export const BASEBALL_FOCUS_BOUNDS = Object.freeze({
  left: BASEBALL_RULES.zone.left - 0.12,
  right: BASEBALL_RULES.zone.right + 0.12,
  bottom: 0.35,
  top: 2.0,
})

const finite = value => typeof value === 'number' && Number.isFinite(value)

function checkPoint(point) {
  if (!point || ![point.x, point.y, point.scale, point.ground].every(finite) || point.scale <= 0) {
    throw new TypeError('Invalid base baseball projection point.')
  }
  return point
}

/** A CSS-pixel affine viewport of the same 3D projection, never a second game.
 * project() retains each point's depth, apparent radius and ground position.
 * unproject() delegates to the original z=0 aiming plane and its aim limits.
 * DPR belongs to canvas rendering, not this CSS-pixel coordinate transform.
 */
export function createBaseballFocusProjection(base, {
  width,
  height,
  padding = 16,
  bounds = BASEBALL_FOCUS_BOUNDS,
} = {}) {
  if (typeof base?.project !== 'function' || typeof base?.unproject !== 'function') {
    throw new TypeError('Invalid base baseball projection.')
  }
  if (![width, height, padding].every(finite) || padding < 0 || width <= padding * 2 || height <= padding * 2) {
    throw new RangeError('Invalid baseball focus viewport.')
  }
  if (!bounds || ![bounds.left, bounds.right, bounds.bottom, bounds.top].every(finite) ||
      bounds.right <= bounds.left || bounds.top <= bounds.bottom) {
    throw new RangeError('Invalid baseball focus world bounds.')
  }
  const topLeft = checkPoint(base.project({ x: bounds.left, y: bounds.top, z: 0 }))
  const bottomRight = checkPoint(base.project({ x: bounds.right, y: bounds.bottom, z: 0 }))
  const sourceRect = {
    left: topLeft.x,
    top: topLeft.y,
    right: bottomRight.x,
    bottom: bottomRight.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2
  const zoom = Math.min(innerWidth / sourceRect.width, innerHeight / sourceRect.height)
  const x = padding + (innerWidth - sourceRect.width * zoom) / 2 - sourceRect.left * zoom
  const y = padding + (innerHeight - sourceRect.height * zoom) / 2 - sourceRect.top * zoom
  if (![sourceRect.width, sourceRect.height, zoom].every(value => finite(value) && value > 0) || ![x, y].every(finite)) {
    throw new RangeError('Invalid baseball focus transform.')
  }
  const viewport = Object.freeze({
    left: padding,
    top: padding,
    right: width - padding,
    bottom: height - padding,
    width: innerWidth,
    height: innerHeight,
  })
  const fromBase = (baseX, baseY) => {
    if (![baseX, baseY].every(finite)) throw new TypeError('Invalid baseball base screen point.')
    return { x: baseX * zoom + x, y: baseY * zoom + y }
  }
  const toBase = (focusX, focusY) => {
    if (![focusX, focusY].every(finite)) throw new TypeError('Invalid baseball focus screen point.')
    return { x: (focusX - x) / zoom, y: (focusY - y) / zoom }
  }
  const origin = checkPoint(base.project({ x: 0, y: 0, z: 0 }))
  return {
    width,
    height,
    padding,
    centerX: origin.x * zoom + x,
    nearGround: origin.ground * zoom + y,
    nearScale: origin.scale * zoom,
    depth: base.depth,
    moundGround: finite(base.moundGround) ? base.moundGround * zoom + y : undefined,
    bounds: Object.freeze({ ...bounds }),
    sourceRect: Object.freeze(sourceRect),
    transform: Object.freeze({ zoom, x, y }),
    // Every point inside the padding is interactive, including aspect-fit side space.
    viewport,
    contentRect: Object.freeze({
      left: sourceRect.left * zoom + x,
      top: sourceRect.top * zoom + y,
      right: sourceRect.right * zoom + x,
      bottom: sourceRect.bottom * zoom + y,
    }),
    fromBase,
    toBase,
    containsPoint(focusX, focusY) {
      return [focusX, focusY].every(finite) && focusX >= viewport.left && focusX <= viewport.right &&
        focusY >= viewport.top && focusY <= viewport.bottom
    },
    project(point) {
      const projected = checkPoint(base.project(point))
      return {
        ...projected,
        x: projected.x * zoom + x,
        y: projected.y * zoom + y,
        scale: projected.scale * zoom,
        ground: projected.ground * zoom + y,
      }
    },
    unproject(focusX, focusY) {
      const point = toBase(focusX, focusY)
      return base.unproject(point.x, point.y)
    },
  }
}
