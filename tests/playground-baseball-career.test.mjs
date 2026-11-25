import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BASEBALL_CAREER_RULES,createBaseballCareerSave,validateBaseballCareerSave,publicBaseballCareerSave,
  createBaseballCareerManualAtBat,simulateBaseballCareerAtBat,validateBaseballCareerAutomaticAtBat,
  applyBaseballCareerCommand,advanceBaseballCareerAtBat,
} from '../lib/playground-baseball-career.mjs'
import { applyBaseballAtBatSessionCommand } from '../lib/playground-baseball-at-bat-session.mjs'
import { BASEBALL_RULES } from '../lib/playground-baseball.mjs'

const uuid=n=>`20000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`
const now='2026-11-24T00:00:00.000Z'
const profile={name:'새싹',jerseyNumber:'07',teamId:'wiz',handedness:'left'}
const hashes=Object.fromEntries(['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','careerHash'].map((key,i)=>[key,(i+1).toString().repeat(64)]))
const fresh=options=>createBaseballCareerSave({id:uuid(1),seed:42,profile,versions:hashes,now,...options})
const copy=value=>JSON.parse(JSON.stringify(value))
const apply=(save,type,extra={},options={})=>applyBaseballCareerCommand(save,{commandId:uuid(1000+save.revision),expectedRevision:save.revision,type,...extra},{now,...options})
const prepare=(save,choice='power')=>apply(save,'prepare',{choice})
const automatic=(save,id=uuid(2000+save.revision),seed=42)=>{
  const atBat=simulateBaseballCareerAtBat(save,{id,seed,now})
  return {save:apply(save,'simulate-at-bat',{}, {atBat}),atBat}
}
const errorCode=(work,code)=>assert.throws(work,error=>error.code===code)
function manualStart(save,id=uuid(3000+save.revision),seed=42){
  const atBat=createBaseballCareerManualAtBat(save,{id,seed,now})
  return {save:apply(save,'start-manual',{}, {atBat}),atBat}
}
function manualCommand(pair,type,extra={}){
  const {save,atBat}=pair
  const command={commandId:uuid(5000+atBat.revision),expectedRevision:atBat.revision,type,
    ...(type==='issue'?{}:{pitchId:atBat.pending.pitchId,attemptId:atBat.pending.attemptId}),...extra}
  const next=applyBaseballAtBatSessionCommand(atBat,command,{now,attemptId:uuid(10000+atBat.revision)})
  return {save:advanceBaseballCareerAtBat(save,next,{now,expectedRevision:save.revision}),atBat:next}
}
function manualWhiffs(save){
  let pair=manualStart(save)
  for(let i=0;i<3;i++){
    pair=manualCommand(pair,'issue')
    pair=manualCommand(pair,'accept-input',{input:{kind:'swing',swingAtMs:-1200,aim:{x:0,y:.75},source:'keyboard',surface:'field'}})
    pair=manualCommand(pair,'resolve')
  }
  return pair
}

test('선수 세이브는 등번호·팀·좌우타와3경기 가상 일정·독립 버전을 고정한다',()=>{
  const save=fresh(),view=publicBaseballCareerSave(save)
  assert.equal(save.revision,1)
  assert.deepEqual(save.profile,profile)
  assert.deepEqual(save.games.map(game=>[game.ordinal,game.day,game.status]),[[1,1,'scheduled'],[2,4,'scheduled'],[3,7,'scheduled']])
  assert.ok(save.games.every(game=>game.opponentId!==profile.teamId))
  assert.deepEqual(save.growth,BASEBALL_CAREER_RULES.initial)
  assert.equal(view.rates.AVG,null);assert.equal(view.rates.SLG,null)
  assert.equal(Object.hasOwn(view,'seed'),false)
  assert.equal(Object.hasOwn(view,'recoveryCode'),false)
  assert.equal(view.versions.careerId,'baseball-career-v1')
  assert.equal(validateBaseballCareerSave(copy(save)),true)
  assert.ok(Object.isFrozen(save.profile)&&Object.isFrozen(save.games[0]))
})

test('잘못된 선수·설정·알 수 없는 버전/개인 필드·seed를 거절한다',()=>{
  for(const options of [{id:'unknown'},{seed:-1},{source:'automatic'},{now:'today'},
    {profile:{...profile,name:''}},{profile:{...profile,name:'개인',email:'private'}},
    {profile:{...profile,jerseyNumber:'100'}},{profile:{...profile,teamId:'unknown'}},
    {settings:{baseSpeedKmh:180,pitchMode:'mixed'}},{settings:{baseSpeedKmh:120,pitchMode:'unknown'}},
    {versions:{...hashes,careerHash:'unknown'}},{versions:{...hashes,careerId:'other'}},
  ])assert.throws(()=>fresh(options))
})

