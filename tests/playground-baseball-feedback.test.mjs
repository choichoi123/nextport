import test from 'node:test'
import assert from 'node:assert/strict'
import { BASEBALL_FEEDBACK, getBaseballFlightFeedbackEvents, getBaseballResultFeedbackEvents, createBaseballFeedbackGate } from '../lib/playground-baseball-feedback.mjs'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, createBaseballPitch, judgeBaseballSwing } from '../lib/playground-baseball.mjs'
import { BASEBALL_FIELD_MODEL, resolveBaseballFieldResult } from '../lib/playground-baseball-field.mjs'

const copy = value => JSON.parse(JSON.stringify(value))
const physical = extra => ({ scopeId:'session:1', pitchId:'session:1:pitch:1', attemptId:'attempt:1', mode:'at-bat', origin:'live',
  startAt:1000, windupMs:1200, pitch:{flightTimeMs:600}, ...extra })
const contact = extra => ({outcome:'perfect', contacted:true, quality:.94, contactAtMs:600, contactPoint:{x:.1,y:.8,z:0}, ...extra})
const confirmed = extra => ({scopeId:'session:1',pitchId:'session:1:pitch:1',mode:'at-bat',origin:'live',confirmed:true,authority:'server',confirmedAtMs:4000,
  result:contact(),terminalOutcome:'home-run',fieldResult:{outcome:'home-run',reasonKey:'over-fence',bases:4,landingPoint:null}, ...extra})
const callNames = events => events.filter(event=>event.type==='call').map(event=>event.call)

test('릴리스·스윙·접촉은 기존 절대 시각을 사용하며 미래 소리를 먼저 소비하지 않는다',()=>{
  const events=getBaseballFlightFeedbackEvents(physical({swingAtMs:490,result:contact()})),gate=createBaseballFeedbackGate()
  assert.deepEqual(events.map(e=>[e.type,e.atMs]),[['release',2200],['swing',2690],['contact',2800]])
  assert.deepEqual(gate.take(events,2199),[])
  assert.deepEqual(gate.take(events,2200).map(e=>e.type),['release'])
  assert.deepEqual(gate.take(events,2690).map(e=>e.type),['swing'])
  assert.deepEqual(gate.take(events,2800).map(e=>e.type),['contact'])
  assert.deepEqual(gate.take(events,2801),[])
})

test('미접촉은 통과와 지연된 미트이며 접촉이 생기면 두 예약 후보를 제거한다',()=>{
  const untouched=getBaseballFlightFeedbackEvents(physical()),gate=createBaseballFeedbackGate()
  assert.deepEqual(untouched.map(e=>[e.type,e.atMs]),[['release',2200],['pass',2800],['mitt',2880]])
  assert.deepEqual(gate.take(untouched,2790),[])
  const hit=getBaseballFlightFeedbackEvents(physical({swingAtMs:490,result:contact({outcome:'foul'})}))
  assert.deepEqual(gate.take(hit,2800).map(e=>e.type),['swing','contact'])
  assert.deepEqual(gate.take(hit,2880),[])
  const missed=getBaseballFlightFeedbackEvents(physical({swingAtMs:590,result:{outcome:'miss',contacted:false}}))
  assert.equal(missed.find(e=>e.type==='mitt').atMs-missed.find(e=>e.type==='pass').atMs,BASEBALL_FEEDBACK.mittDelayMs)
})

test('메인·확대·반복 렌더가 같은 사건을 제출해도 시도마다 한 번만 소비한다',()=>{
  const gate=createBaseballFeedbackGate(),events=getBaseballFlightFeedbackEvents(physical({result:contact()}))
  const hit=events.find(e=>e.type==='contact')
  assert.equal(gate.take([hit,copy(hit)],2800).length,1)
  assert.equal(gate.take(copy(events),2800).length,0)
  const retry=getBaseballFlightFeedbackEvents(physical({attemptId:'attempt:2',startAt:5000,result:contact()}))
  assert.equal(gate.take(retry,6800).filter(e=>e.type==='contact').length,1)
})

test('복구·자동 진행·리플레이와 모순된 출처에서는 실시간 효과가 나오지 않는다',()=>{
  for(const origin of ['restored','automatic','replay','unknown',undefined]){
    assert.deepEqual(getBaseballFlightFeedbackEvents(physical({origin})),[])
    assert.deepEqual(getBaseballResultFeedbackEvents(confirmed({origin})),[])
  }
  assert.deepEqual(getBaseballResultFeedbackEvents(confirmed({origin:'preview'})),[])
  assert.deepEqual(getBaseballResultFeedbackEvents(confirmed({authority:'preview'})),[])
  assert.equal(getBaseballResultFeedbackEvents(confirmed({origin:'preview',authority:'preview'}))[0].outcome,'home-run')
})

