import test from 'node:test'
import assert from 'node:assert/strict'
import { readBaseballConfiguration, readBaseballCareerConfiguration, readBaseballCareerAvailability } from '../lib/server/baseball-db.mjs'
import { createBaseballParticipant, hasBaseballCareerSameOrigin, shouldSecureBaseballCareerCookie, readBaseballParticipant } from '../lib/server/baseball-auth.mjs'
import { createBaseballApiHandler } from '../lib/server/baseball-api.mjs'
import { createBaseballAtBatApiHandler } from '../lib/server/baseball-at-bat-api.mjs'
import { createBaseballCareerApiHandler } from '../lib/server/baseball-career-api.mjs'
import { createBaseballCareerV2ApiHandler } from '../lib/server/baseball-career-v2-api.mjs'
import { createBaseballCareerAnnualApiHandler } from '../lib/server/baseball-career-annual-api.mjs'
import { createBaseballCareerRecoveryHandler } from '../lib/server/baseball-career-recovery-api.mjs'

const development = {
  NODE_ENV:'development', BASEBALL_DATA_ENABLED:'true',
  BASEBALL_DATABASE_URL:'postgresql://baseball_runtime:example-only@development.invalid/baseball_dev',
  BASEBALL_SIGNING_SECRET:'development-example-only-not-a-real-secret',
}
const preview = {
  NODE_ENV:'production', VERCEL:'1', VERCEL_ENV:'preview',
  VERCEL_GIT_COMMIT_REF:'codex/baseball-career-preview', BASEBALL_PREVIEW_ENABLED:'true',
  BASEBALL_PREVIEW_DATABASE_URL:'postgresql://baseball_prod_runtime:example-only@preview-database.invalid/baseball_prod?sslmode=require',
  BASEBALL_PREVIEW_DATABASE_HOST:'preview-database.invalid',
  BASEBALL_PREVIEW_SIGNING_SECRET:'preview-example-only-not-a-real-signing-secret',
}
const production = {
  NODE_ENV:'production', VERCEL:'1', VERCEL_ENV:'production', BASEBALL_DATA_ENABLED:'true',
  BASEBALL_DATABASE_URL:'postgresql://baseball_prod_runtime:example-only@production-database.invalid/baseball_prod?sslmode=require',
  BASEBALL_PRODUCTION_DATABASE_HOST:'production-database.invalid',
  BASEBALL_SIGNING_SECRET:'production-example-only-not-a-real-signing-secret',
}
const now = Date.UTC(2026,10,26)
const id = '10000000-0000-4000-8000-000000000001'
const cookie = createBaseballParticipant(preview.BASEBALL_PREVIEW_SIGNING_SECRET,{now,secure:true}).cookie.split(';')[0]
const factories = [createBaseballCareerApiHandler, createBaseballCareerV2ApiHandler]
const response = () => ({statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value},status(value){this.statusCode=value;return this},json(value){this.body=value;return this}})
const request = ({method='GET',headers={},body,query={}}={}) => ({
  method,body,query,socket:{encrypted:false},headers:{host:'preview-site.invalid',...headers},
})
const run = async (handler,req=request()) => {const res=response();await handler(req,res);return res}

test('개발 설정·표시 상태는 기존 계약을 유지하고 Preview의 이전 환경값 fallback은 금지한다', () => {
  const original={databaseUrl:development.BASEBALL_DATABASE_URL,secret:development.BASEBALL_SIGNING_SECRET}
  assert.deepEqual(readBaseballConfiguration(development),original)
  assert.deepEqual(readBaseballCareerConfiguration(development),original)
  assert.equal(readBaseballCareerAvailability({NODE_ENV:'development'}),'development')
  assert.equal(readBaseballCareerConfiguration({NODE_ENV:'development'}),null)
  for(const missing of ['BASEBALL_PREVIEW_DATABASE_URL','BASEBALL_PREVIEW_SIGNING_SECRET','BASEBALL_PREVIEW_DATABASE_HOST']){
    const env={...development,...preview,[missing]:undefined}
    assert.equal(readBaseballCareerConfiguration(env),null)
    assert.equal(readBaseballCareerAvailability(env),'preparing')
  }
})

