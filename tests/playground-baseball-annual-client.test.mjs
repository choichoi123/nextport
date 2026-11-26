import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createBaseballAnnualTransport, openBaseballAnnualClient, selectBaseballAnnualArchive,
} from '../lib/playground-baseball-annual-client.mjs'
import { replayBaseballAnnualBackup, replayBaseballAnnualSubmission } from '../lib/playground-baseball-annual.mjs'
import { BASEBALL_CAREER_V2_PRE_MIXED_EIGHT_HASHES } from '../lib/playground-baseball-career-versions.mjs'
import { BASEBALL_AT_BAT_MIXED_EIGHT } from '../lib/playground-baseball-practice-pitches.mjs'
import { BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID } from '../lib/playground-baseball-at-bat-v2.mjs'

const uuid = index => `42a00000-0000-4000-8000-${index.toString(16).padStart(12,'0')}`
const time = Date.parse('2026-11-26T00:00:00.000Z')
const profile = {name:'시즌 검수',handedness:'right',teamId:'wiz',jerseyNumber:'07'}
const settings = {pitchMode:'mixed',baseSpeedKmh:120}
const versions = Object.fromEntries(
  ['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','careerHash','growthHash'].map((name,i) => [name,String(i+1).repeat(64)]),
)
const failure = code => Object.assign(new Error(code), {code})
function memoryRepository() {
  const rows = new Map()
  const winterDrafts = new Map()
  const archiveMarkers = new Map()
  const restoreWinterDraft = (id,plan) => {
    if (plan && !winterDrafts.has(id)) winterDrafts.set(id,structuredClone(plan))
  }
  return {
    init:async () => {},
    close() {},
    list:async () => structuredClone([...rows.values()]),
    read:async id => structuredClone(rows.get(id)),
    readWinterDraft:async id => structuredClone(winterDrafts.get(id)),
    saveWinterDraft:async (id,plan) => { winterDrafts.set(id,structuredClone(plan)) },
    restoreWinterDraft:async (id,plan) => restoreWinterDraft(id,plan),
    listArchiveMarkers:async () => structuredClone([...archiveMarkers.values()]),
    readArchiveMarker:async id => structuredClone(archiveMarkers.get(id)),
    rememberArchiveMarker:async marker => {
      const saved = archiveMarkers.get(marker.careerId)
      if (saved?.seasonIds.length > marker.seasonIds.length) return structuredClone(saved)
      archiveMarkers.set(marker.careerId,structuredClone(marker))
      return structuredClone(marker)
    },
    insert:async (value,winterDraft) => {
      if (rows.has(value.setup.id)) throw failure('local_conflict')
      const next=value.setup.continuation
      if (next && [...rows.values()].some(row => row.setup.continuation?.careerId===next.careerId
        && row.setup.continuation?.seasonNumber===next.seasonNumber)) throw failure('local_conflict')
      rows.set(value.setup.id, structuredClone(value))
      restoreWinterDraft(value.setup.id,winterDraft)
    },
    replace:async (old,value,winterDraft) => {
      const saved = rows.get(value.setup.id)
      if (saved.revision !== old.revision || Boolean(saved.receipt) !== Boolean(old.receipt) || saved.finish !== old.finish) {
        throw failure('local_conflict')
      }
      rows.set(value.setup.id, structuredClone(value))
      restoreWinterDraft(value.setup.id,winterDraft)
    },
  }
}

const client = (repository,idOffset=100,transport={
  settle:() => assert.fail('The client must not make a network request during the season.'),
},options={}) => {
  let index = idOffset
  return openBaseballAnnualClient({repository,versions,transport,idFactory:() => uuid(index++),seedFactory:() => 1234,now:() => time,...options})
}

function automaticGames(count) {
  const id = uuid(600)
  const now = new Date(time).toISOString()
  const setup = {id,profile,settings,versions,seed:1234,now,source:'manual'}
  const actions = Array.from({length:count},(_,i) => [
    {type:'prepare',commandId:uuid(6000+i*4),choice:'rest',now},
    {type:'simulate-game',commandId:uuid(6001+i*4),atBatIds:[uuid(6002+i*4),uuid(6003+i*4)],now},
  ]).flat()
  return {setup,actions}
}

