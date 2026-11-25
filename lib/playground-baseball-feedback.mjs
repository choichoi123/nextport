// Presentation events consume existing game facts. They never judge or mutate a pitch.
export const BASEBALL_FEEDBACK = Object.freeze({
  id: 'baseball-feedback-v1', mittDelayMs: 80, transientMaxLagMs: 180,
  resultMaxLagMs: 2000, seenTtlMs: 300000, maximumSeen: 256,
})

const finite = value => typeof value === 'number' && Number.isFinite(value)
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value)
const origins = new Set(['live', 'preview'])
const modes = new Set(['practice', 'at-bat'])
const contacts = new Set(['foul', 'contact', 'perfect'])
const hits = new Set(['single', 'double', 'triple', 'home-run'])
const outs = new Set(['flyout', 'lineout', 'groundout'])
const strikeouts = new Set(['strikeout-looking', 'strikeout-swinging'])
const eventTypes = new Set(['release', 'swing', 'pass', 'contact', 'mitt', 'call', 'result'])
const channels = new Set(['effects', 'voice', 'crowd'])
const allowedCalls = new Set(['strike', 'foul', 'out', 'strikeout', 'ball', 'walk'])
const engineOutcomes = new Set(['ball', 'called-strike', 'miss', 'foul', 'contact', 'perfect'])
const finalOutcomes = new Set([...hits, ...outs, ...strikeouts, 'walk'])

const identity = (options, type, terminal = false) => JSON.stringify([
  BASEBALL_FEEDBACK.id, options.origin, options.mode, options.scopeId, options.pitchId,
  terminal ? 'confirmed' : options.attemptId, type,
])
function context(options, attempt = false) {
  return options && origins.has(options.origin) && modes.has(options.mode)
    && identifier(options.scopeId) && identifier(options.pitchId) && (!attempt || identifier(options.attemptId))
}
function event(options, type, atMs, channel, extra = {}, terminal = false) {
  return Object.freeze({ id: identity(options, extra.outcome ? `${type}:${extra.outcome}` : extra.call ? `${type}:${extra.call}` : type, terminal),
    type, atMs, channel, origin: options.origin, mode: options.mode, ...extra })
}
function contactDetails(result) {
  const extra = { outcome: result.outcome }
  if (finite(result.quality) && result.quality >= 0 && result.quality <= 1) extra.quality = result.quality
  const point = result.contactPoint
  if (point && ['x', 'y', 'z'].every(key => finite(point[key]))) extra.point = Object.freeze({ x: point.x, y: point.y, z: point.z })
  return extra
}

/**
 * All atMs values use the caller's performance clock. Call for each current tick;
 * do not schedule every returned future sound, since a later contact cancels mitt.
 * null result plus no swing is the as-yet untouched pitch, not a final umpire call.
 */
export function getBaseballFlightFeedbackEvents(options = {}) {
  if (!context(options, true)) return Object.freeze([])
  const { startAt, windupMs, pitch, swingAtMs = null, result = null } = options
  if (!finite(startAt) || !finite(windupMs) || windupMs < 0 || !finite(pitch?.flightTimeMs) || pitch.flightTimeMs <= 0) return Object.freeze([])
  const releaseAt = startAt + windupMs, plateAt = releaseAt + pitch.flightTimeMs
  if (!finite(releaseAt) || !finite(plateAt)) return Object.freeze([])
  const events = [event(options, 'release', releaseAt, 'effects')]
  if (swingAtMs !== null && finite(swingAtMs) && finite(releaseAt + swingAtMs)) events.push(event(options, 'swing', releaseAt + swingAtMs, 'effects'))
  if (result?.contacted === true) {
    if (contacts.has(result.outcome) && finite(result.contactAtMs) && result.contactAtMs >= 0 && finite(releaseAt + result.contactAtMs)) {
      events.push(event(options, 'contact', releaseAt + result.contactAtMs, 'effects', contactDetails(result)))
    }
  } else if (result?.contacted === false && engineOutcomes.has(result.outcome) && !contacts.has(result.outcome)
    || result === null && swingAtMs === null) {
    events.push(event(options, 'pass', plateAt, 'effects'))
    events.push(event(options, 'mitt', plateAt + BASEBALL_FEEDBACK.mittDelayMs, 'effects'))
  }
  return Object.freeze(events.sort((a, b) => a.atMs - b.atMs))
}

function finalDetails(result, outcome) {
  const details = { outcome, confirmed: true }
  for (const key of ['quality', 'distanceM', 'exitSpeedKmh']) if (finite(result[key]) && result[key] >= 0 && (key !== 'quality' || result[key] <= 1)) details[key] = result[key]
  return details
}

