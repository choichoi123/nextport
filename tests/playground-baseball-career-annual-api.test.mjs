import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import test from 'node:test'
import { BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES } from '../lib/playground-baseball-annual.mjs'
import { createBaseballParticipant } from '../lib/server/baseball-auth.mjs'
import { createBaseballAnnualStore, createBaseballCareerAnnualApiHandler } from '../lib/server/baseball-career-annual-api.mjs'
import { BASEBALL_CAREER_V2_PRIOR_REGULAR_HASHES } from '../lib/server/baseball-career-v2-api.mjs'

const now = Date.parse('2026-11-26T00:00:00.000Z')
const env = {
  NODE_ENV:'development',BASEBALL_DATA_ENABLED:'true',
  BASEBALL_DATABASE_URL:'postgresql://baseball_runtime:example@baseball.invalid/baseball_dev',
  BASEBALL_SIGNING_SECRET:'development-test-only-not-a-real-signing-key',
}
const cookie = createBaseballParticipant(env.BASEBALL_SIGNING_SECRET,{now}).cookie.split(';')[0]
const id = randomUUID()
const versions = {careerHash:'a'.repeat(64)}
const body = {setup:{id,versions},actions:[{type:'prepare'}]}
const stats = {G:144,PA:288,AB:270,H:80,'2B':10,'3B':3,HR:6,BB:18,SO:15}
const receipt = {careerId:id,seasonId:id,seasonNumber:1,savedAt:'2026-11-26 09:00:00.123456+09:00',stats}
const complete = {draft:{career:{id,status:'complete',currentGameIndex:144,stats}},atBats:Array.from({length:288},()=>({}))}

function request(overrides={}) {
  const {headers={},...rest}=overrides
  return {method:'POST',headers:{host:'localhost:3031',origin:'http://localhost:3031','content-type':'application/json',cookie,...headers},
    body,query:{},...rest}
}

async function issue(api,req=request()) {
  const res={headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(value){this.value=value;return this}}
  await api(req,res)
  return res
}

function harness(overrides={}) {
  const calls=[]
  const store={
    lookup:async(...args)=>{ calls.push(['lookup',...args]);return {status:'unconfirmed'} },
    save:async(...args)=>{ calls.push(['save',...args]);return {status:'stored',receipt,duplicate:false} },
  }
  const replay=value=>{calls.push(['replay',value]);return complete}
  return {calls,api:createBaseballCareerAnnualApiHandler({env,now:()=>now,store,replay,getVersions:async()=>versions,...overrides})}
}

test('settlement GET only bootstraps the same anonymous identity and never opens storage',async()=>{
  let storageCalls=0
  const {api}=harness({store:null,getStore:async()=>{storageCalls++}})
  const before=await issue(api,request({method:'GET',headers:{cookie:undefined,origin:undefined}}))
  assert.deepEqual(before.value,{status:'ok'})
  assert.match(before.headers['Set-Cookie'],/^baseball_participant=.*HttpOnly; SameSite=Lax/)
  const after=await issue(api,request({method:'GET'}))
  assert.equal(after.headers['Set-Cookie'],undefined)
  assert.equal(storageCalls,0)
  const cross=await issue(api,request({method:'GET',headers:{origin:'https://other.invalid'}}))
  assert.equal(cross.code,403)
  const off=await issue(harness({env:{NODE_ENV:'production'}}).api,request({method:'GET'}))
  assert.equal(off.code,503)
})

test('posting a completed annual command log saves the server-replayed state and returns only its receipt',async()=>{
  const {api,calls}=harness()
  const res=await issue(api)
  assert.equal(res.code,200)
  assert.deepEqual(res.value,{status:'stored',duplicate:false,receipt:{...receipt,savedAt:'2026-11-26T00:00:00.123Z'}})
  assert.deepEqual(calls.map(row=>row[0]),['lookup','replay','save'])
  const [[,owner,seasonId,hash],,[,saveOwner,saveId,saveHash,career,atBats]]=calls
  assert.match(owner,/^[a-f0-9]{64}$/)
  assert.match(hash,/^[a-f0-9]{64}$/)
  assert.deepEqual([saveOwner,saveId,saveHash],[owner,seasonId,hash])
  assert.equal(seasonId,id)
  assert.equal(career,complete.draft.career)
  assert.equal(atBats,complete.atBats)
})

