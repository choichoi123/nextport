import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BASEBALL_AT_BAT_RULES, createBaseballAtBat, nextBaseballAtBatPitch, resolveBaseballAtBatPitch,
} from '../lib/playground-baseball-at-bat.mjs'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, judgeBaseballTake, judgeBaseballSwing, sampleBaseballPlatePassage } from '../lib/playground-baseball.mjs'

const fresh = options => createBaseballAtBat({ id:'pa-test', seed:42, ...options })
// Semantic fixtures exercise the count layer. Physics results are separately
// covered below with the real engine and the unchanged incoming pitch sampler.
const leaf = outcome => ({ outcome, contacted:['foul', 'contact', 'perfect'].includes(outcome) })
const event = (state, outcome, fieldResult = null) => {
  const issue = nextBaseballAtBatPitch(state)
  return { pitchId:issue.pitchId, pitch:issue.pitch, result:leaf(outcome), fieldResult }
}
const apply = (state, outcome, fieldResult) => resolveBaseballAtBatPitch(state, event(state, outcome, fieldResult))
const zero = { PA:0, AB:0, H:0, '2B':0, '3B':0, HR:0, BB:0, SO:0 }

test('타석은 0B0S·별도 규칙/투구 정책·고정 선수와 투수로 시작하고 불변이다', () => {
  const state = fresh({ handedness:'left', pitcherHandedness:'left', baseSpeedKmh:140, pitchMode:'slider' })
  assert.equal(state.rulesVersion, BASEBALL_AT_BAT_RULES.id)
  assert.equal(state.pitchPolicyVersion, BASEBALL_AT_BAT_RULES.pitchPolicyId)
  assert.equal(state.handedness, 'left')
  assert.equal(state.pitcherHandedness, 'left')
  assert.deepEqual([state.balls, state.strikes, state.pitchCount, state.status, state.outcome], [0, 0, 0, 'active', null])
  assert.deepEqual(state.stats, zero)
  assert.ok(Object.isFrozen(state) && Object.isFrozen(state.history) && Object.isFrozen(state.stats))
  assert.throws(() => { state.balls = 9 }, TypeError)
  assert.equal(BASEBALL_RULES.sessionPitches, 10)
  assert.equal(BASEBALL_RULES.ballRadiusM, .04)
  assert.equal(BASEBALL_RULES.swingContactMs, 110)
  assert.equal(BASEBALL_RULES.batActiveStartMs, 0)
})

test('잘못된 ID·손·구속·구종·seed와 손상된 타석 카운트를 거절한다', () => {
  for (const options of [{id:''}, {id:'private name'}, {handedness:'other'}, {pitcherHandedness:'other'},
    {baseSpeedKmh:79}, {baseSpeedKmh:161}, {baseSpeedKmh:NaN}, {pitchMode:'knuckleball'}, {seed:-1}, {seed:2 ** 32}, {seed:'1'}]) {
    assert.throws(() => fresh(options))
  }
  for (const mutate of [state => { state.balls = 4 }, state => { state.strikes = 3 },
    state => { state.pitchCount = 1 }, state => { state.rulesVersion = 'unknown' }, state => { state.stats.H = 1 }]) {
    const state = JSON.parse(JSON.stringify(fresh())); mutate(state)
    assert.throws(() => nextBaseballAtBatPitch(state))
  }
})

test('투구 준비를 반복해도 같은 공ID·순번·조건이며 첫 공은 중앙을 강제하지 않는다', () => {
  const state = fresh(), before = JSON.stringify(state)
  const first = nextBaseballAtBatPitch(state), repeat = nextBaseballAtBatPitch(state)
  assert.deepEqual(first, repeat)
  assert.equal(first.number, 1)
  assert.equal(first.index, 0)
  assert.equal(first.pitchId, 'pa-test:pitch:1')
  assert.notDeepEqual(first.pitch.target, { x:0, y:(BASEBALL_RULES.zone.bottom + BASEBALL_RULES.zone.top) / 2 })
  assert.ok(Object.isFrozen(first.pitch.target))
  assert.equal(JSON.stringify(state), before)
})

