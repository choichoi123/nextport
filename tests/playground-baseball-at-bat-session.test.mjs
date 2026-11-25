import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BASEBALL_AT_BAT_SESSION_VERSION, createBaseballAtBatSession, applyBaseballAtBatSessionCommand,
  publicBaseballAtBatSession, validateBaseballAtBatSession,
} from '../lib/playground-baseball-at-bat-session.mjs'
import { BASEBALL_RULES, judgeBaseballSwing, judgeBaseballTake } from '../lib/playground-baseball.mjs'

const uuid = n => `10000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`
const now = '2026-11-24T00:00:00.000Z'
const versions = Object.fromEntries(['engineHash','rulesHash','atBatHash','fieldHash','sessionHash'].map((key,index) => [key,(index+1).toString().repeat(64)]))
const config = {handedness:'right',pitcherHandedness:'left',baseSpeedKmh:120,pitchMode:'mixed'}
const fresh = options => createBaseballAtBatSession({id:uuid(1),seed:42,config,versions,now,...options})
const copy = value => JSON.parse(JSON.stringify(value))
const command = (session,type,extra={},options={}) => applyBaseballAtBatSessionCommand(session,{
  commandId:uuid(1000+session.revision),expectedRevision:session.revision,type,...extra,
},{now,attemptId:uuid(10000+session.revision),...options})
const issued = session => command(session,'issue')
const targeted = (session,type,extra={}) => command(session,type,{pitchId:session.pending.pitchId,attemptId:session.pending.attemptId,...extra})
const accepted = (session,input) => targeted(session,'accept-input',{input})
const resolved = session => targeted(session,'resolve')
const taken = session => resolved(accepted(issued(session),{kind:'take'}))
const whiff = session => {
  session=issued(session)
  return resolved(accepted(session,{kind:'swing',swingAtMs:-BASEBALL_RULES.windupMs,aim:{x:0,y:.75},source:'keyboard',surface:'field'}))
}
const errorCode = (fn,code) => assert.throws(fn,error => error.code === code)

test('개발 타석 체크포인트는 별도 버전·고정 조건·revision1이며 불변이다', () => {
  const state=fresh()
  assert.equal(BASEBALL_AT_BAT_SESSION_VERSION,'baseball-at-bat-session-v1')
  assert.equal(state.revision,1)
  assert.equal(state.source,'manual')
  assert.deepEqual(state.config,config)
  assert.equal(state.versions.fieldModelId,'baseball-field-v1')
  assert.equal(state.versions.pitchPolicyId,'baseball-at-bat-pitches-v1')
  assert.equal(state.pending,null)
  assert.equal(state.finalReceipt,null)
  assert.equal(validateBaseballAtBatSession(copy(state)),true)
  assert.ok(Object.isFrozen(state) && Object.isFrozen(state.state.stats))
  assert.throws(()=>{state.state.balls=4},TypeError)
})

test('개인 정보·알 수 없는 설정·잘못된 시간/버전/seed는 시작 계약에서 거절한다', () => {
  for (const options of [
    {id:'not-a-uuid'},{seed:-1},{seed:undefined},{now:'2026-11-24'},{source:'automatic'},
    {config:{...config,name:'private name'}},{config:{...config,pitcherHandedness:'random'}},
    {config:{...config,baseSpeedKmh:NaN}},{versions:{...versions,fieldHash:'unknown'}},
    {versions:{...versions,token:'hidden'}},{versions:{...versions,sessionId:'other'}},
  ]) assert.throws(()=>fresh(options))
})

test('발급·재시도는 같은 논리 공과 조건이며 시도ID만 바꾸고 카운트를 보존한다', () => {
  const first=issued(fresh())
  const paused=targeted(first,'pause',{reason:'visibility'})
  const next=issued(paused)
  assert.equal(next.pending.pitchId,first.pending.pitchId)
  assert.deepEqual(next.pending.pitch,first.pending.pitch)
  assert.notEqual(next.pending.attemptId,first.pending.attemptId)
  assert.equal(next.pending.attemptNumber,2)
  assert.equal(next.attempts[0].status,'superseded')
  assert.equal(next.attempts[0].pauseReason,'visibility')
  assert.deepEqual(next.state,first.state)
  errorCode(()=>targeted({...next,pending:next.pending},'accept-input',{attemptId:first.pending.attemptId,input:{kind:'take'}}),'conflict')
})

