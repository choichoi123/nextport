import { createBaseballIndexedDbRepository } from './playground-baseball-outbox.mjs'
import { validateBaseballPlayer } from './playground-baseball-teams.mjs'
import { BASEBALL_RULES, judgeBaseballTake } from './playground-baseball.mjs'
import { isBaseballAtBatPitchMode } from './playground-baseball-practice-pitches.mjs'
import { createBaseballLocalId } from './playground-baseball-data.mjs'

export const BASEBALL_AT_BAT_JOURNAL_DATABASE = 'nextport-baseball-at-bats-v1'
export const BASEBALL_AT_BAT_JOURNAL_LIMITS = Object.freeze({ sessions:100, bytes:10*1024*1024 })
const ENDPOINT='/api/playground/baseball/at-bats'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const clone=value=>JSON.parse(JSON.stringify(value))
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength
const fail=code=>Object.assign(new Error('At-bat storage unavailable'),{code})
const codes=new Set(['storage_unavailable','storage_full','storage_capacity','local_capacity','local_conflict','local_data_invalid','network_unavailable','not_configured','database_unavailable','invalid_response','owner_required','revision_conflict','command_conflict','version_mismatch','invalid_submission','invalid_command','body_too_large','rate_limited','verification_unavailable','not_found','input_required','input_already_accepted','invalid_transition','session_complete','pitch_required','pitch_paused','at_bat_complete'])
const safeCode=cause=>codes.has(cause?.code)?cause.code:cause?.name==='QuotaExceededError'?'storage_full':'network_unavailable'
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key))
const idFor=()=>{const id=createBaseballLocalId();if(!id)throw fail('storage_unavailable');return id}

const isTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value
const configKeys=['handedness','pitcherHandedness','baseSpeedKmh','pitchMode']
const statKeys=['PA','AB','H','2B','3B','HR','BB','SO']
const finalOutcomes=new Set(['walk','strikeout-looking','strikeout-swinging','single','double','triple','home-run','flyout','lineout','groundout'])
function validInput(input,pitch){
  if(exact(input,['kind'])&&input.kind==='take')return true
  return plain(input)&&['kind','swingAtMs','aim'].every(key=>Object.hasOwn(input,key))&&Object.keys(input).every(key=>['kind','swingAtMs','aim','source','surface'].includes(key))
    &&input.kind==='swing'&&Number.isFinite(input.swingAtMs)&&input.swingAtMs>=-BASEBALL_RULES.windupMs&&input.swingAtMs<=pitch.flightTimeMs+BASEBALL_RULES.resolveAfterMs
    &&exact(input.aim,['x','y'])&&Number.isFinite(input.aim.x)&&Math.abs(input.aim.x)<=2&&Number.isFinite(input.aim.y)&&input.aim.y>=-.5&&input.aim.y<=2.5
    &&(input.source===undefined||['keyboard','pointer','mouse','touch','button','unknown'].includes(input.source))&&(input.surface===undefined||['field','focus'].includes(input.surface))
}
function validPitch(pitch){
  try{if(!plain(pitch)||Object.hasOwn(pitch,'seed')||Object.hasOwn(pitch,'id'))return false;judgeBaseballTake(pitch);return true}catch{return false}
}
function publicJson(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return true
  if(typeof value==='number')return Number.isFinite(value)
  if(Array.isArray(value))return value.every(publicJson)
  return plain(value)&&Object.entries(value).every(([key,child])=>!['seed','ownerHash','secret','databaseUrl','token','cookie','attempts'].includes(key)&&publicJson(child))
}
export function validBaseballAtBatCheckpoint(value) {
  try{
    if(!exact(value,['schemaVersion','id','revision','createdAt','updatedAt','source','config','versions','state','pending','finalReceipt','trust'])||value.schemaVersion!==1||!UUID.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<1
      ||!isTime(value.createdAt)||!isTime(value.updatedAt)||value.updatedAt<value.createdAt||!['manual','development'].includes(value.source)||value.trust!=='server-recalculated-input-unverified'||!publicJson(value))return false
    const config=value.config,state=value.state,versions=value.versions
    if(!exact(config,configKeys)||!['left','right'].includes(config.handedness)||!['left','right'].includes(config.pitcherHandedness)||!Number.isFinite(config.baseSpeedKmh)||config.baseSpeedKmh<80||config.baseSpeedKmh>160||!isBaseballAtBatPitchMode(config.pitchMode))return false
    if(!exact(versions,['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','atBatId','pitchPolicyId','fieldModelId','sessionId'])||!['engineHash','rulesHash','atBatHash','fieldHash','sessionHash'].every(key=>/^[a-f0-9]{64}$/.test(versions[key]))
      ||!['atBatId','pitchPolicyId','fieldModelId','sessionId'].every(key=>typeof versions[key]==='string'&&versions[key].length<100))return false
    if(!exact(state,['id',...configKeys,'rulesVersion','pitchPolicyVersion','balls','strikes','pitchCount','status','outcome','history','stats'])||state.id!==value.id||!configKeys.every(key=>state[key]===config[key])
      ||!Number.isSafeInteger(state.pitchCount)||state.pitchCount<0||!Number.isInteger(state.balls)||state.balls<0||state.balls>4||!Number.isInteger(state.strikes)||state.strikes<0||state.strikes>3
      ||state.rulesVersion!==versions.atBatId||state.pitchPolicyVersion!==versions.pitchPolicyId||!['active','complete'].includes(state.status)||!Array.isArray(state.history)||state.history.length!==Math.min(20,state.pitchCount)||!exact(state.stats,statKeys)||!statKeys.every(key=>[0,1].includes(state.stats[key])))return false
    if(state.status==='active'&&(state.outcome!==null||state.balls>3||state.strikes>2||statKeys.some(key=>state.stats[key]!==0)))return false
    if(state.status==='complete'&&(!finalOutcomes.has(state.outcome)||state.stats.PA!==1||state.stats.AB!==(state.outcome==='walk'?0:1)||state.stats.BB!==(state.outcome==='walk'?1:0)))return false
    if(state.status==='complete'&&(state.stats.SO!==(state.outcome.startsWith('strikeout-')?1:0)||state.stats.H!==(['single','double','triple','home-run'].includes(state.outcome)?1:0)
      ||state.stats['2B']!==(state.outcome==='double'?1:0)||state.stats['3B']!==(state.outcome==='triple'?1:0)||state.stats.HR!==(state.outcome==='home-run'?1:0)
      ||(state.outcome==='walk'?state.balls!==4:state.balls>3)||(state.outcome.startsWith('strikeout-')?state.strikes!==3:state.strikes>2)))return false
    if(!state.history.every((row,index)=>plain(row)&&row.number===state.pitchCount-state.history.length+index+1&&row.index===row.number-1&&row.pitchId===`${value.id}:pitch:${row.number}`&&validPitch(row.pitch)&&plain(row.result)&&plain(row.countBefore)&&plain(row.countAfter)))return false
    if(value.pending!==null){
      const p=value.pending
      if(!exact(p,['pitchId','number','index','pitch','attemptId','attemptNumber','status','input','issuedAt','inputAcceptedAt'])||!UUID.test(p.attemptId)||p.number!==state.pitchCount+1||p.index!==state.pitchCount||p.pitchId!==`${value.id}:pitch:${p.number}`
        ||!Number.isSafeInteger(p.attemptNumber)||p.attemptNumber<1||!validPitch(p.pitch)||!isTime(p.issuedAt)||!['issued','paused','input-accepted'].includes(p.status)||state.status!=='active'
        ||(p.input===null)!==(p.inputAcceptedAt===null)||(p.input!==null&&(!isTime(p.inputAcceptedAt)||!validInput(p.input,p.pitch)))||(p.status==='input-accepted'&&p.input===null)||(p.status==='issued'&&p.input!==null))return false
    }
    if(state.status==='complete'){
      const r=value.finalReceipt
      if(value.pending!==null||!exact(r,['id','revision','outcome','stats','completedAt'])||r.id!==`${value.id}:final`||r.revision!==value.revision||r.outcome!==state.outcome||!same(r.stats,state.stats)||!isTime(r.completedAt))return false
    }else if(value.finalReceipt!==null)return false
    return true
  }catch{return false}
}

