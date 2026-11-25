import { createBaseballIndexedDbRepository } from './playground-baseball-outbox.mjs'
import { createBaseballLocalId } from './playground-baseball-data.mjs'
import { validateBaseballPlayer } from './playground-baseball-teams.mjs'
import { openBaseballAtBatClient, planBaseballAtBatJournalWrite, planBaseballAtBatJournalAdoption } from './playground-baseball-at-bat-client.mjs'
import { validateBaseballCareerSave, publicBaseballCareerSave } from './playground-baseball-career.mjs'

export const BASEBALL_CAREER_JOURNAL_DATABASE='nextport-baseball-careers-v1'
const ENDPOINT='/api/playground/baseball/careers'
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const clone=value=>JSON.parse(JSON.stringify(value))
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:plain(value)?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value)
const same=(a,b)=>canonical(a)===canonical(b)
const size=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength
const fail=code=>Object.assign(new Error('Career operation unavailable'),{code})
const codes=new Set(['not_configured','database_unavailable','network_unavailable','invalid_response','owner_required','not_found','version_mismatch','revision_conflict','command_conflict','local_conflict','local_data_invalid','storage_unavailable','storage_full','local_capacity','storage_capacity','invalid_command','rate_limited','body_too_large','preparation_required','preparation_complete','active_at_bat','automatic_budget','career_complete','session_complete','slot_closed','automatic_at_bat','input_already_accepted','pitch_paused','input_required','pitch_required','verification_unavailable','invalid_transition'])
const safeCode=cause=>codes.has(cause?.code)?cause.code:cause?.name==='QuotaExceededError'?'storage_full':'network_unavailable'
const isTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value
const idFor=()=>{const value=createBaseballLocalId();if(!value)throw fail('storage_unavailable');return value}
function safeJson(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return true
  if(typeof value==='number')return Number.isFinite(value)
  if(Array.isArray(value))return value.every(safeJson)
  return plain(value)&&Object.entries(value).every(([key,child])=>!['seed','ownerHash','recoveryHash','recoveryCode','secret','cookie','token','databaseUrl'].includes(key)&&safeJson(child))
}
export function validBaseballCareerCheckpoint(value){
  try{
    if(!plain(value)||!safeJson(value)||value.trust!=='server-recalculated-input-unverified')return false
    const {rates,statsBySource,feedback,trust,...view}=value
    void rates;void statsBySource;void feedback;void trust
    // This transient sentinel validates structure and the ledger only. It is
    // never persisted, transmitted or used to issue/simulate a pitch.
    const verification={...view,seed:0}
    validateBaseballCareerSave(verification)
    return same(publicBaseballCareerSave(verification),value)
  }catch{return false}
}
export function validBaseballCareerJournal(entry){
  return plain(entry)&&Object.keys(entry).length===5&&entry.schemaVersion===1&&UUID.test(entry.id)&&Number.isFinite(entry.updatedAt)
    &&(entry.checkpoint===null||validBaseballCareerCheckpoint(entry.checkpoint)&&entry.checkpoint.id===entry.id)
    &&(entry.pending===null?entry.checkpoint!==null:plain(entry.pending)&&['create','command'].includes(entry.pending.operation)&&plain(entry.pending.body)&&UUID.test(entry.pending.body.commandId)
      &&size(entry.pending.body)<=16*1024&&(entry.pending.operation==='create'?entry.pending.body.commandId===entry.id&&validateBaseballPlayer(entry.pending.body.profile).valid:Number.isSafeInteger(entry.pending.body.expectedRevision)&&entry.pending.body.expectedRevision>=1&&plain(entry.pending.body.command)))
}
export function planBaseballCareerJournalWrite(entries,entry,{acknowledgedCommandId}={}){
  if(!Array.isArray(entries)||entries.some(value=>!validBaseballCareerJournal(value))||!validBaseballCareerJournal(entry))throw fail('local_data_invalid')
  const previous=entries.find(value=>value.id===entry.id)
  if(previous?.pending&&entry.pending&&!same(previous.pending,entry.pending)||previous?.pending&&!entry.pending&&previous.pending.body.commandId!==acknowledgedCommandId
    ||previous?.checkpoint&&entry.checkpoint&&previous.checkpoint.revision>entry.checkpoint.revision)throw fail('local_conflict')
  if(!previous&&entries.length>=100||size([...entries.filter(value=>value.id!==entry.id),entry])>10*1024*1024)throw fail('local_capacity')
  return clone(entry)
}
export function planBaseballCareerAdoption(previous,checkpoint,at,extra){
  const intents=[previous,extra].filter(value=>value?.pending)
  if(!validBaseballCareerCheckpoint(checkpoint)||!intents.length||intents.some(value=>!validBaseballCareerJournal(value)||value.id!==checkpoint.id||checkpoint.revision<=(value.pending.body.expectedRevision||0)))throw fail('local_conflict')
  return {entry:{...(previous||extra),checkpoint:clone(checkpoint),pending:null,updatedAt:at},conflicts:[...new Map(intents.map(value=>[value.pending.body.commandId,{id:value.pending.body.commandId,sessionId:checkpoint.id,pending:clone(value.pending),checkpoint:clone(value.checkpoint),at,reason:'user-adopted-server-checkpoint'}])).values()]}
}

