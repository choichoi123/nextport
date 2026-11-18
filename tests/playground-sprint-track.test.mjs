import test from 'node:test'
import assert from 'node:assert/strict'
import { SPRINT_TRACK, getSprintTrackFrame, getSprintTrackMarkers } from '../lib/playground-sprint-track.mjs'

const close = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`)

test('both styles can use one immutable layout whose six side lanes fit the canvas', () => {
  assert.ok(Object.isFrozen(SPRINT_TRACK))
  for (const view of ['side', 'top']) {
    const layout = SPRINT_TRACK[view]
    assert.ok(Object.isFrozen(layout))
    assert.ok(layout.top >= 0)
    assert.ok(layout.top + layout.lanes * layout.laneHeight <= SPRINT_TRACK.HEIGHT)
    close(layout.runnerY, layout.top + (layout.activeLane + .5) * layout.laneHeight)
  }
})

test('side camera preserves real 100m geometry and shows the runner on each line at its endpoint', () => {
  const start = getSprintTrackFrame(0)
  const finish = getSprintTrackFrame(100)
  assert.equal(start.cameraX, 0)
  assert.equal(start.runnerX, 112)
  assert.equal(start.startX, start.runnerX)
  assert.equal(finish.runnerX, 850)
  assert.equal(finish.finishX, finish.runnerX)
  for (let distance = 0; distance <= 100; distance += .1) {
    const frame = getSprintTrackFrame(distance)
    close(frame.finishX - frame.startX, 100 * 56)
    close(frame.runnerX - frame.startX, distance * 56)
    assert.equal(frame.runnerY, 368)
  }
})

test('side camera and runner advance continuously without reverse motion or overshooting bounds', () => {
  let previous = getSprintTrackFrame(0)
  const worldStep = .01 * 56
  for (let index = 1; index <= 10000; index += 1) {
    const frame = getSprintTrackFrame(index / 100)
    assert.ok(frame.cameraX >= previous.cameraX - 1e-9)
    assert.ok(frame.cameraX - previous.cameraX <= worldStep + 1e-9)
    assert.ok(frame.runnerX >= previous.runnerX - 1e-9)
    assert.ok(frame.runnerX >= 112 && frame.runnerX <= 850)
    assert.ok(frame.cameraX <= SPRINT_TRACK.finishX - 850)
    previous = frame
  }
})

test('camera velocity is continuous where tracking starts, stabilizes, and stops', () => {
  const maximum = SPRINT_TRACK.finishX - 850
  const worldBoundaries = [320 - 48, 320 + 48, 320 + maximum - 48, 320 + maximum + 48]
  const delta = .00001
  for (const worldX of worldBoundaries) {
    const distance = (worldX - SPRINT_TRACK.startX) / 56
    const before = getSprintTrackFrame(distance - delta).cameraX
    const current = getSprintTrackFrame(distance).cameraX
    const after = getSprintTrackFrame(distance + delta).cameraX
    const leftVelocity = (current - before) / delta
    const rightVelocity = (after - current) / delta
    close(leftVelocity, rightVelocity, .001)
  }
})

test('top view retains the whole 100m overview with a stationary camera', () => {
  for (const distance of [0, 5, 37.5, 99.99, 100]) {
    const frame = getSprintTrackFrame(distance, 'top')
    assert.equal(frame.cameraX, 0)
    assert.equal(frame.startX, 112)
    assert.equal(frame.finishX, 850)
    close(frame.runnerX, 112 + distance * 7.38)
    assert.equal(frame.runnerY, 270)
  }
})

test('distance clamping and invalid inputs produce finite geometry without changing configuration', () => {
  for (const view of ['side', 'top']) {
    assert.deepEqual(getSprintTrackFrame(-10, view), getSprintTrackFrame(0, view))
    assert.deepEqual(getSprintTrackFrame(110, view), getSprintTrackFrame(100, view))
    for (const value of [undefined, null, '12', NaN, Infinity, -Infinity]) {
      assert.deepEqual(getSprintTrackFrame(value, view), getSprintTrackFrame(0, view))
    }
  }
  assert.deepEqual(getSprintTrackFrame(10, 'unknown'), getSprintTrackFrame(10, 'side'))
  assert.equal(SPRINT_TRACK.finishX, 5712)
})

test('markers are visible ordered 2m ticks, with 10m major labels and distinct endpoints', () => {
  for (const view of ['side', 'top']) {
    for (const distance of [0, 25, 50, 75, 100]) {
      const frame = getSprintTrackFrame(distance, view)
      const markers = getSprintTrackMarkers(distance, view)
      assert.ok(markers.length > 0)
      for (const [index, marker] of markers.entries()) {
        assert.ok(marker.x >= -16 && marker.x <= SPRINT_TRACK.WIDTH + 16)
        assert.equal(marker.meter % 2, 0)
        assert.equal(marker.major, marker.meter % 10 === 0)
        close(marker.x, frame.startX + marker.meter * frame.metersToPixels)
        if (index > 0) assert.equal(marker.meter - markers[index - 1].meter, 2)
      }
    }
  }
  assert.equal(getSprintTrackMarkers(0).find(marker => marker.meter === 0).kind, 'start')
  assert.equal(getSprintTrackMarkers(100).find(marker => marker.meter === 100).kind, 'finish')
  assert.equal(getSprintTrackMarkers(0, 'top').length, 51)
})

test('camera and marker sampling is deterministic and fresh for replay seeks', () => {
  const frame = getSprintTrackFrame(48.25)
  const markers = getSprintTrackMarkers(48.25)
  getSprintTrackFrame(90)
  getSprintTrackMarkers(5)
  assert.deepEqual(getSprintTrackFrame(48.25), frame)
  assert.deepEqual(getSprintTrackMarkers(48.25), markers)
  assert.notEqual(getSprintTrackMarkers(48.25), markers)
})
