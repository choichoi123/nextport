import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import { BASEBALL_AUDIO_REVISION, BASEBALL_ENTRANCE_AUDIO_REVISION, BASEBALL_FEEDBACK_DEFAULT_SETTINGS, createBaseballAudioEngine, getBaseballAudioAssets, getBaseballAudioCues, getBaseballEntranceAudioAssets, getBaseballEntranceAudioCues, normalizeBaseballFeedbackSettings } from '../lib/playground-baseball-audio.mjs'

const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve()}
function harness({slow=false,failKey=null,syncFailure=false}={}){
  const h={created:0,resumes:0,fetches:[],sources:[],gains:[],events:[],gesture:true,visible:true,time:100,failKey,slow,syncFailure}
  const metadata=new WeakMap()
  const parameter=()=>({value:0,values:[],setValueAtTime(value,at){this.value=value;this.values.push([value,at])},linearRampToValueAtTime(value,at){this.value=value;this.values.push([value,at])}})
  const node=()=>({connected:null,disconnected:false,connect(to){this.connected=to},disconnect(){this.disconnected=true}})
  const buffer=(duration,key='trimmed',sampleRate=1000,channels=1)=>({duration,sampleRate,numberOfChannels:channels,key,
    getChannelData(){return new Float32Array(Math.ceil(duration*sampleRate))},copyToChannel(){}})
  h.context={state:'suspended',currentTime:0,destination:{},
    resume(){h.resumes++;this.state='running';return Promise.resolve()},close(){this.state='closed';return Promise.resolve()},
    createGain(){const value={...node(),gain:parameter()};h.gains.push(value);return value},
    createDynamicsCompressor(){return {...node(),...Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,{value:0}]))}},
    createBuffer(channels,length,rate){return buffer(length/rate,'trimmed',rate,channels)},
    decodeAudioData(data){const key=metadata.get(data),seconds={'crowd-cheer.mp3':20.405,'entrance.wav':2,'bat-soft.wav':.44,'bat.wav':.58,'bat-strong.wav':.72,'mitt.wav':.46,'release.wav':.16,'pass.wav':.22,'swing.wav':.32,'call-real-strike.wav':.85,'call-real-out.wav':1.589,'call-real-strikeout.wav':1.25,'call-real-ball.wav':.72}[key]??.3;return Promise.resolve(buffer(seconds,key,1000,key==='crowd-cheer.mp3'?2:1))},
    createBufferSource(){const source={...node(),stopped:false,start(...args){this.args=args},stop(){this.stopped=true}};h.sources.push(source);return source},
  }
  h.engine=createBaseballAudioEngine({
    createContext:()=>{h.created++;return h.context},hasGesture:()=>h.gesture,isVisible:()=>h.visible,now:()=>h.time,onState:value=>h.events.push(value),
    fetchImpl:(url,{signal})=>{
      const parsed=new URL(url,'https://local.invalid'),key=parsed.pathname.split('/').at(-1);h.fetches.push({key,url,signal})
      if(h.syncFailure&&key===h.failKey)throw Error('Synchronous fetch failure')
      if(h.slow)return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('Aborted'),{name:'AbortError'})),{once:true}))
      return Promise.resolve({ok:key!==h.failKey,arrayBuffer:async()=>{const data=new ArrayBuffer(16);metadata.set(data,key);return data}})
    },
  })
  return h
}
const event=(type,extra={})=>({id:`example:${type}:1`,type,origin:'live',atMs:100,...extra})

test('baseball preferences accept only bounded volumes and supported strengths',()=>{
  assert.deepEqual(normalizeBaseballFeedbackSettings(null),BASEBALL_FEEDBACK_DEFAULT_SETTINGS)
  assert.deepEqual(normalizeBaseballFeedbackSettings({enabled:false,master:4,effects:-3,call:NaN,crowd:Infinity,strength:'cinema',unknown:'ignored'}),
    {enabled:false,entrance:true,master:1,effects:0,call:.85,crowd:.6,strength:'normal'})
  assert.equal(normalizeBaseballFeedbackSettings({enabled:false,entrance:false,master:.1}).entrance,false)
  assert.equal(normalizeBaseballFeedbackSettings({enabled:false,master:.1}).master,.1)
})