test('a lost receipt uses the same content hash after version changes, without replaying or inserting again',async()=>{
  let replays=0
  const lookups=[]
  const {api}=harness({
    getVersions:async()=>{throw new Error('current rules replaced')},
    replay:()=>{replays++;throw new Error('unexpected replay')},
    store:{lookup:async(...args)=>{lookups.push(args);return {status:'stored',receipt,duplicate:true}}},
  })
  const a=await issue(api)
  const b=await issue(api,request({body:{actions:body.actions,setup:{versions,id}}}))
  assert.equal(a.value.duplicate,true)
  assert.deepEqual(a.value,b.value)
  assert.deepEqual(lookups[0],lookups[1])
  assert.equal(replays,0)
})

test('incomplete, stale, anonymous and oversized submissions cannot insert a seasonal record',async()=>{
  const incomplete=harness({replay:()=>({draft:{career:{...complete.draft.career,status:'active'}},atBats:[]})})
  assert.equal((await issue(incomplete.api)).value.code,'season_incomplete')
  assert.deepEqual(incomplete.calls.map(row=>row[0]),['lookup'])
  const stale=harness({getVersions:async()=>({careerHash:'b'.repeat(64)})})
  assert.equal((await issue(stale.api)).value.code,'version_mismatch')
  assert.deepEqual(stale.calls.map(row=>row[0]),['lookup'])
  const denied=harness()
  assert.equal((await issue(denied.api,request({headers:{cookie:undefined}}))).code,401)
  assert.equal((await issue(denied.api,request({headers:{origin:'https://other.invalid'}}))).code,403)
  assert.equal((await issue(denied.api,request({body:{...body,stats}}))).code,400)
  assert.equal((await issue(denied.api,request({headers:{'content-length':String(BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES+1)}}))).code,413)
  const stream=Object.assign(Readable.from([Buffer.alloc(BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES+1)]),request({body:undefined}))
  assert.equal((await issue(denied.api,stream)).code,413)
  assert.equal(denied.calls.length,0)
})

test('storage RPC uses parameter bindings, and migration variants restrict access to that single RPC',async()=>{
  const calls=[]
  const store=createBaseballAnnualStore({query:async(...args)=>{calls.push(args);return [{result:{status:'unconfirmed'}}]}})
  assert.equal((await store.lookup('owner',id,'hash')).status,'unconfirmed')
  assert.deepEqual(calls[0][1],['owner',id,'hash',null,null])
  assert.equal(calls[0][0].includes('owner'),false)
  const read=path=>readFile(new URL(path,import.meta.url),'utf8')
  const dev=await read('../db/migrations/20261126-baseball-career-annual.sql')
  const production=await read('../db/production/007-baseball-career-annual.sql')
  const bodyOf=sql=>sql.match(/AS \$function\$([\s\S]+?)\$function\$/)[1]
  assert.equal(bodyOf(dev),bodyOf(production))
  for(const [sql,role] of [[dev,'baseball_runtime'],[production,'baseball_prod_runtime']]){
    assert.match(sql,new RegExp('REVOKE ALL ON TABLE baseball_private\\.career_annual_receipts FROM PUBLIC,'+role))
    const allowed=[...sql.matchAll(/GRANT EXECUTE ON FUNCTION (.+) TO (\w+);/g)]
    assert.deepEqual(allowed.map(([,fn,actor])=>[fn,actor]),[['baseball_private.baseball_settle_career_annual(text,uuid,text,jsonb,jsonb)',role]])
    assert.match(sql,/SET search_path=pg_catalog,baseball_private,pg_temp/)
    assert.doesNotMatch(sql,/^\s*(?:UPDATE|DELETE FROM|DROP TABLE|TRUNCATE)\s/m)
  }
})

