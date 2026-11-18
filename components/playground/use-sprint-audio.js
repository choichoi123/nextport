import { useCallback, useEffect, useRef, useState } from 'react'

const CHEER_URL = '/audio/playground/sprint/crowd-cheer.ogg'
const CHEER_VOLUME = 0.16
const MIN_CHEER_INTERVAL_MS = 1000
const MAX_CHEER_SECONDS = 3.8

function hasUserGesture() {
  return typeof navigator !== 'undefined' && (!navigator.userActivation || navigator.userActivation.isActive)
}

function isVisiblePage() {
  return typeof document !== 'undefined' && !document.hidden && document.hasFocus()
}

/** A single quiet real-audience sample; no autoplay, microphone or system-volume changes. */
export default function useSprintAudio() {
  const [enabled, setEnabledState] = useState(true)
  const [status, setStatus] = useState('idle')
  const enabledRef = useRef(true)
  const mountedRef = useRef(false)
  const contextRef = useRef(null)
  const gainRef = useRef(null)
  const bufferRef = useRef(null)
  const sourceRef = useRef(null)
  const pendingRef = useRef(null)
  const fetchRef = useRef(null)
  const lastAttemptRef = useRef(-Infinity)
  const requestRef = useRef(0)

  const stop = useCallback(() => {
    // Invalidate a play request still awaiting the sample or browser permission.
    requestRef.current += 1
    const source = sourceRef.current
    sourceRef.current = null
    if (source) {
      source.onended = null
      try { source.stop() } catch { /* Already ended. */ }
      source.disconnect()
    }
    const context = contextRef.current
    if (context && gainRef.current && context.state !== 'closed') {
      gainRef.current.gain.cancelScheduledValues(context.currentTime)
      gainRef.current.gain.setValueAtTime(0, context.currentTime)
    }
  }, [])

  const setEnabled = useCallback(value => {
    const next = typeof value === 'function' ? !!value(enabledRef.current) : !!value
    enabledRef.current = next
    setEnabledState(next)
    if (!next) stop()
  }, [stop])

  // Call from Start/demo clicks to unlock audio silently before an eventual finish.
  const prepare = useCallback(async () => {
    if (!mountedRef.current || !enabledRef.current || typeof window === 'undefined') return false
    let context = contextRef.current
    try {
      if (!context) {
        if (!hasUserGesture()) return false
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        if (!AudioContextClass) { setStatus('unavailable'); return false }
        context = new AudioContextClass()
        contextRef.current = context
        const gain = context.createGain()
        gain.gain.value = 0
        gain.connect(context.destination)
        gainRef.current = gain
      }
      if (context.state !== 'running') {
        if (!hasUserGesture()) { setStatus('unavailable'); return false }
        // resume is invoked synchronously within the initiating user gesture.
        await context.resume()
      }
      if (!mountedRef.current || contextRef.current !== context || !enabledRef.current) return false
      if (context.state !== 'running') { setStatus('unavailable'); return false }
      if (bufferRef.current) { setStatus('ready'); return true }
      if (pendingRef.current) return pendingRef.current
      setStatus('loading')
      const controller = new AbortController()
      fetchRef.current = controller
      const pending = Promise.resolve().then(async () => {
        try {
          const response = await fetch(CHEER_URL, { signal: controller.signal, credentials: 'omit', cache: 'force-cache' })
          if (!response.ok) throw new Error('Crowd sample unavailable')
          const data = await response.arrayBuffer()
          const buffer = await context.decodeAudioData(data)
          if (!mountedRef.current || contextRef.current !== context) return false
          if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('Invalid crowd sample')
          bufferRef.current = buffer
          setStatus('ready')
          return true
        } catch (error) {
          if (mountedRef.current && contextRef.current === context && error?.name !== 'AbortError') setStatus('unavailable')
          return false
        } finally {
          if (pendingRef.current === pending) pendingRef.current = null
          if (fetchRef.current === controller) fetchRef.current = null
        }
      })
      pendingRef.current = pending
      return pending
    } catch {
      if (mountedRef.current && contextRef.current === context) setStatus('unavailable')
      return false
    }
  }, [])

  const playCheer = useCallback(async () => {
    if (!mountedRef.current || !enabledRef.current || sourceRef.current || !isVisiblePage()) return false
    const now = performance.now()
    if (now - lastAttemptRef.current < MIN_CHEER_INTERVAL_MS) return false
    lastAttemptRef.current = now
    const request = requestRef.current
    if (!await prepare()) return false
    if (!mountedRef.current || !enabledRef.current || requestRef.current !== request || sourceRef.current || !isVisiblePage()) return false
    const context = contextRef.current
    const buffer = bufferRef.current
    const gain = gainRef.current
    if (!context || context.state !== 'running' || !buffer || !gain) return false
    try {
      const source = context.createBufferSource()
      const duration = Math.min(MAX_CHEER_SECONDS, buffer.duration)
      const startAt = context.currentTime
      source.buffer = buffer
      source.loop = false
      source.connect(gain)
      gain.gain.cancelScheduledValues(startAt)
      gain.gain.setValueAtTime(0, startAt)
      gain.gain.linearRampToValueAtTime(CHEER_VOLUME, startAt + Math.min(.025, duration / 4))
      gain.gain.setValueAtTime(CHEER_VOLUME, startAt + Math.max(.025, duration - .45))
      gain.gain.linearRampToValueAtTime(0, startAt + duration)
      sourceRef.current = source
      source.onended = () => {
        if (sourceRef.current === source) sourceRef.current = null
        source.disconnect()
      }
      source.start(startAt, 0, duration)
      return true
    } catch {
      stop()
      if (mountedRef.current) setStatus('unavailable')
      return false
    }
  }, [prepare, stop])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stop()
      fetchRef.current?.abort()
      fetchRef.current = null
      pendingRef.current = null
      bufferRef.current = null
      gainRef.current?.disconnect()
      gainRef.current = null
      const context = contextRef.current
      contextRef.current = null
      if (context && context.state !== 'closed') void context.close().catch(() => {})
    }
  }, [stop])

  return { enabled, setEnabled, ready: status === 'ready', status, prepare, playCheer, stop }
}