test('the active appearance and accepted input reopen without any transport calls', async () => {
  const repository = memoryRepository()
  const beforeReload = await client(repository)
  const fresh = await beforeReload.create(profile,settings)
  assert.equal(fresh.appearancesPerGame,3)
  await beforeReload.command(fresh.id,{type:'prepare',choice:'mit'})
  const career = await beforeReload.command(fresh.id,{type:'start-manual'})
  const id = career.activeAtBat.id
  const {client:adapter} = await beforeReload.atBatAdapter(career.id,id,profile)
  const issued = await adapter.command(id,{type:'issue'})
  assert.equal(adapter.snapshot().lastReceipt.revision,issued.revision)
  const {pitchId,attemptId} = issued.pending
  const accepted = await adapter.command(id,{type:'accept-input',pitchId,attemptId,input:{kind:'take'}})
  assert.equal(accepted.pending.input.kind,'take')
  beforeReload.close()

  const reopened = await client(repository,1000)
  const loaded = await reopened.read(career.id)
  assert.equal(loaded.career.activeAtBat.id,id)
  const resumed = await reopened.atBatAdapter(career.id,id,profile)
  assert.deepEqual(resumed.session.pending,accepted.pending)
  const resolved = await resumed.client.command(id,{type:'resolve',pitchId,attemptId})
  assert.equal(resolved.pending,null)
  assert.equal(resolved.state.pitchCount,1)
  await assert.rejects(reopened.settle(career.id), {code:'season_incomplete'})
  await assert.rejects(reopened.startNextSeason(career.id), {code:'season_incomplete'})
  await assert.rejects(reopened.saveWinterDraft(career.id,{version:1,direction:'power'}),{code:'season_incomplete'})
  assert.equal(reopened.snapshot().entries[0].annual,true)
  reopened.close()
})

test('file backup rebuilds a season on another browser and protects newer or conflicting progress', async () => {
  const original = await client(memoryRepository())
  const season = await original.create(profile,settings)
  const firstBackup = await original.exportSave(season.id)
  await original.command(season.id,{type:'prepare',choice:'power'})
  await original.command(season.id,{type:'simulate-game'})
  const backup = await original.exportSave(season.id)
  const decoded = JSON.parse(backup)
  assert.deepEqual(Object.keys(decoded), ['format','setup','actions'])
  assert.equal(decoded.actions.length,2)
  assert.doesNotMatch(backup,/receipt|cookie|token|secret/i)

  const restored = await client(memoryRepository(),1000)
  await restored.importSave(firstBackup)
  const copy = await restored.importSave(new Blob([backup],{type:'application/json'}))
  assert.equal(copy.currentGameIndex,1)
  assert.equal((await restored.importSave(backup)).currentGameIndex,1)
  await assert.rejects(restored.importSave(firstBackup),{code:'local_conflict'})
  await assert.rejects(restored.importSave(`{`),{code:'local_data_invalid'})
  await assert.rejects(restored.importSave(JSON.stringify({...decoded,winterDraft:{version:1,direction:'balanced'}})),{code:'local_data_invalid'})
  const edited = {...decoded,actions:[{...decoded.actions[0],type:'invalid-action'},decoded.actions[1]]}
  await assert.rejects(restored.importSave(JSON.stringify(edited)),{code:'local_data_invalid'})
  assert.equal((await restored.read(season.id)).career.currentGameIndex,1)
  original.close()
  restored.close()
})

test('backup replay yields to the browser and can be stopped without saving a partial draft', async () => {
  const short = automaticGames(2)
  assert.deepEqual(await replayBaseballAnnualBackup(short),replayBaseballAnnualSubmission(short,{includeAtBats:false}).draft)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(),0)
  try {
    await assert.rejects(replayBaseballAnnualBackup(automaticGames(48),{signal:controller.signal}),{name:'AbortError'})
  } finally { clearTimeout(timer) }
})

test('two tabs cannot overwrite an IndexedDB revision from an older snapshot', async () => {
  const repository = memoryRepository()
  const first = await client(repository)
  const {id} = await first.create(profile,settings)
  const second = await client(repository,1000)
  await first.command(id,{type:'prepare',choice:'rest'})
  await assert.rejects(second.command(id,{type:'prepare',choice:'power'}),{code:'local_conflict'})
  const {career} = await second.read(id)
  assert.equal(career.games[0].preparation.choice,'rest')
  first.close()
  second.close()
})

