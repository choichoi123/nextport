import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import { createBaseballDataCollector } from '../lib/playground-baseball-data.mjs'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, createBaseballPitch, judgeBaseballTake } from '../lib/playground-baseball.mjs'
import {
  BASEBALL_OUTBOX_DATABASE, BASEBALL_OUTBOX_LIMITS, createBaseballOutbox,
  createBaseballIndexedDbRepository, openBaseballOutbox,
  planBaseballOutboxWrite, planBaseballOutboxAcknowledgement, validateBaseballOutboxEntry,
  createBaseballBootstrapGate, planBaseballBootstrapLease, canReleaseBaseballBootstrapLease, BASEBALL_BOOTSTRAP_LEASE_MS,
} from '../lib/playground-baseball-outbox.mjs'

const clone=value=>JSON.parse(JSON.stringify(value))
const environment={viewportBucket:'wide',orientation:'landscape',focusEnabled:false,locale:'ko'}
const versions={schemaVersion:1,engine:{algorithm:'sha256',hash:'a'.repeat(64),files:[{path:'lib/playground-baseball.mjs',hash:'b'.repeat(64)}]},rules:{id:'baseball-fixed-center-8cm-v2',hash:'c'.repeat(64),snapshot:{rules:clone(BASEBALL_RULES),pitchTypes:clone(BASEBALL_PITCH_TYPES)}},presentation:{hash:'d'.repeat(64),files:[{path:'components/playground/baseball-scene.js',hash:'e'.repeat(64)}]}}
let fixtureId=0
function fixture() {
  let now=Date.UTC(2026,10,24,6)
  const collector=createBaseballDataCollector({versions,idFactory:()=>`00000000-0000-4000-8000-${String(++fixtureId).padStart(12,'0')}`,wallNow:()=>now++})
  collector.startSession({handedness:'right',mode:'practice',environment})
  const pitch=createBaseballPitch({seed:12,speedKmh:120,target:{x:0,y:(BASEBALL_RULES.zone.bottom+BASEBALL_RULES.zone.top)/2}})
  collector.startAttempt({pitch,pitchNumber:1,baseSpeedKmh:120,firstCenterPitch:true,environment})
  const started=collector.snapshot()
  collector.completeAttempt({result:judgeBaseballTake(pitch)})
  return {started,completed:collector.snapshot(),collector,pitch}
}
function memory(shared={entries:[],tail:Promise.resolve()},options={}) {
  let closed=false
  const transact=fn=>{const next=shared.tail.then(fn);shared.tail=next.catch(()=>{});return next}
  return {
    init:async()=>{if(options.failInit?.())throw Error('Private storage failure')},
    list:async()=>clone(shared.entries),
    upsert:(snapshot,at)=>transact(()=>{
      if(options.failWrite?.())throw Object.assign(Error('Private quota details'),{name:'QuotaExceededError'})
      const plan=planBaseballOutboxWrite(shared.entries,snapshot,at)
      if(plan.changed)shared.entries=[...shared.entries.filter(e=>e.sessionId!==plan.entry.sessionId),plan.entry]
      return clone(plan)
    }),
    markSaved:(id,revision)=>transact(()=>{
      const entry=shared.entries.find(e=>e.sessionId===id)
      if(!entry)return false
      const saved=planBaseballOutboxAcknowledgement(entry,revision)
      if(saved)shared.entries=shared.entries.map(e=>e.sessionId===id?saved:e)
      return Boolean(saved)
    }),
    close:()=>{closed=true},
    isClosed:()=>closed,
    shared,
  }
}
const ack=body=>{
  const attempts=body.snapshot.sessions[0].attempts
  return {status:'stored',sessionId:body.snapshot.sessions[0].sessionId,revision:body.revision,completed:attempts.filter(a=>a.state==='completed').length,aborted:attempts.filter(a=>a.state==='aborted').length,serverComputed:true}
}
const offline=()=>{throw Object.assign(Error('Do not expose this token or hostname'),{code:'network_unavailable'})}
const emptyHistory=async()=>({status:'ok',practices:[]})
async function spinUntil(predicate) {for(let i=0;i<30 && !predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate(),'Expected asynchronous operation')}

