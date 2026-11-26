import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaseballCareerSave,publicBaseballCareerSave,applyBaseballCareerCommand,createBaseballCareerManualAtBat,simulateBaseballCareerAtBat,advanceBaseballCareerAtBat } from '../lib/playground-baseball-career-v2.mjs'
import { applyBaseballAtBatSessionCommand,publicBaseballAtBatSession } from '../lib/playground-baseball-at-bat-session-v2.mjs'
import { planBaseballAtBatJournalWrite,planBaseballAtBatJournalAdoption } from '../lib/playground-baseball-at-bat-v2-client.mjs'
import { openBaseballCareerClient,validBaseballCareerCheckpoint,validBaseballCareerJournal,planBaseballCareerJournalWrite,planBaseballCareerAdoption,createBaseballCareerTransport,planBaseballCareerAtBatJournalWrite } from '../lib/playground-baseball-career-v2-client.mjs'

const clone=value=>JSON.parse(JSON.stringify(value))
let number=0
const id=()=>`30000000-0000-4000-8000-${String(++number).padStart(12,'0')}`
const at='2026-11-24T09:00:00.000Z'
const profile={name:'육성 검수',jerseyNumber:'07',handedness:'left',teamId:'wiz'}
const settings={baseSpeedKmh:80,pitchMode:'mixed'}
const versions=Object.fromEntries(['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','careerHash','growthHash'].map(key=>[key,'a'.repeat(64)]))
const error=code=>Object.assign(Error('Private failure details'),{code})
function repositories(shared={careers:[],careerConflicts:[],atBats:[],atBatConflicts:[]}){
  let failWrites=false,failCareerWrites=false
  const make=(key,conflicts,kind)=>({
    init:async()=>{},list:async()=>clone(shared[key]),close:()=>{},
    write:async(entry,options)=>{if(failWrites||kind==='career'&&failCareerWrites)throw error('storage_unavailable');const value=kind==='career'?planBaseballCareerJournalWrite(shared[key],entry,options):planBaseballAtBatJournalWrite(shared[key],entry,undefined,options);shared[key]=[...shared[key].filter(old=>old.id!==entry.id),value]},
    adopt:async(sessionId,checkpoint,updatedAt,extra)=>{const prior=shared[key].find(entry=>entry.id===sessionId);const plan=kind==='career'?planBaseballCareerAdoption(prior,checkpoint,updatedAt,extra):planBaseballAtBatJournalAdoption(prior,checkpoint,updatedAt,extra,shared[conflicts]);shared[key]=[...shared[key].filter(entry=>entry.id!==sessionId),plan.entry];shared[conflicts].push(...plan.conflicts)},
  })
  return {shared,career:make('careers','careerConflicts','career'),atBats:make('atBats','atBatConflicts','at-bat'),setFailure:value=>{failWrites=value},setCareerFailure:value=>{failCareerWrites=value},close:()=>{}}
}
function server(){
  const saves=new Map(),atBats=new Map(),receipts=new Map(),calls=[]
  let loseReply=false
  const api={saves,atBats,calls,loseNext:()=>{loseReply=true},close:()=>{},
    list:async()=>({status:'ok',careers:[...saves.values()].slice(-20).map(save=>({id:save.id,revision:save.revision,profile:save.profile,status:save.status,completedGames:save.currentGameIndex,updatedAt:save.updatedAt}))}),
    read:async saveId=>{if(!saves.has(saveId))throw error('not_found');return {status:'ok',career:publicBaseballCareerSave(saves.get(saveId))}},
    async send(saveId,pending){
      const body=pending.body,key=body.commandId;calls.push(clone({saveId,pending}))
      if(receipts.has(key))return {status:'stored',career:publicBaseballCareerSave(saves.get(saveId)),receipt:receipts.get(key),duplicate:true}
      let save=saves.get(saveId)
      if(pending.operation==='create')save=createBaseballCareerSave({id:saveId,profile:body.profile,settings:body.settings,source:body.source,versions,seed:42,now:at})
      else{
        if(save.revision!==body.expectedRevision)throw error('revision_conflict')
        let atBat
        if(body.command.type==='start-manual')atBat=createBaseballCareerManualAtBat(save,{id:id(),seed:1,now:at})
        if(body.command.type==='simulate-at-bat')atBat=simulateBaseballCareerAtBat(save,{id:id(),seed:1,now:at})
        save=applyBaseballCareerCommand(save,{...body.command,commandId:key,expectedRevision:body.expectedRevision},{now:at,atBat})
        if(atBat)atBats.set(atBat.id,atBat)
      }
      saves.set(saveId,save);const receipt={sessionId:saveId,commandId:key,revision:save.revision};receipts.set(key,receipt)
      if(loseReply){loseReply=false;throw error('network_unavailable')}
      return {status:'stored',career:publicBaseballCareerSave(save),receipt,duplicate:false}
    },
    async atBatRead(saveId,atBatId){return {status:'ok',career:publicBaseballCareerSave(saves.get(saveId)),session:publicBaseballAtBatSession(atBats.get(atBatId))}},
    async atBatSend(saveId,atBatId,body){
      calls.push(clone({saveId,atBatId,body}))
      let save=saves.get(saveId),atBat=atBats.get(atBatId)
      if(receipts.has(body.commandId))return {status:'stored',career:publicBaseballCareerSave(save),session:publicBaseballAtBatSession(atBat),receipt:receipts.get(body.commandId),duplicate:true}
      atBat=applyBaseballAtBatSessionCommand(atBat,{...body.command,commandId:body.commandId,expectedRevision:body.expectedRevision},{now:at,attemptId:id()})
      save=advanceBaseballCareerAtBat(save,atBat,{expectedRevision:save.revision,now:at})
      saves.set(saveId,save);atBats.set(atBatId,atBat)
      const receipt={sessionId:atBatId,commandId:body.commandId,revision:atBat.revision};receipts.set(body.commandId,receipt)
      if(loseReply){loseReply=false;throw error('network_unavailable')}
      return {status:'stored',career:publicBaseballCareerSave(save),session:publicBaseballAtBatSession(atBat),receipt,duplicate:false}
    },
  }
  return api
}
async function clientFor(repo=repositories(),transport=server()){
  const changes=[]
  const client=await openBaseballCareerClient({repositories:repo,transport,idFactory:id,now:()=>1,onChange:value=>changes.push(value)})
  return {client,repo,transport,changes}
}