test('series and week simulation save a bounded range once, preserve preparation, and reopen at the highlight', async () => {
  const repository = memoryRepository()
  const replace = repository.replace
  let writes = 0
  repository.replace = async (...args) => {
    writes++
    return replace(...args)
  }
  const first = await client(repository)
  const {id} = await first.create(profile,settings)
  assert.equal((await first.advance(id,'highlight')).currentGameIndex,0)
  assert.equal(writes,0)

  await first.command(id,{type:'prepare',choice:'power'})
  await first.command(id,{type:'simulate-at-bat'})
  const lockedAppearance = (await repository.read(id)).career.games[0].appearances[0]
  const afterOpener = await first.advance(id,'current')
  assert.equal(afterOpener.currentGameIndex,1)
  assert.equal(afterOpener.games[0].preparation.choice,'power')
  assert.deepEqual(afterOpener.games[0].appearances[0],lockedAppearance)
  assert.equal(writes,3)

  const afterSeries = await first.advance(id,'series')
  assert.equal(afterSeries.currentGameIndex,2)
  assert.equal(afterSeries.games[1].preparation.choice,'rest')
  assert.equal(writes,4)
  const afterWeek = await first.advance(id,'week')
  assert.equal(afterWeek.currentGameIndex,6)
  assert.equal(afterWeek.games[2].preparation.choice,'mit')
  assert.equal(afterWeek.games[6].preparation,null)
  assert.equal(afterWeek.statsBySource.automatic.PA,18)
  assert.equal(writes,5)
  assert.equal((await first.advance(id,'week')).currentGameIndex,6)
  assert.equal(writes,5)

  const backup = await first.exportSave(id)
  first.close()
  const reopened = await client(repository,1000)
  assert.deepEqual((await reopened.read(id)).career,afterWeek)
  const imported = await client(memoryRepository(),2000)
  assert.deepEqual(await imported.importSave(backup),afterWeek)
  reopened.close()
  imported.close()
})

test('highlight simulation stops before the next key game and protects a manual appearance in progress', async () => {
  const repository = memoryRepository()
  const opened = await client(repository)
  const {id} = await opened.create(profile,settings)
  await opened.advance(id,'current')
  const advanced = await opened.advance(id,'highlight')
  assert.equal(advanced.currentGameIndex,6)
  assert.equal(advanced.games[6].preparation,null)
  await opened.command(id,{type:'prepare',choice:'rest'})
  await opened.command(id,{type:'start-manual'})
  const saved = await repository.read(id)
  await assert.rejects(opened.advance(id,'current'),{code:'active_at_bat'})
  await assert.rejects(opened.advance(id,'highlight'),{code:'active_at_bat'})
  assert.deepEqual(await repository.read(id),saved)
  opened.close()
})

test('a competing tab never leaves a partially committed auto-play range', async () => {
  const repository = memoryRepository()
  const first = await client(repository)
  const {id} = await first.create(profile,settings)
  await first.advance(id,'current')
  const second = await client(repository,1000)

  const advance = first.advance(id,'highlight')
  await second.command(id,{type:'prepare',choice:'stamina'})
  await assert.rejects(advance,{code:'local_conflict'})
  const reopened = await first.read(id)
  assert.equal(reopened.career.currentGameIndex,1)
  assert.equal(reopened.career.games[1].preparation.choice,'stamina')
  assert.equal(reopened.career.stats.PA,3)
  first.close()
  second.close()
})

test('the settlement transport makes only the identity bootstrap and same-origin annual POST', async () => {
  const requests = []
  const transport = createBaseballAnnualTransport({
    bootstrapRepository:{init:async()=>{},withBootstrapLease:work=>work(),close(){}},
    fetchImpl:async (url,options) => {
      requests.push([url,options])
      return {ok:true,json:async()=>({status:options.method==='GET'?'ok':'stored'})}
    },
  })
  assert.equal(requests.length,0)
  const payload = {setup:{},actions:[]}
  await transport.settle(payload)
  assert.deepEqual(requests.map(([url,options])=>[url,options.method,options.credentials]),[
    ['/api/playground/baseball/careers-annual','GET','same-origin'],
    ['/api/playground/baseball/careers-annual','POST','same-origin'],
  ])
  assert.deepEqual(JSON.parse(requests[1][1].body),payload)
  await transport.history(uuid(900))
  assert.equal(requests[2][0],`/api/playground/baseball/careers-annual?careerId=${uuid(900)}`)
  assert.equal(requests[2][1].method,'GET')
  transport.close()
})

