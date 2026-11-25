import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {BASEBALL_ENTRANCE,createBaseballEntranceController} from '../lib/playground-baseball-entrance.mjs'
import {BASEBALL_FEEDBACK_DEFAULT_SETTINGS,normalizeBaseballFeedbackSettings} from '../lib/playground-baseball-audio.mjs'

const flush=async()=>{for(let n=0;n<8;n++)await Promise.resolve()}
const player={name:'선수',teamId:'heroes',handedness:'right',jerseyNumber:'07'}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function harness({ready=true,playThrows=false}={}){
  const h={now:1000,allowed:true,intros:[],plays:[],prepares:0,stops:0,timers:new Map(),serial:0,pending:deferred()}
  h.advance=at=>{h.now=at;for(const [id,value]of [...h.timers].sort((a,b)=>a[1].at-b[1].at))if(value.at<=at&&h.timers.has(id)){h.timers.delete(id);value.fn()}}
  h.controller=createBaseballEntranceController({idPrefix:'local-test',now:()=>h.now,isAllowed:()=>h.allowed,
    setTimer:(fn,ms)=>{const id=++h.serial;h.timers.set(id,{fn,at:h.now+ms});return id},clearTimer:id=>h.timers.delete(id),
    prepareAudio:()=>{h.prepares++;return ready===null?h.pending.promise:ready},
    playAudio:event=>{h.plays.push(event);if(playThrows)throw Error('Device unavailable');return true},
    stopAudio:()=>{h.stops++},onIntro:value=>h.intros.push(value)})
  return h
}

test('preparation keeps the initiating synchronous gesture and never plays before a successful entry',async()=>{
  const h=harness(),token=h.controller.prepare()
  assert.equal(h.prepares,1);assert.equal(h.plays.length,0);assert.equal(h.intros.length,0)
  await flush();assert.equal(h.plays.length,0)
  assert.equal(h.controller.enter(token,player),true);assert.equal(h.plays.length,1)
  assert.equal(h.plays[0].type,'entrance');assert.equal(h.plays[0].atMs,1000);assert.equal(h.plays[0].origin,'live')
  assert.equal(h.intros[0].durationMs,2000);assert.equal(h.intros[0].player.jerseyNumber,'07')
  h.controller.dispose()
})

test('server work may finish later; entry timing starts only at successful enter',async()=>{
  const h=harness(),token=h.controller.prepare();await flush();h.advance(12000)
  assert.equal(h.controller.enter(token,player),true);assert.equal(h.plays[0].atMs,12000)
  assert.equal(h.intros[0].startAt,12000);h.controller.dispose()
})

test('a clip ready within500ms plays once while duplicate successful-entry calls are rejected',async()=>{
  const h=harness({ready:null}),token=h.controller.prepare();assert.equal(h.controller.enter(token,player),true)
  assert.equal(h.controller.enter(token,player),false);h.advance(1499);h.pending.resolve(true);await flush()
  assert.equal(h.plays.length,1);assert.equal(h.plays[0].atMs,1000)
  h.advance(1500);assert.equal(h.plays.length,1);h.controller.dispose()
})

test('late or failed loading is consumed without delaying or hiding the visual introduction',async()=>{
  for(const reject of [false,true]){
    const h=harness({ready:null}),token=h.controller.prepare();h.controller.enter(token,player)
    h.advance(1500);if(reject)h.pending.reject(Error('Offline'));else h.pending.resolve(true);await flush()
    assert.equal(h.plays.length,0);assert.equal(h.intros.length,1)
    h.advance(3000);assert.equal(h.intros.at(-1),null);h.controller.dispose()
  }
})

test('a rejected or throwing audio device never prevents a valid visual entry',async()=>{
  for(const options of [{ready:false},{ready:true,playThrows:true}]){
    const h=harness(options),token=h.controller.prepare();await flush()
    assert.doesNotThrow(()=>assert.equal(h.controller.enter(token,player),true))
    assert.equal(h.intros[0].player.name,'선수');h.controller.dispose()
  }
})

test('cancel before or after entry invalidates pending completion and its introduction timers',async()=>{
  for(const entered of [false,true]){
    const h=harness({ready:null}),token=h.controller.prepare();if(entered)h.controller.enter(token,player)
    h.controller.cancel();h.pending.resolve(true);await flush();h.advance(10000)
    assert.equal(h.controller.enter(token,player),false);assert.equal(h.plays.length,0);assert.equal(h.timers.size,0)
    assert.equal(h.intros.filter(Boolean).length,entered?1:0);h.controller.dispose()
  }
})

test('a newer explicit intent rejects older tokens and cannot inherit their asynchronous readiness',async()=>{
  const h=harness({ready:null}),old=h.controller.prepare(),current=h.controller.prepare()
  assert.notEqual(old.id,current.id);assert.equal(h.controller.enter(old,player),false)
  h.controller.enter(current,player);h.pending.resolve(true);await flush()
  assert.equal(h.plays.length,1);assert.equal(h.plays[0].id,current.id);h.controller.dispose()
})

