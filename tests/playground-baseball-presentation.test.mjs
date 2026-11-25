import test from 'node:test'
import assert from 'node:assert/strict'
import { BASEBALL_PITCH_TYPES, createBaseballPitch, getBaseballPitchSpeed, sampleBaseballPlatePassage, judgeBaseballSwing } from '../lib/playground-baseball.mjs'
import { getBaseballPlateMarker, getBaseballBatPresentation } from '../lib/playground-baseball-presentation.mjs'
import { createBaseballStage, createBaseballProjection } from '../lib/playground-baseball-layout.mjs'
import { createBaseballFocusProjection } from '../lib/playground-baseball-focus.mjs'

const pitch = createBaseballPitch({ speedKmh:120, seed:17, target:{x:.123, y:.821}, pitcherHandedness:'right' })
const passage = sampleBaseballPlatePassage(pitch)

test('스윙 초반0~20ms의 실제 접촉도 사건 전 예측 없이 활성 배트와 접촉 복기로 연결한다', () => {
  for(const handedness of ['right','left']) for(const elapsed of [0,8.8501940588,19.999999]) {
    const swingAt=passage.timeMs-elapsed, aim=pitch.target
    const result=judgeBaseballSwing(pitch,{swingAtMs:swingAt,aim,handedness})
    assert.equal(result.contacted,true)
    assert.equal(result.outcome,'foul')
    const before=getBaseballBatPresentation({phase:'flight',pitch,flightMs:passage.timeMs-.001,swingAt,swingAim:aim,handedness,result})
    assert.equal(before.showReview,false)
    const at=getBaseballBatPresentation({phase:'flight',pitch,flightMs:passage.timeMs,swingAt,swingAim:aim,handedness,result})
    assert.equal(at.liveBat.active,true)
    assert.equal(at.reviewBat.active,true)
    assert.equal(at.showReview,true)
    assert.equal(at.reviewKind,'contact')
    assert.equal(at.reviewElapsedMs,elapsed===0?0:passage.timeMs-swingAt)
    assert.deepEqual(at.fixedAim,{...aim,z:0})
  }
})

test('존 이벤트는 투구 없음·준비 전·정지 상태에서 미리 노출되지 않는다', () => {
  assert.equal(getBaseballPlateMarker(), null)
  for (const flightMs of [undefined, null, NaN, Infinity, -1]) {
    assert.equal(getBaseballPlateMarker({pitch, flightMs}), null)
  }
  assert.equal(getBaseballPlateMarker({pitch:null, flightMs:10000}), null)
  assert.equal(getBaseballPlateMarker({pitch, flightMs:10000, moving:false}), null)
  assert.equal(getBaseballPlateMarker({pitch, flightMs:0}), null)
})

test('통과 직전에는 없고 정확한 앞면 시각부터 같은 통과점을 유지한다', () => {
  assert.equal(getBaseballPlateMarker({pitch, flightMs:passage.timeMs - .000001}), null)
  for (const delay of [0, .000001, 16.7, 220, 10000]) {
    const actual = getBaseballPlateMarker({pitch, flightMs:passage.timeMs + delay})
    assert.deepEqual(actual, {kind:'passage', point:passage.point, timeMs:passage.timeMs})
    assert.equal(actual.point.z, 0)
  }
})

test('완료 결과의 별도 목표점 대신 현재 공의 정확한 앞면 사건을 사용한다', () => {
  const result = {contacted:false, platePassage:{point:{x:9,y:9,z:9},timeMs:0}}
  const actual = getBaseballPlateMarker({pitch, flightMs:passage.timeMs, result})
  assert.deepEqual(actual.point, passage.point)
  assert.equal(actual.timeMs, passage.timeMs)
})

test('예측된 타격 결과가 있어도 접촉 시각 전에는 접촉점을 보이지 않는다', () => {
  const result = {contacted:true, contactAtMs:passage.timeMs, contactPoint:passage.point}
  assert.equal(getBaseballPlateMarker({pitch, flightMs:passage.timeMs - .000001, result}), null)
  for (const delay of [0, 16, 10000]) {
    assert.deepEqual(getBaseballPlateMarker({pitch, flightMs:passage.timeMs + delay, result}), {
      kind:'contact', point:passage.point, timeMs:passage.timeMs,
    })
  }
})