test('session 단위 영구 대기열은 새로 열어도 복원하며 진행 중 공을 완료/실패로 바꾸지 않는다',async()=>{
  const shared={entries:[],tail:Promise.resolve()}, first=memory(shared), sample=fixture()
  const states=[]
  const outbox=await createBaseballOutbox({repository:first,onChange:value=>states.push(value)})
  assert.equal(await outbox.enqueue(sample.started),true)
  outbox.close()
  await new Promise(resolve=>setImmediate(resolve))
  const restored=[]
  const next=await createBaseballOutbox({repository:memory(shared),onChange:value=>restored.push(value)})
  assert.equal(restored.at(-1).restored,1)
  assert.equal(restored.at(-1).pending,1)
  assert.equal(restored.at(-1).history[0].completed,0)
  assert.equal(shared.entries[0].snapshot.sessions[0].attempts[0].state,'started')
  assert.deepEqual(shared.entries[0].snapshot,sample.started)
  next.close()
})

test('동일 내용 재등록은 revision을 늘리지 않고 최신 결과가 같은 행을 갱신한다',async()=>{
  const sample=fixture(), repository=memory(), outbox=await createBaseballOutbox({repository})
  assert.equal(await outbox.enqueue(sample.started),true)
  assert.equal(await outbox.enqueue(clone(sample.started)),true)
  assert.equal(repository.shared.entries[0].revision,1)
  assert.equal(await outbox.enqueue(sample.completed),true)
  assert.equal(repository.shared.entries.length,1)
  assert.equal(repository.shared.entries[0].revision,2)
  assert.equal(repository.shared.entries[0].snapshot.sessions[0].attempts[0].state,'completed')
  outbox.close()
})

test('오프라인 실패는 로컬 pending을 보존하며 수동 재전송 성공 뒤에만 saved로 표시한다',async()=>{
  const repository=memory(), sample=fixture(), states=[]
  let online=false
  const outbox=await createBaseballOutbox({repository,send:async body=>online?ack(body):offline(),onChange:state=>states.push(state),setTimer:()=>({}),clearTimer:()=>{}})
  await outbox.enqueue(sample.completed)
  await spinUntil(()=>states.at(-1).sync==='error')
  assert.equal(repository.shared.entries[0].status,'pending')
  assert.equal(states.at(-1).code,'network_unavailable')
  assert.equal(JSON.stringify(states).includes('token or hostname'),false)
  online=true
  assert.equal(await outbox.retry(),true)
  assert.equal(repository.shared.entries[0].status,'saved')
  assert.equal(states.at(-1).saved,1)
  outbox.close()
})

test('이전 revision의 늦은 ACK가 더 최신 pending을 지우거나 saved로 만들지 않는다',async()=>{
  const repository=memory(), sample=fixture(), sent=[]
  let release
  const outbox=await createBaseballOutbox({repository,send:body=>{sent.push(body);return sent.length===1?new Promise(resolve=>{release=()=>resolve(ack(body))}):Promise.resolve(ack(body))}})
  await outbox.enqueue(sample.started)
  await spinUntil(()=>Boolean(release))
  await outbox.enqueue(sample.completed)
  assert.equal(repository.shared.entries[0].revision,2)
  release()
  await outbox.retry()
  assert.deepEqual(sent.map(body=>body.revision),[1,2])
  assert.equal(repository.shared.entries[0].revision,2)
  assert.equal(repository.shared.entries[0].status,'saved')
  assert.equal(repository.shared.entries.length,1)
  outbox.close()
})

test('다른 탭의 session은 합쳐지고 오래된 스냅샷은 완료된 공을 되돌리지 않는다',async()=>{
  const shared={entries:[],tail:Promise.resolve()}, a=fixture(), b=fixture()
  const first=await createBaseballOutbox({repository:memory(shared)}), second=await createBaseballOutbox({repository:memory(shared)})
  await Promise.all([first.enqueue(a.completed),second.enqueue(b.completed)])
  assert.equal(shared.entries.length,2)
  await second.enqueue(a.started)
  const persisted=shared.entries.find(e=>e.sessionId===a.completed.sessions[0].sessionId)
  assert.equal(persisted.revision,1)
  assert.deepEqual(persisted.snapshot,a.completed)
  first.close();second.close()
})

