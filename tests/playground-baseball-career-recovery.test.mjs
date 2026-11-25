import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { createBaseballCareerRecoveryCode, normalizeBaseballCareerRecoveryCode, hashBaseballCareerRecoveryCode,
  encryptBaseballCareerRecoveryCode, decryptBaseballCareerRecoveryCode } from '../lib/server/baseball-career-recovery.mjs'
import { createBaseballCareerRecoveryStore, withBaseballCareerAccess } from '../lib/server/baseball-career-recovery-db.mjs'
import { createBaseballCareerRecoveryHandler, BASEBALL_CAREER_RECOVERY_BODY_BYTES } from '../lib/server/baseball-career-recovery-api.mjs'
import { createBaseballCareerRecoveryClient } from '../lib/playground-baseball-career-recovery-client.mjs'
import { createBaseballParticipant } from '../lib/server/baseball-auth.mjs'

const secret='recovery-unit-tests-only-not-an-actual-credential'
const env={NODE_ENV:'development',BASEBALL_DATA_ENABLED:'true',BASEBALL_DATABASE_URL:'postgresql://baseball_runtime:example-only@database.invalid/baseball_dev',BASEBALL_SIGNING_SECRET:secret}
const id='10000000-0000-4000-8000-000000000001',otherId='10000000-0000-4000-8000-000000000002'
const now=Date.UTC(2026,10,25),original=createBaseballParticipant(secret,{now}),visitor=createBaseballParticipant(secret,{now})
const originalCookie=original.cookie.split(';')[0],visitorCookie=visitor.cookie.split(';')[0]
const code=createBaseballCareerRecoveryCode({bytes:Buffer.alloc(20,17)})
const response=()=>({statusCode:200,headers:{},setHeader(key,value){this.headers[key]=value},status(value){this.statusCode=value;return this},json(value){this.body=value;return this}})
const request=({method='POST',body={careerId:id,version:1,action:'issue'},headers={},...rest}={})=>({method,query:{},body,headers:{host:'localhost:3031',origin:'http://localhost:3031','content-type':'application/json',cookie:originalCookie,...headers},...rest})
const run=async(handler,req=request())=>{const res=response();await handler(req,res);return res}
function harness(){
  const codes=new Map(),grants=new Map(),calls=[]
  const key=(id,version)=>`${version}:${id}`
  const store={
    calls,codes,grants,
    async code(actor,careerId,version,action,hash,encrypted){
      calls.push({action,actor,careerId,version,hash,encrypted})
      if(actor!==original.hash||careerId!==id)return{status:'error',code:'recovery_unavailable'}
      const k=key(careerId,version),prior=codes.get(k)
      if(action==='read'||action==='issue'&&prior?.active)return{status:'ok',state:prior?.active?'active':prior?'revoked':'absent',encryptedCode:prior?.encrypted}
      if(action==='revoke'){if(prior?.active){prior.active=false;prior.generation++;prior.hash=null;prior.encrypted=null}return{status:'ok',state:prior?'revoked':'absent',encryptedCode:null}}
      codes.set(k,{active:true,hash,encrypted,generation:(prior?.generation||0)+1})
      return{status:'ok',state:'active',encryptedCode:encrypted}
    },
    async redeem(actor,hash){
      calls.push({action:'redeem',actor,hash})
      const found=[...codes.entries()].find(([,row])=>row.active&&row.hash===hash)
      if(!found)return{status:'error',code:'recovery_unavailable'}
      const[k,row]=found;grants.set(`${actor}:${k}`,row.generation)
      return{status:'ok',careerId:id,version:Number(k.split(':')[0]),ownerHash:'not-public'}
    },
    async resolveOwner(actor,careerId,version){const k=key(careerId,version),entry=codes.get(k);return careerId===id&&(actor===original.hash||entry?.active&&grants.get(`${actor}:${k}`)===entry.generation)?{status:'ok',ownerHash:original.hash}:{status:'not_found'}},
    async listAccessible(actor,version){return{status:'ok',careers:(await this.resolveOwner(actor,id,version)).status==='ok'?[{id}]:[]}},
  }
  const handler=mode=>createBaseballCareerRecoveryHandler({env,store,mode,now:()=>now,createCode:()=>createBaseballCareerRecoveryCode()})
  return{store,codeHandler:handler('code'),redeemHandler:handler('redeem')}
}

