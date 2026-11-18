import {
  SPRINT_RULES,
  startSprintRace,
  advanceSprintRace,
  applySprintStride,
  applySprintCheer,
} from './playground-sprint.mjs'
import { getSprintBossState } from './playground-sprint-boss.mjs'
import { SPRINT_RULE_VERSION, LEGACY_SPRINT_RULE_VERSION, isSupportedSprintRuleVersion } from './playground-sprint-rules.mjs'

const validatedClips = new WeakSet()
const validatedTimelines = new WeakSet()
const FINISH_TOLERANCE_MS = 1
const FINISH_HOLD_MS = 1000
// Simulation origins are rule contracts; preparation presentation may change separately.
const simulationGunAt = ruleVersion => ruleVersion === LEGACY_SPRINT_RULE_VERSION ? 3000 : 4000

/** Validate a completed run and keep immutable snapshots after its valid input events. */
export function createSprintReplay({ events, finishTimeMs, ruleVersion = SPRINT_RULE_VERSION } = {}) {
  if (!isSupportedSprintRuleVersion(ruleVersion)) throw new TypeError('Replay rule version is not supported.')
  if (!Array.isArray(events) || events.length === 0) throw new TypeError('Replay requires recorded strides.')
  if (!Number.isFinite(finishTimeMs) || finishTimeMs <= 0) throw new RangeError('Replay finish time must be positive and finite.')

  const gunAt = simulationGunAt(ruleVersion)
  let race = advanceSprintRace({ ...startSprintRace(0, ruleVersion), startedAt: gunAt, countdownEndsAt: gunAt }, gunAt)
  const checkpoint = (atMs, state) => Object.freeze({ atMs, race: Object.freeze({ ...state }) })
  const checkpoints = [checkpoint(0, race)]
  const strides = []
  let previousAt = 0
  let previousFoot = null

  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new TypeError('Replay event must identify a stride or cheer.')
    const cheer = ruleVersion !== LEGACY_SPRINT_RULE_VERSION && event.action === 'cheer' && event.foot === undefined
    const stride = ['left', 'right'].includes(event.foot) &&
      (ruleVersion === LEGACY_SPRINT_RULE_VERSION || event.action === undefined)
    if (!cheer && !stride) throw new TypeError('Replay event must identify a stride or cheer.')
    if (!Number.isFinite(event.atMs) || event.atMs < previousAt || event.atMs >= finishTimeMs) {
      throw new RangeError('Replay strides must be ordered within the completed run.')
    }
    if (stride && event.foot === previousFoot) throw new RangeError('Replay must contain only valid alternating strides.')
    const next = cheer ? applySprintCheer(race, gunAt + event.atMs) : applySprintStride(race, event.foot, gunAt + event.atMs)
    if (next.status !== 'running' || (cheer ? next.cheers !== race.cheers + 1 : next.steps !== race.steps + 1)) {
      throw new RangeError('Replay contains an invalid event or an event after the finish.')
    }
    const atMs = event.atMs === 0 ? 0 : event.atMs
    const normalized = Object.freeze(cheer ? { atMs, action: 'cheer' } : { atMs, foot: event.foot })
    strides.push(normalized)
    checkpoints.push(checkpoint(normalized.atMs, next))
    previousAt = event.atMs
    if (stride) previousFoot = event.foot
    race = next
  }

  // A small margin admits floating-point drift from the original RAF updates.
  const finish = advanceSprintRace(race, gunAt + finishTimeMs + FINISH_TOLERANCE_MS * 2)
  if (finish.status !== 'finished' || Math.abs(finish.finishTimeMs - finishTimeMs) > FINISH_TOLERANCE_MS) {
    throw new RangeError('Replay finish time does not match its recorded strides.')
  }
  const finishFrame = Object.freeze({
    ...finish,
    elapsedMs: finishTimeMs,
    finishTimeMs,
    updatedAt: gunAt + finishTimeMs,
  })
  const clip = Object.freeze({
    ruleVersion,
    events: Object.freeze(strides),
    finishTimeMs,
    checkpoints: Object.freeze(checkpoints),
    finishFrame,
  })
  validatedClips.add(clip)
  return clip
}

/** Seek independently of the previous frame; the original race is never changed. */
export function getSprintReplayFrame(clip, elapsedMs) {
  if (!validatedClips.has(clip)) throw new TypeError('Create a validated sprint replay before requesting frames.')
  const requested = typeof elapsedMs === 'number' && !Number.isNaN(elapsedMs) ? elapsedMs : 0
  const atMs = Math.max(0, Math.min(clip.finishTimeMs, requested))
  if (atMs >= clip.finishTimeMs) return { ...clip.finishFrame }

  const { checkpoints } = clip
  let low = 0
  let high = checkpoints.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (checkpoints[middle].atMs <= atMs) low = middle
    else high = middle - 1
  }
  return { ...advanceSprintRace(checkpoints[low].race, simulationGunAt(clip.ruleVersion) + atMs) }
}

/** Keep preparation and a complete winning gesture outside the saved race clock. */
export function createSprintReplayTimeline(clip, { raceMode = 'solo', rivalSeed = 0, bossEncounter = false } = {}) {
  if (!validatedClips.has(clip)) throw new TypeError('Create a validated sprint replay before creating its timeline.')
  const boss = getSprintBossState(clip.finishFrame, raceMode, rivalSeed, bossEncounter)
  const ceremonyTailMs = boss?.won
    ? Math.max(0, boss.celebrationDurationMs - boss.celebrationElapsedMs) : 0
  const preparationMs = SPRINT_RULES.countdownMs
  const finishAtMs = preparationMs + clip.finishTimeMs
  const timeline = Object.freeze({
    clip,
    preparationMs,
    finishAtMs,
    ceremonyTailMs,
    finishHoldMs: FINISH_HOLD_MS,
    durationMs: finishAtMs + ceremonyTailMs + FINISH_HOLD_MS,
  })
  validatedTimelines.add(timeline)
  return timeline
}

/** Seek presentation time deterministically while leaving official time unchanged. */
export function getSprintReplayPresentation(timeline, positionMs) {
  if (!validatedTimelines.has(timeline)) throw new TypeError('Create a validated sprint replay timeline before requesting its presentation.')
  const requested = typeof positionMs === 'number' && !Number.isNaN(positionMs) ? positionMs : 0
  const position = Math.max(0, Math.min(timeline.durationMs, requested))
  const preparing = position < timeline.preparationMs
  const finished = position >= timeline.finishAtMs
  const race = preparing
    ? { ...advanceSprintRace(startSprintRace(0, timeline.clip.ruleVersion), position) }
    : getSprintReplayFrame(timeline.clip, finished ? timeline.clip.finishTimeMs : position - timeline.preparationMs)
  return {
    race,
    bossVictoryExtraMs: finished ? Math.max(0, position - timeline.finishAtMs) : 0,
    phase: preparing ? 'preparation' : finished ? 'finish' : 'race',
    positionMs: position,
    durationMs: timeline.durationMs,
  }
}
