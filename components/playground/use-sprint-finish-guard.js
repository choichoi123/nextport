import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createSprintFinishGuard } from '@/lib/playground-sprint-finish-guard.mjs'

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// Keep physical contacts separate from the racing inputs cleared at FINISH.
export default function useSprintFinishGuard({ pending, visible }) {
  const [mobile, setMobile] = useState(false)
  const [locked, setLocked] = useState(false)
  const guardRef = useRef(null)
  const freshPressRef = useRef(null)

  useClientLayoutEffect(() => {
    const guard = createSprintFinishGuard({ onChange: value => {
      freshPressRef.current = null
      setLocked(value)
    } })
    guardRef.current = guard
    const preference = window.matchMedia('(max-width: 1000px), (pointer: coarse)')
    const updatePreference = () => setMobile(preference.matches)
    const touch = event => guard.touch(event.touches.length)
    const down = event => {
      if (event.pointerType === 'pen') guard.pointerDown(event.pointerId)
      freshPressRef.current = guard.isLocked() ? null : event.target.closest?.('[data-sprint-finish-action]')
    }
    const end = event => {
      if (event.pointerType === 'pen') guard.pointerEnd(event.pointerId)
    }
    const cancel = event => { end(event); freshPressRef.current = null }
    updatePreference()
    preference.addEventListener('change', updatePreference)
    // Native touch events also reach window when a disabled button is tapped.
    for (const type of ['touchstart', 'touchend', 'touchcancel']) window.addEventListener(type, touch, { capture: true, passive: true })
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', cancel, true)
    return () => {
      guardRef.current = null
      guard.dispose()
      preference.removeEventListener('change', updatePreference)
      for (const type of ['touchstart', 'touchend', 'touchcancel']) window.removeEventListener(type, touch, true)
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', cancel, true)
    }
  }, [])

  useClientLayoutEffect(() => {
    guardRef.current?.update({ mobile, pending, visible })
  }, [mobile, pending, visible])

  function onClickCapture(event) {
    if (!mobile || !pending) return
    const action = event.target.closest?.('[data-sprint-finish-action]')
    if (!action) return
    // Keyboard / assistive clicks do not need a pointer press. Pointer clicks
    // must have started on this action after the transition guard unlocked.
    if (guardRef.current?.isLocked() || (event.detail !== 0 && freshPressRef.current !== action)) {
      event.preventDefault()
      event.stopPropagation()
    }
    freshPressRef.current = null
  }

  return { locked: mobile && pending && locked, onClickCapture }
}