test('동일 ID의 분기된 입력은 덮지 않고 명시적으로 충돌을 반환한다',async()=>{
  const repository=memory(), sample=fixture(), states=[]
  const outbox=await createBaseballOutbox({repository,onChange:value=>states.push(value)})
  await outbox.enqueue(sample.completed)
  const conflict=clone(sample.completed)
  conflict.sessions[0].attempts[0].environment.locale='en'
  assert.equal(await outbox.enqueue(conflict),false)
  assert.equal(states.at(-1).code,'local_conflict')
  assert.deepEqual(repository.shared.entries[0].snapshot,sample.completed)
  outbox.close()
})

test('close 직전에 제출한 local write는 완료하고 이후 callback과 네트워크는 중단한다',async()=>{
  const repository=memory(), sample=fixture(), states=[], sent=[]
  const outbox=await createBaseballOutbox({repository,send:body=>{sent.push(body);return ack(body)},onChange:value=>states.push(value)})
  const count=states.length, write=outbox.enqueue(sample.started)
  outbox.close()
  assert.equal(await write,true)
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(repository.shared.entries.length,1)
  assert.equal(repository.isClosed(),true)
  assert.equal(states.length,count)
  assert.equal(sent.length,0)
  assert.equal(await outbox.enqueue(sample.completed),false)
})

test('close는 진행 중 요청을 취소하며 늦은 성공도 saved로 바꾸지 않는다',async()=>{
  const repository=memory(), sample=fixture(), states=[]
  let signal, finish
  const outbox=await createBaseballOutbox({repository,onChange:value=>states.push(value),send:(body,options)=>{signal=options.signal;return new Promise(resolve=>{finish=()=>resolve(ack(body))})}})
  await outbox.enqueue(sample.completed)
  await spinUntil(()=>Boolean(signal))
  outbox.close()
  const count=states.length
  assert.equal(signal.aborted,true)
  finish()
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(repository.shared.entries[0].status,'pending')
  assert.equal(states.length,count)
})

test('corrupt 저장자료는 삭제하거나 빈 정상 기록으로 위장하지 않는다',async()=>{
  const corrupt={sessionId:'secret',password:'do not expose'}, shared={entries:[corrupt],tail:Promise.resolve()}, states=[]
  const outbox=await createBaseballOutbox({repository:memory(shared),onChange:value=>states.push(value)})
  assert.equal(states.at(-1).state,'unavailable')
  assert.equal(states.at(-1).code,'local_data_invalid')
  assert.equal(await outbox.enqueue(fixture().completed),false)
  assert.deepEqual(shared.entries,[corrupt])
  assert.equal(JSON.stringify(states).includes('password'),false)
  outbox.close()
})

test('저장 권한·용량 실패를 구분하고 재시도 후 정상 저장할 수 있다',async()=>{
  let blocked=true, full=false
  const repository=memory(undefined,{failInit:()=>blocked,failWrite:()=>full}), states=[]
  const outbox=await createBaseballOutbox({repository,onChange:value=>states.push(value)})
  assert.equal(states.at(-1).code,'storage_unavailable')
  blocked=false;await outbox.retry()
  assert.equal(states.at(-1).state,'ready')
  full=true
  assert.equal(await outbox.enqueue(fixture().completed),false)
  assert.equal(states.at(-1).state,'capacity')
  assert.equal(states.at(-1).code,'storage_full')
  assert.equal(repository.shared.entries.length,0)
  full=false
  assert.equal(await outbox.enqueue(fixture().completed),true)
  assert.equal(states.at(-1).state,'ready')
  outbox.close()
})