test('a lost annual acknowledgement leaves the same replayable submission and preserves the saved receipt after reopen', async () => {
  const submission = automaticGames(144)
  const {id,now} = submission.setup
  const {draft} = replayBaseballAnnualSubmission(submission,{includeAtBats:false})
  const repository = memoryRepository()
  await repository.insert(draft)
  const nextVersions={...versions,careerHash:'c'.repeat(64)}
  const compatibility={versions:nextVersions,priorAnnualVersions:versions}
  const requests = []
  const receipt = {seasonId:id,careerId:id,seasonNumber:1,savedAt:now,stats:draft.career.stats}
  const opened = await client(repository,2000,{settle:async submitted => {
    requests.push(submitted)
    if (requests.length === 1) throw failure('network_unavailable')
    return {status:'stored',receipt,duplicate:true}
  }},compatibility)
  await assert.rejects(opened.settle(id),{code:'network_unavailable'})
  assert.equal((await repository.read(id)).receipt,null)
  await assert.rejects(opened.startNextSeason(id),{code:'season_incomplete'})
  assert.deepEqual((await opened.settle(id)).receipt,receipt)
  assert.deepEqual(requests[0],requests[1])
  const winter={version:1,direction:'discipline'}
  assert.deepEqual(await opened.saveWinterDraft(id,winter),winter)
  const beforeOpening=await opened.exportSave(id)
  assert.deepEqual(JSON.parse(beforeOpening).winterDraft,winter)
  assert.equal(JSON.parse(beforeOpening).setup.winter,undefined)
  opened.close()

  const reopened = await client(repository,3000,undefined,compatibility)
  assert.deepEqual((await reopened.settle(id)).receipt,receipt)
  assert.equal(reopened.snapshot().entries[0].checkpoint.stats.PA,288)
  assert.deepEqual(await reopened.readWinterDraft(id),winter)

  const restoredFirst = await client(memoryRepository(),6000,undefined,compatibility)
  assert.equal((await restoredFirst.importSave(beforeOpening)).status,'complete')
  assert.deepEqual(await restoredFirst.readWinterDraft(id),winter)
  await assert.rejects(restoredFirst.startNextSeason(id,winter),{code:'season_incomplete'})
  restoredFirst.close()

  const otherTab = await client(repository,4000,undefined,compatibility)
  const [next,alreadyStarted] = await Promise.all([
    reopened.startNextSeason(id,winter),otherTab.startNextSeason(id,{version:1,direction:'balanced'}),
  ])
  assert.equal(next.id,alreadyStarted.id)
  assert.notEqual(next.id,id)
  assert.equal(next.currentGameIndex,0)
  assert.equal(next.stats.G,0)
  assert.equal(next.stats.PA,0)
  assert.deepEqual(next.growth,draft.career.growth)
  assert.deepEqual(next.profile,draft.career.profile)
  assert.deepEqual(next.settings,{...draft.career.settings,pitchMode:BASEBALL_AT_BAT_MIXED_EIGHT})
  assert.equal(next.appearancesPerGame,3)
  assert.equal(next.versions.careerHash,nextVersions.careerHash)
  assert.deepEqual(await repository.read(id),{...draft,receipt})

  const entry = reopened.snapshot().entries.find(item=>item.id===next.id)
  assert.equal(entry.careerId,id)
  assert.equal(entry.seasonNumber,2)
  assert.deepEqual(entry.history,[{seasonId:id,seasonNumber:1,stats:receipt.stats}])
  assert.deepEqual(entry.winter,otherTab.snapshot().entries.find(item=>item.id===next.id).winter)
  assert.deepEqual(entry.winter,(await repository.read(next.id)).setup.winter)
  const advanced = await reopened.advance(next.id,'current')
  const backup = await reopened.exportSave(next.id)
  assert.deepEqual(JSON.parse(backup).setup.settings,next.settings)
  assert.deepEqual(JSON.parse(backup).setup.winter,entry.winter)
  assert.equal(JSON.parse(backup).winterDraft,undefined)
  await assert.rejects(reopened.importSave(JSON.stringify({
    ...JSON.parse(backup),setup:{...JSON.parse(backup).setup,winter:{version:1,direction:'recovery'}},
  })),{code:'local_conflict'})
  assert.deepEqual(reopened.snapshot().entries.find(item=>item.id===next.id).winter,entry.winter)
  const restored = await client(memoryRepository(),5000,undefined,compatibility)
  assert.deepEqual(await restored.importSave(backup),advanced)
  assert.deepEqual((await restored.read(next.id)).career.settings,next.settings)
  assert.deepEqual(restored.snapshot().entries[0].history,entry.history)
  assert.deepEqual(restored.snapshot().entries[0].winter,entry.winter)
  assert.equal(requests.length,2)
  restored.close()
  otherTab.close()
  reopened.close()
})