test('기존 앞면 이전 접촉은 실제 접촉점만 남기고 가상의 존 통과점을 만들지 않는다', () => {
  const contactAtMs = passage.timeMs - 40
  const contactPoint = {x:.18,y:.91,z:1.2}
  const result = {contacted:true, contactAtMs, contactPoint}
  assert.equal(getBaseballPlateMarker({pitch, flightMs:contactAtMs - .000001, result}), null)
  for (const flightMs of [contactAtMs, passage.timeMs, passage.timeMs + 300]) {
    assert.deepEqual(getBaseballPlateMarker({pitch, flightMs, result}), {kind:'contact',point:contactPoint,timeMs:contactAtMs})
  }
})

test('기존 앞면 이후 접촉은 먼저 실제 통과를 표시한 뒤 접촉 사건을 구분한다', () => {
  const contactAtMs = passage.timeMs + 35
  const contactPoint = {x:.2,y:.6,z:-.7}
  const result = {contacted:true, contactAtMs, contactPoint}
  assert.equal(getBaseballPlateMarker({pitch, flightMs:passage.timeMs - .000001, result}), null)
  assert.equal(getBaseballPlateMarker({pitch, flightMs:passage.timeMs, result}).kind, 'passage')
  assert.deepEqual(getBaseballPlateMarker({pitch, flightMs:contactAtMs, result}), {kind:'contact',point:contactPoint,timeMs:contactAtMs})
})

test('손상된 접촉 사건은 대체 통과점으로 가짜 정상 처리하지 않는다', () => {
  for (const result of [
    {contacted:true}, {contacted:true, contactAtMs:NaN, contactPoint:passage.point},
    {contacted:true, contactAtMs:-1, contactPoint:passage.point},
    {contacted:true, contactAtMs:passage.timeMs, contactPoint:{x:0,y:.7,z:NaN}},
  ]) assert.equal(getBaseballPlateMarker({pitch, flightMs:10000, result}), null)
})

test('4구종·양투·실제 구속별로 같은 사건을 사용하고 입력을 변경하지 않는다', () => {
  for (const profile of BASEBALL_PITCH_TYPES) for (const hand of ['right','left']) for (const base of [80,120,160]) {
    const current = createBaseballPitch({speedKmh:getBaseballPitchSpeed(base,profile.id),pitchType:profile.id,seed:138,pitcherHandedness:hand})
    const expected = sampleBaseballPlatePassage(current)
    const before = JSON.stringify(current)
    const actual = getBaseballPlateMarker({pitch:current,flightMs:expected.timeMs})
    assert.deepEqual(actual, {kind:'passage',point:expected.point,timeMs:expected.timeMs})
    assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual.point))
    assert.equal(JSON.stringify(current), before)
    assert.equal(getBaseballPlateMarker({pitch:current,flightMs:expected.timeMs - .001}), null)
  }
  const supplied = {contacted:true,contactAtMs:passage.timeMs,contactPoint:{x:.1,y:.8,z:0}}
  const actual = getBaseballPlateMarker({pitch,flightMs:passage.timeMs,result:supplied})
  supplied.contactPoint.x = 99
  assert.equal(actual.point.x,.1)
})

const selectedAim = {x:.123,y:.821}
const swingAt = passage.timeMs - 110
const batting = overrides => getBaseballBatPresentation({phase:'flight',pitch,flightMs:passage.timeMs,
  swingAt,swingAim:selectedAim,aim:{x:-.4,y:.5},handedness:'left',...overrides})

test('클릭 전 미리보기와 준비·중단·리셋은 실제 스윙이나 미래 복기를 만들지 않는다', () => {
  for(const phase of ['setup','ready','windup','flight','paused']) {
    const actual=batting({phase,swingAt:null,swingAim:null,aim:selectedAim,flightMs:-20})
    assert.equal(actual.hasSwing,false)
    assert.equal(actual.showPreview,true)
    assert.equal(actual.previewBat.active,false)
    assert.deepEqual(actual.previewBat.sweetSpot,{...selectedAim,z:0})
    assert.equal(actual.liveBat,null)
    assert.equal(actual.reviewBat,null)
    assert.equal(actual.showLive,false)
    assert.equal(actual.showReview,false)
  }
  const reset=batting({phase:'ready',swingAt:null,swingAim:null,aim:{x:0,y:.7},flightMs:null})
  assert.deepEqual(reset.fixedAim,{x:0,y:.7,z:0})
  assert.equal(reset.reviewAtMs,null)
  const paused=batting({phase:'paused'})
  assert.equal(paused.hasSwing,false)
  assert.equal(paused.liveBat,null)
  assert.equal(paused.reviewBat,null)
  assert.equal(paused.noReviewReason,'inactive-phase')
  assert.equal(getBaseballBatPresentation().showFixedAim,false)
})

