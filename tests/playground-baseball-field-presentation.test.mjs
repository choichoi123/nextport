import test from 'node:test'
import assert from 'node:assert/strict'
import {BASEBALL_FIELD_MODEL,resolveBaseballFieldResult} from '../lib/playground-baseball-field.mjs'
import {BASEBALL_FIELD_PRESENTATION,canAnimateBaseballFieldPresentation,createBaseballFieldPresentation,sampleBaseballFieldPresentation} from '../lib/playground-baseball-field-presentation.mjs'

const clone=value=>JSON.parse(JSON.stringify(value))
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)
const xyz=value=>({x:value.x,y:value.y,z:value.z})
function batted(speed=120,angle=25,direction=0){
  const height=.75,vertical=speed/3.6*Math.sin(angle*Math.PI/180)
  return {contacted:true,outcome:'contact',exitSpeedKmh:speed,launchAngleDeg:angle,directionDeg:direction,
    contactPoint:{x:0,y:height,z:0},landingTimeMs:(vertical+Math.sqrt(vertical**2+2*9.81*height))/9.81*1000}
}
const field=(...args)=>resolveBaseballFieldResult(batted(...args))
const fixtures=[
  {args:[40,40,-5],outcome:'flyout'}, {args:[60,16,-10],outcome:'lineout'},
  {args:[40,-28,-45],outcome:'groundout'}, {args:[40,-20,-45],outcome:'single'},
  {args:[90,32,-45],outcome:'double'}, {args:[140,56,45],outcome:'triple'},
  {args:[140,28,-45],outcome:'home-run'},
]

test('all seven resolved field outcomes create immutable display-only snapshots',()=>{
  for(const {args,outcome}of fixtures){
    const input=field(...args),before=clone(input),value=createBaseballFieldPresentation(input)
    assert.ok(value);assert.equal(value.outcome,outcome);assert.equal(value.version,BASEBALL_FIELD_PRESENTATION.id)
    assert.deepEqual(value.path,input.path);assert.deepEqual(value.decisionPoint,input.decisionPoint)
    assert.equal(value.playTimeMs,input.playTimeMs);assert.deepEqual(input,before)
    assert.ok(Object.isFrozen(value)&&Object.isFrozen(value.path)&&Object.isFrozen(value.path[0])&&Object.isFrozen(value.runner))
    assert.notEqual(value.path,input.path);assert.notEqual(value.path[0],input.path[0])
  }
})

test('an exact original path timestamp returns that point without recomputing a flight',()=>{
  for(const {args}of fixtures){
    const input=field(...args),value=createBaseballFieldPresentation(input)
    for(const expected of input.path){
      const sample=sampleBaseballFieldPresentation(value,expected.timeMs)
      assert.deepEqual(sample.ball,expected)
      assert.deepEqual(sample.trace.at(-1),expected)
      assert.equal(sample.trace.some(point=>point.timeMs>expected.timeMs),false)
    }
  }
})

test('a time between two samples interpolates only those already resolved coordinates',()=>{
  const value=createBaseballFieldPresentation(field(130,40,-45)),index=Math.floor(value.path.length/2)
  const a=value.path[index],b=value.path[index+1],time=a.timeMs+(b.timeMs-a.timeMs)*.37
  const sample=sampleBaseballFieldPresentation(value,time)
  for(const key of ['x','y','z'])close(sample.ball[key],a[key]+(b[key]-a[key])*.37)
  assert.equal(sample.ball.timeMs,time)
  assert.deepEqual(sample.trace.slice(0,-1),value.path.slice(0,index+1))
  assert.equal(sample.trace.at(-1),sample.ball)
})

test('no ball, reached wall, trace or moving runner is exposed before contact',()=>{
  const value=createBaseballFieldPresentation(field(130,40,-45)),sample=sampleBaseballFieldPresentation(value,-1)
  assert.equal(sample.started,false);assert.equal(sample.ball,null);assert.deepEqual(sample.trace,[]);assert.deepEqual(sample.wallContacts,[])
  assert.equal(sample.runner.progress,0);assert.equal(sample.runner.moving,false);assert.equal(sample.ballComplete,false)
})