/** Called only at a newly confirmed live result, never while restoring a checkpoint. */
export function getBaseballResultFeedbackEvents(options = {}) {
  if (!context(options) || options.confirmed !== true || !finite(options.confirmedAtMs)) return Object.freeze([])
  if (options.origin === 'preview' ? options.authority !== 'preview' : !['memory', 'server'].includes(options.authority)) return Object.freeze([])
  const { result, terminalOutcome = null, fieldResult = null, countAfter = null } = options
  if (!result || !engineOutcomes.has(result.outcome) || result.contacted !== contacts.has(result.outcome)) return Object.freeze([])
  if (terminalOutcome !== null && !finalOutcomes.has(terminalOutcome)) return Object.freeze([])
  const atMs = options.confirmedAtMs, events = []
  const call = value => events.push(event(options, 'call', atMs, 'voice', { call: value, confirmed: true }, true))
  const finish = value => events.push(event(options, 'result', atMs, 'crowd', finalDetails(result, value), true))
  if (options.mode === 'practice') {
    // Ten-pitch practice has no resolved field, plate-appearance outs or home runs.
    if (result.outcome === 'foul') call('foul')
    else if (result.outcome === 'miss' || result.outcome === 'called-strike') call('strike')
    else if (result.outcome === 'ball') call('ball')
    return Object.freeze(events)
  }
  if (result.outcome === 'foul') {
    if (terminalOutcome !== null) return Object.freeze([])
    call('foul')
  } else if (result.outcome === 'miss' || result.outcome === 'called-strike') {
    if (terminalOutcome !== null) {
      const expected = result.outcome === 'miss' ? 'strikeout-swinging' : 'strikeout-looking'
      if (terminalOutcome !== expected || countAfter?.strikes !== 3) return Object.freeze([])
      call('strikeout'); finish(terminalOutcome)
    } else {
      if (countAfter && (!Number.isInteger(countAfter.strikes) || countAfter.strikes < 1 || countAfter.strikes > 2)) return Object.freeze([])
      call('strike')
    }
  } else if (result.outcome === 'ball') {
    if (terminalOutcome !== null) {
      if (terminalOutcome !== 'walk' || countAfter?.balls !== 4) return Object.freeze([])
      call('walk'); finish('walk')
    } else {
      if (countAfter && (!Number.isInteger(countAfter.balls) || countAfter.balls < 1 || countAfter.balls > 3)) return Object.freeze([])
      call('ball')
    }
  } else if (hits.has(fieldResult?.outcome) || outs.has(fieldResult?.outcome)) {
    if (terminalOutcome !== fieldResult.outcome) return Object.freeze([])
    if (terminalOutcome === 'home-run' && (fieldResult.reasonKey !== undefined && fieldResult.reasonKey !== 'over-fence'
      || fieldResult.bases !== undefined && fieldResult.bases !== 4 || fieldResult.landingPoint !== undefined && fieldResult.landingPoint !== null)) return Object.freeze([])
    if (outs.has(terminalOutcome)) call('out')
    finish(terminalOutcome)
  }
  return Object.freeze(events)
}

function validEvent(value) {
  return value && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(value.id) && eventTypes.has(value.type) && finite(value.atMs)
    && channels.has(value.channel) && value.channel === (value.type === 'call' ? 'voice' : value.type === 'result' ? 'crowd' : 'effects') && origins.has(value.origin) && modes.has(value.mode)
    && (value.type !== 'call' || value.confirmed === true && allowedCalls.has(value.call))
    && (value.type !== 'result' || value.confirmed === true && finalOutcomes.has(value.outcome))
}

/** A bounded one-owner event consumer. Muting skips playback, not consumption. */
export function createBaseballFeedbackGate({ maxEntries = BASEBALL_FEEDBACK.maximumSeen, ttlMs = BASEBALL_FEEDBACK.seenTtlMs,
  maxTransientLagMs = BASEBALL_FEEDBACK.transientMaxLagMs, maxResultLagMs = BASEBALL_FEEDBACK.resultMaxLagMs } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096 || !finite(ttlMs) || ttlMs <= 0
    || !finite(maxTransientLagMs) || maxTransientLagMs < 0 || !finite(maxResultLagMs) || maxResultLagMs < 0) throw new TypeError('Invalid baseball feedback gate options.')
  const seen = new Map()
  return Object.freeze({
    take(events, nowMs) {
      if (!Array.isArray(events) || !finite(nowMs)) return Object.freeze([])
      for (const [key, at] of seen) if (nowMs - at > ttlMs) seen.delete(key)
      const accepted = [], consumed = new Set()
      for (const value of events) {
        if (!validEvent(value) || value.atMs > nowMs || consumed.has(value.id) || seen.has(value.id)) continue
        consumed.add(value.id)
        seen.set(value.id, nowMs)
        while (seen.size > maxEntries) seen.delete(seen.keys().next().value)
        const lag = nowMs - value.atMs, maxLag = ['call', 'result'].includes(value.type) ? maxResultLagMs : maxTransientLagMs
        if (lag <= maxLag) accepted.push(value)
      }
      return Object.freeze(accepted)
    },
    clear() { seen.clear() },
    size() { return seen.size },
  })
}