test('구종 혼합의 첫 공들에 4구종·볼/스트라이크가 존재하고 실제 엔진으로 판정한다', () => {
  const types = new Set(), takes = new Set()
  for (let seed = 0; seed < 500; seed++) {
    const issue = nextBaseballAtBatPitch(fresh({ seed, pitcherHandedness:seed % 2 ? 'left' : 'right' }))
    const take = judgeBaseballTake(issue.pitch)
    types.add(issue.pitch.type); takes.add(take.outcome)
    assert.equal(issue.pitch.pitcherHandedness, seed % 2 ? 'left' : 'right')
    assert.equal(take.platePassage.inside, take.outcome === 'called-strike')
  }
  assert.deepEqual([...types].sort(), ['changeup', 'curveball', 'four-seam', 'slider'])
  assert.deepEqual([...takes].sort(), ['ball', 'called-strike'])
})

test('3볼·2스트라이크에서도 다음 공을 한 종류의 코스로 고정하지 않는다', () => {
  const takes = new Set()
  for (let seed = 0; seed < 150; seed++) {
    let state = fresh({ seed })
    for (const result of ['ball', 'ball', 'ball', 'called-strike', 'called-strike']) state = apply(state, result)
    takes.add(judgeBaseballTake(nextBaseballAtBatPitch(state).pitch).outcome)
  }
  assert.deepEqual([...takes].sort(), ['ball', 'called-strike'])
})

test('고정 구종과 한 투수의 좌우투·기준 구속은 긴 승부 안에서도 변하지 않는다', () => {
  for (const mode of BASEBALL_PITCH_TYPES.map(type => type.id)) for (const hand of ['left', 'right']) {
    let state = fresh({ pitchMode:mode, pitcherHandedness:hand, baseSpeedKmh:80 })
    for (let i = 0; i < 12; i++) {
      const issue = nextBaseballAtBatPitch(state)
      assert.equal(issue.pitch.type, mode)
      assert.equal(issue.pitch.pitcherHandedness, hand)
      assert.equal(issue.number, i + 1)
      state = resolveBaseballAtBatPitch(state, { ...issue, result:leaf('foul') })
    }
  }
})

test('네 번째 볼만 볼넷·PA1/AB0/BB1을 확정하며 이전 공은 PA를 늘리지 않는다', () => {
  let state = fresh()
  for (let balls = 1; balls <= 4; balls++) {
    const before = state; state = apply(state, 'ball')
    assert.equal(before.balls, balls - 1)
    assert.equal(state.balls, balls)
    assert.equal(state.pitchCount, balls)
    assert.equal(state.stats.PA, balls === 4 ? 1 : 0)
  }
  assert.equal(state.status, 'complete')
  assert.equal(state.outcome, 'walk')
  assert.deepEqual(state.stats, { ...zero, PA:1, BB:1 })
  assert.equal(nextBaseballAtBatPitch(state), null)
})

test('루킹/헛스윙의 세 번째 스트라이크는 서로 다른 삼진으로 끝난다', () => {
  for (const [pitchOutcome, terminal] of [['called-strike', 'strikeout-looking'], ['miss', 'strikeout-swinging']]) {
    let state = fresh()
    state = apply(state, 'called-strike'); state = apply(state, 'foul'); state = apply(state, pitchOutcome)
    assert.equal(state.strikes, 3)
    assert.equal(state.status, 'complete')
    assert.equal(state.outcome, terminal)
    assert.deepEqual(state.stats, { ...zero, PA:1, AB:1, SO:1 })
    assert.deepEqual(state.history.at(-1).countBefore, { balls:0, strikes:2 })
    assert.deepEqual(state.history.at(-1).countAfter, { balls:0, strikes:3 })
  }
})

test('파울은 두 스트라이크에서 멈추며 10구·100공 뒤에도 타석과 순번을 보존한다', () => {
  let state = apply(fresh(), 'ball')
  for (let i = 1; i <= 150; i++) {
    state = apply(state, 'foul')
    assert.equal(state.balls, 1)
    assert.equal(state.strikes, Math.min(2, i))
    assert.equal(state.pitchCount, i + 1)
    assert.equal(state.status, 'active')
    assert.deepEqual(state.stats, zero)
  }
  assert.equal(nextBaseballAtBatPitch(state).number, 152)
  state = apply(state, 'miss')
  assert.equal(state.outcome, 'strikeout-swinging')
  assert.equal(state.pitchCount, 152)
})

