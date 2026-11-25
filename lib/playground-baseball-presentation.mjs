import { BASEBALL_RULES, sampleBaseballBat, sampleBaseballPlatePassage } from './playground-baseball.mjs'

const finite = value => typeof value === 'number' && Number.isFinite(value)
const point = value => value && finite(value.x) && finite(value.y) && finite(value.z)

function marker(kind, value, timeMs) {
  return Object.freeze({ kind, point:Object.freeze({ x:value.x, y:value.y, z:value.z }), timeMs })
}

/**
 * Return only an event the displayed pitch clock has already reached.
 * Main and close-up views project this same world point independently.
 * A legacy pre-plane contact must never turn into an imagined plane passage.
 */
export function getBaseballPlateMarker({ pitch, flightMs, result = null, moving = true } = {}) {
  if (!moving || !pitch || !finite(flightMs) || flightMs < 0) return null

  const passage = sampleBaseballPlatePassage(pitch)
  if (result?.contacted === true) {
    const contactTime = result.contactAtMs
    if (!finite(contactTime) || contactTime < 0 || !point(result.contactPoint)) return null
    if (flightMs >= contactTime) return marker('contact', result.contactPoint, contactTime)
    // Before an actual pre-plane contact, neither event has happened yet.
    if (contactTime <= passage.timeMs) return null
  }

  return flightMs >= passage.timeMs ? marker('passage', passage.point, passage.timeMs) : null
}

/** Separate the chosen target, current sweep and an already-observed event review. */
export function getBaseballBatPresentation({
  phase = 'setup', pitch = null, flightMs = null, swingAt = null, swingAim = null,
  aim = null, handedness = 'right', result = null, marker: suppliedMarker,
} = {}) {
  const moving = ['windup', 'flight', 'result', 'complete'].includes(phase)
  const started = moving && finite(flightMs) && finite(swingAt)
  const selectedAim = started ? swingAim || aim : aim
  const fixedAim = selectedAim && finite(selectedAim.x) && finite(selectedAim.y)
    ? Object.freeze({ x:selectedAim.x, y:selectedAim.y, z:0 }) : null
  const hasSwing = started && Boolean(fixedAim)
  const liveElapsedMs = hasSwing ? flightMs - swingAt : null
  const liveBat = hasSwing ? sampleBaseballBat({ swingElapsedMs:liveElapsedMs, aim:fixedAim, handedness }) : null
  const previewBat = !hasSwing && fixedAim && ['setup', 'ready', 'windup', 'flight', 'paused'].includes(phase)
    ? { ...sampleBaseballBat({ swingElapsedMs:BASEBALL_RULES.swingContactMs, aim:fixedAim, handedness }), active:false } : null
  const event = suppliedMarker === undefined
    ? getBaseballPlateMarker({ pitch, flightMs, result, moving }) : suppliedMarker
  // A supplied prediction is not an observed event. A late click must not turn
  // its negative event-time offset into a fictitious 0ms review pose.
  const observed = moving && event && ['contact', 'passage'].includes(event.kind) &&
    finite(event.timeMs) && event.timeMs >= 0 && finite(flightMs) && flightMs >= event.timeMs ? event : null
  const reviewAtMs = observed?.timeMs ?? null
  const reviewElapsedMs = hasSwing && observed ? reviewAtMs - swingAt : null
  const reviewBat = hasSwing && observed && reviewElapsedMs >= 0
    ? sampleBaseballBat({ swingElapsedMs:reviewElapsedMs, aim:fixedAim, handedness }) : null
  const noReviewReason = !moving ? 'inactive-phase' : !hasSwing ? 'no-swing' : !observed ? 'pending-event'
    : reviewElapsedMs < 0 ? 'not-started' : !reviewBat.visible ? 'swing-outside-visibility' : null
  return Object.freeze({
    hasSwing, fixedAim, previewBat, liveBat, reviewBat, liveElapsedMs,
    reviewAtMs, reviewElapsedMs, reviewKind:observed?.kind ?? null,
    showFixedAim:Boolean(fixedAim && (previewBat || hasSwing)),
    showPreview:Boolean(previewBat), showLive:Boolean(liveBat?.visible), showReview:Boolean(reviewBat?.visible), noReviewReason,
  })
}