test('career checkpoint keeps finite public profiles, schedule, stats and source without private fields',()=>{
  const save=createBaseballCareerSave({id:id(),profile,settings,source:'development',versions,seed:42,now:at}),view=publicBaseballCareerSave(save)
  assert.equal(validBaseballCareerCheckpoint(view),true)
  for(const change of [v=>{v.seed=1},v=>{v.profile.name=''},v=>{v.versions.careerHash='bad'},v=>{v.games.pop()},v=>{v.stats.H=-1},v=>{v.activeAtBat={id:'bad',gameIndex:0}},v=>{v.ownerHash='secret'},v=>{v.ledger=[null]},v=>{v.growth.condition=1000},v=>{v.rates.AVG=.5},v=>{v.statsBySource.manual=null},v=>{v.feedback=['made-up']},v=>{v.statsBySource.manual.PA=3}]){
    const value=clone(view);change(value);assert.equal(validBaseballCareerCheckpoint(value),false)
  }
})

test('long-career journal evicts only server-confirmed terminal appearances when full',()=>{
  const saved=createBaseballCareerSave({id:id(),profile,settings,versions,seed:42,now:at})
  const prepared=applyBaseballCareerCommand(saved,{commandId:id(),expectedRevision:1,type:'prepare',choice:'rest'},{now:at})
  const create=()=>createBaseballCareerManualAtBat(prepared,{id:id(),seed:1,now:at})
  const journal=(session,updatedAt,pending=null)=>({schemaVersion:2,id:session.id,player:profile,checkpoint:publicBaseballAtBatSession(session),pending,updatedAt})
  let completed=create()
  for(let pitch=0;pitch<3;pitch++){
    completed=applyBaseballAtBatSessionCommand(completed,{commandId:id(),expectedRevision:completed.revision,type:'issue'},{now:at,attemptId:id()})
    const {pitchId,attemptId}=completed.pending
    completed=applyBaseballAtBatSessionCommand(completed,{commandId:id(),expectedRevision:completed.revision,type:'accept-input',pitchId,attemptId,input:{kind:'swing',swingAtMs:-500,aim:{x:0,y:.7}}},{now:at})
    completed=applyBaseballAtBatSessionCommand(completed,{commandId:id(),expectedRevision:completed.revision,type:'resolve',pitchId,attemptId},{now:at})
  }
  const waiting=create(),active=journal(waiting,1),pending=journal(waiting,1,{operation:'command',body:{commandId:id(),expectedRevision:1,command:{type:'issue'}}})
  const entry=journal(create(),3)
  const limits={sessions:2,bytes:10*1024*1024}
  assert.deepEqual(planBaseballCareerAtBatJournalWrite([pending,journal(completed,2)],entry,undefined,limits),{entry,evictedIds:[completed.id]})
  assert.throws(()=>planBaseballCareerAtBatJournalWrite([active],entry,undefined,{...limits,sessions:1}),{code:'local_capacity'})
})

