import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPRINT_RULES,
  startSprintRace,
  advanceSprintRace,
  applySprintStride,
  applySprintCheer,
} from '../lib/playground-sprint.mjs'
import {
  createSprintReplay,
  getSprintReplayFrame,
  createSprintReplayTimeline,
  getSprintReplayPresentation,
} from '../lib/playground-sprint-replay.mjs'
import { getSprintStartSample } from '../lib/playground-sprint-start.mjs'
import { getSprintBossState, withSprintBossPresentation } from '../lib/playground-sprint-boss.mjs'

const origin = 777.125
const gunAt = origin + SPRINT_RULES.countdownMs

function near(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`)
}

function recordRun() {
  let race = startSprintRace(origin, 'sprint-v1')
  const events = []
  for (let step = 0; step < 300 && race.status !== 'finished'; step += 1) {
    const atMs = step * 175
    const foot = step % 2 ? 'right' : 'left'
    // Include renders between inputs, as in the original real-time game.
    if (step > 0) for (let offset = 13; offset < 175; offset += 13) race = advanceSprintRace(race, gunAt + atMs - 175 + offset)
    const next = applySprintStride(race, foot, gunAt + atMs)
    if (next.steps > race.steps) events.push({ atMs, foot })
    race = next
  }
  assert.equal(race.status, 'finished')
  return { events, finishTimeMs: race.finishTimeMs, race, ruleVersion: 'sprint-v1' }
}

const recorded = recordRun()

function originalFrame(atMs) {
  let race = advanceSprintRace(startSprintRace(origin, 'sprint-v1'), gunAt)
  for (const event of recorded.events) {
    if (event.atMs > atMs) break
    race = applySprintStride(race, event.foot, gunAt + event.atMs)
  }
  return advanceSprintRace(race, gunAt + atMs)
}

test('원 경기의 입력·거리·속도·발걸음을 여러 재생 시점에서 복원한다', () => {
  const clip = createSprintReplay(recorded)
  assert.equal(clip.events[0].atMs, 0)
  for (const atMs of [0, 50, 175, 349, 350, 3000, 7777, recorded.finishTimeMs - 1]) {
    const expected = originalFrame(atMs)
    const frame = getSprintReplayFrame(clip, atMs)
    assert.equal(frame.status, expected.status)
    assert.equal(frame.startedAt, 3000)
    assert.equal(frame.steps, expected.steps)
    assert.equal(frame.lastFoot, expected.lastFoot)
    near(frame.elapsedMs, atMs)
    near(frame.distance, expected.distance)
    near(frame.speed, expected.speed)
  }
  const finish = getSprintReplayFrame(clip, clip.finishTimeMs)
  assert.equal(finish.status, 'finished')
  assert.equal(finish.distance, 100)
  assert.equal(finish.steps, recorded.race.steps)
  assert.equal(finish.finishTimeMs, recorded.finishTimeMs)
})

test('앞뒤로 반복 탐색해도 원본·클립·이전 프레임을 변경하지 않는다', () => {
  const source = { events: recorded.events.map(event => ({ ...event })), finishTimeMs: recorded.finishTimeMs }
  const clip = createSprintReplay(source)
  const initial = getSprintReplayFrame(clip, 6000)
  const before = { ...initial }
  getSprintReplayFrame(clip, 1000)
  const sought = getSprintReplayFrame(clip, 6000)
  assert.deepEqual(sought, before)
  assert.deepEqual(initial, before)
  initial.distance = -100
  assert.deepEqual(getSprintReplayFrame(clip, 6000), before)
  source.events[0].atMs = 99
  source.events.push({ atMs: 999999, foot: 'right' })
  assert.equal(clip.events[0].atMs, 0)
  assert.equal(clip.events.length, recorded.events.length)
  assert.ok(Object.isFrozen(clip))
  assert.ok(Object.isFrozen(clip.events))
  assert.ok(Object.isFrozen(clip.events[0]))
  assert.ok(Object.isFrozen(clip.checkpoints))
  assert.ok(Object.isFrozen(clip.checkpoints[0].race))
  assert.ok(Object.isFrozen(clip.finishFrame))
})

test('범위 밖 시간은 시작·종료로 제한하고 잘못된 탐색 값은 시작으로 처리한다', () => {
  const clip = createSprintReplay(recorded)
  const start = getSprintReplayFrame(clip, 0)
  const finish = getSprintReplayFrame(clip, clip.finishTimeMs)
  for (const time of [-1000, -Infinity, Number.NaN, undefined, null, '100']) assert.deepEqual(getSprintReplayFrame(clip, time), start)
  for (const time of [clip.finishTimeMs + 10000, Infinity]) assert.deepEqual(getSprintReplayFrame(clip, time), finish)
  assert.throws(() => getSprintReplayFrame({ ...clip }, 1000), TypeError)
})

test('비정상·역행·반복 발·종료 뒤 입력은 거부한다', () => {
  const replaceFirst = event => [event, ...recorded.events.slice(1)]
  for (const events of [
    null,
    [],
    replaceFirst(null),
    replaceFirst({ atMs: 0, foot: 'up' }),
    replaceFirst({ atMs: -1, foot: 'left' }),
    replaceFirst({ atMs: Number.NaN, foot: 'left' }),
    replaceFirst({ atMs: Infinity, foot: 'left' }),
    [recorded.events[0], { atMs: 200, foot: 'right' }, { atMs: 100, foot: 'left' }],
    [recorded.events[0], { atMs: 200, foot: 'left' }],
    [...recorded.events, { atMs: recorded.finishTimeMs, foot: recorded.events.at(-1).foot === 'left' ? 'right' : 'left' }],
    [...recorded.events, { atMs: recorded.finishTimeMs + 1, foot: recorded.events.at(-1).foot === 'left' ? 'right' : 'left' }],
  ]) assert.throws(() => createSprintReplay({ events, finishTimeMs: recorded.finishTimeMs }))
})

test('입력으로 재계산한 완주 시간과 맞지 않거나 미완주인 기록은 거부한다', () => {
  for (const finishTimeMs of [undefined, 0, -1, Number.NaN, Infinity, recorded.finishTimeMs - 10, recorded.finishTimeMs + 10]) {
    assert.throws(() => createSprintReplay({ events: recorded.events, finishTimeMs }))
  }
  assert.throws(() => createSprintReplay({ events: [{ atMs: 0, foot: 'left' }], finishTimeMs: 10000 }))
  assert.throws(() => createSprintReplay())
})

test('유효한 같은 시각의 교대 입력과 1ms 이내 원 경기 계산 오차는 허용한다', () => {
  const clip = createSprintReplay({ events: recorded.events, finishTimeMs: recorded.finishTimeMs + .5 })
  assert.equal(getSprintReplayFrame(clip, clip.finishTimeMs).finishTimeMs, recorded.finishTimeMs + .5)
  const duplicateTime = [
    { atMs: 0, foot: 'left' },
    { atMs: 0, foot: 'right' },
    { atMs: 0, foot: 'left' },
    ...recorded.events.slice(1),
  ]
  let run = advanceSprintRace(startSprintRace(0), SPRINT_RULES.countdownMs)
  const validEvents = []
  for (const event of duplicateTime) {
    const next = applySprintStride(run, event.foot, SPRINT_RULES.countdownMs + event.atMs)
    if (next.steps > run.steps) validEvents.push(event)
    run = next
    if (run.status === 'finished') break
  }
  if (run.status !== 'finished') run = advanceSprintRace(run, SPRINT_RULES.countdownMs + recorded.finishTimeMs + 1000)
  assert.equal(run.status, 'finished')
  const sameTime = createSprintReplay({ events: validEvents, finishTimeMs: run.finishTimeMs })
  assert.equal(getSprintReplayFrame(sameTime, 0).steps, 3)
})

function pacedClip(cadenceMs, firstAtMs = 0) {
  let race = startSprintRace(0, 'sprint-v1')
  const events = []
  for (let step = 0; step < 500 && race.status !== 'finished'; step++) {
    const atMs = firstAtMs + step * cadenceMs
    const foot = step % 2 ? 'right' : 'left'
    const next = applySprintStride(race, foot, SPRINT_RULES.countdownMs + atMs)
    if (next.steps > race.steps) events.push({ atMs, foot })
    race = next
  }
  assert.equal(race.status, 'finished')
  return createSprintReplay({ events, finishTimeMs: race.finishTimeMs, ruleVersion: 'sprint-v1' })
}

test('표시 타임라인은 준비 4초와 마지막 자세 1초를 원 완주 기록과 분리한다', () => {
  const clip = createSprintReplay(recorded)
  const before = structuredClone(clip)
  const timeline = createSprintReplayTimeline(clip)
  assert.ok(Object.isFrozen(timeline))
  assert.equal(timeline.clip, clip)
  assert.equal(timeline.preparationMs, SPRINT_RULES.countdownMs)
  assert.equal(timeline.finishAtMs, SPRINT_RULES.countdownMs + clip.finishTimeMs)
  assert.equal(timeline.ceremonyTailMs, 0)
  assert.equal(timeline.finishHoldMs, 1000)
  assert.equal(timeline.durationMs, timeline.finishAtMs + 1000)
  for (const position of [timeline.finishAtMs, timeline.durationMs - 1, timeline.durationMs]) {
    const shown = getSprintReplayPresentation(timeline, position)
    assert.equal(shown.phase, 'finish')
    assert.deepEqual(shown.race, clip.finishFrame)
    assert.equal(shown.race.finishTimeMs, recorded.finishTimeMs)
  }
  assert.deepEqual(clip, before)
})

test('리플레이는 서기부터 낮추기·크라우칭·SET·GO까지 준비 경계를 복원한다', () => {
  const timeline = createSprintReplayTimeline(createSprintReplay(recorded))
  for (const [position, phase, startPhase, frame] of [
    [0, 'preparation', 'standing', null], [999, 'preparation', 'standing', null],
    [1000, 'preparation', 'lowering', 0], [1650, 'preparation', 'crouch', 4],
    [2700, 'preparation', 'set', 5], [3999, 'preparation', 'set', 5],
    [4000, 'race', 'launch', 6],
  ]) {
    const shown = getSprintReplayPresentation(timeline, position)
    const sample = getSprintStartSample(shown.race)
    assert.equal(shown.phase, phase)
    assert.equal(shown.positionMs, position)
    assert.equal(shown.durationMs, timeline.durationMs)
    assert.equal(shown.bossVictoryExtraMs, 0)
    assert.equal(shown.race.status, phase === 'preparation' ? 'countdown' : 'running')
    assert.equal(shown.race.elapsedMs, 0)
    assert.equal(sample.phase, startPhase)
    assert.equal(sample.frame, frame)
  }
  assert.equal(getSprintReplayPresentation(timeline, timeline.finishAtMs - .001).phase, 'race')
  assert.equal(getSprintReplayPresentation(timeline, timeline.finishAtMs).phase, 'finish')
})

test('첫 발이 늦은 리플레이는 GO 뒤 SET을 유지하고 실제 입력에서만 출발한다', () => {
  const clip = pacedClip(175, 500)
  const timeline = createSprintReplayTimeline(clip)
  for (const [atMs, phase, frame] of [[0, 'set', 5], [499, 'set', 5], [500, 'launch', 6], [610, 'launch', 7], [720, 'off', null]]) {
    const shown = getSprintReplayPresentation(timeline, timeline.preparationMs + atMs)
    assert.equal(shown.phase, 'race')
    assert.equal(shown.race.elapsedMs, atMs)
    assert.equal(getSprintStartSample(shown.race).phase, phase)
    assert.equal(getSprintStartSample(shown.race).frame, frame)
    assert.deepEqual(shown.race, getSprintReplayFrame(clip, atMs))
  }
  assert.equal(clip.events[0].atMs, 500)
})

test('근소하게 이긴 루사인의 남은 승리 동작을 모두 재생한 뒤 마지막 자세를 유지한다', () => {
  const clip = pacedClip(175)
  const context = { raceMode: 'competition', rivalSeed: 0, bossEncounter: true }
  const boss = getSprintBossState(clip.finishFrame, context.raceMode, context.rivalSeed, context.bossEncounter)
  assert.equal(boss.won, true)
  assert.ok(boss.celebrationElapsedMs > 0 && boss.celebrationElapsedMs < boss.celebrationDurationMs)
  const timeline = createSprintReplayTimeline(clip, context)
  assert.equal(timeline.ceremonyTailMs, boss.celebrationDurationMs - boss.celebrationElapsedMs)
  assert.equal(timeline.durationMs, timeline.finishAtMs + timeline.ceremonyTailMs + 1000)
  for (const extra of [0, timeline.ceremonyTailMs / 2, timeline.ceremonyTailMs, timeline.ceremonyTailMs + 1000]) {
    const shown = getSprintReplayPresentation(timeline, timeline.finishAtMs + extra)
    const victory = withSprintBossPresentation(getSprintBossState(shown.race, 'competition', 0, true), shown.bossVictoryExtraMs)
    near(shown.bossVictoryExtraMs, extra)
    near(victory.celebrationElapsedMs, Math.min(boss.celebrationDurationMs, boss.celebrationElapsedMs + extra))
    assert.equal(victory.celebrating, extra < timeline.ceremonyTailMs)
    assert.deepEqual(shown.race, clip.finishFrame)
  }
})

test('보스 부재·플레이어 승리·다른 선수 우승·이미 끝난 승리 동작은 연장하지 않는다', () => {
  const ordinary = pacedClip(175)
  const playerWinner = pacedClip(75)
  const bossAlreadyDone = pacedClip(175, 4000)
  assert.equal(getSprintBossState(playerWinner.finishFrame, 'competition', 0, true).won, false)
  assert.equal(getSprintBossState(ordinary.finishFrame, 'competition', 65, true).won, false)
  assert.equal(getSprintBossState(bossAlreadyDone.finishFrame, 'competition', 0, true).celebrationElapsedMs, 2600)
  for (const [clip, context] of [
    [ordinary, {}], [ordinary, { raceMode: 'solo', bossEncounter: true }],
    [ordinary, { raceMode: 'competition', bossEncounter: false }],
    [playerWinner, { raceMode: 'competition', bossEncounter: true }],
    [ordinary, { raceMode: 'competition', rivalSeed: 65, bossEncounter: true }],
    [bossAlreadyDone, { raceMode: 'competition', bossEncounter: true }],
  ]) {
    const timeline = createSprintReplayTimeline(clip, context)
    assert.equal(timeline.ceremonyTailMs, 0)
    assert.equal(timeline.durationMs, timeline.finishAtMs + timeline.finishHoldMs)
  }
})

test('앞뒤 탐색과 반환 프레임 수정은 표시 타임라인·원 클립·다음 샘플을 바꾸지 않는다', () => {
  const timeline = createSprintReplayTimeline(pacedClip(175), { raceMode: 'competition', bossEncounter: true })
  const before = structuredClone(timeline)
  const times = [0, 1650, 3999, 4000, 4567, timeline.finishAtMs, timeline.finishAtMs + 321, timeline.durationMs]
  const expected = new Map(times.map(time => [time, getSprintReplayPresentation(timeline, time)]))
  for (const time of [...times].reverse().concat(times)) {
    const shown = getSprintReplayPresentation(timeline, time)
    assert.deepEqual(shown, expected.get(time))
    shown.race.distance = -999
    shown.phase = 'changed'
    assert.deepEqual(getSprintReplayPresentation(timeline, time), expected.get(time))
  }
  assert.deepEqual(timeline, before)
})

test('표시 위치는 시작·끝으로 제한하며 위조한 클립이나 타임라인은 거절한다', () => {
  const clip = createSprintReplay(recorded)
  const timeline = createSprintReplayTimeline(clip)
  const start = getSprintReplayPresentation(timeline, 0)
  const finish = getSprintReplayPresentation(timeline, timeline.durationMs)
  for (const time of [undefined, null, Number.NaN, '1000', -1, -Infinity]) {
    assert.deepEqual(getSprintReplayPresentation(timeline, time), start)
  }
  for (const time of [timeline.durationMs + 10000, Infinity]) {
    assert.deepEqual(getSprintReplayPresentation(timeline, time), finish)
  }
  assert.throws(() => createSprintReplayTimeline({ ...clip }), TypeError)
  assert.throws(() => getSprintReplayPresentation({ ...timeline }, 0), TypeError)
  assert.throws(() => getSprintReplayPresentation(clip, 0), TypeError)
})

function boostedRun() {
  let race = startSprintRace(0, 'sprint-v2')
  const events = []
  for (let index = 0; index < 500 && race.status !== 'finished'; index++) {
    const atMs = index * 175
    const foot = index % 2 ? 'right' : 'left'
    const next = applySprintStride(race, foot, SPRINT_RULES.countdownMs + atMs)
    if (next.steps > race.steps) events.push({ atMs, foot })
    race = next
    if (race.status === 'running') {
      const cheered = applySprintCheer(race, SPRINT_RULES.countdownMs + atMs + 10)
      if (cheered.cheers > race.cheers) events.push({ atMs: atMs + 10, action: 'cheer' })
      race = cheered
    }
  }
  assert.equal(race.status, 'finished')
  return { events, finishTimeMs: race.finishTimeMs, ruleVersion: 'sprint-v2' }
}

test('v2 리플레이는 응원 체크포인트·규칙 버전과 실제 속도를 양방향 탐색으로 보존한다', () => {
  const run = boostedRun()
  const clip = createSprintReplay(run)
  const snapshot = structuredClone(clip)
  assert.equal(clip.ruleVersion, 'sprint-v2')
  assert.equal(clip.checkpoints.length, clip.events.length + 1)
  assert.deepEqual(clip.events, run.events)
  assert.ok(clip.events.some(event => event.action === 'cheer'))
  for (const atMs of [0, 175, 184.999, 185, 535, 6000, clip.finishTimeMs - 1, 6000, 185]) {
    let expected = advanceSprintRace(startSprintRace(0, 'sprint-v2'), SPRINT_RULES.countdownMs)
    for (const event of run.events) {
      if (event.atMs > atMs) break
      expected = event.action === 'cheer' ? applySprintCheer(expected, SPRINT_RULES.countdownMs + event.atMs)
        : applySprintStride(expected, event.foot, SPRINT_RULES.countdownMs + event.atMs)
    }
    expected = advanceSprintRace(expected, SPRINT_RULES.countdownMs + atMs)
    assert.deepEqual(getSprintReplayFrame(clip, atMs), expected)
  }
  const cheerIndex = run.events.findIndex(event => event.action === 'cheer')
  assert.ok(Object.isFrozen(clip.events[cheerIndex]))
  assert.ok(Object.isFrozen(clip.checkpoints[cheerIndex + 1].race))
  run.events[cheerIndex].atMs = 9999
  assert.deepEqual(clip, snapshot)
  const timeline = createSprintReplayTimeline(clip)
  assert.equal(timeline.preparationMs, 4000)
  assert.equal(getSprintReplayPresentation(timeline, 1000).race.ruleVersion, 'sprint-v2')
})

test('리플레이는 응원 조건 위반·발 반복·종료 뒤 응원과 지원하지 않는 규칙을 거절한다', () => {
  const run = boostedRun()
  const firstCheer = run.events.findIndex(event => event.action === 'cheer')
  for (const events of [
    [{ atMs: 0, action: 'cheer' }, ...run.events],
    [...run.events.slice(0, firstCheer + 1), { atMs: 200, action: 'cheer' }, ...run.events.slice(firstCheer + 1)],
    [...run.events.slice(0, firstCheer), { atMs: 185, action: 'cheer', foot: 'left' }, ...run.events.slice(firstCheer + 1)],
  ]) assert.throws(() => createSprintReplay({ ...run, events }))
  const repeatedFoot = run.events.map(event => ({ ...event }))
  repeatedFoot[firstCheer + 1].foot = repeatedFoot[firstCheer - 1].foot
  assert.throws(() => createSprintReplay({ ...run, events: repeatedFoot }))
  assert.throws(() => createSprintReplay({ ...run, ruleVersion: 'sprint-v1' }))
  assert.throws(() => createSprintReplay({ ...run, ruleVersion: 'sprint-v3' }))
  assert.throws(() => createSprintReplay({ ...run, finishTimeMs: run.finishTimeMs + 1,
    events: [...run.events, { atMs: run.finishTimeMs + .5, action: 'cheer' }] }))
})

test('v1 리플레이는 기존 canonical 시각을 보존하고 준비 표시 4초를 기록과 분리한다', () => {
  const events = Array.from({ length: 55 }, (_, index) => ({ atMs: index * 175, foot: index % 2 ? 'right' : 'left' }))
  const finishTimeMs = 9584.846622489975
  const clip = createSprintReplay({ events, finishTimeMs, ruleVersion: 'sprint-v1' })
  assert.equal(clip.ruleVersion, 'sprint-v1')
  assert.equal(clip.finishFrame.finishTimeMs, finishTimeMs)
  assert.equal(clip.finishFrame.startedAt, 3000)
  assert.equal(createSprintReplayTimeline(clip).preparationMs, 4000)
  assert.equal(getSprintReplayFrame(clip, finishTimeMs).finishTimeMs, finishTimeMs)
})
