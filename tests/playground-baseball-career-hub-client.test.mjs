import test from 'node:test'
import assert from 'node:assert/strict'
import {openBaseballCareerHubClient} from '../lib/playground-baseball-career-hub-client.mjs'
import {BASEBALL_REGULAR_SEASON_ID} from '../lib/playground-baseball-career-schedule.mjs'
const A='10000000-0000-4000-8000-000000000001',B='20000000-0000-4000-8000-000000000002'
function fixture(id,version,{code=null}={}){
  const calls=[],state={entries:[{id,checkpoint:{id,schemaVersion:version}}],history:[],busy:false,code}
  let notify=()=>{}
  const client={snapshot:()=>state,refresh:async()=>{calls.push('refresh');notify(state);if(state.code)throw Object.assign(new Error(),{code:state.code});return state},
    create:async()=>{calls.push('create');return {schemaVersion:version}},read:async value=>{calls.push(['read',value]);return {career:{id:value,schemaVersion:version},pending:null}},
    command:async(...args)=>{calls.push(['command',...args]);return version},retry:async()=>version,adoptLatest:async()=>version,atBatAdapter:async()=>version,close:()=>calls.push('close')}
  return {calls,state,client,open:async({onChange})=>{notify=onChange;onChange(state);return client}}
}
test('새 선수는v2로 만들고 기존v1 진행과 어댑터는v1 클라이언트에만 보낸다',async()=>{
  const old=fixture(A,1),current=fixture(B,2)
  const hub=await openBaseballCareerHubClient({openLegacy:old.open,openCurrent:current.open})
  assert.equal((await hub.create()).schemaVersion,2)
  assert.equal(await hub.command(A,{type:'prepare'}),1)
  assert.equal(await hub.atBatAdapter(A,'child',{}),1)
  assert.equal(await hub.command(B,{type:'prepare'}),2)
  assert.deepEqual(hub.snapshot().entries.map(e=>e.rulesVersion),[1,2])
  assert.equal(old.calls.includes('create'),false);hub.close()
})
test('복구한 규칙 버전으로만 읽고 기존 저널은 변경하지 않는다',async()=>{
  const old=fixture(A,1),current=fixture(B,2),before=structuredClone(old.state)
  const hub=await openBaseballCareerHubClient({openLegacy:old.open,openCurrent:current.open})
  const restored=await hub.readRecovered('30000000-0000-4000-8000-000000000003',2)
  assert.equal(restored.career.schemaVersion,2);assert.deepEqual(old.state,before)
  assert.equal(old.calls.some(x=>Array.isArray(x)&&x[0]==='read'),false)
  assert.equal(await hub.retry(A),1);hub.close()
})
test('다른 버전의 연결 실패를 구분하고 연결된v2의 새 선수 생성은 유지한다',async()=>{
  const old=fixture(A,1,{code:'database_unavailable'}),current=fixture(B,2)
  const hub=await openBaseballCareerHubClient({openLegacy:old.open,openCurrent:current.open})
  await hub.refresh();assert.equal(hub.snapshot().code,null)
  assert.equal(hub.snapshot().versionErrors[1],'database_unavailable')
  assert.equal((await hub.create()).schemaVersion,2);hub.close()
})
test('두 버전에 같은ID가 있으면 다른 규칙으로 요청하지 않고 충돌로 처리한다',async()=>{
  const old=fixture(A,1),current=fixture(A,2)
  const hub=await openBaseballCareerHubClient({openLegacy:old.open,openCurrent:current.open})
  assert.equal(hub.snapshot().code,'local_conflict')
  assert.throws(()=>hub.command(A,{}),{code:'local_conflict'})
  assert.equal(old.calls.some(x=>Array.isArray(x)&&x[0]==='command'),false)
  assert.equal(current.calls.some(x=>Array.isArray(x)&&x[0]==='command'),false);hub.close()
})

test('시즌 선수는 목록 초기화와 이어하기에서 서버 클라이언트를 호출하지 않는다',async()=>{
  const old=fixture(A,1),current=fixture(B,2),annual=fixture(B,2)
  annual.state.entries[0].annual=true
  const hub=await openBaseballCareerHubClient({openLegacy:old.open,openCurrent:current.open,openAnnual:annual.open})
  assert.deepEqual(old.calls,[])
  assert.deepEqual(current.calls,[])
  assert.equal(hub.snapshot().activeVersion,'annual')
  assert.equal(hub.snapshot().entries.find(row=>row.id===B).annual,true)
  await hub.create()
  await hub.read(B)
  assert.deepEqual(annual.calls,['create',['read',B]])
  assert.deepEqual(current.calls,[])
  await hub.refresh()
  assert.deepEqual(old.calls,['refresh'])
  assert.deepEqual(current.calls,['refresh'])
  hub.close()
})