test('public validation accepts PostgreSQL key ordering without persisting a private seed',async()=>{
  const {client,repo}=await clientFor(),save=await client.create(profile,settings)
  const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reverse(value[key])])):value
  assert.equal(validBaseballCareerCheckpoint(reverse(save)),true)
  assert.equal(JSON.stringify(repo.shared).includes('"seed"'),false)
  client.close()
})

test('a lost creation response retains profile/source and retries the same save ID',async()=>{
  const {client,repo,transport}=await clientFor();transport.loseNext()
  await assert.rejects(client.create(profile,settings,{source:'development'}),cause=>cause.code==='network_unavailable')
  const entry=clone(repo.shared.careers[0]);assert.equal(validBaseballCareerJournal(entry),true)
  const save=await client.retry(entry.id)
  assert.equal(transport.saves.size,1);assert.equal(save.source,'development');assert.deepEqual(save.profile,profile)
  assert.equal(transport.calls[1].pending.body.commandId,transport.calls[0].pending.body.commandId)
  client.close()
})

test('a lost automatic response is restored and cannot repeat growth or the plate appearance',async()=>{
  const {client,repo,transport}=await clientFor()
  let save=await client.create(profile,settings);save=await client.command(save.id,{type:'prepare',choice:'power'})
  transport.loseNext();await assert.rejects(client.command(save.id,{type:'simulate-at-bat'}),cause=>cause.code==='network_unavailable')
  const original=clone(repo.shared.careers[0].pending);client.close()
  const next=(await clientFor(repositories(repo.shared),transport)).client
  const restored=await next.read(save.id);assert.deepEqual(restored.pending,original)
  const confirmed=await next.retry(save.id)
  assert.equal(confirmed.stats.PA,1);assert.equal(confirmed.games[0].appearances.length,1)
  assert.equal(confirmed.ledger.filter(event=>event.kind==='appearance').length,1)
  next.close()
})

test('manual adapter uses its own journal and confirms a completed D result once into the career',async()=>{
  const {client,repo}=await clientFor()
  let save=await client.create(profile,settings,{source:'development'});save=await client.command(save.id,{type:'prepare',choice:'discipline'});save=await client.command(save.id,{type:'start-manual'})
  const adapter=await client.atBatAdapter(save.id,save.activeAtBat.id,profile)
  let state=adapter.session,notifications=0;const unsubscribe=adapter.client.subscribe(()=>notifications++)
  for(let pitch=0;pitch<3;pitch++){
    state=await adapter.client.command(state.id,{type:'issue'})
    const ids={pitchId:state.pending.pitchId,attemptId:state.pending.attemptId}
    state=await adapter.client.command(state.id,{type:'accept-input',...ids,input:{kind:'swing',swingAtMs:-1200,aim:{x:0,y:.745},source:'keyboard',surface:'field'}})
    state=await adapter.client.command(state.id,{type:'resolve',...ids})
  }
  assert.equal(state.state.outcome,'strikeout-swinging')
  assert.equal(repo.shared.atBats.length,1);assert.equal(repo.shared.careers.length,1)
  const career=client.snapshot().entries[0].checkpoint
  assert.equal(career.stats.PA,1);assert.equal(career.stats.SO,1);assert.equal(career.statsBySource.development.PA,1)
  assert.equal(career.activeAtBat,null);assert.ok(notifications>0)
  unsubscribe();client.close()
})

test('manual input with a lost reply resumes the exact accepted input rather than a second swing',async()=>{
  const {client,repo,transport}=await clientFor()
  let save=await client.create(profile,settings);save=await client.command(save.id,{type:'prepare',choice:'rest'});save=await client.command(save.id,{type:'start-manual'})
  const adapter=await client.atBatAdapter(save.id,save.activeAtBat.id,profile)
  const issued=await adapter.client.command(adapter.session.id,{type:'issue'}),ids={pitchId:issued.pending.pitchId,attemptId:issued.pending.attemptId}
  transport.loseNext();await assert.rejects(adapter.client.command(issued.id,{type:'accept-input',...ids,input:{kind:'take'}}),cause=>cause.code==='network_unavailable')
  const pending=clone(repo.shared.atBats[0].pending);client.close()
  const next=(await clientFor(repositories(repo.shared),transport)).client
  const resumed=await next.atBatAdapter(save.id,issued.id,profile)
  assert.deepEqual(resumed.pending,pending)
  const accepted=await resumed.client.retry(issued.id);assert.equal(accepted.pending.input.kind,'take')
  const resolved=await resumed.client.command(issued.id,{type:'resolve',...ids})
  assert.equal(resolved.state.pitchCount,1)
  next.close()
})

