import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createBaseballGrowthSnapshot, judgeBaseballGrowthSwing } from '../lib/playground-baseball-growth.mjs'
import { BASEBALL_RULES, createBaseballPitch, sampleBaseballBat, sampleBaseballPlatePassage,
  judgeBaseballSwing } from '../lib/playground-baseball.mjs'
import { createBaseballStage, createBaseballProjection } from '../lib/playground-baseball-layout.mjs'
import { createBaseballFocusProjection } from '../lib/playground-baseball-focus.mjs'

// 별도 복제 계산 대신 설치된 Next SWC로 실제 컴포넌트를 변환해 순수 접목 함수를 실행한다.
// 브라우저 UI·이벤트 검증을 대신하지 않으며 컴포넌트 마운트/DB 호출은 하지 않는다.
const require = createRequire(import.meta.url)
const { transform, loadBindings } = require('next/dist/build/swc')
await loadBindings()
async function componentHelpers(relative, names) {
  const url = new URL(relative, import.meta.url), source = await fs.readFile(url, 'utf8')
  const libraries = new Map()
  for (const match of source.matchAll(/from ['"](@\/lib\/[^'"]+\.mjs)['"]/g)) {
    libraries.set(match[1], await import(new URL(`../${match[1].slice(2)}`, import.meta.url)))
  }
  const compiled = await transform(source, { filename:fileURLToPath(url),
    jsc:{parser:{syntax:'ecmascript',jsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},
    module:{type:'commonjs'} })
  const targetModule = { exports:{} }
  vm.runInNewContext(`${compiled.code}\nmodule.exports.__testHelpers={${names.join(',')}}`, {
    module:targetModule, exports:targetModule.exports, process,
    require:specifier => libraries.get(specifier) || (specifier.startsWith('react') ? require(specifier) : { __esModule:true,default:()=>null }),
  }, { filename:fileURLToPath(url) })
  return targetModule.exports.__testHelpers
}
const atBat = await componentHelpers('../components/playground/baseball-at-bat-game.js', ['captureGrowthSnapshot','judgeAtBatRoundSwing'])
const scene = await componentHelpers('../components/playground/baseball-scene.js', ['drawGrowthContactGuide','drawBatGuide'])
const owner = { careerId:'24000000-0000-4000-8000-000000000001',careerRevision:2,gameIndex:0,slot:1,mit:100,power:100 }
const snapshot = () => createBaseballGrowthSnapshot(owner)
const session = () => ({ schemaVersion:2,growthSnapshot:{...snapshot()},state:{growthSnapshot:{...snapshot()}} })
const copy = value => JSON.parse(JSON.stringify(value))
const close = (a,b,e=1e-9) => assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`)
function context() {
  const calls=[]
  return { calls, ctx:new Proxy({}, {
    get:(target,key)=>key in target?target[key]:(...args)=>calls.push([key,...args]),
    set:(target,key,value)=>{target[key]=value;calls.push(['set',key,value]);return true},
  }) }
}

test('실제 UI는 v2의top/state가일치할때만불변round스냅샷을복사하고후속변경과분리한다',()=>{
  const received=session(),captured=atBat.captureGrowthSnapshot(received)
  assert.deepEqual(captured,snapshot());assert.ok(Object.isFrozen(captured))
  assert.notEqual(captured,received.growthSnapshot)
  received.growthSnapshot.mit=40;received.state.growthSnapshot.mit=40
  assert.equal(captured.mit,100);assert.equal(captured.contactRadiusM,snapshot().contactRadiusM)
  assert.throws(()=>atBat.captureGrowthSnapshot(received,captured))
  assert.equal(atBat.captureGrowthSnapshot({schemaVersion:1}),null)
  assert.equal(atBat.captureGrowthSnapshot(undefined),null)
})

test('손상·누락·다른타석/능력스냅샷과v2에서v1으로의전환은기본판정으로대체하지않는다',()=>{
  for(const mutate of [s=>{delete s.growthSnapshot},s=>{delete s.state.growthSnapshot},
    s=>{s.state.growthSnapshot.mit=40},s=>{s.growthSnapshot.powerMultiplier=2},s=>{s.schemaVersion=3}]){
    const s=session();mutate(s);assert.throws(()=>atBat.captureGrowthSnapshot(s))
  }
  const different=createBaseballGrowthSnapshot({...owner,slot:2})
  assert.throws(()=>atBat.captureGrowthSnapshot({schemaVersion:2,growthSnapshot:different,state:{growthSnapshot:different}},snapshot()))
  assert.throws(()=>atBat.captureGrowthSnapshot({schemaVersion:1},snapshot()))
  assert.throws(()=>atBat.judgeAtBatRoundSwing(createBaseballPitch(),{},{}))
})

test('실제live/복구공통dispatch는고정스냅샷커널을사용하고null일때만기존타격을유지한다',()=>{
  const aim={x:0,y:.75},bat=sampleBaseballBat({swingElapsedMs:110,aim})
  const direction={x:(bat.end.x-bat.start.x)/.64,y:(bat.end.y-bat.start.y)/.64}
  const pitch=createBaseballPitch({seed:42,speedKmh:100,target:{x:-direction.y*.079,y:.75+direction.x*.079}})
  const input={swingAtMs:sampleBaseballPlatePassage(pitch).timeMs-110,aim,handedness:'right'}
  const pinned=atBat.captureGrowthSnapshot(session())
  const live=atBat.judgeAtBatRoundSwing(pitch,input,pinned),restored=atBat.judgeAtBatRoundSwing(pitch,input,pinned)
  assert.deepEqual(live,restored);assert.deepEqual(live,judgeBaseballGrowthSwing(pitch,input,pinned))
  assert.equal(live.contacted,true)
  assert.equal(atBat.judgeAtBatRoundSwing(pitch,input,null).outcome,'miss')
  assert.deepEqual(atBat.judgeAtBatRoundSwing(pitch,input,null),judgeBaseballSwing(pitch,input))
})

test('10구/D/v1의null반경은실제그리기에추가canvas호출을만들지않는다',()=>{
  const layout=createBaseballProjection(createBaseballStage(1000,700,'right'))
  const bat=sampleBaseballBat({swingElapsedMs:110,aim:{x:0,y:.75}})
  for(const radius of [null,undefined,NaN,Infinity,0,-1,.072,.09,'0.08']){
    const {ctx,calls}=context()
    assert.equal(scene.drawGrowthContactGuide(ctx,layout,bat,radius,'live'),null)
    assert.equal(calls.length,0)
  }
  const a=context(),b=context()
  scene.drawBatGuide(a.ctx,layout,bat,'live',true)
  scene.drawBatGuide(b.ctx,layout,bat,'live',true,null)
  assert.deepEqual(a.calls,b.calls)
})

test('양타석·기본/확대화면의초록capsule은기존배트끝점과합성반경을그대로투영한다',()=>{
  const radius=snapshot().contactRadiusM
  for(const hand of ['left','right'])for(const elapsed of [0,110,210]){
    const base=createBaseballProjection(createBaseballStage(1000,700,hand))
    const focus=createBaseballFocusProjection(base,{width:360,height:340})
    const bat=sampleBaseballBat({swingElapsedMs:elapsed,aim:{x:.12,y:.75},handedness:hand}),before=copy(bat)
    for(const layout of [base,focus]){
      const {ctx,calls}=context(),guide=scene.drawGrowthContactGuide(ctx,layout,bat,radius,'live')
      const a=layout.project(bat.start),b=layout.project(bat.end)
      close(guide.width,radius*(a.scale+b.scale));close(guide.start.x,a.x);close(guide.end.y,b.y)
      assert.ok(calls.some(row=>row[0]==='set'&&row[1]==='lineCap'&&row[2]==='round'))
      assert.ok(calls.some(row=>row[0]==='set'&&row[1]==='strokeStyle'&&row[2]==='#74d9a1'))
    }
    assert.deepEqual(bat,before)
    close(Math.hypot(bat.end.x-bat.start.x,bat.end.y-bat.start.y),.64)
    assert.equal(bat.radius,.033);assert.equal(BASEBALL_RULES.ballRadiusM,.04)
  }
})

test('유효시간밖live/복기에는확대범위를숨기고입력전110ms기준가이드만허용한다',()=>{
  const layout=createBaseballProjection(createBaseballStage(1000,700,'right'))
  for(const mode of ['live','review','preview'])for(const elapsed of [-.001,210.001,240,520]){
    const {ctx,calls}=context(),bat=sampleBaseballBat({swingElapsedMs:elapsed,aim:{x:0,y:.75}})
    assert.equal(scene.drawGrowthContactGuide(ctx,layout,bat,snapshot().contactRadiusM,mode),null)
    assert.equal(calls.length,0)
  }
  const reference={...sampleBaseballBat({swingElapsedMs:110,aim:{x:0,y:.75}}),active:false}
  assert.ok(scene.drawGrowthContactGuide(context().ctx,layout,reference,.073,'preview'))
  assert.equal(scene.drawGrowthContactGuide(context().ctx,layout,reference,.073,'review'),null)
})
