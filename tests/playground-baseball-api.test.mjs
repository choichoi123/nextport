import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createBaseballDataCollector } from '../lib/playground-baseball-data.mjs'
import { BASEBALL_RULES, createBaseballPitch, getBaseballPitchSpeed, judgeBaseballSwing, judgeBaseballSwingLegacyV1, judgeBaseballTake } from '../lib/playground-baseball.mjs'
import { canonicalBaseballVersionJson, hashBaseballVersionContent, createBaseballDataVersions } from '../lib/server/baseball-version.mjs'
import { createBaseballApiHandler, verifyBaseballSubmission, BASEBALL_MAX_BODY_BYTES } from '../lib/server/baseball-api.mjs'
import { createBaseballParticipant, readBaseballParticipant, hasBaseballSameOrigin, BASEBALL_COOKIE_NAME } from '../lib/server/baseball-auth.mjs'
import { readBaseballConfiguration, createBaseballStore } from '../lib/server/baseball-db.mjs'

const versions = await createBaseballDataVersions()
const clone = value => JSON.parse(JSON.stringify(value))
const env = { NODE_ENV:'development', BASEBALL_DATA_ENABLED:'true', BASEBALL_DATABASE_URL:'postgresql://baseball_runtime:example-only@database.invalid/baseball_dev', BASEBALL_SIGNING_SECRET:'development-test-only-secret-value-1234567890' }
const environment = { viewportBucket:'compact', orientation:'portrait', focusEnabled:true, locale:'ko' }
const center = { x:0, y:(BASEBALL_RULES.zone.bottom + BASEBALL_RULES.zone.top) / 2 }
let sequence = 0
function legacyVersions() {
  const value = clone(versions)
  value.engine = { algorithm:'sha256', hash:'9ce1dd986b9d3f00bbc3c42ee89c346bd87ecead5d760eb5e4fc8063f2874f32',
    files:[{ path:'lib/playground-baseball.mjs', hash:'d095122187b7f637b4f547e9817ab2bfdbc6eefb6bc98556b855d13e537939f4' }] }
  value.rules.id = 'baseball-fixed-center-8cm-v1'
  value.rules.snapshot.rules.batActiveStartMs = 20
  value.rules.hash = 'f058ccdf82c8cd06f458421a2de09e5a03d0444f9d817cc82465193f70c095c5'
  return value
}
function submission({ swing = true, completed = true, pitchType = 'four-seam', handedness = 'right', legacy = false, swingElapsedMs = BASEBALL_RULES.swingContactMs } = {}) {
  const collector = createBaseballDataCollector({ versions:legacy ? legacyVersions() : versions, idFactory:() => `00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}` })
  collector.startSession({ handedness, mode:'practice', environment })
  const speedKmh = { 'four-seam':120, slider:106, curveball:90, changeup:98 }[pitchType]
  const pitch = createBaseballPitch({ seed:14, speedKmh, pitchType, target:center })
  collector.startAttempt({ pitch, pitchNumber:1, baseSpeedKmh:120, firstCenterPitch:true, environment })
  const swingAtMs = pitch.flightTimeMs - swingElapsedMs
  if (swing) collector.recordSwing({ swingAtMs, aim:center, input:{ source:'pointer', surface:'focus', pointerType:'touch', code:null } })
  if (completed) collector.completeAttempt({ result:swing ? (legacy ? judgeBaseballSwingLegacyV1 : judgeBaseballSwing)(pitch,{ swingAtMs,aim:center,handedness }) : judgeBaseballTake(pitch) })
  return { revision:1, snapshot:collector.snapshot() }
}
function request(overrides = {}) {
  return { method:'POST', headers:{ host:'localhost:3031', origin:'http://localhost:3031', 'content-type':'application/json', 'sec-fetch-site':'same-origin' }, body:submission(), ...overrides }
}
function response() {
  return { statusCode:200, headers:{}, setHeader(name,value){ this.headers[name]=value }, status(value){ this.statusCode=value; return this }, json(value){ this.body=value; return this } }
}
function setup({ store:overrideStore, ...overrides } = {}) {
  const calls=[]
  const store = overrideStore || {
    async savePractice(...args) { calls.push(args); const session=args[4].sessions[0];return { status:'stored',sessionId:args[1],revision:args[2],completed:session.attempts.filter(x=>x.state==='completed').length,aborted:session.attempts.filter(x=>x.state==='aborted').length,serverComputed:true,ownerHash:'must-not-escape' } },
    async practices(owner) { calls.push(owner);return { status:'ok',practices:[] } },
  }
  const handler = createBaseballApiHandler({ env, store, getVersions:async()=>versions, ...overrides })
  const run = async req => { const res=response(); await handler(req,res);return res }
  return { run,calls }
}