test('100세션·10MB 한도는 기존 자료를 버리지 않고 새 저장을 거절한다',()=>{
  const entries=[]
  for(let index=0;index<100;index++){const plan=planBaseballOutboxWrite(entries,fixture().completed,index);entries.push(plan.entry)}
  const before=clone(entries)
  assert.throws(()=>planBaseballOutboxWrite(entries,fixture().completed,101),cause=>cause.code==='local_capacity')
  assert.deepEqual(entries,before)
  assert.throws(()=>planBaseballOutboxWrite([],fixture().completed,0,{sessions:100,bytes:1}),cause=>cause.code==='local_capacity')
  assert.equal(BASEBALL_OUTBOX_LIMITS.bytes,10*1024*1024)
})

test('개인정보·알 수 없는 필드는 디스크와 네트워크에 들어가기 전에 거절한다',async()=>{
  const repository=memory(), sent=[], states=[]
  const outbox=await createBaseballOutbox({repository,send:body=>{sent.push(body);return ack(body)},onChange:value=>states.push(value)})
  for(const key of ['playerName','jerseyNumber','teamId','ip','userAgent','cookie','frames']){
    const snapshot=fixture().completed;snapshot.sessions[0][key]='private'
    assert.equal(await outbox.enqueue(snapshot),false)
  }
  assert.equal(states.at(-1).code,'invalid_snapshot')
  assert.equal(repository.shared.entries.length,0)
  assert.equal(sent.length,0)
  outbox.close()
})

test('틀린 ID·revision·완료수·서버검증 플래그의 ACK는 pending을 보존한다',async()=>{
  for(const changed of [{sessionId:'00000000-0000-4000-8000-999999999999'},{revision:9},{completed:99},{aborted:99},{serverComputed:false}]){
    const repository=memory(), sample=fixture(), states=[]
    const outbox=await createBaseballOutbox({repository,onChange:value=>states.push(value),send:body=>({...ack(body),...changed})})
    await outbox.enqueue(sample.completed)
    await spinUntil(()=>states.at(-1).code==='invalid_response')
    assert.equal(repository.shared.entries[0].status,'pending')
    assert.equal(states.at(-1).saved,0)
    outbox.close()
  }
})

test('startup 서버 이력은 검수된 요약 필드만 노출하고 local 이력과 합친다',async()=>{
  const sample=fixture(), remote=fixture().completed, session=remote.sessions[0], states=[]
  const repository=memory()
  await repository.upsert(sample.started,1)
  const outbox=await createBaseballOutbox({repository,onChange:value=>states.push(value),readHistory:async()=>({status:'ok',practices:[{sessionId:session.sessionId,revision:2,status:session.status,completed:1,aborted:0,swings:0,receivedAt:'2026-11-24T06:00:00.000Z',serverComputed:true,token:'never pass this'}]})})
  await outbox.refreshHistory()
  assert.equal(states.at(-1).history.length,2)
  assert.equal(states.at(-1).history.find(row=>row.source==='server').completed,1)
  assert.equal(JSON.stringify(states).includes('never pass this'),false)
  outbox.close()
})

test('서버 이력의 malformed 행·중복·잘못된 완료수는 조용히 정상화하지 않는다',async()=>{
  const sample=fixture().completed, session=sample.sessions[0]
  const row={sessionId:session.sessionId,revision:1,status:session.status,completed:1,aborted:0,swings:0,receivedAt:'2026-11-24T06:00:00.000Z',serverComputed:true}
  for(const practices of [[{...row,completed:11}],[row,row],[{...row,receivedAt:'invalid'}]]){
    const states=[], outbox=await createBaseballOutbox({repository:memory(),onChange:value=>states.push(value),readHistory:async()=>({status:'ok',practices})})
    await outbox.refreshHistory()
    assert.equal(states.at(-1).code,'invalid_response')
    assert.deepEqual(states.at(-1).history,[])
    outbox.close()
  }
})

