import { BASEBALL_RULES, judgeBaseballSwing, judgeBaseballTake, sampleBaseballBat,
  sampleBaseballPitch } from './playground-baseball.mjs'
import { BASEBALL_FIELD_MODEL } from './playground-baseball-field.mjs'
import { BASEBALL_REGULAR_SEASON_GAMES } from './playground-baseball-career-schedule.mjs'

// Versioned v2 growth kernel. The v1 engine stays byte-for-byte available for
// pinned old saves; this compatible math copy never changes its rules or RNG.
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const baseRadiusM = BASEBALL_RULES.batRadiusM + BASEBALL_RULES.ballRadiusM

export const BASEBALL_GROWTH_RULES = freeze({
  id: 'baseball-career-growth-v2', baseAbility: 40, maximumAbility: 100,
  maximumContactBonus: .12, maximumPowerBonus: .05, outerQualityMaximum: .55,
})

export function getBaseballGrowthProfile({ mit, power } = {}) {
  if (![mit, power].every(value => Number.isInteger(value) && value >= 0 && value <= 100)) {
    throw new RangeError('Growth abilities must be integers from 0 to 100.')
  }
  const progress = value => clamp((value - 40) / 60, 0, 1)
  const contactMultiplier = 1 + BASEBALL_GROWTH_RULES.maximumContactBonus * progress(mit)
  return freeze({ mit, power, contactMultiplier, contactRadiusM: baseRadiusM * contactMultiplier,
    powerMultiplier: 1 + BASEBALL_GROWTH_RULES.maximumPowerBonus * progress(power),
    outerQualityMaximum: BASEBALL_GROWTH_RULES.outerQualityMaximum })
}

// The existing field resolver validates landingTimeMs against this trajectory.
// Scaling only exit speed would leave an inconsistent, rejected batted ball.
function trajectory(exitSpeedKmh, launchAngleDeg, height) {
  const angle = launchAngleDeg * Math.PI / 180, speed = exitSpeedKmh / 3.6
  const vertical = speed * Math.sin(angle), horizontal = speed * Math.cos(angle)
  const gravity = BASEBALL_RULES.gravityMps2, drag = BASEBALL_FIELD_MODEL.airDragPerSecond
  const seconds = (vertical + Math.sqrt(vertical ** 2 + 2 * gravity * height)) / gravity
  return { exitSpeedKmh, launchAngleDeg, landingTimeMs: seconds * 1000,
    distanceM: horizontal * -Math.expm1(-drag * seconds) / drag }
}

