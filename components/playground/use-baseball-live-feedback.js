import { useCallback, useId, useRef } from 'react'
import useBaseballFeedback from './use-baseball-feedback'
import { BASEBALL_RULES } from '@/lib/playground-baseball.mjs'
import { createBaseballFeedbackGate, getBaseballFlightFeedbackEvents, getBaseballResultFeedbackEvents } from '@/lib/playground-baseball-feedback.mjs'

/** A single owner for both canvases. Nothing here judges, stores or advances play. */
export default function useBaseballLiveFeedback({ locale, mode, feedbackOverride=null }) {
  const ownedFeedback = useBaseballFeedback({ locale, disabled:Boolean(feedbackOverride) })
  const feedback=feedbackOverride||ownedFeedback
  const latest = useRef(feedback)
  latest.current = feedback
  const componentId = useId(), serial = useRef(0), gate = useRef(null)
  if (!gate.current) gate.current = createBaseballFeedbackGate()
  const consume = useCallback((events, at) => {
    for (const event of gate.current.take(events, at)) latest.current.emit(event)
  }, [])
  const prepare = useCallback(() => {
    latest.current.stop()
    // Calling prepare now, rather than after a server request, preserves activation.
    void latest.current.prepare()
  }, [])
  const begin = useCallback((round, identity = {}) => {
    const sequence = ++serial.current
    round.feedbackContext = {
      mode, origin: 'live', scopeId: String(identity.scopeId || componentId),
      pitchId: String(identity.pitchId || `pitch-${sequence}`),
      attemptId: String(identity.attemptId || `attempt-${sequence}`),
    }
  }, [componentId, mode])
  const advance = useCallback((round, at = performance.now()) => {
    if (!round?.feedbackContext || round.paused || round.finished) return
    consume(getBaseballFlightFeedbackEvents({ ...round.feedbackContext, startAt: round.startAt,
      windupMs: BASEBALL_RULES.windupMs, pitch: round.pitch, swingAtMs: round.swingAt,
      result: round.decision || null }), at)
  }, [consume])
  const finish = useCallback((round, facts) => {
    if (!round?.feedbackContext) return
    const at = performance.now()
    consume(getBaseballResultFeedbackEvents({ ...round.feedbackContext, ...facts,
      confirmed: true, confirmedAtMs: at }), at)
  }, [consume])
  const cancel = useCallback(round => {
    if (round) round.feedbackContext = null
    latest.current.stop()
  }, [])
  return { feedback, prepare, begin, advance, finish, cancel }
}
