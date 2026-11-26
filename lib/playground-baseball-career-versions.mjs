import { BASEBALL_AT_BAT_RULES, BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID } from './playground-baseball-at-bat-v2.mjs'
import { BASEBALL_ANNUAL_APPEARANCES_PER_GAME } from './playground-baseball-career-v2.mjs'
import { BASEBALL_REGULAR_SEASON_ID } from './playground-baseball-career-schedule.mjs'
import { isLegacyBaseballAtBatPitchMode, matchesBaseballVersions } from './playground-baseball-pitch-version-compat.mjs'
import { isBaseballAtBatPitchMode } from './playground-baseball-practice-pitches.mjs'

// Published source pins for four-pitch replays. A newer build must never
// dispatch a newly added mode under one of these identities.
export const BASEBALL_CAREER_V2_PRE_MIXED_EIGHT_HASHES = Object.freeze({
  engineHash:'88d5a74356ca25cb229c05ee08a7a2913b1d5df12cd103ed5bffd3cba87b0f12',
  rulesHash:'16ac0b909a6f5bfaf7432ca631dcffba8372b820742536e346986e59a5cc47bd',
  atBatHash:'13b44f4a38c0fa9bec91679f817e4da7fdb5779d74cb3152fc1d106aff4c3058',
  fieldHash:'6ff630518c1e7df67037bb827cc397d86c07715080446e03eb2858035af602e7',
  sessionHash:'ba96ff1b9739b4306a2e7e4f51f22b7d13e5291c064861fd9a86f23b7e136d45',
  careerHash:'13f61e8df876d9d866873b1e27b81591ef016502334278a8ed482f9d98eea68a',
  growthHash:'1a439384f602d1e830bb93e7f9f38a2b94b8d73479545017de97791fa9768b5c',
})

// The published trial retains its original training and schedule.
export const BASEBALL_CAREER_V2_TRIAL_HASHES = Object.freeze({
  ...BASEBALL_CAREER_V2_PRE_MIXED_EIGHT_HASHES,
  careerHash:'ad5ae63b1fc291aef4fc3e29e96ce2792593bf3d057bf7143047c841c6d17235',
  growthHash:'87408a30b8e52a5e0963b9d645b76dc64bea683819d22b45e0340ff9f0e554f5',
})

// The first 144-game build predates continued seasons and custom growth.
export const BASEBALL_CAREER_V2_PRIOR_REGULAR_HASHES = Object.freeze({
  ...BASEBALL_CAREER_V2_PRE_MIXED_EIGHT_HASHES,
  careerHash:'e18b462ede92441832b1f44292ca650696b0e1714cbc9043fb871236937b186b',
})

// Two-appearance seasons started after all eight pitch types were added.
export const BASEBALL_CAREER_V2_TWO_PA_HASHES = Object.freeze({
  ...BASEBALL_CAREER_V2_PRE_MIXED_EIGHT_HASHES,
  atBatHash:'e94a85e24c38c16708d72d8ebe1874acaa350ac03723f2dc87f69575c8c36b0d',
  sessionHash:'327c40d2c50cb8313beabbbae1a5e4215d3643f28b27a004e447a0d6a62846be',
  careerHash:'9c87e153dced4cb6615c6f8a1f3ab477ac542b19cd062a59348e758a58119dff',
})

// The 3-appearance release kept the original strike-zone distribution.
export const BASEBALL_CAREER_V2_PRE_BALANCED_HASHES = Object.freeze({
  ...BASEBALL_CAREER_V2_TWO_PA_HASHES,
  careerHash:'6e69104ebd3a9a3f350934a6615b254763d9c840786a3ddd14cacdfd002825be',
  growthHash:'ba3b03549c63308a9bd9101e040e4af5e238ac799e72befb9687937032d6382e',
  pitchPolicyId:BASEBALL_AT_BAT_RULES.pitchPolicyId,
})

const legacyPolicyId = BASEBALL_AT_BAT_RULES.pitchPolicyId
const legacyReplayVersions = hashes => ({ ...hashes, pitchPolicyId:legacyPolicyId })