test('자동 전송 재시도는 최대3회이며 영구 오류는 수동 또는 online 신호까지 멈춘다',async()=>{
  const repository=memory(), timers=[], states=[]
  const outbox=await createBaseballOutbox({repository,send:offline,onChange:value=>states.push(value),setTimer:(fn,delay)=>{timers.push({fn,delay});return {unref(){}}},clearTimer:()=>{}})
  await outbox.enqueue(fixture().completed)
  await spinUntil(()=>timers.length===1)
  for(let index=0;index<3;index++){timers[index].fn();await spinUntil(()=>states.at(-1).sync==='error' && (index===2 || timers.length===index+2))}
  assert.deepEqual(timers.map(item=>item.delay),[1000,3000,10000])
  outbox.close()
  const permanentTimers=[]
  const stopped=await createBaseballOutbox({repository:memory(),send:()=>{throw Object.assign(Error('private'),{code:'not_configured'})},setTimer:(...args)=>permanentTimers.push(args)})
  await stopped.enqueue(fixture().completed)
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(permanentTimers.length,0)
  stopped.close()
})

test('browser 어댑터는 야구 전용 DB만 열고 미지원 저장소를 명시한다',async()=>{
  const names=[]
  const repository=createBaseballIndexedDbRepository({open(name){names.push(name);throw Error('unsupported')}})
  await assert.rejects(repository.init(),cause=>cause.code==='storage_unavailable')
  assert.deepEqual(names,[BASEBALL_OUTBOX_DATABASE])
  assert.equal(names[0].includes('sprint'),false)
  const states=[], events=[]
  const outbox=await openBaseballOutbox({indexedDB:null,eventTarget:{addEventListener:(name,fn)=>events.push([name,fn]),removeEventListener:(name,fn)=>events.push(['removed',name,fn])},onChange:value=>states.push(value)})
  assert.equal(states.at(-1).code,'storage_unavailable')
  outbox.close()
  assert.equal(events[0][0],'online')
  assert.equal(events[1][0],'removed')
  assert.equal(events[0][1],events[1][2])
})

test('첫 GET이 느려도 controller와 local 저장은 먼저 준비하고 성공 전에는 POST하지 않는다',async()=>{
  const repository=memory(), sample=fixture(), sent=[]
  let release, getStarted=false
  const outbox=await createBaseballOutbox({repository,readHistory:()=>{getStarted=true;return new Promise(resolve=>{release=()=>resolve({status:'ok',practices:[]})})},send:body=>{sent.push(body);return ack(body)}})
  assert.equal(await outbox.enqueue(sample.started),true)
  assert.equal(repository.shared.entries.length,1)
  assert.equal(sent.length,0)
  await spinUntil(()=>getStarted)
  assert.equal(sent.length,0)
  release()
  await spinUntil(()=>repository.shared.entries[0].status==='saved')
  assert.equal(sent.length,1)
  outbox.close()
})

test('StrictMode에서 늦게 준비된 취소 instance는 첫 네트워크 요청도 시작하지 않는다',async()=>{
  const sent=[]
  const outbox=await createBaseballOutbox({repository:memory(),readHistory:()=>{sent.push('GET');return emptyHistory()},send:body=>{sent.push('POST');return ack(body)}})
  outbox.close()
  await new Promise(resolve=>setImmediate(resolve))
  assert.deepEqual(sent,[])
})

test('entry와 ACK 갱신 계약은 다른 session과 revision을 손상하지 않는다',()=>{
  const sample=fixture(), entry=planBaseballOutboxWrite([],sample.completed,1).entry
  assert.equal(validateBaseballOutboxEntry(entry),true)
  assert.equal(planBaseballOutboxAcknowledgement(entry,2),null)
  assert.equal(planBaseballOutboxAcknowledgement(entry,1).status,'saved')
  assert.equal(entry.status,'pending')
  assert.equal(validateBaseballOutboxEntry({...entry,password:'secret'}),false)
})

function leaseStore() {
  let lease
  const claims=[], releases=[]
  return {
    claim:async(owner,at)=>{claims.push(owner);const plan=planBaseballBootstrapLease(lease,owner,at);if(plan.acquired)lease=plan.lease;return plan.acquired},
    release:async owner=>{releases.push(owner);if(canReleaseBaseballBootstrapLease(lease,owner)){lease=undefined;return true}return false},
    current:()=>lease,claims,releases,
  }
}
const owner=number=>`10000000-0000-4000-8000-${String(number).padStart(12,'0')}`

