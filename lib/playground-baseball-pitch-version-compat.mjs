import { BASEBALL_PITCH_TYPES } from './playground-baseball.mjs'

// Source identities of the released V1 four-pitch engine and session.
const priorAtBat = Object.freeze({
  atBatHash: '6a6b6d234f1287aca81112744db90cc8143dae5af4a0b767b7cd4cff5bfcc923',
  sessionHash: 'a3c8c9001d9d25277d8c8d030a922bbd8f3a72310f4a9898e89714fff9983a7a',
})
const priorCareer = Object.freeze({
  ...priorAtBat,
  careerHash: '0def3dac19a65083128addf66e87869356d5ba18a88749f6cc072d788fef77f8',
})

export function matchesBaseballVersions(pinned, expected) {
  return Boolean(pinned && expected && Object.keys(expected).length
    && Object.keys(expected).every(key => Object.hasOwn(pinned, key) && pinned[key] === expected[key]))
}

export function isLegacyBaseballAtBatPitchMode(pitchMode) {
  return pitchMode === 'mixed' || BASEBALL_PITCH_TYPES.some(({ id }) => id === pitchMode)
}

function matchV1(pinned, current, pitchMode, prior) {
  return matchesBaseballVersions(pinned, current)
    || Boolean(current && isLegacyBaseballAtBatPitchMode(pitchMode)
      && matchesBaseballVersions(pinned, { ...current, ...prior }))
}

export function matchesBaseballAtBatVersions(pinned, current, pitchMode) {
  return matchV1(pinned, current, pitchMode, priorAtBat)
}

export function matchesBaseballCareerV1Versions(pinned, current, pitchMode) {
  return matchV1(pinned, current, pitchMode, priorCareer)
}
