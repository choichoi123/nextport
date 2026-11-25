import test from 'node:test'
import assert from 'node:assert/strict'
import * as v1 from '../lib/playground-baseball-career.mjs'
import * as v2 from '../lib/playground-baseball-career-v2.mjs'
import { getBaseballTrainingPreview, selectBaseballTrainingConfirmation } from '../lib/playground-baseball-career-training-ui.mjs'

const uuid=n=>`72000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const now='2026-11-25T01:00:00.000Z',clone=value=>JSON.parse(JSON.stringify(value))
const versions=Object.fromEntries(['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','careerHash','growthHash'].map((key,i)=>[key,String(i+1).repeat(64)]))
const fresh=version=>version.createBaseballCareerSave({id:uuid(1),seed:12,profile:{name:'표시검수',jerseyNumber:'07',teamId:'wiz',handedness:'left'},versions:version===v1?Object.fromEntries(Object.entries(versions).filter(([key])=>key!=='growthHash')):versions,now})
const train=(version,before,choice)=>version.applyBaseballCareerCommand(before,{commandId:uuid(2),expectedRevision:before.revision,type:'prepare',choice},{now})
const select=(before,after,choice,extra={})=>selectBaseballTrainingConfirmation({before,after,choice,origin:'direct-command',...extra})

test('v1/v2 estimates show current, expected and capped costs without changing the save',()=>{
  for(const version of[v1,v2]){
    const career=fresh(version),before=JSON.stringify(career),choice=version===v2?'mit':'power'
    const preview=getBaseballTrainingPreview({growth:career.growth,rules:version.BASEBALL_CAREER_RULES,choice})
    assert.deepEqual(preview.rows,[{key:choice,before:40,after:42,delta:2},{key:'xp',before:0,after:2,delta:2},{key:'condition',before:80,after:74,delta:-6}])
    assert.equal(JSON.stringify(career),before);assert.ok(Object.isFrozen(preview.rows[0]))
  }
})
test('preview reflects ability cap and actual available condition instead of promising full nominal costs',()=>{
  const growth={...fresh(v2).growth,mit:100,condition:2}
  const preview=getBaseballTrainingPreview({growth,rules:v2.BASEBALL_CAREER_RULES,choice:'mit'})
  assert.deepEqual(preview.rows,[{key:'mit',before:100,after:100,delta:0},{key:'xp',before:0,after:2,delta:2},{key:'condition',before:2,after:0,delta:-2}])
})
test('rest preview includes only actual recovery, including zero at the cap',()=>{
  for(const[condition,after,delta]of[[95,100,5],[100,100,0]]){
    const preview=getBaseballTrainingPreview({growth:{...fresh(v2).growth,condition},rules:v2.BASEBALL_CAREER_RULES,choice:'rest'})
    assert.deepEqual(preview.rows,[{key:'condition',before:condition,after,delta}])
  }
})
test('unknown choices, missing abilities and invalid display values are not fabricated',()=>{
  const career=fresh(v1)
  for(const args of [{choice:'mit'},{choice:'unknown'},{choice:'power',growth:{...career.growth,power:NaN}},{choice:'power',growth:{...career.growth,power:101}},{choice:'rest',growth:{...career.growth,condition:-1}}]){
    assert.equal(getBaseballTrainingPreview({growth:career.growth,rules:v1.BASEBALL_CAREER_RULES,...args}),null)
  }
})
test('real v1/v2 confirmed preparations expose only the matching server ledger delta',()=>{
  for(const version of[v1,v2])for(const choice of version===v2?['mit','power','discipline','stamina','rest']:['power','discipline','stamina','rest']){
    const before=version.publicBaseballCareerSave(fresh(version)),after=version.publicBaseballCareerSave(train(version,fresh(version),choice))
    const feedback=select(before,after,choice)
    assert.equal(feedback.id,after.ledger.at(-1).id);assert.equal(feedback.changed,true)
    for(const row of feedback.rows){assert.equal(row.delta,after.ledger.at(-1).deltas[row.key]);assert.equal(row.after-row.before,row.delta)}
    assert.ok(Object.isFrozen(feedback));assert.ok(Object.isFrozen(feedback.rows))
  }
})
test('preview, failure, retry, restore and refresh are never confirmation origins',()=>{
  const before=fresh(v2),after=train(v2,before,'mit')
  for(const origin of[undefined,'preview','failed','retry','restore','refresh','late-response','automatic'])assert.equal(select(before,after,'mit',{origin}),null)
})
test('the same ledger event is emphasized once; seen IDs and restores do not replay it',()=>{
  const before=fresh(v2),after=train(v2,before,'mit'),feedback=select(before,after,'mit')
  assert.equal(select(before,after,'mit',{seenIds:[feedback.id]}),null)
  assert.equal(select(after,after,'mit'),null)
  assert.equal(select(after,{...after,revision:after.revision+1},'mit'),null)
})
test('another player, rule version, choice or revision cannot trigger growth emphasis',()=>{
  const before=fresh(v2),after=train(v2,before,'mit')
  for(const changed of[{...after,id:uuid(9)},{...after,schemaVersion:1},{...after,revision:before.revision},{...after,revision:before.revision+2}])assert.equal(select(before,changed,'mit'),null)
  assert.equal(select(before,after,'power'),null)
})
test('an altered old ledger or an unrelated new ledger entry is not a preparation receipt',()=>{
  const before=fresh(v2),after=train(v2,before,'mit')
  for(const change of[event=>event.kind='appearance',event=>event.id='unrelated',event=>event.gameIndex=2]){
    const next=clone(after);change(next.ledger[0]);assert.equal(select(before,next,'mit'),null)
  }
  const withPrior=clone(before);withPrior.ledger=[{id:'older',kind:'game',deltas:{xp:5}}]
  const next=clone(after);next.ledger=[{...withPrior.ledger[0],deltas:{xp:50}},...next.ledger]
  assert.equal(select(withPrior,next,'mit'),null)
})
test('matching numbers without a new preparation event do not create a reward',()=>{
  const before=fresh(v2),after=train(v2,before,'mit')
  assert.equal(select(before,{...after,ledger:[]},'mit'),null)
  const altered=clone(after);altered.growth.mit=45;assert.equal(select(before,altered,'mit'),null)
  const unexpected=clone(after);unexpected.growth.stamina++;unexpected.ledger[0].deltas.stamina++;assert.equal(select(before,unexpected,'mit'),null)
})
test('zero actual delta is retained exactly and does not request an animation',()=>{
  const before=clone(fresh(v2));before.growth.condition=100
  const after=clone(before);after.revision++;after.games[0].preparation={choice:'rest',at:now}
  after.ledger=[{id:`${before.games[0].id}:preparation`,kind:'preparation',choice:'rest',gameIndex:0,deltas:Object.fromEntries(Object.keys(before.growth).map(key=>[key,0])),at:now}]
  const feedback=select(before,after,'rest')
  assert.equal(feedback.changed,false);assert.deepEqual(feedback.rows,[{key:'condition',before:100,after:100,delta:0}])
})
test('missing or corrupted confirmation fields return no presentation and never mutate inputs',()=>{
  const before=fresh(v2),after=train(v2,before,'mit'),original=JSON.stringify([before,after])
  for(const changed of[{...after,growth:null},{...after,games:[]},{...after,ledger:null},{...after,currentGameIndex:1}])assert.equal(select(before,changed,'mit'),null)
  assert.equal(select(before,after,'mit',{seenIds:null}),null);assert.equal(JSON.stringify([before,after]),original)
})
