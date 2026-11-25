// Game pitch profiles, continuous time, no browser or DB.
// The flight is a game approximation, not measured data for a real pitcher.
export const BASEBALL_RULES = Object.freeze({
  releaseDistanceM: 16.5,
  windupMs: 1200,
  swingContactMs: 110,
  swingDurationMs: 520,
  sessionPitches: 10,
  resolveAfterMs: 220,
  minimumSpeedKmh: 80,
  minimumOffspeedKmh: 60,
  maximumSpeedKmh: 160,
  gravityMps2: 9.81,
  backspinLiftMps2: 3,
  dragPerSecond: 0.22,
  ballRadiusM: 0.04,
  batRadiusM: 0.033,
  batBarrelLengthM: 0.64,
  batSweepRadiusM: 0.70,
  batAngularSpeedRadPerMs: 0.012,
  batRiseM: 0.15,
  batActiveStartMs: 0,
  batActiveEndMs: 210,
  collisionToleranceM: 0.0000001,
  courseMarginXM: 0.045,
  courseMarginYM: 0.035,
  plateMiddleZ: -0.2159,
  plateEndZ: -0.4318,
  zone: Object.freeze({ left: -0.2359, right: 0.2359, bottom: 0.48672, top: 1.0035 }),
  aimBounds: Object.freeze({ left: -0.65, right: 0.65, bottom: 0.15, top: 1.4 }),
})

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const finite = value => typeof value === 'number' && Number.isFinite(value)
const point = value => value && typeof value === 'object' && finite(value.x) && finite(value.y)
const effectiveGravity = BASEBALL_RULES.gravityMps2 - BASEBALL_RULES.backspinLiftMps2
const flightFactor = (time, drag = BASEBALL_RULES.dragPerSecond) => -Math.expm1(-drag * time) / drag

// Deliberate game-tuning values, not measurements from an individual pitcher.
// Horizontal acceleration is defined for right-handers and reversed for lefties.
export const BASEBALL_PITCH_TYPES = Object.freeze([
  { id: 'four-seam', ratio: 1, dragPerSecond: 0.22, acceleration: { x: 0, y: -effectiveGravity, z: 0 } },
  { id: 'slider', ratio: 0.88, dragPerSecond: 0.24, acceleration: { x: 2.4, y: -7.6, z: 0 } },
  { id: 'curveball', ratio: 0.75, dragPerSecond: 0.26, acceleration: { x: 1.0, y: -10.8, z: 0 } },
  { id: 'changeup', ratio: 0.82, dragPerSecond: 0.24, acceleration: { x: -1.6, y: -8.4, z: 0 } },
].map(profile => Object.freeze({ ...profile, acceleration: Object.freeze(profile.acceleration) })))
const profilesById = new Map(BASEBALL_PITCH_TYPES.map(profile => [profile.id, profile]))

function pitchProfile(type) {
  const profile = profilesById.get(type)
  if (!profile) throw new TypeError('Unknown baseball pitch type.')
  return profile
}

/** UI base speed is separate from the actual release speed accepted by create. */
export function getBaseballPitchSpeed(baseSpeedKmh, pitchType = 'four-seam') {
  const profile = pitchProfile(pitchType)
  if (!finite(baseSpeedKmh) || baseSpeedKmh < BASEBALL_RULES.minimumSpeedKmh || baseSpeedKmh > BASEBALL_RULES.maximumSpeedKmh) {
    throw new RangeError('Base pitch speed must be between 80 and 160 km/h.')
  }
  return Math.round(baseSpeedKmh * profile.ratio)
}

function pitchPhysics(pitch) {
  const profile = pitchProfile(pitch.type)
  // Support previously created four-seam objects without newly added fields.
  return { drag: pitch.dragPerSecond ?? profile.dragPerSecond, acceleration: pitch.acceleration ?? profile.acceleration }
}

function mixSeed(seed) {
  let value = (seed ^ 0x9e3779b9) >>> 0
  value = Math.imul(value ^ value >>> 16, 0x21f0aaad)
  value = Math.imul(value ^ value >>> 15, 0x735a2d97)
  return (value ^ value >>> 15) >>> 0
}