test('풀카운트의 헛스윙은 네 번째 볼이 아니라 삼진이다', () => {
  let state = fresh()
  for (const outcome of ['ball', 'called-strike', 'ball', 'foul', 'ball', 'foul', 'miss']) state = apply(state, outcome)
  assert.equal(state.balls, 3)
  assert.equal(state.strikes, 3)
  assert.equal(state.outcome, 'strikeout-swinging')
  assert.equal(state.stats.BB, 0)
})

test('페어 접촉은 수비 결과가 없으면 끝내지 않고 원본 상태도 바꾸지 않는다', () => {
  const state = fresh(), before = JSON.stringify(state)
  assert.throws(() => resolveBaseballAtBatPitch(state, event(state, 'perfect')), /field result/)
  assert.equal(JSON.stringify(state), before)
  assert.throws(() => resolveBaseballAtBatPitch(state, event(state, 'contact', { outcome:'unknown' })))
  assert.throws(() => resolveBaseballAtBatPitch(state, event(state, 'foul', { outcome:'single' })))
})

test('정타의 수비 아웃·평범한 접촉의 안타와 각 장타 통계가 정확히 다르다', () => {
  for (const outcome of ['single', 'double', 'triple', 'home-run', 'flyout', 'lineout', 'groundout']) {
    const fieldResult = { outcome, reason:'synthetic field decision' }
    const next = apply(fresh(), outcome.endsWith('out') ? 'perfect' : 'contact', fieldResult)
    assert.equal(next.status, 'complete')
    assert.equal(next.outcome, outcome)
    const isHit = !outcome.endsWith('out')
    assert.deepEqual(next.stats, { ...zero, PA:1, AB:1, H:isHit ? 1 : 0,
      '2B':outcome === 'double' ? 1 : 0, '3B':outcome === 'triple' ? 1 : 0, HR:outcome === 'home-run' ? 1 : 0 })
    assert.deepEqual(next.history[0].fieldResult, fieldResult)
  }
})

test('동일 공의 정확한 재전송은 멱등이고 다른 결과·코스·순번·완료 뒤 새 공은 거절한다', () => {
  const start = fresh(), first = event(start, 'ball'), one = resolveBaseballAtBatPitch(start, first)
  assert.equal(resolveBaseballAtBatPitch(one, JSON.parse(JSON.stringify(first))), one)
  const later = apply(apply(one, 'foul'), 'ball')
  assert.equal(resolveBaseballAtBatPitch(later, first), later)
  assert.equal(later.pitchCount, 3)
  assert.throws(() => resolveBaseballAtBatPitch(one, { ...first, result:leaf('miss') }), /Conflicting/)
  assert.throws(() => resolveBaseballAtBatPitch(start, { ...first, pitchId:'pa-test:pitch:2' }), /next issued/)
  const changed = JSON.parse(JSON.stringify(first)); changed.pitch.target.y += .01
  assert.throws(() => resolveBaseballAtBatPitch(start, changed), /next issued/)
  const fair = event(start, 'contact', { outcome:'single' }), done = resolveBaseballAtBatPitch(start, fair)
  assert.equal(resolveBaseballAtBatPitch(done, fair), done)
  assert.throws(() => resolveBaseballAtBatPitch(done, first), /Conflicting/)
  assert.throws(() => resolveBaseballAtBatPitch(done, { ...first, pitchId:'pa-test:pitch:2' }), /next issued/)
})

test('풀카운트의 페어 장타는 스트라이크나 볼을 추가하지 않고 한 타석만 끝낸다', () => {
  let state = fresh()
  for (const result of ['ball', 'called-strike', 'ball', 'foul', 'ball']) state = apply(state, result)
  const terminal = apply(state, 'perfect', { outcome:'home-run', reason:'airborne wall crossing' })
  assert.deepEqual([terminal.balls, terminal.strikes, terminal.pitchCount], [3, 2, 6])
  assert.deepEqual(terminal.stats, { ...zero, PA:1, AB:1, H:1, HR:1 })
  assert.equal(terminal.outcome, 'home-run')
  assert.equal(Object.hasOwn(terminal, 'xp'), false)
})

