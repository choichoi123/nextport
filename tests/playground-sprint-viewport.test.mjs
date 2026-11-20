import test from 'node:test'
import assert from 'node:assert/strict'
import { getSprintViewportCamera } from '../lib/playground-sprint-viewport.mjs'
import { SPRINT_TRACK } from '../lib/playground-sprint-track.mjs'

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`)

test('unmeasured or invalid canvas boxes produce a finite neutral crop', () => {
  for (const box of [{}, { width: 0, height: 0 }, { width: 568, height: 0 }, { width: -1, height: 80 }, { width: NaN, height: 120 }, { width: 568, height: Infinity }]) {
    assert.deepEqual(getSprintViewportCamera(box), { scale: 0, visibleHeight: 500, cropTop: 0, objectPositionY: 50 })
  }
})

test('full-height and portrait cover leave the whole logical height intact', () => {
  for (const box of [{ width: 960, height: 500 }, { width: 390, height: 650 }, { width: 320, height: 480 }]) {
    const camera = getSprintViewportCamera(box)
    close(camera.visibleHeight, 500)
    close(camera.cropTop, 0)
    close(camera.objectPositionY, 50)
  }
})

test('short landscape keeps the calibrated runner head and feet in the crop', () => {
  for (const height of [85, 120]) {
    const camera = getSprintViewportCamera({ width: 568, height })
    close(camera.scale, 568 / 960)
    close(camera.cropTop + camera.visibleHeight, SPRINT_TRACK.side.runnerY + 8)
    assert.ok(camera.cropTop <= SPRINT_TRACK.side.runnerY - 120)
    assert.ok(SPRINT_TRACK.side.runnerY < camera.cropTop + camera.visibleHeight)
    close((SPRINT_TRACK.HEIGHT - camera.visibleHeight) * camera.objectPositionY / 100, camera.cropTop)
  }
})

test('winner focus can show the lower boss lane without changing runner geometry', () => {
  const groundY = SPRINT_TRACK.side.top + 5.5 * SPRINT_TRACK.side.laneHeight
  assert.equal(groundY, 464)
  const camera = getSprintViewportCamera({ width: 568, height: 85, focusY: groundY })
  close(camera.cropTop + camera.visibleHeight, groundY + 8)
  assert.ok(camera.cropTop <= groundY - 120 * 1.08)
  assert.ok(groundY < camera.cropTop + camera.visibleHeight)
  assert.equal(SPRINT_TRACK.side.runnerY, 368)
})

test('top view centers the track rather than following the player or winner', () => {
  for (const height of [85, 120, 180]) {
    const camera = getSprintViewportCamera({ width: 568, height, view: 'top', focusY: 464 })
    const trackCenter = SPRINT_TRACK.top.top + SPRINT_TRACK.top.lanes * SPRINT_TRACK.top.laneHeight / 2
    close(camera.cropTop + camera.visibleHeight / 2, trackCenter)
    assert.deepEqual(camera, getSprintViewportCamera({ width: 568, height, view: 'top', focusY: 368 }))
    if (camera.visibleHeight >= SPRINT_TRACK.top.lanes * SPRINT_TRACK.top.laneHeight) {
      assert.ok(camera.cropTop <= SPRINT_TRACK.top.top)
      assert.ok(camera.cropTop + camera.visibleHeight >= SPRINT_TRACK.top.top + SPRINT_TRACK.top.lanes * SPRINT_TRACK.top.laneHeight)
    }
  }
})

test('extreme wide boxes and out-of-range focus stay within the drawing bounds', () => {
  for (const view of ['side', 'top']) {
    for (const focusY of [-1000, 0, 368, 464, 1000, NaN]) {
      const camera = getSprintViewportCamera({ width: 2800, height: 80, view, focusY })
      assert.ok(camera.cropTop >= 0)
      assert.ok(camera.cropTop + camera.visibleHeight <= SPRINT_TRACK.HEIGHT + 1e-8)
      assert.ok(camera.objectPositionY >= 0 && camera.objectPositionY <= 100)
    }
  }
})