const nextId=randomUUID()
const growth={mit:63,power:56,discipline:61,stamina:68,trust:67,xp:530,condition:84}
const history=[{seasonId:id,seasonNumber:1,stats}]
const profile={name:'다음 시즌 선수',teamId:'heroes',handedness:'right',jerseyNumber:'07'}
const settings={baseSpeedKmh:120,pitchMode:'mixed'}
const nextBody={...body,setup:{id:nextId,versions,profile,settings,source:'manual',
  continuation:{careerId:id,previousSeasonId:id,seasonNumber:2,startingGrowth:growth,history}}}
const nextReceipt={...receipt,seasonId:nextId,seasonNumber:2}
const completedNext={...complete,draft:{career:{...complete.draft.career,id:nextId,startingGrowth:growth}}}
const winter={version:1,direction:'discipline'}
const winterBody={...nextBody,setup:{...nextBody.setup,winter}}

test('continued seasons use the authorized lineage before replay and settle under the original career ID',async()=>{
  const calls=[]
  const {api}=harness({
    replay:value=>{calls.push(['replay',value]);return completedNext},
    store:{
      lookupContinuation:async(...args)=>{calls.push(['lookup',...args]);return {status:'unconfirmed'}},
      saveContinuation:async(...args)=>{calls.push(['save',...args]);return {status:'stored',receipt:nextReceipt,duplicate:false}},
    },
  })
  const res=await issue(api,request({body:nextBody}))
  assert.equal(res.code,200)
  assert.deepEqual(res.value,{status:'stored',duplicate:false,receipt:{...nextReceipt,savedAt:'2026-11-26T00:00:00.123Z'}})
  assert.deepEqual(calls.map(row=>row[0]),['lookup','replay','save'])
  assert.match(calls[0][1],/^[a-f0-9]{64}$/)
  assert.match(calls[0][3],/^[a-f0-9]{64}$/)
  assert.deepEqual(calls[0].slice(1),calls[2].slice(1,5))
  assert.equal(calls[0][2],nextId)
  assert.equal(calls[0][4],nextBody.setup)
  assert.deepEqual(calls[2].slice(5),[completedNext.draft.career,complete.atBats])
})

test('winter plans are part of the hash and are returned by a settled second season and identical retry',async()=>{
  const hashes=[]
  let settledHash
  const stored={status:'stored',receipt:{...nextReceipt,winter},duplicate:false}
  const {api}=harness({
    replay:()=>completedNext,
    store:{
      lookupContinuation:async(_actor,_season,hash)=>{
        hashes.push(hash)
        if(!settledHash)return {status:'unconfirmed'}
        return hash===settledHash?{...stored,duplicate:true}:{status:'error',code:'season_conflict'}
      },
      saveContinuation:async(_actor,_season,hash,setup)=>{
        assert.deepEqual(setup.winter,winter)
        settledHash=hash
        return stored
      },
    },
  })
  const saved=await issue(api,request({body:winterBody}))
  assert.equal(saved.code,200)
  assert.deepEqual(saved.value.receipt.winter,winter)
  const retry=await issue(api,request({body:winterBody}))
  assert.deepEqual(retry.value,{...saved.value,duplicate:true})
  assert.equal((await issue(api,request({body:nextBody}))).code,409)
  const changed={...winterBody,setup:{...winterBody.setup,winter:{...winter,direction:'power'}}}
  assert.equal((await issue(api,request({body:changed}))).code,409)
  assert.equal(hashes[0],hashes[1])
  assert.equal(new Set(hashes).size,3)
})

test('winter plans reject malformed or mistimed entries before looking up a receipt',async()=>{
  const {api,calls}=harness()
  const invalidSetups=[
    {...body.setup,winter},
    {...winterBody.setup,continuation:{...nextBody.setup.continuation,seasonNumber:3}},
    ...[null,{...winter,version:2},{...winter,direction:'unknown'},{...winter,target:999}].map(plan=>({...winterBody.setup,winter:plan})),
  ]
  for(const setup of invalidSetups){
    const response=await issue(api,request({body:{...body,setup}}))
    assert.deepEqual([response.code,response.value.code],[400,'invalid_command'])
  }
  assert.equal(calls.length,0)
})