test('기록은 인수를 복사해 동결하며 입력 출처·공 판정 모순·비유한값을 검사한다', () => {
  const state = fresh(), value = JSON.parse(JSON.stringify(event(state, 'ball'))), next = resolveBaseballAtBatPitch(state, { ...value, source:'development' })
  const saved = JSON.stringify(next)
  value.pitch.target.y = 9
  value.result.outcome = 'foul'
  assert.equal(JSON.stringify(next), saved)
  assert.equal(next.history[0].source, 'development')
  assert.ok(Object.isFrozen(next.history[0].pitch.target))
  for (const alter of [value => { value.source = 'mouse' }, value => { value.result.contacted = true },
    value => { value.result.score = Infinity }, value => { value.result.outcome = 'hit-by-pitch' }]) {
    const invalid = JSON.parse(JSON.stringify(event(state, 'ball'))); alter(invalid)
    assert.throws(() => resolveBaseballAtBatPitch(state, invalid))
  }
})

test('실제4구종·양타·양투의 지켜본 승부는 볼넷 또는 루킹 삼진으로 정상 종료한다', () => {
  let completed = 0
  for (const type of BASEBALL_PITCH_TYPES) for (const hand of ['left', 'right']) for (const batter of ['left', 'right']) for (let seed = 0; seed < 12; seed++) {
    let state = fresh({ pitchMode:type.id, pitcherHandedness:hand, handedness:batter, seed })
    for (let i = 0; i < 12 && state.status !== 'complete'; i++) {
      const issue = nextBaseballAtBatPitch(state), result = judgeBaseballTake(issue.pitch)
      state = resolveBaseballAtBatPitch(state, { ...issue, result })
    }
    assert.equal(state.status, 'complete')
    assert.ok(['walk', 'strikeout-looking'].includes(state.outcome))
    assert.equal(state.stats.PA, 1)
    assert.equal(state.stats.H, 0)
    completed += 1
  }
  assert.equal(completed, 192)
})

test('실제 엔진의 새 초반 접촉 파울과 존 밖 헛스윙을 수정 없이 소비한다', () => {
  for (const type of BASEBALL_PITCH_TYPES) for (const hand of ['left', 'right']) {
    const state = fresh({ pitchMode:type.id, pitcherHandedness:hand })
    const issue = nextBaseballAtBatPitch(state), passage = sampleBaseballPlatePassage(issue.pitch)
    const result = judgeBaseballSwing(issue.pitch, { swingAtMs:passage.timeMs - 8.85, aim:issue.pitch.target, handedness:state.handedness })
    assert.equal(result.outcome, 'foul')
    assert.equal(result.activeAtPlate, true)
    const next = resolveBaseballAtBatPitch(state, { ...issue, result })
    assert.equal(next.status, 'active')
    assert.equal(next.strikes, 1)
    assert.deepEqual(next.history[0].result, result)
  }
  let outsideState
  for (let seed = 0; seed < 100 && !outsideState; seed++) {
    let state = fresh({ seed })
    for (const result of ['ball', 'ball', 'ball', 'called-strike', 'called-strike']) state = apply(state, result)
    if (judgeBaseballTake(nextBaseballAtBatPitch(state).pitch).outcome === 'ball') outsideState = state
  }
  assert.ok(outsideState)
  const issue = nextBaseballAtBatPitch(outsideState), passage = sampleBaseballPlatePassage(issue.pitch)
  const aim = { x:0, y:issue.pitch.target.y > .8 ? .2 : 1.3 }
  const result = judgeBaseballSwing(issue.pitch, { swingAtMs:passage.timeMs - 110, aim, handedness:outsideState.handedness })
  assert.equal(result.outcome, 'miss')
  assert.equal(result.platePassage.inside, false)
  const terminal = resolveBaseballAtBatPitch(outsideState, { ...issue, result })
  assert.equal(terminal.outcome, 'strikeout-swinging')
  assert.equal(terminal.balls, 3)
  assert.equal(terminal.strikes, 3)
})
