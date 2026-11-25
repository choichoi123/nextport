import test from 'node:test'
import assert from 'node:assert/strict'
import * as v2 from '../lib/playground-baseball-career-v2.mjs'
import * as v1 from '../lib/playground-baseball-career.mjs'
import { applyBaseballAtBatSessionCommand,validateBaseballAtBatSession } from '../lib/playground-baseball-at-bat-session-v2.mjs'
import { createBaseballGrowthSnapshot,judgeBaseballGrowthSwing,judgeBaseballGrowthTake } from '../lib/playground-baseball-growth.mjs'

const uuid=n=>`23000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`
const now='2026-11-25T00:00:00.000Z',profile={name:'새싹',jerseyNumber:'07',teamId:'wiz',handedness:'left'}
const hashes=Object.fromEntries(['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','careerHash','growthHash'].map((key,i)=>[key,String(i+1).repeat(64)]))
const copy=value=>JSON.parse(JSON.stringify(value))
const fresh=()=>v2.createBaseballCareerSave({id:uuid(1),seed:42,profile,versions:hashes,now})
const apply=(save,type,extra={},options={})=>v2.applyBaseballCareerCommand(save,{commandId:uuid(1000+save.revision),expectedRevision:save.revision,type,...extra},{now,...options})
const prepare=(save,choice='mit')=>apply(save,'prepare',{choice})
function start(save,id=uuid(2000+save.revision)){
  const atBat=v2.createBaseballCareerManualAtBat(save,{id,seed:42,now})
  return {save:apply(save,'start-manual',{}, {atBat}),atBat}
}
function command(pair,type,extra={}){
  const {save,atBat}=pair
  const next=applyBaseballAtBatSessionCommand(atBat,{commandId:uuid(4000+atBat.revision),expectedRevision:atBat.revision,type,
    ...(type==='issue'?{}:{pitchId:atBat.pending.pitchId,attemptId:atBat.pending.attemptId}),...extra},{now,attemptId:uuid(5000+atBat.revision)})
  return {save:v2.advanceBaseballCareerAtBat(save,next,{expectedRevision:save.revision,now}),atBat:next}
}
function finish(save){
  let pair=start(save)
  for(let i=0;i<3;i++){pair=command(pair,'issue');pair=command(pair,'accept-input',{input:{kind:'swing',swingAtMs:-1200,aim:{x:0,y:.75}}});pair=command(pair,'resolve')}
  return pair
}

test('새선수만schema2/미트40을갖고훈련미트+2를실제원장에1회지급한다',()=>{
  const save=fresh(),trained=prepare(save)
  assert.equal(save.schemaVersion,2);assert.equal(save.growth.mit,40);assert.equal(save.growth.power,40)
  assert.equal(save.versions.careerId,'baseball-career-v2')
  assert.equal(trained.growth.mit,42);assert.equal(trained.growth.xp,2);assert.equal(trained.growth.condition,74)
  assert.equal(trained.ledger[0].deltas.mit,2)
  assert.throws(()=>prepare(trained),e=>e.code==='preparation-complete')
  const altered=copy(trained);delete altered.growth.mit;assert.throws(()=>v2.validateBaseballCareerSave(altered))
})

test('서버의타석시작스냅샷은저장된능력·revision·경기·slot에서만생성된다',()=>{
  const before=prepare(fresh()),pair=start(before),s=pair.atBat.growthSnapshot
  assert.deepEqual(s,createBaseballGrowthSnapshot({careerId:before.id,careerRevision:before.revision,gameIndex:0,slot:1,mit:42,power:40}))
  assert.deepEqual(pair.save.activeAtBat.growthSnapshot,s)
  assert.equal(validateBaseballAtBatSession(pair.atBat),true)
  assert.throws(()=>apply(before,'start-manual',{growthSnapshot:s},{atBat:pair.atBat}))
  for(const change of [{careerId:uuid(99)},{careerRevision:before.revision+1},{slot:2},{mit:100},{power:100}]){
    const changed=copy(pair.atBat),snapshot=createBaseballGrowthSnapshot({...s,...change})
    changed.growthSnapshot=snapshot;changed.state.growthSnapshot=snapshot
    assert.equal(validateBaseballAtBatSession(changed),true)
    assert.throws(()=>apply(before,'start-manual',{}, {atBat:changed}))
  }
})

test('모든중단·발급·입력명령에서성장스냅샷을고정하고완료영수증만보상을준다',()=>{
  let pair=start(prepare(fresh())),snapshot=pair.atBat.growthSnapshot,ledger=pair.save.ledger.length
  pair=command(pair,'issue');pair=command(pair,'pause',{reason:'visibility'});pair=command(pair,'issue')
  assert.deepEqual(pair.save.activeAtBat.growthSnapshot,snapshot)
  assert.deepEqual(pair.atBat.growthSnapshot,snapshot)
  assert.equal(pair.save.ledger.length,ledger);assert.equal(pair.save.stats.PA,0)
  const changed=copy(pair.atBat),other=createBaseballGrowthSnapshot({...snapshot,mit:100})
  changed.growthSnapshot=other;changed.state.growthSnapshot=other
  assert.throws(()=>v2.advanceBaseballCareerAtBat(pair.save,changed,{expectedRevision:pair.save.revision,now}))
  const complete=finish(prepare(fresh()))
  const repeated=v2.advanceBaseballCareerAtBat(complete.save,complete.atBat,{expectedRevision:complete.save.revision,now})
  assert.equal(repeated,complete.save)
  assert.equal(complete.save.stats.PA,1);assert.equal(complete.save.growth.mit,42)
  assert.deepEqual(complete.save.games[0].appearances[0].growthSnapshot,complete.atBat.growthSnapshot)
})

