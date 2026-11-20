export const SPRINT_FINISH_GUARD_MIN_MS = 500
export const SPRINT_FINISH_GUARD_QUIET_MS = 300

// Keep the result transition separate from held racing inputs: removing a foot
// button can release pointer capture while the finger is still on the screen.
export function createSprintFinishGuard({
  onChange = () => {},
  now = () => performance.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let mobile = false
  let pending = false
  let shownAt = null
  let lastTouchAt = null
  let touchCount = 0
  const pointers = new Set()
  let timer = null
  let locked = false
  let unlocked = false
  let disposed = false

  function cancelTimer() {
    if (timer !== null) clearTimer(timer)
    timer = null
  }

  function setLocked(next) {
    if (locked === next) return
    locked = next
    onChange(next)
  }

  function reconcile() {
    cancelTimer()
    if (disposed || !mobile || !pending || unlocked) return
    if (shownAt === null || touchCount > 0 || pointers.size > 0) return
    const deadline = Math.max(shownAt + SPRINT_FINISH_GUARD_MIN_MS,
      lastTouchAt === null ? -Infinity : lastTouchAt + SPRINT_FINISH_GUARD_QUIET_MS)
    const remaining = deadline - now()
    if (remaining <= 0) {
      unlocked = true
      setLocked(false)
      return
    }
    timer = setTimer(() => {
      timer = null
      reconcile()
    }, remaining)
  }

  function update({ mobile: nextMobile, pending: nextPending, visible }) {
    if (disposed) return
    const hadGuard = mobile && pending
    mobile = Boolean(nextMobile)
    pending = Boolean(nextPending)
    if (!mobile || !pending) {
      cancelTimer()
      shownAt = null
      unlocked = false
      setLocked(false)
      return
    }
    if (!hadGuard) {
      shownAt = null
      unlocked = false
      setLocked(true)
    }
    if (visible && shownAt === null) shownAt = now()
    reconcile()
  }

  function touch(count) {
    if (disposed) return
    touchCount = Math.max(0, Math.trunc(Number(count) || 0))
    lastTouchAt = now()
    reconcile()
  }

  function pointerDown(id) {
    if (disposed) return
    pointers.add(id)
    lastTouchAt = now()
    reconcile()
  }

  function pointerEnd(id) {
    if (disposed || !pointers.delete(id)) return
    lastTouchAt = now()
    reconcile()
  }

  function dispose() {
    cancelTimer()
    disposed = true
    pointers.clear()
    touchCount = 0
  }

  return { update, touch, pointerDown, pointerEnd, isLocked: () => locked, dispose }
}
