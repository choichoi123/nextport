// Versioned compatibility copy: v1 remains immutable so existing saves can finish
// under their original count/ledger policy. Only v2 requires pinned growth.
import { BASEBALL_RULES, judgeBaseballTake } from './playground-baseball.mjs'
import { isBaseballAtBatPitchMode } from './playground-baseball-practice-pitches.mjs'
import { BASEBALL_AT_BAT_RULES, createBaseballAtBat, isBaseballAtBatPitchPolicyId, nextBaseballAtBatPitch, resolveBaseballAtBatPitch } from './playground-baseball-at-bat-v2.mjs'
import { BASEBALL_FIELD_MODEL, resolveBaseballFieldResult } from './playground-baseball-field.mjs'
import { BASEBALL_AT_BAT_SESSION_VERSION, createBaseballAtBatSession, validateBaseballAtBatSession } from './playground-baseball-at-bat-session-v2.mjs'
import { BASEBALL_TEAMS, validateBaseballPlayer } from './playground-baseball-teams.mjs'
import { BASEBALL_REGULAR_SEASON_ID, getBaseballRegularSeasonSchedule, getBaseballRegularTrainingGain } from './playground-baseball-career-schedule.mjs'

import { BASEBALL_GROWTH_RULES, createBaseballGrowthSnapshot, validateBaseballGrowthSnapshot, judgeBaseballGrowthSwing as judgeBaseballSwing } from './playground-baseball-growth.mjs'

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
const clone=value=>JSON.parse(JSON.stringify(value))
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype
const exact=(value,required,optional=[])=>object(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>[...required,...optional].includes(key))
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:object(value)?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value)
const same=(a,b)=>canonical(a)===canonical(b)
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value
const uint32=value=>Number.isInteger(value)&&value>=0&&value<=0xffffffff
const fail=(code,message='Invalid baseball career value.')=>{throw Object.assign(new Error(message),{code})}
const assert=(value,code='invalid',message)=>{if(!value)fail(code,message)}
const hashKeys=['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','careerHash','growthHash']
const dHashKeys=hashKeys.filter(key=>key!=='careerHash')
const growthKeys=['mit','power','discipline','stamina','trust','xp','condition']
const statKeys=['G','PA','AB','H','2B','3B','HR','BB','SO']
const zeroStats=()=>Object.fromEntries(statKeys.map(key=>[key,0]))
const zeroDeltas=()=>Object.fromEntries(growthKeys.map(key=>[key,0]))
const sources=new Set(['manual','development'])
const appearanceSources=new Set(['manual','automatic','development'])
const choices=new Set(['mit','power','discipline','stamina','rest'])
const outcomes=new Set(['walk','strikeout-looking','strikeout-swinging','single','double','triple','home-run','flyout','lineout','groundout'])

// These are the trial rules and the shared batting settings. Regular seasons
// use their own pace for the two ability rewards in rewardFor.
export const BASEBALL_CAREER_RULES=freeze({
  id:'baseball-career-v2',automaticPolicyId:'baseball-career-automatic-v2',games:3,appearancesPerGame:2,
  initial:{mit:40,power:40,discipline:40,stamina:40,trust:40,xp:0,condition:80},abilityMaximum:100,conditionMaximum:100,
  training:{ability:2,xp:2,condition:-6},recovery:{condition:15},appearance:{xp:3,trust:1,condition:-3},
  game:{xp:5,discipline:1},objective:{xp:1},automaticPitchBudget:256,
  days:[1,4,7],
})
const ids={atBatId:BASEBALL_AT_BAT_RULES.id,pitchPolicyId:BASEBALL_AT_BAT_RULES.pitchPolicyId,fieldModelId:BASEBALL_FIELD_MODEL.version,
  sessionId:BASEBALL_AT_BAT_SESSION_VERSION,growthPolicyId:BASEBALL_GROWTH_RULES.id,careerId:BASEBALL_CAREER_RULES.id,automaticPolicyId:BASEBALL_CAREER_RULES.automaticPolicyId}

export const BASEBALL_ANNUAL_APPEARANCES_PER_GAME = 3

export function getBaseballCareerAppearancesPerGame(save) {
  return save?.appearancesPerGame ?? BASEBALL_CAREER_RULES.appearancesPerGame
}