test('the ball stops at its fielding decision while an existing throw time continues',()=>{
  const input=field(40,-28,-45),value=createBaseballFieldPresentation(input)
  assert.ok(input.playTimeMs>input.decisionPoint.timeMs)
  for(const time of [input.decisionPoint.timeMs,(input.decisionPoint.timeMs+input.playTimeMs)/2,input.playTimeMs,1e9]){
    const sample=sampleBaseballFieldPresentation(value,time)
    assert.deepEqual(sample.ball,input.decisionPoint);assert.deepEqual(sample.trace,input.path);assert.equal(sample.ballComplete,true)
    assert.equal(sample.playComplete,time>=input.playTimeMs);assert.ok(sample.elapsedMs<=input.playTimeMs)
  }
})

test('wall reflection follows the recorded inward path and reveals its wall only after arrival',()=>{
  const input=field(130,40,-45),value=createBaseballFieldPresentation(input),wall=input.wallContacts[0]
  assert.ok(wall);assert.deepEqual(sampleBaseballFieldPresentation(value,wall.timeMs-.001).wallContacts,[])
  const exact=input.path.find(point=>point.timeMs===wall.timeMs)
  assert.ok(exact);assert.deepEqual(sampleBaseballFieldPresentation(value,wall.timeMs).ball,exact)
  assert.deepEqual(sampleBaseballFieldPresentation(value,wall.timeMs).wallContacts,[wall])
  const last=sampleBaseballFieldPresentation(value,input.playTimeMs)
  assert.ok(Math.hypot(last.ball.x,last.ball.z)<Math.hypot(wall.x,wall.z))
})

test('an over-fence home run ends at its actual crossing without invented landing or base circuit',()=>{
  const input=field(140,28,-45),value=createBaseballFieldPresentation(input),sample=sampleBaseballFieldPresentation(value,1e9)
  assert.equal(value.outcome,'home-run');assert.equal(value.landingPoint,null)
  assert.deepEqual(sample.ball,input.decisionPoint);assert.ok(sample.ball.y>BASEBALL_FIELD_MODEL.stadium.fenceHeightM)
  assert.equal(sample.runner.awardedBases,4);assert.ok(sample.runner.progress<=1)
  assert.ok(sample.runner.position.x>=0&&sample.runner.position.z>=0)
})

test('a bounced ground-rule double remains a double even when its final point clears the wall',()=>{
  const input=field(130,36,-35),value=createBaseballFieldPresentation(input),sample=sampleBaseballFieldPresentation(value,input.playTimeMs)
  assert.equal(value.outcome,'double');assert.equal(value.reasonKey,'ground-rule-double');assert.equal(sample.runner.awardedBases,2)
  assert.equal(value.landingPoint.y,0);assert.deepEqual(sample.ball,input.decisionPoint)
})

test('runner first-base progress uses the supplied existing base time rather than a new speed',()=>{
  const input=clone(field(90,32,-45));input.runnerBaseTimesMs=[5000,9000,13000]
  const value=createBaseballFieldPresentation(input),start=BASEBALL_FIELD_MODEL.runner.startDelayMs,time=(start+5000)/2
  const sample=sampleBaseballFieldPresentation(value,time),edge=BASEBALL_FIELD_MODEL.baseDistanceM/Math.SQRT2
  close(sample.runner.progress,.5);close(sample.runner.meters,BASEBALL_FIELD_MODEL.baseDistanceM/2)
  close(sample.runner.position.x,edge/2);close(sample.runner.position.z,edge/2)
  assert.equal(sample.runner.firstBaseTimeMs,5000);assert.equal(sample.runner.firstBaseReached,false)
})