test('audio cues separate physical contact from a confirmed home run and historical sources',()=>{
  assert.equal(getBaseballAudioCues(event('contact',{quality:.9,outcome:'perfect'}))[0].key,'bat-strong')
  assert.deepEqual(getBaseballAudioCues(event('result',{outcome:'home-run'})),[])
  assert.deepEqual(getBaseballAudioCues(event('result',{outcome:'flyout',confirmed:true})),[])
  assert.deepEqual(getBaseballAudioCues(event('contact',{origin:'restored'})),[])
  assert.deepEqual(getBaseballAudioCues(event('result',{origin:'automatic',outcome:'home-run',confirmed:true})),[])
  const home=getBaseballAudioCues(event('result',{outcome:'home-run',confirmed:true}));assert.equal(home.length,1);assert.equal(home[0].key,'crowd')
  assert.deepEqual(getBaseballAudioCues(event('call',{call:'strikeout'}),'en'),[])
  assert.equal(getBaseballAudioCues(event('call',{call:'strikeout',confirmed:true}),'en')[0].key,'call-real-strikeout')
})

test('both UI languages share recorded calls; no electronic accent or synthetic fallback is requested',()=>{
  const korean=getBaseballAudioAssets('ko'),english=getBaseballAudioAssets('en')
  assert.deepEqual(korean,english);assert.equal(korean.length,12)
  assert.equal(korean.some(asset=>asset.key==='accent'||/^call-(ko|en)-/.test(asset.key)),false)
  for(const asset of korean)assert.equal(new URL(asset.url,'https://local.invalid').searchParams.get('v'),BASEBALL_AUDIO_REVISION)
  for(const call of ['foul','walk','unknown'])assert.deepEqual(getBaseballAudioCues(event('call',{call,confirmed:true})),[])
  for(const call of ['strike','out','strikeout','ball']){
    const value=Object.freeze(event('call',{call,confirmed:true}))
    assert.equal(getBaseballAudioCues(value,'ko')[0].key,`call-real-${call}`)
    assert.deepEqual(getBaseballAudioCues(value,'ko'),getBaseballAudioCues(value,'en'))
  }
})

test('creating the engine is silent and a gesture is required before any context or fetch',async()=>{
  const h=harness();assert.equal(h.created,0);assert.equal(h.fetches.length,0)
  h.gesture=false;assert.equal(await h.engine.prepare(),false);assert.equal(h.created,0);assert.equal(h.fetches.length,0);assert.equal(h.engine.state().status,'blocked')
  h.engine.close()
})

test('prepare resumes synchronously, caches the shared recordings and bounds crowd memory',async()=>{
  const h=harness(),pending=h.engine.prepare('ko')
  assert.equal(h.created,1);assert.equal(h.resumes,1)
  assert.equal(await pending,true);assert.equal(h.engine.state().decoded,12);assert.equal(h.engine.state().pending,0)
  assert.equal(h.fetches.some(value=>/^call-(ko|en)-/.test(value.key)),false)
  assert.equal(h.fetches.every(value=>value.url.endsWith(`?v=${BASEBALL_AUDIO_REVISION}`)),true)
  assert.equal(h.engine.play(event('result',{outcome:'home-run',confirmed:true})),true)
  assert.equal(h.sources.at(-1).buffer.duration,3.445);assert.equal(h.sources.at(-1).buffer.numberOfChannels,2)
  assert.equal(h.sources.at(-1).args[2],2.4)
  assert.equal(await h.engine.prepare('en'),true);assert.equal(h.fetches.length,12);assert.equal(h.engine.state().decoded,12)
  h.engine.close()
})