function versionsOf(value){
  assert(exact(value,hashKeys,Object.keys(ids))&&hashKeys.every(key=>typeof value[key]==='string'&&/^[a-f0-9]{64}$/.test(value[key])))
  const {pitchPolicyId=BASEBALL_AT_BAT_RULES.pitchPolicyId}=value
  assert(isBaseballAtBatPitchPolicyId(pitchPolicyId),'version-mismatch')
  for(const [key,id]of Object.entries(ids))if(key!=='pitchPolicyId')assert(value[key]===undefined||value[key]===id,'version-mismatch')
  return {...Object.fromEntries(hashKeys.map(key=>[key,value[key]])),...ids,pitchPolicyId}
}
const snapshotFor=(save,careerRevision=save.revision)=>createBaseballGrowthSnapshot({careerId:save.id,careerRevision,gameIndex:save.currentGameIndex,
  slot:save.games[save.currentGameIndex].appearances.length+1,mit:save.growth.mit,power:save.growth.power})
const atBatVersionKeys=[...dHashKeys,'atBatId','pitchPolicyId','fieldModelId','sessionId','growthPolicyId']
const dVersions=save=>Object.fromEntries(atBatVersionKeys.map(key=>[key,save.versions[key]]))
const checkVersions=(save,atBat)=>assert(same(dVersions(save),atBat.versions),'version-mismatch')
function settingsOf(value){
  assert(exact(value,['baseSpeedKmh','pitchMode'])&&Number.isFinite(value.baseSpeedKmh)&&value.baseSpeedKmh>=80&&value.baseSpeedKmh<=160
    &&isBaseballAtBatPitchMode(value.pitchMode))
  return clone(value)
}
function profileOf(value){
  assert(exact(value,['name','jerseyNumber','teamId','handedness']))
  const checked=validateBaseballPlayer(value);assert(checked.valid)
  return clone(checked.player)
}
const gameStats=game=>{
  const result=zeroStats();result.G=game.status==='scheduled'?0:1
  for(const appearance of game.appearances)for(const key of statKeys.slice(1))result[key]+=appearance.stats[key]
  return result
}
const totalStats=games=>games.reduce((sum,game)=>{const stats=gameStats(game);for(const key of statKeys)sum[key]+=stats[key];return sum},zeroStats())
function statsForOutcome(outcome){
  assert(outcomes.has(outcome));const stats=zeroStats();delete stats.G;stats.PA=1
  if(outcome==='walk')stats.BB=1
  else{stats.AB=1;if(outcome.startsWith('strikeout-'))stats.SO=1
    if(['single','double','triple','home-run'].includes(outcome)){stats.H=1;if(outcome==='double')stats['2B']=1;if(outcome==='triple')stats['3B']=1;if(outcome==='home-run')stats.HR=1}}
  return stats
}
function rewardFor({kind,choice,gameIndex,scheduleId,priorTraining=0}){
  const regular=scheduleId===BASEBALL_REGULAR_SEASON_ID
  if(kind==='preparation'){
    if(choice==='rest')return BASEBALL_CAREER_RULES.recovery
    const {ability,xp,condition}=BASEBALL_CAREER_RULES.training
    return {[choice]:regular?getBaseballRegularTrainingGain(priorTraining):ability,xp,condition}
  }
  if(kind==='game'&&regular)return {xp:BASEBALL_CAREER_RULES.game.xp,discipline:(gameIndex+1)%8===0?1:0}
  return BASEBALL_CAREER_RULES[kind]
}
const ratesFor=stats=>({AVG:stats.AB?stats.H/stats.AB:null,SLG:stats.AB?(stats.H+stats['2B']+2*stats['3B']+3*stats.HR)/stats.AB:null,
  totalBases:stats.H+stats['2B']+2*stats['3B']+3*stats.HR})

export function sumBaseballCareerStats(records){
  const stats=zeroStats()
  for(const record of records){
    assert(exact(record,statKeys)&&statKeys.every(key=>Number.isSafeInteger(record[key])&&record[key]>=0))
    assert(record.PA===record.AB+record.BB&&record.AB>=record.H+record.SO&&record.H>=record['2B']+record['3B']+record.HR)
    for(const key of statKeys){stats[key]+=record[key];assert(Number.isSafeInteger(stats[key]))}
  }
  return {stats,rates:ratesFor(stats)}
}

