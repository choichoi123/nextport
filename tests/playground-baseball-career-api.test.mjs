import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createBaseballCareerApiHandler, createBaseballCareerVersions, BASEBALL_CAREER_MAX_BODY_BYTES } from '../lib/server/baseball-career-api.mjs'
import { createBaseballCareerStore } from '../lib/server/baseball-career-db.mjs'
import { createBaseballParticipant } from '../lib/server/baseball-auth.mjs'

const clone=value=>JSON.parse(JSON.stringify(value))
const versions={engineHash:'a'.repeat(64),rulesHash:'b'.repeat(64),atBatHash:'c'.repeat(64),fieldHash:'d'.repeat(64),sessionHash:'e'.repeat(64),careerHash:'f'.repeat(64)}
const env={NODE_ENV:'development',BASEBALL_DATA_ENABLED:'true',BASEBALL_DATABASE_URL:'postgresql://baseball_runtime:example-only@database.invalid/baseball_dev',BASEBALL_SIGNING_SECRET:'career-test-only-secret-not-a-real-credential'}
const profile={name:'새싹',jerseyNumber:'07',teamId:'wiz',handedness:'left'},settings={baseSpeedKmh:120,pitchMode:'mixed'}
const time=Date.UTC(2026,10,24)
const cookie=createBaseballParticipant(env.BASEBALL_SIGNING_SECRET,{now:time}).cookie.split(';')[0]
const otherCookie=createBaseballParticipant(env.BASEBALL_SIGNING_SECRET,{now:time}).cookie.split(';')[0]
let sequence=0
const uuid=()=>`10000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`
function response(){return{statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}}}
function request({method='POST',id,atBatId,body,headers={},...rest}={}){return{method,query:{...(id===undefined?{}:{id}),...(atBatId===undefined?{}:{atBatId})},headers:{host:'localhost:3031',origin:'http://localhost:3031','content-type':'application/json',cookie,...headers},body,...rest}}
function memoryStore(){
  const careers=new Map(),atBats=new Map(),commands=new Map(),calls=[]
  return{careers,atBats,commands,calls,
    async list(owner){calls.push('list');return{status:'ok',careers:[...careers.values()].filter(v=>v.owner===owner).map(({snapshot:s})=>({id:s.id,revision:s.revision,profile:s.profile,status:s.status,completedGames:s.currentGameIndex,updatedAt:s.updatedAt.replace('Z','000+00:00'),ownerHash:'private'})).slice(-20)}},
    async read(owner,id,commandId){calls.push('read');const row=careers.get(id);if(!row||row.owner!==owner)return{status:'not_found'};const command=commands.get(commandId);return{status:'ok',snapshot:clone(row.snapshot),command:command?.id===id?{hash:command.hash,revision:command.revision,atBatReceipt:clone(command.atBatReceipt)}:null}} ,
    async readAtBat(owner,id,atBatId){calls.push('readAtBat');const save=careers.get(id),bat=atBats.get(atBatId);return!save||save.owner!==owner||!bat||bat.careerId!==id?{status:'not_found'}:{status:'ok',...clone(bat)}} ,
    async save(owner,id,expectedRevision,commandId,hash,snapshot,changes,atBatReceipt){
      calls.push('save');const old=careers.get(id),cmd=commands.get(commandId)
      if(old&&old.owner!==owner)return{status:'error',code:'command_conflict'}
      if(cmd){if(cmd.id!==id||cmd.hash!==hash||!old)return{status:'error',code:'command_conflict'};return{status:'stored',snapshot:clone(old.snapshot),receipt:{sessionId:id,commandId,revision:cmd.revision},atBatReceipt:clone(cmd.atBatReceipt),duplicate:true}}
      if((old?.snapshot.revision||0)!==expectedRevision)return{status:'error',code:'revision_conflict'}
      for(const row of changes){const prior=atBats.get(row.id);if((prior?.revision||0)!==row.expectedRevision)return{status:'error',code:'revision_conflict'}}
      careers.set(id,{owner,snapshot:clone(snapshot)})
      for(const row of changes)atBats.set(row.id,{careerId:id,source:row.source,gameIndex:row.gameIndex,slot:row.slot,revision:row.expectedRevision+1,snapshot:clone(row.snapshot)})
      commands.set(commandId,{id,hash,revision:snapshot.revision,atBatReceipt:clone(atBatReceipt)})
      return{status:'stored',snapshot:clone(snapshot),receipt:{sessionId:id,commandId,revision:snapshot.revision},atBatReceipt:clone(atBatReceipt),duplicate:false}
    },
  }
}
function setup(overrides={}){
  const store=overrides.store||memoryStore();let now=time,seed=27
  const handler=createBaseballCareerApiHandler({env,store,getVersions:async()=>versions,idFactory:uuid,seed:()=>seed++,now:()=>now++,...overrides})
  const run=async req=>{const res=response();await handler(req,res);return res}
  const create=async(extra={})=>run(request({body:{commandId:uuid(),profile,settings,source:'development',...extra}}))
  const command=async(career,command,extra={})=>run(request({id:career.id,body:{commandId:uuid(),expectedRevision:career.revision,command},...extra}))
  const batCommand=async(career,session,command,extra={})=>run(request({id:career.id,atBatId:session.id,body:{commandId:uuid(),expectedRevision:session.revision,command},...extra}))
  return{store,run,create,command,batCommand}
}
function noPrivate(value){const text=JSON.stringify(value);for(const marker of ['"seed"','"ownerHash"','"attempts"','recoveryCode','recovery_hash','BASEBALL_DATABASE_URL','BASEBALL_SIGNING_SECRET'])assert.ok(!text.includes(marker),marker)}
async function manualCareer(api){let career=(await api.create()).body.career;career=(await api.command(career,{type:'prepare',choice:'power'})).body.career;career=(await api.command(career,{type:'start-manual'})).body.career;const session=(await api.run(request({method:'GET',id:career.id,atBatId:career.activeAtBat.id}))).body.session;return{career,session}}

