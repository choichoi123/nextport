import { BASEBALL_PRACTICE_PITCH_TYPES, getBaseballPracticePitchType, isBaseballExtendedPracticePitchType } from './playground-baseball-practice-pitches.mjs'

// Development observation only: no game decisions, browser APIs or persistence.
const MAX_PITCHES = 10
const MAX_FRAMES = 320
const MIN_FRAME_MS = 16
const phases = new Set(['windup', 'flight', 'result', 'complete'])
const pitchTypes = new Set(BASEBALL_PRACTICE_PITCH_TYPES.map(pitch => pitch.id))
const outcomes = new Set(['perfect', 'contact', 'foul', 'miss', 'called-strike', 'ball'])
const motions = new Set(['ready', 'load', 'plant', 'precontact', 'contact', 'follow', 'recovery', 'reset'])
const finite = value => typeof value === 'number' && Number.isFinite(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const clone = value => JSON.parse(JSON.stringify(value))

function numbers(value, keys) {
  const output = {}
  if (object(value)) for (const key of keys) if (finite(value[key]) || value[key] === null) output[key] = value[key]
  return output
}

function booleans(value, keys, output = {}) {
  if (object(value)) for (const key of keys) if (typeof value[key] === 'boolean') output[key] = value[key]
  return output
}

function point(value) {
  if (!object(value)) return null
  return booleans(value, ['visible', 'released', 'arrived', 'landed', 'drawn'],
    numbers(value, ['x', 'y', 'z', 'radius', 'scale', 'ground', 'progress', 'speedKmh']))
}

function pitchMetadata(value) {
  if (!object(value) || typeof value.id !== 'string' || value.id.length > 180) return null
  const type = getBaseballPracticePitchType(value)
  if (!pitchTypes.has(type)) return null
  // The original four-seam ID omits its type. Typed IDs must match the practice registry.
  const idParts = /^\d{1,10}:(?:right|left):(?:([a-z-]+):)?[\d.+e-]+:[\d.+e-]+:[\d.+e-]+$/.exec(value.id)
  if (!idParts || (idParts[1] ?? 'four-seam') !== type) return null
  const output = { ...numbers(value, ['speedKmh', 'seed', 'flightTimeMs', 'dragPerSecond']), id:value.id, type }
  if (value.pitcherHandedness === 'left' || value.pitcherHandedness === 'right') output.pitcherHandedness = value.pitcherHandedness
  for (const key of ['release', 'target', 'velocity', 'acceleration']) if (object(value[key])) output[key] = numbers(value[key], ['x', 'y', 'z'])
  return output
}

function publicResult(value, observedPitchType) {
  if (!object(value) || !outcomes.has(value.outcome)) return null
  const output = booleans(value, ['contacted'], numbers(value, [
    'timingErrorMs', 'aimErrorM', 'quality', 'score', 'exitSpeedKmh', 'launchAngleDeg', 'distanceM',
    'directionDeg', 'landingTimeMs', 'contactAtMs', 'swingElapsedMs', 'barrelFraction', 'relativeSpeedKmh',
    'pitchSpeedKmh', 'pitchFlightTimeMs', 'barrelGapM',
  ]))
  output.outcome = value.outcome
  const type = isBaseballExtendedPracticePitchType(observedPitchType) ? observedPitchType : value.pitchType
  if (pitchTypes.has(type)) output.pitchType = type
  if (value.pitcherHandedness === 'left' || value.pitcherHandedness === 'right') output.pitcherHandedness = value.pitcherHandedness
  output.contactPoint = point(value.contactPoint)
  output.barrelClosestPoint = point(value.barrelClosestPoint)
  if (typeof value.activeAtPlate === 'boolean') output.activeAtPlate = value.activeAtPlate
  if (['outside-window','outside-barrel'].includes(value.missReason)) output.missReason = value.missReason
  if (object(value.platePassage)) output.platePassage = {
    ...booleans(value.platePassage, ['inside'], numbers(value.platePassage, ['timeMs', 'planeZ'])),
    point:point(value.platePassage.point),
  }
  return output
}

function inputMetadata(value) {
  if (!object(value)) return null
  const output = numbers(value, ['at', 'x', 'y'])
  const options = {
    source:['pointer', 'keyboard', 'button'], surface:['field', 'focus', 'button'],
    pointerType:['mouse', 'touch', 'pen', ''], code:['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
  }
  for (const [key, choices] of Object.entries(options)) if (choices.includes(value[key])) output[key] = value[key]
  if (object(value.point)) output.point = numbers(value.point, ['x', 'y', 'z'])
  return output
}

function renderedBall(value) {
  if (!object(value)) return null
  const output = point(value)
  if (object(value.world)) output.world = point(value.world)
  if (object(value.screen)) output.screen = point(value.screen)
  return output
}

function renderedView(value) {
  if (!object(value)) return null
  const output = booleans(value, ['batDrawn'], numbers(value, ['batLineWidth', 'batAlpha']))
  output.ball = renderedBall(value.ball)
  if (object(value.marker) && ['contact','passage'].includes(value.marker.kind)) output.marker = {
    kind:value.marker.kind,...numbers(value.marker,['timeMs']),world:point(value.marker.world),screen:point(value.marker.screen),
  }
  for (const key of ['batStart', 'batEnd', 'sweetSpot']) output[key] = point(value[key])
  if (object(value.fixedAim)) output.fixedAim = point(value.fixedAim)
  if (object(value.review) && ['contact', 'passage'].includes(value.review.kind) && finite(value.review.timeMs)) {
    output.review = { kind:value.review.kind, timeMs:value.review.timeMs,
      ...booleans(value.review, ['batDrawn'], numbers(value.review, ['batLineWidth', 'batAlpha'])) }
    for (const key of ['batStart', 'batEnd', 'sweetSpot']) output.review[key] = point(value.review[key])
  }
  output.zone = object(value.zone) ? numbers(value.zone, ['left', 'top', 'right', 'bottom', 'width', 'height']) : null
  return output
}

function displayFrame(sample) {
  const value = sample.frame || {}
  const output = { now:sample.now, phase:sample.phase, ...booleans(value, ['batted'],
    numbers(value, ['flightMs', 'swingElapsedMs', 'resultAt', 'width', 'height', 'ratio'])) }
  output.ball = point(value.ball)
  output.bat = object(value.bat) ? {
    ...booleans(value.bat, ['active', 'visible'], numbers(value.bat, ['radius', 'angleRad', 'progress'])),
    start:point(value.bat.start), end:point(value.bat.end), sweetSpot:point(value.bat.sweetSpot),
  } : null
  if (object(value.reviewBat)) output.reviewBat = {
    ...booleans(value.reviewBat, ['active', 'visible'], numbers(value.reviewBat, ['radius', 'angleRad', 'progress'])),
    start:point(value.reviewBat.start), end:point(value.reviewBat.end), sweetSpot:point(value.reviewBat.sweetSpot),
  }
  output.main = renderedView(value.main)
  output.focus = renderedView(value.focus)
  if (object(value.motion)) {
    output.motion = { footAnchor:point(value.motion.footAnchor) }
    if (object(value.motion.registrationAnchor)) output.motion.registrationAnchor = point(value.motion.registrationAnchor)
    if (motions.has(value.motion.name)) output.motion.name = value.motion.name
  }
  if (object(value.placement)) output.placement = {
    ...numbers(value.placement, ['x', 'y', 'scale']), stance:point(value.placement.stance),
  }
  return output
}

/** Bounded, detached copies of completed pitches; active targets never leave this helper. */
export function createBaseballObservation() {
  let state = 'idle'
  let armedAt = Infinity
  let active = null
  let records = []
  let aborted = 0
  const status = () => ({ state, completed:records.length, aborted })
  const abort = () => { if (active) aborted = Math.min(aborted + 1, 1000); active = null }
  return Object.freeze({
    arm(now) {
      if (!finite(now) || now < 0) throw new TypeError('Observation start time must be finite and nonnegative.')
      armedAt = now; active = null; records = []; aborted = 0; state = 'armed'
      return status()
    },
    stop() {
      if (state === 'armed' || state === 'recording') { abort(); state = 'stopped' }
      return status()
    },
    capture(sample) {
      if (state !== 'armed' && state !== 'recording') return status()
      if (!object(sample)) return status()
      if (!phases.has(sample.phase) || !finite(sample.startAt)) {
        abort(); state = 'armed'; return status()
      }
      if (!finite(sample.now) || sample.startAt < armedAt || sample.now < sample.startAt) return status()
      const metadata = pitchMetadata(sample.pitch)
      if (!metadata) return status()
      const key = `${sample.startAt}:${metadata.id}`
      if (active && active.key !== key) { abort(); state = 'armed' }
      if (!active) {
        if (!['windup', 'flight'].includes(sample.phase) || records.some(record => `${record.startAt}:${record.pitch.id}` === key)) return status()
        active = { key, startAt:sample.startAt, pitch:metadata, frames:[], swingAt:null, lastPhase:null }
        if (sample.handedness === 'left' || sample.handedness === 'right') active.handedness = sample.handedness
        state = 'recording'
      }
      const swingChanged = finite(sample.swingAt) && sample.swingAt !== active.swingAt
      const phaseChanged = sample.phase !== active.lastPhase
      if (finite(sample.swingAt)) active.swingAt = sample.swingAt
      active.aim = point(sample.aim)
      active.swingAim = point(sample.swingAim)
      // The renderer may still hold the previous pitch's last DOM input. Keep
      // only the first event belonging to this pitch's accepted swing.
      if (!active.input && finite(active.swingAt) && object(sample.input) &&
          finite(sample.input.at) && sample.input.at >= sample.startAt && sample.input.at <= sample.now) {
        active.input = inputMetadata(sample.input)
      }
      const result = publicResult(sample.result, metadata.type)
      const finished = (sample.phase === 'result' || sample.phase === 'complete') && result !== null
      const last = active.frames.at(-1)
      if (!last || sample.now - last.now >= MIN_FRAME_MS || swingChanged || phaseChanged || finished) {
        active.frames.push(displayFrame(sample))
        if (active.frames.length > MAX_FRAMES) active.frames.shift()
      }
      active.lastPhase = sample.phase
      if (finished) {
        const { key:ignoredKey, lastPhase:ignoredPhase, ...record } = active
        void ignoredKey; void ignoredPhase
        records.push({ ...record, result })
        active = null
        state = records.length >= MAX_PITCHES ? 'complete' : 'armed'
      }
      return status()
    },
    snapshot() { return clone(records) },
    status,
  })
}