test('확정 조준은 이후 hover와 결과·완료 상태에 영향받지 않고 입력 객체를 공유하지 않는다', () => {
  const aim={...selectedAim}, input={phase:'flight',pitch,flightMs:passage.timeMs,swingAt,swingAim:aim,aim:{x:.5,y:.5},handedness:'left'}
  const before=JSON.stringify(input), first=getBaseballBatPresentation(input)
  assert.equal(JSON.stringify(input),before)
  assert.notEqual(first.fixedAim,aim)
  assert.ok(Object.isFrozen(first.fixedAim))
  aim.x=99
  assert.deepEqual(first.fixedAim,{...selectedAim,z:0})
  for(const phase of ['result','complete']) {
    const actual=batting({phase,aim:{x:.5,y:1.1},flightMs:passage.timeMs+1000})
    assert.deepEqual(actual.fixedAim,{...selectedAim,z:0})
    assert.equal(actual.showFixedAim,true)
    assert.equal(actual.showPreview,false)
  }
})

test('공 통과 뒤 live 중심은 고정하고 시계·각도·끝점은 진행하며 복기만 사건 자세에 남는다', () => {
  const first=batting(), later=batting({flightMs:passage.timeMs+60}), finished=batting({phase:'complete',flightMs:passage.timeMs+1000})
  assert.equal(first.liveElapsedMs,110)
  assert.equal(later.liveElapsedMs,170)
  assert.equal(finished.liveElapsedMs,1110)
  assert.deepEqual(later.liveBat.sweetSpot,first.liveBat.sweetSpot)
  assert.notEqual(later.liveBat.angleRad,first.liveBat.angleRad)
  assert.notDeepEqual(later.liveBat.start,first.liveBat.start)
  assert.notDeepEqual(later.liveBat.end,first.liveBat.end)
  for(const actual of [first,later,finished]) {
    assert.equal(actual.reviewAtMs,passage.timeMs)
    assert.equal(actual.reviewElapsedMs,110)
    assert.equal(actual.reviewKind,'passage')
    assert.deepEqual(actual.reviewBat.sweetSpot,{...selectedAim,z:0})
    assert.equal(actual.showReview,true)
    assert.equal(actual.noReviewReason,null)
  }
  assert.equal(finished.showLive,false)
  assert.ok(finished.liveBat)
})

test('양타의 준비·현재·복기 중심은 main과 focus 모두 잠금 조준점에 남는다', () => {
  for(const handedness of ['left','right']) for(const [width,height] of [[836.96875,678],[390,560]]) {
    const main=createBaseballProjection(createBaseballStage(width,height,handedness))
    const focus=createBaseballFocusProjection(main,{width:340,height:360})
    const preview=batting({handedness,swingAt:null,swingAim:null,aim:selectedAim,flightMs:0})
    for(const elapsed of [0,37,110,183,319,519.9]) {
      const actual=batting({handedness,flightMs:swingAt+elapsed,aim:{x:-.5,y:1.2}})
      assert.deepEqual(actual.liveBat.sweetSpot,actual.fixedAim)
      for(const view of [main,focus]) {
        const target=view.project(actual.fixedAim)
        assert.deepEqual(view.project(preview.previewBat.sweetSpot),target)
        assert.deepEqual(view.project(actual.liveBat.sweetSpot),target)
        const start=view.project(actual.liveBat.start), end=view.project(actual.liveBat.end)
        assert.ok(Math.abs((start.x+end.x)/2-target.x)<1e-10)
        assert.ok(Math.abs((start.y+end.y)/2-target.y)<1e-10)
        if(actual.reviewBat)assert.deepEqual(view.project(actual.reviewBat.sweetSpot),target)
      }
      if(elapsed<110)assert.equal(actual.reviewBat,null)
      else assert.equal(actual.reviewElapsedMs,110)
    }
  }
})

