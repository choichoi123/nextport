const directions = new Set(['recovery', 'discipline', 'power', 'balanced'])

export function isBaseballWinterPlan(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === 2 && Object.hasOwn(value, 'version') && Object.hasOwn(value, 'direction')
    && value.version === 1 && directions.has(value.direction)
}

/** Version 1 count goals are derived from the preceding settled season. */
export function getBaseballWinterGoal(plan, previousStats) {
  if (!isBaseballWinterPlan(plan) || !previousStats) return null
  const fields = plan.direction === 'discipline' ? ['BB'] : plan.direction === 'power' ? ['2B', '3B', 'HR'] : []
  if (!fields.length) return null
  const plateAppearances = previousStats.PA
  const counts = fields.map(field=>previousStats[field])
  if (![plateAppearances, ...counts].every(count=>Number.isSafeInteger(count) && count >= 0)) return null

  const previous = counts.reduce((sum, count)=>sum + count, 0)
  if (previous > plateAppearances) return null
  return {previous,target:Math.min(plateAppearances, previous + 3)}
}
