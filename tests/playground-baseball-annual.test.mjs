import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import test from 'node:test'
import {
  BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES, advanceBaseballAnnualDraft, createBaseballAnnualDraft,
  getBaseballAnnualIdentity, isCompleteBaseballAnnualStats, replayBaseballAnnualBackup, replayBaseballAnnualSubmission,
  summarizeBaseballAnnualTotals, validateBaseballAnnualDraft,
} from '../lib/playground-baseball-annual.mjs'
import {BASEBALL_ANNUAL_APPEARANCES_PER_GAME, createBaseballCareerSave, getBaseballCareerAppearancesPerGame,
  validateBaseballCareerSave} from '../lib/playground-baseball-career-v2.mjs'
import {BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID} from '../lib/playground-baseball-at-bat-v2.mjs'
import {getBaseballWinterGoal, isBaseballWinterPlan} from '../lib/playground-baseball-winter.mjs'

const start = '2026-11-26T03:00:00.000Z'
const later = '2026-11-26T03:01:00.000Z'
const settings = {baseSpeedKmh:120,pitchMode:'mixed'}
const versions = Object.fromEntries(['atBatHash','careerHash','engineHash','fieldHash','growthHash','rulesHash','sessionHash'].map(key=>[key,'0'.repeat(64)]))
const profile = {name:'시즌 백업 검수',jerseyNumber:'07',handedness:'right',teamId:'heroes'}
const create = () => createBaseballAnnualDraft({id:randomUUID(),profile,settings,versions,seed:2411,now:start})
const action = (type,fields={},now=later) => ({type,commandId:randomUUID(),now,...fields})
const apply = (draft,type,fields) => advanceBaseballAnnualDraft(draft,action(type,fields))
const identifiers = pending => ({pitchId:pending.pitchId,attemptId:pending.attemptId})
const replay = (draft,options) => replayBaseballAnnualSubmission({setup:draft.setup,actions:draft.actions},options)

test('mid-pitch and completed direct records replay from raw input without a network',()=>{
  let draft = apply(create(),'prepare',{choice:'mit'})
  draft = apply(draft,'start-manual',{atBatId:randomUUID()})
  const prepared = draft.career
  draft = apply(draft,'issue',{attemptId:randomUUID()})
  const paused = apply(draft,'pause',{...identifiers(draft.session.pending),reason:'reload'})
  assert.equal(paused.career,prepared)
  assert.equal(paused.session.pending.status,'paused')
  draft = apply(paused,'issue',{attemptId:randomUUID()})
  draft = apply(draft,'accept-input',{...identifiers(draft.session.pending),input:{kind:'take'}})
  assert.equal(draft.career,prepared)
  assert.deepEqual(replay(draft,{includeAtBats:false}).draft,draft)
  draft = apply(draft,'resolve',identifiers(draft.session.pending))
  while (draft.session.state.status==='active') {
    draft = apply(draft,'issue',{attemptId:randomUUID()})
    draft = apply(draft,'accept-input',{...identifiers(draft.session.pending),input:{kind:'take'}})
    draft = apply(draft,'resolve',identifiers(draft.session.pending))
  }
  assert.equal(draft.career.stats.PA,1)
  assert.equal(draft.career.activeAtBat,null)
  assert.equal(draft.career.revision,prepared.revision+1)
  assert.equal(validateBaseballAnnualDraft(draft),true)
  const restored = replay(draft)
  assert.deepEqual(restored.draft,draft)
  assert.deepEqual(restored.atBats,[{id:draft.session.id,gameIndex:0,slot:1,source:'manual',expectedRevision:0,snapshot:draft.session}])
  const withAutomatic = apply(draft,'simulate-game',{atBatIds:[randomUUID()]})
  assert.equal(withAutomatic.career.currentGameIndex,1)
  assert.equal(withAutomatic.career.stats.PA,2)
  assert.equal(replay(withAutomatic).atBats[1].slot,2)
})

