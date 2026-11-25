import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { getBaseballSyncDiagnostic } from '../lib/playground-baseball-sync-status.mjs'

const failed = code => ({state:'ready',sync:'error',code,pending:1,saved:9,restored:10,history:[]})

test('규칙·결과·형식·충돌은네트워크오류와분리하고허용된고정코드만반환한다',()=>{
  const groups={version:['version_mismatch'],result:['result_mismatch'],format:['invalid_submission','invalid_snapshot','local_data_invalid'],
    conflict:['local_conflict','stale_revision','session_conflict'],network:['network_unavailable'],configuration:['not_configured'],
    server:['database_unavailable'],local:['storage_unavailable'],capacity:['storage_full','local_capacity'],
    'request-capacity':['body_too_large'],receipt:['invalid_response'],pitch:['invalid_pitch'],limited:['rate_limited'],verification:['verification_unavailable']}
  for(const [kind,codes] of Object.entries(groups))for(const code of codes){
    assert.deepEqual(getBaseballSyncDiagnostic(failed(code)),{code,kind})
    assert.ok(Object.isFrozen(getBaseballSyncDiagnostic(failed(code))))
  }
  assert.equal(getBaseballSyncDiagnostic({...failed('local_data_invalid'),state:'unavailable'}).kind,'format')
})

test('허용하지않은원문·객체·스택·인증문자열은진단속성으로전달하지않는다',()=>{
  for(const raw of ['Authorization: private-example','<img src=x onerror=alert(1)>','unknown_server_code',
    new Error('private-example'),{token:'private-example'},42]){
    const result=getBaseballSyncDiagnostic(failed(raw))
    assert.deepEqual(result,{code:'unknown',kind:'unknown'})
    assert.equal(JSON.stringify(result).includes('private-example'),false)
  }
  assert.deepEqual(getBaseballSyncDiagnostic(failed(null)),{code:null,kind:'unknown'})
})

test('준비·동기화중·정상과실패를구분하며원본상태나대기/완료건수를변경하지않는다',()=>{
  assert.deepEqual(getBaseballSyncDiagnostic(),{code:null,kind:'loading'})
  assert.equal(getBaseballSyncDiagnostic({...failed('version_mismatch'),state:'loading'}).kind,'loading')
  assert.equal(getBaseballSyncDiagnostic({...failed('version_mismatch'),sync:'syncing'}).kind,'syncing')
  assert.equal(getBaseballSyncDiagnostic({state:'ready',sync:'idle',code:null}).kind,'ready')
  assert.equal(getBaseballSyncDiagnostic({state:'capacity',sync:'idle'}).kind,'capacity')
  const source=failed('result_mismatch'),before=structuredClone(source)
  getBaseballSyncDiagnostic(source)
  assert.deepEqual(source,before)
})

test('실제한영검수UI는안전한코드와보존사유를표시하고원문오류는노출하지않는다',async()=>{
  const require=createRequire(import.meta.url),React=require('react')
  const {renderToStaticMarkup}=require('react-dom/server'),{loadBindings,transform}=require('next/dist/build/swc')
  await loadBindings()
  const url=new URL('../components/playground/baseball-data-review.js',import.meta.url)
  const source=await fs.readFile(url,'utf8'),compiled=await transform(source,{filename:fileURLToPath(url),
    jsc:{parser:{syntax:'ecmascript',jsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}})
  const targetModule={exports:{}}
  vm.runInNewContext(compiled.code,{module:targetModule,exports:targetModule.exports,process:{env:{NODE_ENV:'development'}},
    require:name=>name.includes('playground-baseball-sync-status')?{getBaseballSyncDiagnostic}
      :name.startsWith('react')?require(name):{__esModule:true,default:{}}})
  const View=targetModule.exports.default
  let inspections=0
  const onInspectPending=()=>{inspections++;return Promise.resolve({code:null,entries:[]})}
  for(const [locale,needle] of [['ko','규칙·엔진 버전'],['en','rules and engine version']]){
    const html=renderToStaticMarkup(React.createElement(View,{locale,persistence:failed('version_mismatch'),onInspectPending}))
    assert.ok(html.includes('data-sync-code="version_mismatch"'))
    assert.ok(html.includes('data-sync-kind="version"'))
    assert.ok(html.includes(needle))
    assert.ok(html.includes('data-pending="1"')&&html.includes('data-saved="9"'))
    assert.equal(html.includes('data-baseball-pending-records'),false)
  }
  const unknown=renderToStaticMarkup(React.createElement(View,{locale:'ko',persistence:failed('private-example')}))
  assert.ok(unknown.includes('data-sync-code="unknown"'))
  assert.equal(unknown.includes('private-example'),false)
  assert.equal(inspections,0)
})