test('Vercel·운영 빌드·Preview·정확한 브랜치·명시 opt-in을 모두 충족해야 육성 검수를 허용한다', () => {
  const config=readBaseballCareerConfiguration(preview)
  assert.equal(config.databaseUrl,preview.BASEBALL_PREVIEW_DATABASE_URL)
  assert.equal(config.secret,preview.BASEBALL_PREVIEW_SIGNING_SECRET)
  assert.equal(config.environment,'preview')
  assert.ok(Object.isFrozen(config))
  assert.equal(readBaseballCareerAvailability(preview),'preview')
  for(const [key,value] of Object.entries({NODE_ENV:'test',VERCEL:undefined,VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'master',BASEBALL_PREVIEW_ENABLED:'false'})){
    const env={...preview,[key]:value}
    assert.equal(readBaseballCareerConfiguration(env),null,key)
    assert.equal(readBaseballCareerAvailability(env),'preparing',key)
  }
  for(const ref of ['codex/baseball-career-preview-other','Codex/baseball-career-preview','refs/heads/codex/baseball-career-preview']){
    assert.equal(readBaseballCareerConfiguration({...preview,VERCEL_GIT_COMMIT_REF:ref}),null)
  }
  assert.equal(readBaseballConfiguration(preview),null,'공통 수집 설정은 Preview에서도 닫힌다')
  assert.equal(JSON.stringify(readBaseballCareerAvailability(preview)),'"preview"','SSR에는 상태 문자열만 전달한다')
})

test('독립 host pin·제한 역할·DB·TLS·비밀값의 경계가 틀리면 연결을 거절한다', () => {
  const url=preview.BASEBALL_PREVIEW_DATABASE_URL
  const invalid=[
    {BASEBALL_PREVIEW_DATABASE_HOST:'another-database.invalid'},
    {BASEBALL_PREVIEW_DATABASE_HOST:'https://preview-database.invalid'},
    {BASEBALL_PREVIEW_DATABASE_HOST:'preview-database.invalid:5432'},
    {BASEBALL_PREVIEW_DATABASE_HOST:' preview-database.invalid'},
    {BASEBALL_PREVIEW_SIGNING_SECRET:'short'},
    {BASEBALL_PREVIEW_DATABASE_URL:url.replace('baseball_prod_runtime','baseball_prod_owner')},
    {BASEBALL_PREVIEW_DATABASE_URL:url.replace('baseball_prod_runtime','baseball_runtime')},
    {BASEBALL_PREVIEW_DATABASE_URL:url.replace('/baseball_prod?','/baseball_dev?')},
    {BASEBALL_PREVIEW_DATABASE_URL:url.replace('example-only@','@')},
    {BASEBALL_PREVIEW_DATABASE_URL:url.replace('postgresql:','https:')},
    {BASEBALL_PREVIEW_DATABASE_URL:url.replace('sslmode=require','sslmode=disable')},
    {BASEBALL_PREVIEW_DATABASE_URL:url.replace('?sslmode=require','')},
    {BASEBALL_PREVIEW_DATABASE_URL:`${url}&sslmode=disable`},
    {BASEBALL_PREVIEW_DATABASE_URL:`${url}#ignored-fragment`},
    {BASEBALL_PREVIEW_DATABASE_URL:url.replace('.invalid/', '.invalid:6543/')},
  ]
  for(const change of invalid)assert.equal(readBaseballCareerConfiguration({...preview,...change}),null)
  assert.ok(readBaseballCareerConfiguration({...preview,BASEBALL_PREVIEW_DATABASE_URL:url.replace('.invalid/', '.invalid:5432/')}))
})

test('운영 육성은 Vercel과 명시 opt-in, 독립 DB 설정을 모두 확인한다', () => {
  const config=readBaseballCareerConfiguration({...preview,...production})
  assert.deepEqual(config,{databaseUrl:production.BASEBALL_DATABASE_URL,secret:production.BASEBALL_SIGNING_SECRET,environment:'production'})
  assert.equal(readBaseballCareerAvailability(production),'production')
  const url=production.BASEBALL_DATABASE_URL
  for(const change of [
    {VERCEL:undefined}, {VERCEL_ENV:'custom'}, {BASEBALL_DATA_ENABLED:undefined}, {BASEBALL_DATA_ENABLED:'false'},
    {BASEBALL_DATABASE_URL:undefined}, {BASEBALL_PRODUCTION_DATABASE_HOST:undefined}, {BASEBALL_SIGNING_SECRET:'short'},
    {BASEBALL_DATABASE_URL:preview.BASEBALL_PREVIEW_DATABASE_URL},
    {BASEBALL_PRODUCTION_DATABASE_HOST:preview.BASEBALL_PREVIEW_DATABASE_HOST},
    {BASEBALL_DATABASE_URL:url.replace('baseball_prod_runtime','baseball_prod_owner')},
    {BASEBALL_DATABASE_URL:url.replace('/baseball_prod?','/baseball_dev?')},
    {BASEBALL_DATABASE_URL:url.replace('sslmode=require','sslmode=disable')},
  ]){
    const env={...preview,...production,...change}
    assert.equal(readBaseballCareerConfiguration(env),null)
    assert.equal(readBaseballCareerAvailability(env),'preparing')
  }
})