test('an event arriving before sample readiness is not queued or replayed after loading',async()=>{
  const h=harness(),contact=event('contact',{quality:.6})
  assert.equal(h.engine.play(contact),false)
  assert.equal(await h.engine.prepare(),true);assert.equal(h.sources.length,0)
  assert.equal(h.engine.play(contact),false);assert.equal(h.sources.length,0)
  assert.equal(h.engine.play({...contact,id:'example:contact:2'}),true);assert.equal(h.sources.length,1)
  h.engine.close()
})

test('contact samples use quality without implying hit or home run results',async()=>{
  const h=harness();await h.engine.prepare()
  for(const [n,quality,key]of [[1,.2,'bat-soft.wav'],[2,.55,'bat.wav'],[3,.95,'bat-strong.wav']]){
    assert.equal(h.engine.play(event('contact',{id:`contact:${n}`,quality,outcome:'contact'})),true)
    assert.equal(h.sources.at(-1).buffer.key,key)
  }
  assert.equal(h.sources.length,3);h.engine.close()
})

test('recorded impacts start at the current audio clock with a crisp onset and retained body',async()=>{
  const h=harness();await h.engine.prepare();h.context.currentTime=2
  const contact=Object.freeze(event('contact',{quality:.95,outcome:'perfect'}))
  assert.equal(h.engine.play(contact),true)
  const source=h.sources.at(-1),envelope=h.gains.at(-1).gain.values
  assert.deepEqual(source.args,[2,0,.72])
  assert.deepEqual(envelope[0],[0,2]);assert.deepEqual(envelope[1],[.84,2.002])
  assert.deepEqual(envelope[2],[.84,2+.72-.14]);assert.deepEqual(envelope[3],[0,2+.72])
  assert.equal(source.loop,false);assert.equal(h.sources.length,1)
  assert.equal(getBaseballAudioCues(event('release'))[0].level<getBaseballAudioCues(event('pass'))[0].level,true)
  assert.equal(getBaseballAudioCues(event('pass'))[0].level<getBaseballAudioCues(event('mitt'))[0].level,true)
  h.engine.close()
})

test('a confirmed home run uses one natural crowd rise and tail without a synthetic accent',async()=>{
  const h=harness();await h.engine.prepare();h.context.currentTime=3
  assert.equal(h.engine.play(event('result',{outcome:'home-run',confirmed:true})),true)
  assert.equal(h.sources.length,1)
  assert.deepEqual(h.sources[0].args,[3,0,2.4])
  assert.deepEqual(h.gains.at(-1).gain.values,[[0,3],[.65,3.18],[.65,3+2.4-.5],[0,3+2.4]])
  h.engine.close()
})

test('duplicate IDs, stale transients and muted events remain consumed without catch-up',async()=>{
  const h=harness();await h.engine.prepare()
  const first=event('swing');assert.equal(h.engine.play(first),true);assert.equal(h.engine.play(first),false)
  h.time=500;assert.equal(h.engine.play(event('pass')),false)
  h.engine.setSettings({enabled:false});assert.equal(h.engine.state().active,0)
  const muted=event('mitt',{atMs:500});assert.equal(h.engine.play(muted),false)
  h.engine.setSettings({enabled:true});assert.equal(h.engine.play(muted),false)
  assert.equal(h.engine.play({...muted,id:'mitt:new'}),true);h.engine.close()
})