function matchesPitchPolicyVersions(pinned, expected) {
  const expectedPolicy = expected?.pitchPolicyId ?? legacyPolicyId
  const pinnedPolicy = pinned?.pitchPolicyId === undefined ? legacyPolicyId : pinned.pitchPolicyId
  return pinnedPolicy === expectedPolicy && matchesBaseballVersions(pinned,expected)
}

function isDeployedPreBalanced(save) {
  return (save?.appearancesPerGame === undefined || save.appearancesPerGame === BASEBALL_ANNUAL_APPEARANCES_PER_GAME)
    && isBaseballAtBatPitchMode(save?.settings?.pitchMode)
    && matchesPitchPolicyVersions(save?.versions,BASEBALL_CAREER_V2_PRE_BALANCED_HASHES)
}

export function getBaseballCareerV2ReplayVersions(save, currentVersions) {
  if (save?.appearancesPerGame !== undefined && save.appearancesPerGame !== BASEBALL_ANNUAL_APPEARANCES_PER_GAME) return null
  const currentReplay = currentVersions?.pitchPolicyId === BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID
    && save?.appearancesPerGame === undefined ? legacyReplayVersions(currentVersions) : currentVersions
  if (matchesPitchPolicyVersions(save?.versions,currentReplay)) return currentReplay
  if (save?.scheduleId === BASEBALL_REGULAR_SEASON_ID && isDeployedPreBalanced(save)) {
    return BASEBALL_CAREER_V2_PRE_BALANCED_HASHES
  }
  if (save?.appearancesPerGame !== undefined) return null
  if (isBaseballAtBatPitchMode(save?.settings?.pitchMode) && matchesPitchPolicyVersions(save?.versions,BASEBALL_CAREER_V2_TWO_PA_HASHES)) {
    return legacyReplayVersions(BASEBALL_CAREER_V2_TWO_PA_HASHES)
  }
  if (!isLegacyBaseballAtBatPitchMode(save?.settings?.pitchMode)) return null
  if (save.scheduleId === undefined && matchesPitchPolicyVersions(save.versions,BASEBALL_CAREER_V2_TRIAL_HASHES)) {
    return legacyReplayVersions(BASEBALL_CAREER_V2_TRIAL_HASHES)
  }
  if (save.scheduleId === BASEBALL_REGULAR_SEASON_ID) {
    if (matchesPitchPolicyVersions(save.versions,BASEBALL_CAREER_V2_PRE_MIXED_EIGHT_HASHES)) {
      return legacyReplayVersions(BASEBALL_CAREER_V2_PRE_MIXED_EIGHT_HASHES)
    }
    if (save.startingGrowth === undefined && matchesPitchPolicyVersions(save.versions,BASEBALL_CAREER_V2_PRIOR_REGULAR_HASHES)) {
      return legacyReplayVersions(BASEBALL_CAREER_V2_PRIOR_REGULAR_HASHES)
    }
  }
  return null
}

export function supportsBaseballAnnualVersions(setup, currentVersions, priorAnnualVersions = BASEBALL_CAREER_V2_PRIOR_REGULAR_HASHES) {
  if (matchesPitchPolicyVersions(setup?.versions,currentVersions)) {
    return currentVersions.pitchPolicyId !== BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID
      || setup.appearancesPerGame === BASEBALL_ANNUAL_APPEARANCES_PER_GAME
  }
  if (isDeployedPreBalanced(setup)) return true
  if (setup?.appearancesPerGame !== undefined) return false
  if (isBaseballAtBatPitchMode(setup?.settings?.pitchMode) && matchesPitchPolicyVersions(setup?.versions,BASEBALL_CAREER_V2_TWO_PA_HASHES)) return true
  return isLegacyBaseballAtBatPitchMode(setup?.settings?.pitchMode)
    && (matchesPitchPolicyVersions(setup.versions,BASEBALL_CAREER_V2_PRE_MIXED_EIGHT_HASHES)
      || !setup.continuation && matchesPitchPolicyVersions(setup.versions,priorAnnualVersions))
}
