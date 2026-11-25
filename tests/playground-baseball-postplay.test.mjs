import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveBaseballFieldResult} from '../lib/playground-baseball-field.mjs'
import {createBaseballFieldPresentation,sampleBaseballFieldPresentation} from '../lib/playground-baseball-field-presentation.mjs'
import {sampleBaseballPostplayMotion} from '../lib/playground-baseball-postplay.mjs'

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`)
function presentation(){
  const speed=140,angle=56,height=.75,vertical=speed/3.6*Math.sin(angle*Math.PI/180)
  return createBaseballFieldPresentation(resolveBaseballFieldResult({contacted:true,outcome:'contact',exitSpeedKmh:speed,launchAngleDeg:angle,directionDeg:45,
    contactPoint:{x:0,y:height,z:0},landingTimeMs:(vertical+Math.sqrt(vertical**2+2*9.81*height))/9.81*1000}))
}
function shortCaughtPresentation(){
  const speed=140,angle=8,height=.75,vertical=speed/3.6*Math.sin(angle*Math.PI/180)
  return createBaseballFieldPresentation(resolveBaseballFieldResult({contacted:true,outcome:'contact',exitSpeedKmh:speed,launchAngleDeg:angle,directionDeg:0,
    contactPoint:{x:0,y:height,z:0},landingTimeMs:(vertical+Math.sqrt(vertical**2+2*9.81*height))/9.81*1000}))
}
const trajectory=(extra={})=>({id:'live-motion-1',origin:'live',currentManual:true,startAt:1000,presentation:presentation(),...extra})
const reaction=(outcome,extra={})=>({id:'live-motion-1',origin:'live',confirmed:true,authority:'server',outcome,startAt:2000,...extra})
const sample=(value,elapsed,strength='normal')=>sampleBaseballPostplayMotion({trajectory:value,nowMs:value.startAt+elapsed,strength})

test('the approved original motion remains selected before contact and the existing 450ms runner start',()=>{
  const value=trajectory(),start=value.presentation.runner.startDelayMs
  assert.equal(start,450)
  for(const elapsed of [-100,0,100,start-.001])assert.equal(sample(value,elapsed),null)
  const first=sample(value,start)
  assert.equal(first.frame,'lower');assert.equal(first.kind,'lower');assert.equal(first.alpha,0);assert.equal(first.meters,0)
})

test('the new lowered-bat pose precedes the first running frame for exactly110ms',()=>{
  const value=trajectory(),start=value.presentation.runner.startDelayMs
  const middle=sample(value,start+55),last=sample(value,start+109.999),next=sample(value,start+110)
  assert.equal(middle.frame,'lower');assert.equal(last.frame,'lower');close(middle.alpha,55/90)
  assert.equal(middle.meters,0);assert.deepEqual(middle.position,{x:0,z:0})
  assert.equal(next.kind,'run');assert.equal(next.frame,'run1')
  close(next.meters,sampleBaseballFieldPresentation(value.presentation,start+110).runner.firstSteps.meters)
})

test('three intact run frames cycle deterministically without requiring art files or random state',()=>{
  const value=trajectory(),begin=value.presentation.runner.startDelayMs+110
  for(const [elapsed,frame]of [[begin,'run1'],[begin+99.999,'run1'],[begin+100,'run2'],[begin+200,'run3'],[begin+300,'run1']]){
    const first=sample(value,elapsed),second=sample(value,elapsed)
    assert.equal(first.frame,frame);assert.deepEqual(first,second)
    close(Math.hypot(first.position.x,first.position.z),first.meters)
    assert.ok(first.meters>=0&&first.meters<=4)
  }
})

test('first-step distance matches the existing field sampler and never becomes a full base circuit',()=>{
  const value=trajectory()
  for(const elapsed of [560,650,800,950,1000,2000,100000]){
    const motion=sample(value,elapsed),state=sampleBaseballFieldPresentation(value.presentation,elapsed)
    close(motion.meters,state.runner.firstSteps.meters)
    assert.ok(motion.meters<=4);assert.ok(motion.position.x>=0&&motion.position.z>=0)
    close(motion.position.x,motion.position.z)
  }
})

test('the first4m end keeps position fixed and fades for260ms before becoming invisible',()=>{
  const value=trajectory(),state=sampleBaseballFieldPresentation(value.presentation,560)
  const end=Math.min(value.presentation.playTimeMs,state.runner.startDelayMs+state.runner.firstSteps.durationMs)
  const exact=sample(value,end),half=sample(value,end+130),finished=sample(value,end+260),late=sample(value,end+100000)
  close(exact.meters,4);close(exact.alpha,1);assert.equal(exact.firstStepsComplete,true)
  close(half.alpha,.5);close(half.meters,4)
  assert.equal(finished.alpha,0);assert.equal(finished.kind,'departed');assert.equal(finished.frame,'lower')
  assert.deepEqual(finished.position,half.position);assert.equal(late.alpha,0);assert.equal(late.meters,4)
})

test('a very early caught line drive never starts running after the field play already stopped',()=>{
  const value=trajectory({presentation:shortCaughtPresentation()})
  assert.equal(value.presentation.outcome,'lineout');assert.equal(value.presentation.playTimeMs,460)
  for(const elapsed of [460,500,560,600,700]){
    const motion=sample(value,elapsed)
    assert.ok(motion);assert.equal(motion.frame,'lower');assert.notEqual(motion.kind,'run')
    assert.ok(motion.meters>=0&&motion.meters<4)
  }
})

test('reduced motion selects a stationary lowered-bat response instead of running or fading',()=>{
  const value=trajectory(),start=value.presentation.runner.startDelayMs
  assert.equal(sample(value,start-.001,'reduced'),null)
  for(const elapsed of [start,start+110,1500,100000]){
    const motion=sample(value,elapsed,'reduced')
    assert.equal(motion.frame,'lower');assert.equal(motion.kind,'watch');assert.equal(motion.alpha,1)
    assert.equal(motion.meters,0);assert.deepEqual(motion.position,{x:0,z:0})
  }
})

test('off suppresses all new motion while subtle keeps the same physical departure positions',()=>{
  const value=trajectory()
  for(const elapsed of [450,560,800,1100]){
    assert.equal(sample(value,elapsed,'off'),null)
    assert.deepEqual(sample(value,elapsed,'subtle'),sample(value,elapsed,'normal'))
  }
  assert.equal(sampleBaseballPostplayMotion({reaction:reaction('walk'),nowMs:2200,strength:'off'}),null)
})

test('looking and swinging strikeouts both use one confirmed lowered-bat response',()=>{
  for(const outcome of ['strikeout-looking','strikeout-swinging'])for(const authority of ['memory','server']){
    const value=reaction(outcome,{authority})
    const before=sampleBaseballPostplayMotion({reaction:value,nowMs:1999}),at=sampleBaseballPostplayMotion({reaction:value,nowMs:2000})
    const middle=sampleBaseballPostplayMotion({reaction:value,nowMs:2070}),after=sampleBaseballPostplayMotion({reaction:value,nowMs:2140})
    assert.equal(before,null);assert.equal(at.frame,'lower');assert.equal(at.kind,'strikeout');assert.equal(at.alpha,0)
    close(middle.alpha,.5);assert.equal(after.alpha,1);assert.equal(after.meters,0);assert.deepEqual(after.position,{x:0,z:0})
  }
})

test('a confirmed walk lowers the bat without inventing running speed or awarded base animation',()=>{
  const value=reaction('walk'),motion=sampleBaseballPostplayMotion({reaction:value,nowMs:2200})
  assert.equal(motion.kind,'walk');assert.equal(motion.frame,'lower');assert.equal(motion.alpha,1);assert.equal(motion.meters,0)
  assert.deepEqual(motion.position,{x:0,z:0})
  const reduced=sampleBaseballPostplayMotion({reaction:value,nowMs:2000,strength:'reduced'})
  assert.equal(reduced.alpha,1);assert.equal(reduced.kind,'walk')
})

test('result reactions require a new confirmed authority and never autoplay stored or automatic history',()=>{
  for(const extra of [
    {confirmed:false},{authority:null},{authority:'client'},{origin:'restored'},{origin:'automatic'},{origin:'replay'},
    {origin:'live',authority:'preview'},
  ])assert.equal(sampleBaseballPostplayMotion({reaction:reaction('walk',extra),nowMs:2200}),null)
  for(const origin of ['restored','automatic','replay'])assert.equal(sample(trajectory({origin}),700),null)
  assert.equal(sample(trajectory({currentManual:false}),700),null)
})

test('explicit preview uses its own authority and cannot masquerade as a live receipt',()=>{
  const run=sample(trajectory({origin:'preview',currentManual:false,authority:'preview'}),700)
  assert.equal(run.kind,'run')
  const call=sampleBaseballPostplayMotion({reaction:reaction('strikeout-looking',{origin:'preview',authority:'preview'}),nowMs:2200})
  assert.equal(call.kind,'strikeout')
  assert.equal(sample(trajectory({origin:'preview',authority:'server'}),700),null)
})

test('fair-ball outcomes do not create a fake home-run or out pose before replacing the approved swing',()=>{
  const value=trajectory()
  for(const outcome of ['home-run','single','double','triple','flyout','lineout','groundout','perfect','foul']){
    const only=sampleBaseballPostplayMotion({reaction:reaction(outcome),nowMs:2200})
    assert.equal(only,null)
    const withTrajectory=sampleBaseballPostplayMotion({trajectory:value,reaction:reaction(outcome),nowMs:1700})
    assert.deepEqual(withTrajectory,sample(value,700))
  }
})

test('invalid clocks, absent paths and malformed start times fail closed',()=>{
  const value=trajectory()
  for(const nowMs of [NaN,Infinity,-Infinity,null,'1700',undefined])assert.equal(sampleBaseballPostplayMotion({trajectory:value,nowMs}),null)
  assert.equal(sample(trajectory({presentation:null}),700),null)
  for(const startAt of [NaN,Infinity,null,'1000']){
    assert.equal(sampleBaseballPostplayMotion({trajectory:trajectory({startAt}),nowMs:1700}),null)
    assert.equal(sampleBaseballPostplayMotion({reaction:reaction('walk',{startAt}),nowMs:2200}),null)
  }
})

test('sampling leaves input tickets and the resolved display path unchanged',()=>{
  const value=trajectory(),response=reaction('walk'),before=JSON.stringify({value,response})
  Object.freeze(value);Object.freeze(response)
  for(let n=0;n<20;n++){
    sampleBaseballPostplayMotion({trajectory:value,nowMs:1400+n*40})
    sampleBaseballPostplayMotion({reaction:response,nowMs:2000+n*20})
  }
  assert.equal(JSON.stringify({value,response}),before)
})
