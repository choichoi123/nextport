import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeSprintPublicRecords as publicRecords, normalizeSprintRegistrationResult, normalizeSprintEligibility } from '../../lib/playground-sprint-registration.mjs'
import { SPRINT_RULE_VERSION } from '../../lib/playground-sprint-rules.mjs'

const API = '/api/playground/sprint'
const idleRegistration = { status: 'idle', record: null, worldRecord: null, code: null, details: null }
const idleRun = { status: 'idle', attemptId: null, ruleVersion: null, timeCs: null, eligible: false, personalBestTimeCs: null, ineligibleReason: null, code: null }

async function request(path, { signal, body } = {}) {
  const response = await fetch(`${API}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin', cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  let data
  try { data = await response.json() } catch { throw new Error('invalid_response') }
  if (!response.ok) throw new Error(data?.code || 'request_failed')
  return data
}

function controllerWithTimeout() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  return { controller, clear: () => clearTimeout(timer) }
}

/** Network state is separate from the local race and replay engine. */
export default function useSprintLeaderboard() {
  const [leaderboard, setLeaderboard] = useState({ status: 'idle', records: [], updatedAt: null, code: null })
  const [run, setRun] = useState(idleRun)
  const [registration, setRegistration] = useState(idleRegistration)
  const mountedRef = useRef(false)
  const boardRequestRef = useRef(0)
  const generationRef = useRef(0)
  const controllersRef = useRef(new Set())
  const runRef = useRef(idleRun)
  const finishPayloadRef = useRef(null)
  const registrationPayloadRef = useRef(null)
  const boardControllerRef = useRef(null)
  const committedBoardRef = useRef(null)
  const startPendingRef = useRef(false)
  const finishPendingRef = useRef(false)
  const registerPendingRef = useRef(false)

  const updateRun = useCallback(next => { runRef.current = next; if (mountedRef.current) setRun(next) }, [])
  const abortRunRequests = useCallback(() => {
    generationRef.current += 1
    for (const controller of controllersRef.current) controller.abort()
    controllersRef.current.clear()
    startPendingRef.current = false
    finishPendingRef.current = false
    registerPendingRef.current = false
    finishPayloadRef.current = null
    registrationPayloadRef.current = null
  }, [])
  const resetRun = useCallback(() => {
    abortRunRequests()
    updateRun(idleRun)
    if (mountedRef.current) setRegistration(idleRegistration)
  }, [abortRunRequests, updateRun])

  const refresh = useCallback(async () => {
    const requestId = ++boardRequestRef.current
    boardControllerRef.current?.abort()
    const { controller, clear } = controllerWithTimeout()
    boardControllerRef.current = controller
    if (mountedRef.current) setLeaderboard(previous => ({ ...previous, status: 'loading', code: null }))
    try {
      const data = await request('leaderboard', { signal: controller.signal })
      if (data?.status !== 'ok' || (data.updatedAt !== null && !Number.isFinite(Date.parse(data.updatedAt)))) throw new Error('invalid_response')
      const records = publicRecords(data.records)
      if (mountedRef.current && requestId === boardRequestRef.current) {
        const committed = committedBoardRef.current
        // A CDN can briefly return a snapshot from before a successful registration.
        // Keep the newest accepted snapshot, including after a later refresh failed.
        if (committed && (data.updatedAt === null || Date.parse(data.updatedAt) < Date.parse(committed.updatedAt))) {
          setLeaderboard(committed)
        } else {
          const snapshot = { status: 'ready', records, updatedAt: data.updatedAt, code: null }
          if (committed) committedBoardRef.current = snapshot
          setLeaderboard(snapshot)
        }
      }
    } catch (error) {
      if (mountedRef.current && requestId === boardRequestRef.current) {
        const code = error.name === 'AbortError' ? 'request_timeout' : error.message
        setLeaderboard({ status: ['not_configured', 'database_unavailable'].includes(code) ? 'unavailable' : 'error', records: [], updatedAt: null, code })
      }
    } finally { clear() }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refresh()
    return () => {
      mountedRef.current = false
      boardRequestRef.current += 1
      boardControllerRef.current?.abort()
      abortRunRequests()
    }
  }, [abortRunRequests, refresh])

  const beginAttempt = useCallback(async () => {
    if (startPendingRef.current) return null
    abortRunRequests()
    startPendingRef.current = true
    const generation = generationRef.current
    const { controller, clear } = controllerWithTimeout()
    controllersRef.current.add(controller)
    updateRun({ ...idleRun, status: 'preparing' })
    setRegistration(idleRegistration)
    try {
      const data = await request('attempts', { body: {}, signal: controller.signal })
      if (typeof data?.attemptId !== 'string' || typeof data.ruleVersion !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))) throw new Error('invalid_response')
      // An older server can remain live during a rollout. Never submit a run
      // simulated under different rules into that server's leaderboard.
      if (data.ruleVersion !== SPRINT_RULE_VERSION) throw new Error('rule_mismatch')
      if (!mountedRef.current || generation !== generationRef.current) return null
      updateRun({ ...idleRun, status: 'online', attemptId: data.attemptId, ruleVersion: data.ruleVersion })
      return { mode: 'online', attemptId: data.attemptId, ruleVersion: data.ruleVersion }
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return null
      const code = error.name === 'AbortError' ? 'request_timeout' : error.message
      updateRun({ ...idleRun, status: 'local', code })
      return { mode: 'local', code }
    } finally {
      clear()
      controllersRef.current.delete(controller)
      if (generation === generationRef.current) startPendingRef.current = false
    }
  }, [abortRunRequests, updateRun])

  const verifyFinish = useCallback(async (events, finishTimeMs) => {
    if (finishPendingRef.current) return
    const current = runRef.current
    if (!['online', 'verification_error'].includes(current.status) || !current.attemptId) return
    if (events) finishPayloadRef.current = { attemptId: current.attemptId, events: events.map(event => ({ ...event })), finishTimeMs }
    if (!finishPayloadRef.current) return
    const payload = finishPayloadRef.current
    const generation = generationRef.current
    finishPendingRef.current = true
    const { controller, clear } = controllerWithTimeout()
    controllersRef.current.add(controller)
    updateRun({ ...current, status: 'verifying', code: null })
    try {
      const data = await request('finish', { body: payload, signal: controller.signal })
      if (data?.status !== 'verified' || data.attemptId !== current.attemptId || !Number.isInteger(data.timeCs) || data.timeCs <= 0 || typeof data.eligible !== 'boolean') throw new Error('invalid_response')
      const eligibility = normalizeSprintEligibility(data)
      if (!mountedRef.current || generation !== generationRef.current) return
      updateRun({ ...current, status: 'verified', timeCs: data.timeCs, eligible: data.eligible, ...eligibility, code: null })
      void refresh()
    } catch (error) {
      if (mountedRef.current && generation === generationRef.current) updateRun({ ...current, status: 'verification_error', code: error.name === 'AbortError' ? 'request_timeout' : error.message })
    } finally {
      clear()
      controllersRef.current.delete(controller)
      if (generation === generationRef.current) finishPendingRef.current = false
    }
  }, [refresh, updateRun])

  const register = useCallback(async ({ playerName, countryCode }) => {
    const current = runRef.current
    if (registerPendingRef.current || current.status !== 'verified' || !current.eligible) return
    registerPendingRef.current = true
    const generation = generationRef.current
    if (!registrationPayloadRef.current) registrationPayloadRef.current = { attemptId: current.attemptId, playerName, countryCode }
    const payload = registrationPayloadRef.current
    const details = { playerName: payload.playerName, countryCode: payload.countryCode }
    const { controller, clear } = controllerWithTimeout()
    controllersRef.current.add(controller)
    setRegistration({ ...idleRegistration, status: 'saving', details })
    try {
      const data = normalizeSprintRegistrationResult(await request('records', { body: payload, signal: controller.signal }))
      const records = data.records
      if (!mountedRef.current || generation !== generationRef.current) return
      setRegistration({ status: data.status, record: data.record, worldRecord: data.worldRecord, code: null, details })
      // Invalidate an older GET so its cache cannot replace this committed result.
      boardRequestRef.current += 1
      const snapshot = { status: 'ready', records, updatedAt: Number.isFinite(Date.parse(data.updatedAt)) ? data.updatedAt : null, code: null }
      if (snapshot.updatedAt && (!committedBoardRef.current || Date.parse(snapshot.updatedAt) >= Date.parse(committedBoardRef.current.updatedAt))) committedBoardRef.current = snapshot
      setLeaderboard(committedBoardRef.current || snapshot)
    } catch (error) {
      if (mountedRef.current && generation === generationRef.current) setRegistration({ ...idleRegistration, status: 'error', details, code: error.name === 'AbortError' ? 'request_timeout' : error.message })
    } finally {
      clear()
      controllersRef.current.delete(controller)
      if (generation === generationRef.current) registerPendingRef.current = false
    }
  }, [])

  return { leaderboard, run, registration, refresh, beginAttempt, resetRun, verifyFinish, retryVerification: () => verifyFinish(), register }
}