test('only the first few steps advance in the main-screen sample while the map can reach first base',()=>{
  const value=createBaseballFieldPresentation(field(140,56,45)),start=value.runner.startDelayMs
  const duration=(value.runner.firstBaseTimeMs-start)*4/BASEBALL_FIELD_MODEL.baseDistanceM
  const halfway=sampleBaseballFieldPresentation(value,start+duration/2)
  close(halfway.runner.firstSteps.progress,.5);close(halfway.runner.firstSteps.meters,2)
  assert.equal(halfway.runner.firstSteps.moving,true)
  const full=sampleBaseballFieldPresentation(value,value.playTimeMs)
  assert.equal(full.runner.firstSteps.meters,4);assert.equal(full.runner.firstSteps.complete,true);assert.equal(full.runner.firstSteps.moving,false)
  assert.equal(full.runner.progress,1);close(Math.hypot(full.runner.position.x,full.runner.position.z),BASEBALL_FIELD_MODEL.baseDistanceM)
  assert.equal(full.runner.awardedBases,3)
})

test('the exact first4m clock endpoint remains complete after performance-clock rounding',()=>{
  const value=createBaseballFieldPresentation(field(140,56,45)),start=value.runner.startDelayMs
  const duration=(value.runner.firstBaseTimeMs-start)*4/BASEBALL_FIELD_MODEL.baseDistanceM
  const elapsed=(1000+start+duration)-1000
  const sample=sampleBaseballFieldPresentation(value,elapsed)
  assert.equal(sample.runner.firstSteps.meters,4);assert.equal(sample.runner.firstSteps.progress,1)
  assert.equal(sample.runner.firstSteps.complete,true);assert.equal(sample.runner.firstSteps.moving,false)
  assert.equal(sample.runner.firstSteps.stopped,true)
  assert.ok(sample.runner.progress<1);assert.equal(sample.runner.firstBaseReached,false)
})

test('a groundout stops the runner before first and does not imply a safe base',()=>{
  const value=createBaseballFieldPresentation(field(40,-28,-45)),sample=sampleBaseballFieldPresentation(value,1e9)
  assert.ok(sample.runner.progress<1);assert.equal(sample.runner.firstBaseReached,false);assert.equal(sample.runner.awardedBases,0)
  assert.equal(sample.runner.moving,false);assert.equal(sample.playComplete,true)
})

test('caught fly and line drives end at their catches without a post-catch runner',()=>{
  for(const args of [[40,40,-5],[60,16,-10]]){
    const value=createBaseballFieldPresentation(field(...args)),at=sampleBaseballFieldPresentation(value,value.decisionPoint.timeMs),after=sampleBaseballFieldPresentation(value,1e9)
    assert.equal(value.playTimeMs,value.decisionPoint.timeMs);assert.deepEqual(after,at)
    assert.equal(after.runner.awardedBases,0);assert.equal(after.runner.moving,false)
  }
})

test('snapshot sampling never shares mutable source paths or changes later engine outcomes',()=>{
  const source=clone(field(90,32,-45)),value=createBaseballFieldPresentation(source),expected=sampleBaseballFieldPresentation(value,500)
  source.path[0].x=999;source.decisionPoint.z=-100;source.wallContacts.push({x:1,y:1,z:1,timeMs:1});source.runnerBaseTimesMs[0]=1
  assert.deepEqual(sampleBaseballFieldPresentation(value,500),expected)
  assert.deepEqual(field(90,32,-45),field(90,32,-45))
  assert.ok(Object.isFrozen(expected)&&Object.isFrozen(expected.trace)&&Object.isFrozen(expected.runner.firstSteps))
})

test('invalid, future-model and contradictory field data fails closed instead of being repaired',()=>{
  const original=field(140,28,-45)
  for(const mutate of [
    value=>{value.path[1].x=NaN},value=>{value.path[1].timeMs=value.path[0].timeMs},value=>{value.path.reverse()},
    value=>{value.path=[]},value=>{delete value.path[1]},value=>{value.path[0].timeMs=1},value=>{value.decisionPoint.x+=1},
    value=>{value.playTimeMs=value.decisionPoint.timeMs-1},value=>{value.playTimeMs=Infinity},value=>{value.modelVersion='future-model'},
    value=>{value.bases=2},value=>{value.reasonKey='ground-rule-double'},value=>{value.landingPoint={x:0,y:0,z:100}},
    value=>{value.runnerBaseTimesMs=[0,1,2]},value=>{value.wallContacts=[{x:1,y:2,z:3,timeMs:value.playTimeMs+1}]},
  ]){const value=clone(original);mutate(value);assert.equal(createBaseballFieldPresentation(value),null)}
  for(const value of [null,undefined,{},[],{outcome:'foul'},{outcome:'walk'},{outcome:'toString'}])assert.equal(createBaseballFieldPresentation(value),null)
})