test('voice and crowd stay single channel and a voice ducks the crowd until it ends',async()=>{
  const h=harness();await h.engine.prepare()
  h.engine.play(event('result',{outcome:'single',confirmed:true}))
  const crowd=h.sources.at(-1);assert.equal(h.engine.state().active,1)
  h.engine.play(event('call',{call:'strike',confirmed:true}));const first=h.sources.at(-1)
  assert.equal(h.gains[3].gain.value,.6*.27)
  h.engine.play(event('call',{id:'call:2',call:'out',confirmed:true}));assert.equal(first.stopped,true);assert.equal(h.engine.state().active,2)
  const second=h.sources.at(-1);second.onended();assert.equal(h.gains[3].gain.value,.6);assert.equal(crowd.stopped,false)
  h.engine.play(event('result',{id:'result:2',outcome:'double',confirmed:true}));assert.equal(crowd.stopped,true)
  h.engine.close()
})

test('a recorded out call keeps its entire natural utterance and tail',async()=>{
  const h=harness();await h.engine.prepare()
  assert.equal(h.engine.play(event('call',{call:'out',confirmed:true})),true)
  assert.equal(h.sources.at(-1).buffer.duration,1.589)
  assert.deepEqual(h.sources.at(-1).args,[0,0,1.589])
  assert.equal(getBaseballAudioAssets().find(asset=>asset.key==='call-real-out').maximumSeconds,1.8)
  h.engine.close()
})

test('effect concurrency is bounded and close releases every node and context',async()=>{
  const h=harness();await h.engine.prepare()
  for(let n=0;n<20;n++)h.engine.play(event('swing',{id:`swing:${n}`}))
  assert.equal(h.engine.state().active,6);assert.equal(h.sources.filter(s=>!s.stopped).length,6)
  h.engine.close();assert.equal(h.engine.state().active,0);assert.equal(h.context.state,'closed');assert.equal(h.sources.every(s=>s.stopped),true)
  assert.equal(h.engine.play(event('swing',{id:'after:close'})),false)
})

test('stop aborts in-flight preparation and never starts deferred audio after resume',async()=>{
  const h=harness({slow:true}),pending=h.engine.prepare();await flush();assert.equal(h.engine.state().pending,12)
  h.engine.stop();assert.equal(await pending,false);assert.equal(h.engine.state().pending,0);assert.equal(h.engine.state().active,0)
  assert.equal(h.fetches.every(x=>x.signal.aborted),true);assert.equal(h.sources.length,0)
  h.slow=false;assert.equal(await h.engine.prepare(),true);assert.equal(h.sources.length,0);h.engine.close()
})

test('a failed clip is isolated, retry is explicit, and synchronous fetch failure leaves no pending entry',async()=>{
  const h=harness({failKey:'call-real-out.wav',syncFailure:true})
  assert.equal(await h.engine.prepare(),false);assert.equal(h.engine.state().status,'partial');assert.equal(h.engine.state().decoded,11);assert.equal(h.engine.state().pending,0)
  assert.equal(h.engine.play(event('swing')),true);assert.equal(h.engine.play(event('call',{call:'out',confirmed:true})),false)
  h.failKey=null;assert.equal(await h.engine.prepare(),true);assert.equal(h.fetches.length,13)
  assert.equal(h.engine.play(event('call',{id:'call:retry',call:'out',confirmed:true})),true);h.engine.close()
})

test('hidden pages cannot initialize or start a new sound',async()=>{
  const h=harness();h.visible=false;assert.equal(await h.engine.prepare(),false);assert.equal(h.created,0)
  h.visible=true;await h.engine.prepare();h.visible=false;assert.equal(h.engine.play(event('swing')),false);assert.equal(h.sources.length,0);h.engine.close()
})