test('foreign copied tokens and missing intents never autoplay a mounted or restored player',async()=>{
  const a=harness(),b=harness(),token=a.controller.prepare();await flush()
  assert.equal(a.controller.enter({...token},player),false);assert.equal(b.controller.enter(token,player),false)
  assert.equal(a.controller.enter(null,player),false);assert.equal(b.plays.length,0)
  a.controller.dispose();b.controller.dispose()
})

test('muted entry is consumed and re-enabling while pending does not replay old music',async()=>{
  const h=harness({ready:null}),token=h.controller.prepare();h.allowed=false;h.controller.enter(token,player)
  h.allowed=true;h.pending.resolve(true);await flush()
  assert.equal(h.plays.length,0);assert.equal(h.intros[0].player.name,'선수');h.controller.dispose()
})

test('silencing a current or preparing entry keeps its name panel and consumes delayed sound',async()=>{
  for(const beforeEnter of [false,true]){
    const h=harness({ready:null}),token=h.controller.prepare()
    if(beforeEnter)h.controller.silence()
    h.controller.enter(token,player);if(!beforeEnter)h.controller.silence()
    h.pending.resolve(true);await flush();assert.equal(h.plays.length,0);assert.equal(h.intros.length,1)
    h.advance(2999);assert.equal(h.intros.length,1);h.advance(3000);assert.equal(h.intros.at(-1),null)
    h.controller.dispose()
  }
})

test('preview must be explicit and restored/automatic/unknown entry origins are rejected',async()=>{
  const h=harness()
  for(const origin of ['restored','automatic','replay','unknown'])assert.equal(h.controller.prepare({origin}),null)
  assert.equal(h.prepares,0)
  const token=h.controller.prepare({origin:'preview'});await flush();h.controller.enter(token,player)
  assert.equal(h.intros[0].origin,'preview');assert.equal(h.plays[0].origin,'preview');h.controller.dispose()
})

test('the introduction keeps the selected tune last half-second without extending its500ms readiness deadline',async()=>{
  const h=harness(),token=h.controller.prepare();await flush();h.controller.enter(token,player)
  h.advance(2500);assert.equal(h.intros.length,1);assert.equal(h.intros[0].durationMs,2000)
  h.advance(2999);assert.equal(h.intros.length,1);h.advance(3000);assert.equal(h.intros.at(-1),null)
  assert.equal(h.plays.length,1);assert.equal(BASEBALL_ENTRANCE.maximumAudioDelayMs,500)
  h.controller.dispose()
})

test('introduction uses the existing strict player contract and preserves normalized names and07',async()=>{
  const h=harness();let token=h.controller.prepare();await flush()
  assert.equal(h.controller.enter(token,{...player,name:'  선수  '}),true)
  assert.equal(h.intros[0].player.name,'선수');assert.equal(h.intros[0].player.jerseyNumber,'07')
  for(const value of [null,{}, {...player,name:'x'.repeat(17)}, {...player,name:'x\u0000'}, {...player,teamId:'not-a-team'},
    {...player,handedness:'both'}, {...player,jerseyNumber:'100'}]){
    token=h.controller.prepare();assert.equal(h.controller.enter(token,value),false)
  }
  h.controller.dispose()
})

test('disposing invalidates every callback and leaves no timer, sound or later entry',async()=>{
  const h=harness({ready:null}),token=h.controller.prepare();h.controller.enter(token,player);h.controller.dispose()
  h.pending.resolve(true);await flush();h.advance(100000)
  assert.equal(h.plays.length,0);assert.equal(h.timers.size,0);assert.equal(h.controller.enter(token,player),false)
  assert.equal(h.controller.prepare(),null);assert.equal(BASEBALL_ENTRANCE.maximumAudioDelayMs,500)
})

