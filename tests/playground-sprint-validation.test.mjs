import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  SPRINT_RULES,
  startSprintRace,
  advanceSprintRace,
  applySprintStride,
  applySprintCheer,
} from '../lib/playground-sprint.mjs'
import {
  SPRINT_RULE_VERSION,
  normalizeSprintScore,
  validateSprintSubmission,
} from '../lib/playground-sprint-validation.mjs'

function recordRun({ delayMs = 0, originMs = 777.125, extraFrames = false, openingStrides = 0, ruleVersion = 'sprint-v1', cheers = false } = {}) {
  const gunAt = originMs + SPRINT_RULES.countdownMs
  let race = startSprintRace(originMs, ruleVersion)
  const events = []
  for (let index = 0; index < openingStrides; index += 1) {
    const foot = index % 2 ? 'right' : 'left'
    race = applySprintStride(race, foot, gunAt + delayMs)
    events.push({ atMs: delayMs, foot })
  }
  for (let index = 0; index < 700 && race.status !== 'finished'; index += 1) {
    const atMs = delayMs + index * 175
    const foot = (index + openingStrides) % 2 ? 'right' : 'left'
    if (extraFrames && index > 0) {
      for (let offset = 13; offset < 175; offset += 13) {
        race = advanceSprintRace(race, gunAt + atMs - 175 + offset)
      }
    }
    const next = applySprintStride(race, foot, gunAt + atMs)
    if (next.steps > race.steps) events.push({ atMs, foot })
    race = next
    if (cheers && race.status === 'running') {
      const cheered = applySprintCheer(race, gunAt + atMs + 10)
      if (cheered.cheers > race.cheers) events.push({ atMs: atMs + 10, action: 'cheer' })
      race = cheered
    }
  }
  assert.equal(race.status, 'finished')
  return { events, finishTimeMs: race.finishTimeMs, ruleVersion }
}

function rejectsRun(input, code = 'invalid_run') {
  assert.throws(() => validateSprintSubmission(input), error => error instanceof Error && error.code === code)
}

const recorded = recordRun()

test('준비 시간이 늘어나도 기존 sprint-v1 GO 상대 입력과 공식 기록은 호환된다', () => {
  // Captured from the previous 3000ms countdown engine before this presentation change.
  const events = Array.from({ length: 55 }, (_, index) => ({ atMs: index * 175, foot: index % 2 ? 'right' : 'left' }))
  const previousFinishTimeMs = 9584.846622489975
  const checked = validateSprintSubmission({ events, finishTimeMs: previousFinishTimeMs, ruleVersion: 'sprint-v1' })
  assert.equal(checked.timeCs, 958)
  assert.equal(checked.canonicalTimeMs, previousFinishTimeMs)
  assert.deepEqual(checked.normalizedEvents, events)
  assert.equal(SPRINT_RULE_VERSION, 'sprint-v2')
})

test('소수 시각 입력도 기존 canonical double과 재시도 해시를 정확하게 보존한다', () => {
  const events = []
  let atMs = 2 * .0113
  for (let index = 0; index < 56; index++) {
    events.push({ atMs, foot: index % 2 ? 'right' : 'left' })
    atMs += 150 + ((index * 71 + 2 * 23) % 4000) / 100
  }
  // The same sequence at a 4000ms simulation origin differs by ~1.8e-12ms;
  // preserving only the rounded score would still break an old finish hash.
  const oldCanonicalTimeMs = 9409.229976159837
  const checked = validateSprintSubmission({ events, finishTimeMs: oldCanonicalTimeMs, ruleVersion: 'sprint-v1' })
  assert.equal(checked.canonicalTimeMs, oldCanonicalTimeMs)
  assert.equal(checked.timeCs, 941)
  assert.deepEqual(checked.normalizedEvents, events)
  const hash = payload => createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  const oldHash = hash({ ruleVersion: 'sprint-v1', events, canonicalTimeMs: oldCanonicalTimeMs })
  const currentHash = hash({ ruleVersion: 'sprint-v1', events: checked.normalizedEvents, canonicalTimeMs: checked.canonicalTimeMs })
  assert.equal(currentHash, oldHash)
})