test('3경기6타석·기존보상은유지하고과거타석의능력은후속훈련으로바뀌지않는다',()=>{
  let save=fresh();const snapshots=[]
  for(let game=0;game<3;game++){
    save=prepare(save)
    for(let slot=0;slot<2;slot++){const pair=finish(save);snapshots.push(pair.atBat.growthSnapshot);save=pair.save}
  }
  assert.equal(save.status,'complete');assert.equal(save.currentGameIndex,3)
  assert.equal(save.stats.G,3);assert.equal(save.stats.PA,6);assert.equal(save.stats.SO,6)
  assert.equal(save.growth.mit,46);assert.equal(save.growth.power,40);assert.equal(save.growth.xp,39)
  assert.equal(save.growth.trust,46);assert.equal(save.growth.condition,44);assert.equal(save.growth.discipline,43)
  assert.equal(save.ledger.length,12)
  assert.deepEqual(snapshots.map(s=>s.mit),[42,42,44,44,46,46])
  assert.deepEqual(snapshots.map(s=>s.slot),[1,2,1,2,1,2])
  assert.equal(v2.validateBaseballCareerSave(save),true)
  const view=v2.publicBaseballCareerSave(save)
  assert.equal(Object.hasOwn(view,'seed'),false);assert.equal(view.games[0].appearances[0].growthSnapshot.mit,42)
  assert.throws(()=>prepare(save),e=>e.code==='complete')
})

test('자동타석도같은스냅샷커널로재계산하며파워훈련의조준오차중복보정을제거한다',()=>{
  const mit=prepare(fresh(),'mit'),power=prepare(fresh(),'power')
  const a=v2.simulateBaseballCareerAtBat(mit,{id:uuid(30),seed:42,now})
  const b=v2.simulateBaseballCareerAtBat(power,{id:uuid(30),seed:42,now})
  assert.equal(a.schemaVersion,2);assert.equal(a.versions.growthPolicyId,'baseball-career-growth-v2')
  assert.equal(a.growthSnapshot.mit,42);assert.equal(b.growthSnapshot.power,42)
  const firstA=a.inputs.find(row=>row.input.kind==='swing'),firstB=b.inputs.find(row=>row.input.kind==='swing')
  assert.ok(firstA&&firstB);assert.deepEqual(firstA,firstB)
  for(const automatic of [a,b])for(const row of automatic.state.history){
    const input=automatic.inputs.find(entry=>entry.pitchId===row.pitchId).input
    const expected=input.kind==='take'?judgeBaseballGrowthTake(row.pitch,automatic.growthSnapshot)
      :judgeBaseballGrowthSwing(row.pitch,{...input,handedness:automatic.config.handedness},automatic.growthSnapshot)
    assert.deepEqual(row.result,expected)
  }
  assert.equal(v2.validateBaseballCareerAutomaticAtBat(mit,a),true)
  const after=apply(mit,'simulate-at-bat',{}, {atBat:a})
  assert.equal(after.stats.PA,1);assert.equal(after.games[0].appearances[0].source,'automatic')
})

test('자동스냅샷·성적·다른버전변조를거절하고예산초과는기존선수를보존한다',()=>{
  const save=prepare(fresh()),before=copy(save),auto=v2.simulateBaseballCareerAtBat(save,{id:uuid(30),seed:42,now})
  for(const change of [value=>{value.growthSnapshot.mit=100},value=>{value.state.stats.H=99},
    value=>{value.versions.growthHash='f'.repeat(64)},value=>{value.versions.growthPolicyId='unknown'},
    value=>{delete value.growthSnapshot}]){
    const changed=copy(auto);change(changed);assert.throws(()=>v2.validateBaseballCareerAutomaticAtBat(save,changed))
  }
  assert.throws(()=>v2.simulateBaseballCareerAtBat(save,{id:uuid(30),seed:42,now,pitchBudget:0}),e=>e.code==='automatic-budget')
  assert.deepEqual(save,before)
})

test('원장과다른현재/과거능력변조는거절하고v1은미트를주입하지않은채별도로이어간다',()=>{
  const pair=finish(prepare(fresh())),changed=copy(pair.save)
  changed.growth.mit=100;assert.throws(()=>v2.validateBaseballCareerSave(changed))
  const oldHashes={...hashes};delete oldHashes.growthHash
  let old=v1.createBaseballCareerSave({id:uuid(90),seed:42,profile,versions:oldHashes,now})
  old=v1.applyBaseballCareerCommand(old,{commandId:uuid(91),expectedRevision:old.revision,type:'prepare',choice:'power'},{now})
  const automatic=v1.simulateBaseballCareerAtBat(old,{id:uuid(92),seed:42,now})
  old=v1.applyBaseballCareerCommand(old,{commandId:uuid(93),expectedRevision:old.revision,type:'simulate-at-bat'},{now,atBat:automatic})
  assert.equal(old.schemaVersion,1);assert.equal(old.stats.PA,1)
  assert.equal(Object.hasOwn(old.growth,'mit'),false)
  assert.equal(v1.validateBaseballCareerSave(old),true)
  assert.throws(()=>v2.validateBaseballCareerSave(old));assert.throws(()=>v1.validateBaseballCareerSave(pair.save))
})
