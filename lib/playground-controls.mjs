export const CONTROL_WORLD = Object.freeze({ width: 960, height: 540 })
export const CONTROL_RADIUS = 40
export const CONTROL_SPEED = 240
export const MAX_CONTROL_DELTA = 0.05

const controlCodes = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'])

export function getControlCode(event) {
  if (controlCodes.has(event?.code)) return event.code
  if (event?.key === ' ' || event?.key === 'Spacebar') return 'Space'
  return controlCodes.has(event?.key) ? event.key : null
}

export function getMovement(pressed) {
  const x = Number(pressed.has('ArrowRight')) - Number(pressed.has('ArrowLeft'))
  const y = Number(pressed.has('ArrowDown')) - Number(pressed.has('ArrowUp'))
  const length = Math.hypot(x, y) || 1
  return { x: x / length, y: y / length }
}

export function advanceControls(position, pressed, deltaSeconds) {
  const delta = Number.isFinite(deltaSeconds)
    ? Math.min(MAX_CONTROL_DELTA, Math.max(0, deltaSeconds))
    : 0
  const movement = getMovement(pressed)
  return {
    x: Math.max(CONTROL_RADIUS, Math.min(CONTROL_WORLD.width - CONTROL_RADIUS, position.x + movement.x * CONTROL_SPEED * delta)),
    y: Math.max(CONTROL_RADIUS, Math.min(CONTROL_WORLD.height - CONTROL_RADIUS, position.y + movement.y * CONTROL_SPEED * delta)),
  }
}