test('entry preparation is gesture-bound and fetches only its separate versioned clip',async()=>{
  const h=harness();h.gesture=false
  assert.equal(await h.engine.prepareEntrance(),false);assert.equal(h.created,0);assert.equal(h.fetches.length,0)
  h.gesture=true;const pending=h.engine.prepareEntrance()
  assert.equal(h.created,1);assert.equal(h.resumes,1);assert.equal(await pending,true)
  assert.equal(h.fetches.length,1);assert.equal(h.fetches[0].key,'entrance.wav')
  assert.equal(new URL(h.fetches[0].url,'https://local.invalid').searchParams.get('v'),BASEBALL_ENTRANCE_AUDIO_REVISION)
  assert.equal(h.engine.state().status,'idle');assert.equal(h.engine.state().entranceStatus,'ready')
  assert.equal(getBaseballAudioAssets().length,12);assert.equal(getBaseballAudioAssets().some(asset=>asset.key==='entrance'),false)
  assert.equal(getBaseballEntranceAudioAssets().length,1);assert.equal(h.sources.length,0)
  h.engine.close()
})

test('entry and normal effects share one context while entry cancellation leaves batting audio intact',async()=>{
  const h=harness();await h.engine.prepareEntrance();await h.engine.prepare()
  assert.equal(h.created,1);assert.equal(h.fetches.length,13)
  h.engine.play(event('swing'));const swing=h.sources.at(-1)
  assert.equal(h.engine.playEntrance(event('entrance',{confirmed:true})),true);const entrance=h.sources.at(-1)
  assert.equal(entrance.buffer.key,'entrance.wav')
  h.engine.stopEntrance();assert.equal(entrance.stopped,true);assert.equal(swing.stopped,false);assert.equal(h.engine.state().active,1)
  assert.equal(h.engine.playEntrance(event('entrance',{confirmed:true})),false)
  h.engine.close()
})

test('the selected two-second entrance keeps its final half-second and natural fade',async()=>{
  const h=harness();await h.engine.prepareEntrance()
  assert.equal(h.engine.playEntrance(event('entrance',{confirmed:true})),true)
  const source=h.sources.at(-1),envelope=h.gains.at(-1).gain.values
  assert.equal(source.buffer.duration,2);assert.equal(source.buffer.key,'entrance.wav')
  assert.deepEqual(source.args,[0,0,2]);assert.deepEqual(envelope,[[0,0],[.6,.02],[.6,1.88],[0,2]])
  assert.equal(h.engine.playEntrance(event('entrance',{confirmed:true})),false)
  assert.equal(getBaseballEntranceAudioAssets()[0].maximumSeconds,2);h.engine.close()
})

test('entry sound is consumed when muted, stale or unavailable and is never a generic gameplay event',async()=>{
  const h=harness();await h.engine.prepareEntrance()
  assert.deepEqual(getBaseballAudioCues(event('entrance',{confirmed:true})),[])
  assert.deepEqual(getBaseballEntranceAudioCues(event('entrance',{origin:'restored',confirmed:true})),[])
  h.engine.setSettings({entrance:false})
  const muted=event('entrance',{confirmed:true});assert.equal(h.engine.playEntrance(muted),false)
  h.engine.setSettings({entrance:true});assert.equal(h.engine.playEntrance(muted),false)
  h.time=601;assert.equal(h.engine.playEntrance(event('entrance',{id:'late',confirmed:true})),false)
  h.time=600;assert.equal(h.engine.playEntrance(event('entrance',{id:'boundary',confirmed:true})),true)
  h.engine.setSettings({effects:0});assert.equal(h.engine.state().active,0)
  assert.equal(await h.engine.prepareEntrance(),false);h.engine.close()
})

test('entry preparation cancellation aborts only its own request and never revives after decode',async()=>{
  const h=harness({slow:true}),ordinary=h.engine.prepare(),entrance=h.engine.prepareEntrance();await flush()
  assert.equal(h.fetches.length,13)
  h.engine.stopEntrance();assert.equal(await entrance,false)
  assert.equal(h.fetches.find(value=>value.key==='entrance.wav').signal.aborted,true)
  assert.equal(h.fetches.filter(value=>value.key!=='entrance.wav').every(value=>!value.signal.aborted),true)
  assert.equal(h.engine.state().pending,12);h.engine.stop();assert.equal(await ordinary,false)
  h.engine.close()
})

