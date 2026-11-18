// Changed movement rules use a separate board; existing sprint-v1 records remain valid.
export const SPRINT_RULE_VERSION = 'sprint-v2'
export const LEGACY_SPRINT_RULE_VERSION = 'sprint-v1'

export function isSupportedSprintRuleVersion(value) {
  return value === SPRINT_RULE_VERSION || value === LEGACY_SPRINT_RULE_VERSION
}