test('개발 전용 설정은 야구 runtime/DB만 허용하고 운영·달리기·소유자 연결을 거절한다',()=>{
  assert.ok(readBaseballConfiguration(env))
  for (const changed of [{NODE_ENV:'production'},{NODE_ENV:'test'},{BASEBALL_DATA_ENABLED:'false'},{BASEBALL_SIGNING_SECRET:'short'},
    {BASEBALL_DATABASE_URL:env.BASEBALL_DATABASE_URL.replace('baseball_runtime','neondb_owner')},
    {BASEBALL_DATABASE_URL:env.BASEBALL_DATABASE_URL.replace('baseball_dev','neondb')},
    {BASEBALL_DATABASE_URL:''}]) assert.equal(readBaseballConfiguration({...env,...changed}),null)
})

test('30일 야구 서명 쿠키는 범위/보호 속성을 가지며 달리기 쿠키와 공유하지 않는다',()=>{
  const now=Date.UTC(2026,10,24), participant=createBaseballParticipant(env.BASEBALL_SIGNING_SECRET,{now,secure:true})
  const pair=participant.cookie.split(';')[0]
  assert.equal(BASEBALL_COOKIE_NAME,'baseball_participant')
  assert.match(participant.cookie,/Path=\/api\/playground\/baseball; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure$/)
  assert.deepEqual(readBaseballParticipant({headers:{cookie:pair}},env.BASEBALL_SIGNING_SECRET,now),{hash:participant.hash})
  assert.equal(readBaseballParticipant({headers:{cookie:pair}},env.BASEBALL_SIGNING_SECRET,now+2592000000),null)
  assert.equal(readBaseballParticipant({headers:{cookie:pair.replace('v1.','v2.')}},env.BASEBALL_SIGNING_SECRET,now),null)
  assert.equal(readBaseballParticipant({headers:{cookie:`${pair}; ${pair}`}},env.BASEBALL_SIGNING_SECRET,now),null)
  assert.equal(readBaseballParticipant({headers:{cookie:pair.replace(BASEBALL_COOKIE_NAME,'sprint_participant')}},env.BASEBALL_SIGNING_SECRET,now),null)
})

test('localhost와 같은 host의 LAN origin만 허용하고 cross-site/잘못된 origin을 거절한다',()=>{
  assert.equal(hasBaseballSameOrigin(request()),true)
  assert.equal(hasBaseballSameOrigin(request({headers:{host:'192.168.168.154:3031',origin:'http://192.168.168.154:3031'}})),true)
  for(const headers of [{host:'localhost:3031',origin:'http://localhost:3032'},{host:'localhost:3031',origin:'null'},
    {host:'localhost:3031',origin:'http://localhost:3031/path'},{host:'localhost:3031'},
    {host:'localhost:3031',origin:'http://localhost:3031','sec-fetch-site':'cross-site'}]) assert.equal(hasBaseballSameOrigin(request({headers})),false)
  assert.equal(hasBaseballSameOrigin(request({method:'GET',headers:{host:'localhost:3031'}})),true)
})

test('4구종 양타·스윙/무스윙 결과는 현재 엔진에서 재구성하고 원본을 변형하지 않는다',()=>{
  for(const pitchType of ['four-seam','slider','curveball','changeup']) for(const handedness of ['left','right']) for(const swing of [false,true]) {
    const body=submission({pitchType,handedness,swing}), before=clone(body), checked=verifyBaseballSubmission(body,versions)
    assert.equal(checked.valid,true);assert.deepEqual(body,before)
    assert.deepEqual(checked.snapshot,body.snapshot)
    assert.match(checked.hash,/^[a-f0-9]{64}$/)
  }
})

test('준비/진행 시도도 그대로 보관하며 미완료를 헛스윙·서버 발급 시도로 바꾸지 않는다',()=>{
  const body=submission({completed:false}), checked=verifyBaseballSubmission(body,versions)
  assert.equal(checked.valid,true)
  assert.equal(checked.snapshot.sessions[0].attempts[0].state,'started')
  assert.equal(checked.snapshot.sessions[0].attempts[0].result,null)
  assert.equal(Object.hasOwn(checked.snapshot,'serverIssued'),false)
})