test('three-appearance drafts keep the same game for the first two manual at-bats and replay all three growth snapshots',()=>{
  const old = create()
  assert.equal(Object.hasOwn(old.setup,'appearancesPerGame'),false)
  assert.equal(getBaseballCareerAppearancesPerGame(old.career),2)
  assert.throws(()=>createBaseballCareerSave({...old.setup,appearancesPerGame:BASEBALL_ANNUAL_APPEARANCES_PER_GAME}))
  assert.throws(()=>createBaseballAnnualDraft({...old.setup,appearancesPerGame:2}))
  const balanced = {...versions,pitchPolicyId:BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID}
  const fresh = createBaseballAnnualDraft({...old.setup,versions:balanced,appearancesPerGame:BASEBALL_ANNUAL_APPEARANCES_PER_GAME})
  assert.equal(fresh.setup.appearancesPerGame,3)
  assert.throws(()=>validateBaseballAnnualDraft({...fresh,setup:old.setup}))

  let draft = apply(fresh,'prepare',{choice:'mit'})
  for (const slot of [1,2,3]) {
    draft = apply(draft,'start-manual',{atBatId:randomUUID()})
    assert.equal(draft.session.growthSnapshot.slot,slot)
    assert.equal(draft.session.state.pitchPolicyVersion,BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID)
    while (draft.session.state.status === 'active') {
      draft = apply(draft,'issue',{attemptId:randomUUID()})
      draft = apply(draft,'accept-input',{...identifiers(draft.session.pending),input:{kind:'take'}})
      draft = apply(draft,'resolve',identifiers(draft.session.pending))
    }
    assert.equal(draft.career.stats.PA,slot)
    assert.equal(draft.career.currentGameIndex,slot===3?1:0)
    assert.equal(draft.career.games[0].status,slot===3?'complete':'active')
    assert.equal(draft.career.ledger.filter(row=>row.kind==='game').length,slot===3?1:0)
    if (slot === 1) {
      assert.throws(()=>apply(draft,'simulate-game',{atBatIds:[randomUUID()]}))
      const automatic = apply(draft,'simulate-game',{atBatIds:[randomUUID(),randomUUID()]})
      const replayed = replay(automatic).atBats
      assert.deepEqual(replayed.map(row=>[row.slot,row.source]),[[1,'manual'],[2,'automatic'],[3,'automatic']])
      assert.ok(replayed.every(row=>row.snapshot.state.pitchPolicyVersion===BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID))
      assert.equal(automatic.career.currentGameIndex,1)
    }
  }
  assert.equal(validateBaseballAnnualDraft(draft),true)
  assert.deepEqual(replay(draft).draft,draft)
  assert.deepEqual(replay(draft).atBats.map(row=>row.snapshot.growthSnapshot.slot),[1,2,3])
})

test('replay rejects redundant, forged and out-of-order actions',()=>{
  const first = action('prepare',{choice:'rest'})
  const draft = advanceBaseballAnnualDraft(create(),first)
  assert.throws(()=>advanceBaseballAnnualDraft(draft,first),{code:'conflict'})
  assert.throws(()=>advanceBaseballAnnualDraft(draft,action('simulate-game',{atBatIds:[randomUUID()]})))
  const second = action('simulate-game',{atBatIds:[randomUUID(),randomUUID()]})
  assert.throws(()=>replayBaseballAnnualSubmission({setup:draft.setup,actions:[first,{...second,result:'home-run'}]}))
  assert.throws(()=>replayBaseballAnnualSubmission({setup:draft.setup,actions:[first,{...second,now:start}]}))
  assert.throws(()=>replayBaseballAnnualSubmission({setup:draft.setup,actions:[first,first]}),{code:'conflict'})
  assert.throws(()=>replayBaseballAnnualSubmission({setup:draft.setup,actions:[second]}),{code:'preparation-required'})
  assert.throws(()=>replayBaseballAnnualSubmission({setup:draft.setup,actions:[first,{...second,atBatIds:[second.atBatIds[0],second.atBatIds[0]]}]}))
})