test('winter receipt cannot confirm a different plan or a missing plan',async()=>{
  for(const returned of [nextReceipt,{...nextReceipt,winter:{...winter,direction:'balanced'}}]){
    const {api}=harness({store:{lookupContinuation:async()=>({status:'stored',receipt:returned,duplicate:true})}})
    assert.equal((await issue(api,request({body:winterBody}))).code,503)
  }
})

test('forged or conflicting lineage is rejected before replay, and a saved next-season receipt is retrievable',async()=>{
  const errors=[{status:'not_found'},{status:'error',code:'season_conflict'},{status:'stored',receipt:nextReceipt,duplicate:true}]
  const {api}=harness({
    store:{lookupContinuation:async()=>errors.shift()},
    getVersions:()=>assert.fail('storage must decide before versions'),
    replay:()=>assert.fail('storage must decide before replay'),
  })
  assert.equal((await issue(api,request({body:{...nextBody,setup:{...nextBody.setup,continuation:null}}}))).code,400)
  assert.equal((await issue(api,request({body:nextBody}))).code,404)
  assert.equal((await issue(api,request({body:nextBody}))).code,409)
  const duplicate=await issue(api,request({body:nextBody}))
  assert.equal(duplicate.value.duplicate,true)
  assert.equal(duplicate.value.receipt.careerId,id)
})

test('pre-continuation rule hashes remain valid for existing year-one logs only',async()=>{
  const oldVersions={...versions,...BASEBALL_CAREER_V2_PRIOR_REGULAR_HASHES}
  const first=harness()
  const settled=await issue(first.api,request({body:{...body,setup:{id,versions:oldVersions}}}))
  assert.equal(settled.code,200)
  const wrong=harness({getVersions:async()=>({...versions,growthHash:'c'.repeat(64)})})
  assert.equal((await issue(wrong.api,request({body:{...body,setup:{id,versions:{...oldVersions,growthHash:'d'.repeat(64)}}}}))).code,409)
  const continued=harness({store:{lookupContinuation:async()=>({status:'unconfirmed'})},replay:()=>assert.fail('outdated rules')})
  assert.equal((await issue(continued.api,request({body:{...nextBody,setup:{...nextBody.setup,versions:oldVersions}}}))).value.code,'version_mismatch')
})

test('career history read requires an authenticated same-origin request and returns only the season summaries',async()=>{
  const latest={seasonId:id,seasonNumber:1,growth,profile,settings,source:'manual'}
  let storedHistory={status:'ok',careerId:id,history,latest:{...latest,profile:{...profile,privateValue:'redact'}},privateValue:'redact'}
  const calls=[]
  const {api}=harness({store:{history:async(...args)=>{calls.push(args);return storedHistory}}})
  const read={method:'GET',query:{careerId:id}}
  assert.equal((await issue(api,request({...read,headers:{cookie:undefined}}))).code,401)
  assert.equal((await issue(api,request({...read,headers:{origin:'https://other.invalid'}}))).code,403)
  assert.equal((await issue(api,request({...read,query:{careerId:[id]}}))).code,400)
  assert.equal(calls.length,0)
  const valid=await issue(api,request(read))
  assert.equal(valid.code,200)
  assert.deepEqual(valid.value,{status:'ok',careerId:id,history,latest})
  assert.match(calls[0][0],/^[a-f0-9]{64}$/)
  assert.equal(calls[0][1],id)
  storedHistory={status:'not_found'}
  assert.equal((await issue(api,request(read))).code,404)
  storedHistory={status:'ok',careerId:id,history:[{...history[0],privateValue:'redact'}],latest}
  assert.equal((await issue(api,request(read))).code,503)
})

test('history exposes the archived winter plan alongside the unchanged season summaries',async()=>{
  const latest={seasonId:nextId,seasonNumber:2,growth,profile,settings,source:'manual'}
  const seasons=[...history,{seasonId:nextId,seasonNumber:2,stats}]
  const result={status:'ok',careerId:id,history:seasons,latest,winter:{2:winter}}
  let stored=result
  const {api}=harness({store:{history:async()=>stored}})
  const read=request({method:'GET',query:{careerId:id}})
  assert.deepEqual((await issue(api,read)).value,result)
  stored={...result,winter:{3:winter}}
  assert.equal((await issue(api,read)).code,503)
  stored={...result,winter:{2:{...winter,target:4}}}
  assert.equal((await issue(api,read)).code,503)
})