test('cancelling while resume is pending prevents any later entry request',async()=>{
  const h=harness();let resume
  h.context.resume=()=>{h.resumes++;return new Promise(resolve=>{resume=()=>{h.context.state='running';resolve()}})}
  const pending=h.engine.prepareEntrance();assert.equal(h.resumes,1)
  h.engine.stopEntrance();resume();assert.equal(await pending,false);assert.equal(h.fetches.length,0)
  h.engine.close()
})

test('entry clip failure stays separate from the common ready status and can be explicitly retried',async()=>{
  const h=harness({failKey:'entrance.wav'});await h.engine.prepare()
  assert.equal(await h.engine.prepareEntrance(),false);assert.equal(h.engine.state().status,'ready');assert.equal(h.engine.state().entranceStatus,'unavailable')
  assert.equal(h.engine.play(event('swing')),true);h.failKey=null
  assert.equal(await h.engine.prepareEntrance(),true);assert.equal(h.engine.state().decoded,13)
  h.engine.close()
})

test('the active delivered recordings have finite short PCM data and one bounded-size crowd source',async()=>{
  const folder=new URL('../public/audio/playground/baseball/',import.meta.url),assets=getBaseballAudioAssets(),seen=new Set()
  let totalBytes=0
  for(const asset of assets){
    const name=new URL(asset.url,'https://local.invalid').pathname.split('/').at(-1)
    assert.equal(seen.has(name),false);seen.add(name)
    const bytes=await readFile(new URL(name,folder));totalBytes+=bytes.length;assert.ok(bytes.length>500&&bytes.length<1024*1024)
    if(name.endsWith('.wav')){
      assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE')
      let format=null,dataBytes=0
      for(let at=12;at+8<=bytes.length;){
        const id=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),start=at+8
        assert.ok(start+length<=bytes.length,`${name}: truncated chunk`)
        if(id==='fmt ')format={encoding:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),rate:bytes.readUInt32LE(start+4),bits:bytes.readUInt16LE(start+14)}
        if(id==='data')dataBytes+=length
        at=start+length+(length%2)
      }
      assert.ok(format);assert.equal(format.encoding,1);assert.ok([1,2].includes(format.channels));assert.equal(format.bits,16);assert.ok([22050,44100,48000].includes(format.rate));assert.ok(dataBytes>0)
      const duration=dataBytes/(format.rate*format.channels*format.bits/8)
      assert.ok(duration>0&&duration<=asset.maximumSeconds+.001,`${name}: exceeds bounded clip contract`)
    }else assert.equal(name,'crowd-cheer.mp3')
  }
  assert.ok(totalBytes<2*1024*1024)
})

test('the separate optional entrance recording stays within its real PCM duration and size budget',async()=>{
  const asset=getBaseballEntranceAudioAssets()[0],url=new URL(asset.url,'https://local.invalid')
  const bytes=await readFile(new URL(`../public${url.pathname}`,import.meta.url))
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE')
  assert.ok(bytes.length>500&&bytes.length<1024*1024)
  let format=null,dataBytes=0
  for(let at=12;at+8<=bytes.length;){
    const id=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),start=at+8
    assert.ok(start+length<=bytes.length)
    if(id==='fmt ')format={encoding:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),rate:bytes.readUInt32LE(start+4),bits:bytes.readUInt16LE(start+14)}
    if(id==='data')dataBytes+=length
    at=start+length+(length%2)
  }
  assert.ok(format);assert.equal(format.encoding,1);assert.equal(format.bits,16)
  assert.ok([1,2].includes(format.channels));assert.ok([44100,48000].includes(format.rate));assert.ok(dataBytes>0)
  const duration=dataBytes/(format.channels*format.rate*format.bits/8)
  assert.equal(duration,2);assert.ok(duration<=asset.maximumSeconds)
  assert.equal(getBaseballAudioAssets().some(value=>value.url===asset.url),false)
})