function assistedContact(pitch, input, baseline, profile) {
  // Reuse the original engine's exact event, active-window decision and closest
  // finite-segment geometry. Enlarging the allowance never moves the ball/aim.
  if (baseline.outcome !== 'miss' || baseline.missReason !== 'outside-barrel' || !baseline.activeAtPlate
    || profile.contactMultiplier === 1) return null
  const ball = baseline.platePassage.point, closest = baseline.barrelClosestPoint
  const distance = Math.hypot(ball.x - closest.x, ball.y - closest.y, ball.z - closest.z)
  if (distance > profile.contactRadiusM + BASEBALL_RULES.collisionToleranceM) return null
  const handedness = input.handedness ?? 'right', elapsed = baseline.swingElapsedMs
  const bat = sampleBaseballBat({ swingElapsedMs: elapsed, aim: input.aim, handedness })
  const fraction = baseline.barrelFraction, verticalOffset = ball.y - closest.y
  // These private core calculations are repeated only for newly assisted misses;
  // physical contacts always keep the actual engine result. The quality basis
  // stays 7.3cm; the cap is applied before speed, angle and score are calculated.
  const barrelQuality = clamp(1 - Math.abs(fraction - .5) * 2, 0, 1)
  const verticalQuality = clamp(1 - Math.abs(verticalOffset) / baseRadiusM, 0, 1)
  const squareQuality = clamp(1 - Math.abs(bat.angleRad) / 1.05, 0, 1)
  const quality = Math.min(profile.outerQualityMaximum,
    clamp(barrelQuality * .55 + verticalQuality * .25 + squareQuality * .20, .03, 1))
  const hand = handedness === 'right' ? 1 : -1
  const directionDeg = clamp(-hand * bat.angleRad * 180 / Math.PI * 1.2 + hand * (fraction - .5) * 22, -85, 85)
  const foul = Math.abs(directionDeg) > 45
  const stepMs = .01, timeMs = baseline.platePassage.timeMs
  const ballAfter = sampleBaseballPitch(pitch, timeMs + stepMs)
  const batAfter = sampleBaseballBat({ swingElapsedMs: elapsed + stepMs, aim: input.aim, handedness })
  const after = {
    x: batAfter.start.x + (batAfter.end.x - batAfter.start.x) * fraction,
    y: batAfter.start.y + (batAfter.end.y - batAfter.start.y) * fraction,
    z: batAfter.start.z + (batAfter.end.z - batAfter.start.z) * fraction,
  }
  const relativeSpeedKmh = Math.hypot(ballAfter.x - ball.x - after.x + closest.x,
    ballAfter.y - ball.y - after.y + closest.y, ballAfter.z - ball.z - after.z + closest.z) / stepMs * 1000 * 3.6
  const speed = clamp(relativeSpeedKmh * (.85 + quality * .42), 40, 190)
  const angle = clamp(15 + quality * 10 + verticalOffset / baseRadiusM * 32, -28, 60)
  return freeze({ ...baseline, outcome: foul ? 'foul' : 'contact', contacted: true, quality,
    contactAtMs: timeMs, contactPoint: { ...ball }, missReason: null, barrelGapM: 0,
    relativeSpeedKmh, score: foul ? 10 : Math.round(30 + quality * 45), directionDeg,
    ...trajectory(speed, angle, ball.y) })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const snapshotKeys = ['schemaVersion','policyId','careerId','careerRevision','gameIndex','slot','mit','power','contactMultiplier','contactRadiusM','powerMultiplier','outerQualityMaximum']

export function createBaseballGrowthSnapshot({careerId,careerRevision,gameIndex,slot,mit,power}={}) {
  if (!UUID.test(careerId) || !Number.isSafeInteger(careerRevision) || careerRevision < 1
    || !Number.isInteger(gameIndex) || gameIndex < 0 || gameIndex >= BASEBALL_REGULAR_SEASON_GAMES || ![1,2].includes(slot)) {
    throw new TypeError('Invalid growth snapshot ownership.')
  }
  return freeze({schemaVersion:1,policyId:BASEBALL_GROWTH_RULES.id,careerId,careerRevision,gameIndex,slot,
    ...getBaseballGrowthProfile({mit,power})})
}

export function validateBaseballGrowthSnapshot(value) {
  if (!value || Object.getPrototypeOf(value)!==Object.prototype || Object.keys(value).length!==snapshotKeys.length
    || snapshotKeys.some(key=>!Object.hasOwn(value,key)) || value.schemaVersion!==1 || value.policyId!==BASEBALL_GROWTH_RULES.id) {
    throw new TypeError('A versioned growth snapshot is required.')
  }
  const expected=createBaseballGrowthSnapshot(value)
  if(snapshotKeys.some(key=>value[key]!==expected[key]))throw new TypeError('Growth snapshot modifiers do not match its abilities.')
  return true
}

export function judgeBaseballGrowthSwing(pitch,input,snapshot) {
  validateBaseballGrowthSnapshot(snapshot)
  const baseline=judgeBaseballSwing(pitch,input)
  let result=assistedContact(pitch,input,baseline,snapshot)||baseline
  if(result.contacted && snapshot.powerMultiplier!==1) {
    const speed=clamp(result.exitSpeedKmh*snapshot.powerMultiplier,40,190)
    if(speed!==result.exitSpeedKmh)result=freeze({...result,...trajectory(speed,result.launchAngleDeg,result.contactPoint.y)})
  }
  return result
}

export function judgeBaseballGrowthTake(pitch,snapshot) {
  validateBaseballGrowthSnapshot(snapshot)
  return judgeBaseballTake(pitch)
}