export function validBaseballAtBatJournal(value) {
  if(!exact(value,['schemaVersion','id','player','checkpoint','pending','updatedAt'])||value.schemaVersion!==1||!UUID.test(value.id)
    ||!Number.isFinite(value.updatedAt)||value.updatedAt<0||!exact(value.player,['name','jerseyNumber','teamId','handedness'])||!validateBaseballPlayer(value.player).valid)return false
  if(value.checkpoint!==null&&(!validBaseballAtBatCheckpoint(value.checkpoint)||value.checkpoint.id!==value.id))return false
  if(value.pending===null)return value.checkpoint!==null
  const pending=value.pending
  if(!exact(pending,['operation','body'])||!['create','command'].includes(pending.operation)||!plain(pending.body)||!UUID.test(pending.body.commandId)||bytes(pending.body)>16*1024)return false
  if(pending.operation==='create')return exact(pending.body,['commandId','settings','source'])&&pending.body.commandId===value.id&&exact(pending.body.settings,configKeys)&&['manual','development'].includes(pending.body.source)
  if(!exact(pending.body,['commandId','expectedRevision','command'])||!Number.isSafeInteger(pending.body.expectedRevision)||pending.body.expectedRevision<1)return false
  const command=pending.body.command
  if(exact(command,['type'])&&command.type==='issue')return true
  const required=command?.type==='accept-input'?['type','pitchId','attemptId','input']:['type','pitchId','attemptId']
  if(!plain(command)||!required.every(key=>Object.hasOwn(command,key))||!Object.keys(command).every(key=>[...required,...(command.type==='pause'?['reason']:[])].includes(key))
    ||!['accept-input','pause','resolve'].includes(command.type)||typeof command.pitchId!=='string'||!UUID.test(command.attemptId))return false
  return command.type==='accept-input'?Boolean(value.checkpoint?.pending)&&validInput(command.input,value.checkpoint.pending.pitch)
    :command.type!=='pause'||command.reason===undefined||['manual','visibility','focus','menu','route','reload','restore','other'].includes(command.reason)
}

/** A single transaction keeps an older tab from overwriting a pending input. */
export function planBaseballAtBatJournalWrite(entries,entry,limits=BASEBALL_AT_BAT_JOURNAL_LIMITS,{acknowledgedCommandId}={}) {
  if(!Array.isArray(entries)||entries.some(value=>!validBaseballAtBatJournal(value))||!validBaseballAtBatJournal(entry))throw fail('local_data_invalid')
  const previous=entries.find(value=>value.id===entry.id)
  if(previous?.pending&&entry.pending&&!same(previous.pending,entry.pending))throw fail('local_conflict')
  if(previous?.pending&&!entry.pending&&previous.pending.body.commandId!==acknowledgedCommandId)throw fail('local_conflict')
  if(previous?.checkpoint&&entry.checkpoint&&previous.checkpoint.revision>entry.checkpoint.revision)throw fail('local_conflict')
  if(previous?.pending&&!entry.pending&&(!entry.checkpoint||entry.checkpoint.revision<=(previous.checkpoint?.revision||0)))throw fail('local_conflict')
  const next=[...entries.filter(value=>value.id!==entry.id),clone(entry)]
  if((!previous&&entries.length>=limits.sessions)||bytes(next)>limits.bytes)throw fail('local_capacity')
  return clone(entry)
}