test('예측된 접촉과 수동 미래 marker 모두 현재 시계가 사건에 닿기 전에는 공개하지 않는다', () => {
  const result=judgeBaseballSwing(pitch,{swingAtMs:swingAt,aim:selectedAim,handedness:'left'})
  assert.equal(result.contacted,true)
  const marker={kind:'contact',timeMs:passage.timeMs,point:passage.point}
  for(const extra of [{result},{marker},{marker,result}]) {
    const before=batting({...extra,flightMs:passage.timeMs-.000001})
    assert.equal(before.reviewBat,null)
    assert.equal(before.reviewAtMs,null)
    assert.equal(before.reviewKind,null)
    assert.equal(before.noReviewReason,'pending-event')
  }
  const observed=batting({marker,result})
  assert.equal(observed.reviewKind,'contact')
  assert.equal(observed.showReview,true)
  const afterContact=batting({marker,result,flightMs:passage.timeMs+80})
  assert.deepEqual(afterContact.reviewBat,observed.reviewBat)
  assert.equal(afterContact.liveElapsedMs,190)
  assert.deepEqual(afterContact.liveBat.sweetSpot,observed.liveBat.sweetSpot)
  assert.notEqual(afterContact.liveBat.angleRad,observed.liveBat.angleRad)
  assert.notDeepEqual(afterContact.liveBat.start,observed.liveBat.start)
  assert.equal(batting({marker:null,result,flightMs:passage.timeMs+50}).reviewBat,null)
  assert.equal(batting({marker:{...marker,timeMs:-1}}).reviewBat,null)
})

test('공 통과 후 클릭은 음수 복기 시간을0ms로 만들지 않고 아직 시작 전임을 구분한다', () => {
  for(const delay of [20,100,1000]) {
    const actual=batting({swingAt:passage.timeMs+10,flightMs:passage.timeMs+delay})
    assert.equal(actual.hasSwing,true)
    assert.equal(actual.liveElapsedMs,delay-10)
    assert.equal(actual.reviewElapsedMs,-10)
    assert.equal(actual.reviewAtMs,passage.timeMs)
    assert.equal(actual.reviewBat,null)
    assert.equal(actual.showReview,false)
    assert.equal(actual.noReviewReason,'not-started')
    assert.deepEqual(actual.fixedAim,{...selectedAim,z:0})
  }
})

test('지켜본 결과는 통과 사건이 있어도 스윙·고정점·복기 배트를 표시하지 않는다', () => {
  for(const phase of ['result','complete']) {
    const actual=batting({phase,swingAt:null,swingAim:null})
    assert.equal(actual.reviewAtMs,passage.timeMs)
    assert.equal(actual.noReviewReason,'no-swing')
    assert.equal(actual.previewBat,null)
    assert.equal(actual.liveBat,null)
    assert.equal(actual.reviewBat,null)
    assert.equal(actual.showFixedAim,false)
  }
})

test('준비 중 이른 스윙과 사건 시점에 이미 끝난 스윙을 새 가시 구간으로 늘리지 않는다', () => {
  const windup=batting({phase:'windup',flightMs:-500,swingAt:-510})
  assert.equal(windup.liveElapsedMs,10)
  assert.equal(windup.showLive,true)
  assert.equal(windup.reviewBat,null)
  const early=batting({swingAt:passage.timeMs-600})
  assert.equal(early.liveElapsedMs,600)
  assert.equal(early.reviewElapsedMs,600)
  assert.equal(early.showLive,false)
  assert.equal(early.showReview,false)
  assert.equal(early.noReviewReason,'swing-outside-visibility')
  assert.ok(early.liveBat && early.reviewBat)
  const rafBeforeInput=batting({flightMs:swingAt-.01})
  assert.ok(rafBeforeInput.liveElapsedMs<0)
  assert.equal(rafBeforeInput.showLive,false)
})

test('표시 선택은 언어·확대·결과 설명과 무관하며 양타 모두 확정 조준을 보존한다', () => {
  for(const handedness of ['left','right']) {
    const base=batting({handedness}), before=JSON.stringify({pitch,aim:selectedAim})
    for(const locale of ['ko','en']) for(const focusEnabled of [false,true]) {
      const actual=batting({handedness,locale,focusEnabled,result:{contacted:false,score:999}})
      assert.deepEqual(actual,base)
    }
    assert.equal(JSON.stringify({pitch,aim:selectedAim}),before)
    assert.deepEqual(base.fixedAim,{...selectedAim,z:0})
  }
})