test('서로 다른 두 controller의 최초 GET은 lease로 직렬화해 같은 cookie owner를 사용한다',async()=>{
  const shared={entries:[],tail:Promise.resolve()}, lease=leaseStore(), firstRepo=memory(shared), secondRepo=memory(shared)
  firstRepo.withBootstrapLease=createBaseballBootstrapGate({...lease,idFactory:()=>owner(1),wait:async()=>new Promise(resolve=>setImmediate(resolve))})
  secondRepo.withBootstrapLease=createBaseballBootstrapGate({...lease,idFactory:()=>owner(2),wait:async()=>new Promise(resolve=>setImmediate(resolve))})
  let cookie=null, firstRelease, gets=0
  const ownerAtGet=[], ownerAtPost=[]
  const readHistory=async()=>{
    const incoming=cookie;ownerAtGet.push(incoming);gets++
    if(gets===1)await new Promise(resolve=>{firstRelease=resolve})
    if(!incoming)cookie=`anonymous-${gets}`
    return {status:'ok',practices:[]}
  }
  const send=async body=>{ownerAtPost.push(cookie);return ack(body)}
  const first=await createBaseballOutbox({repository:firstRepo,readHistory,send})
  const second=await createBaseballOutbox({repository:secondRepo,readHistory,send})
  await first.enqueue(fixture().completed)
  await second.enqueue(fixture().completed)
  await spinUntil(()=>Boolean(firstRelease))
  assert.equal(gets,1)
  assert.equal(shared.entries.length,2,'Local records can be written while GET holds the metadata lease')
  firstRelease()
  await spinUntil(()=>gets===2 && shared.entries.every(entry=>entry.status==='saved'))
  assert.deepEqual(ownerAtGet,[null,'anonymous-1'])
  assert.ok(ownerAtPost.length>=2)
  assert.ok(ownerAtPost.every(value=>value==='anonymous-1'))
  assert.equal(lease.current(),undefined)
  first.close();second.close()
})

test('만료 lease는 새 owner가 인계받고 이전 owner의 finally release는 새 lease를 지우지 않는다',async()=>{
  const store=leaseStore(), firstSignal=new AbortController()
  let now=0, firstLate, secondDone
  const first=createBaseballBootstrapGate({...store,now:()=>now,idFactory:()=>owner(1)})
  const second=createBaseballBootstrapGate({...store,now:()=>now,idFactory:()=>owner(2)})
  const old=first(()=>new Promise(resolve=>{firstLate=resolve}),{signal:firstSignal.signal})
  await spinUntil(()=>Boolean(firstLate))
  assert.equal(store.current().expiresAt,BASEBALL_BOOTSTRAP_LEASE_MS)
  now=BASEBALL_BOOTSTRAP_LEASE_MS+1
  const current=second(()=>new Promise(resolve=>{secondDone=resolve}))
  await spinUntil(()=>Boolean(secondDone))
  assert.equal(store.current().owner,owner(2))
  firstSignal.abort()
  await assert.rejects(old,cause=>cause.code==='network_unavailable')
  assert.equal(store.current().owner,owner(2))
  firstLate({status:'ok',practices:[]})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(store.current().owner,owner(2))
  secondDone('new-owner')
  assert.equal(await current,'new-owner')
  assert.equal(store.current(),undefined)
})

test('lease 대기 중 close는 다른 owner를 해제하거나 GET를 실행하지 않는다',async()=>{
  const store=leaseStore(), signal=new AbortController()
  await store.claim(owner(1),Date.now())
  let waiting, calls=0
  const gate=createBaseballBootstrapGate({...store,idFactory:()=>owner(2),wait:async(_delay,abort)=>new Promise((resolve,reject)=>{waiting=true;abort.addEventListener('abort',()=>reject(Object.assign(Error('stopped'),{code:'network_unavailable'})),{once:true})})})
  const work=gate(()=>{calls++},{signal:signal.signal})
  await spinUntil(()=>waiting)
  signal.abort()
  await assert.rejects(work,cause=>cause.code==='network_unavailable')
  assert.equal(store.current().owner,owner(1))
  assert.equal(store.releases.length,0)
  assert.equal(calls,0)
})