test('a subsequent season carries growth while counting only its new appearances',()=>{
  const first = create()
  const priorStats = {G:144,PA:288,AB:240,H:67,'2B':14,'3B':5,HR:4,BB:48,SO:40}
  const startingGrowth = {mit:78,power:65,discipline:58,stamina:71,trust:94,xp:1420,condition:61}
  const continuation = {
    careerId:first.setup.id,previousSeasonId:first.setup.id,seasonNumber:2,startingGrowth,
    history:[{seasonId:first.setup.id,seasonNumber:1,stats:priorStats}],
  }
  const nextId = randomUUID()
  const next = createBaseballAnnualDraft({...first.setup,id:nextId,continuation})
  assert.deepEqual(getBaseballAnnualIdentity(first.setup),{careerId:first.setup.id,seasonId:first.setup.id,seasonNumber:1,previousSeasonId:null})
  assert.deepEqual(getBaseballAnnualIdentity(next.setup),{careerId:first.setup.id,seasonId:nextId,seasonNumber:2,previousSeasonId:first.setup.id})
  assert.deepEqual(next.career.growth,startingGrowth)
  assert.deepEqual(next.career.startingGrowth,startingGrowth)
  assert.equal(next.career.stats.PA,0)
  assert.equal(next.career.currentGameIndex,0)
  assert.deepEqual(summarizeBaseballAnnualTotals(continuation.history,next.career.stats).stats,priorStats)

  const prepared = apply(next,'prepare',{choice:'rest'})
  const played = apply(prepared,'simulate-game',{atBatIds:[randomUUID(),randomUUID()]})
  assert.deepEqual(replay(played,{includeAtBats:false}).draft,played)
  assert.equal(played.career.games[0].appearances[0].growthSnapshot.mit,startingGrowth.mit)
  assert.equal(played.career.games[0].appearances[0].growthSnapshot.power,startingGrowth.power)
  assert.equal(played.career.stats.PA,2)
  assert.ok(played.career.growth.xp > startingGrowth.xp)
  const totals = summarizeBaseballAnnualTotals(continuation.history,played.career.stats)
  assert.equal(totals.stats.PA,290)
  assert.equal(totals.stats.G,145)
  assert.equal(totals.rates.AVG,(priorStats.H+played.career.stats.H)/(priorStats.AB+played.career.stats.AB))
})

test('continuation rejects invalid prior seasons and a modified opening baseline',()=>{
  const first = create()
  const seasonId = randomUUID()
  const prior = {seasonId:first.setup.id,seasonNumber:1,stats:{G:144,PA:288,AB:240,H:67,'2B':14,'3B':5,HR:4,BB:48,SO:40}}
  const continuation = {careerId:first.setup.id,previousSeasonId:first.setup.id,seasonNumber:2,startingGrowth:first.career.growth,history:[prior]}
  const setup = {...first.setup,id:seasonId,continuation}
  const next = createBaseballAnnualDraft(setup)
  assert.throws(()=>createBaseballCareerSave({...first.setup,startingGrowth:first.career.growth}))
  assert.throws(()=>createBaseballAnnualDraft({...setup,continuation:{...continuation,previousSeasonId:seasonId}}))
  assert.throws(()=>createBaseballAnnualDraft({...setup,continuation:{...continuation,history:[{...prior,stats:{...prior.stats,H:241}}]}}))
  assert.throws(()=>validateBaseballCareerSave({...next.career,startingGrowth:{...next.career.startingGrowth,mit:99}}))
  assert.throws(()=>validateBaseballAnnualDraft({...next,setup:{...setup,continuation:{...continuation,startingGrowth:{...continuation.startingGrowth,power:99}}}}))
})

test('the year-two winter choice survives both replays without changing career rules',async()=>{
  const first = create()
  const priorStats = {G:144,PA:288,AB:276,H:67,'2B':14,'3B':5,HR:4,BB:12,SO:40}
  const continuation = {
    careerId:first.setup.id,previousSeasonId:first.setup.id,seasonNumber:2,startingGrowth:first.career.growth,
    history:[{seasonId:first.setup.id,seasonNumber:1,stats:priorStats}],
  }
  const setup = {...first.setup,id:randomUUID(),continuation}
  const winter = {version:1,direction:'discipline'}
  const next = createBaseballAnnualDraft({...setup,winter})
  const legacy = createBaseballAnnualDraft(setup)
  assert.deepEqual(next.career,legacy.career)
  const prepared = apply(next,'prepare',{choice:'rest'})
  const played = apply(prepared,'simulate-game',{atBatIds:[randomUUID(),randomUUID()]})
  assert.equal(validateBaseballAnnualDraft(played),true)
  assert.deepEqual(replay(played).draft,played)
  assert.deepEqual(await replayBaseballAnnualBackup({setup:played.setup,actions:played.actions}),played)

  const badPlans = [null,{...winter,version:2},{...winter,target:99},{...winter,direction:'speed'}]
  for (const plan of badPlans) {
    assert.throws(()=>createBaseballAnnualDraft({...setup,winter:plan}))
    assert.throws(()=>validateBaseballAnnualDraft({...next,setup:{...next.setup,winter:plan}}))
    assert.throws(()=>replayBaseballAnnualSubmission({setup:{...next.setup,winter:plan},actions:[]}))
  }
  assert.throws(()=>createBaseballAnnualDraft({...first.setup,winter}))
  const thirdSeason = {
    ...continuation,seasonNumber:3,previousSeasonId:next.setup.id,
    history:[...continuation.history,{seasonId:next.setup.id,seasonNumber:2,stats:priorStats}],
  }
  assert.throws(()=>createBaseballAnnualDraft({...setup,id:randomUUID(),continuation:thirdSeason,winter}))
})