test('separate continuation RPCs use bind parameters and expose no raw history table to runtime',async()=>{
  const calls=[]
  const store=createBaseballAnnualStore({query:async(...args)=>{calls.push(args);return [{result:{status:'unconfirmed'}}]}})
  await store.lookupContinuation('actor',nextId,'hash',nextBody.setup)
  await store.saveContinuation('actor',nextId,'hash',nextBody.setup,completedNext.draft.career,complete.atBats)
  await store.history('actor',id)
  assert.deepEqual(calls.map(call=>call[1]),[
    ['actor',nextId,'hash',JSON.stringify(nextBody.setup),null,null],
    ['actor',nextId,'hash',JSON.stringify(nextBody.setup),JSON.stringify(completedNext.draft.career),JSON.stringify(complete.atBats)],
    ['actor',id],
  ])
  assert.ok(calls.every(([statement])=>!statement.includes('actor')&&!statement.includes(id)))
  const read=path=>readFile(new URL(path,import.meta.url),'utf8')
  const dev=await read('../db/migrations/20261126-baseball-career-multiseason.sql')
  const production=await read('../db/production/008-baseball-career-multiseason.sql')
  const bodyOf=sql=>[...sql.matchAll(/AS \$function\$([\s\S]+?)\$function\$/g)].map(([,body])=>body)
  assert.equal(bodyOf(dev).length,6)
  assert.deepEqual(bodyOf(dev),bodyOf(production))
  for(const [sql,role] of [[dev,'baseball_runtime'],[production,'baseball_prod_runtime']]){
    assert.match(sql,new RegExp('REVOKE ALL ON TABLE baseball_private\\.career_annual_receipts FROM PUBLIC,'+role))
    const allowed=[...sql.matchAll(/GRANT EXECUTE ON FUNCTION (.+) TO (\w+);/g)]
    assert.deepEqual(allowed.map(([,fn,actor])=>[fn,actor]),[
      ['baseball_private.baseball_settle_career_annual(text,uuid,text,jsonb,jsonb)',role],
      ['baseball_private.baseball_continue_career_annual(text,uuid,text,jsonb,jsonb,jsonb)',role],
      ['baseball_private.baseball_read_career_annual_history(text,uuid)',role],
    ])
  }
})

