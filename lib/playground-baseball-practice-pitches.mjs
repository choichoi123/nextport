import { BASEBALL_PITCH_TYPES, BASEBALL_RULES, createBaseballPitch, getBaseballPitchSpeed } from './playground-baseball.mjs'

// Game-tuned movement profiles shared by practice and the eight-pitch at-bat modes.
const sweeper = Object.freeze({
  id: 'sweeper',
  physicsType: 'slider',
  ratio: 0.84,
  dragPerSecond: 0.24,
  acceleration: Object.freeze({ x: 5.8, y: -7.1, z: 0 }),
})
const splitter = Object.freeze({
  id: 'splitter',
  physicsType: 'changeup',
  ratio: 0.86,
  dragPerSecond: 0.25,
  acceleration: Object.freeze({ x: -0.5, y: -12.2, z: 0 }),
})
const sinker = Object.freeze({
  id: 'sinker',
  physicsType: 'changeup',
  ratio: 0.96,
  dragPerSecond: 0.225,
  acceleration: Object.freeze({ x: -3.5, y: -9.8, z: 0 }),
})
const cutter = Object.freeze({
  id: 'cutter',
  physicsType: 'slider',
  ratio: 0.94,
  dragPerSecond: 0.23,
  acceleration: Object.freeze({ x: 1.6, y: -7.25, z: 0 }),
})
const extendedProfiles = new Map([
  [sweeper.id, sweeper],
  [splitter.id, splitter],
  [sinker.id, sinker],
  [cutter.id, cutter],
])

export const BASEBALL_PRACTICE_PITCH_TYPES = Object.freeze([...BASEBALL_PITCH_TYPES, ...extendedProfiles.values()])

export const BASEBALL_AT_BAT_MIXED_EIGHT = 'mixed-eight'
const atBatPitchModes = new Set(['mixed', BASEBALL_AT_BAT_MIXED_EIGHT, ...BASEBALL_PRACTICE_PITCH_TYPES.map(profile => profile.id)])

// The order is part of the persisted mixed-eight policy and cannot follow future additions.
const mixedEightAlternatives = Object.freeze(['slider', 'curveball', 'changeup', 'sweeper', 'splitter', 'sinker', 'cutter'])
export const isBaseballAtBatPitchMode = mode => atBatPitchModes.has(mode)
export const isBaseballExtendedPracticePitchType = pitchType => extendedProfiles.has(pitchType)

export const getBaseballPracticePitchType = pitch => pitch.practiceType ?? pitch.type

export function selectBaseballAtBatPitchType(mode, draw, fastballShare) {
  if (mode === 'mixed') {
    // Keep the original cutoffs for replays and seasons that already saved this mode.
    return draw < fastballShare ? 'four-seam' : draw < fastballShare + (1 - fastballShare) * 0.4 ? 'slider'
      : draw < fastballShare + (1 - fastballShare) * 0.68 ? 'curveball' : 'changeup'
  }
  if (mode !== BASEBALL_AT_BAT_MIXED_EIGHT) return mode
  if (draw < fastballShare) return 'four-seam'
  const index = Math.floor((draw - fastballShare) / (1 - fastballShare) * mixedEightAlternatives.length)
  return mixedEightAlternatives[index]
}

export function getBaseballPracticePitchSpeed(baseSpeedKmh, pitchType = 'four-seam') {
  const profile = extendedProfiles.get(pitchType)
  if (!profile) return getBaseballPitchSpeed(baseSpeedKmh, pitchType)
  // Use the shared validation for the fastball reference speed.
  getBaseballPitchSpeed(baseSpeedKmh)
  return Math.round(baseSpeedKmh * profile.ratio)
}

/** Solve the release velocity for the versioned flight engine's drag model. */
function solvePracticeFlight(release, target, acceleration, drag, speedKmh) {
  const speed = speedKmh / 3.6
  const velocityAt = time => {
    const factor = -Math.expm1(-drag * time) / drag
    const acceleratedTime = (time - factor) / drag
    return {
      x: (target.x - release.x - acceleration.x * acceleratedTime) / factor,
      y: (target.y - release.y - acceleration.y * acceleratedTime) / factor,
      z: -release.z / factor,
    }
  }
  const exceedsSpeed = time => {
    const { x, y, z } = velocityAt(time)
    return Math.hypot(x, y, z) > speed
  }
  // Choose the first flight solution, before the longer gravity-assisted arc.
  let low = release.z / speed * 0.7
  const upperBound = release.z / speed * 1.8 + 0.2
  const step = (upperBound - low) / 128
  let high = low + step
  while (high <= upperBound && exceedsSpeed(high)) {
    low = high
    high += step
  }
  if (high > upperBound) throw new RangeError('The requested target and speed have no supported flight solution.')
  for (let index = 0; index < 64; index += 1) {
    const time = (low + high) / 2
    if (exceedsSpeed(time)) low = time
    else high = time
  }
  const time = (low + high) / 2
  return { velocity: Object.freeze(velocityAt(time)), flightTimeMs: time * 1000 }
}

export function createBaseballPracticePitch({
  pitchType = 'four-seam', baseSpeedKmh = 120, seed = 1, target, pitcherHandedness,
} = {}) {
  const profile = extendedProfiles.get(pitchType)
  const speedKmh = getBaseballPracticePitchSpeed(baseSpeedKmh, pitchType)
  const pitch = createBaseballPitch({
    pitchType: profile?.physicsType ?? pitchType,
    speedKmh,
    seed,
    target,
    pitcherHandedness,
  })
  if (!profile) return pitch

  const acceleration = Object.freeze({
    ...profile.acceleration,
    x: profile.acceleration.x * (pitch.pitcherHandedness === 'left' ? -1 : 1),
  })
  const flight = solvePracticeFlight(pitch.release, pitch.target, acceleration, profile.dragPerSecond, speedKmh)
  // Sampling and collision accept the shared pitch format with explicit physics.
  // The practice type carries the displayed and recorded identity of the pitch.
  return Object.freeze({
    ...pitch,
    ...flight,
    id: `${seed}:${pitch.pitcherHandedness}:${pitchType}:${speedKmh}:${pitch.target.x}:${pitch.target.y}`,
    practiceType: pitchType,
    dragPerSecond: profile.dragPerSecond,
    acceleration,
  })
}
