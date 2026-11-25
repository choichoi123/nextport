import test from 'node:test'
import assert from 'node:assert/strict'
import * as v2 from '../lib/playground-baseball-at-bat-v2.mjs'
import * as v1 from '../lib/playground-baseball-at-bat.mjs'
import { createBaseballGrowthSnapshot,judgeBaseballGrowthSwing } from '../lib/playground-baseball-growth.mjs'
import { resolveBaseballFieldResult } from '../lib/playground-baseball-field.mjs'

const growthSnapshot=createBaseballGrowthSnapshot({careerId:'22000000-0000-4000-8000-000000000001',careerRevision:2,gameIndex:0,slot:1,mit:100,power:100})
const create=()=>v2.createBaseballAtBat({id:'v2-comparison',seed:42,growthSnapshot})
const advance=(state,foul=false)=>{
  const issued=v2.nextBaseballAtBatPitch(state),pitch=issued.pitch
  const result=judgeBaseballGrowthSwing(pitch,{swingAtMs:foul?pitch.flightTimeMs-110+80:-1200,aim:pitch.target,handedness:state.handedness},state.growthSnapshot)
  return v2.resolveBaseballAtBatPitch(state,{...issued,result,fieldResult:['contact','perfect'].includes(result.outcome)?resolveBaseballFieldResult(result):null,source:'manual'})
}

test('v2카운트는필수스냅샷과새정체성을갖고투구조건은같은seed의v1과동일하다',()=>{
  assert.throws(()=>v2.createBaseballAtBat())
  const next=create(),old=v1.createBaseballAtBat({id:'v2-comparison',seed:42})
  assert.equal(next.rulesVersion,'baseball-at-bat-v2')
  assert.equal(next.pitchPolicyVersion,'baseball-at-bat-pitches-v2')
  assert.deepEqual(next.growthSnapshot,growthSnapshot)
  assert.deepEqual(v2.nextBaseballAtBatPitch(next),v1.nextBaseballAtBatPitch(old))
  assert.throws(()=>v2.nextBaseballAtBatPitch(old))
  assert.throws(()=>v1.nextBaseballAtBatPitch(next))
})

test('2스트라이크파울은타석을끝내지않고다음삼진에서만1PA를확정한다',()=>{
  let state=advance(advance(create()))
  assert.equal(state.strikes,2)
  state=advance(state,true)
  assert.equal(state.history.at(-1).result.outcome,'foul')
  assert.equal(state.strikes,2);assert.equal(state.status,'active');assert.equal(state.stats.PA,0)
  const final=advance(state)
  assert.equal(final.status,'complete');assert.equal(final.outcome,'strikeout-swinging')
  assert.equal(final.stats.PA,1);assert.equal(final.stats.SO,1)
  assert.deepEqual(final.growthSnapshot,growthSnapshot)
  assert.equal(v2.nextBaseballAtBatPitch(final),null)
})

test('같은확정결과는멱등이며스냅샷변조와중복결과충돌을거절한다',()=>{
  const first=create(),next=advance(first),row=next.history[0]
  const event={pitchId:row.pitchId,pitch:row.pitch,result:row.result,fieldResult:row.fieldResult,source:row.source}
  assert.equal(v2.resolveBaseballAtBatPitch(next,event),next)
  assert.throws(()=>v2.resolveBaseballAtBatPitch(next,{...event,result:{...event.result,quality:1}}))
  assert.throws(()=>v2.nextBaseballAtBatPitch({...next,growthSnapshot:{...growthSnapshot,powerMultiplier:2}}))
  assert.equal(first.pitchCount,0)
})
