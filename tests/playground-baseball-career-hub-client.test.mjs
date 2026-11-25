import test from 'node:test'
import assert from 'node:assert/strict'
import {openBaseballCareerHubClient} from '../lib/playground-baseball-career-hub-client.mjs'
const A='10000000-0000-4000-8000-000000000001',B='20000000-0000-4000-8000-000000000002'
function fixture(id,version,{code=null}={}){
  const calls=[],state={entries:[{id,checkpoint:{id,schemaVersion:version}}],history:[],busy:false,code}
  let notify=()=>{}
  const client={snapshot:()=>state,refresh:async()=>{calls.push('refresh');notify(state);if(state.code)throw Object.assign(new Error(),{code:state.code});return state},
    create:async()=>{calls.push('create');return {schemaVersion:version}},read:async value=>{calls.push(['read',value]);return {career:{id:value,schemaVersion:version},pending:null}},
    command:async(...args)=>{calls.push(['command',...args]);return version},retry:async()=>version,adoptLatest:async()=>version,atBatAdapter:async()=>version,close:()=>calls.push('close')}
  return {calls,state,open:async({onChange})=>{notify=onChange;onChange(state);return client}}
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
