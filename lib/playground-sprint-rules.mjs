// sprint-v2 keeps its existing board for approved tuning; sprint-v1 remains separate.
export const SPRINT_RULE_VERSION = 'sprint-v2'
export const LEGACY_SPRINT_RULE_VERSION = 'sprint-v1'

export function isSupportedSprintRuleVersion(value) {
  return value === SPRINT_RULE_VERSION || value === LEGACY_SPRINT_RULE_VERSION
}
