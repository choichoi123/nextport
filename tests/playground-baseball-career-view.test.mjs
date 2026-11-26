import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaseballCareerView, reduceBaseballCareerView, getBaseballCareerResumeId, getBaseballCareerNextManualSlot,
  isBaseballCareerSessionCurrent, selectBaseballCareerCompletedAppearance } from '../lib/playground-baseball-career-view.mjs'
import { createBaseballCareerSave, createBaseballCareerManualAtBat, applyBaseballCareerCommand,
  advanceBaseballCareerAtBat } from '../lib/playground-baseball-career.mjs'
import { applyBaseballAtBatSessionCommand, publicBaseballAtBatSession } from '../lib/playground-baseball-at-bat-session.mjs'

const uuid = n => `21000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const now = '2026-11-25T00:00:00.000Z'
const clone = value => JSON.parse(JSON.stringify(value))
const versions = Object.fromEntries(['engineHash', 'rulesHash', 'atBatHash', 'fieldHash', 'sessionHash', 'careerHash']
  .map((key, index) => [key, String(index + 1).repeat(64)]))
const selected = () => createBaseballCareerView({ careerId: uuid(1) })
const request = (state, atBatId = null) => reduceBaseballCareerView(state, { type: 'request-manual', atBatId })
const ready = (state, intent, atBatId) => reduceBaseballCareerView(state,
  { type: 'manual-ready', epoch: intent.epoch, careerId: intent.careerId, atBatId })

function start(save = null, atBatId = uuid(20)) {
  if (!save) {
    save = createBaseballCareerSave({ id: uuid(1), seed: 42, now, versions,
      profile: { name: '육성', jerseyNumber: '07', teamId: 'wiz', handedness: 'left' } })
    save = applyBaseballCareerCommand(save,
      { commandId: uuid(10), expectedRevision: save.revision, type: 'prepare', choice: 'power' }, { now })
  }
  const session = createBaseballCareerManualAtBat(save, { id: atBatId, seed: 42, now })
  save = applyBaseballCareerCommand(save,
    { commandId: uuid(11), expectedRevision: save.revision, type: 'start-manual' }, { now, atBat: session })
  return { career: save, session }
}

function command(pair, type, extra = {}) {
  const { career, session } = pair
  const next = applyBaseballAtBatSessionCommand(session, { commandId: uuid(100 + session.revision),
    expectedRevision: session.revision, type,
    ...(type === 'issue' ? {} : { pitchId: session.pending.pitchId, attemptId: session.pending.attemptId }), ...extra },
  { now, attemptId: uuid(1000 + session.revision) })
  return { session: next, career: advanceBaseballCareerAtBat(career, next, { now, expectedRevision: career.revision }) }
}

function finish(pair = start()) {
  for (let i = 0; i < 3; i++) {
    pair = command(pair, 'issue')
    pair = command(pair, 'accept-input', { input: { kind: 'swing', swingAtMs: -1200, aim: { x: 0, y: .75 } } })
    pair = command(pair, 'resolve')
  }
  return pair
}

test('관리 화면은 첫 타석 입장 요청을 받기까지 선수 선택만 보관한다', () => {
  const initial = createBaseballCareerView(), state = selected()
  assert.deepEqual(initial, { view: 'manage', tab: 'home', careerId: null, atBatId: null, epoch: 0, intent: null })
  assert.equal(request(initial), initial)
  assert.equal(state.intent, null)
  assert.equal(state.atBatId, null)
  assert.equal(state.view, 'manage')
  assert.ok(Object.isFrozen(state))
})

test('직접 입장은 관리의 육성 탭에서만 요청하며 연타를 무시한다', () => {
  const records = reduceBaseballCareerView(selected(), { type: 'manage', tab: 'records' })
  assert.equal(request(records), records)
  const state = request(selected())
  assert.equal(state.view, 'manage')
  assert.deepEqual(state.intent, { epoch: state.epoch, careerId: uuid(1), atBatId: null })
  assert.ok(Object.isFrozen(state.intent))
  assert.equal(request(state), state)
  assert.equal(request(state, uuid(40)), state)
})

test('입장 요청을 취소한 뒤 늦게 성공해도 체크포인트와 별개로 화면은 재열리지 않는다', () => {
  const pending = request(selected()), intent = pending.intent
  const cancelled = reduceBaseballCareerView(pending, { type: 'manage', tab: 'records' })
  const saved = start().career
  assert.equal(getBaseballCareerResumeId(saved), uuid(20))
  assert.equal(ready(cancelled, intent, uuid(20)), cancelled)
  assert.equal(cancelled.view, 'manage')
  assert.equal(cancelled.tab, 'records')
  const homeAgain = reduceBaseballCareerView(cancelled, { type: 'manage', tab:'home' })
  assert.equal(ready(homeAgain, intent, uuid(20)), homeAgain)
})

test('선수 변경·명시 취소는 이전 epoch를 무효화하고 새 의도를 구분한다', () => {
  const pending = request(selected()), intent = pending.intent
  for (const action of [{ type: 'cancel' }, { type: 'select-career', careerId: uuid(2) },
    { type: 'select-career', careerId: null }]) {
    const next = reduceBaseballCareerView(pending, action)
    assert.equal(ready(next, intent, uuid(20)), next)
    assert.ok(next.epoch > intent.epoch)
    assert.equal(next.intent, null)
  }
  const again = request(reduceBaseballCareerView(pending, { type: 'cancel' }))
  assert.equal(ready(again, intent, uuid(20)), again)
  assert.equal(ready(again, again.intent, uuid(20)).view, 'batting')
})

test('같은 타석 이어하기는 기존 ID만 수락하고 입장 의도를 한 번 소비한다', () => {
  const pending = request(selected(), uuid(20)), intent = pending.intent
  assert.equal(ready(pending, intent, uuid(21)), pending)
  assert.equal(ready(pending, { ...intent, careerId: uuid(2) }, uuid(20)), pending)
  assert.equal(ready(pending, { ...intent, epoch: intent.epoch + 1 }, uuid(20)), pending)
  const opened = ready(pending, intent, uuid(20))
  assert.equal(opened.atBatId, uuid(20))
  assert.equal(opened.intent, null)
  assert.equal(ready(opened, intent, uuid(20)), opened)
  const hidden = reduceBaseballCareerView(opened, { type: 'manage', tab: 'schedule' })
  assert.equal(hidden.atBatId, opened.atBatId)
  assert.equal(hidden.tab, 'schedule')
  const again = request(reduceBaseballCareerView(hidden, { type: 'manage', tab:'home' }), opened.atBatId)
  assert.equal(ready(again, again.intent, uuid(20)).atBatId, opened.atBatId)
})

test('현재 요청의 실패만 의도를 소비하며 재시도는 새 화면 epoch를 받는다', () => {
  const pending = request(selected()), intent = pending.intent
  assert.equal(reduceBaseballCareerView(pending, { type: 'manual-failed', epoch: intent.epoch - 1, careerId: intent.careerId }), pending)
  const failed = reduceBaseballCareerView(pending, { type: 'manual-failed', ...intent })
  assert.equal(failed.view, 'manage')
  assert.equal(failed.intent, null)
  assert.equal(ready(failed, intent, uuid(20)), failed)
  assert.ok(request(failed).intent.epoch > intent.epoch)
})

test('유효한 관리 탭만 열며 화면 상태를 바꿔도 기존 타석을 보존한다', () => {
  const pending = request(selected()), opened = ready(pending, pending.intent, uuid(20))
  for (const tab of ['home', 'schedule', 'records', 'player']) {
    const next = reduceBaseballCareerView(opened, { type: 'manage', tab })
    assert.equal(next.tab, tab)
    assert.equal(next.atBatId, uuid(20))
    assert.equal(next.intent, null)
  }
  for (const action of [{ type: 'manage', tab: 'debug' }, { type: 'request-manual', atBatId: '' },
    { type: 'select-career' }, { type: 'unknown' }, null]) assert.equal(reduceBaseballCareerView(opened, action), opened)
})

test('다음 타석을 저장하는 동안 같은 타격 화면을 보존하고 이전 결과의 요청은 거절한다', () => {
  const opening = request(selected()), first = ready(opening, opening.intent, uuid(20))
  const next = { type:'request-next-manual', completedAtBatId:uuid(20) }
  assert.equal(request(first), first)
  assert.equal(reduceBaseballCareerView(first, { ...next, completedAtBatId:uuid(19) }), first)
  const pending = reduceBaseballCareerView(first, next)
  assert.equal(pending.view, 'batting')
  assert.equal(pending.atBatId, uuid(20))
  assert.equal(reduceBaseballCareerView(pending, next), pending)
  assert.equal(ready(pending, pending.intent, uuid(20)), pending)
  const second = ready(pending, pending.intent, uuid(21))
  assert.equal(second.view, 'batting')
  assert.equal(second.atBatId, uuid(21))
  assert.equal(reduceBaseballCareerView(second, next), second)
  const hidden = reduceBaseballCareerView(pending, { type:'cancel' })
  assert.equal(ready(hidden, pending.intent, uuid(21)), hidden)
})

test('다음 타석은 마지막 확정 결과와 같은 경기에서만 허용한다', () => {
  const first = finish()
  const confirmed = first.career.games[0].appearances[0]
  assert.equal(getBaseballCareerNextManualSlot(first.career, confirmed, 2), 2)
  assert.equal(getBaseballCareerNextManualSlot(first.career, null, 2), null)
  assert.equal(getBaseballCareerNextManualSlot(first.career, { id:uuid(19) }, 2), null)
  const active = start(first.career, uuid(21))
  assert.equal(getBaseballCareerNextManualSlot(active.career, confirmed, 2), null)
  const played = [...first.career.games[0].appearances, { id:uuid(21) }]
  const seasonThree = { ...first.career, games:[{...first.career.games[0],appearances:played},...first.career.games.slice(1)] }
  assert.equal(getBaseballCareerNextManualSlot(seasonThree, played[1], 3), 3)
  assert.equal(getBaseballCareerNextManualSlot(seasonThree, played[1], 2), null)
  assert.equal(getBaseballCareerNextManualSlot({ ...seasonThree,currentGameIndex:1 }, played[1], 3), null)
})

test('복구 ID는 실제 activeAtBat만 재사용하고 완료·선택 없음에서는 만들지 않는다', () => {
  const pair = start(), before = clone(pair.career)
  assert.equal(getBaseballCareerResumeId(pair.career), pair.session.id)
  assert.equal(getBaseballCareerResumeId(finish().career), null)
  for (const value of [null, {}, { status: 'complete', activeAtBat: { id: uuid(20) } },
    { status: 'active', activeAtBat: { id: '' } }]) assert.equal(getBaseballCareerResumeId(value), null)
  assert.deepEqual(pair.career, before)
})

test('자식 onSession은 같은 ID의 같거나 최신 revision만 수락하고 과거 타석은 거절한다', () => {
  const original = start(), advanced = command(original, 'issue'), id = original.session.id
  const args = { career: advanced.career, atBatId: id, currentSession: advanced.session }
  assert.equal(isBaseballCareerSessionCurrent({ ...args, nextSession: original.session }), false)
  assert.equal(isBaseballCareerSessionCurrent({ ...args, nextSession: publicBaseballAtBatSession(advanced.session) }), true)
  assert.equal(isBaseballCareerSessionCurrent({ ...args, nextSession: { ...advanced.session, id: uuid(99) } }), false)
  assert.equal(isBaseballCareerSessionCurrent({ ...args, career: { ...advanced.career, activeAtBat: { id: uuid(99) } }, nextSession: advanced.session }), false)
  assert.equal(isBaseballCareerSessionCurrent({ ...args, currentSession: { ...advanced.session, id: uuid(99) }, nextSession: advanced.session }), false)
})

test('완료 표시는 최초 입장 session이 아니라 최신 영수증과 커리어 appearance를 함께 요구한다', () => {
  const initial = start(), completed = finish(initial), atBatId = initial.session.id
  const args = { career: completed.career, atBatId, session: publicBaseballAtBatSession(completed.session) }
  assert.equal(selectBaseballCareerCompletedAppearance({ ...args, session: initial.session }), null)
  assert.equal(selectBaseballCareerCompletedAppearance({ ...args, career: initial.career }), null)
  assert.equal(selectBaseballCareerCompletedAppearance(args), completed.career.games[0].appearances[0])
  assert.equal(isBaseballCareerSessionCurrent({ career: completed.career, atBatId,
    currentSession: initial.session, nextSession: args.session }), true)
  assert.equal(isBaseballCareerSessionCurrent({ career: completed.career, atBatId,
    currentSession: args.session, nextSession: initial.session }), false)
})

test('경기 인덱스가 다음 경기로 이동해도 현재 완료 타석의 원장을 찾는다', () => {
  const first = finish(), second = finish(start(first.career, uuid(21)))
  assert.equal(second.career.currentGameIndex, 1)
  const row = selectBaseballCareerCompletedAppearance({ career: second.career, atBatId: second.session.id, session: second.session })
  assert.equal(row, second.career.games[0].appearances[1])
  assert.equal(row.outcome, 'strikeout-swinging')
})

test('완료 날짜·통계·영수증·중복 원장이 다르면 가짜 결산 없이 닫힌 상태를 유지한다', () => {
  const completed = finish(), args = { career: completed.career, atBatId: completed.session.id, session: completed.session }
  const before = clone(completed)
  for (const change of [
    value => { value.session.finalReceipt = null },
    value => { value.session.finalReceipt.id = `${uuid(99)}:final` },
    value => { value.session.finalReceipt.revision-- },
    value => { value.session.finalReceipt.outcome = 'home-run' },
    value => { value.session.finalReceipt.stats.H = 1 },
    value => { value.career.games[0].appearances[0].stats.H = 1 },
    value => { value.career.games[0].appearances[0].finishedAt = '2026-11-26T00:00:00.000Z' },
    value => { value.career.games[0].appearances[0].pitchCount++ },
    value => { value.career.games[1].appearances.push(value.career.games[0].appearances[0]) },
    value => { value.career.activeAtBat = { id: uuid(99) } },
  ]) {
    const changed = clone(args); change(changed)
    assert.equal(selectBaseballCareerCompletedAppearance(changed), null)
  }
  for (const value of [undefined, {}, { ...args, atBatId: uuid(99) }]) assert.equal(selectBaseballCareerCompletedAppearance(value), null)
  assert.equal(isBaseballCareerSessionCurrent(), false)
  assert.deepEqual(completed, before)
})