function seasonStartingGrowth(scheduleId,value){
  assert(scheduleId===BASEBALL_REGULAR_SEASON_ID&&exact(value,growthKeys)
    &&growthKeys.every(key=>Number.isSafeInteger(value[key])&&value[key]>=0&&(key==='xp'||value[key]<=100)))
  return clone(value)
}
function signature(value){
  // A compact equality checksum, not an authentication or anti-cheat signature.
  let result=0x811c9dc5
  for(const char of canonical(value)){result^=char.charCodeAt(0);result=Math.imul(result,0x01000193)}
  return (result>>>0).toString(16).padStart(8,'0')
}
function mix(value){let x=value>>>0;x=Math.imul(x^x>>>16,0x21f0aaad);x=Math.imul(x^x>>>15,0x735a2d97);return (x^x>>>15)>>>0}

export function createBaseballCareerSave({id,profile,versions,seed,now,scheduleId,startingGrowth,appearancesPerGame,source='manual',settings={baseSpeedKmh:120,pitchMode:'mixed'}}={}){
  assert(UUID.test(id)&&uint32(seed)&&iso(now)&&sources.has(source))
  assert(scheduleId===undefined||scheduleId===BASEBALL_REGULAR_SEASON_ID)
  assert(appearancesPerGame===undefined||(scheduleId===BASEBALL_REGULAR_SEASON_ID&&appearancesPerGame===BASEBALL_ANNUAL_APPEARANCES_PER_GAME))
  const openingGrowth=startingGrowth===undefined?undefined:seasonStartingGrowth(scheduleId,startingGrowth)
  const player=profileOf(profile),opponents=BASEBALL_TEAMS.filter(team=>team.id!==player.teamId)
  const fixtures=scheduleId?getBaseballRegularSeasonSchedule(player.teamId):BASEBALL_CAREER_RULES.days.map((day,index)=>({
    day,opponentId:opponents[(index+seed%opponents.length)%opponents.length].id,home:index%2===0}))
  const games=fixtures.map((fixture,index)=>({id:`${id}:game:${index+1}`,ordinal:index+1,...fixture,
    status:'scheduled',preparation:null,appearances:[],stats:zeroStats()}))
  return freeze({schemaVersion:2,id,revision:1,createdAt:now,updatedAt:now,source,profile:player,versions:versionsOf(versions),settings:settingsOf(settings),seed,
    ...(scheduleId?{scheduleId}:{}),...(openingGrowth?{startingGrowth:openingGrowth}:{}),
    ...(appearancesPerGame===undefined?{}:{appearancesPerGame}),growth:clone(openingGrowth??BASEBALL_CAREER_RULES.initial),
    games,activeAtBat:null,currentGameIndex:0,ledger:[],status:'active',stats:zeroStats()})
}