test('서버 확인 전의 정타와 로컬 예측은 홈런 배너·콜을 만들지 않는다',()=>{
  for(const extra of [{confirmed:false},{authority:'prediction'},{terminalOutcome:null},{fieldResult:null},{terminalOutcome:'single'}]){
    assert.deepEqual(getBaseballResultFeedbackEvents(confirmed(extra)),[])
  }
  const out=getBaseballResultFeedbackEvents(confirmed({terminalOutcome:'flyout',fieldResult:{outcome:'flyout'}}))
  assert.deepEqual(out.map(e=>e.type==='call'?e.call:e.outcome),['out','flyout'])
  assert.equal(out.some(e=>e.outcome==='home-run'),false)
})

test('홈런과 인정2루타는 확정 수비 결과를 따르고 모순된 홈런 자료는 거절한다',()=>{
  const home=getBaseballResultFeedbackEvents(confirmed())
  assert.equal(home.length,1);assert.equal(home[0].type,'result');assert.equal(home[0].outcome,'home-run');assert.equal(home[0].confirmed,true)
  const double=getBaseballResultFeedbackEvents(confirmed({terminalOutcome:'double',fieldResult:{outcome:'double',reasonKey:'ground-rule-double',bases:2}}))
  assert.deepEqual(double.map(e=>e.outcome),['double'])
  for(const fieldResult of [{outcome:'home-run',reasonKey:'ground-rule-double'},{outcome:'home-run',bases:2},{outcome:'home-run',landingPoint:{y:0}}]){
    assert.deepEqual(getBaseballResultFeedbackEvents(confirmed({fieldResult})),[])
  }
})

test('10구 연습은 최종 안타·아웃·홈런을 추정하지 않고 공통 콜만 낸다',()=>{
  assert.deepEqual(getBaseballResultFeedbackEvents(confirmed({mode:'practice'})),[])
  for(const [outcome,call]of [['foul','foul'],['called-strike','strike'],['miss','strike'],['ball','ball']]){
    const events=getBaseballResultFeedbackEvents(confirmed({mode:'practice',result:{outcome,contacted:outcome==='foul'}}))
    assert.deepEqual(callNames(events),[call]);assert.equal(events.some(e=>e.type==='result'),false)
  }
})

test('2스트라이크 파울은 삼진이 아니며 최종 삼진은 일반 스트라이크 콜과 겹치지 않는다',()=>{
  const foul=getBaseballResultFeedbackEvents(confirmed({result:contact({outcome:'foul'}),terminalOutcome:null,fieldResult:null,countBefore:{balls:2,strikes:2},countAfter:{balls:2,strikes:2}}))
  assert.deepEqual(callNames(foul),['foul']);assert.equal(foul.length,1)
  for(const [outcome,terminalOutcome]of [['miss','strikeout-swinging'],['called-strike','strikeout-looking']]){
    const events=getBaseballResultFeedbackEvents(confirmed({result:{outcome,contacted:false},terminalOutcome,fieldResult:null,countAfter:{balls:2,strikes:3}}))
    assert.deepEqual(callNames(events),['strikeout']);assert.equal(events.filter(e=>e.type==='result').length,1)
    assert.deepEqual(getBaseballResultFeedbackEvents(confirmed({result:{outcome,contacted:false},terminalOutcome,fieldResult:null,countAfter:{balls:2,strikes:2}})),[])
  }
})

test('일반 볼과 볼넷의 확정 콜을 분리하며 네 번째 볼은 중복하지 않는다',()=>{
  const result={outcome:'ball',contacted:false}
  const ordinary=getBaseballResultFeedbackEvents(confirmed({result,terminalOutcome:null,fieldResult:null,countAfter:{balls:3,strikes:1}}))
  assert.deepEqual(callNames(ordinary),['ball']);assert.equal(ordinary.length,1)
  const walk=getBaseballResultFeedbackEvents(confirmed({result,terminalOutcome:'walk',fieldResult:null,countAfter:{balls:4,strikes:1}}))
  assert.deepEqual(callNames(walk),['walk']);assert.equal(walk.filter(e=>e.type==='result').length,1)
  assert.deepEqual(getBaseballResultFeedbackEvents(confirmed({result,terminalOutcome:'walk',fieldResult:null,countAfter:{balls:3,strikes:1}})),[])
})

test('확정 결과의 키는 시도·ACK·revision이 달라져도 동일해서 재전송을 한 번만 알린다',()=>{
  const gate=createBaseballFeedbackGate(),first=getBaseballResultFeedbackEvents(confirmed({attemptId:'attempt:1',revision:4,commandId:'command:1'}))
  assert.equal(gate.take(first,4000).length,1)
  const retry=getBaseballResultFeedbackEvents(confirmed({attemptId:'attempt:2',revision:9,commandId:'command:2',confirmedAtMs:4100}))
  assert.equal(retry[0].id,first[0].id);assert.equal(gate.take(retry,4100).length,0)
  const otherPitch=getBaseballResultFeedbackEvents(confirmed({pitchId:'session:1:pitch:2',confirmedAtMs:4200}))
  assert.equal(gate.take(otherPitch,4200).length,1)
})