test('일반·자동 시연과 같은 유효 입력을 공유 엔진으로 재계산한다', () => {
  for (const source of [recorded, recordRun({ extraFrames: true }), recordRun({ delayMs: 250.125 })]) {
    const result = validateSprintSubmission(source)
    assert.ok(Math.abs(result.canonicalTimeMs - source.finishTimeMs) < 1e-7)
    assert.equal(result.timeCs, normalizeSprintScore(result.canonicalTimeMs))
    assert.deepEqual(result.normalizedEvents, source.events)
  }
  // Demo exclusion belongs to server-issued attempt handling, not an input claim.
  assert.deepEqual(validateSprintSubmission({ ...recorded, isDemo: true }), validateSprintSubmission(recorded))
})

test('클라이언트 주장에 ±1ms를 허용해도 엔진 시간이 공식 점수를 결정한다', () => {
  const canonical = validateSprintSubmission(recorded)
  for (const offset of [-1, -.75, .75, 1]) {
    const result = validateSprintSubmission({ ...recorded, finishTimeMs: canonical.canonicalTimeMs + offset })
    assert.equal(result.canonicalTimeMs, canonical.canonicalTimeMs)
    assert.equal(result.timeCs, canonical.timeCs)
  }
  for (const offset of [-1.001, 1.001, -1000, 1000]) {
    rejectsRun({ ...recorded, finishTimeMs: canonical.canonicalTimeMs + offset })
  }
})

test('시간과 입력을 변조하거나 완주하지 않은 기록을 거절한다', () => {
  rejectsRun({ ...recorded, finishTimeMs: 1 })
  rejectsRun({ ...recorded, events: recorded.events.slice(0, -5) })
  rejectsRun({ events: [{ atMs: 0, foot: 'left' }], finishTimeMs: 10000 })
  const modified = recorded.events.map(event => ({ ...event, atMs: event.atMs + 20 }))
  rejectsRun({ ...recorded, events: modified })
  const lastFoot = recorded.events.at(-1).foot === 'left' ? 'right' : 'left'
  for (const atMs of [recorded.finishTimeMs, recorded.finishTimeMs + 1]) {
    rejectsRun({ ...recorded, events: [...recorded.events, { atMs, foot: lastFoot }] })
  }
})

test('유한 양수 완주 시간과 알려진 규칙 버전만 받는다', () => {
  for (const finishTimeMs of [undefined, null, '10000', 0, -1, NaN, Infinity, -Infinity]) {
    rejectsRun({ ...recorded, finishTimeMs })
  }
  for (const ruleVersion of ['sprint-v3', '', null, 1]) rejectsRun({ ...recorded, ruleVersion }, 'invalid_rule')
  assert.equal(validateSprintSubmission({ ...recorded, ruleVersion: SPRINT_RULE_VERSION }).timeCs,
    validateSprintSubmission(recorded).timeCs)
  for (const input of [undefined, null, [], 1, 'run', {}]) rejectsRun(input)
})

test('이벤트 형태·발·음수·비유한 시각·역행·같은 발 반복을 거절한다', () => {
  const replaceFirst = event => ({ ...recorded, events: [event, ...recorded.events.slice(1)] })
  for (const event of [null, [], {}, { atMs: 0, foot: 'up' },
    ...[-1, NaN, Infinity, -Infinity, '0', null, undefined].map(atMs => ({ atMs, foot: 'left' }))]) {
    rejectsRun(replaceFirst(event))
  }
  rejectsRun({ ...recorded, events: [recorded.events[0], { atMs: 200, foot: 'right' }, { atMs: 199, foot: 'left' }] })
  rejectsRun({ ...recorded, events: [recorded.events[0], { atMs: 100, foot: 'left' }] })
  for (const events of [null, {}, [], 'events']) rejectsRun({ ...recorded, events })
})