export function validateBaseballCareerSave(save){
  assert(exact(save,['schemaVersion','id','revision','createdAt','updatedAt','source','profile','versions','settings','seed','growth','games','activeAtBat','currentGameIndex','ledger','status','stats'],['scheduleId','startingGrowth','appearancesPerGame']))
  assert(save.schemaVersion===2&&UUID.test(save.id)&&Number.isSafeInteger(save.revision)&&save.revision>=1&&uint32(save.seed)&&sources.has(save.source))
  assert(!Object.hasOwn(save,'scheduleId')||save.scheduleId===BASEBALL_REGULAR_SEASON_ID)
  assert(!Object.hasOwn(save,'appearancesPerGame')
    ||(save.scheduleId===BASEBALL_REGULAR_SEASON_ID&&save.appearancesPerGame===BASEBALL_ANNUAL_APPEARANCES_PER_GAME))
  const appearancesPerGame=getBaseballCareerAppearancesPerGame(save)
  assert(iso(save.createdAt)&&iso(save.updatedAt)&&save.updatedAt>=save.createdAt)
  assert(same(profileOf(save.profile),save.profile)&&same(settingsOf(save.settings),save.settings)&&same(versionsOf(save.versions),save.versions))
  const fixtures=save.scheduleId?getBaseballRegularSeasonSchedule(save.profile.teamId):null
  const gamesCount=fixtures?.length??BASEBALL_CAREER_RULES.games
  assert(Array.isArray(save.games)&&save.games.length===gamesCount&&Number.isInteger(save.currentGameIndex)&&save.currentGameIndex>=0&&save.currentGameIndex<=gamesCount)
  assert(Array.isArray(save.ledger)&&exact(save.growth,growthKeys)&&exact(save.stats,statKeys))
  const eventIds=new Set(),appearanceIds=new Set(),expectedEvents=[]
  for(const event of save.ledger){
    assert(exact(event,['id','kind','gameIndex','atBatId','choice','deltas','at'])&&typeof event.id==='string'&&!eventIds.has(event.id))
    eventIds.add(event.id)
    assert(['preparation','appearance','game','objective'].includes(event.kind)&&Number.isInteger(event.gameIndex)&&event.gameIndex>=0&&event.gameIndex<gamesCount)
    assert(event.atBatId===null||UUID.test(event.atBatId));assert(event.choice===null||choices.has(event.choice))
    assert(exact(event.deltas,growthKeys)&&growthKeys.every(key=>Number.isSafeInteger(event.deltas[key]))&&iso(event.at)&&event.at>=save.createdAt&&event.at<=save.updatedAt)
  }
  for(const [index,game]of save.games.entries()){
    const fixture=fixtures?.[index]
    const intendedOpponent=fixture?game?.opponentId===fixture.opponentId:BASEBALL_TEAMS.some(team=>team.id===game?.opponentId&&team.id!==save.profile.teamId)
    assert(exact(game,['id','ordinal','day','opponentId','home','status','preparation','appearances','stats'])&&game.id===`${save.id}:game:${index+1}`
      &&game.ordinal===index+1&&game.day===(fixture?.day??BASEBALL_CAREER_RULES.days[index])&&game.home===(fixture?.home??(index%2===0))
      &&intendedOpponent&&['scheduled','active','complete'].includes(game.status))
    assert(Array.isArray(game.appearances)&&game.appearances.length<=appearancesPerGame)
    assert(game.preparation===null||exact(game.preparation,['choice','at'])&&choices.has(game.preparation.choice)&&iso(game.preparation.at))
    assert(game.preparation===null?!eventIds.has(`${game.id}:preparation`):eventIds.has(`${game.id}:preparation`))
    if(game.preparation)expectedEvents.push({id:`${game.id}:preparation`,kind:'preparation',gameIndex:index,atBatId:null,choice:game.preparation.choice})
    if(game.status!=='scheduled')assert(game.preparation!==null)
    if(game.status==='scheduled')assert(game.appearances.length===0)
    if(game.status==='complete')assert(game.appearances.length===appearancesPerGame&&eventIds.has(`${game.id}:game`))
    else assert(game.appearances.length<appearancesPerGame&&!eventIds.has(`${game.id}:game`))
    for(const [slot,appearance]of game.appearances.entries()){
      assert(exact(appearance,['id','slot','source','origin','outcome','stats','pitchCount','finishedAt','resultSignature','growthSnapshot'])&&UUID.test(appearance.id)&&!appearanceIds.has(appearance.id)
        &&appearance.slot===slot+1&&appearanceSources.has(appearance.source)&&appearance.origin===save.source
        &&Number.isSafeInteger(appearance.pitchCount)&&appearance.pitchCount>=1&&iso(appearance.finishedAt)&&typeof appearance.resultSignature==='string'&&/^[a-f0-9]{8}$/.test(appearance.resultSignature))
      validateBaseballGrowthSnapshot(appearance.growthSnapshot)
      assert(appearance.growthSnapshot.careerId===save.id&&appearance.growthSnapshot.gameIndex===index&&appearance.growthSnapshot.slot===slot+1&&appearance.growthSnapshot.careerRevision<save.revision)
      appearanceIds.add(appearance.id)
      assert(exact(appearance.stats,statKeys.slice(1))&&same(appearance.stats,statsForOutcome(appearance.outcome)))
      assert(eventIds.has(`${appearance.id}:appearance`))
      expectedEvents.push({id:`${appearance.id}:appearance`,kind:'appearance',gameIndex:index,atBatId:appearance.id,choice:null})
    }
    if(game.status==='complete'){
      expectedEvents.push({id:`${game.id}:game`,kind:'game',gameIndex:index,atBatId:null,choice:null})
      if(game.appearances.some(row=>row.stats.H||row.stats.BB))expectedEvents.push({id:`${game.id}:objective`,kind:'objective',gameIndex:index,atBatId:null,choice:null})
    }
    assert(same(game.stats,gameStats(game)))
    if(index<save.currentGameIndex)assert(game.status==='complete')
    if(index>save.currentGameIndex)assert(game.status==='scheduled'&&game.preparation===null)
  }
  if(save.activeAtBat!==null){
    const active=save.activeAtBat,game=save.games[save.currentGameIndex]
    assert(exact(active,['id','gameIndex','slot','source','config','growthSnapshot'])&&UUID.test(active.id)&&!appearanceIds.has(active.id)&&game?.status==='active'
      &&active.gameIndex===save.currentGameIndex&&active.slot===game.appearances.length+1&&active.source===save.source)
    validateBaseballGrowthSnapshot(active.growthSnapshot)
    assert(active.growthSnapshot.careerId===save.id&&active.growthSnapshot.gameIndex===active.gameIndex&&active.growthSnapshot.slot===active.slot
      &&active.growthSnapshot.careerRevision<save.revision&&active.growthSnapshot.mit===save.growth.mit&&active.growthSnapshot.power===save.growth.power)
    assert(exact(active.config,['handedness','pitcherHandedness','baseSpeedKmh','pitchMode'])&&active.config.handedness===save.profile.handedness
      &&['left','right'].includes(active.config.pitcherHandedness)&&active.config.baseSpeedKmh===save.settings.baseSpeedKmh&&active.config.pitchMode===save.settings.pitchMode)
  }
  assert(save.currentGameIndex===gamesCount?save.status==='complete'&&save.activeAtBat===null:save.status==='active'&&save.games[save.currentGameIndex].status!=='complete')
  assert(expectedEvents.length===save.ledger.length)
  const growth=Object.hasOwn(save,'startingGrowth')?seasonStartingGrowth(save.scheduleId,save.startingGrowth):clone(BASEBALL_CAREER_RULES.initial)
  const preparations=new Map()
  for(const [index,event]of save.ledger.entries()){
    const expected=expectedEvents[index];assert(Object.keys(expected).every(key=>event[key]===expected[key]))
    if(event.kind==='appearance'){const appearance=save.games[event.gameIndex].appearances.find(row=>row.id===event.atBatId);assert(appearance.growthSnapshot.mit===growth.mit&&appearance.growthSnapshot.power===growth.power)}
    const priorTraining=preparations.get(event.choice)??0
    const deltas=rewardFor({...event,scheduleId:save.scheduleId,priorTraining})
    if(event.kind==='preparation')preparations.set(event.choice,priorTraining+1)
    for(const key of growthKeys){const requested=growth[key]+(deltas[key]||0),next=key==='xp'?requested:Math.max(0,Math.min(100,requested));assert(event.deltas[key]===next-growth[key]);growth[key]=next}
  }
  assert(same(save.stats,totalStats(save.games))&&same(save.growth,growth))
  return true
}

