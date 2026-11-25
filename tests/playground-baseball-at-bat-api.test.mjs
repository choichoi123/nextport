import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createBaseballAtBatApiHandler, createBaseballAtBatVersions, BASEBALL_AT_BAT_MAX_BODY_BYTES } from '../lib/server/baseball-at-bat-api.mjs'
import { createBaseballAtBatStore } from '../lib/server/baseball-at-bat-db.mjs'
import { createBaseballParticipant } from '../lib/server/baseball-auth.mjs'

const clone = value => JSON.parse(JSON.stringify(value))
const versions = { engineHash:'a'.repeat(64), rulesHash:'b'.repeat(64), atBatHash:'c'.repeat(64), fieldHash:'d'.repeat(64), sessionHash:'e'.repeat(64) }
const env = { NODE_ENV:'development', BASEBALL_DATA_ENABLED:'true', BASEBALL_DATABASE_URL:'postgresql://baseball_runtime:example-only@database.invalid/baseball_dev', BASEBALL_SIGNING_SECRET:'at-bat-test-only-secret-not-a-real-credential' }
const settings = { handedness:'right', pitcherHandedness:'left', baseSpeedKmh:120, pitchMode:'mixed' }
const startTime = Date.UTC(2026,10,24)
const cookie = createBaseballParticipant(env.BASEBALL_SIGNING_SECRET,{now:startTime}).cookie.split(';')[0]
const otherCookie = createBaseballParticipant(env.BASEBALL_SIGNING_SECRET,{now:startTime}).cookie.split(';')[0]
let sequence = 0
const uuid = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`
function response() { return { statusCode:200, headers:{}, setHeader(k,v){this.headers[k]=v}, status(v){this.statusCode=v;return this}, json(v){this.body=v;return this} } }
function request({method='POST',id,body,headers={},...rest}={}) {
  return { method,query:id===undefined?{}:{id},headers:{host:'localhost:3031',origin:'http://localhost:3031','content-type':'application/json',cookie,...headers},body,...rest }
}
function memoryStore() {
  const sessions = new Map(), commands = new Map(), calls = []
  return {
    sessions,commands,calls,
    async list(owner) {
      calls.push(['list',owner])
      return {status:'ok',atBats:[...sessions.entries()].filter(([,s])=>s.owner===owner).map(([id,{snapshot:s}])=>({
        id,revision:s.revision,status:s.state.status,pitchCount:s.state.pitchCount,balls:s.state.balls,strikes:s.state.strikes,
        outcome:s.state.outcome,source:s.source,updatedAt:s.updatedAt,ownerHash:'must-not-escape',seed:'must-not-escape',
      })).slice(-20)}
    },
    async read(owner,id,commandId) {
      calls.push(['read',owner,id,commandId])
      const entry=sessions.get(id)
      if(!entry||entry.owner!==owner)return {status:'not_found'}
      const command=commands.get(commandId)
      return {status:'ok',snapshot:clone(entry.snapshot),command:command?.id===id?{hash:command.hash,revision:command.revision}:null}
    },
    async save(owner,id,expectedRevision,commandId,hash,snapshot) {
      calls.push(['save',owner,id,expectedRevision,commandId])
      const prior=sessions.get(id),command=commands.get(commandId)
      if(prior&&prior.owner!==owner)return {status:'error',code:'command_conflict'}
      if(command) {
        if(command.id!==id||command.hash!==hash||!prior)return {status:'error',code:'command_conflict'}
        return {status:'stored',snapshot:clone(prior.snapshot),receipt:{sessionId:id,commandId,revision:command.revision},duplicate:true}
      }
      if((prior?.snapshot.revision||0)!==expectedRevision)return {status:'error',code:'revision_conflict'}
      sessions.set(id,{owner,snapshot:clone(snapshot)})
      commands.set(commandId,{id,hash,revision:snapshot.revision})
      return {status:'stored',snapshot:clone(snapshot),receipt:{sessionId:id,commandId,revision:snapshot.revision},duplicate:false}
    },
  }
}
function setup(overrides={}) {
  const store=overrides.store||memoryStore()
  let clock=startTime
  const handler=createBaseballAtBatApiHandler({env,store,getVersions:async()=>versions,seed:()=>25,idFactory:uuid,now:()=>clock++,...overrides})
  const run=async req=>{const res=response();await handler(req,res);return res}
  const create=async(extra={})=>run(request({body:{commandId:uuid(),settings,...extra}}))
  const command=async(session,value,extra={})=>run(request({id:session.id,body:{commandId:uuid(),expectedRevision:session.revision,command:value},...extra}))
  return {store,run,create,command}
}
function assertPrivateAbsent(value) {
  const text=JSON.stringify(value)
  assert.ok(!text.includes('ownerHash')&&!text.includes('must-not-escape'))
  assert.ok(!text.includes('"seed"')&&!text.includes('"attempts"'))
  assert.ok(!text.includes('BASEBALL_DATABASE_URL')&&!text.includes('BASEBALL_SIGNING_SECRET'))
}

test('Production and missing configuration stop before database and source initialization',async()=>{
  for(const mode of ['production','test']) for(const method of ['GET','POST']) {
    let initialized=0
    const handler=createBaseballAtBatApiHandler({env:{...env,NODE_ENV:mode},getStore:()=>{initialized++;throw Error()},getVersions:()=>{initialized++;throw Error()}})
    const res=response();await handler(request({method}),res)
    assert.equal(res.statusCode,503);assert.equal(res.body.code,'not_configured');assert.equal(initialized,0)
    assert.equal(res.headers['Cache-Control'],'no-store')
  }
})

test('only list GET bootstraps a protected 30-day baseball cookie; writes and detail require ownership',async()=>{
  const {run,store}=setup()
  const list=await run(request({method:'GET',headers:{cookie:undefined}}))
  assert.equal(list.statusCode,200);assert.deepEqual(list.body,{status:'ok',atBats:[]})
  assert.match(list.headers['Set-Cookie'],/Path=\/api\/playground\/baseball; Max-Age=2592000; HttpOnly; SameSite=Lax/)
  const before=store.calls.length
  for(const req of [request({headers:{cookie:undefined},body:{commandId:uuid(),settings}}),request({method:'GET',id:uuid(),headers:{cookie:undefined}})]) {
    const res=await run(req);assert.equal(res.statusCode,401);assert.equal(res.body.code,'owner_required');assert.equal(res.headers['Set-Cookie'],undefined)
  }
  assert.equal(store.calls.length,before)
})

test('cross-site, invalid origin, content type, oversized body and invalid IDs are rejected',async()=>{
  const {run,store}=setup(),body={commandId:uuid(),settings}
  const cases=[
    [request({body,headers:{origin:'https://elsewhere.invalid'}}),403],
    [request({body,headers:{'sec-fetch-site':'cross-site'}}),403],
    [request({body,headers:{'content-type':'text/plain'}}),415],
    [request({body,headers:{'content-length':String(BASEBALL_AT_BAT_MAX_BODY_BYTES+1)}}),413],
    [request({body:{...body,extra:'x'.repeat(BASEBALL_AT_BAT_MAX_BODY_BYTES)}}),413],
    [request({method:'GET',id:[uuid()]}),400],
    [request({body:{commandId:[uuid()],settings}}),400],
    [request({method:'DELETE'}),405],
  ]
  for(const [req,code]of cases){const res=await run(req);assert.equal(res.statusCode,code)}
  assert.equal(store.calls.length,0)
})

test('streamed bodies are bounded before JSON parsing and malformed streams cannot create sessions',async()=>{
  const {run,store}=setup()
  for(const [data,code]of [['{',400],['x'.repeat(BASEBALL_AT_BAT_MAX_BODY_BYTES+1),413]]) {
    const req=Readable.from([Buffer.from(data)])
    Object.assign(req,request({body:undefined}));delete req.body
    const res=await run(req);assert.equal(res.statusCode,code)
  }
  assert.equal(store.calls.length,0)
})

test('server-generated seeds stay private and caller profile or result fields cannot enter checkpoints',async()=>{
  const {create,run,store}=setup()
  const created=await create({source:'development'})
  assert.equal(created.statusCode,200);assert.equal(created.body.session.source,'development');assert.equal(created.body.session.revision,1)
  assert.equal(created.body.session.trust,'server-recalculated-input-unverified');assertPrivateAbsent(created.body)
  assert.equal(store.sessions.get(created.body.session.id).snapshot.state.seed,25)
  for(const changed of [{...settings,name:'not allowed'},{...settings,teamId:'wiz'},{...settings,seed:1}]) {
    const res=await run(request({body:{commandId:uuid(),settings:changed}}));assert.equal(res.statusCode,400)
  }
  assert.equal((await create({source:'automatic'})).statusCode,400)
})

test('create retries return the same owned checkpoint and conflicting creation is rejected',async()=>{
  const {run,store}=setup(),body={commandId:uuid(),settings}
  const first=await run(request({body})),second=await run(request({body}))
  assert.equal(first.body.session.id,body.commandId);assert.equal(second.body.duplicate,true)
  assert.deepEqual(first.body.receipt,second.body.receipt);assert.equal(store.sessions.size,1)
  assert.equal((await run(request({body:{...body,settings:{...settings,baseSpeedKmh:80}}}))).statusCode,409)
  assert.equal((await run(request({body,headers:{cookie:otherCookie}}))).statusCode,409)
})

test('issued physics are server-owned; take input and resolution advance one pitch once',async()=>{
  const {create,command}=setup()
  let session=(await create()).body.session
  const issued=await command(session,{type:'issue'});assert.equal(issued.statusCode,200);session=issued.body.session
  assert.equal(session.pending.number,1);assert.equal(session.state.pitchCount,0);assertPrivateAbsent(session)
  const {pitchId,attemptId}=session.pending
  const input=await command(session,{type:'accept-input',pitchId,attemptId,input:{kind:'take'}});assert.equal(input.statusCode,200);session=input.body.session
  assert.equal(session.state.pitchCount,0);assert.equal(session.pending.input.kind,'take')
  const resolved=await command(session,{type:'resolve',pitchId,attemptId});assert.equal(resolved.statusCode,200)
  assert.equal(resolved.body.session.state.pitchCount,1);assert.equal(resolved.body.session.pending,null)
  assert.equal(resolved.body.session.state.history[0].source,'manual');assertPrivateAbsent(resolved.body)
})

test('pause and refresh preserve a logical pitch and accepted input resolves without another swing',async()=>{
  const {create,command,run}=setup()
  let session=(await create()).body.session
  session=(await command(session,{type:'issue'})).body.session
  const first=clone(session.pending)
  session=(await command(session,{type:'pause',pitchId:first.pitchId,attemptId:first.attemptId,reason:'reload'})).body.session
  session=(await run(request({method:'GET',id:session.id}))).body.session
  const issued=(await command(session,{type:'issue'})).body.session
  assert.equal(issued.pending.pitchId,first.pitchId);assert.notEqual(issued.pending.attemptId,first.attemptId);assert.deepEqual(issued.pending.pitch,first.pitch)
  const {pitchId,attemptId}=issued.pending
  session=(await command(issued,{type:'accept-input',pitchId,attemptId,input:{kind:'swing',swingAtMs:-500,aim:{x:0,y:.7},source:'touch',surface:'field'}})).body.session
  session=(await command(session,{type:'pause',pitchId,attemptId,reason:'visibility'})).body.session
  const extra=await command(session,{type:'issue'});assert.equal(extra.statusCode,409);assert.equal(extra.body.code,'input_already_accepted')
  const resolved=await command(session,{type:'resolve',pitchId,attemptId})
  assert.equal(resolved.statusCode,200);assert.equal(resolved.body.session.state.pitchCount,1);assert.equal(resolved.body.session.state.strikes,1)
})

test('old response-loss retries acknowledge the original revision while returning the latest checkpoint',async()=>{
  const {create,run,command}=setup()
  const session=(await create()).body.session
  const issueBody={commandId:uuid(),expectedRevision:session.revision,command:{type:'issue'}}
  const first=await run(request({id:session.id,body:issueBody}))
  const issued=first.body.session,{pitchId,attemptId}=issued.pending
  const accepted=await command(issued,{type:'accept-input',pitchId,attemptId,input:{kind:'take'}})
  const retry=await run(request({id:session.id,body:issueBody}))
  assert.equal(retry.statusCode,200);assert.equal(retry.body.duplicate,true)
  assert.equal(retry.body.receipt.revision,2);assert.equal(retry.body.session.revision,accepted.body.session.revision)
  assert.equal(retry.body.session.pending.input.kind,'take')
  const conflict=await run(request({id:session.id,body:{...issueBody,command:{type:'pause',pitchId,attemptId}}}))
  assert.equal(conflict.statusCode,409);assert.equal(conflict.body.code,'command_conflict')
})

test('two tabs at one revision produce one atomic command and a conflict without replacing input',async()=>{
  const {create,command,store}=setup()
  const session=(await create()).body.session
  const results=await Promise.all([command(session,{type:'issue'}),command(session,{type:'issue'})])
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409])
  assert.equal(store.sessions.get(session.id).snapshot.revision,2)
  assert.equal(store.sessions.get(session.id).snapshot.attempts.length,1)
})

test('unknown owners cannot read or mutate an existing checkpoint',async()=>{
  const {create,run}=setup(),session=(await create()).body.session
  const read=await run(request({method:'GET',id:session.id,headers:{cookie:otherCookie}}));assert.equal(read.statusCode,404)
  const write=await run(request({id:session.id,headers:{cookie:otherCookie},body:{commandId:uuid(),expectedRevision:session.revision,command:{type:'issue'}}}))
  assert.equal(write.statusCode,404);assertPrivateAbsent(write.body)
})

test('changed engine or policy blocks further commands but existing checkpoint stays readable',async()=>{
  const store=memoryStore(),first=setup({store}),session=(await first.create()).body.session
  const updated=setup({store,getVersions:async()=>({...versions,sessionHash:'f'.repeat(64)})})
  const res=await updated.command(session,{type:'issue'})
  assert.equal(res.statusCode,409);assert.equal(res.body.code,'version_mismatch')
  const read=await updated.run(request({method:'GET',id:session.id}));assert.equal(read.statusCode,200);assert.equal(read.body.session.revision,1)
})

test('terminal statistics and the final receipt cannot be counted or resolved a second time',async()=>{
  const {create,command,run}=setup()
  let session=(await create({source:'development'})).body.session,lastBody
  for(let i=0;i<3;i++){
    session=(await command(session,{type:'issue'})).body.session
    const {pitchId,attemptId}=session.pending
    session=(await command(session,{type:'accept-input',pitchId,attemptId,input:{kind:'swing',swingAtMs:-500,aim:{x:0,y:.7}}})).body.session
    lastBody={commandId:uuid(),expectedRevision:session.revision,command:{type:'resolve',pitchId,attemptId}}
    session=(await run(request({id:session.id,body:lastBody}))).body.session
  }
  assert.equal(session.state.status,'complete');assert.equal(session.state.stats.PA,1);assert.equal(session.state.stats.SO,1)
  const retry=await run(request({id:session.id,body:lastBody}));assert.equal(retry.body.duplicate,true);assert.deepEqual(retry.body.session.finalReceipt,session.finalReceipt)
  const next=await command(session,{type:'issue'});assert.equal(next.statusCode,409);assert.equal(next.body.code,'session_complete')
  assert.equal(session.state.history.length,3)
})

test('only allowlisted recent summary fields leave the list endpoint',async()=>{
  const {create,run}=setup()
  await create({source:'development'})
  const list=await run(request({method:'GET'}));assert.equal(list.statusCode,200);assert.equal(list.body.atBats.length,1)
  assert.deepEqual(Object.keys(list.body.atBats[0]).sort(),['id','revision','status','pitchCount','balls','strikes','outcome','source','updatedAt'].sort())
  assertPrivateAbsent(list.body)
})

test('PostgreSQL microsecond timestamps are normalized to the canonical millisecond UTC contract',async()=>{
  const store=memoryStore()
  store.list=async()=>({status:'ok',atBats:[{
    id:uuid(),revision:1,status:'active',pitchCount:0,balls:0,strikes:0,outcome:null,source:'manual',
    updatedAt:'2026-11-24T12:34:56.123456+00:00',
  }]})
  const res=await setup({store}).run(request({method:'GET'}))
  assert.equal(res.statusCode,200)
  assert.equal(res.body.atBats[0].updatedAt,'2026-11-24T12:34:56.123Z')
  assert.equal(new Date(res.body.atBats[0].updatedAt).toISOString(),res.body.atBats[0].updatedAt)
})

test('storage capacity, rate limit, connection loss and corrupt receipts are distinct and never claim success',async()=>{
  for(const [result,status,code]of [[{status:'error',code:'storage_capacity'},413,'storage_capacity'],[{status:'error',code:'rate_limited'},429,'rate_limited']]){
    const store=memoryStore();store.save=async()=>result
    const res=await setup({store}).create();assert.equal(res.statusCode,status);assert.equal(res.body.code,code);assert.equal(store.sessions.size,0)
  }
  const down=memoryStore();down.read=async()=>{throw Error('private connection text')}
  const failed=await setup({store:down}).create();assert.equal(failed.statusCode,503);assert.equal(failed.body.code,'database_unavailable');assert.ok(!JSON.stringify(failed).includes('private connection text'))
  const corrupt=memoryStore(),save=corrupt.save
  corrupt.save=async(...args)=>{const v=await save(...args);v.receipt.commandId=uuid();return v}
  const res=await setup({store:corrupt}).create();assert.equal(res.statusCode,503)
})

test('source hashes identify only the physical engine and three approved at-bat modules',async()=>{
  const paths=[]
  const value=await createBaseballAtBatVersions({getEngineVersions:async()=>({engine:{hash:versions.engineHash},rules:{hash:versions.rulesHash}}),readSource:async file=>{paths.push(file);return 'example\r\n'}})
  assert.deepEqual(paths.sort(),['lib/playground-baseball-at-bat-session.mjs','lib/playground-baseball-at-bat.mjs','lib/playground-baseball-field.mjs'])
  assert.equal(value.engineHash,versions.engineHash);assert.match(value.sessionHash,/^[a-f0-9]{64}$/)
  assert.equal(value.sessionHash,value.atBatHash)
})

test('database calls are parameterized and isolated from the ten-pitch RPC contract',async()=>{
  const calls=[],store=createBaseballAtBatStore({query:async(query,values)=>{calls.push({query,values});return [{result:{status:'ok'}}]}})
  await store.list('owner');await store.read('owner',uuid(),null);await store.save('owner',uuid(),1,uuid(),'hash',{value:'not SQL'})
  assert.equal(calls.length,3);assert.match(calls[0].query,/baseball_list_at_bats\(\$1\)/)
  assert.ok(calls.every(c=>!c.query.includes('not SQL')&&!c.query.includes('baseball_save_practice')))
  assert.equal(calls[2].values[5],'{"value":"not SQL"}')
})

test('migration guards development, immutable results, CAS receipts, private privileges and independent quotas',async()=>{
  const sql=await readFile(new URL('../db/migrations/20261124-baseball-at-bat-sessions.sql',import.meta.url),'utf8')
  assert.match(sql,/current_database\(\) <> 'baseball_dev'/)
  assert.match(sql,/p_expected_revision<>prior\.revision/)
  assert.ok(sql.indexOf('SELECT * INTO command_row')<sql.indexOf('p_expected_revision<>prior.revision'))
  assert.match(sql,/old_item->>'status' IN \('resolved','superseded'\)/)
  assert.doesNotMatch(sql,/old_item->>'status' IN \('paused','resolved'\)/)
  assert.match(sql,/octet_length\(p_snapshot::text\)>8388608/)
  assert.match(sql,/baseball_take_at_bat_rate_limit/)
  assert.doesNotMatch(sql,/baseball_take_rate_limit\(/)
  assert.match(sql,/REVOKE ALL ON FUNCTION baseball_private\.baseball_take_at_bat_rate_limit\(text\) FROM PUBLIC,baseball_runtime/)
  assert.doesNotMatch(sql,/DROP |TRUNCATE |DELETE FROM|GRANT SELECT|GRANT ALL/)
})