test('lease 대기는 clock이 멈추거나 긴 lease여도 최대100회 뒤 종료한다',async()=>{
  let calls=0, waits=0
  const gate=createBaseballBootstrapGate({claim:async()=>{calls++;return false},release:async()=>assert.fail('No owned lease'),idFactory:()=>owner(1),now:()=>0,wait:async()=>{waits++}})
  await assert.rejects(gate(()=>assert.fail('No GET before acquiring lease')),cause=>cause.code==='network_unavailable')
  assert.equal(calls,100)
  assert.equal(waits,100)
})

test('lease 메타데이터 손상은 자료를 삭제하거나 소유권을 추측하지 않는다',()=>{
  const first=planBaseballBootstrapLease(undefined,owner(1),1)
  assert.equal(first.acquired,true)
  assert.equal(planBaseballBootstrapLease(first.lease,owner(2),2).acquired,false)
  assert.equal(canReleaseBaseballBootstrapLease(first.lease,owner(2)),false)
  assert.equal(canReleaseBaseballBootstrapLease(first.lease,owner(1)),true)
  assert.throws(()=>planBaseballBootstrapLease({owner:owner(1)},owner(2),10),cause=>cause.code==='local_data_invalid')
  assert.throws(()=>canReleaseBaseballBootstrapLease({owner:owner(1)},owner(1)),cause=>cause.code==='local_data_invalid')
})

test('IndexedDB version2 업그레이드는 기존 practices를 보존하고 meta store만 추가한다',async()=>{
  const sample=fixture(), entry=planBaseballOutboxWrite([],sample.completed,1).entry
  const rows=[clone(entry)], stores=new Set(['practices']), created=[], versions=[]
  const database={
    objectStoreNames:{contains:name=>stores.has(name)},
    createObjectStore(name,options){created.push([name,options]);stores.add(name)},
    close(){},
    transaction(name){
      assert.equal(name,'practices')
      const tx={objectStore(){return {getAll(){const request={};queueMicrotask(()=>{request.result=clone(rows);request.onsuccess();queueMicrotask(()=>tx.oncomplete())});return request}}}}
      return tx
    },
  }
  const repository=createBaseballIndexedDbRepository({open(name,version){
    assert.equal(name,BASEBALL_OUTBOX_DATABASE);versions.push(version)
    const request={result:database};queueMicrotask(()=>{request.onupgradeneeded();request.onsuccess()});return request
  }})
  await repository.init()
  assert.deepEqual(versions,[2])
  assert.deepEqual(created,[['meta',{keyPath:'key'}]])
  assert.deepEqual(await repository.list(),[entry])
  assert.deepEqual(rows,[entry])
  repository.close()
})

test('lease를 얻은 직후 취소돼도 work를 실행하지 않고 소유 lease를 해제한다',async()=>{
  const store=leaseStore(), signal=new AbortController()
  let executed=0
  const gate=createBaseballBootstrapGate({...store,idFactory:()=>owner(1),claim:async(...args)=>{const claimed=await store.claim(...args);signal.abort();return claimed}})
  await assert.rejects(gate(()=>{executed++},{signal:signal.signal}),cause=>cause.code==='network_unavailable')
  assert.equal(executed,0)
  assert.equal(store.current(),undefined)
  assert.deepEqual(store.releases,[owner(1)])
})

test('명시원본확인은pending사본만읽고쓰기·ACK·전송·상태변경없이독립복사한다',async()=>{
  const first=fixture(),second=fixture()
  const pending=planBaseballOutboxWrite([],first.completed,1).entry
  const saved=planBaseballOutboxAcknowledgement(planBaseballOutboxWrite([],second.completed,2).entry,1)
  const repository=memory({entries:[pending,saved],tail:Promise.resolve()}),states=[]
  let writes=0,acknowledgements=0
  repository.upsert=async()=>{writes++;assert.fail('Inspection must not write')}
  repository.markSaved=async()=>{acknowledgements++;assert.fail('Inspection must not acknowledge')}
  const outbox=await createBaseballOutbox({repository,onChange:state=>states.push(state)})
  const before=clone(repository.shared.entries),published=states.length
  const inspected=await outbox.inspectPending()
  assert.deepEqual(inspected,{code:null,entries:[pending]})
  assert.equal(states.length,published)
  assert.equal(writes,0);assert.equal(acknowledgements,0)
  assert.deepEqual(repository.shared.entries,before)
  inspected.entries[0].revision=999
  inspected.entries[0].snapshot.sessions[0].attempts[0].result.score=999
  assert.deepEqual((await outbox.inspectPending()).entries,[pending])
  assert.deepEqual(repository.shared.entries,before)
  outbox.close()
  await assert.rejects(outbox.inspectPending(),cause=>cause.code==='storage_unavailable')
})

