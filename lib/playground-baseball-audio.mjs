const clamp=(value,min,max)=>Math.max(min,Math.min(max,value))
const unit=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?clamp(value,0,1):fallback
export const BASEBALL_FEEDBACK_STORAGE_KEY='nextport.baseball.feedback.v1'
export const BASEBALL_AUDIO_REVISION='recorded-20261125-2'
export const BASEBALL_ENTRANCE_AUDIO_REVISION='entrance-20261125-2'
export const BASEBALL_FEEDBACK_DEFAULT_SETTINGS=Object.freeze({enabled:true,entrance:true,master:.25,effects:1,call:.85,crowd:.6,strength:'normal'})
export function normalizeBaseballFeedbackSettings(value={}){
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value:{}
  return {enabled:typeof input.enabled==='boolean'?input.enabled:true,entrance:typeof input.entrance==='boolean'?input.entrance:true,
    master:unit(input.master,.25),effects:unit(input.effects,1),call:unit(input.call,.85),crowd:unit(input.crowd,.6),
    strength:['normal','subtle','off'].includes(input.strength)?input.strength:'normal'}
}

const ROOT='/audio/playground/baseball/'
const assetUrl=name=>`${ROOT}${name}?v=${BASEBALL_AUDIO_REVISION}`
const effects=['release','pass','swing','bat-soft','bat','bat-strong','mitt']
// These are recorded English performances shared by both UI languages. Calls
// without a recording stay caption-only; an unavailable clip never falls back to TTS.
const calls=['strike','out','strikeout','ball']
const callSeconds=call=>call==='out'?1.8:1.5
export function getBaseballAudioAssets(){
  return [...effects.map(key=>({key,url:assetUrl(`${key}.wav`),maximumSeconds:1})),
    ...calls.map(call=>({key:`call-real-${call}`,url:assetUrl(`call-real-${call}.wav`),maximumSeconds:callSeconds(call)})),
    {key:'crowd',url:assetUrl('crowd-cheer.mp3'),maximumSeconds:3.445}]
}
export function getBaseballEntranceAudioAssets(){
  return [{key:'entrance',url:`${ROOT}entrance.wav?v=${BASEBALL_ENTRANCE_AUDIO_REVISION}`,maximumSeconds:2}]
}
export function getBaseballEntranceAudioCues(event){
  return event?.type==='entrance'&&event.confirmed===true&&typeof event.id==='string'&&event.id.length>0&&event.id.length<=512
    &&['live','preview'].includes(event.origin)&&Number.isFinite(event.atMs)
    ?[{key:'entrance',channel:'effects',level:.6,seconds:2,attackSeconds:.02,releaseSeconds:.12}]:[]
}

export function getBaseballAudioCues(event){
  if(!event||typeof event!=='object'||typeof event.id!=='string'||!event.id.length||event.id.length>512
    ||event.origin!==undefined&&!['live','preview'].includes(event.origin))return []
  // The pitcher is distant; the close bat and glove carry the physical impact.
  const base={release:['release',.07,.18,.015,.09],pass:['pass',.1,.25,.008,.15],swing:['swing',.23,.34,.003,.14],mitt:['mitt',.68,.5,.0015,.14]}[event.type]
  if(base)return [{key:base[0],channel:'effects',level:base[1],seconds:base[2],attackSeconds:base[3],releaseSeconds:base[4]}]
  if(event.type==='contact'){
    const quality=Number.isFinite(event.quality)?event.quality:0
    const [key,level,seconds]=quality>=.8||event.outcome==='perfect'?['bat-strong',.84,.75]:quality<.38?['bat-soft',.6,.5]:['bat',.76,.65]
    return [{key,channel:'effects',level,seconds,attackSeconds:.002,releaseSeconds:.14}]
  }
  if(event.type==='call'&&event.confirmed===true&&calls.includes(event.call))return [{key:`call-real-${event.call}`,channel:'call',level:event.call==='ball'?.72:.88,seconds:callSeconds(event.call),attackSeconds:.004,releaseSeconds:.055}]
  if(event.type==='result'&&event.confirmed===true){
    if(event.outcome==='home-run')return [{key:'crowd',channel:'crowd',level:.65,seconds:2.4,attackSeconds:.18,releaseSeconds:.5}]
    if(['single','double','triple'].includes(event.outcome))return [{key:'crowd',channel:'crowd',level:.38,seconds:1.1,attackSeconds:.12,releaseSeconds:.35}]
    if(event.outcome==='walk')return [{key:'crowd',channel:'crowd',level:.19,seconds:.75,attackSeconds:.1,releaseSeconds:.25}]
  }
  return []
}