test('all production career and adapter routes reject before store or version initialization',async()=>{
  for(const method of ['GET','POST'])for(const route of [{},{id:uuid()},{id:uuid(),atBatId:uuid()}]){
    let init=0
    const handler=createBaseballCareerApiHandler({env:{...env,NODE_ENV:'production'},getStore:()=>{init++;throw Error()},getVersions:()=>{init++;throw Error()}})
    const res=response();await handler(request({method,...route}),res)
    assert.equal(res.statusCode,503);assert.equal(res.body.code,'not_configured');assert.equal(init,0)
  }
})

test('cookie bootstrap is list-only and every detail or write requires the existing owner',async()=>{
  const{run,store}=setup(),list=await run(request({method:'GET',headers:{cookie:undefined}}))
  assert.equal(list.statusCode,200);assert.match(list.headers['Set-Cookie'],/HttpOnly; SameSite=Lax/)
  const before=store.calls.length
  for(const req of[request({id:uuid(),method:'GET',headers:{cookie:undefined}}),request({body:{commandId:uuid(),profile},headers:{cookie:undefined}})])assert.equal((await run(req)).statusCode,401)
  assert.equal(store.calls.length,before)
})

test('profile and settings are validated and private recovery or free-form account data cannot be saved',async()=>{
  const api=setup(),created=await api.create()
  assert.equal(created.statusCode,200);assert.deepEqual(created.body.career.profile,profile);assert.equal(created.body.career.trust,'server-recalculated-input-unverified');noPrivate(created.body)
  for(const changed of [{...profile,email:'private@example.invalid'},{...profile,name:''},{...profile,teamId:'unknown'},{...profile,jerseyNumber:'100'}])assert.equal((await api.create({profile:changed})).statusCode,400)
  assert.equal((await api.create({recoveryCode:'unsupported'})).statusCode,400)
  assert.equal((await api.create({source:'automatic'})).statusCode,400)
  assert.equal((await api.create({settings:{...settings,pitchBudget:10000}})).statusCode,400)
})

test('origin, content type, body limit and ID protections also cover career commands',async()=>{
  const{run,store}=setup(),body={commandId:uuid(),profile}
  for(const[req,status]of[[request({body,headers:{origin:'https://elsewhere.invalid'}}),403],[request({body,headers:{'content-type':'text/plain'}}),415],
    [request({body:{...body,extra:'x'.repeat(BASEBALL_CAREER_MAX_BODY_BYTES)}}),413],[request({method:'GET',id:[uuid()]}),400],[request({method:'DELETE'}),405]])assert.equal((await run(req)).statusCode,status)
  assert.equal(store.calls.length,0)
})