test('the sampler rejects invalid clocks and forged or truncated presentation paths without throwing',()=>{
  const value=createBaseballFieldPresentation(field(90,32,-45))
  for(const time of [NaN,Infinity,-Infinity,undefined,null,'100'])assert.equal(sampleBaseballFieldPresentation(value,time),null)
  for(const bad of [null,{}, {...value,path:[]},{...value,path:[value.path[0],undefined]},
    {...value,path:new Array(2)},{...value,runner:null},{...value,playTimeMs:NaN},{...value,wallContacts:new Array(1)},
    {...value,bases:99},{...value,outcome:'unknown'},{...value,runner:{...value.runner,baseDistanceM:0}}])assert.equal(sampleBaseballFieldPresentation(bad,100),null)
})

test('live manual physical paths and confirmed result reactions have separate permission gates',()=>{
  assert.equal(canAnimateBaseballFieldPresentation({origin:'live',phase:'trajectory',currentManual:true}),true)
  assert.equal(canAnimateBaseballFieldPresentation({origin:'live',phase:'trajectory',currentManual:false,confirmed:true,authority:'server'}),false)
  assert.equal(canAnimateBaseballFieldPresentation({origin:'live',phase:'result',currentManual:true}),false)
  for(const authority of ['memory','server'])assert.equal(canAnimateBaseballFieldPresentation({origin:'live',phase:'result',confirmed:true,authority}),true)
  assert.equal(canAnimateBaseballFieldPresentation({origin:'live',phase:'result',confirmed:false,authority:'server'}),false)
  assert.equal(canAnimateBaseballFieldPresentation({origin:'live',confirmed:true,authority:'preview'}),false)
})

test('restored automatic replay and unknown sources never autoplay; preview needs its own authority',()=>{
  for(const origin of ['restored','automatic','replay','unknown',undefined])for(const phase of ['trajectory','result']){
    assert.equal(canAnimateBaseballFieldPresentation({origin,phase,currentManual:true,confirmed:true,authority:'server'}),false)
  }
  for(const phase of ['trajectory','result'])assert.equal(canAnimateBaseballFieldPresentation({origin:'preview',phase,authority:'preview'}),true)
  assert.equal(canAnimateBaseballFieldPresentation({origin:'preview',confirmed:true,authority:'server'}),false)
  assert.equal(canAnimateBaseballFieldPresentation({origin:'live',phase:'unknown',currentManual:true,confirmed:true,authority:'server'}),false)
})

test('a broad set of resolved paths stays finite, bounded and unchanged at every display sample',()=>{
  let count=0
  for(const speed of [40,60,90,120,140,170])for(const angle of [-28,-10,8,25,40,56])for(const direction of [-45,-20,0,20,45]){
    const input=field(speed,angle,direction),before=clone(input),value=createBaseballFieldPresentation(input)
    assert.ok(value,`${speed}/${angle}/${direction}`)
    for(const amount of [0,.13,.5,.87,1,1.5]){
      const sample=sampleBaseballFieldPresentation(value,input.playTimeMs*amount)
      assert.ok(sample&&Object.values(xyz(sample.ball)).every(Number.isFinite));assert.ok(sample.ball.timeMs<=input.decisionPoint.timeMs)
      assert.ok(sample.runner.progress>=0&&sample.runner.progress<=1);assert.ok(sample.runner.firstSteps.meters<=4)
      assert.ok(sample.trace.every(point=>point.timeMs<=sample.ball.timeMs))
    }
    assert.deepEqual(input,before);count++
  }
  assert.equal(count,180)
})