test('형식검증에실패한과거원본도변환·삭제없이명시읽기로보존상태를확인한다',async()=>{
  const sample=fixture(),original=planBaseballOutboxWrite([],sample.completed,1).entry
  original.snapshot.sessions[0].historicalField='retained-unknown-field'
  const repository=memory({entries:[clone(original)],tail:Promise.resolve()}),states=[]
  const outbox=await createBaseballOutbox({repository,onChange:state=>states.push(state)})
  assert.equal(states.at(-1).code,'local_data_invalid')
  const before=clone(repository.shared.entries),published=states.length
  assert.deepEqual(await outbox.inspectPending(),{code:'local_data_invalid',entries:[original]})
  assert.equal(states.length,published)
  assert.deepEqual(repository.shared.entries,before)
  assert.equal(validateBaseballOutboxEntry(repository.shared.entries[0]),false)
  outbox.close()
})

test('실제HTTPtransport의기존서버오류3개를보존하고원본/중단/수동재전송계약을유지한다',async()=>{
  const require=createRequire(import.meta.url),{loadBindings,transform}=require('next/dist/build/swc')
  await loadBindings()
  const url=new URL('../lib/playground-baseball-outbox.mjs',import.meta.url),source=await fs.readFile(url,'utf8')
  const compiled=await transform(source,{filename:fileURLToPath(url),jsc:{parser:{syntax:'ecmascript'},target:'es2022'},module:{type:'commonjs'}})
  const library=await import('../lib/playground-baseball-data.mjs'),targetModule={exports:{}}
  vm.runInNewContext(`${compiled.code}\nmodule.exports.__transport=createFetchTransport`,{
    module:targetModule,exports:targetModule.exports,AbortController,setTimeout,clearTimeout,
    require:()=>library,
  })
  const transportFor=targetModule.exports.__transport
  for(const [code,status]of [['invalid_pitch',400],['rate_limited',429],['verification_unavailable',503]]){
    const requests=[],states=[],sample=fixture(),repository=memory()
    const transport=transportFor(async(_url,options)=>{
      requests.push(JSON.parse(options.body))
      return {ok:false,status,json:async()=>({status:'error',code,message:'private-server-error'})}
    })
    let scheduled=0
    const outbox=await createBaseballOutbox({repository,send:transport.send,onChange:state=>states.push(state),
      setTimer:()=>{scheduled++;return {}},clearTimer:()=>{}})
    await outbox.enqueue(sample.completed)
    await spinUntil(()=>states.at(-1).code===code)
    const retained=clone(repository.shared.entries)
    assert.equal(states.at(-1).pending,1);assert.equal(states.at(-1).saved,0)
    assert.equal(scheduled,0)
    assert.equal(await outbox.retry(),false)
    assert.equal(states.at(-1).code,code)
    assert.equal(requests.length,2)
    assert.deepEqual(requests[0],requests[1])
    assert.deepEqual(repository.shared.entries,retained)
    assert.equal(JSON.stringify(states).includes('private-server-error'),false)
    outbox.close()
  }
  for(const code of ['invalid_origin','unexpected-private-server-code']){
    const transport=transportFor(async()=>({ok:false,json:async()=>({code,message:'private-server-error'})}))
    await assert.rejects(transport.send({revision:1}),cause=>cause.code==='network_unavailable'&&!cause.message.includes('private-server-error'))
  }
})