test('확정된 v1의 초반 헛스윙과 v2의 초반 파울을 각 규칙대로 재검증하고 원본을 보존한다',()=>{
  const oldBody = submission({ legacy:true, swingElapsedMs:8.85 }), newBody = submission({ swingElapsedMs:8.85 })
  const before = clone(oldBody)
  assert.equal(oldBody.snapshot.sessions[0].attempts[0].result.outcome, 'miss')
  assert.equal(newBody.snapshot.sessions[0].attempts[0].result.outcome, 'foul')
  assert.equal(verifyBaseballSubmission(oldBody, versions).valid, true)
  assert.equal(verifyBaseballSubmission(newBody, versions).valid, true)
  assert.deepEqual(oldBody, before)
  for (const pitchType of ['four-seam','slider','curveball','changeup']) for (const handedness of ['left','right']) {
    assert.equal(verifyBaseballSubmission(submission({ legacy:true, pitchType, handedness, swing:false }), versions).valid, true)
    assert.equal(verifyBaseballSubmission(submission({ legacy:true, pitchType, handedness, completed:false }), versions).valid, true)
  }
})

test('구버전의 결과를 새 파울로 바꾸거나 버전·정책을 클라이언트가 선택하면 거절한다',()=>{
  const changedResult = submission({ legacy:true, swingElapsedMs:8.85 })
  const attempt = changedResult.snapshot.sessions[0].attempts[0]
  attempt.result = clone(judgeBaseballSwing(attempt.pitch, { swingAtMs:attempt.swingAtMs, aim:attempt.aim, handedness:'right' }))
  assert.deepEqual(verifyBaseballSubmission(changedResult, versions), { valid:false, code:'result_mismatch' })
  const changedEngine = submission({ legacy:true }); changedEngine.snapshot.sessions[0].versions.engine.hash = 'f'.repeat(64)
  assert.deepEqual(verifyBaseballSubmission(changedEngine, versions), { valid:false, code:'version_mismatch' })
  const changedFile = submission({ legacy:true }); changedFile.snapshot.sessions[0].versions.engine.files[0].hash = 'f'.repeat(64)
  assert.deepEqual(verifyBaseballSubmission(changedFile, versions), { valid:false, code:'version_mismatch' })
  const policy = { ...submission({ legacy:true }), batActiveStartMs:0 }
  assert.deepEqual(verifyBaseballSubmission(policy, versions), { valid:false, code:'invalid_submission' })
  const nextEngine = clone(versions); nextEngine.engine.hash = 'f'.repeat(64)
  assert.deepEqual(verifyBaseballSubmission(submission({ legacy:true }), nextEngine), { valid:false, code:'version_mismatch' })
})

test('이전 20ms 엔진의 4구종·양타·시간 경계·무스윙 56개 골든 결과를 보존한다',()=>{
  // Captured from the pinned v1 source before the 0ms change. This fixture has
  // synthetic pitches only and no browser, user, database or participant IDs.
  const results=[]
  for (const type of ['four-seam','slider','curveball','changeup']) for (const handedness of ['left','right']) {
    const pitch = createBaseballPitch({ seed:14, speedKmh:getBaseballPitchSpeed(120,type), target:center, pitchType:type })
    for (const elapsed of [8.85,20,110,150,210,210.001]) results.push({ type, handedness, elapsed,
      result:judgeBaseballSwingLegacyV1(pitch,{ swingAtMs:pitch.flightTimeMs-elapsed, aim:center, handedness }) })
    results.push({ type, handedness, take:judgeBaseballTake(pitch) })
  }
  assert.equal(results.length,56)
  assert.equal(hashBaseballVersionContent(canonicalBaseballVersionJson(results)), 'af360904411bea11fdab5646badfb5d6b36fcd667c2b050dcc845024d54c366e')
})

test('v1 대기 기록과 새 v2 기록은 같은 API에서 원래 결과와 영수증으로 저장한다',async()=>{
  const { run,calls } = setup()
  const oldBody = submission({ legacy:true, swingElapsedMs:8.85 })
  oldBody.revision = 7
  const oldResponse = await run(request({ body:oldBody }))
  assert.equal(oldResponse.statusCode,200)
  assert.equal(oldResponse.body.revision,7)
  assert.equal(calls[0][4].sessions[0].versions.rules.id,'baseball-fixed-center-8cm-v1')
  assert.equal(calls[0][4].sessions[0].attempts[0].result.outcome,'miss')
  const newResponse = await run(request({ body:submission({ swingElapsedMs:8.85 }) }))
  assert.equal(newResponse.statusCode,200)
  assert.equal(calls[1][4].sessions[0].versions.rules.id,'baseball-fixed-center-8cm-v2')
  assert.equal(calls[1][4].sessions[0].attempts[0].result.outcome,'foul')
})

