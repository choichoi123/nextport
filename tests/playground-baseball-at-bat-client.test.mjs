import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaseballAtBatSession, applyBaseballAtBatSessionCommand, publicBaseballAtBatSession } from '../lib/playground-baseball-at-bat-session.mjs'
import { validBaseballAtBatCheckpoint, validBaseballAtBatJournal, planBaseballAtBatJournalWrite, planBaseballAtBatJournalAdoption, openBaseballAtBatClient, createBaseballAtBatTransport } from '../lib/playground-baseball-at-bat-client.mjs'

const clone=value=>JSON.parse(JSON.stringify(value))
let number=0
const id=()=>`00000000-0000-4000-8000-${String(++number).padStart(12,'0')}`
const player={name:'저장 테스트',jerseyNumber:'07',teamId:'wiz',handedness:'right'}
const config={handedness:'right',pitcherHandedness:'left',baseSpeedKmh:120,pitchMode:'mixed'}
const versions=Object.fromEntries(['engineHash','rulesHash','atBatHash','fieldHash','sessionHash'].map(key=>[key,'a'.repeat(64)]))
const at=Date.UTC(2026,10,24,4)
const error=code=>Object.assign(new Error('Private error text is never a UI message'),{code})

function makeRepository(shared={entries:[],conflicts:[]}){
  let failWrite=false
  return {
    shared,
    init:async()=>{},list:async()=>clone(shared.entries),close:()=>{},
    setFailure:value=>{failWrite=value},
    write:async(entry,options)=>{
      if(failWrite)throw error('storage_unavailable')
      const next=planBaseballAtBatJournalWrite(shared.entries,entry,undefined,options)
      shared.entries=[...shared.entries.filter(value=>value.id!==next.id),next]
      return clone(next)
    },
    adopt:async(sessionId,checkpoint,updatedAt,extra)=>{
      const previous=shared.entries.find(entry=>entry.id===sessionId)
      const plan=planBaseballAtBatJournalAdoption(previous,checkpoint,updatedAt,extra,shared.conflicts)
      shared.conflicts.push(...plan.conflicts)
      shared.entries=[...shared.entries.filter(entry=>entry.id!==sessionId),plan.entry]
    },
  }
}

function makeServer(){
  const sessions=new Map(),receipts=new Map(),calls=[]
  let loseReply=false
  const api={
    sessions,calls,receipts,
    loseNextReply:()=>{loseReply=true},
    list:async()=>({status:'ok',atBats:[...sessions.values()].slice(-20).map(session=>({id:session.id,revision:session.revision,status:session.state.status,pitchCount:session.state.pitchCount,balls:session.state.balls,strikes:session.state.strikes,outcome:session.state.outcome,source:session.source,updatedAt:session.updatedAt}))}),
    read:async sessionId=>{if(!sessions.has(sessionId))throw error('not_found');return {status:'ok',session:publicBaseballAtBatSession(sessions.get(sessionId))}},
    send:async(sessionId,pending)=>{
      calls.push(clone({sessionId,pending}))
      const body=pending.body,key=body.commandId,old=receipts.get(key)
      if(old){
        if(JSON.stringify(old.body)!==JSON.stringify(body))throw error('command_conflict')
        return {status:'stored',session:publicBaseballAtBatSession(sessions.get(sessionId)),receipt:old.receipt,duplicate:true}
      }
      const previous=sessions.get(sessionId)
      if(pending.operation==='command'&&previous?.revision!==body.expectedRevision)throw error('revision_conflict')
      const session=pending.operation==='create'
        ?createBaseballAtBatSession({id:sessionId,seed:1,config:body.settings,versions,source:body.source,now:new Date(at+calls.length).toISOString()})
        :applyBaseballAtBatSessionCommand(previous,{...body.command,commandId:body.commandId,expectedRevision:body.expectedRevision},{now:new Date(at+calls.length).toISOString(),attemptId:id(),versions})
      sessions.set(sessionId,session)
      const receipt={commandId:key,revision:session.revision,sessionId}
      receipts.set(key,{body:clone(body),receipt})
      if(loseReply){loseReply=false;throw error('network_unavailable')}
      return {status:'stored',session:publicBaseballAtBatSession(session),receipt,duplicate:false}
    },
    close:()=>{},
  }
  return api
}
async function makeClient(repository=makeRepository(),server=makeServer()){
  const client=await openBaseballAtBatClient({repository,transport:server,idFactory:id,now:()=>at,onChange:()=>{}})
  return {client,repository,server}
}

