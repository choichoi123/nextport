import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaseballDataCollector, createBaseballLocalId, validateBaseballDataSnapshot, BASEBALL_DATA_LIMITS } from '../lib/playground-baseball-data.mjs'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, createBaseballPitch, getBaseballPitchSpeed, judgeBaseballSwing, judgeBaseballTake } from '../lib/playground-baseball.mjs'
import { createBaseballDataVersions } from '../lib/server/baseball-version.mjs'

const clone=value=>JSON.parse(JSON.stringify(value))
const environment={viewportBucket:'wide',orientation:'landscape',focusEnabled:false,locale:'ko'}
const initialAim={x:0,y:(BASEBALL_RULES.zone.bottom+BASEBALL_RULES.zone.top)/2}
const input={source:'keyboard',surface:'field',pointerType:null,code:'Space'}
const versions=()=>({schemaVersion:1,engine:{algorithm:'sha256',hash:'a'.repeat(64),files:[{path:'lib/playground-baseball.mjs',hash:'b'.repeat(64)}]},rules:{id:'baseball-fixed-center-8cm-v2',hash:'c'.repeat(64),snapshot:{rules:clone(BASEBALL_RULES),pitchTypes:clone(BASEBALL_PITCH_TYPES)}},presentation:{hash:'d'.repeat(64),files:[{path:'components/playground/baseball-scene.js',hash:'e'.repeat(64)}]}})
function setup(override={}) {
  let id=0, now=Date.UTC(2026,10,24,6)
  const collector=createBaseballDataCollector({versions:versions(),idFactory:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`,wallNow:()=>now++,...override})
  const begin=(options={})=>collector.startSession({handedness:'right',mode:'practice',environment,...options})
  const pitch=(options={})=>createBaseballPitch({seed:12,speedKmh:120,target:initialAim,...options})
  const start=(next=pitch(),options={})=>collector.startAttempt({pitch:next,pitchNumber:1,baseSpeedKmh:120,firstCenterPitch:true,environment,...options})
  return {collector,begin,pitch,start}
}
const current=collector=>collector.snapshot().sessions.at(-1)
const attempt=collector=>current(collector).attempts.at(-1)
function expectValid(collector) {assert.deepEqual(validateBaseballDataSnapshot(collector.snapshot()),{valid:true,errors:[]})}

test('빈 수집기는 서버 검증/영구 저장을 주장하지 않는 유효한 메모리 계약이다',()=>{
  const {collector}=setup()
  assert.deepEqual(collector.snapshot(),{schemaVersion:1,storage:'memory',trust:'local-unverified',sessions:[]})
  assert.deepEqual(collector.status(),{state:'ready',reason:null})
  expectValid(collector)
})

test('실제 서버 버전 helper의 공개 manifest와 공통 수집 계약이 맞는다',async()=>{
  const manifest=await createBaseballDataVersions()
  const {collector,begin,start,pitch}=setup({versions:manifest});assert.ok(begin())
  const next=pitch();assert.ok(start(next));assert.equal(collector.completeAttempt({result:judgeBaseballTake(next)}),true)
  assert.equal(current(collector).versions.rules.snapshot.rules.ballRadiusM,.04)
  expectValid(collector)
})

test('구20ms·신0ms 규칙의 보관 원본을 구분하고 규칙 이름과 시작시간 혼합을 거부한다',()=>{
  for(const [id,startMs] of [['baseball-fixed-center-8cm-v1',20],['baseball-fixed-center-8cm-v2',0]]) {
    const manifest=versions();manifest.rules.id=id;manifest.rules.snapshot.rules.batActiveStartMs=startMs
    const {collector,begin,start,pitch}=setup({versions:manifest});assert.ok(begin());const next=pitch();assert.ok(start(next))
    assert.equal(collector.completeAttempt({result:judgeBaseballTake(next)}),true)
    expectValid(collector)
    const copy=collector.snapshot();copy.sessions[0].versions.rules.snapshot.rules.batActiveStartMs=startMs===0?20:0
    assert.equal(validateBaseballDataSnapshot(copy).valid,false)
    const unknown=collector.snapshot();unknown.sessions[0].versions.rules.id='baseball-fixed-center-8cm-v999'
    assert.equal(validateBaseballDataSnapshot(unknown).valid,false)
  }
})

test('초반8.85ms 파울의 입력·새 규칙·결과를 반올림하거나 구버전으로 바꾸지 않는다',()=>{
  const {collector,begin,start}=setup();begin()
  const next=createBaseballPitch({speedKmh:140,seed:566508935,target:initialAim,pitcherHandedness:'right'})
  start(next,{baseSpeedKmh:140})
  const swingAtMs=436.7999999523163,aim={x:.08221664827820159,y:.7853936604407757}
  assert.equal(collector.recordSwing({swingAtMs,aim,input:{source:'pointer',surface:'field',pointerType:'mouse'}}),true)
  const result=judgeBaseballSwing(next,{swingAtMs,aim,handedness:'right'})
  assert.equal(collector.completeAttempt({result}),true)
  assert.equal(attempt(collector).result.outcome,'foul')
  assert.equal(attempt(collector).result.score,10)
  assert.equal(attempt(collector).swingAtMs,swingAtMs)
  assert.deepEqual(attempt(collector).aim,aim)
  assert.equal(current(collector).versions.rules.id,'baseball-fixed-center-8cm-v2')
  assert.equal(current(collector).versions.rules.snapshot.rules.batActiveStartMs,0)
  expectValid(collector)
})

test('세션과 한 공의 투구 원본은 명시적 목표·실제/기준 구속·시도 ID를 분리한다',()=>{
  const {collector,begin,start,pitch}=setup()
  const sessionId=begin(), next=pitch({pitchType:'curveball',speedKmh:90}), attemptId=start(next)
  assert.notEqual(sessionId,attemptId)
  const row=attempt(collector)
  assert.equal(row.baseSpeedKmh,120);assert.equal(row.pitch.speedKmh,90)
  assert.equal(row.pitch.type,'curveball');assert.equal(row.pitch.seed,12)
  assert.deepEqual(row.pitch.target,initialAim)
  assert.deepEqual(row.pitch.release,next.release)
  assert.deepEqual(row.pitch.velocity,next.velocity)
  assert.deepEqual(row.pitch.acceleration,next.acceleration)
  assert.equal(Object.hasOwn(row.pitch,'id'),false)
  assert.equal(row.state,'started');assert.equal(row.swingAtMs,null);assert.equal(row.input,null)
  expectValid(collector)
})

test('준비 중 음수 릴리스 기준 입력도 반올림 없이 한 번만 남긴다',()=>{
  const {collector,begin,start,pitch}=setup();begin();const next=pitch();start(next)
  const swingAtMs=-324.123456789, aim={x:.0123456789,y:.723456789}
  assert.equal(collector.recordSwing({swingAtMs,aim,input}),true)
  assert.equal(collector.recordSwing({swingAtMs:100,aim:initialAim,input}),false)
  assert.equal(attempt(collector).swingAtMs,swingAtMs)
  assert.deepEqual(attempt(collector).aim,aim)
  assert.equal(collector.completeAttempt({result:judgeBaseballSwing(next,{swingAtMs,aim,handedness:'right'})}),true)
  assert.equal(attempt(collector).result.missReason,'outside-window')
  assert.equal(collector.completeAttempt({result:judgeBaseballTake(next)}),false)
  expectValid(collector)
})

test('무스윙 완료는 0ms 입력이나 헛스윙을 만들지 않는다',()=>{
  const {collector,begin,start,pitch}=setup();begin();const next=pitch();start(next)
  assert.equal(collector.completeAttempt({result:judgeBaseballTake(next)}),true)
  const row=attempt(collector)
  assert.equal(row.state,'completed');assert.equal(row.swingAtMs,null);assert.equal(row.aim,null);assert.equal(row.input,null)
  assert.equal(row.result.outcome,'called-strike');assert.equal(row.result.timingErrorMs,null)
  expectValid(collector)
})

test('공통 입력 계약은 메인/확대 포인터·키보드·보조 스윙 버튼을 각각 보존한다',()=>{
  const inputs=[
    {source:'pointer',surface:'field',pointerType:'mouse',code:null},
    {source:'pointer',surface:'focus',pointerType:'touch',code:null},
    {source:'pointer',surface:'field',pointerType:'pen',code:null},
    {source:'keyboard',surface:'focus',pointerType:null,code:'Space'},
    {source:'button',surface:'focus',pointerType:null,code:null},
  ]
  for (const captured of inputs) {
    const {collector,begin,start,pitch}=setup();begin();const next=pitch();start(next)
    const swingAtMs=next.flightTimeMs-BASEBALL_RULES.swingContactMs
    assert.equal(collector.recordSwing({swingAtMs,aim:initialAim,input:captured}),true)
    assert.equal(collector.completeAttempt({result:judgeBaseballSwing(next,{swingAtMs,aim:initialAim})}),true)
    assert.deepEqual(attempt(collector).input,captured)
    assert.equal(attempt(collector).result.outcome,'perfect')
    expectValid(collector)
  }
})

test('4구종·좌우투·양타의 실제 엔진 정타/접촉/파울/헛스윙/무스윙 결과를 축약 없이 받는다',()=>{
  const cases=[
    {outcome:'perfect',elapsed:110},{outcome:'contact',elapsed:140},{outcome:'foul',elapsed:180},
    {outcome:'miss',elapsed:500},{outcome:'miss',elapsed:110,aim:{x:1.5,y:initialAim.y}},
    {outcome:'called-strike',take:true},{outcome:'ball',take:true,target:{x:.28,y:initialAim.y}},
  ]
  for(const profile of BASEBALL_PITCH_TYPES) for(const pitcherHandedness of ['right','left']) for(const handedness of ['right','left']) for(const sample of cases){
    const {collector,begin,start,pitch}=setup();begin({handedness})
    if(sample.target){const center=pitch();start(center);collector.completeAttempt({result:judgeBaseballTake(center)})}
    const next=pitch({pitchType:profile.id,speedKmh:getBaseballPitchSpeed(120,profile.id),pitcherHandedness,target:sample.target||initialAim})
    assert.ok(start(next,{pitchNumber:sample.target?2:1,firstCenterPitch:!sample.target}))
    let result
    if(sample.take) result=judgeBaseballTake(next)
    else {
      const aim=sample.aim||initialAim, swingAtMs=next.flightTimeMs-sample.elapsed
      assert.equal(collector.recordSwing({swingAtMs,aim,input}),true)
      result=judgeBaseballSwing(next,{swingAtMs,aim,handedness})
    }
    assert.equal(result.outcome,sample.outcome)
    assert.equal(collector.completeAttempt({result}),true)
    assert.deepEqual(attempt(collector).result,result)
    expectValid(collector)
  }
})

test('중단 사유와 경과 시간은 결과 없이 남고 같은 구 번호 재시도는 새 시도다',()=>{
  const reasons=['manual','blur','hidden','menu','route-change','escape','tab','focus-change','focus-leave','player-change','restart','unmount','version-change']
  for(const reason of reasons){
    const {collector,begin,start,pitch}=setup();begin();const next=pitch(), first=start(next)
    assert.equal(collector.abortAttempt({reason,elapsedMs:549.5}),true)
    assert.equal(attempt(collector).result,null);assert.equal(attempt(collector).state,'aborted')
    assert.equal(attempt(collector).abortReason,reason);assert.equal(attempt(collector).elapsedMs,549.5)
    assert.equal(collector.abortAttempt({reason}),false)
    const retry=start(next)
    assert.notEqual(retry,first);assert.equal(attempt(collector).attemptNumber,2);assert.equal(attempt(collector).pitchNumber,1)
    expectValid(collector)
  }
})

test('세션 종료는 진행 공을 중단으로 보존하고 새 세션은 기존 버전을 덮지 않는다',()=>{
  const firstVersions=versions(), {collector,begin,start}=setup({versions:firstVersions})
  begin();start();assert.equal(collector.endSession({reason:'version-change'}),true)
  const secondVersions=versions();secondVersions.engine.hash='f'.repeat(64)
  assert.ok(begin({versions:secondVersions,handedness:'left',environment:{...environment,locale:'en'}}))
  const sessions=collector.snapshot().sessions
  assert.equal(sessions[0].attempts[0].abortReason,'version-change')
  assert.equal(sessions[0].versions.engine.hash,'a'.repeat(64))
  assert.equal(sessions[1].versions.engine.hash,'f'.repeat(64))
  assert.equal(sessions[1].handedness,'left')
  assert.equal(sessions[1].environment.locale,'en')
  expectValid(collector)
})

test('동시에 세션·공을 덮거나 완료 전 세션을 완주로 닫을 수 없다',()=>{
  const {collector,begin,start}=setup();const session=begin(), first=start()
  assert.equal(begin(),null);assert.equal(start(),null);assert.equal(collector.endSession({reason:'complete'}),false)
  assert.equal(current(collector).sessionId,session);assert.equal(attempt(collector).attemptId,first)
  assert.equal(attempt(collector).state,'started')
  assert.equal(collector.endSession({reason:'restart'}),true)
  assert.equal(collector.endSession({reason:'restart'}),false)
  expectValid(collector)
})

test('완료10구는 순번대로 보존하고 11번째 결과를 만들지 않는다',()=>{
  const {collector,begin,start,pitch}=setup();begin()
  for(let number=1;number<=10;number++){
    const next=pitch({seed:100+number,target:number===1?initialAim:{x:.1,y:.7}})
    assert.ok(start(next,{pitchNumber:number,firstCenterPitch:number===1}))
    assert.equal(collector.completeAttempt({result:judgeBaseballTake(next)}),true)
  }
  assert.equal(start(pitch(),{pitchNumber:11,firstCenterPitch:false}),null)
  assert.equal(collector.endSession({reason:'complete'}),true)
  assert.equal(current(collector).attempts.length,10)
  expectValid(collector)
})

test('100개 시도와5개 세션의 한도는 명시하고 저장한 행이나 진행 세션을 삭제하지 않는다',()=>{
  const {collector,begin,start}=setup();begin()
  for(let index=0;index<BASEBALL_DATA_LIMITS.attemptsPerSession;index++) {assert.ok(start());collector.abortAttempt({reason:'manual'})}
  const before=collector.snapshot()
  assert.equal(start(),null);assert.deepEqual(collector.status(),{state:'capacity',reason:'attempt-capacity'})
  assert.deepEqual(collector.snapshot(),before)
  collector.endSession({reason:'restart'})
  for(let count=1;count<BASEBALL_DATA_LIMITS.sessions;count++){assert.ok(begin());assert.equal(collector.endSession({reason:'restart'}),true)}
  const all=collector.snapshot()
  assert.equal(begin(),null);assert.deepEqual(collector.status(),{state:'capacity',reason:'session-capacity'})
  assert.deepEqual(collector.snapshot(),all)
  expectValid(collector)
})

test('허용하지 않은 프로필·IP·UA·화면px·원본 문자열을 수집하지 않는다',()=>{
  const secret='SHOULD_NOT_BE_COLLECTED', extra={name:secret,teamId:secret,jerseyNumber:secret,ip:secret,userAgent:secret,url:secret}
  const {collector,begin,start,pitch}=setup();begin({...extra,environment:{...environment,...extra}})
  const next={...pitch(),...extra,target:{...initialAim,...extra}}
  start(next,{...extra,environment:{...environment,...extra}})
  const swingAtMs=next.flightTimeMs-110
  assert.equal(collector.recordSwing({...extra,swingAtMs,aim:{...initialAim,...extra},input:{...input,...extra,x:333,y:444,point:{...initialAim}}}),true)
  assert.equal(collector.completeAttempt({result:{...judgeBaseballSwing(next,{swingAtMs,aim:initialAim}),...extra}}),true)
  assert.equal(JSON.stringify(collector.snapshot()).includes(secret),false)
  assert.equal(Object.hasOwn(attempt(collector).input,'x'),false)
  expectValid(collector)
})

test('원본·snapshot을 바꿔도 이미 수집한 투구/입력/규칙/결과는 변하지 않는다',()=>{
  const originalVersions=versions(), {collector,begin,start,pitch}=setup({versions:originalVersions})
  const env={...environment};begin({environment:env});const next=clone(pitch());start(next)
  const aim={...initialAim}, metadata={...input}, swingAtMs=next.flightTimeMs-110
  collector.recordSwing({swingAtMs,aim,input:metadata})
  const result=clone(judgeBaseballSwing(next,{swingAtMs,aim}));collector.completeAttempt({result})
  const before=collector.snapshot()
  originalVersions.rules.snapshot.rules.ballRadiusM=99;next.target.x=55;aim.x=88;metadata.source='private';result.score=0;env.locale='en'
  const exported=collector.snapshot();exported.sessions[0].attempts[0].result.score=999
  assert.deepEqual(collector.snapshot(),before)
  expectValid(collector)
})

test('알 수 없는 필드·가짜 서버 신뢰·단위/유한성·스윙/무스윙 모순을 validator가 거부한다',()=>{
  const {collector,begin,start,pitch}=setup();begin();const next=pitch();start(next);collector.completeAttempt({result:judgeBaseballTake(next)})
  const changes=[
    row=>{row.trust='server-verified'},row=>{row.ip='private'},
    row=>{row.sessions[0].versions.engine.hash='not-a-hash'},
    row=>{row.sessions[0].versions.rules.snapshot.rules.ballRadiusM=4},
    row=>{row.sessions[0].attempts[0].pitch.flightTimeMs='0.5s'},
    row=>{row.sessions[0].attempts[0].pitch.velocity.x=Infinity},
    row=>{row.sessions[0].attempts[0].swingAtMs=0},
    row=>{row.sessions[0].attempts[0].result.outcome='miss'},
    row=>{row.sessions[0].attempts[0].pitchNumber=2},
    row=>{row.sessions[0].attempts[0].attemptId=row.sessions[0].sessionId},
    row=>{row.sessions[0].attempts[0].environment.deviceModel='private'},
    row=>{row.sessions[0].attempts[0].pitch.target.x=.1},
    row=>{row.sessions[0].attempts[0].startedAt='2026-11-23T00:00:00.000Z'},
    row=>{row.sessions[0].attempts[0].elapsedMs=-1},
  ]
  for(const change of changes){const copy=collector.snapshot();change(copy);assert.equal(validateBaseballDataSnapshot(copy).valid,false)}
  expectValid(collector)
})

test('아직 정의하지 않은 육성 모드와 중단 원문은 수집 계약으로 받지 않는다',()=>{
  const {collector,begin,start}=setup()
  assert.equal(begin({mode:'growth'}),null)
  assert.ok(begin());assert.ok(start())
  const before=collector.snapshot()
  assert.equal(collector.abortAttempt({reason:'private free-form text'}),false)
  assert.deepEqual(collector.snapshot(),before)
  assert.equal(collector.abortAttempt({reason:'manual',elapsedMs:-1}),false)
  assert.deepEqual(collector.snapshot(),before)
  expectValid(collector)
})

test('잘못된 입력/결과는 현재 행을 부분 수정하지 않고 다음 정상 이벤트를 받을 수 있다',()=>{
  const {collector,begin,start,pitch}=setup();begin();const next=pitch();start(next)
  const before=collector.snapshot()
  assert.equal(collector.recordSwing({swingAtMs:10,aim:{x:200,y:300},input}),false)
  assert.deepEqual(collector.snapshot(),before)
  assert.equal(collector.completeAttempt({result:{outcome:'perfect',score:100}}),false)
  assert.deepEqual(collector.snapshot(),before)
  assert.equal(collector.completeAttempt({result:judgeBaseballTake(next)}),true)
  assert.deepEqual(collector.status(),{state:'ready',reason:null})
  expectValid(collector)
})

test('버전 누락·잘못된 ID·시계 실패는 게임에 예외를 던지지 않는다',()=>{
  const {collector,begin}=setup({versions:null})
  assert.deepEqual(collector.status(),{state:'unavailable',reason:'invalid-versions'})
  assert.equal(begin(),null)
  assert.ok(begin({versions:versions()}))
  for(const override of [{idFactory:()=>null},{idFactory:()=>{throw new Error('private')}},{wallNow:()=>Infinity}]){
    const broken=setup(override)
    assert.doesNotThrow(()=>assert.equal(broken.begin(),null))
    assert.equal(broken.collector.status().state,'unavailable')
    assert.equal(broken.collector.snapshot().sessions.length,0)
  }
  const duplicate=setup({idFactory:()=> '00000000-0000-4000-8000-000000000001'});duplicate.begin()
  assert.equal(duplicate.start(),null)
  expectValid(duplicate.collector)
})

test('로컬 UUID는 안전한 브라우저 난수만 사용하고 지원되지 않으면 명시적으로 실패한다',()=>{
  const direct='00000000-0000-4000-8000-000000000001'
  assert.equal(createBaseballLocalId({randomUUID:()=>direct}),direct)
  assert.equal(createBaseballLocalId({getRandomValues:bytes=>bytes.fill(255)}),'ffffffff-ffff-4fff-bfff-ffffffffffff')
  assert.equal(createBaseballLocalId({}),null)
  assert.equal(createBaseballLocalId({randomUUID:()=>{throw new Error('blocked')}}),null)
})