test('4096개 이벤트와 120초 경기 길이의 상한을 검사한다', () => {
  const normalWithOpening = recordRun({ openingStrides: 4000 })
  const remaining = 4096 - normalWithOpening.events.length
  const full = recordRun({ openingStrides: 4000 + remaining })
  assert.equal(full.events.length, 4096)
  validateSprintSubmission(full)
  rejectsRun({ ...full, events: [{ atMs: 0, foot: 'right' }, ...full.events] })
  rejectsRun({ ...recorded, finishTimeMs: 120000.001 })
  rejectsRun({ events: [{ atMs: 120000.001, foot: 'left' }], finishTimeMs: 120000 })
  const slow = recordRun({ delayMs: 111000 })
  assert.ok(slow.finishTimeMs > 120000)
  rejectsRun(slow)
  rejectsRun({ ...slow, finishTimeMs: 120000 })
  const withinLimit = recordRun({ delayMs: 109000 })
  assert.ok(withinLimit.finishTimeMs < 120000)
  validateSprintSubmission(withinLimit)
})

test('sprint-v1은 같은 시각의 좌우 교대 입력을 계속 허용한다', () => {
  const sameTime = recordRun({ openingStrides: 3 })
  assert.deepEqual(sameTime.events.slice(0, 4).map(event => event.atMs), [0, 0, 0, 0])
  const result = validateSprintSubmission(sameTime)
  assert.equal(result.normalizedEvents.length, sameTime.events.length)
  assert.ok(Math.abs(result.canonicalTimeMs - sameTime.finishTimeMs) < 1e-7)
})

test('정규 이벤트는 추가 필드를 버리고 원본과 독립적인 JSON 해시 입력을 제공한다', () => {
  const source = {
    ...recorded,
    events: recorded.events.map(event => ({ foot: event.foot, atMs: event.atMs, ignored: 'untrusted' })),
  }
  source.events[0].atMs = -0
  const result = validateSprintSubmission(source)
  assert.deepEqual(result.normalizedEvents, recorded.events)
  assert.equal(Object.is(result.normalizedEvents[0].atMs, -0), false)
  assert.equal(JSON.stringify(result.normalizedEvents), JSON.stringify(recorded.events))
  source.events[0].atMs = 99
  source.events.push({ atMs: 99999, foot: 'right' })
  assert.equal(result.normalizedEvents[0].atMs, 0)
  assert.equal(result.normalizedEvents.length, recorded.events.length)
  assert.ok(Object.isFrozen(result.normalizedEvents))
  assert.ok(Object.isFrozen(result.normalizedEvents[0]))
})

test('0.01초 반올림·동점 경계와 잘못된 점수를 명확히 처리한다', () => {
  assert.equal(normalizeSprintScore(9550), 955)
  assert.equal(normalizeSprintScore(9554.999999), 955)
  assert.equal(normalizeSprintScore(9555), 956)
  assert.equal(normalizeSprintScore(9555.000001), 956)
  assert.equal(normalizeSprintScore(1005), 101)
  assert.equal(normalizeSprintScore(120000), 12000)
  for (const value of [0, -0, -1, NaN, Infinity, -Infinity, undefined, null, '9550', Number.MAX_VALUE]) {
    assert.throws(() => normalizeSprintScore(value), error => error.code === 'invalid_run')
  }
})

test('반올림 경계를 넘는 허용 오차의 클라이언트 값으로 동점을 조작하지 못한다', () => {
  const base = validateSprintSubmission(recorded)
  const shift = (Math.floor(base.canonicalTimeMs / 10) + 10) * 10 + 4.75 - base.canonicalTimeMs
  const run = recordRun({ delayMs: shift, originMs: 0 })
  const expected = validateSprintSubmission(run)
  const higherClaim = expected.canonicalTimeMs + .75
  assert.equal(normalizeSprintScore(higherClaim), expected.timeCs + 1)
  const result = validateSprintSubmission({ ...run, finishTimeMs: higherClaim })
  assert.equal(result.timeCs, expected.timeCs)
  assert.equal(result.canonicalTimeMs, expected.canonicalTimeMs)
})