test('public checkpoint rejects invalid count, stats, hashes, private seed and accepted input',()=>{
  const session=createBaseballAtBatSession({id:id(),seed:1,config,versions,now:new Date(at).toISOString()})
  const value=publicBaseballAtBatSession(session)
  assert.equal(validBaseballAtBatCheckpoint(value),true)
  for(const mutate of [v=>{v.state.balls=4},v=>{v.state.stats.AB=1},v=>{v.versions.engineHash='invalid'},v=>{v.state.seed=1},v=>{v.state.extra=1},v=>{v.config.name='private'}]){
    const corrupted=clone(value);mutate(corrupted);assert.equal(validBaseballAtBatCheckpoint(corrupted),false)
  }
  const issued=clone(publicBaseballAtBatSession(applyBaseballAtBatSessionCommand(session,{type:'issue',commandId:id(),expectedRevision:1},{now:new Date(at+1).toISOString(),attemptId:id()})))
  assert.equal(validBaseballAtBatCheckpoint(issued),true)
  issued.pending.input={kind:'swing',swingAtMs:Infinity,aim:{x:0,y:.7}};issued.pending.inputAcceptedAt=new Date(at+1).toISOString()
  assert.equal(validBaseballAtBatCheckpoint(issued),false)
})

test('create stores only settings/source remotely and keeps the display player locally',async()=>{
  const {client,repository,server}=await makeClient()
  const session=await client.create(config,player,{source:'development'})
  assert.equal(session.source,'development')
  assert.deepEqual(server.calls[0].pending.body.settings,config)
  assert.equal(JSON.stringify(server.calls).includes(player.name),false)
  assert.equal(repository.shared.entries[0].player.name,player.name)
  assert.equal(repository.shared.entries[0].pending,null)
  assert.equal(validBaseballAtBatJournal(repository.shared.entries[0]),true)
  client.close()
})

test('a lost create reply retries the exact command without creating another at-bat',async()=>{
  const {client,repository,server}=await makeClient()
  server.loseNextReply()
  await assert.rejects(client.create(config,player),cause=>cause.code==='network_unavailable')
  const original=clone(repository.shared.entries[0].pending)
  const session=await client.retry(repository.shared.entries[0].id)
  assert.deepEqual(server.calls[1].pending,original)
  assert.equal(server.sessions.size,1)
  assert.equal(session.revision,1)
  assert.equal(repository.shared.entries[0].pending,null)
  client.close()
})

test('an accepted input survives a lost reply and a new client instance',async()=>{
  const {client,repository,server}=await makeClient()
  let session=await client.create(config,player)
  session=await client.command(session.id,{type:'issue'})
  const command={type:'accept-input',pitchId:session.pending.pitchId,attemptId:session.pending.attemptId,input:{kind:'swing',swingAtMs:-100,aim:{x:0,y:.745},source:'keyboard',surface:'field'}}
  server.loseNextReply()
  await assert.rejects(client.command(session.id,command),cause=>cause.code==='network_unavailable')
  const original=clone(repository.shared.entries[0].pending)
  client.close()
  const next=(await makeClient(makeRepository(repository.shared),server)).client
  const read=await next.read(session.id,player)
  assert.deepEqual(read.pending,original)
  assert.equal(read.session.pending.input.kind,'swing')
  const accepted=await next.retry(session.id)
  assert.equal(accepted.revision,3)
  assert.deepEqual(server.calls.at(-1).pending,original)
  const resolved=await next.command(session.id,{type:'resolve',pitchId:accepted.pending.pitchId,attemptId:accepted.pending.attemptId})
  assert.equal(resolved.state.pitchCount,1)
  assert.equal(resolved.state.strikes,1)
  assert.equal(resolved.revision,4)
  next.close()
})

test('local write failure sends no mutation and keeps volatile intent for an exact retry',async()=>{
  const {client,repository,server}=await makeClient()
  repository.setFailure(true)
  await assert.rejects(client.create(config,player),cause=>cause.code==='storage_unavailable')
  const view=client.snapshot(),entry=view.entries[0]
  assert.equal(view.volatileIds[0],entry.id)
  assert.equal(server.calls.length,0)
  repository.setFailure(false)
  await client.retry(entry.id)
  assert.equal(server.calls[0].pending.body.commandId,entry.pending.body.commandId)
  assert.equal(client.snapshot().volatileIds.length,0)
  client.close()
})

