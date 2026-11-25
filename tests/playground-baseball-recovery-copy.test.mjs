import test from 'node:test'
import assert from 'node:assert/strict'
import {copyBaseballRecoveryCode} from '../lib/playground-baseball-recovery-copy.mjs'
const CODE='BCR1-TEST-ONLY-NOT-A-REAL-RECOVERY-CODE'
test('명시한 코드만 복사하며 기존 클립보드 내용은 읽지 않는다',async()=>{
  const writes=[]
  assert.equal(await copyBaseballRecoveryCode(CODE,{clipboard:{writeText:async value=>writes.push(value)},document:null}),true)
  assert.deepEqual(writes,[CODE])
})
test('LAN과 권한 거절에서는 임시 입력란으로 복사한 뒤 정리하고 포커스를 돌려준다',async()=>{
  const events=[],field={value:'',setAttribute(){},style:{},select(){events.push('select')},remove(){events.push('remove')}}
  const doc={activeElement:{focus(){events.push('focus')}},createElement:()=>field,body:{appendChild(){events.push('append')}},execCommand:command=>{events.push(command);return true}}
  assert.equal(await copyBaseballRecoveryCode(CODE,{clipboard:{writeText:async()=>{throw Error('denied')}},document:doc}),true)
  assert.equal(field.value,CODE);assert.deepEqual(events,['append','select','copy','remove','focus'])
})
test('미지원과 실패를 복사 성공으로 표시하지 않고 잘못된 입력은 복사하지 않는다',async()=>{
  assert.equal(await copyBaseballRecoveryCode(CODE,{clipboard:null,document:null}),false)
  let writes=0
  for(const bad of ['',null,'a\nb','x'.repeat(129)])assert.equal(await copyBaseballRecoveryCode(bad,{clipboard:{writeText:()=>{writes++}}}),false)
  assert.equal(writes,0)
})
