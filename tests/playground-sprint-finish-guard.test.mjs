import test from 'node:test'
import assert from 'node:assert/strict'
import { createSprintFinishGuard, SPRINT_FINISH_GUARD_MIN_MS,
  SPRINT_FINISH_GUARD_QUIET_MS } from '../lib/playground-sprint-finish-guard.mjs'

function fixture() {
  let time = 0
  let id = 0
  const timers = new Map()
  const changes = []
  const guard = createSprintFinishGuard({ now: () => time,
    onChange: value => changes.push(value),
    setTimer: (callback, delay) => { const key = ++id; timers.set(key, { callback, at: time + delay }); return key },
    clearTimer: key => timers.delete(key),
  })
  function advance(ms) {
    const end = time + ms
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0]
      if (!next || next[1].at > end) break
      time = next[1].at
      timers.delete(next[0])
      next[1].callback()
    }
    time = end
  }
  return { guard, advance, timers, changes }
}

const show = guard => guard.update({ mobile: true, pending: true, visible: true })

test('mobile results wait exactly half a second when no finger is held', () => {
  assert.equal(SPRINT_FINISH_GUARD_MIN_MS, 500)
  assert.equal(SPRINT_FINISH_GUARD_QUIET_MS, 300)
  const { guard, advance, changes } = fixture()
  show(guard)
  assert.equal(guard.isLocked(), true)
  advance(499)
  assert.equal(guard.isLocked(), true)
  advance(1)
  assert.equal(guard.isLocked(), false)
  assert.deepEqual(changes, [true, false])
})

test('a delayed result after the boss ceremony gets its own full minimum delay', () => {
  const { guard, advance, timers } = fixture()
  guard.update({ mobile: true, pending: true, visible: false })
  advance(4000)
  assert.equal(guard.isLocked(), true)
  assert.equal(timers.size, 0)
  show(guard)
  advance(499)
  assert.equal(guard.isLocked(), true)
  advance(1)
  assert.equal(guard.isLocked(), false)
})

test('both fingers already on the foot controls must be released before the quiet period', () => {
  const { guard, advance, timers } = fixture()
  guard.touch(2)
  show(guard)
  advance(600)
  guard.touch(1)
  advance(1000)
  assert.equal(guard.isLocked(), true)
  assert.equal(timers.size, 0)
  guard.touch(0)
  advance(299)
  assert.equal(guard.isLocked(), true)
  advance(1)
  assert.equal(guard.isLocked(), false)
})

test('continued tapping extends the quiet period beyond the initial minimum', () => {
  const { guard, advance } = fixture()
  show(guard)
  for (let tap = 0; tap < 8; tap++) {
    guard.touch(1)
    advance(50)
    guard.touch(0)
    advance(50)
    assert.equal(guard.isLocked(), true)
  }
  advance(249)
  assert.equal(guard.isLocked(), true)
  advance(1)
  assert.equal(guard.isLocked(), false)
})

test('native touches and pen pointers both have to end, including cancellation', () => {
  const { guard, advance, timers } = fixture()
  guard.pointerDown(10)
  guard.pointerDown(11)
  guard.touch(1)
  show(guard)
  advance(600)
  guard.pointerEnd(10)
  guard.touch(0)
  advance(400)
  assert.equal(guard.isLocked(), true)
  assert.equal(timers.size, 0)
  guard.pointerEnd(11) // The adapter also calls this on pointercancel.
  advance(299)
  assert.equal(guard.isLocked(), true)
  advance(1)
  assert.equal(guard.isLocked(), false)
})

test('unlock is latched for one finished run across taps, replay and modal visibility', () => {
  const { guard, advance, timers, changes } = fixture()
  show(guard)
  advance(500)
  guard.touch(1)
  guard.pointerDown(2)
  guard.update({ mobile: true, pending: true, visible: false })
  show(guard)
  assert.equal(guard.isLocked(), false)
  assert.equal(timers.size, 0)
  guard.touch(0)
  guard.pointerEnd(2)
  assert.equal(guard.isLocked(), false)
  assert.deepEqual(changes, [true, false])
})

test('a new finished run re-arms the guard without clearing a still-held finger', () => {
  const { guard, advance } = fixture()
  show(guard)
  advance(500)
  guard.touch(1)
  guard.update({ mobile: true, pending: false, visible: false })
  show(guard)
  advance(1000)
  assert.equal(guard.isLocked(), true)
  guard.touch(0)
  advance(300)
  assert.equal(guard.isLocked(), false)
})

test('desktop is immediately available and switching to mobile starts a fresh guard', () => {
  const { guard, advance, timers, changes } = fixture()
  guard.touch(1)
  guard.update({ mobile: false, pending: true, visible: true })
  assert.equal(guard.isLocked(), false)
  assert.equal(timers.size, 0)
  assert.deepEqual(changes, [])
  show(guard)
  assert.equal(guard.isLocked(), true)
  guard.touch(0)
  advance(200)
  guard.update({ mobile: false, pending: true, visible: true })
  assert.equal(guard.isLocked(), false)
  assert.equal(timers.size, 0)
  advance(1000)
  show(guard)
  advance(499)
  assert.equal(guard.isLocked(), true)
  advance(1)
  assert.equal(guard.isLocked(), false)
})

test('ending a pending result cancels its timer and dispose ignores subsequent events', () => {
  const { guard, advance, timers, changes } = fixture()
  show(guard)
  assert.equal(timers.size, 1)
  guard.update({ mobile: true, pending: false, visible: false })
  assert.equal(guard.isLocked(), false)
  assert.equal(timers.size, 0)
  show(guard)
  assert.equal(timers.size, 1)
  guard.dispose()
  assert.equal(timers.size, 0)
  const before = [...changes]
  advance(1000)
  guard.touch(0)
  guard.pointerDown(1)
  guard.pointerEnd(1)
  guard.update({ mobile: false, pending: false, visible: false })
  assert.deepEqual(changes, before)
  assert.equal(timers.size, 0)
})