function transition(save,{expectedRevision,now}){
  validateBaseballCareerSave(save)
  assert(expectedRevision===save.revision,'conflict','The player save has changed.')
  assert(iso(now)&&now>=save.updatedAt)
  const next=clone(save);next.revision+=1;next.updatedAt=now;return next
}
function available(save){
  assert(save.status==='active','complete','The season is complete.')
  assert(save.activeAtBat===null,'at-bat-active','Finish the current appearance first.')
  const game=save.games[save.currentGameIndex]
  assert(game.preparation!==null,'preparation-required','Choose one preparation for this game first.')
  return game
}
function addEvent(save,{id,kind,gameIndex,atBatId=null,choice=null,deltas,at}){
  assert(!save.ledger.some(event=>event.id===id),'conflict','This growth event was already awarded.')
  const applied=zeroDeltas()
  for(const key of growthKeys){
    const requested=save.growth[key]+(deltas[key]||0),next=key==='xp'?requested:Math.max(0,Math.min(100,requested))
    assert(Number.isSafeInteger(next)&&next>=0);applied[key]=next-save.growth[key];save.growth[key]=next
  }
  save.ledger.push({id,kind,gameIndex,atBatId,choice,deltas:applied,at})
}
function completedSummary(atBat,source,origin,slot){
  assert(atBat.state.status==='complete'&&atBat.finalReceipt&&same(atBat.finalReceipt.stats,atBat.state.stats)&&atBat.finalReceipt.outcome===atBat.state.outcome)
  return {id:atBat.id,slot,source,origin,outcome:atBat.state.outcome,stats:clone(atBat.state.stats),pitchCount:atBat.state.pitchCount,
    finishedAt:atBat.finalReceipt.completedAt,growthSnapshot:clone(atBat.growthSnapshot),resultSignature:signature({state:atBat.state,receipt:atBat.finalReceipt})}
}
function recordAppearance(next,atBat,source){
  const gameIndex=next.currentGameIndex,game=next.games[gameIndex],slot=game.appearances.length+1
  game.status='active';game.appearances.push(completedSummary(atBat,source,next.source,slot));next.activeAtBat=null
  addEvent(next,{id:`${atBat.id}:appearance`,kind:'appearance',gameIndex,atBatId:atBat.id,deltas:BASEBALL_CAREER_RULES.appearance,at:next.updatedAt})
  if(game.appearances.length===getBaseballCareerAppearancesPerGame(next)){
    game.status='complete'
    addEvent(next,{id:`${game.id}:game`,kind:'game',gameIndex,
      deltas:rewardFor({kind:'game',scheduleId:next.scheduleId,gameIndex}),at:next.updatedAt})
    if(game.appearances.some(row=>row.stats.H||row.stats.BB))addEvent(next,{id:`${game.id}:objective`,kind:'objective',gameIndex,deltas:BASEBALL_CAREER_RULES.objective,at:next.updatedAt})
    next.currentGameIndex+=1
    if(next.currentGameIndex===next.games.length)next.status='complete'
  }
  game.stats=gameStats(game);next.stats=totalStats(next.games)
}