test('recovered history starts year three with balanced locations and preserves fixed pitch selections', async () => {
  const id=uuid(900),last=uuid(901)
  const growth={mit:47,power:54,discipline:66,stamina:61,trust:100,xp:1600,condition:78}
  const stats={G:144,PA:288,AB:274,H:99,'2B':27,'3B':3,HR:14,BB:14,SO:140}
  const history=[{seasonId:id,seasonNumber:1,stats},{seasonId:last,seasonNumber:2,stats}]
  const winter={2:{version:1,direction:'power'}}
  const currentVersions={...versions,pitchPolicyId:BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID}
  for (const [pitchMode,expected] of [
    ['mixed',BASEBALL_AT_BAT_MIXED_EIGHT],
    [BASEBALL_AT_BAT_MIXED_EIGHT,BASEBALL_AT_BAT_MIXED_EIGHT],
    ['cutter','cutter'],
  ]) {
    let reads=0
    const repository=memoryRepository()
    const previousSettings={pitchMode,baseSpeedKmh:140}
    const opened=await client(repository,5000,{history:async careerId=>{
      reads++
      assert.equal(careerId,id)
      return {status:'ok',careerId,history,winter,latest:{seasonId:last,seasonNumber:2,growth,profile,settings:previousSettings,source:'development'}}
    },settle:()=>assert.fail('Network during a season')},{versions:currentVersions})
    assert.equal(reads,0)
    const confirmed=await opened.loadHistory(id)
    assert.deepEqual(confirmed.history,history)
    assert.deepEqual(confirmed.winter,winter)
    await assert.rejects(opened.startNextSeason(id,winter[2]),{code:'invalid_command'})
    const next=await opened.startNextSeason(id)
    assert.deepEqual(next.settings,{...previousSettings,pitchMode:expected})
    assert.equal(next.versions.pitchPolicyId,BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID)
    assert.deepEqual(next.profile,profile)
    assert.deepEqual(next.growth,growth)
    assert.equal(next.source,'development')
    const entry=opened.snapshot().entries[0]
    assert.equal(entry.careerId,id)
    assert.deepEqual(entry.history,history)
    assert.equal(entry.seasonNumber,3)
    assert.equal((await opened.advance(next.id,'current')).currentGameIndex,1)
    assert.equal(reads,1)
    opened.close()
    const reloaded=await client(repository,100,undefined,{versions:currentVersions})
    const resumed=await reloaded.read(next.id)
    assert.equal(resumed.career.currentGameIndex,1)
    assert.deepEqual(resumed.career.settings,next.settings)
    assert.equal(resumed.career.versions.pitchPolicyId,BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID)
    assert.deepEqual(reloaded.snapshot().entries[0].history,history)
    reloaded.close()
  }
})

test('pre-eight season two can be imported, resumed and exported with the same four-pitch pin', async () => {
  const season = automaticGames(1)
  const careerId=uuid(750)
  const stats={G:144,PA:288,AB:274,H:99,'2B':27,'3B':3,HR:14,BB:14,SO:140}
  const startingGrowth={mit:47,power:54,discipline:66,stamina:61,trust:100,xp:1600,condition:78}
  season.setup={...season.setup,versions:BASEBALL_CAREER_V2_PRE_MIXED_EIGHT_HASHES,
    continuation:{careerId,previousSeasonId:careerId,seasonNumber:2,startingGrowth,history:[{seasonId:careerId,seasonNumber:1,stats}]}}
  const repository=memoryRepository()
  const opened=await client(repository)
  const backup={...season,format:'nextport-baseball-season-v1'}
  await assert.rejects(opened.importSave(JSON.stringify({
    ...backup,setup:{...season.setup,settings:{...settings,pitchMode:BASEBALL_AT_BAT_MIXED_EIGHT}},
  })),{code:'version_mismatch'})
  const restored=await opened.importSave(JSON.stringify(backup))
  assert.deepEqual(restored.stats,replayBaseballAnnualSubmission(season,{includeAtBats:false}).draft.career.stats)
  assert.equal(restored.settings.pitchMode,'mixed')
  opened.close()
  const reloaded=await client(repository)
  const advanced=await reloaded.advance(restored.id,'current')
  assert.equal(advanced.currentGameIndex,2)
  const exported=JSON.parse(await reloaded.exportSave(restored.id))
  assert.deepEqual(exported.setup.versions,(await repository.read(restored.id)).setup.versions)
  assert.equal(exported.setup.versions.careerHash,BASEBALL_CAREER_V2_PRE_MIXED_EIGHT_HASHES.careerHash)
  assert.equal(exported.setup.settings.pitchMode,'mixed')
  reloaded.close()
})

