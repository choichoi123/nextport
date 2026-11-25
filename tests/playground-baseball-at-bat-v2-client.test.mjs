import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaseballCareerSave, applyBaseballCareerCommand, createBaseballCareerManualAtBat } from '../lib/playground-baseball-career-v2.mjs'
import { publicBaseballAtBatSession } from '../lib/playground-baseball-at-bat-session-v2.mjs'
import { createBaseballAtBatTransport, validBaseballAtBatCheckpoint, validBaseballAtBatJournal,
  BASEBALL_AT_BAT_JOURNAL_DATABASE } from '../lib/playground-baseball-at-bat-v2-client.mjs'
import { BASEBALL_CAREER_JOURNAL_DATABASE } from '../lib/playground-baseball-career-v2-client.mjs'

const clone=value=>JSON.parse(JSON.stringify(value))
const id='70000000-0000-4000-8000-000000000001',childId='70000000-0000-4000-8000-000000000002'
const at='2026-11-25T09:00:00.000Z'
const versions=Object.fromEntries(['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','careerHash','growthHash'].map(key=>[key,'a'.repeat(64)]))
function checkpoint(){
  let career=createBaseballCareerSave({id,profile:{name:'새 성장',jerseyNumber:'07',teamId:'wiz',handedness:'left'},seed:23,versions,now:at})
  career=applyBaseballCareerCommand(career,{type:'prepare',choice:'mit',commandId:childId,expectedRevision:1},{now:at})
  return publicBaseballAtBatSession(createBaseballCareerManualAtBat(career,{id:childId,seed:24,now:at}))
}

test('v2 checkpoint requires matching authoritative growth and exact v2 policies',()=>{
  const value=checkpoint();assert.equal(validBaseballAtBatCheckpoint(value),true)
  for(const change of [copy=>{copy.schemaVersion=1},copy=>{delete copy.growthSnapshot},copy=>{copy.state.growthSnapshot.mit=100},
    copy=>{delete copy.versions.growthHash},copy=>{copy.versions.growthPolicyId='baseball-career-growth-v1'},copy=>{copy.recoveryCode='private'}]){
    const copy=clone(value);change(copy);assert.equal(validBaseballAtBatCheckpoint(copy),false)
  }
})

test('v2 journals use separate names and never issue a standalone growth session',()=>{
  assert.equal(BASEBALL_AT_BAT_JOURNAL_DATABASE,'nextport-baseball-at-bats-v2')
  assert.equal(BASEBALL_CAREER_JOURNAL_DATABASE,'nextport-baseball-careers-v2')
  assert.throws(()=>createBaseballAtBatTransport(),error=>error.code==='invalid_command')
  const value=checkpoint(),entry={schemaVersion:2,id:childId,player:{name:'새 성장',jerseyNumber:'07',teamId:'wiz',handedness:'left'},checkpoint:value,pending:null,updatedAt:0}
  assert.equal(validBaseballAtBatJournal(entry),true)
  assert.equal(validBaseballAtBatJournal({...entry,schemaVersion:1}),false)
  assert.equal(validBaseballAtBatJournal({...entry,checkpoint:null,pending:{operation:'create',body:{commandId:childId,settings:value.config,source:'manual'}}}),false)
})