/** No AudioContext, fetch, storage or audio nodes are created at module import. */
export function createBaseballAudioEngine({createContext=()=>{
  const Type=typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext)
  return Type?new Type():null
},fetchImpl=(...args)=>globalThis.fetch(...args),hasGesture=()=>typeof navigator==='undefined'||!navigator.userActivation||navigator.userActivation.isActive,
isVisible=()=>typeof document==='undefined'||!document.hidden&&document.hasFocus(),now=()=>performance.now(),onStatus=()=>{},onState=()=>{}}={}){
  let context=null,master=null,compressor=null,settings=normalizeBaseballFeedbackSettings(),status='idle',entranceStatus='idle',closed=false,generation=0,entranceGeneration=0
  const channels=new Map(),buffers=new Map(),requests=new Map(),active=new Set(),seen=new Map()
  const state=()=>({status,entranceStatus,decoded:buffers.size,pending:requests.size,active:active.size})
  const notify=()=>{if(!closed)onState(state())}
  const changeStatus=value=>{status=value;if(!closed)onStatus(value);notify()}
  function gains(){
    if(!context||!master)return
    const value=settings.enabled?settings.master:0
    master.gain.setValueAtTime(value,context.currentTime)
    const voice=[...active].some(item=>item.channel==='call')
    for(const [key,node]of channels)node.gain.setValueAtTime(settings[key]*(key==='crowd'&&voice ? .27 : 1),context.currentTime)
  }
  function stopNode(item){
    active.delete(item);item.source.onended=null
    try{item.source.stop()}catch{/* The source may already have ended. */}
    try{item.source.disconnect();item.gain.disconnect()}catch{/* A closed context is already disconnected. */}
  }
  function stop(){
    generation+=1
    entranceGeneration+=1
    for(const request of requests.values())request.controller.abort()
    requests.clear()
    for(const item of [...active])stopNode(item)
    if(entranceStatus==='loading')entranceStatus=buffers.has('entrance')?'ready':'idle'
    gains()
    if(status==='loading')changeStatus(getBaseballAudioAssets().some(asset=>buffers.has(asset.key))?'partial':'idle')
    else notify()
  }
  function stopEntrance(){
    entranceGeneration+=1
    const request=requests.get('entrance');request?.controller.abort();requests.delete('entrance')
    for(const item of [...active])if(item.key==='entrance')stopNode(item)
    if(entranceStatus==='loading')entranceStatus=buffers.has('entrance')?'ready':'idle'
    gains();notify()
  }
  function setSettings(value){
    const before=settings;settings=normalizeBaseballFeedbackSettings({...settings,...value})
    if(before.enabled&&!settings.enabled)stop()
    else if(!settings.entrance||settings.master<=0||settings.effects<=0)stopEntrance()
    gains();notify();return {...settings}
  }
  function init(){
    if(context)return true
    context=createContext()
    if(!context)return false
    master=context.createGain()
    if(typeof context.createDynamicsCompressor==='function'){
      compressor=context.createDynamicsCompressor()
      for(const [key,value]of Object.entries({threshold:-6,knee:8,ratio:12,attack:.003,release:.18}))compressor[key].value=value
      master.connect(compressor);compressor.connect(context.destination)
    }else master.connect(context.destination)
    for(const key of ['effects','call','crowd']){const node=context.createGain();node.connect(master);channels.set(key,node)}
    gains();return true
  }
  function boundedBuffer(buffer,maximumSeconds){
    if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>60||!Number.isFinite(buffer.sampleRate)||buffer.sampleRate<=0
      ||!Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||buffer.numberOfChannels>2)throw Error('Unsupported audio sample')
    if(buffer.duration<=maximumSeconds)return buffer
    const length=Math.max(1,Math.floor(maximumSeconds*buffer.sampleRate))
    const trimmed=context.createBuffer(buffer.numberOfChannels,length,buffer.sampleRate)
    for(let channel=0;channel<buffer.numberOfChannels;channel++)trimmed.copyToChannel(buffer.getChannelData(channel).subarray(0,length),channel)
    return trimmed
  }
  function load(asset,token){
    if(buffers.has(asset.key))return Promise.resolve(true)
    const previous=requests.get(asset.key);if(previous)return previous.promise
    const controller=new AbortController(),request={controller,promise:null}
    request.promise=Promise.resolve().then(async()=>{
      try{
        const response=await fetchImpl(asset.url,{signal:controller.signal,credentials:'omit',cache:'force-cache'})
        if(!response.ok)throw Error('Audio sample unavailable')
        const data=await response.arrayBuffer()
        if(data.byteLength>1024*1024)throw Error('Audio sample exceeds the clip budget')
        if(closed||token!==generation||controller.signal.aborted)return false
        const decoded=await context.decodeAudioData(data)
        if(closed||token!==generation||controller.signal.aborted)return false
        buffers.set(asset.key,boundedBuffer(decoded,asset.maximumSeconds));return true
      }catch{return false}finally{if(requests.get(asset.key)===request)requests.delete(asset.key);notify()}
    })
    requests.set(asset.key,request);notify();return request.promise
  }
  async function prepare(locale='ko'){
    if(closed||!settings.enabled||!isVisible())return false
    const token=generation
    try{
      if(!hasGesture()&&!context){changeStatus('blocked');return false}
      if(!init()){changeStatus('unavailable');return false}
      if(context.state!=='running'){
        if(!hasGesture()){changeStatus('blocked');return false}
        // Called synchronously before the first await while the initiating click is active.
        const resumed=context.resume();await resumed
      }
      if(closed||token!==generation||!settings.enabled||!isVisible())return false
      if(context.state!=='running'){changeStatus('blocked');return false}
      const assets=getBaseballAudioAssets(locale)
      if(assets.every(asset=>buffers.has(asset.key))){changeStatus('ready');return true}
      changeStatus('loading')
      const results=await Promise.all(assets.map(asset=>load(asset,token)))
      if(closed||token!==generation||!settings.enabled||!isVisible())return false
      const all=results.every(Boolean);changeStatus(all?'ready':assets.some(asset=>buffers.has(asset.key))?'partial':'unavailable');return all
    }catch{if(!closed&&token===generation)changeStatus('unavailable');return false}
  }
  async function prepareEntrance(){
    if(closed||!settings.enabled||!settings.entrance||settings.master<=0||settings.effects<=0||!isVisible())return false
    const token=generation,entranceToken=entranceGeneration
    const publish=value=>{entranceStatus=value;notify()}
    try{
      if(!hasGesture()&&!context){publish('blocked');return false}
      if(!init()){publish('unavailable');return false}
      if(context.state!=='running'){
        if(!hasGesture()){publish('blocked');return false}
        // Keep resume inside the initiating entry click, before any server await.
        const resumed=context.resume();await resumed
      }
      if(closed||token!==generation||entranceToken!==entranceGeneration||!settings.enabled||!settings.entrance||!isVisible())return false
      if(context.state!=='running'){publish('blocked');return false}
      if(buffers.has('entrance')){publish('ready');return true}
      publish('loading')
      const ready=await load(getBaseballEntranceAudioAssets()[0],token)
      if(closed||token!==generation||entranceToken!==entranceGeneration||!settings.enabled||!settings.entrance||!isVisible())return false
      publish(ready?'ready':'unavailable');return ready
    }catch{if(!closed&&token===generation&&entranceToken===entranceGeneration)publish('unavailable');return false}
  }
  function start(cue){
    const buffer=buffers.get(cue.key),channel=channels.get(cue.channel)
    if(!buffer||!channel)return false
    if(cue.channel!=='effects'){
      for(const old of [...active])if(old.channel===cue.channel)stopNode(old)
    }else if([...active].filter(item=>item.channel==='effects').length>=6){
      const oldest=[...active].find(item=>item.channel==='effects');if(oldest)stopNode(oldest)
    }
    const source=context.createBufferSource(),gain=context.createGain(),seconds=Math.min(buffer.duration,cue.seconds),at=context.currentTime
    source.buffer=buffer;source.loop=false;source.connect(gain);gain.connect(channel)
    // Keep a recorded impact's onset sharp and let its body decay. Crowd rises
    // more slowly, so it does not sound like another hit at confirmation time.
    const attack=Math.min(cue.attackSeconds??.008,seconds/4),fade=Math.min(cue.releaseSeconds??.035,seconds/2)
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(cue.level,at+attack)
    gain.gain.setValueAtTime(cue.level,at+seconds-fade);gain.gain.linearRampToValueAtTime(0,at+seconds)
    const item={source,gain,channel:cue.channel,key:cue.key}
    source.onended=()=>{active.delete(item);try{source.disconnect();gain.disconnect()}catch{/* Already disconnected. */}gains();notify()}
    active.add(item);gains();source.start(at,0,seconds);notify();return true
  }
  function play(event,locale='ko'){
    if(closed||!event||typeof event.id!=='string'||typeof event.type!=='string')return false
    const id=`${event.id}:${event.type}`
    if(seen.has(id))return false
    seen.set(id,now());if(seen.size>512)seen.delete(seen.keys().next().value)
    const cues=getBaseballAudioCues(event,locale)
    if(!cues.length||!settings.enabled||settings.master<=0||!isVisible()||!context||context.state!=='running')return false
    if(Number.isFinite(event.atMs)&&now()-event.atMs>(['call','result'].includes(event.type)?1600:220))return false
    let played=false
    try{for(const cue of cues)if(settings[cue.channel]>0)played=start(cue)||played;return played}catch{stop();changeStatus('unavailable');return false}
  }
  function playEntrance(event){
    if(closed||!event||typeof event.id!=='string')return false
    const id=`${event.id}:entrance`
    if(seen.has(id))return false
    seen.set(id,now());if(seen.size>512)seen.delete(seen.keys().next().value)
    const cues=getBaseballEntranceAudioCues(event),age=now()-event.atMs
    if(!cues.length||age<0||age>500||!settings.enabled||!settings.entrance||settings.master<=0||settings.effects<=0
      ||!isVisible()||!context||context.state!=='running')return false
    try{return start(cues[0])}catch{stopEntrance();entranceStatus='unavailable';notify();return false}
  }
  function close(){
    if(closed)return
    stop();closed=true;buffers.clear();seen.clear()
    for(const channel of channels.values())channel.disconnect();channels.clear()
    master?.disconnect();compressor?.disconnect()
    if(context&&context.state!=='closed')void Promise.resolve(context.close()).catch(()=>{})
    context=null;master=null;compressor=null
  }
  return {prepare,play,stop,prepareEntrance,playEntrance,stopEntrance,setSettings,close,state}
}