export function planBaseballAtBatJournalAdoption(previous,checkpoint,at,extraIntent,conflicts=[]){
  const intents=[previous,extraIntent].filter(value=>value?.pending)
  if(!intents.length||intents.some(value=>!validBaseballAtBatJournal(value)||value.id!==checkpoint?.id)||!validBaseballAtBatCheckpoint(checkpoint)
    ||!Number.isFinite(at)||intents.some(value=>checkpoint.revision<=(value.pending.body.expectedRevision||0)))throw fail('local_conflict')
  const additions=[...new Map(intents.map(intent=>[intent.pending.body.commandId,{id:intent.pending.body.commandId,sessionId:checkpoint.id,pending:clone(intent.pending),checkpoint:clone(intent.checkpoint),reason:'user-adopted-server-checkpoint',at}])).values()]
  if(bytes([...conflicts,...additions])>BASEBALL_AT_BAT_JOURNAL_LIMITS.bytes)throw fail('local_capacity')
  return {entry:{...(previous||extraIntent),checkpoint:clone(checkpoint),pending:null,updatedAt:at},conflicts:additions}
}

export function createBaseballAtBatJournal(indexedDB=globalThis.indexedDB) {
  let database=null,opening=null
  async function init(){
    if(database)return
    if(opening)return opening
    opening=new Promise((resolve,reject)=>{
      if(!indexedDB?.open){reject(fail('storage_unavailable'));return}
      let request,settled=false
      try{request=indexedDB.open(BASEBALL_AT_BAT_JOURNAL_DATABASE,2)}catch{reject(fail('storage_unavailable'));return}
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains('sessions'))request.result.createObjectStore('sessions',{keyPath:'id'})
        if(!request.result.objectStoreNames.contains('conflicts'))request.result.createObjectStore('conflicts',{keyPath:'id'})
      }
      request.onerror=request.onblocked=()=>{settled=true;reject(fail('storage_unavailable'))}
      request.onsuccess=()=>{if(settled){request.result.close();return}settled=true;database=request.result;database.onversionchange=()=>{database?.close();database=null};resolve()}
    }).finally(()=>{opening=null})
    return opening
  }
  function transaction(mode,work,names=['sessions']){return new Promise((resolve,reject)=>{
    if(!database){reject(fail('storage_unavailable'));return}
    let tx,value,cause
    try{tx=database.transaction(names,mode);work(tx.objectStore('sessions'),result=>{value=result},error=>{cause=error;tx.abort()},tx)}catch(error){reject(fail(safeCode(error)));return}
    tx.oncomplete=()=>resolve(value)
    tx.onerror=tx.onabort=()=>reject(cause||fail(tx.error?.name==='QuotaExceededError'?'storage_full':'storage_unavailable'))
  })}
  return {
    init,
    list:()=>transaction('readonly',(store,done)=>{const request=store.getAll();request.onsuccess=()=>done(request.result)}),
    write:(entry,options)=>transaction('readwrite',(store,done,abort)=>{const request=store.getAll();request.onsuccess=()=>{try{const value=planBaseballAtBatJournalWrite(request.result,entry,BASEBALL_AT_BAT_JOURNAL_LIMITS,options);store.put(value);done(value)}catch(cause){abort(cause)}}}),
    adopt:(id,checkpoint,at,extraIntent)=>transaction('readwrite',(store,done,abort,tx)=>{
      const request=store.get(id),conflicts=tx.objectStore('conflicts').getAll()
      let ready=0
      const finish=()=>{
        if(++ready!==2)return
        try{
          const plan=planBaseballAtBatJournalAdoption(request.result,checkpoint,at,extraIntent,conflicts.result)
          for(const conflict of plan.conflicts)tx.objectStore('conflicts').put(conflict)
          store.put(plan.entry);done(plan.entry)
        }catch(cause){abort(cause)}
      }
      request.onsuccess=conflicts.onsuccess=finish
    },['sessions','conflicts']),
    close:()=>{database?.close();database=null},
  }
}