test('새로고침 직전 발급 상태도 새 시도로 같은 공을 준비하고 중복 투구를 세지 않는다', () => {
  const first=issued(fresh()), resumed=issued(copy(first))
  assert.equal(resumed.pending.pitchId,first.pending.pitchId)
  assert.equal(resumed.state.pitchCount,0)
  assert.equal(resumed.pending.attemptNumber,2)
})

test('서버 CAS revision과 공/시도ID가 낡은 다른 탭 입력을 차단한다', () => {
  const first=issued(fresh())
  const other=targeted(first,'pause',{reason:'focus'})
  errorCode(()=>applyBaseballAtBatSessionCommand(other,{
    commandId:uuid(88),expectedRevision:first.revision,type:'accept-input',pitchId:first.pending.pitchId,
    attemptId:first.pending.attemptId,input:{kind:'take'},
  },{now}),'conflict')
  errorCode(()=>targeted(first,'accept-input',{pitchId:'another-pitch',input:{kind:'take'}}),'conflict')
  errorCode(()=>command(fresh(),'resolve',{pitchId:'none',attemptId:uuid(9)}),'missing-pitch')
})

test('입력 전 중단 상태는 새로운 입력을 받지 않고 같은 공 준비를 먼저 요구한다', () => {
  const paused=targeted(issued(fresh()),'pause',{reason:'manual'})
  errorCode(()=>accepted(paused,{kind:'take'}),'paused')
  errorCode(()=>resolved(paused),'input-required')
  assert.equal(paused.state.pitchCount,0)
})

test('입력은 공당 한 번 저장하고 중단·복구 뒤 바꾸거나 다시 칠 수 없다', () => {
  const input={kind:'swing',swingAtMs:-300,aim:{x:0,y:.75},source:'pointer',surface:'field'}
  const initial=accepted(issued(fresh()),input)
  assert.deepEqual(initial.pending.input,input)
  assert.equal(initial.state.pitchCount,0)
  const paused=targeted(initial,'pause',{reason:'reload'})
  assert.deepEqual(paused.pending.input,input)
  errorCode(()=>issued(paused),'input-already-accepted')
  errorCode(()=>accepted(paused,{kind:'take'}),'input-already-accepted')
  const result=resolved(copy(paused))
  assert.equal(result.state.pitchCount,1)
  assert.equal(result.state.history[0].result.outcome,'miss')
  assert.equal(result.attempts[0].status,'resolved')
  assert.equal(result.pending,null)
})

test('accept-input 응답에는 계산 결과/최종 영수증이 없고 resolve에서만 판정한다', () => {
  const session=issued(fresh()), pitch=session.pending.pitch
  const input={kind:'swing',swingAtMs:pitch.flightTimeMs-110,aim:pitch.target,source:'keyboard',surface:'focus'}
  const pending=accepted(session,input), view=publicBaseballAtBatSession(pending)
  assert.equal(view.state.history.length,0)
  assert.equal(view.state.pitchCount,0)
  assert.equal(view.pending.status,'input-accepted')
  assert.equal(view.finalReceipt,null)
  assert.equal(Object.hasOwn(view.pending,'result'),false)
  assert.equal(Object.hasOwn(view.pending,'fieldResult'),false)
  const result=resolved(pending)
  assert.deepEqual(result.state.history[0].result,judgeBaseballSwing(pitch,{swingAtMs:input.swingAtMs,aim:input.aim,handedness:config.handedness}))
})