export function createBaseballCareerManualAtBat(save,{id,seed,now}={}){
  validateBaseballCareerSave(save);available(save);assert(UUID.test(id)&&uint32(seed)&&iso(now)&&now>=save.updatedAt)
  return createBaseballAtBatSession({id,seed,now,source:save.source,versions:dVersions(save),growthSnapshot:snapshotFor(save),
    config:{handedness:save.profile.handedness,pitcherHandedness:seed%2?'left':'right',...save.settings}})
}

/** Automatic appearances use the same physical/count/field engine, not outcome rolls. */
export function simulateBaseballCareerAtBat(save,{id,seed,now,pitchBudget=BASEBALL_CAREER_RULES.automaticPitchBudget}={}){
  validateBaseballCareerSave(save)
  return simulateCareerAtBat(save,{id,seed,now,pitchBudget,careerRevision:save.revision})
}

function simulateCareerAtBat(save,{id,seed,now,pitchBudget,careerRevision}){
  available(save);assert(UUID.test(id)&&uint32(seed)&&iso(now)&&now>=save.updatedAt)
  assert(Number.isInteger(pitchBudget)&&pitchBudget>=0&&pitchBudget<=BASEBALL_CAREER_RULES.automaticPitchBudget)
  const config={handedness:save.profile.handedness,pitcherHandedness:seed%2?'left':'right',...save.settings}
  const growthSnapshot=snapshotFor(save,careerRevision)
  let state=createBaseballAtBat({id,seed,...config,growthSnapshot,pitchPolicyId:save.versions.pitchPolicyId}),random=seed
  const unit=()=>{random=mix(random+0x9e3779b9);return random/0x100000000},inputs=[]
  for(let n=0;state.status==='active';n++){
    assert(n<pitchBudget,'automatic-budget','Automatic simulation could not finish safely; the save remains unchanged.')
    const issued=nextBaseballAtBatPitch(state),pitch=issued.pitch,take=judgeBaseballTake(pitch),outside=take.outcome==='ball'
    const patience=.45+save.growth.discipline*.003
    const input=(outside?unit()<patience:unit()<.12)?{kind:'take'}:{kind:'swing',
      swingAtMs:pitch.flightTimeMs-110+(unit()*2-1)*(70+(100-save.growth.discipline)*.5+(100-save.growth.condition)*.2),
      aim:{x:pitch.target.x+(unit()*2-1)*.12,y:pitch.target.y+(unit()*2-1)*(.06+(100-save.growth.discipline)*.001)}}
    const result=input.kind==='take'?take:judgeBaseballSwing(pitch,{...input,handedness:config.handedness},growthSnapshot)
    const fieldResult=['contact','perfect'].includes(result.outcome)?resolveBaseballFieldResult(result):null
    state=resolveBaseballAtBatPitch(state,{...issued,result,fieldResult,source:'automatic'})
    inputs.push({pitchId:issued.pitchId,input})
  }
  return freeze({schemaVersion:2,revision:1,mode:'automatic',id,careerId:save.id,gameIndex:save.currentGameIndex,
    slot:save.games[save.currentGameIndex].appearances.length+1,source:'automatic',origin:save.source,createdAt:now,updatedAt:now,config,growthSnapshot,
    versions:dVersions(save),state,inputs,
    finalReceipt:{id:`${id}:final`,revision:1,outcome:state.outcome,stats:clone(state.stats),completedAt:now}})
}