test('annual settlement keeps the winter plan in the one submitted season and verifies the receipt', async () => {
  const id=uuid(900)
  const stats={G:144,PA:288,AB:274,H:99,'2B':27,'3B':3,HR:14,BB:14,SO:140}
  const growth={mit:47,power:54,discipline:66,stamina:61,trust:100,xp:1600,condition:78}
  const winter={version:1,direction:'recovery'}
  const submission=automaticGames(144)
  submission.setup.continuation={careerId:id,previousSeasonId:id,seasonNumber:2,startingGrowth:growth,
    history:[{seasonId:id,seasonNumber:1,stats}]}
  submission.setup.winter=winter
  const {draft}=replayBaseballAnnualSubmission(submission,{includeAtBats:false})
  const repository=memoryRepository()
  await repository.insert(draft)
  const receipt={careerId:id,seasonId:draft.setup.id,seasonNumber:2,savedAt:draft.setup.now,stats:draft.career.stats,winter}
  const requests=[]
  const opened=await client(repository,9000,{settle:async payload=>{
    requests.push(payload)
    return {status:'stored',receipt:requests.length===1?{...receipt,winter:{version:1,direction:'balanced'}}:receipt}
  }})
  assert.equal(requests.length,0)
  await assert.rejects(opened.settle(draft.setup.id),{code:'invalid_response'})
  assert.equal((await repository.read(draft.setup.id)).receipt,null)
  assert.deepEqual((await opened.settle(draft.setup.id)).receipt,receipt)
  const normalizedSubmission={setup:draft.setup,actions:draft.actions}
  assert.deepEqual(requests,[normalizedSubmission,normalizedSubmission])
  assert.deepEqual(opened.snapshot().entries[0].winter,winter)
  opened.close()
})

let finaleDraft
function completedFinale() {
  if (finaleDraft) return finaleDraft
  const fixture = automaticGames(144)
  const stats = {G:144,PA:288,AB:274,H:99,'2B':27,'3B':3,HR:14,BB:14,SO:140}
  const startingGrowth = {mit:47,power:54,discipline:66,stamina:61,trust:100,xp:1600,condition:78}
  const history = Array.from({length:9},(_,index) => ({seasonId:uuid(901+index),seasonNumber:index+1,stats}))
  fixture.setup.continuation = {
    careerId:history[0].seasonId,previousSeasonId:history.at(-1).seasonId,seasonNumber:10,startingGrowth,history,
  }
  finaleDraft = replayBaseballAnnualSubmission(fixture,{includeAtBats:false}).draft
  return finaleDraft
}

test('the first final-season choice survives a competing tab, lost acknowledgement, and reload', async () => {
  const draft = completedFinale()
  const {id,now,continuation} = draft.setup
  const repository = memoryRepository()
  await repository.insert(draft)
  const requests = []
  const receipt = {careerId:continuation.careerId,seasonId:id,seasonNumber:10,savedAt:now,stats:draft.career.stats,finish:'retired'}
  const transport = {settle:async payload => {
    requests.push(payload)
    assert.equal((await repository.read(id)).finish,'retired')
    if (requests.length === 1) throw failure('network_unavailable')
    if (requests.length === 2) return {status:'stored',receipt:{...receipt,finish:'active'}}
    return {status:'stored',receipt,duplicate:true}
  }}
  const first = await client(repository,9000,transport)
  const second = await client(repository,10000,transport)
  await assert.rejects(first.settle(id),{code:'invalid_command'})
  await assert.rejects(first.settle(id,'deferred'),{code:'invalid_command'})
  assert.equal(requests.length,0)

  const [original,rival] = await Promise.allSettled([first.settle(id,'retired'),second.settle(id,'active')])
  assert.equal(original.reason.code,'network_unavailable')
  assert.equal(rival.reason.code,'local_conflict')
  assert.deepEqual(await repository.read(id),{...draft,finish:'retired'})
  assert.equal(first.snapshot().entries[0].finish,'retired')
  assert.equal(second.snapshot().entries[0].finish,'retired')
  first.close()
  second.close()

  const reopened = await client(repository,11000,transport)
  await assert.rejects(reopened.settle(id,'active'),{code:'local_conflict'})
  await assert.rejects(reopened.settle(id),{code:'invalid_response'})
  assert.equal((await repository.read(id)).receipt,null)
  const saved = await reopened.settle(id)
  assert.deepEqual(saved.receipt,receipt)
  assert.deepEqual(requests,Array.from({length:3},() => ({setup:draft.setup,actions:draft.actions,finish:'retired'})))
  assert.deepEqual((await reopened.settle(id)).receipt,receipt)
  assert.equal(requests.length,3)
  assert.equal(reopened.snapshot().entries[0].receipt.finish,'retired')
  await assert.rejects(reopened.startNextSeason(id),{code:'season_limit'})
  reopened.close()
})