test('recovery codes contain160 random bits and accept only their bounded canonical alphabet',()=>{
  assert.equal(createBaseballCareerRecoveryCode({bytes:Buffer.alloc(20)}),'BCR1-0000-0000-0000-0000-0000-0000-0000-0000')
  assert.equal(createBaseballCareerRecoveryCode({bytes:Buffer.alloc(20,255)}),'BCR1-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ')
  const values=new Set(Array.from({length:100},()=>createBaseballCareerRecoveryCode()));assert.equal(values.size,100)
  for(const value of values)assert.match(value,/^BCR1(?:-[0-9A-HJKMNP-TV-Z]{4}){8}$/)
  assert.equal(normalizeBaseballCareerRecoveryCode(` ${code.toLowerCase()}\n`),code.replaceAll('-',''))
  for(const value of [null,{},'',code+'x','x'.repeat(129),code.replace(/0|2/,'I')])assert.equal(normalizeBaseballCareerRecoveryCode(value),null)
  assert.throws(()=>createBaseballCareerRecoveryCode({bytes:Buffer.alloc(19)}))
})
test('lookup is purpose-bound HMAC; formatting changes never change lookup',()=>{
  const hash=hashBaseballCareerRecoveryCode(code,secret)
  assert.match(hash,/^[a-f0-9]{64}$/)
  assert.equal(hash,hashBaseballCareerRecoveryCode(code.toLowerCase().replaceAll('-',' '),secret))
  assert.notEqual(hash,hashBaseballCareerRecoveryCode(code,secret+'other'))
  assert.throws(()=>hashBaseballCareerRecoveryCode('invalid',secret));assert.throws(()=>hashBaseballCareerRecoveryCode(code,'short'))
})
test('AES-GCM owner retrieval binds ciphertext to both player and career version',()=>{
  const encrypted=encryptBaseballCareerRecoveryCode(code,secret,{careerId:id,version:1})
  assert.ok(!encrypted.includes(code));assert.equal(decryptBaseballCareerRecoveryCode(encrypted,secret,{careerId:id,version:1}),code)
  assert.notEqual(encrypted,encryptBaseballCareerRecoveryCode(code,secret,{careerId:id,version:1}))
  for(const args of [{careerId:otherId,version:1},{careerId:id,version:2}])assert.throws(()=>decryptBaseballCareerRecoveryCode(encrypted,secret,args))
  assert.throws(()=>decryptBaseballCareerRecoveryCode(encrypted,secret+'wrong',{careerId:id,version:1}))
  const parts=encrypted.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1)
  assert.throws(()=>decryptBaseballCareerRecoveryCode(parts.join('.'),secret,{careerId:id,version:1}))
})
test('production and disabled recovery reject before initializing any store',async()=>{
  for(const mode of ['code','redeem'])for(const changed of [{NODE_ENV:'production'},{BASEBALL_DATA_ENABLED:'false'},{BASEBALL_SIGNING_SECRET:''}]){
    let initialized=0
    const handler=createBaseballCareerRecoveryHandler({mode,env:{...env,...changed},getStore:()=>{initialized++;throw Error()}})
    const res=await run(handler);assert.equal(res.statusCode,503);assert.equal(res.body.code,'not_configured');assert.equal(initialized,0)
  }
})
test('recovery uses POST body only, same-origin JSON and strict limited fields',async()=>{
  const{codeHandler,store}=harness()
  for(const[req,status]of [[request({method:'GET'}),405],[request({headers:{origin:'https://unrelated.invalid'}}),403],
    [request({headers:{'sec-fetch-site':'cross-site'}}),403],[request({headers:{'content-type':'text/plain'}}),415],
    [request({query:{code}}),400],[request({body:{careerId:id,version:1,action:'issue',ownerHash:original.hash}}),400],
    [request({body:{careerId:id,version:3,action:'issue'}}),400],[request({body:{careerId:id,version:1,action:'unknown'}}),400],
    [request({body:{careerId:id,version:1,action:'issue',extra:'x'.repeat(BASEBALL_CAREER_RECOVERY_BODY_BYTES)}}),413],
    [request({headers:{'content-length':'99999'}}),413],[request({headers:{cookie:undefined}}),401]]){
    const res=await run(codeHandler,req);assert.equal(res.statusCode,status);assert.ok(!JSON.stringify(res.body).includes(code))
  }
  assert.equal(store.calls.length,0)
})
test('streaming oversized recovery body stops reading without echoing submitted code',async()=>{
  const{redeemHandler,store}=harness(),req=Object.assign(new EventEmitter(),request());delete req.body;req.resume=()=>{}
  const res=response(),pending=redeemHandler(req,res)
  req.emit('data',Buffer.from('x'.repeat(BASEBALL_CAREER_RECOVERY_BODY_BYTES+1)))
  await pending;assert.equal(res.statusCode,413);assert.equal(store.calls.length,0)
})
test('original owner can issue/read the same code without exposing hash or ciphertext',async()=>{
  const{codeHandler,store}=harness()
  const issued=await run(codeHandler),again=await run(codeHandler),read=await run(codeHandler,request({body:{careerId:id,version:1,action:'read'}}))
  assert.equal(issued.statusCode,200);assert.equal(issued.body.state,'active');assert.equal(again.body.code,issued.body.code);assert.equal(read.body.code,issued.body.code)
  assert.equal(issued.headers['Cache-Control'],'private, no-store, max-age=0')
  const stored=store.codes.get(`1:${id}`);assert.ok(!JSON.stringify(stored).includes(issued.body.code))
  for(const marker of ['ownerHash','encryptedCode','lookup_hash',original.hash])assert.ok(!JSON.stringify(issued.body).includes(marker))
})
test('a restored browser never gains code read, rotate, revoke or ownership',async()=>{
  const{codeHandler,redeemHandler,store}=harness(),issued=await run(codeHandler)
  const restored=await run(redeemHandler,request({body:{code:issued.body.code},headers:{cookie:visitorCookie}}))
  assert.deepEqual(restored.body,{status:'ok',careerId:id,version:1});assert.equal(restored.headers['Set-Cookie'],undefined)
  for(const action of ['read','issue','rotate','revoke'])assert.equal((await run(codeHandler,request({headers:{cookie:visitorCookie},body:{careerId:id,version:1,action}}))).statusCode,400)
  assert.equal((await store.resolveOwner(visitor.hash,id,1)).ownerHash,original.hash)
  assert.equal((await store.resolveOwner(visitor.hash,otherId,1)).status,'not_found');assert.equal((await store.resolveOwner(visitor.hash,id,2)).status,'not_found')
})
test('redeeming requires the existing list bootstrap so failed guesses retain one requester rate identity',async()=>{
  const{codeHandler,redeemHandler,store}=harness(),issued=await run(codeHandler),before=store.calls.length
  for(const value of[issued.body.code,code]){
    const failed=await run(redeemHandler,request({body:{code:value},headers:{cookie:undefined}}))
    assert.equal(failed.statusCode,401);assert.equal(failed.body.code,'owner_required');assert.equal(failed.headers['Set-Cookie'],undefined)
  }
  assert.equal(store.calls.length,before)
  // visitorCookie represents a fresh browser identity from the unchanged list bootstrap.
  const restored=await run(redeemHandler,request({body:{code:issued.body.code},headers:{cookie:visitorCookie}}))
  assert.equal(restored.statusCode,200);assert.equal(restored.headers['Set-Cookie'],undefined)
  assert.equal(store.calls.at(-1).actor,visitor.hash);assert.notEqual(visitor.hash,original.hash)
})
test('rotation and revocation invalidate both the previous code and its grants, keeping the owner',async()=>{
  const{codeHandler,redeemHandler,store}=harness(),issued=await run(codeHandler)
  await run(redeemHandler,request({body:{code:issued.body.code},headers:{cookie:visitorCookie}}))
  const rotated=await run(codeHandler,request({body:{careerId:id,version:1,action:'rotate'}}))
  assert.notEqual(rotated.body.code,issued.body.code);assert.equal((await store.resolveOwner(visitor.hash,id,1)).status,'not_found')
  assert.equal((await run(redeemHandler,request({body:{code:issued.body.code}}))).statusCode,400)
  assert.equal((await store.resolveOwner(original.hash,id,1)).status,'ok')
  await run(redeemHandler,request({body:{code:rotated.body.code},headers:{cookie:visitorCookie}}))
  const revoked=await run(codeHandler,request({body:{careerId:id,version:1,action:'revoke'}}))
  assert.equal(revoked.body.state,'revoked');assert.equal(revoked.body.code,undefined)
  assert.equal((await store.resolveOwner(visitor.hash,id,1)).status,'not_found');assert.equal((await store.resolveOwner(original.hash,id,1)).status,'ok')
  assert.equal((await run(redeemHandler,request({body:{code:rotated.body.code}}))).statusCode,400)
})
test('v1 and v2 use distinct player recovery namespaces',async()=>{
  const{codeHandler,redeemHandler,store}=harness()
  const a=await run(codeHandler),b=await run(codeHandler,request({body:{careerId:id,version:2,action:'issue'}}))
  assert.notEqual(a.body.code,b.body.code);assert.equal((await run(redeemHandler,request({body:{code:b.body.code},headers:{cookie:visitorCookie}}))).body.version,2)
  assert.equal((await store.resolveOwner(visitor.hash,id,1)).status,'not_found');assert.equal((await store.resolveOwner(visitor.hash,id,2)).status,'ok')
})
test('rate limits and unexpected database errors return no code, owner or secret details',async()=>{
  for(const mode of ['code','redeem']){
    const handler=createBaseballCareerRecoveryHandler({mode,env,now:()=>now,store:{code:async()=>({status:'error',code:'rate_limited'}),redeem:async()=>({status:'error',code:'rate_limited'})}})
    const limited=await run(handler,request({body:mode==='code'?{careerId:id,version:1,action:'read'}:{code}}))
    assert.equal(limited.statusCode,429);assert.equal(limited.headers['Retry-After'],'60')
  }
  const handler=createBaseballCareerRecoveryHandler({env,now:()=>now,store:{code:()=>{throw new Error(secret+code)}}})
  const failed=await run(handler);assert.equal(failed.statusCode,503);assert.deepEqual(failed.body,{status:'unavailable',code:'recovery_unavailable'})
})
test('access proxy resolves one authorized player and preserves create, revisions and command bodies',async()=>{
  const calls=[],base={list:()=>{throw Error('Must use access list')},read:(...args)=>{calls.push(args);return{status:'ok'}},readAtBat:(...args)=>{calls.push(args);return{status:'ok'}},save:(...args)=>{calls.push(args);return{status:'stored'}}}
  let active=true
  const recovery={resolveOwner:async(actor,career,version)=>active&&actor===visitor.hash&&career===id&&version===2?{status:'ok',ownerHash:original.hash}:{status:'not_found'},listAccessible:(actor,version)=>({actor,version})}
  const proxy=withBaseballCareerAccess(base,recovery,{version:2}),command={kind:'untouched'}
  await proxy.read(visitor.hash,id,'command-id');assert.deepEqual(calls.pop(),[original.hash,id,'command-id'])
  await proxy.readAtBat(visitor.hash,id,otherId);assert.deepEqual(calls.pop(),[original.hash,id,otherId])
  await proxy.save(visitor.hash,id,4,command);assert.deepEqual(calls.pop(),[original.hash,id,4,command])
  await proxy.save(visitor.hash,otherId,0,command);assert.deepEqual(calls.pop(),[visitor.hash,otherId,0,command])
  assert.deepEqual(proxy.list(visitor.hash),{actor:visitor.hash,version:2})
  active=false;assert.equal((await proxy.read(visitor.hash,id)).status,'not_found');assert.equal((await proxy.save(visitor.hash,id,4,command)).status,'not_found');assert.equal(calls.length,0)
})
test('recovery store always binds values and never interpolates codes or owner hashes into SQL',async()=>{
  const calls=[],store=createBaseballCareerRecoveryStore({query:async(sql,values)=>{calls.push({sql,values});return[{result:{status:'ok'}}]}})
  await store.code(original.hash,id,1,'issue','a'.repeat(64),'encrypted');await store.redeem(visitor.hash,'a'.repeat(64))
  await store.resolveOwner(visitor.hash,id,2);await store.listAccessible(visitor.hash,2)
  assert.equal(calls.length,4)
  for(const call of calls){assert.ok(call.sql.includes('$1'));assert.ok(!call.sql.includes(original.hash));assert.ok(!call.sql.includes(id));assert.ok(!call.sql.includes('encrypted'))}
})
test('client posts raw code only in a no-store request body and discards response extras',async()=>{
  const calls=[],client=createBaseballCareerRecoveryClient({fetchImpl:async(url,options)=>{calls.push({url,options});const body=JSON.parse(options.body);return{ok:true,json:async()=>({status:'ok',careerId:id,version:1,...(url.endsWith('/code')?{state:'active',code}:{}),ownerHash:'private',...body.code?{recoveryCode:'private'}:{}})}}})
  const shown=await client.read(id,1);assert.deepEqual(Object.keys(shown).sort(),['careerId','code','state','status','version'])
  assert.deepEqual(await client.redeem(code),{status:'ok',careerId:id,version:1})
  for(const {url,options}of calls){assert.ok(!url.includes(code));assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store')}
  client.close();await assert.rejects(client.issue(id,1),{code:'recovery_unavailable'})
})
test('client rejects stale completions and invalid player/code responses without persistence',async()=>{
  let complete
  const client=createBaseballCareerRecoveryClient({fetchImpl:()=>new Promise(resolve=>{complete=resolve})})
  const pending=client.issue(id,1);client.close();complete({ok:true,json:async()=>({status:'ok',careerId:id,version:1,state:'active',code})})
  await assert.rejects(pending,{code:'recovery_unavailable'})
  const invalid=createBaseballCareerRecoveryClient({fetchImpl:async()=>({ok:true,json:async()=>({status:'ok',careerId:otherId,version:1,state:'active',code})})})
  await assert.rejects(invalid.issue(id,1),{code:'recovery_unavailable'});invalid.close()
})
test('migration protects private tables and generations without updating existing career rows or functions',async()=>{
  const sql=await readFile(new URL('../db/migrations/20261125-baseball-career-recovery.sql',import.meta.url),'utf8')
  assert.match(sql,/current_database\(\)<>'baseball_dev'/);assert.match(sql,/g\.generation=c\.generation/)
  assert.match(sql,/generation=generation\+1/);assert.match(sql,/actor_hash/);assert.match(sql,/>=10000/)
  for(const table of ['career_saves','career_v2_saves','career_commands','career_v2_commands','career_at_bats','career_v2_at_bats'])assert.ok(!new RegExp(`(?:UPDATE|INSERT INTO|DELETE FROM) baseball_private\\.${table}\\b`,'i').test(sql))
  assert.match(sql,/REVOKE ALL ON baseball_private\.career_recovery_codes,baseball_private\.career_recovery_grants,baseball_private\.career_recovery_limits FROM PUBLIC,baseball_runtime/)
  const source=await readFile(new URL('../lib/playground-baseball-career-recovery-client.mjs',import.meta.url),'utf8')
  for(const marker of ['localStorage','sessionStorage','indexedDB','console.'])assert.ok(!source.includes(marker))
})