test('점수/투구 물리/규칙/엔진 조작과 허용하지 않은 개인정보 필드는 거절한다',()=>{
  const cases=[]
  let body=submission();body.snapshot.sessions[0].attempts[0].result.score=99;cases.push([body,'result_mismatch'])
  body=submission();body.snapshot.sessions[0].attempts[0].pitch.velocity.x+=.01;cases.push([body,'invalid_pitch'])
  body=submission();body.snapshot.sessions[0].versions.rules.snapshot.rules.gravityMps2+=1;cases.push([body,'version_mismatch'])
  body=submission();body.snapshot.sessions[0].versions.engine.hash='f'.repeat(64);cases.push([body,'version_mismatch'])
  body=submission();body.snapshot.sessions[0].playerName='not collected';cases.push([body,'invalid_submission'])
  body=submission();body.snapshot.sessions[0].attempts[0].ip='127.0.0.1';cases.push([body,'invalid_submission'])
  body=submission();body.ownerHash='client cannot pick owner';cases.push([body,'invalid_submission'])
  for(const [value,code] of cases) assert.deepEqual(verifyBaseballSubmission(value,versions),{valid:false,code})
})

test('schema/revision/여러 세션·지문 해시 정합을 검사한다',()=>{
  for(const revision of [0,-1,1.2,1000001,'1',null]) assert.equal(verifyBaseballSubmission({...submission(),revision},versions).valid,false)
  const body=submission();body.snapshot.sessions.push(clone(body.snapshot.sessions[0]));assert.equal(verifyBaseballSubmission(body,versions).valid,false)
  const altered=submission();altered.snapshot.sessions[0].versions.presentation.hash='f'.repeat(64)
  assert.deepEqual(verifyBaseballSubmission(altered,versions),{valid:false,code:'version_mismatch'})
})

test('POST 성공은 재계산된 자료/쿠키 소유자를 저장하고 안전한 영수증만 반환한다',async()=>{
  const {run,calls}=setup(), req=request(), res=await run(req)
  assert.equal(res.statusCode,200);assert.equal(res.body.status,'stored');assert.equal(res.body.serverComputed,true)
  assert.equal(calls.length,1);assert.deepEqual(calls[0][4],req.body.snapshot)
  assert.deepEqual(Object.keys(res.body).sort(),['status','sessionId','revision','completed','aborted','serverComputed'].sort())
  const cookie=res.headers['Set-Cookie'].split(';')[0]
  assert.equal(readBaseballParticipant({headers:{cookie}},env.BASEBALL_SIGNING_SECRET).hash,calls[0][0])
  assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['X-Content-Type-Options'],'nosniff')
  assert.equal(JSON.stringify(res.body).includes('ownerHash'),false)
})

test('정상 재시도는 동일 쿠키 소유자를 사용하고 요청 본문의 소유자 주입은 저장하지 않는다',async()=>{
  const {run,calls}=setup(), req=request(), first=await run(req), cookie=first.headers['Set-Cookie'].split(';')[0]
  const second=await run({...req,headers:{...req.headers,cookie}})
  assert.equal(second.statusCode,200);assert.equal(second.headers['Set-Cookie'],undefined)
  assert.equal(calls[0][0],calls[1][0])
  const changed=await run({...req,body:{...req.body,owner:'foreign'}})
  assert.equal(changed.statusCode,400);assert.equal(calls.length,2)
})

test('GET는 현재 소유자 요약만 반환하고 내부/원본 필드는 출력하지 않는다',async()=>{
  const body=submission(), id=body.snapshot.sessions[0].sessionId
  const {run}=setup({store:{practices:async()=>({status:'ok',practices:[{sessionId:id,revision:1,status:'active',completed:1,aborted:0,swings:1,receivedAt:'2026-11-24T09:00:00.000Z',serverComputed:true,owner_hash:'private',snapshot:body.snapshot}]})}})
  const res=await run(request({method:'GET',body:undefined,headers:{host:'localhost:3031'}}))
  assert.equal(res.statusCode,200);assert.equal(res.body.practices.length,1)
  assert.equal(Object.hasOwn(res.body.practices[0],'snapshot'),false)
  assert.equal(Object.hasOwn(res.body.practices[0],'owner_hash'),false)
  assert.ok(res.headers['Set-Cookie'])
})