test('winter count goals use season totals and respect the number of plate appearances',()=>{
  const plan = direction => ({version:1,direction})
  assert.equal(isBaseballWinterPlan(plan('balanced')),true)
  assert.equal(isBaseballWinterPlan({...plan('balanced'),serializedGoal:'bad'}),false)
  assert.deepEqual(getBaseballWinterGoal(plan('discipline'),{PA:288,BB:12}),{previous:12,target:15})
  assert.deepEqual(getBaseballWinterGoal(plan('power'),{PA:288,'2B':9,'3B':2,HR:1}),{previous:12,target:15})
  assert.deepEqual(getBaseballWinterGoal(plan('discipline'),{PA:288,BB:287}),{previous:287,target:288})
  assert.equal(getBaseballWinterGoal(plan('recovery'),{PA:288,BB:12}),null)
  assert.equal(getBaseballWinterGoal(plan('discipline'),{PA:288,BB:289}),null)
})

test('all 144 regular-season games settle to 288 canonical at-bats from a compact batch',context=>{
  const initial = create()
  const actions = []
  for(let index=0;index<144;index++) {
    actions.push(action('prepare',{choice:index%3===0?'rest':'power'}))
    actions.push(action('simulate-game',{atBatIds:[randomUUID(),randomUUID()]}))
  }
  const body = {setup:initial.setup,actions}
  assert.ok(Buffer.byteLength(JSON.stringify(body)) < BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES)
  const before = performance.now()
  const result = replayBaseballAnnualSubmission(body)
  context.diagnostic(`144-game auto replay in ${Math.round(performance.now()-before)}ms`)
  assert.equal(result.draft.career.status,'complete')
  assert.equal(result.draft.career.currentGameIndex,144)
  assert.equal(result.draft.career.stats.PA,288)
  assert.equal(result.atBats.length,288)
  assert.equal(new Set(result.atBats.map(row=>row.id)).size,288)
  assert.deepEqual(result.atBats.at(-1).snapshot.growthSnapshot,result.draft.career.games[143].appearances[1].growthSnapshot)
  assert.equal(validateBaseballAnnualDraft(result.draft),true)
})

test('a three-appearance season settles 432 canonical at-bats and continues mixed-era totals',context=>{
  const previous = create()
  const previousStats = {G:144,PA:288,AB:240,H:67,'2B':14,'3B':5,HR:4,BB:48,SO:40}
  const previousHistory = [{seasonId:previous.setup.id,seasonNumber:1,stats:previousStats}]
  const continuation = {careerId:previous.setup.id,previousSeasonId:previous.setup.id,seasonNumber:2,
    startingGrowth:previous.career.growth,history:previousHistory}
  const initial = createBaseballAnnualDraft({...previous.setup,id:randomUUID(),continuation,appearancesPerGame:BASEBALL_ANNUAL_APPEARANCES_PER_GAME})
  const actions = initial.career.games.flatMap(()=>[
    action('prepare',{choice:'rest'}),
    action('simulate-game',{atBatIds:[randomUUID(),randomUUID(),randomUUID()]}),
  ])
  const before = performance.now()
  const result = replayBaseballAnnualSubmission({setup:initial.setup,actions})
  context.diagnostic(`144-game, 3-appearance auto replay in ${Math.round(performance.now()-before)}ms`)
  assert.equal(validateBaseballAnnualDraft(result.draft),true)
  assert.equal(result.draft.career.status,'complete')
  assert.equal(result.atBats.length,432)
  const stats = result.draft.career.stats
  assert.equal(isCompleteBaseballAnnualStats(stats,3),true)
  assert.equal(isCompleteBaseballAnnualStats(stats,2),false)
  assert.equal(isCompleteBaseballAnnualStats({...stats,PA:'432'}),false)
  assert.equal(isCompleteBaseballAnnualStats(previousStats),true)
  assert.deepEqual(result.atBats.filter(row=>row.gameIndex===143).map(row=>row.snapshot.growthSnapshot.slot),[1,2,3])
  const history = [...previousHistory,{seasonId:initial.setup.id,seasonNumber:2,stats}]
  const yearThree = createBaseballAnnualDraft({...initial.setup,id:randomUUID(),continuation:{...continuation,
    previousSeasonId:initial.setup.id,seasonNumber:3,startingGrowth:result.draft.career.growth,history}})
  assert.equal(summarizeBaseballAnnualTotals(yearThree.setup.continuation.history,yearThree.career.stats).stats.PA,720)
})