export function createBaseballCareerRepositories(indexedDB=globalThis.indexedDB){
  let database=null,opening=null
  async function init(){
    if(database)return
    if(opening)return opening
    opening=new Promise((resolve,reject)=>{
      if(!indexedDB?.open){reject(fail('storage_unavailable'));return}
      let request,settled=false
      try{request=indexedDB.open(BASEBALL_CAREER_JOURNAL_DATABASE,1)}catch{reject(fail('storage_unavailable'));return}
      request.onupgradeneeded=()=>{for(const name of ['careers','careerConflicts','atBats','atBatConflicts'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'})}
      request.onerror=request.onblocked=()=>{settled=true;reject(fail('storage_unavailable'))}
      request.onsuccess=()=>{if(settled){request.result.close();return}settled=true;database=request.result;database.onversionchange=()=>{database?.close();database=null};resolve()}
    }).finally(()=>{opening=null})
    return opening
  }
  function tx(names,mode,work){return new Promise((resolve,reject)=>{
    let transaction,value,cause
    if(!database){reject(fail('storage_unavailable'));return}
    try{transaction=database.transaction(names,mode);work(transaction,result=>{value=result},error=>{cause=error;transaction.abort()})}catch(error){reject(fail(safeCode(error)));return}
    transaction.oncomplete=()=>resolve(value)
    transaction.onerror=transaction.onabort=()=>reject(cause||fail(transaction.error?.name==='QuotaExceededError'?'storage_full':'storage_unavailable'))
  })}
  function repository(storeName,conflictName,kind){return {
    init,
    list:()=>tx([storeName],'readonly',(t,done)=>{const r=t.objectStore(storeName).getAll();r.onsuccess=()=>done(r.result)}),
    write:(entry,options)=>tx([storeName],'readwrite',(t,done,abort)=>{const store=t.objectStore(storeName),r=store.getAll();r.onsuccess=()=>{try{const value=kind==='career'?planBaseballCareerJournalWrite(r.result,entry,options):planBaseballAtBatJournalWrite(r.result,entry,undefined,options);store.put(value);done(value)}catch(cause){abort(cause)}}}),
    adopt:(id,checkpoint,at,extra)=>tx([storeName,conflictName],'readwrite',(t,done,abort)=>{
      const store=t.objectStore(storeName),r=store.get(id),c=t.objectStore(conflictName).getAll();let completed=0
      const finished=()=>{if(++completed!==2)return;try{
        const plan=kind==='career'?planBaseballCareerAdoption(r.result,checkpoint,at,extra):planBaseballAtBatJournalAdoption(r.result,checkpoint,at,extra,c.result)
        if(size([...c.result,...plan.conflicts])>10*1024*1024)throw fail('local_capacity')
        for(const value of plan.conflicts)t.objectStore(conflictName).put(value)
        store.put(plan.entry);done(plan.entry)
      }catch(cause){abort(cause)}}
      r.onsuccess=c.onsuccess=finished
    }),
    close:()=>{},
  }}
  return {career:repository('careers','careerConflicts','career'),atBats:repository('atBats','atBatConflicts','at-bat'),close:()=>{database?.close();database=null}}
}

export function createBaseballCareerTransport({fetchImpl=globalThis.fetch,bootstrapRepository=createBaseballIndexedDbRepository()}={}){
  const requests=new Set()
  async function request(suffix='',body=null){
    const controller=new AbortController();requests.add(controller);const timer=setTimeout(()=>controller.abort(),20000)
    try{
      const response=await fetchImpl(`${ENDPOINT}${suffix}`,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})
      let value
      try{value=await response.json()}catch{throw fail('invalid_response')}
      if(!response.ok)throw fail(codes.has(value?.code)?value.code:response.status===409?'revision_conflict':'database_unavailable')
      return value
    }catch(cause){throw fail(safeCode(cause))}finally{clearTimeout(timer);requests.delete(controller)}
  }
  return {
    list:async()=>{await bootstrapRepository.init();return bootstrapRepository.withBootstrapLease(()=>request())},
    read:id=>{if(!UUID.test(id))throw fail('invalid_command');return request(`/${id}`)},
    send:(id,pending)=>{if(!UUID.test(id))throw fail('invalid_command');return request(pending.operation==='create'?'':`/${id}`,pending.body)},
    atBatRead:(id,atBatId)=>{if(!UUID.test(id)||!UUID.test(atBatId))throw fail('invalid_command');return request(`/${id}/at-bats/${atBatId}`)},
    atBatSend:(id,atBatId,body)=>{if(!UUID.test(id)||!UUID.test(atBatId))throw fail('invalid_command');return request(`/${id}/at-bats/${atBatId}`,body)},
    close:()=>{for(const request of requests)request.abort();bootstrapRepository.close()},
  }
}

export async function openBaseballCareerClient({repositories=createBaseballCareerRepositories(),transport=createBaseballCareerTransport(),onChange=()=>{},idFactory=idFor,now=Date.now}={}){
  const repository=repositories.career,volatile=new Map(),adapters=new Set()
  let entries=[],history=[],code=null,busy=false,closed=false,tail=Promise.resolve()
  const visible=()=>[...new Map([...entries.map(entry=>[entry.id,entry]),...volatile]).values()]
  const snapshot=()=>({entries:clone(visible()),history:clone(history),code,busy})
  const publish=()=>{if(!closed)onChange(snapshot())}
  async function load(){const values=await repository.list();if(!Array.isArray(values)||values.some(entry=>!validBaseballCareerJournal(entry)))throw fail('local_data_invalid');entries=values}
  const serial=work=>{const next=tail.then(async()=>{if(closed)throw fail('network_unavailable');busy=true;code=null;publish();try{return await work()}catch(cause){code=safeCode(cause);throw fail(code)}finally{busy=false;publish()}});tail=next.catch(()=>{});return next}
  const write=async(entry,options)=>{await repository.write(entry,options);await load();publish()}
  async function acknowledge(entry){
    const value=await transport.send(entry.id,entry.pending),receipt=value?.receipt
    if(value?.status!=='stored'||!validBaseballCareerCheckpoint(value.career)||value.career.id!==entry.id||receipt?.commandId!==entry.pending.body.commandId||receipt.sessionId!==entry.id
      ||receipt.revision!==(entry.pending.operation==='create'?1:entry.pending.body.expectedRevision+1)||value.career.revision<receipt.revision)throw fail('invalid_response')
    await write({...entry,checkpoint:clone(value.career),pending:null,updatedAt:now()},{acknowledgedCommandId:entry.pending.body.commandId})
    volatile.delete(entry.id);publish();return clone(value.career)
  }
  async function retainCareer(career){
    if(!validBaseballCareerCheckpoint(career))throw fail('invalid_response')
    const current=entries.find(entry=>entry.id===career.id)
    if(current?.checkpoint?.revision>career.revision)return
    await write({schemaVersion:1,id:career.id,checkpoint:clone(career),pending:null,updatedAt:now()})
  }
  const client={
    snapshot,
    refresh:()=>serial(async()=>{const value=await transport.list();if(value?.status!=='ok'||!Array.isArray(value.careers)||value.careers.length>20||value.careers.some(row=>!UUID.test(row?.id)||!Number.isSafeInteger(row.revision)||!validateBaseballPlayer(row.profile).valid||!isTime(row.updatedAt)))throw fail('invalid_response');history=clone(value.careers);publish();return snapshot()}),
    create:(profile,settings,{source='manual'}={})=>serial(async()=>{
      const id=idFactory(),entry={schemaVersion:1,id,checkpoint:null,pending:{operation:'create',body:{commandId:id,profile:clone(profile),settings:clone(settings),source}},updatedAt:now()}
      volatile.set(id,entry);await write(entry);return acknowledge(entry)
    }),
    command:(id,command)=>serial(async()=>{
      const current=entries.find(entry=>entry.id===id)
      if(!current?.checkpoint)throw fail('not_found')
      if(current.pending||volatile.has(id))throw fail('local_conflict')
      const entry={...current,pending:{operation:'command',body:{commandId:idFactory(),expectedRevision:current.checkpoint.revision,command:clone(command)}},updatedAt:now()}
      volatile.set(id,entry);await write(entry);return acknowledge(entry)
    }),
    retry:id=>serial(async()=>{const entry=volatile.get(id)||entries.find(entry=>entry.id===id);if(!entry?.pending)throw fail('not_found');await write(entry);return acknowledge(entry)}),
    read:id=>serial(async()=>{
      const value=await transport.read(id)
      if(value?.status!=='ok'||!validBaseballCareerCheckpoint(value.career)||value.career.id!==id)throw fail('invalid_response')
      const current=volatile.get(id)||entries.find(entry=>entry.id===id)
      if(current?.pending)return {career:clone(value.career),pending:clone(current.pending)}
      await retainCareer(value.career);return {career:clone(value.career),pending:null}
    }),
    adoptLatest:id=>serial(async()=>{const value=await transport.read(id);if(value?.status!=='ok'||!validBaseballCareerCheckpoint(value.career)||value.career.id!==id)throw fail('invalid_response');await repository.adopt(id,value.career,now(),volatile.get(id));volatile.delete(id);await load();publish();return clone(value.career)}),
    atBatAdapter:(careerId,atBatId,player)=>serial(async()=>{
      const listeners=new Set()
      const receive=async value=>{if(!validBaseballCareerCheckpoint(value?.career)||value.career.id!==careerId)throw fail('invalid_response');await retainCareer(value.career);return value}
      const adapter=await openBaseballAtBatClient({repository:repositories.atBats,idFactory,now,onChange:value=>{for(const listener of listeners)listener(value)},transport:{
        read:async id=>receive(await transport.atBatRead(careerId,id)),
        send:async(id,pending)=>{if(pending.operation!=='command')throw fail('invalid_command');return receive(await transport.atBatSend(careerId,id,pending.body))},
        close:()=>{},
      }})
      const restored=await adapter.read(atBatId,player)
      const wrapped={...adapter,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}}
      adapters.add(wrapped)
      return {client:wrapped,session:restored.session,pending:restored.pending}
    }),
    close:()=>{closed=true;for(const adapter of adapters)adapter.close();transport.close();void tail.finally(()=>repositories.close())},
  }
  try{await repository.init();await load();publish()}catch(cause){code=safeCode(cause);publish();client.close();throw fail(code)}
  return client
}
