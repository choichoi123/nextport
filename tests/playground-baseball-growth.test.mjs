import test from 'node:test'
import assert from 'node:assert/strict'
import { BASEBALL_GROWTH_RULES, getBaseballGrowthProfile, createBaseballGrowthSnapshot,
  validateBaseballGrowthSnapshot, judgeBaseballGrowthSwing, judgeBaseballGrowthTake } from '../lib/playground-baseball-growth.mjs'
import { compareBaseballGrowthPreview } from '../lib/playground-baseball-growth-preview.mjs'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, createBaseballPitch, getBaseballPitchSpeed,
  judgeBaseballSwing, judgeBaseballTake, sampleBaseballBat, sampleBaseballPlatePassage,
  sampleBaseballBattedBall } from '../lib/playground-baseball.mjs'
import { resolveBaseballFieldResult } from '../lib/playground-baseball-field.mjs'

const ownership={careerId:'22000000-0000-4000-8000-000000000001',careerRevision:2,gameIndex:0,slot:1}
const snapshot=(mit=40,power=40)=>createBaseballGrowthSnapshot({...ownership,mit,power})
const copy=value=>JSON.parse(JSON.stringify(value))
const close=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`)

function fixture(type='four-seam',pitcherHandedness='right',handedness='right',elapsed=110,separation=0,baseSpeed=100){
  const aim={x:0,y:.75},bat=sampleBaseballBat({swingElapsedMs:elapsed,aim,handedness})
  const axis={x:(bat.end.x-bat.start.x)/.64,y:(bat.end.y-bat.start.y)/.64}
  const pitch=createBaseballPitch({seed:42,pitchType:type,speedKmh:getBaseballPitchSpeed(baseSpeed,type),pitcherHandedness,
    target:{x:aim.x-axis.y*separation,y:aim.y+axis.x*separation}})
  return {pitch,input:{swingAtMs:sampleBaseballPlatePassage(pitch).timeMs-elapsed,aim,handedness}}
}

test('실제v2 성장 정책은 초기40·최대미트12%·파워5%와 소유 스냅샷을 명시한다',()=>{
  assert.equal(BASEBALL_GROWTH_RULES.id,'baseball-career-growth-v2')
  for(const [level,radius,power]of [[40,.073,1],[70,.07738,1.025],[100,.08176,1.05]]){
    const s=snapshot(level,level)
    close(s.contactRadiusM,radius);close(s.powerMultiplier,power)
    assert.equal(s.policyId,BASEBALL_GROWTH_RULES.id)
    assert.equal(s.schemaVersion,1)
    assert.equal(s.outerQualityMaximum,.55)
    assert.equal(validateBaseballGrowthSnapshot(s),true)
    assert.ok(Object.isFrozen(s))
  }
  assert.equal(BASEBALL_RULES.ballRadiusM*2,.08)
  assert.equal(BASEBALL_RULES.batBarrelLengthM,.64)
  assert.equal(BASEBALL_RULES.swingContactMs,110)
})

test('스냅샷 누락·손상·다른소유·modifier변조·알수없는정책을 명시적으로 거절한다',()=>{
  for(const input of [undefined,null,{},[],{...snapshot(),extra:1}])assert.throws(()=>validateBaseballGrowthSnapshot(input))
  for(const change of [{schemaVersion:2},{policyId:'baseball-career-growth-v1'},{careerId:'unknown'},
    {careerRevision:0},{careerRevision:1.5},{gameIndex:144},{slot:0},{slot:3},{mit:undefined},{mit:101},
    {power:'40'},{power:NaN},{contactMultiplier:1.12},{contactRadiusM:.08},{powerMultiplier:2},{outerQualityMaximum:1}]){
    assert.throws(()=>validateBaseballGrowthSnapshot({...snapshot(),...change}))
  }
  for(const value of [undefined,NaN,-1,101,40.1,'70'])assert.throws(()=>getBaseballGrowthProfile({mit:value,power:40}))
  const value=fixture()
  assert.throws(()=>judgeBaseballGrowthSwing(value.pitch,value.input))
  assert.throws(()=>judgeBaseballGrowthTake(value.pitch))
})

test('기본40은4종·양투·양타·시간/접촉 경계에서 원래판정과 동일하다',()=>{
  for(const {id:type}of BASEBALL_PITCH_TYPES)for(const pitcher of ['left','right'])for(const hand of ['left','right']){
    for(const elapsed of [-.001,0,110,210,210.001])for(const gap of [0,.073,.073001,.079]){
      const f=fixture(type,pitcher,hand,elapsed,gap)
      assert.deepEqual(judgeBaseballGrowthSwing(f.pitch,f.input,snapshot()),judgeBaseballSwing(f.pitch,f.input))
      assert.deepEqual(judgeBaseballGrowthTake(f.pitch,snapshot()),judgeBaseballTake(f.pitch))
    }
  }
})

test('실제커널은 저장없는 후보와 같은 입력/스냅샷에서 같은접촉·타구·수비를 산출한다',()=>{
  for(const {id:type}of BASEBALL_PITCH_TYPES)for(const pitcher of ['left','right'])for(const hand of ['left','right']){
    for(const elapsed of [0,110,210,210.001])for(const gap of [0,.075,.079,.09])for(const [mit,power]of [[70,40],[100,40],[40,100],[100,100]]){
      const f=fixture(type,pitcher,hand,elapsed,gap)
      const actual=judgeBaseballGrowthSwing(f.pitch,f.input,snapshot(mit,power))
      const preview=compareBaseballGrowthPreview({...f,mit,power})
      assert.deepEqual(actual,preview.candidate.result)
      if(['contact','perfect'].includes(actual.outcome))assert.deepEqual(resolveBaseballFieldResult(actual),preview.candidate.fieldResult)
    }
  }
})

test('신규보조접촉만 품질0.55로 제한하며 시간밖·외곽밖을구제하거나 기존정타를약화하지않는다',()=>{
  const assisted=fixture('four-seam','left','left',110,.079)
  const a=judgeBaseballGrowthSwing(assisted.pitch,assisted.input,snapshot(100,40))
  assert.equal(a.contacted,true);assert.equal(a.outcome,'contact');assert.equal(a.quality,.55)
  const normal=fixture(),good=judgeBaseballGrowthSwing(normal.pitch,normal.input,snapshot(100,40))
  assert.equal(good.outcome,'perfect');assert.ok(good.quality>.55)
  for(const [elapsed,gap]of [[-.001,0],[210.001,.079],[110,.081761]]){
    const f=fixture('slider','right','right',elapsed,gap)
    assert.equal(judgeBaseballGrowthSwing(f.pitch,f.input,snapshot(100,100)).outcome,'miss')
  }
})

test('파워는190상한과발사각을유지하며 착지·비행·수비가 하나의일관된타구를쓴다',()=>{
  for(const speed of [80,100,160]){
    const f=fixture('four-seam','right','right',110,0,speed)
    const base=judgeBaseballGrowthSwing(f.pitch,f.input,snapshot()),grown=judgeBaseballGrowthSwing(f.pitch,f.input,snapshot(40,100))
    close(grown.exitSpeedKmh,Math.min(190,base.exitSpeedKmh*1.05))
    assert.equal(grown.launchAngleDeg,base.launchAngleDeg)
    close(sampleBaseballBattedBall(grown,grown.landingTimeMs).y,0)
    assert.ok(resolveBaseballFieldResult(grown).path.length>1)
  }
})

test('인풋의임의능력값은스냅샷을대체하지않고피치·조준·소유원본을변경하지않는다',()=>{
  const f=copy(fixture()),owner={...ownership,mit:40,power:40},before=copy({f,owner})
  const s=createBaseballGrowthSnapshot(owner)
  assert.deepEqual(judgeBaseballGrowthSwing(f.pitch,{...f.input,mit:100,power:100},s),judgeBaseballGrowthSwing(f.pitch,f.input,s))
  assert.deepEqual({f,owner},before)
  assert.equal(Object.isFrozen(f.input.aim),false)
  assert.equal(Object.isFrozen(owner),false)
})