test('final-season backups can carry a choice without replacing settled or competing local ones', async () => {
  const draft = completedFinale()
  const {id} = draft.setup
  const repository = memoryRepository()
  await repository.insert(draft)
  const opened = await client(repository)
  const original = JSON.parse(await opened.exportSave(id))
  assert.equal(Object.hasOwn(original,'finish'),false)

  const selected = JSON.stringify({...original,finish:'active'})
  await opened.importSave(selected)
  assert.equal(opened.snapshot().entries[0].finish,'active')
  assert.equal((await repository.read(id)).receipt,null)
  assert.equal(opened.snapshot().entries[0].checkpoint.stats.PA,288)
  assert.equal(JSON.parse(await opened.exportSave(id)).finish,'active')

  const invalid = {...original,actions:[],finish:'retired'}
  await assert.rejects(opened.importSave(JSON.stringify(invalid)),{code:'local_data_invalid'})
  await assert.rejects(opened.importSave(JSON.stringify({...original,finish:null})),{code:'local_data_invalid'})
  const {setup,actions} = automaticGames(1)
  await assert.rejects(opened.importSave(JSON.stringify({format:'nextport-baseball-season-v1',setup,actions,finish:'retired'})),
    {code:'local_data_invalid'})
  await assert.rejects(opened.importSave(JSON.stringify({...original,finish:'retired'})),{code:'local_conflict'})
  assert.equal((await repository.read(id)).finish,'active')
  opened.close()

  const oldRepository = memoryRepository()
  const legacyReceipt = {careerId:draft.setup.continuation.careerId,seasonId:id,seasonNumber:10,savedAt:draft.setup.now,stats:draft.career.stats}
  await oldRepository.insert({...draft,receipt:legacyReceipt})
  const legacy = await client(oldRepository)
  assert.deepEqual((await legacy.settle(id)).receipt,legacyReceipt)
  await assert.rejects(legacy.importSave(selected),{code:'local_conflict'})
  assert.deepEqual((await oldRepository.read(id)).receipt,legacyReceipt)
  legacy.close()
})

test('server history exposes final status only on a complete tenth-season archive', async () => {
  const draft = completedFinale()
  const {id,continuation} = draft.setup
  const {careerId} = continuation
  const history = [...continuation.history,{seasonId:id,seasonNumber:10,stats:draft.career.stats}]
  const latest = {seasonId:id,seasonNumber:10,growth:draft.career.growth,profile,settings,source:'manual'}
  let response = {status:'ok',careerId,history,latest,finish:'active'}
  const opened = await client(memoryRepository(),5000,{history:async () => response})
  assert.equal((await opened.loadHistory(careerId)).finish,'active')
  assert.equal(opened.snapshot().confirmedHistories[careerId].finish,'active')
  await assert.rejects(opened.startNextSeason(careerId),{code:'season_limit'})
  response = {...response,finish:'retired'}
  assert.equal((await opened.loadHistory(careerId)).finish,'retired')
  response = {...response,history:history.slice(0,9),latest:{...latest,seasonId:history[8].seasonId,seasonNumber:9}}
  await assert.rejects(opened.loadHistory(careerId),{code:'invalid_response'})
  response = {status:'ok',careerId,history,latest}
  assert.equal(Object.hasOwn(await opened.loadHistory(careerId),'finish'),false)
  opened.close()
})

test('a confirmed retirement supersedes an older browser save without writing or losing the file', async () => {
  const final = completedFinale()
  const {careerId,history:prior} = final.setup.continuation
  const history = [...prior,{seasonId:final.setup.id,seasonNumber:10,stats:final.career.stats}]
  const latest = {seasonId:final.setup.id,seasonNumber:10,growth:final.career.growth,profile,settings,source:'manual'}
  const submission = automaticGames(1)
  submission.setup.id = careerId
  const backup = JSON.stringify({format:'nextport-baseball-season-v1',...submission})
  const response = {status:'ok',careerId,history,latest,finish:'retired'}
  let reads = 0
  const repository = memoryRepository()
  const opened = await client(repository,5100,{
    history:async id=>{reads++;assert.equal(id,careerId);return response},
    settle:()=>assert.fail('An archived browser draft must not submit'),
  })
  await opened.importSave(backup)
  assert.equal(reads,0)
  const before = await repository.read(careerId)
  const beforeExport = await opened.exportSave(careerId)
  const confirmed = await opened.loadHistory(careerId)
  const {entries,confirmedHistories} = opened.snapshot()
  assert.deepEqual(selectBaseballAnnualArchive(entries[0],careerId,confirmedHistories),confirmed)
  assert.equal(confirmed.finish,'retired')
  await assert.rejects(opened.settle(careerId),{code:'season_conflict'})
  await assert.rejects(opened.command(careerId,{type:'prepare',choice:'rest'}),{code:'season_conflict'})
  await assert.rejects(opened.advance(careerId,'current'),{code:'season_conflict'})
  await assert.rejects(opened.startNextSeason(careerId),{code:'season_limit'})
  assert.deepEqual(await repository.read(careerId),before)
  assert.equal(await opened.exportSave(careerId),beforeExport)
  assert.equal(reads,1)
  opened.close()
})