test('운영 144경기 결산 서버는 Host·HTTPS·쓰기 쿠키를 검사하고 콜드 GET에도 Secure 쿠키를 발급한다', async () => {
  let initialized=0
  const handler=createBaseballCareerAnnualApiHandler({env:production,now:()=>now,getStore:()=>{initialized++;throw Error('must not initialize')}})
  for(const headers of [
    {origin:'http://preview-site.invalid'},
    {origin:'https://different-site.invalid'},
    {origin:'https://preview-site.invalid','x-forwarded-proto':'http'},
    {'x-forwarded-proto':'http'},
    {origin:'https://preview-site.invalid','sec-fetch-site':'cross-site'},
  ])assert.equal((await run(handler,request({headers}))).statusCode,403)
  assert.equal((await run(handler,request({method:'POST'}))).statusCode,403)
  assert.equal((await run(handler,request({method:'POST',headers:{origin:'https://preview-site.invalid'}}))).statusCode,401)
  const bootstrap=await run(handler,request({headers:{'x-forwarded-proto':'https'}}))
  assert.equal(bootstrap.statusCode,200)
  assert.deepEqual(bootstrap.body,{status:'ok'})
  assert.match(bootstrap.headers['Set-Cookie'],/; HttpOnly; SameSite=Lax; Secure$/)
  assert.ok(readBaseballParticipant({headers:{cookie:bootstrap.headers['Set-Cookie'].split(';')[0]}},production.BASEBALL_SIGNING_SECRET,now))
  assert.equal(initialized,0)
})

test('육성 v1/v2의 콜드 GET만 익명 쿠키를 발급하며 Preview에서는 프록시 뒤에서도 항상 Secure다', async () => {
  for(const factory of factories){
    let stores=0
    const handler=factory({env:preview,now:()=>now,getStore:async config=>{
      stores++;assert.equal(config.environment,'preview')
      return {list:async()=>({status:'ok',careers:[]})}
    }})
    const res=await run(handler)
    assert.equal(res.statusCode,200)
    assert.equal(stores,1)
    assert.deepEqual(res.body,{status:'ok',careers:[]})
    assert.match(res.headers['Set-Cookie'],/; Path=\/api\/playground\/baseball; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure$/)
    assert.equal(res.headers['Set-Cookie'].includes('Domain='),false)
    const storedCookie=res.headers['Set-Cookie'].split(';')[0]
    assert.ok(readBaseballParticipant({headers:{cookie:storedCookie}},preview.BASEBALL_PREVIEW_SIGNING_SECRET,now))
    assert.equal(readBaseballParticipant({headers:{cookie:storedCookie}},development.BASEBALL_SIGNING_SECRET,now),null)
    const publicBody=JSON.stringify(res.body)
    assert.equal(publicBody.includes(preview.BASEBALL_PREVIEW_DATABASE_URL),false)
    assert.equal(publicBody.includes(preview.BASEBALL_PREVIEW_SIGNING_SECRET),false)
  }
})