test('준비 중 즉시 스윙·늦은 스윙·좌우 조준의 기존 경계를 유지하고 잘못된 입력을 거절한다', () => {
  const session=issued(fresh()), pitch=session.pending.pitch
  for (const input of [
    {kind:'swing',swingAtMs:-1200.01,aim:{x:0,y:.7}},
    {kind:'swing',swingAtMs:pitch.flightTimeMs+221,aim:{x:0,y:.7}},
    {kind:'swing',swingAtMs:NaN,aim:{x:0,y:.7}},
    {kind:'swing',swingAtMs:100,aim:{x:3,y:.7}},
    {kind:'swing',swingAtMs:100,aim:{x:0,y:3}},
    {kind:'swing',swingAtMs:100,aim:{x:0,y:.7},ua:'private'},
    {kind:'swing',swingAtMs:100,aim:{x:0,y:.7},source:'private string'},
    {kind:'swing',swingAtMs:100,aim:{x:0,y:.7},code:'Space'},
    {kind:'take',ip:'private'},
  ]) errorCode(()=>accepted(session,input),'invalid')
  assert.equal(resolved(accepted(session,{kind:'swing',swingAtMs:-1200,aim:{x:0,y:.7}})).state.history[0].result.outcome,'miss')
  assert.equal(resolved(accepted(session,{kind:'swing',swingAtMs:pitch.flightTimeMs+220,aim:{x:0,y:.7}})).state.history[0].result.outcome,'miss')
})

test('세 번의 헛스윙은 서버 재계산·한 번의 PA/AB/SO 영수증으로 끝난다', () => {
  let session=fresh({source:'development'})
  for(let i=0;i<3;i++) session=whiff(session)
  assert.equal(session.state.outcome,'strikeout-swinging')
  assert.equal(session.state.pitchCount,3)
  assert.deepEqual(session.state.stats,{PA:1,AB:1,H:0,'2B':0,'3B':0,HR:0,BB:0,SO:1})
  assert.equal(session.finalReceipt.id,`${session.id}:final`)
  assert.equal(session.finalReceipt.revision,session.revision)
  assert.deepEqual(session.finalReceipt.stats,session.state.stats)
  assert.ok(session.state.history.every(row=>row.source==='development'))
  errorCode(()=>issued(session),'complete')
  errorCode(()=>command(session,'resolve',{pitchId:session.state.history.at(-1).pitchId,attemptId:session.attempts.at(-1).id}),'complete')
})

test('실제 지켜본 공으로 볼넷·루킹 삼진이 끝나며 볼넷을 AB에 더하지 않는다', () => {
  const results=new Map()
  for(let seed=0;seed<64 && results.size<2;seed++) {
    let session=fresh({seed})
    for(let i=0;i<6 && session.state.status==='active';i++) session=taken(session)
    if(session.state.status==='complete') results.set(session.state.outcome,session)
  }
  assert.ok(results.has('walk') && results.has('strikeout-looking'))
  assert.equal(results.get('walk').state.stats.AB,0)
  assert.equal(results.get('walk').state.stats.BB,1)
  assert.equal(results.get('strikeout-looking').state.stats.SO,1)
})

function foulInput(pitch) {
  for(const elapsed of [0,10,20,30,40,170,180,190,200,210]) for(const dx of [-.28,-.20,.20,.28]) for(const dy of [-.03,0,.03]) {
    const input={kind:'swing',swingAtMs:pitch.flightTimeMs-elapsed,aim:{x:pitch.target.x+dx,y:pitch.target.y+dy},source:'button',surface:'field'}
    if(judgeBaseballSwing(pitch,{...input,handedness:config.handedness}).outcome==='foul') return input
  }
  throw new Error('No foul fixture was found for this issued pitch.')
}