test('an imported continuation stays editable only when it extends the confirmed seasons', async () => {
  const repository = memoryRepository()
  const id = uuid(902), laterId = uuid(903)
  const stats = {G:144,PA:288,AB:274,H:99,'2B':27,'3B':3,HR:14,BB:14,SO:140}
  const growth = {mit:47,power:54,discipline:66,stamina:61,trust:100,xp:1600,condition:78}
  const first = {seasonId:id,seasonNumber:1,stats}
  const response = {status:'ok',careerId:id,history:[first],latest:{seasonId:id,seasonNumber:1,growth,profile,settings,source:'manual'}}
  let remote = response
  const requests = []
  const opened = await client(repository,5200,{
    history:async()=>{requests.push('history');return remote},
    settle:()=>assert.fail('Network during a season'),
  })
  const submission = automaticGames(1)
  submission.setup.continuation = {careerId:id,previousSeasonId:id,seasonNumber:2,startingGrowth:growth,history:[first]}
  await opened.loadHistory(id)
  const local = await opened.importSave(JSON.stringify({format:'nextport-baseball-season-v1',...submission}))
  assert.equal(selectBaseballAnnualArchive(opened.snapshot().entries[0],local.id,opened.snapshot().confirmedHistories),undefined)
  const started = await repository.read(local.id)
  const continued = await opened.startNextSeason(id)
  assert.equal(continued.id,local.id)
  assert.equal(continued.settings.pitchMode,'mixed')
  assert.deepEqual(await repository.read(local.id),started)
  assert.equal((await opened.advance(local.id,'current')).currentGameIndex,2)
  remote = {...response,history:[first,{seasonId:laterId,seasonNumber:2,stats}],latest:{...response.latest,seasonId:laterId,seasonNumber:2}}
  await opened.loadHistory(id)
  assert.equal(selectBaseballAnnualArchive(opened.snapshot().entries[0],local.id,opened.snapshot().confirmedHistories).latest.seasonId,laterId)
  await assert.rejects(opened.advance(local.id,'current'),{code:'season_conflict'})
  assert.equal((await opened.read(local.id)).career.currentGameIndex,2)
  assert.deepEqual(requests,['history','history'])
  opened.close()
})

test('a restart retains the supersession boundary and rechecks the server without caching the archive', async () => {
  const repository = memoryRepository()
  const {setup,actions} = automaticGames(1)
  const id = setup.id
  const stats = {G:144,PA:288,AB:274,H:99,'2B':27,'3B':3,HR:14,BB:14,SO:140}
  const growth = {mit:47,power:54,discipline:66,stamina:61,trust:100,xp:1600,condition:78}
  const history = Array.from({length:10},(_,index)=>({seasonId:index ? uuid(800+index) : id,seasonNumber:index+1,stats}))
  const response = {status:'ok',careerId:id,history,
    latest:{seasonId:history.at(-1).seasonId,seasonNumber:10,growth,profile,settings,source:'manual'},finish:'retired'}
  let serviceError, reads=0
  const transport = {
    history:async root=>{reads++;assert.equal(root,id);if(serviceError)throw failure(serviceError);return response},
    settle:()=>assert.fail('The obsolete browser save must never submit'),
  }
  const before = await client(repository,6200,transport)
  await before.importSave(JSON.stringify({format:'nextport-baseball-season-v1',setup,actions}))
  const backup = await before.exportSave(id)
  await before.loadHistory(id)
  assert.deepEqual(await repository.readArchiveMarker(id),{careerId:id,seasonIds:history.map(row=>row.seasonId)})
  before.close()

  serviceError='network_unavailable'
  const reopened = await client(repository,6300,transport)
  assert.equal(reads,1, 'Opening the storage never fetches')
  assert.deepEqual(reopened.snapshot().confirmedHistories,{})
  assert.equal(reopened.snapshot().entries[0].archiveCheckRequired,true)
  assert.equal((await reopened.read(id)).career.currentGameIndex,1)
  assert.equal(reads,2)
  assert.deepEqual(reopened.snapshot().confirmedHistories,{})
  await assert.rejects(reopened.command(id,{type:'prepare',choice:'rest'}),{code:'season_conflict'})
  await assert.rejects(reopened.settle(id),{code:'season_conflict'})
  assert.equal(await reopened.exportSave(id),backup)

  serviceError=undefined
  await reopened.read(id)
  assert.equal(reads,3)
  assert.equal(reopened.snapshot().confirmedHistories[id].finish,'retired')
  assert.equal(reopened.snapshot().entries[0].archiveCheckRequired,false)
  serviceError='not_found'
  await reopened.loadHistory(id)
  assert.deepEqual(reopened.snapshot().confirmedHistories,{})
  assert.equal(reopened.snapshot().entries[0].archiveCheckRequired,true)
  assert.equal(await reopened.exportSave(id),backup)
  reopened.close()
})