test('creation response loss returns the same career without rerolling or new saved players',async()=>{
  const{run,store}=setup(),body={commandId:uuid(),profile,settings}
  const first=await run(request({body})),retry=await run(request({body}))
  assert.equal(retry.body.duplicate,true);assert.deepEqual(retry.body.receipt,first.body.receipt);assert.equal(store.careers.size,1)
  const conflict=await run(request({body:{...body,profile:{...profile,name:'변경'}}}));assert.equal(conflict.statusCode,409)
})

test('preparation, active appearance and completion failures use clear domain codes',async()=>{
  const api=setup();let career=(await api.create()).body.career
  const unprepared=await api.command(career,{type:'simulate-at-bat'});assert.equal(unprepared.statusCode,409);assert.equal(unprepared.body.code,'preparation_required')
  career=(await api.command(career,{type:'prepare',choice:'power'})).body.career
  const repeated=await api.command(career,{type:'prepare',choice:'rest'});assert.equal(repeated.statusCode,409);assert.equal(repeated.body.code,'preparation_complete')
  career=(await api.command(career,{type:'start-manual'})).body.career
  const active=await api.command(career,{type:'simulate-at-bat'});assert.equal(active.statusCode,409);assert.equal(active.body.code,'active_at_bat')
})

test('manual career appearances use the D transport with independent D and career revisions',async()=>{
  const api=setup();let{career,session}=await manualCareer(api)
  const beforeCareer=career.revision
  const issue=await api.batCommand(career,session,{type:'issue'})
  assert.equal(issue.statusCode,200);assert.equal(issue.body.receipt.sessionId,session.id);assert.equal(issue.body.receipt.revision,2)
  assert.equal(issue.body.careerReceipt.sessionId,career.id);assert.equal(issue.body.careerReceipt.revision,beforeCareer+1)
  assert.equal(issue.body.career.stats.PA,0);noPrivate(issue.body)
  session=issue.body.session;career=issue.body.career
  const{pitchId,attemptId}=session.pending
  const accepted=await api.batCommand(career,session,{type:'accept-input',pitchId,attemptId,input:{kind:'take'}})
  assert.equal(accepted.statusCode,200);assert.equal(accepted.body.career.stats.PA,0)
  const resolved=await api.batCommand(accepted.body.career,accepted.body.session,{type:'resolve',pitchId,attemptId})
  assert.equal(resolved.statusCode,200);assert.equal(resolved.body.session.state.pitchCount,1);assert.equal(resolved.body.career.stats.PA,0)
})

test('a completed manual appearance applies its statistics and growth exactly once',async()=>{
  const api=setup();let{career,session}=await manualCareer(api),lastBody
  for(let i=0;i<3;i++){
    let res=await api.batCommand(career,session,{type:'issue'});career=res.body.career;session=res.body.session
    const{pitchId,attemptId}=session.pending
    res=await api.batCommand(career,session,{type:'accept-input',pitchId,attemptId,input:{kind:'swing',swingAtMs:-500,aim:{x:0,y:.7}}});career=res.body.career;session=res.body.session
    lastBody={commandId:uuid(),expectedRevision:session.revision,command:{type:'resolve',pitchId,attemptId}}
    res=await api.run(request({id:career.id,atBatId:session.id,body:lastBody}));assert.equal(res.statusCode,200);career=res.body.career;session=res.body.session
  }
  assert.equal(career.stats.PA,1);assert.equal(career.stats.SO,1);assert.equal(career.activeAtBat,null)
  const xp=career.growth.xp,events=career.ledger.length
  const retry=await api.run(request({id:career.id,atBatId:session.id,body:lastBody}));assert.equal(retry.statusCode,200);assert.equal(retry.body.duplicate,true)
  assert.equal(retry.body.career.growth.xp,xp);assert.equal(retry.body.career.ledger.length,events)
  const late=await api.batCommand(career,session,{type:'issue'});assert.equal(late.statusCode,409);assert.equal(late.body.code,'slot_closed')
})