test('2S 뒤 실제 파울150개도 강제 종료 없이 보존하고 public은 최근20개만 내보낸다', () => {
  let session=whiff(whiff(fresh()))
  for(let i=0;i<150;i++) {
    session=issued(session)
    session=resolved(accepted(session,foulInput(session.pending.pitch)))
  }
  assert.equal(session.state.status,'active')
  assert.equal(session.state.strikes,2)
  assert.equal(session.state.pitchCount,152)
  assert.equal(session.state.history.length,152)
  assert.equal(session.attempts.length,152)
  assert.equal(session.finalReceipt,null)
  const view=publicBaseballAtBatSession(session)
  assert.equal(view.state.pitchCount,152)
  assert.equal(view.state.history.length,20)
  assert.equal(view.state.history[0].number,133)
})

test('페어 접촉을 실제 필드 모델로 처리하고 일회성 최종 성적/근거를 보존한다', () => {
  const state=issued(fresh()), pitch=state.pending.pitch
  const input={kind:'swing',swingAtMs:pitch.flightTimeMs-110,aim:pitch.target}
  const session=resolved(accepted(state,input)), row=session.state.history[0]
  assert.ok(['contact','perfect'].includes(row.result.outcome))
  assert.equal(row.fieldResult.modelVersion,'baseball-field-v1')
  assert.equal(session.state.outcome,row.fieldResult.outcome)
  assert.equal(session.finalReceipt.stats.PA,1)
  assert.equal(session.finalReceipt.stats.AB,1)
  assert.equal(session.finalReceipt.stats.H,Number(row.fieldResult.isHit))
})

test('공개 응답은 현재 물리/확정 이력만 제공하며 masterseed·현재seed/id·시도 ledger를 숨긴다', () => {
  let session=issued(fresh())
  const view=publicBaseballAtBatSession(session)
  assert.equal(Object.hasOwn(view,'attempts'),false)
  assert.equal(Object.hasOwn(view.state,'seed'),false)
  assert.equal(Object.hasOwn(view.pending.pitch,'seed'),false)
  assert.equal(Object.hasOwn(view.pending.pitch,'id'),false)
  assert.deepEqual(view.pending.pitch.target,session.pending.pitch.target)
  assert.deepEqual(judgeBaseballTake(view.pending.pitch),judgeBaseballTake(session.pending.pitch))
  session=resolved(accepted(session,{kind:'take'}))
  const history=publicBaseballAtBatSession(session).state.history
  assert.equal(Object.hasOwn(history[0].pitch,'seed'),false)
  assert.equal(Object.hasOwn(history[0].pitch,'id'),false)
  assert.equal(publicBaseballAtBatSession(session).trust,'server-recalculated-input-unverified')
})

test('같은 입력이어도 다른 엔진/타석/필드 버전을 기존 승부에 섞지 않는다', () => {
  const session=issued(fresh())
  for(const key of Object.keys(versions)) {
    errorCode(()=>command(session,'pause',{pitchId:session.pending.pitchId,attemptId:session.pending.attemptId},{versions:{...versions,[key]:'f'.repeat(64)}}),'version-mismatch')
  }
  assert.equal(targeted(session,'pause',{reason:'menu'}).state.pitchCount,0)
})

test('손상된 체크포인트·알 수 없는 명령/추가 결과·시계 역행을 명시적으로 거절한다', () => {
  const session=issued(fresh())
  for(const mutate of [value=>{value.revision=0},value=>{value.source='other'},value=>{value.config.name='private'},
    value=>{value.pending.pitch.target.x+=.1},value=>{value.pending.attemptId=uuid(999)},
    value=>{value.state.strikes=3},value=>{value.finalReceipt={stats:{PA:1}}},value=>{value.attempts.push(copy(value.attempts[0]))}]) {
    const value=copy(session);mutate(value);assert.throws(()=>validateBaseballAtBatSession(value))
  }
  errorCode(()=>command(session,'delete'),'invalid')
  errorCode(()=>command(session,'pause',{pitchId:session.pending.pitchId,attemptId:session.pending.attemptId,result:{outcome:'home-run'}}),'invalid')
  errorCode(()=>command(session,'pause',{pitchId:session.pending.pitchId,attemptId:session.pending.attemptId},{now:'2026-11-23T00:00:00.000Z'}),'invalid')
})