function validatePitch(pitch) {
  if (!pitch || !profilesById.has(pitch.type) || !finite(pitch.flightTimeMs) || pitch.flightTimeMs <= 0 ||
      !finite(pitch.speedKmh) || pitch.speedKmh < (pitch.type === 'four-seam' ? BASEBALL_RULES.minimumSpeedKmh : BASEBALL_RULES.minimumOffspeedKmh) || pitch.speedKmh > 160 ||
      !point(pitch.release) || !finite(pitch.release.z) || !point(pitch.target) ||
      !point(pitch.velocity) || !finite(pitch.velocity.z) || pitch.velocity.z >= 0 ||
      (pitch.pitcherHandedness !== undefined && pitch.pitcherHandedness !== 'right' && pitch.pitcherHandedness !== 'left')) {
    throw new TypeError('Invalid baseball pitch.')
  }
  const { drag, acceleration } = pitchPhysics(pitch)
  if ((pitch.type !== 'four-seam' && (pitch.dragPerSecond === undefined || pitch.acceleration === undefined)) ||
      (pitch.dragPerSecond !== undefined && !finite(pitch.dragPerSecond)) ||
      (pitch.acceleration !== undefined && !point(pitch.acceleration)) ||
      !finite(drag) || drag <= 0 || drag > 2 || !point(acceleration) || !finite(acceleration.z) || acceleration.z !== 0) {
    throw new TypeError('Invalid pitch physics.')
  }
}