test('경기 전 준비는 한 번만 선택하며 기본 성장·피로를 정확히 원장에 남긴다',()=>{
  const save=prepare(fresh(),'power')
  assert.deepEqual(save.growth,{power:42,discipline:40,stamina:40,trust:40,xp:2,condition:74})
  assert.equal(save.ledger.length,1)
  assert.equal(save.ledger[0].kind,'preparation')
  errorCode(()=>prepare(save,'rest'),'preparation-complete')
  assert.equal(save.stats.G,0);assert.equal(save.stats.PA,0)
  errorCode(()=>createBaseballCareerManualAtBat(fresh(),{id:uuid(4),seed:1,now}),'preparation-required')
  errorCode(()=>simulateBaseballCareerAtBat(fresh(),{id:uuid(4),seed:1,now}),'preparation-required')
})

test('회복은 능력/경험치를 지급하지 않고 컨디션만 상한 안에서 회복한다',()=>{
  let save=prepare(fresh(),'rest')
  assert.deepEqual(save.growth,{power:40,discipline:40,stamina:40,trust:40,xp:0,condition:95})
  save=automatic(save,uuid(4),1).save;save=automatic(save,uuid(5),2).save
  save=prepare(save,'rest')
  assert.equal(save.growth.condition,100)
  const recovery=save.ledger.at(-1)
  assert.equal(recovery.choice,'rest')
  assert.equal(recovery.deltas.condition,11)
  assert.equal(recovery.deltas.xp,0)
})

test('첫 직접 타석 진입은 G만 늘고 발급·입력·중단·재개로 PA/보상이 늘지 않는다',()=>{
  let pair=manualStart(prepare(fresh(),'discipline'))
  assert.equal(pair.save.stats.G,1);assert.equal(pair.save.stats.PA,0)
  const growth=copy(pair.save.growth),ledgerLength=pair.save.ledger.length
  pair=manualCommand(pair,'issue')
  pair=manualCommand(pair,'pause',{reason:'reload'})
  const pitchId=pair.atBat.pending.pitchId
  pair=manualCommand(pair,'issue')
  assert.equal(pair.atBat.pending.pitchId,pitchId)
  pair=manualCommand(pair,'accept-input',{input:{kind:'swing',swingAtMs:-1200,aim:{x:0,y:.75}}})
  pair=manualCommand(pair,'pause',{reason:'visibility'})
  assert.equal(pair.save.stats.PA,0)
  assert.deepEqual(pair.save.growth,growth)
  assert.equal(pair.save.ledger.length,ledgerLength)
  errorCode(()=>automatic(pair.save),'at-bat-active')
  errorCode(()=>prepare(pair.save,'rest'),'at-bat-active')
})

test('직접 삼진의 최종 영수증만 PA/AB/SO와성장을1회 반영한다',()=>{
  const pair=manualWhiffs(prepare(fresh()))
  assert.deepEqual(pair.save.stats,{G:1,PA:1,AB:1,H:0,'2B':0,'3B':0,HR:0,BB:0,SO:1})
  assert.equal(pair.save.activeAtBat,null)
  assert.equal(pair.save.games[0].appearances[0].source,'manual')
  assert.deepEqual(pair.save.growth,{power:42,discipline:40,stamina:40,trust:41,xp:5,condition:71})
  const repeated=advanceBaseballCareerAtBat(pair.save,pair.atBat,{now,expectedRevision:pair.save.revision})
  assert.equal(repeated,pair.save)
  assert.equal(repeated.ledger.length,2)
})

test('다른 타석/선수·버전·CAS와 변조된 완료 결과를 기존 성적에 섞지 않는다',()=>{
  const save=prepare(fresh()),pair=manualStart(save)
  const another=createBaseballCareerManualAtBat(save,{id:uuid(99),seed:1,now})
  errorCode(()=>advanceBaseballCareerAtBat(pair.save,another,{now,expectedRevision:pair.save.revision}),'conflict')
  errorCode(()=>applyBaseballCareerCommand(pair.save,{commandId:uuid(99),expectedRevision:1,type:'prepare',choice:'rest'},{now}),'conflict')
  const changed=copy(pair.atBat);changed.versions.engineHash='f'.repeat(64)
  errorCode(()=>advanceBaseballCareerAtBat(pair.save,changed,{now,expectedRevision:pair.save.revision}),'version-mismatch')
  const finished=manualWhiffs(save),tampered=copy(finished.atBat);tampered.state.stats.H=1
  assert.throws(()=>advanceBaseballCareerAtBat(finished.save,tampered,{now,expectedRevision:finished.save.revision}))
})

