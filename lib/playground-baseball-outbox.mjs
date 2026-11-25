import { createBaseballLocalId, validateBaseballDataSnapshot } from './playground-baseball-data.mjs'

export const BASEBALL_OUTBOX_LIMITS = Object.freeze({ sessions:100, bytes:10 * 1024 * 1024, requestBytes:512 * 1024 })
export const BASEBALL_OUTBOX_DATABASE = 'nextport-baseball-data-v1'
const STORE = 'practices'
const META = 'meta'
const LEASE_KEY = 'participant-bootstrap'
export const BASEBALL_BOOTSTRAP_LEASE_MS = 20000
const ENDPOINT = '/api/playground/baseball/practices'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const codes = new Set(['storage_unavailable','storage_full','local_capacity','local_data_invalid','local_conflict','invalid_snapshot','network_unavailable','not_configured','database_unavailable','stale_revision','session_conflict','invalid_submission','result_mismatch','version_mismatch','body_too_large','invalid_response','invalid_pitch','rate_limited','verification_unavailable'])
const retriable = new Set(['network_unavailable','database_unavailable'])
const copy = value => JSON.parse(JSON.stringify(value))
const plain = value => value !== null && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value))
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key))
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : plain(value) ? `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value)
const same = (a,b) => canonical(a) === canonical(b)
const error = code => Object.assign(new Error('Baseball record operation unavailable'), {code})
const safeCode = (value, fallback) => codes.has(value?.code) ? value.code : value?.name === 'QuotaExceededError' ? 'storage_full' : fallback
const oneSession = session => ({schemaVersion:1,storage:'memory',trust:'local-unverified',sessions:[session]})
const validSnapshot = value => validateBaseballDataSnapshot(value).valid && value.sessions.length === 1
const counts = session => ({completed:session.attempts.filter(attempt=>attempt.state==='completed').length,aborted:session.attempts.filter(attempt=>attempt.state==='aborted').length,swings:session.attempts.filter(attempt=>attempt.swingAtMs!==null).length})
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)))

/** A stale tab may not remove a completed pitch or revise an accepted input. */
function extendsSession(previous, next) {
  if (!same(omit(previous,['attempts','status','endReason','endedAt']),omit(next,['attempts','status','endReason','endedAt']))) return false
  if (previous.status === 'ended') return same(previous,next)
  if (next.attempts.length < previous.attempts.length) return false
  return previous.attempts.every((attempt,index) => {
    const after=next.attempts[index]
    if (attempt.state !== 'started') return same(attempt,after)
    if (!same(omit(attempt,['state','endedAt','swingAtMs','aim','input','result','abortReason','elapsedMs']),omit(after,['state','endedAt','swingAtMs','aim','input','result','abortReason','elapsedMs']))) return false
    return attempt.swingAtMs === null || same([attempt.swingAtMs,attempt.aim,attempt.input],[after.swingAtMs,after.aim,after.input])
  })
}

export function validateBaseballOutboxEntry(entry) {
  return exact(entry,['sessionId','revision','snapshot','status','updatedAt']) && UUID.test(entry.sessionId) && Number.isSafeInteger(entry.revision) && entry.revision > 0 && ['pending','saved'].includes(entry.status) && Number.isFinite(entry.updatedAt) && entry.updatedAt >= 0 && validSnapshot(entry.snapshot) && entry.snapshot.sessions[0].sessionId === entry.sessionId
}

/** Called inside the repository's single read-write transaction. */
export function planBaseballOutboxWrite(entries, snapshot, updatedAt, limits=BASEBALL_OUTBOX_LIMITS) {
  if (!Array.isArray(entries) || entries.some(entry=>!validateBaseballOutboxEntry(entry)) || new Set(entries.map(entry=>entry.sessionId)).size!==entries.length) throw error('local_data_invalid')
  if (!validSnapshot(snapshot) || !Number.isFinite(updatedAt) || updatedAt < 0) throw error('invalid_snapshot')
  const session=snapshot.sessions[0], previous=entries.find(entry=>entry.sessionId===session.sessionId)
  if (previous && same(previous.snapshot,snapshot)) return {entry:copy(previous),changed:false,stale:false}
  if (previous && !extendsSession(previous.snapshot.sessions[0],session)) {
    if (extendsSession(session,previous.snapshot.sessions[0])) return {entry:copy(previous),changed:false,stale:true}
    throw error('local_conflict')
  }
  if (!previous && entries.length >= limits.sessions) throw error('local_capacity')
  const entry={sessionId:session.sessionId,revision:(previous?.revision || 0)+1,snapshot:copy(snapshot),status:'pending',updatedAt}
  const next=[...entries.filter(value=>value.sessionId!==entry.sessionId),entry]
  if (bytes(next)>limits.bytes) throw error('local_capacity')
  return {entry,changed:true,stale:false}
}

function validAck(ack, entry) {
  const expected=counts(entry.snapshot.sessions[0])
  return plain(ack) && ack.status==='stored' && ack.sessionId===entry.sessionId && ack.revision===entry.revision && ack.serverComputed===true && ack.completed===expected.completed && ack.aborted===expected.aborted
}

export function planBaseballOutboxAcknowledgement(entry, revision) {
  if (!validateBaseballOutboxEntry(entry)) throw error('local_data_invalid')
  return entry.revision===revision ? {...copy(entry),status:'saved'} : null
}

/** Lease metadata contains no cookie, participant ID, or authentication value. */
export function planBaseballBootstrapLease(current, owner, at) {
  if(!UUID.test(owner) || !Number.isFinite(at) || at<0)throw error('storage_unavailable')
  if(current!==undefined && (!exact(current,['key','owner','expiresAt']) || current.key!==LEASE_KEY || !UUID.test(current.owner) || !Number.isFinite(current.expiresAt)))throw error('local_data_invalid')
  if(current && current.expiresAt>at)return {acquired:false,lease:copy(current)}
  return {acquired:true,lease:{key:LEASE_KEY,owner,expiresAt:at+BASEBALL_BOOTSTRAP_LEASE_MS}}
}

export function canReleaseBaseballBootstrapLease(current, owner) {
  if(current===undefined)return false
  if(!exact(current,['key','owner','expiresAt']) || current.key!==LEASE_KEY || !UUID.test(current.owner) || !Number.isFinite(current.expiresAt))throw error('local_data_invalid')
  return current.owner===owner
}

function abortable(work,signal) {
  if(signal?.aborted)return Promise.reject(error('network_unavailable'))
  return new Promise((resolve,reject)=>{
    const aborted=()=>reject(error('network_unavailable'))
    signal?.addEventListener('abort',aborted,{once:true})
    Promise.resolve().then(()=>{if(signal?.aborted)throw error('network_unavailable');return work()}).then(resolve,reject).finally(()=>signal?.removeEventListener('abort',aborted))
  })
}

function leaseWait(delay,signal) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(error('network_unavailable'));return}
    const finish=()=>{signal?.removeEventListener('abort',aborted);resolve()}
    const timer=setTimeout(finish,delay)
    const aborted=()=>{clearTimeout(timer);signal?.removeEventListener('abort',aborted);reject(error('network_unavailable'))}
    signal?.addEventListener('abort',aborted,{once:true})
  })
}

/** Only short metadata transactions hold the lock; pitch writes never wait on GET. */
export function createBaseballBootstrapGate({claim,release,now=Date.now,idFactory=createBaseballLocalId,wait=leaseWait}={}) {
  return async function withLease(work,{signal}={}) {
    const owner=idFactory(), deadline=now()+25000
    let polls=0
    if(!UUID.test(owner))throw error('storage_unavailable')
    while(!signal?.aborted && now()<deadline && polls++<100){
      const acquired=await claim(owner,now())
      if(acquired){
        try{return await abortable(work,signal)}finally{await release(owner)}
      }
      await wait(Math.min(250,Math.max(1,deadline-now())),signal)
    }
    throw error('network_unavailable')
  }
}

/** No localStorage fallback: unavailable or corrupt storage stays explicit. */
export function createBaseballIndexedDbRepository(indexedDB=globalThis.indexedDB) {
  let database=null, opening=null
  async function init() {
    if (database) return
    if (opening) return opening
    opening=new Promise((resolve,reject)=>{
      if (!indexedDB?.open) {reject(error('storage_unavailable'));return}
      let request
      try {request=indexedDB.open(BASEBALL_OUTBOX_DATABASE,2)} catch {reject(error('storage_unavailable'));return}
      let settled=false
      const failed=()=>{settled=true;reject(error('storage_unavailable'))}
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'sessionId'})
        if(!request.result.objectStoreNames.contains(META))request.result.createObjectStore(META,{keyPath:'key'})
      }
      request.onerror=failed
      request.onblocked=failed
      request.onsuccess=()=>{if(settled){request.result.close();return}settled=true;database=request.result;database.onversionchange=()=>{database?.close();database=null};resolve()}
    }).finally(()=>{opening=null})
    return opening
  }
  function transaction(mode, work, storeName=STORE) {
    return new Promise((resolve,reject)=>{
      if(!database){reject(error('storage_unavailable'));return}
      let transaction, result, failure
      try {
        transaction=database.transaction(storeName,mode)
        work(transaction.objectStore(storeName), value=>{result=value}, cause=>{failure=cause;transaction.abort()})
      } catch(cause) {reject(error(safeCode(cause,'storage_unavailable')));return}
      transaction.oncomplete=()=>resolve(result)
      transaction.onabort=transaction.onerror=()=>reject(failure || error(safeCode(transaction.error,'storage_unavailable')))
    })
  }
  const withBootstrapLease=createBaseballBootstrapGate({
    claim:(owner,at)=>transaction('readwrite',(store,done,fail)=>{
      const request=store.get(LEASE_KEY)
      request.onsuccess=()=>{try{const plan=planBaseballBootstrapLease(request.result,owner,at);if(plan.acquired)store.put(plan.lease);done(plan.acquired)}catch(cause){fail(cause)}}
    },META),
    release:owner=>transaction('readwrite',(store,done,fail)=>{
      const request=store.get(LEASE_KEY)
      request.onsuccess=()=>{try{const owned=canReleaseBaseballBootstrapLease(request.result,owner);if(owned)store.delete(LEASE_KEY);done(owned)}catch(cause){fail(cause)}}
    },META),
  })
  return {
    init,
    withBootstrapLease,
    list:()=>transaction('readonly',(store,done)=>{const request=store.getAll();request.onsuccess=()=>done(request.result)}),
    upsert:(snapshot,updatedAt)=>transaction('readwrite',(store,done,fail)=>{
      const request=store.getAll()
      request.onsuccess=()=>{try{const plan=planBaseballOutboxWrite(request.result,snapshot,updatedAt);if(plan.changed)store.put(plan.entry);done(plan)}catch(cause){fail(cause)}}
    }),
    markSaved:(sessionId,revision)=>transaction('readwrite',(store,done,fail)=>{
      const request=store.get(sessionId)
      request.onsuccess=()=>{try{if(!request.result){done(false);return}const entry=planBaseballOutboxAcknowledgement(request.result,revision);if(entry)store.put(entry);done(Boolean(entry))}catch(cause){fail(cause)}}
    }),
    close:()=>{database?.close();database=null},
  }
}

function normalizeHistory(value) {
  if (!exact(value,['status','practices']) || value.status!=='ok' || !Array.isArray(value.practices) || value.practices.length>100) throw error('invalid_response')
  const seen=new Set()
  return value.practices.map(item=>{
    if (!plain(item) || !UUID.test(item.sessionId) || seen.has(item.sessionId) || !['active','ended'].includes(item.status) || !Number.isSafeInteger(item.revision) || item.revision<1 || item.serverComputed!==true || typeof item.receivedAt!=='string' || item.receivedAt.length>40 || !Number.isFinite(Date.parse(item.receivedAt))) throw error('invalid_response')
    if(!Number.isInteger(item.completed) || item.completed<0 || item.completed>10 || !Number.isInteger(item.aborted) || item.aborted<0 || item.aborted>100 || item.completed+item.aborted>100 || !Number.isInteger(item.swings) || item.swings<0 || item.swings>100)throw error('invalid_response')
    seen.add(item.sessionId)
    return {sessionId:item.sessionId,status:item.status,completed:item.completed,aborted:item.aborted,swings:item.swings,receivedAt:item.receivedAt,source:'server'}
  })
}

/** Storage completion is distinct from a server receipt; no queue item is deleted. */
export async function createBaseballOutbox({repository,send,readHistory,onChange=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let entries=[], remoteHistory=[], restored=0, state='loading', sync='idle', code=null, closed=false, initialized=false, repositoryOpened=false
  let writes=Promise.resolve(), flushing=null, timer=null, retries=0, paused=false
  let bootstrapTimer=null, bootstrapping=typeof readHistory==='function', ownerReady=!bootstrapping
  const requests=new Set()
  const networkPending=new Set()
  const publish=()=>{
    if(closed)return
    const history=new Map(remoteHistory.map(item=>[item.sessionId,{...item,at:Date.parse(item.receivedAt)}]))
    for(const entry of entries)history.set(entry.sessionId,{sessionId:entry.sessionId,status:entry.snapshot.sessions[0].status,...counts(entry.snapshot.sessions[0]),...(history.get(entry.sessionId)?.receivedAt ? {receivedAt:history.get(entry.sessionId).receivedAt}:{}),source:'local',at:entry.updatedAt})
    try{onChange({state,pending:entries.filter(item=>item.status==='pending').length,saved:entries.filter(item=>item.status==='saved').length,restored,history:[...history.values()].sort((a,b)=>b.at-a.at).slice(0,100).map(item=>omit(item,['at'])),sync,code})}catch{/* A view cannot change stored records. */}
  }
  const load=async()=>{
    await repository.init()
    repositoryOpened=true
    const values=await repository.list()
    if(!Array.isArray(values) || values.some(entry=>!validateBaseballOutboxEntry(entry)) || new Set(values.map(entry=>entry.sessionId)).size!==values.length || values.length>BASEBALL_OUTBOX_LIMITS.sessions || bytes(values)>BASEBALL_OUTBOX_LIMITS.bytes)throw error('local_data_invalid')
    entries=values
    if(!initialized)restored=values.length
    initialized=true
    state='ready'
  }
  const localFailure=cause=>{code=safeCode(cause,'storage_unavailable');state=['storage_full','local_capacity'].includes(code)?'capacity':'unavailable';sync='error';publish()}
  const schedule=()=>{
    if(closed || paused || timer || retries>=3 || !retriable.has(code))return
    const delay=[1000,3000,10000][retries++]
    timer=setTimer(()=>{timer=null;void flush()},delay)
    timer?.unref?.()
  }
  const refreshHistory=async()=>{
    if(closed || typeof readHistory!=='function')return false
    const controller=new AbortController();requests.add(controller)
    try{
      const work=()=>readHistory({signal:controller.signal})
      const pending=Promise.resolve().then(()=>typeof repository.withBootstrapLease==='function'?repository.withBootstrapLease(work,{signal:controller.signal}):work())
      networkPending.add(pending)
      let result
      try{result=await pending}finally{networkPending.delete(pending)}
      if(closed)return false
      remoteHistory=normalizeHistory(result);ownerReady=true;code=null;paused=false;publish();return true
    }catch(cause){if(!closed){code=safeCode(cause,'network_unavailable');sync='error';paused=!retriable.has(code);publish()}return false}
    finally{requests.delete(controller)}
  }
  async function flush() {
    if(closed || !initialized || bootstrapping || paused || typeof send!=='function')return false
    if(flushing)return flushing
    flushing=(async()=>{
      sync='syncing';publish()
      try{
        if(!ownerReady && typeof readHistory==='function') {
          if(!await refreshHistory()){schedule();return false}
          sync='syncing';publish()
        }
        while(!closed){
          await writes
          await load()
          const entry=entries.find(item=>item.status==='pending')
          if(!entry)break
          const body={revision:entry.revision,snapshot:entry.snapshot}
          if(bytes(body)>BASEBALL_OUTBOX_LIMITS.requestBytes)throw error('body_too_large')
          const controller=new AbortController();requests.add(controller)
          let ack
          const pending=Promise.resolve().then(()=>{if(closed || controller.signal.aborted)throw error('network_unavailable');return send(copy(body),{signal:controller.signal})})
          networkPending.add(pending)
          try{ack=await pending}finally{requests.delete(controller);networkPending.delete(pending)}
          if(closed)break
          if(!validAck(ack,entry))throw error('invalid_response')
          await repository.markSaved(entry.sessionId,entry.revision)
          await load();code=null;retries=0;publish()
        }
        if(!closed){sync='idle';publish()}
        return !closed
      }catch(cause){
        if(!closed){code=safeCode(cause,'network_unavailable');sync='error';paused=!retriable.has(code);publish();schedule()}
        return false
      }finally{flushing=null}
    })()
    return flushing
  }
  const controller={
    async inspectPending(){
      if(closed || !repositoryOpened)throw error('storage_unavailable')
      await writes
      if(closed)throw error('storage_unavailable')
      // 명시적 원본 확인만 수행한다. 검증 실패 자료도 변환/ACK/삭제 없이 복사한다.
      const originals=await repository.list()
      if(!Array.isArray(originals))throw error('local_data_invalid')
      return {code:codes.has(code)?code:null,entries:copy(originals.filter(entry=>entry?.status==='pending'))}
    },
    enqueue(snapshot){
      if(closed)return Promise.resolve(false)
      let snapshots
      try{
        if(!validateBaseballDataSnapshot(snapshot).valid)throw error('invalid_snapshot')
        snapshots=snapshot.sessions.map(session=>oneSession(copy(session)))
      }catch(cause){localFailure(cause);return Promise.resolve(false)}
      const task=writes.then(async()=>{
        try{
          await repository.init()
          for(const item of snapshots)await repository.upsert(item,now())
          await load()
          if(!closed){if(!paused)code=null;publish();void flush()}
          return true
        }catch(cause){localFailure(cause);return false}
      })
      writes=task.then(()=>{})
      return task
    },
    async retry(){
      if(closed)return false
      if(bootstrapTimer){clearTimer(bootstrapTimer);bootstrapTimer=null}bootstrapping=false
      if(timer){clearTimer(timer);timer=null}retries=0;paused=false
      try{await writes;await load();code=null;sync='idle';publish()}catch(cause){localFailure(cause);return false}
      await refreshHistory()
      return flush()
    },
    async refreshHistory(){
      if(bootstrapTimer){clearTimer(bootstrapTimer);bootstrapTimer=null}bootstrapping=false
      const success=await refreshHistory()
      if(success)void flush()
      return success
    },
    close(){
      if(closed)return
      closed=true
      if(timer)clearTimer(timer)
      if(bootstrapTimer)clearTimer(bootstrapTimer)
      for(const controller of requests)controller.abort()
      // Enqueued writes survive React cleanup, unlike callbacks or requests.
      void Promise.allSettled([writes,...networkPending]).then(()=>repository.close())
    },
  }
  publish()
  try{await load();publish()}catch(cause){localFailure(cause)}
  // Return before any cold or offline network request. Local writes work while
  // the first GET establishes the HttpOnly participant cookie; POST waits for it.
  if(initialized && bootstrapping){
    bootstrapTimer=setTimer(()=>{
      bootstrapTimer=null
      void refreshHistory().then(success=>{bootstrapping=false;if(success)void flush();else schedule()})
    },0)
    bootstrapTimer?.unref?.()
  }else if(initialized)void flush()
  return Object.freeze(controller)
}

function createFetchTransport(fetchImpl) {
  async function request(body,{signal}={}) {
    const timeout=new AbortController()
    const abort=()=>timeout.abort()
    signal?.addEventListener('abort',abort,{once:true})
    if(signal?.aborted)timeout.abort()
    const timer=setTimeout(()=>timeout.abort(),15000)
    try{
      const response=await fetchImpl(ENDPOINT,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:timeout.signal,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})
      let value
      try{value=await response.json()}catch{throw error('invalid_response')}
      if(!response.ok)throw error(codes.has(value?.code)?value.code:'network_unavailable')
      return value
    }catch(cause){throw error(safeCode(cause,'network_unavailable'))}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
  }
  return {send:request,readHistory:options=>request(null,options)}
}

export async function openBaseballOutbox({onChange,fetchImpl=globalThis.fetch,indexedDB=globalThis.indexedDB,now=Date.now,eventTarget=globalThis.window}={}) {
  const transport=typeof fetchImpl==='function'?createFetchTransport(fetchImpl):{send:async()=>{throw error('network_unavailable')},readHistory:async()=>{throw error('network_unavailable')}}
  const controller=await createBaseballOutbox({repository:createBaseballIndexedDbRepository(indexedDB),...transport,onChange,now})
  const online=()=>{void controller.retry()}
  eventTarget?.addEventListener?.('online',online)
  return Object.freeze({...controller,close(){eventTarget?.removeEventListener?.('online',online);controller.close()}})
}