test('유효한 기존 쿠키의 GET는 같은 소유자를 재사용하고 쿠키를 불필요하게 회전하지 않는다',async()=>{
  const participant=createBaseballParticipant(env.BASEBALL_SIGNING_SECRET)
  const cookie=participant.cookie.split(';')[0], {run,calls}=setup()
  const res=await run(request({method:'GET',body:undefined,headers:{host:'localhost:3031',cookie}}))
  assert.equal(res.statusCode,200)
  assert.deepEqual(res.body,{status:'ok',practices:[]})
  assert.equal(res.headers['Set-Cookie'],undefined)
  assert.deepEqual(calls,[participant.hash])
})

test('설정 누락·Production·지원하지 않는 메서드는 DB나 새 쿠키를 사용하지 않는다',async()=>{
  for(const setting of [{...env,NODE_ENV:'production'},{...env,BASEBALL_DATA_ENABLED:'false'},{}]) {
    const {run,calls}=setup({env:setting}), res=await run(request())
    assert.equal(res.statusCode,503);assert.equal(res.body.code,'not_configured');assert.equal(calls.length,0);assert.equal(res.headers['Set-Cookie'],undefined)
  }
  const {run,calls}=setup(), res=await run(request({method:'DELETE'}))
  assert.equal(res.statusCode,405);assert.equal(res.headers.Allow,'GET, POST');assert.equal(calls.length,0)
})

test('본문 크기·형식·스트림 JSON 오류와 origin 실패를 일관된 응답으로 거절한다',async()=>{
  const {run,calls}=setup()
  const requests=[request({headers:{host:'localhost:3031',origin:'http://foreign.invalid','content-type':'application/json'}}),
    request({headers:{host:'localhost:3031',origin:'http://localhost:3031','content-type':'text/plain'}}),
    request({body:{x:'a'.repeat(BASEBALL_MAX_BODY_BYTES)}})]
  const statuses=[403,415,413]
  for(let i=0;i<requests.length;i++) assert.equal((await run(requests[i])).statusCode,statuses[i])
  const stream=Readable.from(['{"broken":'])
  Object.assign(stream,{method:'POST',headers:request().headers})
  const malformed=await run(stream);assert.equal(malformed.statusCode,400);assert.equal(calls.length,0)
})

test('충돌·요청 제한·DB 오류는 정확한 코드로 알리고 비밀/SQL/쿠키를 내보내지 않는다',async()=>{
  for(const code of ['stale_revision','session_conflict','rate_limited']) {
    const {run}=setup({store:{savePractice:async()=>({status:'error',code})}}), res=await run(request())
    assert.equal(res.statusCode,code==='rate_limited'?429:409);assert.equal(res.body.code,code)
    if(code==='rate_limited') assert.equal(res.headers['Retry-After'],'60')
    assert.equal(res.headers['Set-Cookie'],undefined)
  }
  const {run}=setup({store:{savePractice:async()=>{throw Error(`${env.BASEBALL_DATABASE_URL} SELECT private; ${env.BASEBALL_SIGNING_SECRET}`)}}})
  const res=await run(request());assert.equal(res.statusCode,503)
  assert.deepEqual(res.body,{status:'unavailable',code:'database_unavailable'})
})

test('잘못된 DB 영수증/조회 형식은 성공으로 표시하지 않는다',async()=>{
  const {run}=setup({store:{savePractice:async()=>({status:'stored',sessionId:'different',revision:1,completed:1,aborted:0,serverComputed:true})}})
  assert.equal((await run(request())).statusCode,503)
  const malformed=setup({store:{practices:async()=>({status:'ok',practices:[{owner_hash:'private'}]})}})
  assert.equal((await malformed.run(request({method:'GET',body:undefined}))).statusCode,503)
})

test('DB 어댑터는 고정 RPC와 매개변수만 사용한다',async()=>{
  const calls=[], store=createBaseballStore({query:async(query,values)=>{calls.push({query,values});return [{result:{status:'ok'}}]}})
  const body=submission();await store.savePractice('a'.repeat(64),body.snapshot.sessions[0].sessionId,1,'b'.repeat(64),body.snapshot);await store.practices('a'.repeat(64))
  assert.match(calls[0].query,/baseball_private\.baseball_save_practice\(\$1, \$2::uuid/)
  assert.match(calls[1].query,/baseball_private\.baseball_get_practices\(\$1\)/)
  assert.equal(calls[0].query.includes('sprint'),false)
  assert.deepEqual(JSON.parse(calls[0].values[4]),body.snapshot)
})