test('three games and six automatic appearances retain separate raw records and one-time growth',async()=>{
  const api=setup();let career=(await api.create()).body.career,firstAuto
  for(let game=0;game<3;game++){
    career=(await api.command(career,{type:'prepare',choice:game?'rest':'discipline'})).body.career
    for(let slot=0;slot<2;slot++){
      const res=await api.command(career,{type:'simulate-at-bat'});assert.equal(res.statusCode,200);career=res.body.career
      firstAuto ||=career.games[0].appearances[0].id
    }
  }
  assert.equal(career.status,'complete');assert.equal(career.currentGameIndex,3);assert.equal(career.stats.G,3);assert.equal(career.stats.PA,6)
  assert.equal(career.statsBySource.automatic.PA,6);assert.equal(career.statsBySource.development.PA,0)
  assert.equal(api.store.atBats.size,6);assert.ok([...api.store.atBats.values()].every(row=>row.source==='automatic'&&row.snapshot.origin==='development'))
  const autoRead=await api.run(request({method:'GET',id:career.id,atBatId:firstAuto}));assert.equal(autoRead.statusCode,409);assert.equal(autoRead.body.code,'automatic_at_bat')
  const complete=await api.command(career,{type:'prepare',choice:'power'});assert.equal(complete.statusCode,409);assert.equal(complete.body.code,'career_complete')
  noPrivate(career)
})

test('two tabs cannot claim one slot or overwrite accepted D input',async()=>{
  const api=setup();let career=(await api.create()).body.career
  career=(await api.command(career,{type:'prepare',choice:'power'})).body.career
  const race=await Promise.all([api.command(career,{type:'start-manual'}),api.command(career,{type:'simulate-at-bat'})])
  assert.deepEqual(race.map(r=>r.statusCode).sort(),[200,409]);assert.equal(api.store.atBats.size,1)
  const manual=await manualCareer(api)
  const issued=await api.batCommand(manual.career,manual.session,{type:'issue'}),{pitchId,attemptId}=issued.body.session.pending
  const commands=[{kind:'take'},{kind:'swing',swingAtMs:-500,aim:{x:0,y:.7}}].map(input=>api.batCommand(issued.body.career,issued.body.session,{type:'accept-input',pitchId,attemptId,input}))
  const inputRace=await Promise.all(commands);assert.deepEqual(inputRace.map(r=>r.statusCode).sort(),[200,409])
  assert.equal(api.store.atBats.get(manual.session.id).snapshot.revision,3)
})

test('another cookie cannot list, read or write an existing player or at-bat',async()=>{
  const api=setup(),{career,session}=await manualCareer(api)
  const list=await api.run(request({method:'GET',headers:{cookie:otherCookie}}));assert.deepEqual(list.body.careers,[])
  for(const req of[request({method:'GET',id:career.id,headers:{cookie:otherCookie}}),request({method:'GET',id:career.id,atBatId:session.id,headers:{cookie:otherCookie}}),
    request({id:career.id,body:{commandId:uuid(),expectedRevision:career.revision,command:{type:'prepare',choice:'rest'}},headers:{cookie:otherCookie}})])assert.equal((await api.run(req)).statusCode,404)
})

test('changed versions preserve old saves but block new effects',async()=>{
  const store=memoryStore(),first=setup({store}),career=(await first.create()).body.career
  const next=setup({store,getVersions:async()=>({...versions,careerHash:'0'.repeat(64)})})
  const command=await next.command(career,{type:'prepare',choice:'rest'});assert.equal(command.statusCode,409);assert.equal(command.body.code,'version_mismatch')
  const read=await next.run(request({method:'GET',id:career.id}));assert.equal(read.statusCode,200);assert.equal(read.body.career.revision,1)
})

test('the four-pitch career pin permits continuing a stored career with its original configuration',async()=>{
  const store=memoryStore(),activeVersions=await createBaseballCareerVersions()
  const legacyVersions={...activeVersions,
    atBatHash:'6a6b6d234f1287aca81112744db90cc8143dae5af4a0b767b7cd4cff5bfcc923',
    sessionHash:'a3c8c9001d9d25277d8c8d030a922bbd8f3a72310f4a9898e89714fff9983a7a',
    careerHash:'0def3dac19a65083128addf66e87869356d5ba18a88749f6cc072d788fef77f8',
  }
  const oldApi=setup({store,getVersions:async()=>legacyVersions})
  const {career,session}=await manualCareer(oldApi)
  const issue=await setup({store,getVersions:async()=>activeVersions,now:()=>time+1000}).batCommand(career,session,{type:'issue'})
  assert.equal(issue.statusCode,200)
  assert.equal(issue.body.session.config.pitchMode,'mixed')
  assert.equal(issue.body.session.pending.pitch.practiceType,undefined)
  assert.equal(issue.body.session.versions.sessionHash,legacyVersions.sessionHash)
})