test('늦은 로딩·중단 후 밀린 순간 효과는 소비만 하고 새 공에 재생하지 않는다',()=>{
  const gate=createBaseballFeedbackGate(),hit=getBaseballFlightFeedbackEvents(physical({result:contact()})).find(e=>e.type==='contact')
  assert.deepEqual(gate.take([hit],hit.atMs+181),[])
  assert.deepEqual(gate.take([{...hit,atMs:4000}],4000),[])
  const final=getBaseballResultFeedbackEvents(confirmed())[0]
  assert.deepEqual(gate.take([final],6001),[])
  assert.deepEqual(gate.take([{...final,atMs:7000}],7000),[])
})

test('중복 보관은 상한과 TTL을 지키고 한 묶음 안의 중복도 상한 밖에서 반복하지 않는다',()=>{
  const gate=createBaseballFeedbackGate({maxEntries:2,ttlMs:10})
  const row=n=>getBaseballResultFeedbackEvents(confirmed({pitchId:`pitch:${n}`,confirmedAtMs:4000}))[0]
  const rows=[row(1),row(2),row(3),row(1)]
  assert.equal(gate.take(rows,4000).length,3);assert.equal(gate.size(),2)
  assert.deepEqual(gate.take([],4011),[]);assert.equal(gate.size(),0)
  assert.deepEqual(gate.take([row(1)],10000),[])
  gate.clear();assert.equal(gate.size(),0)
  for(const options of [{maxEntries:0},{maxEntries:1.5},{ttlMs:0},{maxTransientLagMs:-1}])assert.throws(()=>createBaseballFeedbackGate(options),TypeError)
})

test('손상된 시간·사건·출처는 표시를 생략하며 저장 자료나 내부 투구 정보를 반환하지 않는다',()=>{
  for(const extra of [{startAt:NaN},{windupMs:-1},{pitch:{flightTimeMs:0}},{scopeId:''},{attemptId:undefined}]){
    assert.deepEqual(getBaseballFlightFeedbackEvents(physical(extra)),[])
  }
  for(const result of [{outcome:'unknown',contacted:false},{outcome:'perfect',contacted:false},{outcome:'called-strike',contacted:true}]){
    assert.deepEqual(getBaseballFlightFeedbackEvents(physical({result})).map(event=>event.type),['release'])
  }
  const gate=createBaseballFeedbackGate(),valid=getBaseballResultFeedbackEvents(confirmed())[0]
  for(const extra of [{origin:'restored'},{mode:'unknown'},{channel:'voice'},{confirmed:false},{atMs:Infinity},{id:''}])assert.deepEqual(gate.take([{...valid,...extra}],4000),[])
  const events=getBaseballFlightFeedbackEvents(physical({result:contact()}))
  for(const e of events)for(const key of ['pitch','seed','fieldResult','commandId','revision'])assert.equal(Object.hasOwn(e,key),false)
})

test('기존 4구종·좌우투·좌우타의 공과110ms 접촉/8cm 물리는 표시 사건 생성 전후 동일하다',()=>{
  const rulesBefore=JSON.stringify(BASEBALL_RULES),fieldBefore=JSON.stringify(BASEBALL_FIELD_MODEL)
  for(const type of BASEBALL_PITCH_TYPES)for(const pitcherHandedness of ['left','right'])for(const handedness of ['left','right']){
    const pitch=createBaseballPitch({seed:44,pitchType:type.id,pitcherHandedness,speedKmh:120,target:{x:.1,y:.8}})
    const input={swingAtMs:pitch.flightTimeMs-110,aim:{...pitch.target},handedness}
    const result=judgeBaseballSwing(pitch,input),before=JSON.stringify({pitch,input,result})
    const round=physical({pitch,swingAtMs:input.swingAtMs,result})
    const events=getBaseballFlightFeedbackEvents(round),hit=events.find(e=>e.type==='contact')
    assert.ok(result.contacted);assert.equal(hit.atMs,round.startAt+round.windupMs+result.contactAtMs)
    const fieldResult=resolveBaseballFieldResult(result)
    getBaseballResultFeedbackEvents(confirmed({result,terminalOutcome:fieldResult.outcome,fieldResult}))
    assert.equal(JSON.stringify({pitch,input,result}),before)
  }
  assert.equal(JSON.stringify(BASEBALL_RULES),rulesBefore);assert.equal(JSON.stringify(BASEBALL_FIELD_MODEL),fieldBefore)
  assert.equal(BASEBALL_RULES.ballRadiusM,.04);assert.equal(BASEBALL_RULES.swingContactMs,110)
})

test('반환된 접촉점은 원본을 공유하거나 원본을 동결하지 않는다',()=>{
  const result=copy(contact()),options=physical({result}),events=getBaseballFlightFeedbackEvents(options),hit=events.find(e=>e.type==='contact')
  assert.equal(Object.isFrozen(result),false);assert.equal(Object.isFrozen(result.contactPoint),false)
  result.contactPoint.y=10;assert.equal(hit.point.y,.8)
  assert.equal(Object.isFrozen(events),true);assert.equal(Object.isFrozen(hit),true);assert.equal(Object.isFrozen(hit.point),true)
})
