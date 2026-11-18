import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTROL_WORLD,
  CONTROL_RADIUS,
  getControlCode,
  getMovement,
  advanceControls,
} from '../lib/playground-controls.mjs'

const center = Object.freeze({ x: 480, y: 270 })
const keys = (...codes) => new Set(codes)

test('방향키와 Space를 code로 판별하고 key 값만 있는 입력도 지원한다', () => {
  for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']) {
    assert.equal(getControlCode({ code }), code)
  }
  assert.equal(getControlCode({ key: 'ArrowLeft' }), 'ArrowLeft')
  assert.equal(getControlCode({ key: ' ' }), 'Space')
  assert.equal(getControlCode({ key: 'Spacebar' }), 'Space')
  assert.equal(getControlCode({ code: 'KeyW', key: 'w' }), null)
  assert.equal(getControlCode({ key: 'Enter' }), null)
})

test('대각선 이동은 같은 시간의 수평 이동보다 빨라지지 않는다', () => {
  const horizontal = advanceControls(center, keys('ArrowRight'), 0.025)
  const diagonal = advanceControls(center, keys('ArrowRight', 'ArrowDown'), 0.025)
  const horizontalDistance = Math.hypot(horizontal.x - center.x, horizontal.y - center.y)
  const diagonalDistance = Math.hypot(diagonal.x - center.x, diagonal.y - center.y)
  assert.equal(horizontalDistance, 6)
  assert.ok(diagonal.x > center.x && diagonal.y > center.y)
  assert.ok(Math.abs(diagonalDistance - horizontalDistance) < 1e-10)
  const direction = getMovement(keys('ArrowRight', 'ArrowDown'))
  assert.ok(Math.abs(Math.hypot(direction.x, direction.y) - 1) < 1e-10)
})

test('반대 방향키는 축별로 상쇄되어 남은 방향만 움직인다', () => {
  const horizontalOpposites = keys('ArrowLeft', 'ArrowRight', 'ArrowUp')
  assert.deepEqual(getMovement(horizontalOpposites), { x: 0, y: -1 })
  assert.deepEqual(advanceControls(center, horizontalOpposites, 0.05), { x: 480, y: 258 })
  const allArrows = keys('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown')
  assert.deepEqual(getMovement(allArrows), { x: 0, y: 0 })
  assert.deepEqual(advanceControls(center, allArrows, 0.05), center)
})

test('원의 가장자리가 보드의 네 경계를 넘지 않는다', () => {
  const right = CONTROL_WORLD.width - CONTROL_RADIUS
  const bottom = CONTROL_WORLD.height - CONTROL_RADIUS
  const cases = [
    [{ x: CONTROL_RADIUS + 2, y: 200 }, 'ArrowLeft', { x: CONTROL_RADIUS, y: 200 }],
    [{ x: right - 2, y: 200 }, 'ArrowRight', { x: right, y: 200 }],
    [{ x: 200, y: CONTROL_RADIUS + 2 }, 'ArrowUp', { x: 200, y: CONTROL_RADIUS }],
    [{ x: 200, y: bottom - 2 }, 'ArrowDown', { x: 200, y: bottom }],
  ]
  for (const [position, direction, expected] of cases) {
    assert.deepEqual(advanceControls(position, keys(direction), 0.05), expected)
  }
})

test('긴 프레임 간격은 50ms로 제한하고 음수·비정상 간격은 이동시키지 않는다', () => {
  assert.deepEqual(advanceControls(center, keys('ArrowRight'), 10), { x: 492, y: 270 })
  for (const delta of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    assert.deepEqual(advanceControls(center, keys('ArrowRight'), delta), center)
  }
})

test('방향 입력이 없거나 Space만 눌리면 정지하며 입력 객체를 변경하지 않는다', () => {
  for (const pressed of [keys(), keys('Space')]) {
    const previousKeys = [...pressed]
    const result = advanceControls(center, pressed, 0.05)
    assert.deepEqual(result, center)
    assert.notStrictEqual(result, center)
    assert.deepEqual([...pressed], previousKeys)
  }
  const pressed = keys('ArrowLeft', 'ArrowUp')
  advanceControls(center, pressed, 0.05)
  assert.deepEqual(center, { x: 480, y: 270 })
  assert.deepEqual([...pressed], ['ArrowLeft', 'ArrowUp'])
})