test('자동 타석은 실제 엔진 입력·구종·카운트·필드로 끝나며 source가 분리된다',()=>{
  const save=prepare(fresh()),atBat=simulateBaseballCareerAtBat(save,{id:uuid(10),seed:123,now})
  assert.equal(atBat.source,'automatic');assert.equal(atBat.origin,'manual');assert.equal(atBat.revision,1)
  assert.equal(atBat.state.status,'complete')
  assert.ok(atBat.state.history.every(row=>row.source==='automatic'))
  assert.equal(atBat.inputs.length,atBat.state.pitchCount)
  assert.equal(validateBaseballCareerAutomaticAtBat(save,copy(atBat)),true)
  assert.deepEqual(simulateBaseballCareerAtBat(save,{id:uuid(10),seed:123,now}),atBat)
  const next=apply(save,'simulate-at-bat',{}, {atBat}),view=publicBaseballCareerSave(next)
  assert.equal(view.statsBySource.manual.PA,0);assert.equal(view.statsBySource.automatic.PA,1)
  assert.equal(view.games[0].appearances[0].resultSignature.length,8)
})

test('자동 예산 초과는 가짜 삼진/보상 없이 원래 세이브를 보존한다',()=>{
  const save=prepare(fresh()),before=JSON.stringify(save)
  errorCode(()=>simulateBaseballCareerAtBat(save,{id:uuid(10),seed:123,now,pitchBudget:0}),'automatic-budget')
  assert.equal(JSON.stringify(save),before)
  assert.equal(save.stats.PA,0);assert.equal(save.ledger.length,1)
})

test('자동 입력·원본·source·슬롯·최종 성적을 변조하면 재계산 대조가 거절한다',()=>{
  const save=prepare(fresh()),raw=simulateBaseballCareerAtBat(save,{id:uuid(10),seed:12,now})
  for(const mutate of [value=>{value.inputs[0].input={kind:'take'}},value=>{value.state.stats.H=1-value.state.stats.H},
    value=>{value.source='manual'},value=>{value.origin='development'},value=>{value.slot=2},value=>{value.careerId=uuid(99)},
    value=>{value.finalReceipt.revision=2},value=>{value.inputs.push(value.inputs[0])}]){
    const value=copy(raw);mutate(value)
    // If the generated first input already was a take, use a contrasting input.
    if(JSON.stringify(value)===JSON.stringify(raw))value.inputs[0].input={kind:'swing',swingAtMs:-1200,aim:{x:0,y:.75}}
    assert.throws(()=>validateBaseballCareerAutomaticAtBat(save,value))
  }
})

test('3경기 각 직접1·자동1 완료는 총6PA/G3이고 목표·경기 보상이중복되지 않는다',()=>{
  let save=fresh()
  for(let game=0;game<3;game++){
    save=prepare(save,['power','discipline','stamina'][game])
    save=manualWhiffs(save).save
    assert.equal(save.currentGameIndex,game)
    const before=save.growth.xp
    save=automatic(save,uuid(200+game),game+123).save
    assert.equal(save.currentGameIndex,game+1)
    const objective=save.games[game].appearances.some(row=>row.stats.H||row.stats.BB)
    assert.equal(save.growth.xp-before,3+5+Number(objective))
    assert.equal(save.ledger.filter(event=>event.id===`${save.games[game].id}:game`).length,1)
    assert.equal(save.ledger.filter(event=>event.id===`${save.games[game].id}:objective`).length,Number(objective))
  }
  const view=publicBaseballCareerSave(save)
  assert.equal(save.status,'complete');assert.equal(save.currentGameIndex,3)
  assert.equal(save.stats.G,3);assert.equal(save.stats.PA,6)
  assert.equal(view.statsBySource.manual.PA,3);assert.equal(view.statsBySource.automatic.PA,3)
  assert.equal(view.feedback.includes('trial-complete'),true)
  assert.equal(save.growth.trust,46)
  assert.ok(['power','discipline','stamina','trust','condition'].every(key=>save.growth[key]>=0&&save.growth[key]<=100))
  errorCode(()=>prepare(save),'complete')
  errorCode(()=>simulateBaseballCareerAtBat(save,{id:uuid(300),seed:1,now}),'complete')
})

test('세이브 JSON 복구는 진행·현재 타석 참조·성장 원장을 바꾸지 않는다',()=>{
  let pair=manualStart(prepare(fresh({source:'development'})))
  pair=manualCommand(pair,'issue');pair=manualCommand(pair,'accept-input',{input:{kind:'take'}})
  const restored=copy(pair.save)
  assert.equal(validateBaseballCareerSave(restored),true)
  assert.deepEqual(publicBaseballCareerSave(restored),publicBaseballCareerSave(pair.save))
  pair=manualCommand({...pair,save:restored},'resolve')
  assert.equal(pair.save.source,'development')
  assert.equal(pair.atBat.state.history[0].source,'development')
  assert.equal(pair.save.stats.PA,0)
})