test('winter-only settlement RPC and history wrapper grant no additional table access',async()=>{
  const calls=[]
  const store=createBaseballAnnualStore({query:async(...args)=>{calls.push(args);return [{result:{status:'unconfirmed'}}]}})
  await store.lookupContinuation('actor',nextId,'hash',winterBody.setup)
  await store.saveContinuation('actor',nextId,'hash',winterBody.setup,completedNext.draft.career,complete.atBats)
  await store.history('actor',id)
  assert.match(calls[0][0],/baseball_continue_career_annual_with_winter\(/)
  assert.equal(calls[0][0],calls[1][0])
  assert.deepEqual(calls[0][1],['actor',nextId,'hash',JSON.stringify(winterBody.setup),null,null])
  assert.match(calls[2][0],/baseball_read_career_annual_history_with_winter\(/)
  const read=path=>readFile(new URL(path,import.meta.url),'utf8')
  const dev=await read('../db/migrations/20261126-baseball-career-winter.sql')
  const production=await read('../db/production/009-baseball-career-winter.sql')
  const bodyOf=sql=>[...sql.matchAll(/AS \$function\$([\s\S]+?)\$function\$/g)].map(([,body])=>body)
  assert.equal(bodyOf(dev).length,2)
  assert.deepEqual(bodyOf(dev),bodyOf(production))
  for(const [sql,role] of [[dev,'baseball_runtime'],[production,'baseball_prod_runtime']]){
    assert.match(sql,new RegExp('REVOKE ALL ON TABLE baseball_private\\.career_annual_receipts FROM PUBLIC,'+role))
    const allowed=[...sql.matchAll(/GRANT EXECUTE ON FUNCTION (.+) TO (\w+);/g)]
    assert.deepEqual(allowed.map(([,fn,actor])=>[fn,actor]),[
      ['baseball_private.baseball_continue_career_annual_with_winter(text,uuid,text,jsonb,jsonb,jsonb)',role],
      ['baseball_private.baseball_read_career_annual_history_with_winter(text,uuid)',role],
    ])
    assert.match(sql,/SET search_path=pg_catalog,baseball_private,pg_temp/)
    assert.doesNotMatch(sql,/^\s*(?:DELETE FROM|DROP TABLE|TRUNCATE)\s/m)
  }
})

const finalId=randomUUID()
const previousSeasons=[history[0],...Array.from({length:8},(_,index)=>({seasonId:randomUUID(),seasonNumber:index+2,stats}))]
const finalBody={...nextBody,setup:{...nextBody.setup,id:finalId,continuation:{...nextBody.setup.continuation,
  previousSeasonId:previousSeasons.at(-1).seasonId,seasonNumber:10,history:previousSeasons}}}
const finalReceipt={...receipt,seasonId:finalId,seasonNumber:10}
const completedFinal={...completedNext,draft:{career:{...completedNext.draft.career,id:finalId}}}

test('the final decision is included in the settlement hash and preserved on an identical retry',async()=>{
  for(const finish of ['active','retired']){
    const submitted={...finalBody,finish}
    const hashes=[]
    let settledHash,replays=0
    const stored={status:'stored',receipt:{...finalReceipt,finish},duplicate:false}
    const lookup=async(_actor,seasonId,hash,setup)=>{
      assert.equal(seasonId,finalId)
      assert.equal(setup,submitted.setup)
      hashes.push(hash)
      if(!settledHash)return {status:'unconfirmed'}
      return hash===settledHash?{...stored,duplicate:true}:{status:'error',code:'season_conflict'}
    }
    const {api}=harness({
      replay:value=>{replays++;assert.deepEqual(value,finalBody);return completedFinal},
      store:{lookupFinish:lookup,lookupContinuation:lookup,
        saveFinish:async(_actor,seasonId,hash,setup,choice,career,atBats)=>{
          assert.equal(seasonId,finalId)
          assert.equal(setup,submitted.setup)
          assert.equal(choice,finish)
          assert.equal(career,completedFinal.draft.career)
          assert.equal(atBats,completedFinal.atBats)
          settledHash=hash
          return stored
        }},
    })
    const saved=await issue(api,request({body:submitted}))
    assert.equal(saved.code,200)
    assert.equal(saved.value.receipt.finish,finish)
    const retry=await issue(api,request({body:{finish,actions:submitted.actions,setup:submitted.setup}}))
    assert.deepEqual(retry.value,{...saved.value,duplicate:true})
    const different={...submitted,finish:finish==='active'?'retired':'active'}
    assert.equal((await issue(api,request({body:different}))).code,409)
    assert.equal((await issue(api,request({body:finalBody}))).code,409)
    assert.equal(hashes[0],hashes[1])
    assert.equal(new Set(hashes).size,3)
    assert.equal(replays,1)
  }
})

test('the final decision requires the final completed season and a matching receipt',async()=>{
  const {api,calls}=harness()
  for(const invalid of [{...body,finish:'retired'},{...nextBody,finish:'active'},
    ...[null,'deferred',true].map(finish=>({...finalBody,finish}))]){
    const res=await issue(api,request({body:invalid}))
    assert.deepEqual([res.code,res.value.code],[400,'invalid_command'])
  }
  assert.equal(calls.length,0)
  const req=request({body:{...finalBody,finish:'retired'}})
  const incomplete=harness({
    replay:()=>({draft:{career:{...completedFinal.draft.career,status:'active'}},atBats:[]}),
    store:{lookupFinish:async()=>({status:'unconfirmed'}),saveFinish:async()=>assert.fail('an incomplete season was saved')},
  })
  assert.equal((await issue(incomplete.api,req)).value.code,'season_incomplete')
  for(const returned of [finalReceipt,{...finalReceipt,finish:'active'}]){
    const {api}=harness({store:{lookupFinish:async()=>({status:'stored',receipt:returned,duplicate:true})}})
    assert.equal((await issue(api,req)).code,503)
  }
  const legacy=harness({store:{lookupContinuation:async()=>({status:'stored',receipt:finalReceipt,duplicate:true})}})
  const unchanged=await issue(legacy.api,request({body:finalBody}))
  assert.equal(unchanged.code,200)
  assert.equal(Object.hasOwn(unchanged.value.receipt,'finish'),false)
})

test('history preserves the final choice, the winter plan, and the season summaries',async()=>{
  const seasons=[...previousSeasons,{seasonId:finalId,seasonNumber:10,stats}]
  const latest={seasonId:finalId,seasonNumber:10,growth,profile,settings,source:'manual'}
  const result={status:'ok',careerId:id,history:seasons,latest,winter:{2:winter}}
  let stored=result
  const {api}=harness({store:{history:async()=>stored}})
  const read=request({method:'GET',query:{careerId:id}})
  assert.deepEqual((await issue(api,read)).value,result)
  for(const finish of ['active','retired']){
    stored={...result,finish}
    assert.deepEqual((await issue(api,read)).value,stored)
  }
  stored={...result,finish:'deferred'}
  assert.equal((await issue(api,read)).code,503)
  stored={...result,history:previousSeasons,latest:{...latest,seasonId:previousSeasons.at(-1).seasonId,seasonNumber:9},finish:'retired'}
  assert.equal((await issue(api,read)).code,503)
})

test('the final-choice RPC is additive, parameterized, and restricted to the existing runtime role',async()=>{
  const calls=[]
  const store=createBaseballAnnualStore({query:async(...args)=>{calls.push(args);return [{result:{status:'unconfirmed'}}]}})
  await store.lookupFinish('actor',finalId,'hash',finalBody.setup,'retired')
  await store.saveFinish('actor',finalId,'hash',finalBody.setup,'retired',completedFinal.draft.career,complete.atBats)
  assert.equal(calls[0][0],calls[1][0])
  assert.match(calls[0][0],/baseball_continue_career_annual_with_finish\(/)
  assert.doesNotMatch(calls[0][0],/retired/)
  assert.deepEqual(calls[0][1],['actor',finalId,'hash',JSON.stringify(finalBody.setup),null,null,'retired'])
  assert.deepEqual(calls[1][1],['actor',finalId,'hash',JSON.stringify(finalBody.setup),JSON.stringify(completedFinal.draft.career),JSON.stringify(complete.atBats),'retired'])
  const read=path=>readFile(new URL(path,import.meta.url),'utf8')
  const dev=await read('../db/migrations/20261126-baseball-career-finish.sql')
  const production=await read('../db/production/010-baseball-career-finish.sql')
  const bodies=sql=>[...sql.matchAll(/AS \$function\$([\s\S]+?)\$function\$/g)].map(([,body])=>body)
  assert.equal(bodies(dev).length,2)
  assert.deepEqual(bodies(dev),bodies(production))
  for(const [sql,role] of [[dev,'baseball_runtime'],[production,'baseball_prod_runtime']]){
    assert.match(sql,new RegExp('REVOKE ALL ON TABLE baseball_private\\.career_annual_receipts FROM PUBLIC,'+role))
    const allowed=[...sql.matchAll(/GRANT EXECUTE ON FUNCTION (.+) TO (\w+);/g)]
    assert.deepEqual(allowed.map(([,fn,actor])=>[fn,actor]),[
      ['baseball_private.baseball_continue_career_annual_with_finish(text,uuid,text,jsonb,jsonb,jsonb,text)',role],
      ['baseball_private.baseball_read_career_annual_history_with_winter(text,uuid)',role],
    ])
    assert.doesNotMatch(sql,/^\s*(?:DELETE FROM|DROP TABLE|TRUNCATE)\s/m)
  }
})