/** Resolve only the remaining appearances of a prepared regular-season game. */
export function simulateBaseballCareerGame(save,{expectedRevision,now,idFactory,seedFactory}={}){
  const career=transition(save,{expectedRevision,now})
  assert(career.scheduleId===BASEBALL_REGULAR_SEASON_ID)
  const remaining=getBaseballCareerAppearancesPerGame(career)-available(career).appearances.length
  const atBats=[]
  for(let index=0;index<remaining;index++){
    const atBat=simulateCareerAtBat(career,{id:idFactory(),seed:seedFactory(),now,
      careerRevision:save.revision,pitchBudget:BASEBALL_CAREER_RULES.automaticPitchBudget})
    recordAppearance(career,atBat,'automatic')
    atBats.push(atBat)
  }
  validateBaseballCareerSave(career)
  return freeze({career,atBats})
}

export function validateBaseballCareerAutomaticAtBat(save,atBat){
  assert(exact(atBat,['schemaVersion','revision','mode','id','careerId','gameIndex','slot','source','origin','createdAt','updatedAt','config','versions','state','inputs','finalReceipt','growthSnapshot']))
  assert(atBat.schemaVersion===2&&atBat.revision===1&&atBat.mode==='automatic'&&UUID.test(atBat.id)&&atBat.careerId===save.id
    &&atBat.gameIndex===save.currentGameIndex&&atBat.slot===save.games[save.currentGameIndex].appearances.length+1&&atBat.source==='automatic'&&atBat.origin===save.source)
  checkVersions(save,atBat)
  validateBaseballGrowthSnapshot(atBat.growthSnapshot)
  assert(same(atBat.growthSnapshot,snapshotFor(save))&&same(atBat.state.growthSnapshot,atBat.growthSnapshot))
  assert(exact(atBat.config,['handedness','pitcherHandedness','baseSpeedKmh','pitchMode'])&&atBat.config.handedness===save.profile.handedness
    &&atBat.config.baseSpeedKmh===save.settings.baseSpeedKmh&&atBat.config.pitchMode===save.settings.pitchMode)
  assert(iso(atBat.createdAt)&&atBat.updatedAt===atBat.createdAt&&atBat.createdAt>=save.updatedAt&&Array.isArray(atBat.inputs)&&atBat.inputs.length===atBat.state?.pitchCount)
  let expected=createBaseballAtBat({id:atBat.id,seed:atBat.state.seed,...atBat.config,growthSnapshot:atBat.growthSnapshot,
    pitchPolicyId:save.versions.pitchPolicyId})
  for(const entry of atBat.inputs){
    assert(exact(entry,['pitchId','input'])&&object(entry.input))
    const issued=nextBaseballAtBatPitch(expected);assert(issued&&issued.pitchId===entry.pitchId)
    const input=entry.input;assert(input.kind==='take'?exact(input,['kind']):exact(input,['kind','swingAtMs','aim'])&&input.kind==='swing')
    const result=input.kind==='take'?judgeBaseballTake(issued.pitch):judgeBaseballSwing(issued.pitch,{...input,handedness:atBat.config.handedness},atBat.growthSnapshot)
    expected=resolveBaseballAtBatPitch(expected,{...issued,result,fieldResult:['contact','perfect'].includes(result.outcome)?resolveBaseballFieldResult(result):null,source:'automatic'})
  }
  assert(expected.status==='complete'&&same(expected,atBat.state)&&same(atBat.finalReceipt,{id:`${atBat.id}:final`,revision:1,outcome:expected.outcome,stats:expected.stats,completedAt:atBat.updatedAt}))
  return true
}