test('타율·장타율은 원래 분자/분모에서 계산하고 OBP/OPS를 만들어내지 않는다',()=>{
  let save=fresh()
  for(let game=0;game<3;game++){
    save=prepare(save,'rest')
    save=automatic(save,uuid(400+game*2),100+game*2).save
    save=automatic(save,uuid(401+game*2),101+game*2).save
  }
  const view=publicBaseballCareerSave(save),s=view.stats
  assert.equal(view.rates.AVG,s.AB?s.H/s.AB:null)
  assert.equal(view.rates.SLG,s.AB?(s.H+s['2B']+2*s['3B']+3*s.HR)/s.AB:null)
  assert.equal(Object.hasOwn(view.rates,'OBP'),false);assert.equal(Object.hasOwn(view.rates,'OPS'),false)
  assert.equal(Object.hasOwn(view.stats,'RBI'),false)
})

test('볼넷만6회인 축소시즌은 G3/PA6/BB6·AB0이며 타율과 장타율은 값 없음이다',()=>{
  let save=prepare(fresh(),'rest'),walkSeed=null
  for(let seed=0;seed<128&&walkSeed===null;seed++){
    let raw=createBaseballCareerManualAtBat(save,{id:uuid(550),seed,now})
    for(let n=0;raw.state.status==='active'&&n<6;n++){
      const run=(type,extra={})=>{raw=applyBaseballAtBatSessionCommand(raw,{commandId:uuid(6000+raw.revision),expectedRevision:raw.revision,type,
        ...(type==='issue'?{}:{pitchId:raw.pending.pitchId,attemptId:raw.pending.attemptId}),...extra},{now,attemptId:uuid(12000+raw.revision)})}
      run('issue');run('accept-input',{input:{kind:'take'}});run('resolve')
    }
    if(raw.state.outcome==='walk')walkSeed=seed
  }
  assert.notEqual(walkSeed,null)
  for(let game=0;game<3;game++){
    if(game)save=prepare(save,'rest')
    for(let slot=0;slot<2;slot++){
      let pair=manualStart(save,uuid(600+game*2+slot),walkSeed)
      while(pair.atBat.state.status==='active'){
        pair=manualCommand(pair,'issue');pair=manualCommand(pair,'accept-input',{input:{kind:'take'}});pair=manualCommand(pair,'resolve')
      }
      assert.equal(pair.atBat.state.outcome,'walk');save=pair.save
    }
  }
  const view=publicBaseballCareerSave(save)
  assert.deepEqual(view.stats,{G:3,PA:6,AB:0,H:0,'2B':0,'3B':0,HR:0,BB:6,SO:0})
  assert.deepEqual(view.rates,{AVG:null,SLG:null,totalBases:0})
  assert.equal(view.feedback.includes('walk-earned'),true)
  assert.equal(view.feedback.includes('first-hit'),false)
})

test('존재하지 않는 업적·중복 원장·임의 성장·과거 경기 변경을 거절한다',()=>{
  const save=automatic(prepare(fresh()),uuid(12),123).save
  for(const mutate of [value=>{value.ledger.push(copy(value.ledger[0]))},value=>{value.growth.power+=1},
    value=>{value.ledger[0].deltas.power+=1;value.growth.power+=1},
    value=>{value.games[0].appearances[0].stats.H=1-value.games[0].appearances[0].stats.H},
    value=>{value.stats.G=3},value=>{value.currentGameIndex=2},value=>{value.games[2].preparation={choice:'rest',at:now}},
    value=>{value.ledger.push({id:'fake',kind:'game',gameIndex:0,atBatId:null,choice:null,deltas:{power:0,discipline:0,stamina:0,trust:0,xp:1,condition:0},at:now});value.growth.xp+=1},
  ]){const value=copy(save);mutate(value);assert.throws(()=>validateBaseballCareerSave(value))}
})

test('128개 자동 검수에서도 기존8cm/110ms·속도·4구종과 직접 물리는 바뀌지 않는다',()=>{
  const before=JSON.stringify(BASEBALL_RULES),types=new Set()
  for(let seed=0;seed<128;seed++){
    const save=prepare(fresh({seed}),'discipline'),raw=simulateBaseballCareerAtBat(save,{id:uuid(100000+seed),seed,now})
    assert.ok(raw.state.pitchCount<=256)
    raw.state.history.forEach(row=>types.add(row.pitch.type))
    const next=apply(save,'simulate-at-bat',{}, {atBat:raw})
    assert.equal(next.stats.PA,1)
  }
  assert.deepEqual([...types].sort(),['changeup','curveball','four-seam','slider'])
  assert.equal(JSON.stringify(BASEBALL_RULES),before)
  assert.equal(BASEBALL_RULES.ballRadiusM,.04);assert.equal(BASEBALL_RULES.swingContactMs,110);assert.equal(BASEBALL_RULES.batActiveStartMs,0)
})