// A tiny effect runner exercises ownership and cleanup without a browser/DB.
function hookHarness(file,exportName,imports,globals={}){
  const slots=[],pending=[],state={cursor:0,render:null,cleanups:[],events:0,storage:0}
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]))
  const useRef=value=>{const index=state.cursor++;return slots[index]??(slots[index]={current:value})}
  const useState=initial=>{const index=state.cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value}]}
  const useCallback=(fn,deps)=>{const index=state.cursor++;if(!slots[index]||!equal(slots[index].deps,deps))slots[index]={value:fn,deps};return slots[index].value}
  const useEffect=(fn,deps)=>{const index=state.cursor++;if(!slots[index]||!equal(slots[index].deps,deps)){const old=slots[index];slots[index]={deps,cleanup:old?.cleanup};pending.push(()=>{old?.cleanup?.();slots[index].cleanup=fn()})}}
  const window={localStorage:{getItem(){state.storage++;return null},setItem(){state.storage++}},addEventListener(){state.events++},removeEventListener(){}}
  const document={hidden:false,hasFocus:()=>true,addEventListener(){state.events++},removeEventListener(){}}
  const source=readFileSync(new URL(`../${file}`,import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replace(`export default function ${exportName}`,`function ${exportName}`)
  const context={...imports,...globals,useRef,useState,useCallback,useEffect,useId:()=>':test:',window,document,performance:{now:()=>1000},setTimeout,clearTimeout}
  vm.runInNewContext(`${source}\nglobalThis.hook=${exportName}`,context)
  state.run=props=>{state.cursor=0;const value=context.hook(props);while(pending.length)pending.shift()();return value}
  state.dispose=()=>{for(const slot of slots)slot?.cleanup?.()}
  return state
}

test('disabled child entrance hooks never prepare or stop the parent feedback owner',()=>{
  let calls=0
  const feedback={settings:{enabled:true,entrance:true,master:.25,effects:1},prepareEntrance(){calls++},emitEntrance(){calls++},stopEntrance(){calls++}}
  const h=hookHarness('components/playground/use-baseball-entrance.js','useBaseballEntrance',{createBaseballEntranceController})
  const value=h.run({feedback,enabled:false,locale:'ko'});assert.equal(value.intro,null);assert.equal(value.prepare(),null);assert.equal(value.enter({},player),false);value.cancel()
  h.run({feedback,enabled:false,locale:'en'});h.dispose();assert.equal(calls,0);assert.equal(h.events,0)
})

test('entrance cleanup stops the captured old owner rather than a newly supplied disabled parent',()=>{
  let oldStops=0,parentStops=0
  const old={settings:{enabled:true,entrance:true,master:.25,effects:1},prepareEntrance:()=>true,emitEntrance:()=>true,stopEntrance:()=>oldStops++}
  const parent={...old,stopEntrance:()=>parentStops++}
  const h=hookHarness('components/playground/use-baseball-entrance.js','useBaseballEntrance',{createBaseballEntranceController})
  h.run({feedback:old,enabled:true});h.run({feedback:parent,enabled:false});h.dispose()
  assert.ok(oldStops>0);assert.equal(parentStops,0)
})

test('the audio-only entrance preference consumes music while retaining the active introduction',async()=>{
  let stops=0
  const feedback={settings:{enabled:true,entrance:true,master:.25,effects:1},prepareEntrance:()=>true,emitEntrance:()=>true,stopEntrance:()=>stops++}
  const h=hookHarness('components/playground/use-baseball-entrance.js','useBaseballEntrance',{createBaseballEntranceController})
  let value=h.run({feedback});const token=value.prepare();await flush();value.enter(token,player)
  value=h.run({feedback});assert.equal(value.intro.player.name,'선수')
  value=h.run({feedback:{...feedback,settings:{...feedback.settings,entrance:false}}})
  assert.equal(value.intro.player.name,'선수');assert.ok(stops>0);h.dispose()
})

test('disabled feedback ownership installs no engine, storage restoration or browser listeners',async()=>{
  let engines=0
  const h=hookHarness('components/playground/use-baseball-feedback.js','useBaseballFeedback',{
    BASEBALL_FEEDBACK_DEFAULT_SETTINGS,BASEBALL_FEEDBACK_STORAGE_KEY:'unused',normalizeBaseballFeedbackSettings,
    createBaseballAudioEngine:()=>{engines++;throw Error('A disabled child must not own audio')},
  })
  const value=h.run({locale:'ko',disabled:true});assert.equal(await value.prepare(),false);assert.equal(await value.prepareEntrance(),false)
  assert.equal(value.emitEntrance({}),false);value.stop();value.stopEntrance();value.setEnabled(false)
  h.run({locale:'en',disabled:true});h.dispose()
  assert.equal(engines,0);assert.equal(h.storage,0);assert.equal(h.events,0)
})

test('a live feedback override selects its parent and disables the otherwise mandatory owned hook',()=>{
  const ownedOptions=[],calls=[]
  const parent={stop:()=>calls.push('parent-stop'),prepare:()=>calls.push('parent-prepare'),emit:()=>calls.push('parent-emit')}
  const h=hookHarness('components/playground/use-baseball-live-feedback.js','useBaseballLiveFeedback',{
    useBaseballFeedback:options=>{ownedOptions.push(options);return {stop:()=>{throw Error('Disabled child used')}}},
    createBaseballFeedbackGate:()=>({take:()=>[]}),getBaseballFlightFeedbackEvents:()=>[],getBaseballResultFeedbackEvents:()=>[],BASEBALL_RULES:{windupMs:1000},
  })
  const value=h.run({locale:'ko',mode:'at-bat',feedbackOverride:parent})
  assert.equal(value.feedback,parent);assert.equal(ownedOptions.length,1);assert.equal(ownedOptions[0].disabled,true)
  value.prepare();assert.deepEqual(calls,['parent-stop','parent-prepare']);h.dispose()
})