test('list timestamps are canonical and only approved profile/summary fields leave the API',async()=>{
  const api=setup();await api.create()
  const list=await api.run(request({method:'GET'}));assert.equal(list.statusCode,200)
  const row=list.body.careers[0];assert.equal(row.updatedAt,new Date(row.updatedAt).toISOString())
  assert.deepEqual(Object.keys(row).sort(),['id','revision','profile','status','completedGames','updatedAt'].sort());noPrivate(list.body)
})

test('database loss, capacity and invalid stored receipts never report success or erase input',async()=>{
  for(const[result,status]of[[{status:'error',code:'storage_capacity'},413],[{status:'error',code:'rate_limited'},429]]){
    const store=memoryStore();store.save=async()=>result;assert.equal((await setup({store}).create()).statusCode,status);assert.equal(store.careers.size,0)
  }
  const store=memoryStore(),api=setup({store});const{career,session}=await manualCareer(api)
  store.readAtBat=async()=>{throw Error('private database connection detail')}
  const res=await api.batCommand(career,session,{type:'issue'});assert.equal(res.statusCode,503);assert.equal(res.body.code,'database_unavailable');assert.ok(!JSON.stringify(res.body).includes('private database'))
})

test('automatic simulation tuning and results cannot be supplied by a client',async()=>{
  const api=setup();let career=(await api.create()).body.career
  career=(await api.command(career,{type:'prepare',choice:'power'})).body.career
  for(const extra of[{pitchBudget:1000000},{atBat:{outcome:'home-run'}},{seed:1}]){
    const res=await api.command(career,{type:'simulate-at-bat',...extra});assert.equal(res.statusCode,400)
  }
  assert.equal(api.store.atBats.size,0)
})

test('build-time career hashing uses only the approved module and no credentials',async()=>{
  const paths=[],value=await createBaseballCareerVersions({getAtBatVersions:async()=>Object.fromEntries(Object.entries(versions).filter(([key])=>key!=='careerHash')),readSource:async file=>{paths.push(file);return'example\r\n'}})
  assert.deepEqual(paths,['lib/playground-baseball-career.mjs']);assert.equal(Object.keys(value).length,6);assert.match(value.careerHash,/^[a-f0-9]{64}$/)
})

test('career database queries use parameters and never invoke existing training tables',async()=>{
  const calls=[],store=createBaseballCareerStore({query:async(query,values)=>{calls.push({query,values});return[{result:{status:'ok'}}]}})
  await store.list('owner');await store.read('owner',uuid(),null);await store.readAtBat('owner',uuid(),uuid());await store.save('owner',uuid(),1,uuid(),'hash',{data:'not SQL'},[],null)
  assert.equal(calls.length,4);assert.ok(calls.every(call=>!call.query.includes('not SQL')&&!call.query.includes('baseball_save_at_bat')&&!call.query.includes('baseball_save_practice')))
  assert.equal(calls[3].values.length,8)
})

test('career SQL is additive, cookie-owned, capped atomically and contains no recovery credentials',async()=>{
  const sql=await readFile(new URL('../db/migrations/20261124-baseball-career.sql',import.meta.url),'utf8')
  assert.match(sql,/current_database\(\)<>'baseball_dev'/);assert.match(sql,/hashtextextended\(p_owner,20\)/);assert.match(sql,/owner_hash=p_owner\)>=20/)
  assert.match(sql,/p_expected_revision<>prior\.revision/);assert.ok(sql.indexOf('SELECT * INTO cmd')<sql.indexOf('p_expected_revision<>prior.revision'))
  assert.match(sql,/8388608/);assert.match(sql,/16777216/)
  assert.doesNotMatch(sql,/recovery|career_access|DROP |TRUNCATE |DELETE FROM|GRANT SELECT|GRANT ALL/)
  assert.match(sql,/REVOKE ALL ON FUNCTION baseball_private\.baseball_take_career_rate_limit\(text\) FROM PUBLIC,baseball_runtime/)
})