/** Solve the release velocity so its full 3D magnitude equals the selected km/h. */
export function createBaseballPitch({ speedKmh = 120, seed = 1, target, pitcherHandedness, pitchType = 'four-seam' } = {}) {
  const profile = pitchProfile(pitchType)
  const minimumSpeed = pitchType === 'four-seam' ? BASEBALL_RULES.minimumSpeedKmh : BASEBALL_RULES.minimumOffspeedKmh
  if (!finite(speedKmh) || speedKmh < minimumSpeed || speedKmh > BASEBALL_RULES.maximumSpeedKmh) {
    throw new RangeError(`Pitch speed must be between ${minimumSpeed} and 160 km/h.`)
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Pitch seed must be an unsigned 32-bit integer.')
  if (pitcherHandedness !== undefined && pitcherHandedness !== 'right' && pitcherHandedness !== 'left') {
    throw new TypeError('Pitcher handedness must be right or left.')
  }
  if (target !== undefined && (!point(target) || Math.abs(target.x) > 1.25 || target.y < 0.1 || target.y > 2)) {
    throw new RangeError('Pitch target is outside the supported field.')
  }
  const zone = BASEBALL_RULES.zone
  const horizontal = mixSeed(seed) / 0x100000000
  const vertical = mixSeed(seed ^ 0xa511e9b3) / 0x100000000
  const aim = target === undefined
    ? {
      x: zone.left - BASEBALL_RULES.courseMarginXM + horizontal * (zone.right - zone.left + BASEBALL_RULES.courseMarginXM * 2),
      y: zone.bottom - BASEBALL_RULES.courseMarginYM + vertical * (zone.top - zone.bottom + BASEBALL_RULES.courseMarginYM * 2),
    }
    : { x: target.x, y: target.y }
  // One independent seeded choice per pitch; render samples never redraw a hand.
  const throwingHand = pitcherHandedness ?? ((mixSeed(seed ^ 0x6d2b79f5) & 1) === 0 ? 'right' : 'left')
  const release = { x: throwingHand === 'right' ? -0.34 : 0.34, y: 1.8, z: BASEBALL_RULES.releaseDistanceM }
  const drag = profile.dragPerSecond
  const acceleration = { x: profile.acceleration.x * (throwingHand === 'left' ? -1 : 1), y: profile.acceleration.y, z: 0 }
  const speed = speedKmh / 3.6
  const velocityAt = time => {
    const factor = flightFactor(time, drag)
    return {
      x: (aim.x - release.x - acceleration.x * (time - factor) / drag) / factor,
      y: (aim.y - release.y - acceleration.y * (time - factor) / drag) / factor,
      z: -release.z / factor,
    }
  }
  let low = release.z / speed * 0.7
  let high = release.z / speed * 1.8 + 0.2
  if (pitchType !== 'four-seam') {
    // Gravity makes required launch speed U-shaped in flight time. Find the
    // first descending-branch bracket rather than assuming the far bound is
    // below the requested speed (important for slow, high-target curves).
    const lowerBound = low
    const upperBound = high
    let found = false
    for (let step = 1; step <= 128; step += 1) {
      const candidate = lowerBound + (upperBound - lowerBound) * step / 128
      if (Math.hypot(...Object.values(velocityAt(candidate))) <= speed) {
        high = candidate
        found = true
        break
      }
      low = candidate
    }
    if (!found) throw new RangeError('The requested target and speed have no supported flight solution.')
  }
  for (let index = 0; index < 64; index++) {
    const time = (low + high) / 2
    const velocity = velocityAt(time)
    if (Math.hypot(velocity.x, velocity.y, velocity.z) > speed) low = time
    else high = time
  }
  const flightSeconds = (low + high) / 2
  return Object.freeze({
    id: pitchType === 'four-seam'
      ? `${seed}:${throwingHand}:${speedKmh}:${aim.x}:${aim.y}`
      : `${seed}:${throwingHand}:${pitchType}:${speedKmh}:${aim.x}:${aim.y}`,
    type: pitchType, speedKmh, seed, pitcherHandedness: throwingHand,
    dragPerSecond: drag, acceleration: Object.freeze(acceleration),
    release: Object.freeze(release), target: Object.freeze(aim),
    velocity: Object.freeze(velocityAt(flightSeconds)),
    flightTimeMs: flightSeconds * 1000,
  })
}

/** Absolute time since release: asking for frames never mutates the pitch. */
export function sampleBaseballPitch(pitch, elapsedMs) {
  validatePitch(pitch)
  if (!finite(elapsedMs)) throw new TypeError('Pitch time must be finite.')
  const { drag, acceleration } = pitchPhysics(pitch)
  const time = Math.max(0, elapsedMs) / 1000
  const factor = flightFactor(time, drag)
  const decay = Math.exp(-drag * time)
  const x = pitch.release.x + pitch.velocity.x * factor + acceleration.x * (time - factor) / drag
  const y = pitch.release.y + pitch.velocity.y * factor + acceleration.y * (time - factor) / drag
  const z = pitch.release.z + pitch.velocity.z * factor
  return {
    x, y, z,
    visible: elapsedMs >= 0 && z >= -1.4 && y >= 0,
    released: elapsedMs >= 0,
    arrived: elapsedMs >= pitch.flightTimeMs,
    progress: clamp(elapsedMs / pitch.flightTimeMs, 0, 1),
    speedKmh: Math.hypot(pitch.velocity.x * decay + acceleration.x * (1 - decay) / drag,
      pitch.velocity.y * decay + acceleration.y * (1 - decay) / drag,
      pitch.velocity.z * decay) * 3.6,
  }
}

function timeAtZ(pitch, z) {
  const { drag } = pitchPhysics(pitch)
  const factor = (z - pitch.release.z) / pitch.velocity.z
  return -Math.log1p(-drag * factor) / drag * 1000
}

/** Shared front-plane event for the drawn zone, take judgment and result marker. */
export function sampleBaseballPlatePassage(pitch) {
  validatePitch(pitch)
  const timeMs = timeAtZ(pitch, 0)
  if (!finite(timeMs) || timeMs < 0) throw new TypeError('Invalid front-plane passage time.')
  const sample = sampleBaseballPitch(pitch, timeMs)
  const point = Object.freeze({ x: sample.x, y: sample.y, z: 0 })
  const zone = BASEBALL_RULES.zone
  // Inclusive edges need only numerical roundoff tolerance (0.1 nanometres).
  // The passage point is never clamped or moved to make a pitch a strike.
  const epsilonM = 1e-10
  const inside = point.x >= zone.left - epsilonM && point.x <= zone.right + epsilonM &&
    point.y >= zone.bottom - epsilonM && point.y <= zone.top + epsilonM
  return Object.freeze({ timeMs, point, inside, planeZ: 0 })
}

export function isBaseballStrike(pitch) {
  return sampleBaseballPlatePassage(pitch).inside
}

const emptyResult = outcome => ({
  outcome, contacted: false, timingErrorMs: null, aimErrorM: null, quality: 0, score: 0,
  exitSpeedKmh: 0, launchAngleDeg: 0, distanceM: 0, directionDeg: 0,
  landingTimeMs: 0, contactAtMs: null, contactPoint: null,
  swingElapsedMs: null, activeAtPlate: false, barrelGapM: null,
  barrelFraction: null, barrelClosestPoint: null, missReason: null,
})

export function judgeBaseballTake(pitch) {
  const platePassage = sampleBaseballPlatePassage(pitch)
  return Object.freeze({ ...emptyResult(platePassage.inside ? 'called-strike' : 'ball'),
    pitchSpeedKmh: pitch.speedKmh, pitchFlightTimeMs: pitch.flightTimeMs,
    pitcherHandedness: pitch.pitcherHandedness ?? 'right', pitchType: pitch.type, platePassage })
}

function validateBatInput(swingElapsedMs, aim, handedness) {
  if (!finite(swingElapsedMs) || !point(aim) || Math.abs(aim.x) > 2 || aim.y < -0.5 || aim.y > 2.5) {
    throw new TypeError('Bat time and aim must be finite field coordinates.')
  }
  if (handedness !== 'left' && handedness !== 'right') throw new TypeError('Invalid batting handedness.')
}

/** The scene and judgment share this finite capsule on the visible z=0 plane. */
export function sampleBaseballBat({ swingElapsedMs, aim, handedness = 'right' } = {}) {
  validateBatInput(swingElapsedMs, aim, handedness)
  const rules = BASEBALL_RULES
  const time = clamp(swingElapsedMs, 0, rules.swingDurationMs)
  const hand = handedness === 'right' ? 1 : -1
  const initialAngle = -rules.swingContactMs * rules.batAngularSpeedRadPerMs
  const followEndMs = 240
  const followAngle = (followEndMs - rules.swingContactMs) * rules.batAngularSpeedRadPerMs
  const recovery = clamp((time - followEndMs) / (rules.swingDurationMs - followEndMs), 0, 1)
  const smoothRecovery = recovery * recovery * (3 - 2 * recovery)
  const angle = time <= followEndMs
    ? (time - rules.swingContactMs) * rules.batAngularSpeedRadPerMs
    : followAngle + (initialAngle - followAngle) * smoothRecovery
  const zoneMiddle = (rules.zone.bottom + rules.zone.top) / 2
  const tilt = clamp((aim.y - zoneMiddle) * 0.25 + 0.04, -0.10, 0.16)
  const cosTilt = Math.cos(tilt)
  // Keep the previous projected swing slope, but normalize it on the batting
  // plane: hidden depth must not shorten the visible 64cm hitting surface.
  const projectedX = hand * Math.cos(angle) * cosTilt
  const projectedY = Math.sin(tilt)
  const projectedLength = Math.hypot(projectedX, projectedY)
  const direction = { x: projectedX / projectedLength, y: projectedY / projectedLength, z: 0 }
  // The chosen target anchors the whole sweep; angle and timing still determine
  // its direction, active interval and contact quality.
  const sweetSpot = { x: aim.x, y: aim.y, z: 0 }
  const halfLength = rules.batBarrelLengthM / 2
  const endpoint = sign => ({
    x: sweetSpot.x + sign * direction.x * halfLength,
    y: sweetSpot.y + sign * direction.y * halfLength,
    z: sweetSpot.z + sign * direction.z * halfLength,
  })
  return {
    start: endpoint(-1), end: endpoint(1), radius: rules.batRadiusM, sweetSpot,
    visible: swingElapsedMs >= 0 && swingElapsedMs < rules.swingDurationMs,
    // Subtracting two absolute event times may round an inclusive edge by a
    // fraction of a nanosecond; this is not an extra gameplay timing window.
    active: swingElapsedMs >= 0 && swingElapsedMs >= rules.batActiveStartMs - 1e-9 && swingElapsedMs <= rules.batActiveEndMs + 1e-9,
    progress: time / rules.swingDurationMs,
    angleRad: angle, planeZ: 0,
  }
}

function closestOnBarrel(ball, bat) {
  const dx = bat.end.x - bat.start.x
  const dy = bat.end.y - bat.start.y
  const dz = bat.end.z - bat.start.z
  const fraction = clamp(((ball.x - bat.start.x) * dx + (ball.y - bat.start.y) * dy + (ball.z - bat.start.z) * dz) /
    (dx * dx + dy * dy + dz * dz), 0, 1)
  const position = { x: bat.start.x + fraction * dx, y: bat.start.y + fraction * dy, z: bat.start.z + fraction * dz }
  return { fraction, position, distance: Math.hypot(ball.x - position.x, ball.y - position.y, ball.z - position.z) }
}

function judgeSwingWithContactStart(pitch, { swingAtMs, aim, handedness = 'right' }, activeStartMs) {
  validatePitch(pitch)
  validateBatInput(swingAtMs, aim, handedness)
  const platePassage = sampleBaseballPlatePassage(pitch)
  const elapsed = platePassage.timeMs - swingAtMs
  const ball = platePassage.point
  const bat = sampleBaseballBat({ swingElapsedMs: elapsed, aim, handedness })
  const activeAtPlate = elapsed >= 0 && elapsed >= activeStartMs - 1e-9 && elapsed <= BASEBALL_RULES.batActiveEndMs + 1e-9
  const closest = activeAtPlate ? closestOnBarrel(ball, bat) : null
  const radius = BASEBALL_RULES.batRadiusM + BASEBALL_RULES.ballRadiusM
  const surfaceGap = closest ? Math.max(0, closest.distance - radius) : null
  const gap = surfaceGap !== null && surfaceGap <= BASEBALL_RULES.collisionToleranceM ? 0 : surfaceGap
  const base = { pitchSpeedKmh: pitch.speedKmh, pitchFlightTimeMs: pitch.flightTimeMs,
    pitcherHandedness: pitch.pitcherHandedness ?? 'right', pitchType: pitch.type, platePassage,
    timingErrorMs: swingAtMs + BASEBALL_RULES.swingContactMs - platePassage.timeMs,
    aimErrorM: Math.hypot(aim.x - ball.x, aim.y - ball.y),
    swingElapsedMs: elapsed, activeAtPlate, barrelGapM: gap,
    barrelFraction: closest?.fraction ?? null,
    barrelClosestPoint: closest ? Object.freeze({ ...closest.position }) : null }
  if (!closest || closest.distance > radius + BASEBALL_RULES.collisionToleranceM) {
    return Object.freeze({ ...emptyResult('miss'), ...base,
      missReason: activeAtPlate ? 'outside-barrel' : 'outside-window' })
  }
  const verticalOffset = ball.y - closest.position.y
  const barrelQuality = clamp(1 - Math.abs(closest.fraction - 0.5) * 2, 0, 1)
  const verticalQuality = clamp(1 - Math.abs(verticalOffset) / radius, 0, 1)
  const squareQuality = clamp(1 - Math.abs(bat.angleRad) / 1.05, 0, 1)
  const quality = clamp(barrelQuality * 0.55 + verticalQuality * 0.25 + squareQuality * 0.20, 0.03, 1)
  const hand = handedness === 'right' ? 1 : -1
  const directionDeg = clamp(-hand * bat.angleRad * 180 / Math.PI * 1.2 + hand * (closest.fraction - 0.5) * 22, -85, 85)
  const foul = Math.abs(directionDeg) > 45
  const perfect = barrelQuality >= 0.86 && verticalQuality >= 0.75 && squareQuality >= 0.87
  const outcome = foul ? 'foul' : perfect ? 'perfect' : 'contact'
  const stepMs = 0.01
  const ballAfter = sampleBaseballPitch(pitch, platePassage.timeMs + stepMs)
  const batAfter = sampleBaseballBat({ swingElapsedMs: elapsed + stepMs, aim, handedness })
  const pointAfter = {
    x: batAfter.start.x + (batAfter.end.x - batAfter.start.x) * closest.fraction,
    y: batAfter.start.y + (batAfter.end.y - batAfter.start.y) * closest.fraction,
    z: batAfter.start.z + (batAfter.end.z - batAfter.start.z) * closest.fraction,
  }
  const relativeSpeedKmh = Math.hypot(
    ballAfter.x - ball.x - pointAfter.x + closest.position.x,
    ballAfter.y - ball.y - pointAfter.y + closest.position.y,
    ballAfter.z - ball.z - pointAfter.z + closest.position.z,
  ) / stepMs * 1000 * 3.6
  const exitSpeedKmh = clamp(relativeSpeedKmh * (0.85 + quality * 0.42), 40, 190)
  const launchAngleDeg = clamp(15 + quality * 10 + verticalOffset / radius * 32, -28, 60)
  const speed = exitSpeedKmh / 3.6
  const verticalSpeed = speed * Math.sin(launchAngleDeg * Math.PI / 180)
  const horizontalSpeed = speed * Math.cos(launchAngleDeg * Math.PI / 180)
  const height = ball.y
  const landingSeconds = (verticalSpeed + Math.sqrt(verticalSpeed ** 2 + 2 * BASEBALL_RULES.gravityMps2 * height)) / BASEBALL_RULES.gravityMps2
  const horizontalDrag = 0.12
  const distanceM = horizontalSpeed * -Math.expm1(-horizontalDrag * landingSeconds) / horizontalDrag
  return Object.freeze({
    ...base, outcome, contacted: true, quality,
    contactAtMs: platePassage.timeMs, missReason: null,
    relativeSpeedKmh,
    score: foul ? 10 : Math.round((perfect ? 80 : 30) + quality * (perfect ? 20 : 45)),
    exitSpeedKmh, launchAngleDeg, directionDeg, distanceM,
    landingTimeMs: landingSeconds * 1000,
    contactPoint: Object.freeze({ x: ball.x, y: ball.y, z: ball.z }),
  })
}

/** A click starts one sweep; contact is evaluated at the exact front-plane event. */
export function judgeBaseballSwing(pitch, options = {}) {
  return judgeSwingWithContactStart(pitch, options, BASEBALL_RULES.batActiveStartMs)
}

/** Fixed v1 replay for the server's pinned historical manifest, never request-selected. */
export function judgeBaseballSwingLegacyV1(pitch, options = {}) {
  return judgeSwingWithContactStart(pitch, options, 20)
}

/** Simplified hit flight. Distance is a game estimate, never a measured result. */
export function sampleBaseballBattedBall(result, elapsedMs) {
  if (!result || !finite(elapsedMs) || !finite(result.exitSpeedKmh) || !finite(result.launchAngleDeg) ||
      !finite(result.directionDeg) || !finite(result.landingTimeMs)) throw new TypeError('Invalid batted-ball sample.')
  if (!result.contacted) return { x: 0, y: 0, z: 0, visible: false, landed: false }
  if (!point(result.contactPoint) || !finite(result.contactPoint.z) || result.landingTimeMs <= 0) throw new TypeError('Invalid batted-ball contact.')
  const time = clamp(elapsedMs, 0, result.landingTimeMs) / 1000
  const radians = result.launchAngleDeg * Math.PI / 180
  const direction = result.directionDeg * Math.PI / 180
  const speed = result.exitSpeedKmh / 3.6
  const horizontal = speed * Math.cos(radians) * -Math.expm1(-0.12 * time) / 0.12
  return {
    x: result.contactPoint.x + Math.sin(direction) * horizontal,
    y: Math.max(0, result.contactPoint.y + speed * Math.sin(radians) * time - BASEBALL_RULES.gravityMps2 * time ** 2 / 2),
    z: result.contactPoint.z + Math.cos(direction) * horizontal,
    visible: elapsedMs >= 0,
    landed: elapsedMs >= result.landingTimeMs,
    progress: clamp(elapsedMs / result.landingTimeMs, 0, 1),
  }
}