export function createBaseballAtBatTransport({fetchImpl=globalThis.fetch,bootstrapRepository}={}) {
  const requests=new Set()
  async function request(id,body){
    if(id!==null&&!UUID.test(id))throw fail('invalid_submission')
    const controller=new AbortController();requests.add(controller)
    const timeout=setTimeout(()=>controller.abort(),15000)
    try{
      const response=await fetchImpl(id?`${ENDPOINT}/${id}`:ENDPOINT,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,
        ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})
      let value
      try{value=await response.json()}catch{throw fail('invalid_response')}
      if(!response.ok)throw fail(codes.has(value?.code)?value.code:response.status===409?'revision_conflict':'database_unavailable')
      return value
    }catch(cause){throw fail(safeCode(cause))}finally{clearTimeout(timeout);requests.delete(controller)}
  }
  return {
    async list(){
      const work=()=>request(null,null)
      if(!bootstrapRepository)return work()
      await bootstrapRepository.init()
      return bootstrapRepository.withBootstrapLease(work)
    },
    read:id=>request(id,null),
    send:(id,pending)=>request(pending.operation==='create'?null:id,pending.body),
    close:()=>{for(const request of requests)request.abort();bootstrapRepository?.close()},
  }
}

/** Durable intent is written before any mutation; lost replies retain that same ID. */
export async function openBaseballAtBatClient({repository=createBaseballAtBatJournal(),transport,idFactory=idFor,onChange=()=>{},now=Date.now}={}) {
  let entries=[],history=[],code=null,busy=false,closed=false,tail=Promise.resolve(),lastReceipt=null
  const volatile=new Map()
  const visibleEntries=()=>[...new Map([...entries.map(entry=>[entry.id,entry]),...volatile.entries()]).values()]
  const publish=()=>{if(!closed)onChange({entries:clone(visibleEntries()),volatileIds:[...volatile.keys()].filter(id=>!entries.some(entry=>entry.id===id&&same(entry.pending,volatile.get(id).pending))),history:clone(history),code,busy})}
  const load=async()=>{
    const values=await repository.list()
    if(!Array.isArray(values)||values.some(value=>!validBaseballAtBatJournal(value))||new Set(values.map(value=>value.id)).size!==values.length)throw fail('local_data_invalid')
    entries=values
  }
  const write=async(entry,options)=>{await repository.write(entry,options);await load();publish()}
  const serial=work=>{
    const next=tail.then(async()=>{if(closed)throw fail('network_unavailable');busy=true;code=null;publish();try{return await work()}catch(cause){code=safeCode(cause);throw fail(code)}finally{busy=false;publish()}})
    tail=next.catch(()=>{})
    return next
  }
  async function sendEntry(entry){
    const value=await transport.send(entry.id,entry.pending)
    const receipt=value?.receipt
    if(value?.status!=='stored'||!validBaseballAtBatCheckpoint(value.session)||value.session.id!==entry.id||receipt?.commandId!==entry.pending.body.commandId
      ||receipt.sessionId!==entry.id||!Number.isSafeInteger(receipt.revision)||receipt.revision<1||value.session.revision<receipt.revision)throw fail('invalid_response')
    if(entry.pending.operation==='command'&&receipt.revision!==entry.pending.body.expectedRevision+1)throw fail('invalid_response')
    if(entry.pending.operation==='create'&&receipt.revision!==1)throw fail('invalid_response')
    const next={...entry,checkpoint:clone(value.session),pending:null,updatedAt:now()}
    await write(next,{acknowledgedCommandId:entry.pending.body.commandId})
    volatile.delete(entry.id);lastReceipt=clone(receipt);publish()
    return clone(value.session)
  }
  const client={
    snapshot:()=>({entries:clone(visibleEntries()),volatileIds:[...volatile.keys()].filter(id=>!entries.some(entry=>entry.id===id&&same(entry.pending,volatile.get(id).pending))),history:clone(history),code,busy,lastReceipt:clone(lastReceipt)}),
    refresh:()=>serial(async()=>{
      const value=await transport.list()
      if(value?.status!=='ok'||!Array.isArray(value.atBats)||value.atBats.length>20||value.atBats.some(row=>!exact(row,['id','revision','status','pitchCount','balls','strikes','outcome','source','updatedAt'])
        ||!UUID.test(row.id)||!Number.isSafeInteger(row.revision)||row.revision<1||!['active','complete'].includes(row.status)||!Number.isSafeInteger(row.pitchCount)||row.pitchCount<0
        ||!Number.isInteger(row.balls)||row.balls<0||row.balls>4||!Number.isInteger(row.strikes)||row.strikes<0||row.strikes>3||!['manual','development'].includes(row.source)||!isTime(row.updatedAt)
        ||(row.status==='active'?row.outcome!==null:!finalOutcomes.has(row.outcome))))throw fail('invalid_response')
      history=clone(value.atBats);return client.snapshot()
    }),
    create:(settings,player,{source='manual'}={})=>serial(async()=>{
      if(!['manual','development'].includes(source))throw fail('invalid_submission')
      const id=idFactory(),entry={schemaVersion:1,id,player:clone(player),checkpoint:null,pending:{operation:'create',body:{commandId:id,settings:clone(settings),source}},updatedAt:now()}
      volatile.set(id,entry)
      await write(entry)
      return sendEntry(entry)
    }),
    command:(id,command)=>serial(async()=>{
      const current=entries.find(value=>value.id===id)
      if(!current?.checkpoint)throw fail('not_found')
      if(current.pending||volatile.has(id))throw fail('local_conflict')
      const entry={...current,pending:{operation:'command',body:{commandId:idFactory(),expectedRevision:current.checkpoint.revision,command:clone(command)}},updatedAt:now()}
      volatile.set(id,entry)
      await write(entry)
      return sendEntry(entry)
    }),
    retry:id=>serial(async()=>{
      const entry=volatile.get(id)||entries.find(value=>value.id===id)
      if(!entry?.pending)throw fail('not_found')
      await write(entry)
      return sendEntry(entry)
    }),
    read:(id,player)=>serial(async()=>{
      const value=await transport.read(id)
      if(value?.status!=='ok'||!validBaseballAtBatCheckpoint(value.session)||value.session.id!==id)throw fail('invalid_response')
      const current=volatile.get(id)||entries.find(entry=>entry.id===id)
      // Keep unresolved local intent separate from a newer authoritative checkpoint.
      if(current?.pending)return {session:clone(value.session),pending:clone(current.pending),player:clone(current.player)}
      const entry={schemaVersion:1,id,player:clone(current?.player||player),checkpoint:clone(value.session),pending:null,updatedAt:now()}
      await write(entry)
      return {session:clone(value.session),pending:null,player:clone(entry.player)}
    }),
    adoptLatest:id=>serial(async()=>{
      const value=await transport.read(id)
      if(value?.status!=='ok'||!validBaseballAtBatCheckpoint(value.session)||value.session.id!==id)throw fail('invalid_response')
      await repository.adopt(id,value.session,now(),volatile.get(id))
      volatile.delete(id);await load()
      return clone(value.session)
    }),
    close:()=>{closed=true;transport.close?.();void tail.finally(()=>repository.close())},
  }
  try{await repository.init();await load();publish()}catch(cause){code=safeCode(cause);publish();client.close();throw fail(code)}
  return client
}

export function createDefaultBaseballAtBatTransport(){
  return createBaseballAtBatTransport({bootstrapRepository:createBaseballIndexedDbRepository()})
}