test('동일 ID의 로컬 세이브가 있어도 복구 코드는 서버 시즌의 최신 결산을 재조회한다',async()=>{
  const old=fixture(A,1),current=fixture(B,2),annual=fixture(B,2)
  annual.state.entries[0].annual=true
  current.client.read=async id=>{
    current.calls.push(['read',id])
    return {career:{id,schemaVersion:2,scheduleId:BASEBALL_REGULAR_SEASON_ID,status:'complete'},pending:null}
  }
  annual.client.loadHistory=async id=>{annual.calls.push(['history',id]);return {finish:'retired'}}
  const hub=await openBaseballCareerHubClient({openLegacy:old.open,openCurrent:current.open,openAnnual:annual.open})
  await hub.read(B)
  assert.deepEqual(annual.calls,[['read',B]])
  assert.deepEqual(current.calls,[])
  await hub.readRecovered(B,2)
  assert.deepEqual(current.calls,[['read',B]])
  assert.deepEqual(annual.calls,[['read',B],['history',B]])
  assert.equal(hub.snapshot().entries.find(row=>row.id===B).annual,true)
  hub.close()
})

test('시리즈 빠른 진행은 브라우저 시즌 선수만 사용한다',async()=>{
  const old=fixture(A,1),current=fixture(B,2),annual=fixture(B,2)
  annual.state.entries[0].annual=true
  annual.client.advance=async(id,scope)=>{annual.calls.push(['advance',id,scope]);return {id}}
  const hub=await openBaseballCareerHubClient({openLegacy:old.open,openCurrent:current.open,openAnnual:annual.open})
  assert.deepEqual(await hub.advance(B,'series'),{id:B})
  assert.deepEqual(annual.calls,[['advance',B,'series']])
  assert.throws(()=>hub.advance(A,'series'),{code:'invalid_command'})
  assert.deepEqual(current.calls,[])
  assert.deepEqual(old.calls,[])
  hub.close()
})

test('겨울 계획·다음 시즌 시작·이전 버전 호환 설정은 브라우저 시즌 클라이언트로 전달한다',async()=>{
  const old=fixture(A,1),current=fixture(B,2),annual=fixture(B,2)
  const versions={careerHash:'current'},priorAnnualVersions={careerHash:'previous'}
  const plan={version:1,direction:'power'}
  annual.state.entries[0].annual=true
  annual.client.readWinterDraft=async id=>{annual.calls.push(['readWinterDraft',id]);return plan}
  annual.client.saveWinterDraft=async (id,value)=>{annual.calls.push(['saveWinterDraft',id,value]);return value}
  annual.client.startNextSeason=async (id,value)=>{annual.calls.push(['startNextSeason',id,value]);return {id}}
  const hub=await openBaseballCareerHubClient({openLegacy:old.open,openCurrent:current.open,annualVersions:versions,priorAnnualVersions,
    openAnnual:async options=>{
      assert.equal(options.versions,versions)
      assert.equal(options.priorAnnualVersions,priorAnnualVersions)
      return annual.open(options)
    }})
  assert.deepEqual(await hub.saveWinterDraft(B,plan),plan)
  assert.deepEqual(await hub.readWinterDraft(B),plan)
  assert.deepEqual(await hub.startNextSeason(B,plan),{id:B})
  assert.deepEqual(annual.calls,[['saveWinterDraft',B,plan],['readWinterDraft',B],['startNextSeason',B,plan]])
  assert.deepEqual(current.calls,[])
  assert.deepEqual(old.calls,[])
  hub.close()
})

test('10년차 결산의 선택과 재시도는 시즌 클라이언트로 전달한다',async()=>{
  const old=fixture(A,1),current=fixture(B,2),annual=fixture(B,2)
  annual.state.entries[0].annual=true
  annual.client.settle=async(id,finish)=>{annual.calls.push(['settle',id,finish]);return {id,finish}}
  const hub=await openBaseballCareerHubClient({openLegacy:old.open,openCurrent:current.open,openAnnual:annual.open})
  assert.deepEqual(await hub.settle(B,'retired'),{id:B,finish:'retired'})
  assert.deepEqual(await hub.settle(B),{id:B,finish:undefined})
  assert.deepEqual(annual.calls,[['settle',B,'retired'],['settle',B,undefined]])
  assert.deepEqual(current.calls,[])
  assert.deepEqual(old.calls,[])
  hub.close()
})
