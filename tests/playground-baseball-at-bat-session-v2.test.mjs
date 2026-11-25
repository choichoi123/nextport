import test from 'node:test'
import assert from 'node:assert/strict'
import * as v2 from '../lib/playground-baseball-at-bat-session-v2.mjs'
import * as v1 from '../lib/playground-baseball-at-bat-session.mjs'
import { createBaseballGrowthSnapshot,judgeBaseballGrowthSwing } from '../lib/playground-baseball-growth.mjs'
import { resolveBaseballFieldResult } from '../lib/playground-baseball-field.mjs'

const uuid=n=>`22000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`
const now='2026-11-25T00:00:00.000Z'
const hashes=Object.fromEntries(['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','growthHash'].map((key,i)=>[key,String(i+1).repeat(64)]))
const config={handedness:'left',pitcherHandedness:'right',baseSpeedKmh:100,pitchMode:'mixed'}
const snapshot=createBaseballGrowthSnapshot({careerId:uuid(1),careerRevision:2,gameIndex:0,slot:1,mit:100,power:100})
const fresh=(extra={})=>v2.createBaseballAtBatSession({id:uuid(2),seed:42,now,versions:hashes,config,growthSnapshot:snapshot,...extra})
const copy=value=>JSON.parse(JSON.stringify(value))
const apply=(s,type,extra={})=>v2.applyBaseballAtBatSessionCommand(s,{commandId:uuid(100+s.revision),expectedRevision:s.revision,type,
  ...(type==='issue'?{}:{pitchId:s.pending.pitchId,attemptId:s.pending.attemptId}),...extra},{now,attemptId:uuid(1000+s.revision)})

test('v2세션은schema2·growth버전과top/state스냅샷을고정하며공개응답에서seed를숨긴다',()=>{
  const session=fresh(),view=v2.publicBaseballAtBatSession(session)
  assert.equal(session.schemaVersion,2);assert.equal(session.versions.sessionId,'baseball-at-bat-session-v2')
  assert.equal(session.versions.growthPolicyId,'baseball-career-growth-v2')
  assert.deepEqual(view.growthSnapshot,snapshot);assert.deepEqual(view.state.growthSnapshot,snapshot)
  assert.equal(Object.hasOwn(view.state,'seed'),false)
  assert.ok(Object.isFrozen(view.growthSnapshot))
  assert.throws(()=>fresh({growthSnapshot:undefined}))
  const missing={...hashes};delete missing.growthHash;assert.throws(()=>fresh({versions:missing}))
})

test('중단·같은공재발급은동일스냅샷을유지하고입력뒤재시도는기존승부만확정한다',()=>{
  let s=apply(fresh(),'issue'),pitch=s.pending.pitch
  const pitchId=s.pending.pitchId,oldAttempt=s.pending.attemptId
  s=apply(s,'pause',{reason:'visibility'});s=apply(s,'issue')
  assert.equal(s.pending.pitchId,pitchId);assert.notEqual(s.pending.attemptId,oldAttempt)
  assert.deepEqual(s.pending.pitch,pitch)
  const input={kind:'swing',swingAtMs:pitch.flightTimeMs-110,aim:pitch.target,source:'touch',surface:'field'}
  s=apply(s,'accept-input',{input});s=apply(s,'pause',{reason:'reload'})
  assert.throws(()=>apply(s,'issue'),e=>e.code==='input-already-accepted')
  const final=apply(s,'resolve'),row=final.state.history.at(-1)
  const expected=judgeBaseballGrowthSwing(pitch,{...input,handedness:config.handedness},snapshot)
  assert.deepEqual(row.result,expected)
  assert.deepEqual(row.fieldResult,resolveBaseballFieldResult(expected))
  assert.deepEqual(final.growthSnapshot,snapshot)
  assert.deepEqual(final.state.growthSnapshot,snapshot)
})

test('입력으로능력이나결과를주입할수없고부모/자식스냅샷변조를거절한다',()=>{
  const issued=apply(fresh(),'issue'),input={kind:'swing',swingAtMs:0,aim:{x:0,y:.75}}
  for(const extra of [{mit:100},{power:100},{growthSnapshot:snapshot},{score:999}])assert.throws(()=>apply(issued,'accept-input',{input:{...input,...extra}}))
  for(const change of [value=>{value.state.growthSnapshot.mit=40},value=>{value.growthSnapshot.powerMultiplier=2},
    value=>{value.versions.growthPolicyId='unknown'},value=>{value.schemaVersion=1}]){
    const changed=copy(issued);change(changed);assert.throws(()=>v2.validateBaseballAtBatSession(changed))
  }
  assert.equal(v2.validateBaseballAtBatSession(issued),true)
})

test('세번째삼진만최종영수증을만들며이전CAS와완료후명령은재보상을만들지않는다',()=>{
  let s=fresh()
  for(let i=0;i<3;i++){s=apply(s,'issue');s=apply(s,'accept-input',{input:{kind:'swing',swingAtMs:-1200,aim:{x:0,y:.75}}});s=apply(s,'resolve')}
  assert.equal(s.state.stats.PA,1);assert.equal(s.finalReceipt.outcome,'strikeout-swinging')
  assert.equal(s.finalReceipt.revision,s.revision)
  assert.throws(()=>apply(s,'issue'),e=>e.code==='complete')
  assert.throws(()=>v2.applyBaseballAtBatSessionCommand(s,{commandId:uuid(999),expectedRevision:s.revision-1,type:'issue'},{now,attemptId:uuid(990)}),e=>e.code==='conflict')
})

test('v1세션은기존대로생성하고v2로자동변환하지않는다',()=>{
  const oldVersions={...hashes};delete oldVersions.growthHash
  const old=v1.createBaseballAtBatSession({id:uuid(3),seed:42,now,versions:oldVersions,config})
  assert.equal(old.schemaVersion,1);assert.equal(Object.hasOwn(old,'growthSnapshot'),false)
  assert.equal(v1.validateBaseballAtBatSession(old),true)
  assert.throws(()=>v2.validateBaseballAtBatSession(old));assert.throws(()=>v1.validateBaseballAtBatSession(fresh()))
})