test('failure retaining the parent after a child ACK keeps the exact D command pending',async()=>{
  const {client,repo,transport}=await clientFor()
  let save=await client.create(profile,settings);save=await client.command(save.id,{type:'prepare',choice:'power'});save=await client.command(save.id,{type:'start-manual'})
  const adapter=await client.atBatAdapter(save.id,save.activeAtBat.id,profile)
  repo.setCareerFailure(true)
  await assert.rejects(adapter.client.command(adapter.session.id,{type:'issue'}),cause=>cause.code==='storage_unavailable')
  const original=clone(repo.shared.atBats[0].pending)
  assert.equal(transport.atBats.get(adapter.session.id).attempts.length,1)
  repo.setCareerFailure(false)
  const confirmed=await adapter.client.retry(adapter.session.id)
  assert.equal(confirmed.revision,2)
  assert.deepEqual(transport.calls.at(-1).body,original.body)
  assert.equal(transport.atBats.get(adapter.session.id).attempts.length,1)
  assert.equal(JSON.stringify(repo.shared).includes('"seed"'),false)
  client.close()
})

test('three games complete six automatic appearances with a single season ledger',async()=>{
  const {client}=await clientFor()
  let save=await client.create(profile,settings,{source:'development'})
  for(let game=0;game<3;game++){
    save=await client.command(save.id,{type:'prepare',choice:game===1?'rest':'stamina'})
    save=await client.command(save.id,{type:'simulate-at-bat'});save=await client.command(save.id,{type:'simulate-at-bat'})
  }
  assert.equal(save.status,'complete');assert.equal(save.stats.PA,6);assert.equal(save.stats.G,3)
  assert.equal(save.games.flatMap(game=>game.appearances).length,6)
  assert.equal(save.ledger.filter(event=>event.kind==='appearance').length,6)
  assert.equal(save.feedback.includes('trial-complete'),true)
  client.close()
})

test('failed browser write sends nothing and keeps the volatile create command for retry',async()=>{
  const {client,repo,transport}=await clientFor();repo.setFailure(true)
  await assert.rejects(client.create(profile,settings),cause=>cause.code==='storage_unavailable')
  const pending=clone(client.snapshot().entries[0]);assert.equal(transport.calls.length,0)
  repo.setFailure(false);await client.retry(pending.id)
  assert.equal(transport.calls[0].pending.body.commandId,pending.pending.body.commandId)
  client.close()
})

test('two-tab stale preparation requires explicit adoption and preserves the losing command',async()=>{
  const {client:first,repo,transport}=await clientFor(),save=await first.create(profile,settings)
  const second=(await clientFor(repositories(repo.shared),transport)).client;await second.read(save.id)
  await first.command(save.id,{type:'prepare',choice:'power'})
  await assert.rejects(second.command(save.id,{type:'prepare',choice:'rest'}),cause=>cause.code==='local_conflict')
  const losing=clone(second.snapshot().entries[0].pending)
  const read=await second.read(save.id);assert.deepEqual(read.pending,losing)
  const adopted=await second.adoptLatest(save.id);assert.equal(adopted.games[0].preparation.choice,'power')
  assert.deepEqual(repo.shared.careerConflicts[0].pending,losing)
  first.close();second.close()
})

test('late ACK cannot clear a different pending career command',async()=>{
  const {client,repo}=await clientFor(),save=await client.create(profile,settings),entry=repo.shared.careers[0]
  const commandA=id(),commandB=id(),newer={...clone(save),revision:3}
  const waiting={...entry,checkpoint:{...clone(save),revision:2},pending:{operation:'command',body:{commandId:commandB,expectedRevision:2,command:{type:'prepare',choice:'rest'}}}}
  assert.throws(()=>planBaseballCareerJournalWrite([waiting],{...entry,checkpoint:newer,pending:null},{acknowledgedCommandId:commandA}),cause=>cause.code==='local_conflict')
  client.close()
})

test('transport shares the cookie bootstrap lease and never adds profiles or commands to URLs',async()=>{
  const order=[],calls=[]
  const transport=createBaseballCareerTransport({bootstrapRepository:{init:async()=>order.push('init'),withBootstrapLease:async work=>{order.push('claim');try{return await work()}finally{order.push('release')}},close:()=>{}},fetchImpl:async(url,options)=>{calls.push({url,options});order.push(options.method);return {ok:true,json:async()=>({status:'ok',careers:[]})}}})
  await transport.list();assert.deepEqual(order,['init','claim','GET','release'])
  const saveId=id();await transport.send(saveId,{operation:'create',body:{commandId:saveId,profile,settings,source:'development'}})
  assert.equal(calls[1].url,'/api/playground/baseball/careers-v2');assert.equal(calls[1].options.credentials,'same-origin');assert.equal(calls[1].options.cache,'no-store')
  assert.equal(calls[1].url.includes(profile.name),false);assert.equal(JSON.parse(calls[1].options.body).profile.name,profile.name)
  transport.close()
})