test('the journal exists before each input request and serializes resolve behind it',async()=>{
  const {client,repository,server}=await makeClient()
  const original=server.send
  server.send=async(sessionId,pending)=>{
    assert.deepEqual(repository.shared.entries.find(entry=>entry.id===sessionId).pending,pending)
    return original(sessionId,pending)
  }
  let session=await client.create(config,player)
  session=await client.command(session.id,{type:'issue'})
  const ids={pitchId:session.pending.pitchId,attemptId:session.pending.attemptId}
  const accept=client.command(session.id,{type:'accept-input',...ids,input:{kind:'take'}})
  const resolve=client.command(session.id,{type:'resolve',...ids})
  await accept
  const result=await resolve
  assert.equal(result.state.pitchCount,1)
  assert.deepEqual(server.calls.slice(-2).map(call=>call.pending.body.command.type),['accept-input','resolve'])
  client.close()
})

test('a late command A receipt cannot erase command B waiting in another tab',async()=>{
  const {client,repository}=await makeClient()
  let session=await client.create(config,player)
  const previous=clone(repository.shared.entries[0]),commandA=id(),commandB=id()
  const entryA={...previous,pending:{operation:'command',body:{commandId:commandA,expectedRevision:1,command:{type:'issue'}}}}
  session={...clone(session),revision:3}
  const entryB={...previous,checkpoint:{...clone(session),revision:2},pending:{operation:'command',body:{commandId:commandB,expectedRevision:2,command:{type:'issue'}}}}
  assert.throws(()=>planBaseballAtBatJournalWrite([entryB],{...entryA,checkpoint:session,pending:null},undefined,{acknowledgedCommandId:commandA}),cause=>cause.code==='local_conflict')
  assert.equal(entryB.pending.body.commandId,commandB)
  client.close()
})

test('two-tab conflict requires explicit adoption and archives the losing intent',async()=>{
  const {client:first,repository,server}=await makeClient()
  const session=await first.create(config,player)
  const second=(await makeClient(makeRepository(repository.shared),server)).client
  await second.read(session.id,player)
  await first.command(session.id,{type:'issue'})
  await assert.rejects(second.command(session.id,{type:'issue'}),cause=>cause.code==='local_conflict')
  const pending=clone(second.snapshot().entries[0].pending)
  const read=await second.read(session.id,player)
  assert.deepEqual(read.pending,pending)
  assert.equal(repository.shared.conflicts.length,0)
  const adopted=await second.adoptLatest(session.id)
  assert.equal(adopted.revision,2)
  assert.equal(repository.shared.conflicts.length,1)
  assert.deepEqual(repository.shared.conflicts[0].pending,pending)
  assert.equal(repository.shared.entries[0].pending,null)
  first.close();second.close()
})

test('adoption cannot silently discard an input that the server has not advanced past',async()=>{
  const {client,repository}=await makeClient()
  const session=await client.create(config,player)
  const entry={...repository.shared.entries[0],pending:{operation:'command',body:{commandId:id(),expectedRevision:session.revision,command:{type:'issue'}}}}
  assert.throws(()=>planBaseballAtBatJournalAdoption(entry,session,at),cause=>cause.code==='local_conflict')
  client.close()
})

test('server storage capacity keeps the identical pending input and a safe error code',async()=>{
  const {client,repository,server}=await makeClient()
  const session=await client.create(config,player)
  server.send=async()=>{throw error('storage_capacity')}
  await assert.rejects(client.command(session.id,{type:'issue'}),cause=>cause.code==='storage_capacity')
  const pending=clone(repository.shared.entries[0].pending)
  await assert.rejects(client.retry(session.id),cause=>cause.code==='storage_capacity')
  assert.deepEqual(repository.shared.entries[0].pending,pending)
  client.close()
})

test('transport bootstraps through the shared identity lease and uses same-origin/no-store',async()=>{
  const order=[],calls=[]
  const transport=createBaseballAtBatTransport({bootstrapRepository:{init:async()=>order.push('init'),withBootstrapLease:async work=>{order.push('claim');try{return await work()}finally{order.push('release')}},close:()=>{}},fetchImpl:async(url,options)=>{
    calls.push({url,options});order.push('GET');return {ok:true,json:async()=>({status:'ok',atBats:[]})}
  }})
  await transport.list()
  assert.deepEqual(order,['init','claim','GET','release'])
  assert.equal(calls[0].url,'/api/playground/baseball/at-bats')
  assert.equal(calls[0].options.credentials,'same-origin')
  assert.equal(calls[0].options.cache,'no-store')
  transport.close()
})

test('network and unknown error details never become client-facing messages',async()=>{
  const transport=createBaseballAtBatTransport({fetchImpl:async()=>{throw Error('private-token-and-hostname')}})
  await assert.rejects(transport.read(id()),cause=>cause.code==='network_unavailable'&&!cause.message.includes('private-token'))
  transport.close()
})