test('sprint-v2는 수락한 응원과 발 입력을 함께 재계산하고 현행 기본 규칙으로 사용한다', () => {
  const normal = recordRun({ ruleVersion: 'sprint-v2', originMs: 0 })
  const boosted = recordRun({ ruleVersion: 'sprint-v2', originMs: 0, cheers: true })
  const checked = validateSprintSubmission(boosted)
  assert.ok(boosted.events.some(event => event.action === 'cheer'))
  assert.ok(checked.canonicalTimeMs < validateSprintSubmission(normal).canonicalTimeMs)
  assert.ok(Math.abs(checked.canonicalTimeMs - boosted.finishTimeMs) < 1e-7)
  assert.deepEqual(checked.normalizedEvents, boosted.events)
  const { ruleVersion, ...withoutVersion } = boosted
  assert.equal(ruleVersion, SPRINT_RULE_VERSION)
  assert.deepEqual(validateSprintSubmission(withoutVersion), checked)
})

test('sprint-v2는 시작 전·발걸음 부족·연속 응원·오래 멈춘 뒤의 응원을 거절한다', () => {
  const run = recordRun({ ruleVersion: 'sprint-v2', originMs: 0, cheers: true })
  const firstCheer = run.events.findIndex(event => event.action === 'cheer')
  assert.equal(run.events[firstCheer].atMs, 185)
  rejectsRun({ ...run, events: [{ atMs: 0, action: 'cheer' }, ...run.events] })
  rejectsRun({ ...run, events: [run.events[0], { atMs: 100, action: 'cheer' }, ...run.events.slice(1)] })
  rejectsRun({ ...run, events: [...run.events.slice(0, firstCheer + 1), { atMs: 200, action: 'cheer' }, ...run.events.slice(firstCheer + 1)] })
  const normal = recordRun({ ruleVersion: 'sprint-v2', originMs: 0 })
  rejectsRun({ ...normal, events: [...normal.events.slice(0, 2), { atMs: 676, action: 'cheer' }, ...normal.events.slice(4)] })
  rejectsRun({ ...normal, finishTimeMs: normal.finishTimeMs + 1,
    events: [...normal.events, { atMs: normal.finishTimeMs + .5, action: 'cheer' }] })
})

test('응원은 좌우 교대 규칙을 초기화하지 않으며 v1 입력 또는 모호한 동작을 허용하지 않는다', () => {
  const run = recordRun({ ruleVersion: 'sprint-v2', originMs: 0, cheers: true })
  const firstCheer = run.events.findIndex(event => event.action === 'cheer')
  const events = run.events.map(event => ({ ...event }))
  events[firstCheer + 1].foot = events[firstCheer - 1].foot
  rejectsRun({ ...run, events })
  for (const event of [{ atMs: 185, action: 'cheer', foot: 'left' }, { atMs: 185, action: 'boost' },
    { atMs: 185, foot: 'left', action: 'boost' }]) {
    rejectsRun({ ...run, events: [...run.events.slice(0, firstCheer), event, ...run.events.slice(firstCheer + 1)] })
  }
  rejectsRun({ ...run, ruleVersion: 'sprint-v1' })
})

test('응원 이벤트 정규화는 원본 추가 필드와 별개이며 불변 체크포인트 입력을 제공한다', () => {
  const run = recordRun({ ruleVersion: 'sprint-v2', originMs: 0, cheers: true })
  const input = { ...run, events: run.events.map(event => ({ ...event, ignored: 'untrusted' })) }
  const checked = validateSprintSubmission(input)
  const cheerIndex = checked.normalizedEvents.findIndex(event => event.action === 'cheer')
  assert.deepEqual(checked.normalizedEvents, run.events)
  input.events[cheerIndex].atMs = 999
  assert.equal(checked.normalizedEvents[cheerIndex].atMs, 185)
  assert.ok(Object.isFrozen(checked.normalizedEvents[cheerIndex]))
})
