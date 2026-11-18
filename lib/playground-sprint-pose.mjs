const TAU = Math.PI * 2

export const SPRINT_POSE = Object.freeze({
  thighLength: 25.5,
  shinLength: 26,
  upperArmLength: 18,
  forearmLength: 16,
  stanceFraction: .4,
  cycleDistance: 4.4,
})

function wrap(value) {
  return ((value % 1) + 1) % 1
}

/** Circle intersection on the forward (+x for a downward leg) bend branch. */
export function solveForwardKnee(hip, target, thighLength = SPRINT_POSE.thighLength, shinLength = SPRINT_POSE.shinLength) {
  const dx = target[0] - hip[0]
  const dy = target[1] - hip[1]
  const targetDistance = Math.hypot(dx, dy)
  const minimum = Math.abs(thighLength - shinLength) + .000001
  const maximum = thighLength + shinLength - .000001
  const distance = Math.min(maximum, Math.max(minimum, targetDistance))
  const ux = targetDistance > .000001 ? dx / targetDistance : 0
  const uy = targetDistance > .000001 ? dy / targetDistance : 1
  const along = (thighLength * thighLength - shinLength * shinLength + distance * distance) / (2 * distance)
  const height = Math.sqrt(Math.max(0, thighLength * thighLength - along * along))
  return {
    hip: [...hip],
    knee: [hip[0] + ux * along + uy * height, hip[1] + uy * along - ux * height],
    ankle: [hip[0] + ux * distance, hip[1] + uy * distance],
  }
}

/** Stance travels front to rear on the ground; recovery lifts the heel. */
export function sampleSprintLeg(phase, hip = [-1, -45.5]) {
  const p = wrap(phase)
  const stance = p < SPRINT_POSE.stanceFraction
  let ankle
  if (stance) {
    const t = p / SPRINT_POSE.stanceFraction
    ankle = [18 - 40 * t, -2]
  } else {
    const t = (p - SPRINT_POSE.stanceFraction) / (1 - SPRINT_POSE.stanceFraction)
    const u = 1 - t
    // The x tangent matches the grounded foot at both ends. Squared sine
    // gives zero vertical velocity at takeoff and landing, avoiding snaps.
    const x = u * u * u * -22 + 3 * u * u * t * -42 + 3 * u * t * t * 38 + t * t * t * 18
    ankle = [x, -2 - 33 * Math.sin(Math.PI * t) ** 2]
  }
  return {
    ...solveForwardKnee(hip, ankle),
    phase: p,
    grounded: stance,
    footAngle: stance ? 0 : .25 * Math.sin((p - SPRINT_POSE.stanceFraction) / .6 * TAU),
  }
}

function sampleArm(phase, shoulder) {
  // An ipsilateral arm travels backward when its leg reaches forward.
  const angle = -.85 * Math.cos(wrap(phase) * TAU)
  const elbow = [shoulder[0] + Math.sin(angle) * SPRINT_POSE.upperArmLength, shoulder[1] + Math.cos(angle) * SPRINT_POSE.upperArmLength]
  const wrist = [elbow[0] + Math.sin(angle + Math.PI / 2) * SPRINT_POSE.forearmLength, elbow[1] + Math.cos(angle + Math.PI / 2) * SPRINT_POSE.forearmLength]
  return { shoulder, elbow, wrist }
}

function ease(value) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

function victoryArm(arm, upperAngle, forearmAngle, amount) {
  const upperStart = Math.atan2(arm.elbow[0] - arm.shoulder[0], arm.elbow[1] - arm.shoulder[1])
  const lowerStart = Math.atan2(arm.wrist[0] - arm.elbow[0], arm.wrist[1] - arm.elbow[1])
  const upper = upperStart + (upperAngle - upperStart) * amount
  const lower = lowerStart + (forearmAngle - lowerStart) * amount
  const elbow = [arm.shoulder[0] + Math.sin(upper) * SPRINT_POSE.upperArmLength, arm.shoulder[1] + Math.cos(upper) * SPRINT_POSE.upperArmLength]
  const wrist = [elbow[0] + Math.sin(lower) * SPRINT_POSE.forearmLength, elbow[1] + Math.cos(lower) * SPRINT_POSE.forearmLength]
  return { shoulder: arm.shoulder, elbow, wrist }
}

export function getSprintPose(race, celebration = null) {
  const distance = Number.isFinite(race.distance) ? Math.max(0, race.distance) : 0
  const moving = race.status === 'running' && race.speed > .15
  const phase = moving ? wrap(distance / SPRINT_POSE.cycleDistance) : 0
  const bob = moving ? -.8 * Math.cos(phase * TAU * 2) : 0
  const hip = [-1, -45.5 + bob]
  const near = moving
    ? sampleSprintLeg(phase, hip)
    : { ...solveForwardKnee(hip, [8, -2]), phase: 0, grounded: true, footAngle: 0 }
  const far = moving
    ? sampleSprintLeg(phase + .5, [-3, hip[1] - .5])
    : { ...solveForwardKnee([-3, hip[1] - .5], [-9, -2]), phase: .5, grounded: true, footAngle: 0 }
  const pose = {
    moving,
    phase,
    bob,
    jump: 0,
    celebrating: false,
    celebrationProgress: 0,
    hip,
    legs: { near, far },
    arms: {
      near: sampleArm(moving ? phase : .25, [8, -77 + bob]),
      far: sampleArm(moving ? phase + .5 : .22, [2, -76 + bob]),
    },
  }
  const duration = celebration?.durationMs
  const elapsed = celebration?.elapsedMs
  if (race.status !== 'finished' || !Number.isFinite(elapsed) || !Number.isFinite(duration) || duration <= 0 || elapsed < 0 || elapsed >= duration) return pose
  const t = elapsed / duration
  const raised = t < .7 ? ease(t / .22) : 1 - ease((t - .7) / .3)
  const hop = (start, end, height) => t > start && t < end ? Math.sin((t - start) / (end - start) * Math.PI) ** 2 * height : 0
  return {
    ...pose,
    celebrating: true,
    celebrationProgress: raised,
    jump: hop(.15, .38, 10) + hop(.46, .69, 7),
    arms: {
      near: victoryArm(pose.arms.near, 2.75, 2.9, raised),
      far: victoryArm(pose.arms.far, -2.75, -2.9, raised),
    },
  }
}
