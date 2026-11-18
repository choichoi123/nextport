import { validateSprintPlayer } from './playground-sprint-player.mjs'
import { SPRINT_RULE_VERSION, isSupportedSprintRuleVersion } from './playground-sprint-rules.mjs'

export { SPRINT_RULE_VERSION }

function positiveTime(value) {
  return Number.isFinite(value) && value > 0
}

/** This visit's result only; it does not infer an online rank. */
export function classifySprintFinish({ finishTimeMs, previousBestMs, isDemo = false } = {}) {
  if (!positiveTime(finishTimeMs)) throw new RangeError('Finish time must be positive and finite.')
  const previous = previousBestMs === null || previousBestMs === undefined ? null : previousBestMs
  if (previous !== null && !positiveTime(previous)) throw new RangeError('Previous best time must be positive and finite.')
  if (isDemo) return { kind: 'demo', bestTimeMs: previous, improvementMs: 0 }
  if (previous === null) return { kind: 'first', bestTimeMs: finishTimeMs, improvementMs: 0 }
  if (finishTimeMs < previous) return { kind: 'best', bestTimeMs: finishTimeMs, improvementMs: previous - finishTimeMs }
  return { kind: 'finish', bestTimeMs: previous, improvementMs: 0 }
}

function normalizedIso(value) {
  if (typeof value !== 'string') return null
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!parts) return null
  const [, year, month, day, hour, minute, second, fraction = '', zone] = parts
  const dateParts = [year, month, day, hour, minute, second].map(Number)
  const milliseconds = Number(fraction.padEnd(3, '0'))
  // Date.parse alone normalizes some impossible calendar dates (e.g. February 30).
  const calendar = new Date(0)
  calendar.setUTCFullYear(dateParts[0], dateParts[1] - 1, dateParts[2])
  calendar.setUTCHours(dateParts[3], dateParts[4], dateParts[5], milliseconds)
  const actual = [calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate(), calendar.getUTCHours(), calendar.getUTCMinutes(), calendar.getUTCSeconds()]
  if (dateParts.some((part, index) => part !== actual[index])) return null
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

/** A local registration preview, not a database submission or TOP10 qualification. */
export function buildSprintRecordPreview(input = {}) {
  const values = input && typeof input === 'object' ? input : {}
  const checkedPlayer = validateSprintPlayer(values.player)
  const errors = { ...checkedPlayer.errors }
  const ruleVersion = values.ruleVersion === undefined ? SPRINT_RULE_VERSION : values.ruleVersion
  if (!isSupportedSprintRuleVersion(ruleVersion)) errors.ruleVersion = 'invalid'
  if (!positiveTime(values.finishTimeMs)) errors.finishTimeMs = 'invalid'
  const finishedAtISO = normalizedIso(values.finishedAtISO)
  if (!finishedAtISO) errors.finishedAtISO = 'invalid'
  if (Object.keys(errors).length > 0) return { valid: false, errors, record: null }
  return {
    valid: true,
    errors,
    record: Object.freeze({
      playerName: checkedPlayer.player.name,
      countryCode: checkedPlayer.player.countryCode,
      timeMs: values.finishTimeMs,
      finishedAtISO,
      ruleVersion,
      registrationStatus: 'preview',
    }),
  }
}