test('같은 Origin과 HTTPS를 모두 요구하고 쓰기·상세 조회는 기존 쿠키 없이는 진행하지 않는다', async () => {
  const config=readBaseballCareerConfiguration(preview)
  assert.equal(hasBaseballCareerSameOrigin(request(),config),true)
  assert.equal(shouldSecureBaseballCareerCookie(request(),config),true)
  assert.equal(shouldSecureBaseballCareerCookie(request({headers:{origin:'http://preview-site.invalid'}}),readBaseballCareerConfiguration(development)),false)
  for(const factory of factories){
    let initialized=0
    const handler=factory({env:preview,getStore:()=>{initialized++;throw Error('must not initialize')}})
    for(const headers of [{origin:'http://preview-site.invalid'},{origin:'https://different-site.invalid'},{origin:'null'},{origin:'https://preview-site.invalid','sec-fetch-site':'cross-site'}]){
      assert.equal((await run(handler,request({headers}))).statusCode,403)
    }
    assert.equal((await run(handler,request({method:'POST'}))).statusCode,403)
    assert.equal((await run(handler,request({method:'POST',headers:{origin:'https://preview-site.invalid'}}))).statusCode,401)
    assert.equal((await run(handler,request({query:{id}}))).statusCode,401)
    assert.equal(initialized,0)
  }
})

test('Preview·운영의 육성 허용은 독립 10구와 한 타석 저장을 열지 않는다', async () => {
  for(const env of [preview,production])for(const factory of [createBaseballApiHandler,createBaseballAtBatApiHandler])for(const method of ['GET','POST']){
    let initialized=0
    const handler=factory({env,getStore:()=>{initialized++},getVersions:()=>{initialized++}})
    const res=await run(handler,request({method,headers:{origin:'https://preview-site.invalid'}}))
    assert.equal(res.statusCode,503)
    assert.equal(res.body.code,'not_configured')
    assert.equal(res.headers['Set-Cookie'],undefined)
    assert.equal(initialized,0)
  }
})

test('복구 API는 동일한 Preview 정책과 기존 소유자 쿠키를 사용하며 발급·조회와 코드 연결만 허용한다', async () => {
  for(const mode of ['code','redeem']){
    let initialized=0,calls=0
    const handler=createBaseballCareerRecoveryHandler({mode,env:preview,now:()=>now,getStore:async config=>{
      initialized++;assert.equal(config.environment,'preview')
      return {
        code:async(actor,careerId,version,action)=>{calls++;assert.equal(careerId,id);assert.equal(version,2);assert.equal(action,'read');return{status:'ok',state:'absent'}},
        redeem:async(actor,hash)=>{calls++;assert.match(hash,/^[a-f0-9]{64}$/);return{status:'ok',careerId:id,version:2}},
      }
    }})
    const body=mode==='code'?{careerId:id,version:2,action:'read'}:{code:'BCR1-0000-0000-0000-0000-0000-0000-0000-0000'}
    const headers={origin:'https://preview-site.invalid','content-type':'application/json'}
    const noCookie=await run(handler,request({method:'POST',headers,body}))
    assert.equal(noCookie.statusCode,401)
    assert.equal(initialized,0)
    const insecure=await run(handler,request({method:'POST',headers:{...headers,origin:'http://preview-site.invalid',cookie},body}))
    assert.equal(insecure.statusCode,403)
    const valid=await run(handler,request({method:'POST',headers:{...headers,cookie},body}))
    assert.equal(valid.statusCode,200)
    assert.equal(valid.body.careerId,id)
    assert.equal(valid.body.version,2)
    assert.equal(initialized,1)
    assert.equal(calls,1)
    assert.equal(valid.headers['Set-Cookie'],undefined)
  }
})

test('명시 허용이 없는 운영·Preview는 모든 육성·복구 경로를 저장소 접근 전에 차단한다', async () => {
  for(const env of [
    {...production,BASEBALL_DATA_ENABLED:'false'},
    {...preview,VERCEL_ENV:'production'},
    {...preview,BASEBALL_PREVIEW_ENABLED:'false'},
    {...preview,VERCEL_GIT_COMMIT_REF:'master'},
  ]){
    for(const factory of [...factories,createBaseballCareerAnnualApiHandler,dependencies=>createBaseballCareerRecoveryHandler({...dependencies,mode:'code'}),dependencies=>createBaseballCareerRecoveryHandler({...dependencies,mode:'redeem'})]){
      let initialized=0
      const handler=factory({env,getStore:()=>{initialized++},getVersions:()=>{initialized++}})
      for(const query of [{},{id},{id,atBatId:id}]){
        const res=await run(handler,request({method:'POST',query,headers:{origin:'https://preview-site.invalid'}}))
        assert.equal(res.statusCode,503)
        assert.equal(res.body.code,'not_configured')
        assert.equal(res.headers['Set-Cookie'],undefined)
      }
      assert.equal(initialized,0)
    }
  }
})