export function applyBaseballCareerCommand(save,command,{now,atBat}={}){
  assert(object(command)&&UUID.test(command.commandId)&&Number.isSafeInteger(command.expectedRevision))
  const next=transition(save,{expectedRevision:command.expectedRevision,now})
  assert(save.status==='active','complete')
  if(command.type==='prepare'){
    assert(exact(command,['commandId','expectedRevision','type','choice'])&&choices.has(command.choice))
    assert(save.activeAtBat===null,'at-bat-active')
    const game=next.games[next.currentGameIndex];assert(game.preparation===null&&game.status==='scheduled','preparation-complete')
    game.preparation={choice:command.choice,at:now}
    const priorTraining=save.ledger.filter(event=>event.kind==='preparation'&&event.choice===command.choice).length
    const deltas=rewardFor({kind:'preparation',choice:command.choice,gameIndex:next.currentGameIndex,scheduleId:next.scheduleId,priorTraining})
    addEvent(next,{id:`${game.id}:preparation`,kind:'preparation',gameIndex:next.currentGameIndex,choice:command.choice,deltas,at:now})
  }else if(command.type==='start-manual'){
    assert(exact(command,['commandId','expectedRevision','type']));available(save);validateBaseballAtBatSession(atBat);checkVersions(save,atBat)
    assert(same(atBat.growthSnapshot,snapshotFor(save)))
    assert(atBat.source===save.source&&atBat.state.status==='active'&&atBat.state.pitchCount===0&&atBat.revision===1&&atBat.pending===null
      &&atBat.config.handedness===save.profile.handedness&&atBat.config.baseSpeedKmh===save.settings.baseSpeedKmh&&atBat.config.pitchMode===save.settings.pitchMode)
    assert(!save.games.some(game=>game.appearances.some(row=>row.id===atBat.id)),'conflict')
    const game=next.games[next.currentGameIndex];game.status='active';game.stats=gameStats(game)
    next.activeAtBat={id:atBat.id,gameIndex:next.currentGameIndex,slot:game.appearances.length+1,source:atBat.source,config:clone(atBat.config),growthSnapshot:clone(atBat.growthSnapshot)}
    next.stats=totalStats(next.games)
  }else if(command.type==='simulate-at-bat'){
    assert(exact(command,['commandId','expectedRevision','type']));available(save);validateBaseballCareerAutomaticAtBat(save,atBat)
    assert(!save.games.some(game=>game.appearances.some(row=>row.id===atBat.id)),'conflict')
    recordAppearance(next,atBat,'automatic')
  }else fail('invalid','Unsupported career command.')
  validateBaseballCareerSave(next);return freeze(next)
}

/** Every D command advances the enclosing save, but only a completed PA earns anything. */
export function advanceBaseballCareerAtBat(save,atBat,{expectedRevision,now}={}){
  validateBaseballCareerSave(save);validateBaseballAtBatSession(atBat);checkVersions(save,atBat)
  const prior=save.games.flatMap(game=>game.appearances).find(row=>row.id===atBat.id)
  if(prior){
    assert(same(prior,completedSummary(atBat,atBat.source,save.source,prior.slot)),'conflict')
    return save
  }
  const next=transition(save,{expectedRevision,now}),active=save.activeAtBat
  assert(active&&active.id===atBat.id&&atBat.source===active.source&&same(atBat.config,active.config)&&same(atBat.growthSnapshot,active.growthSnapshot),'conflict')
  if(atBat.state.status==='complete')recordAppearance(next,atBat,atBat.source)
  validateBaseballCareerSave(next);return freeze(next)
}

export function publicBaseballCareerSave(save){
  validateBaseballCareerSave(save)
  const {seed:privateSeed,...view}=save;void privateSeed
  const statsBySource=Object.fromEntries([...appearanceSources].map(source=>{
    const games=save.games.map(game=>({...game,status:game.appearances.some(row=>row.source===source)?'active':'scheduled',appearances:game.appearances.filter(row=>row.source===source)}))
    return [source,totalStats(games)]
  }))
  const feedback=[]
  if(save.stats.H)feedback.push('first-hit')
  if(save.stats.HR)feedback.push('home-run-earned')
  if(save.stats.BB)feedback.push('walk-earned')
  if(save.stats.SO)feedback.push('strikeout-review')
  if(save.growth.condition<50)feedback.push('rest-advised')
  if(save.status==='complete')feedback.push(save.scheduleId?'regular-season-complete':'trial-complete')
  if(!feedback.length)feedback.push('next-opportunity')
  return freeze(clone({...view,rates:ratesFor(save.stats),statsBySource,feedback,trust:'server-recalculated-input-unverified'}))
}
