import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySprintFinish, buildSprintRecordPreview, SPRINT_RULE_VERSION } from '../lib/playground-sprint-record.mjs'
import { LEGACY_SPRINT_RULE_VERSION } from '../lib/playground-sprint-rules.mjs'

const player = Object.freeze({ name: '최지훈', countryCode: 'KR', art: 'realistic' })
const validRun = Object.freeze({ player, finishTimeMs: 12345.678, finishedAtISO: '2026-11-17T12:34:56.789Z' })

test('첫 완주와 새 최고 기록을 구분하고 원래 정밀도로 개선량을 계산한다', () => {
  assert.deepEqual(classifySprintFinish({ finishTimeMs: 12345 }), { kind: 'first', bestTimeMs: 12345, improvementMs: 0 })
  assert.deepEqual(classifySprintFinish({ finishTimeMs: 12345, previousBestMs: null }), { kind: 'first', bestTimeMs: 12345, improvementMs: 0 })
  const result = classifySprintFinish({ finishTimeMs: 12345.25, previousBestMs: 12345.5 })
  assert.deepEqual(result, { kind: 'best', bestTimeMs: 12345.25, improvementMs: .25 })
})

test('동점·느린 완주는 기존 최고를 유지하고 시연은 최고 기록이 되지 않는다', () => {
  for (const finishTimeMs of [12345, 12346]) assert.deepEqual(classifySprintFinish({ finishTimeMs, previousBestMs: 12345 }), { kind: 'finish', bestTimeMs: 12345, improvementMs: 0 })
  assert.deepEqual(classifySprintFinish({ finishTimeMs: 10000, previousBestMs: 12345, isDemo: true }), { kind: 'demo', bestTimeMs: 12345, improvementMs: 0 })
  assert.deepEqual(classifySprintFinish({ finishTimeMs: 10000, isDemo: true }), { kind: 'demo', bestTimeMs: null, improvementMs: 0 })
})

test('비정상 완료·기존 최고 시각을 결과로 분류하지 않는다', () => {
  for (const value of [0, -1, Number.NaN, Infinity, undefined, null, '12345']) {
    assert.throws(() => classifySprintFinish({ finishTimeMs: value }), RangeError)
  }
  for (const value of [0, -1, Number.NaN, Infinity, '12345']) assert.throws(() => classifySprintFinish({ finishTimeMs: 12345, previousBestMs: value }), RangeError)
})

test('등록 미리보기는 허용 필드만 담고 완료 날짜·정밀 기록을 보존한다', () => {
  const result = buildSprintRecordPreview({ ...validRun, events: [{ atMs: 0, foot: 'left' }], rank: 1, token: 'not-carried', player: { ...player, internalId: 'not-carried' } })
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, {})
  assert.deepEqual(result.record, {
    playerName: '최지훈', countryCode: 'KR', timeMs: 12345.678,
    finishedAtISO: '2026-11-17T12:34:56.789Z', ruleVersion: SPRINT_RULE_VERSION, registrationStatus: 'preview',
  })
  assert.ok(Object.isFrozen(result.record))
  assert.equal(Object.hasOwn(result.record, 'rank'), false)
  assert.equal(Object.hasOwn(result.record, 'events'), false)
  assert.equal(Object.hasOwn(result.record, 'art'), false)
})

test('선수 입력은 기존 검증·정규화 기준을 사용하고 원본을 변경하지 않는다', () => {
  const source = { ...validRun, player: { name: '  최지훈  ', countryCode: 'kr', art: 'pixel' } }
  const result = buildSprintRecordPreview(source)
  assert.equal(result.valid, true)
  assert.equal(result.record.playerName, '최지훈')
  assert.equal(result.record.countryCode, 'KR')
  assert.equal(source.player.name, '  최지훈  ')
  source.player.name = '변경'
  source.finishTimeMs = 1
  assert.equal(result.record.playerName, '최지훈')
  assert.equal(result.record.timeMs, validRun.finishTimeMs)
  const invalid = buildSprintRecordPreview({ ...validRun, player: { name: '', countryCode: 'ZZ', art: 'other' } })
  assert.deepEqual(invalid.errors, { name: 'required', countryCode: 'invalid', art: 'invalid' })
  assert.equal(invalid.record, null)
})

test('유효한 ISO 완료 날짜를 UTC로 정규화하고 잘못된 날짜·완료 기록은 거부한다', () => {
  assert.equal(buildSprintRecordPreview({ ...validRun, finishedAtISO: '2026-11-17T21:34:56.789+09:00' }).record.finishedAtISO, validRun.finishedAtISO)
  assert.equal(buildSprintRecordPreview({ ...validRun, finishedAtISO: '2026-11-17T12:34:56Z' }).record.finishedAtISO, '2026-11-17T12:34:56.000Z')
  assert.equal(buildSprintRecordPreview({ ...validRun, finishedAtISO: '2024-02-29T00:00:00Z' }).valid, true)
  for (const finishedAtISO of [undefined, null, '', 12345, '2026-11-17', 'not-a-date', '2026-02-30T12:00:00Z', '2026-02-29T00:00:00Z', '2026-13-01T00:00:00Z', '2026-11-17T24:00:00Z', '2026-11-17T00:00:00+24:00']) {
    const invalid = buildSprintRecordPreview({ ...validRun, finishedAtISO })
    assert.equal(invalid.valid, false)
    assert.equal(invalid.errors.finishedAtISO, 'invalid')
    assert.equal(invalid.record, null)
  }
  for (const finishTimeMs of [0, -1, Infinity, Number.NaN, '12.34']) assert.equal(buildSprintRecordPreview({ ...validRun, finishTimeMs }).errors.finishTimeMs, 'invalid')
  assert.equal(buildSprintRecordPreview(null).valid, false)
})

test('등록 미리보기는 v2를 기본으로 하고 명시한 기존 v1 기록의 버전을 보존한다', () => {
  assert.equal(SPRINT_RULE_VERSION, 'sprint-v2')
  assert.equal(buildSprintRecordPreview(validRun).record.ruleVersion, SPRINT_RULE_VERSION)
  assert.equal(buildSprintRecordPreview({ ...validRun, ruleVersion: LEGACY_SPRINT_RULE_VERSION }).record.ruleVersion, 'sprint-v1')
  for (const ruleVersion of ['sprint-v3', null, '', 1]) {
    const invalid = buildSprintRecordPreview({ ...validRun, ruleVersion })
    assert.equal(invalid.valid, false)
    assert.equal(invalid.errors.ruleVersion, 'invalid')
    assert.equal(invalid.record, null)
  }
})
