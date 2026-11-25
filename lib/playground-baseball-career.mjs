import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, judgeBaseballSwing, judgeBaseballTake } from './playground-baseball.mjs'
import { BASEBALL_AT_BAT_RULES, createBaseballAtBat, nextBaseballAtBatPitch, resolveBaseballAtBatPitch } from './playground-baseball-at-bat.mjs'
import { BASEBALL_FIELD_MODEL, resolveBaseballFieldResult } from './playground-baseball-field.mjs'
import { BASEBALL_AT_BAT_SESSION_VERSION, createBaseballAtBatSession, validateBaseballAtBatSession } from './playground-baseball-at-bat-session.mjs'
import { BASEBALL_TEAMS, validateBaseballPlayer } from './playground-baseball-teams.mjs'

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
const hashKeys=['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','careerHash']
const growthKeys=['power','discipline','stamina','trust','xp','condition']
const statKeys=['G','PA','AB','H','2B','3B','HR','BB','SO']
const zeroStats=()=>Object.fromEntries(statKeys.map(key=>[key,0]))
const zeroDeltas=()=>Object.fromEntries(growthKeys.map(key=>[key,0]))
const sources=new Set(['manual','development'])
const appearanceSources=new Set(['manual','automatic','development'])
const choices=new Set(['power','discipline','stamina','rest'])
const outcomes=new Set(['walk','strikeout-looking','strikeout-swinging','single','double','triple','home-run','flyout','lineout','groundout'])

// Conservative trial values. These never alter direct-hit physics or art.
export const BASEBALL_CAREER_RULES=freeze({
  id:'baseball-career-v1',automaticPolicyId:'baseball-career-automatic-v1',games:3,appearancesPerGame:2,
  initial:{power:40,discipline:40,stamina:40,trust:40,xp:0,condition:80},abilityMaximum:100,conditionMaximum:100,
  training:{ability:2,xp:2,condition:-6},recovery:{condition:15},appearance:{xp:3,trust:1,condition:-3},
  game:{xp:5,discipline:1},objective:{xp:1},automaticPitchBudget:256,
  days:[1,4,7],
})
const ids={atBatId:BASEBALL_AT_BAT_RULES.id,pitchPolicyId:BASEBALL_AT_BAT_RULES.pitchPolicyId,fieldModelId:BASEBALL_FIELD_MODEL.version,
  sessionId:BASEBALL_AT_BAT_SESSION_VERSION,careerId:BASEBALL_CAREER_RULES.id,automaticPolicyId:BASEBALL_CAREER_RULES.automaticPolicyId}

function versionsOf(value){
  assert(exact(value,hashKeys,Object.keys(ids))&&hashKeys.every(key=>typeof value[key]==='string'&&/^[a-f0-9]{64}$/.test(value[key])))
  for(const [key,id]of Object.entries(ids))assert(value[key]===undefined||value[key]===id,'version-mismatch')
  return {...Object.fromEntries(hashKeys.map(key=>[key,value[key]])),...ids}
}
const dVersions=save=>Object.fromEntries(hashKeys.slice(0,5).map(key=>[key,save.versions[key]]))
const checkVersions=(save,atBat)=>assert(hashKeys.slice(0,5).every(key=>save.versions[key]===atBat.versions?.[key]),'version-mismatch')
function settingsOf(value){
  assert(exact(value,['baseSpeedKmh','pitchMode'])&&Number.isFinite(value.baseSpeedKmh)&&value.baseSpeedKmh>=80&&value.baseSpeedKmh<=160
    &&['mixed',...BASEBALL_PITCH_TYPES.map(type=>type.id)].includes(value.pitchMode))
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
function rewardFor(kind,choice){
  if(kind==='preparation')return choice==='rest'?BASEBALL_CAREER_RULES.recovery:{[choice]:BASEBALL_CAREER_RULES.training.ability,xp:BASEBALL_CAREER_RULES.training.xp,condition:BASEBALL_CAREER_RULES.training.condition}
  return BASEBALL_CAREER_RULES[kind]
}
const ratesFor=stats=>({AVG:stats.AB?stats.H/stats.AB:null,SLG:stats.AB?(stats.H+stats['2B']+2*stats['3B']+3*stats.HR)/stats.AB:null,
  totalBases:stats.H+stats['2B']+2*stats['3B']+3*stats.HR})
function signature(value){
  // A compact equality checksum, not an authentication or anti-cheat signature.
  let result=0x811c9dc5
  for(const char of canonical(value)){result^=char.charCodeAt(0);result=Math.imul(result,0x01000193)}
  return (result>>>0).toString(16).padStart(8,'0')
}
function mix(value){let x=value>>>0;x=Math.imul(x^x>>>16,0x21f0aaad);x=Math.imul(x^x>>>15,0x735a2d97);return (x^x>>>15)>>>0}

export function createBaseballCareerSave({id,profile,versions,seed,now,source='manual',settings={baseSpeedKmh:120,pitchMode:'mixed'}}={}){
  assert(UUID.test(id)&&uint32(seed)&&iso(now)&&sources.has(source))
  const player=profileOf(profile),opponents=BASEBALL_TEAMS.filter(team=>team.id!==player.teamId)
  const games=BASEBALL_CAREER_RULES.days.map((day,index)=>({id:`${id}:game:${index+1}`,ordinal:index+1,day,
    opponentId:opponents[(index+seed%opponents.length)%opponents.length].id,home:index%2===0,status:'scheduled',preparation:null,appearances:[],stats:zeroStats()}))
  return freeze({schemaVersion:1,id,revision:1,createdAt:now,updatedAt:now,source,profile:player,versions:versionsOf(versions),settings:settingsOf(settings),seed,
    growth:clone(BASEBALL_CAREER_RULES.initial),games,activeAtBat:null,currentGameIndex:0,ledger:[],status:'active',stats:zeroStats()})
}

function ledgerGrowth(ledger){
  const growth=clone(BASEBALL_CAREER_RULES.initial)
  for(const event of ledger)for(const key of growthKeys){growth[key]+=event.deltas[key];assert(Number.isSafeInteger(growth[key])&&growth[key]>=0&&(key==='xp'||growth[key]<=100))}
  return growth
}
export function validateBaseballCareerSave(save){
  assert(exact(save,['schemaVersion','id','revision','createdAt','updatedAt','source','profile','versions','settings','seed','growth','games','activeAtBat','currentGameIndex','ledger','status','stats']))
  assert(save.schemaVersion===1&&UUID.test(save.id)&&Number.isSafeInteger(save.revision)&&save.revision>=1&&uint32(save.seed)&&sources.has(save.source))
  assert(iso(save.createdAt)&&iso(save.updatedAt)&&save.updatedAt>=save.createdAt)
  assert(same(profileOf(save.profile),save.profile)&&same(settingsOf(save.settings),save.settings)&&same(versionsOf(save.versions),save.versions))
  assert(Array.isArray(save.games)&&save.games.length===3&&Number.isInteger(save.currentGameIndex)&&save.currentGameIndex>=0&&save.currentGameIndex<=3)
  assert(Array.isArray(save.ledger)&&exact(save.growth,growthKeys)&&exact(save.stats,statKeys))
  const eventIds=new Set(),appearanceIds=new Set(),expectedEvents=[]
  for(const event of save.ledger){
    assert(exact(event,['id','kind','gameIndex','atBatId','choice','deltas','at'])&&typeof event.id==='string'&&!eventIds.has(event.id))
    eventIds.add(event.id)
    assert(['preparation','appearance','game','objective'].includes(event.kind)&&Number.isInteger(event.gameIndex)&&event.gameIndex>=0&&event.gameIndex<3)
    assert(event.atBatId===null||UUID.test(event.atBatId));assert(event.choice===null||choices.has(event.choice))
    assert(exact(event.deltas,growthKeys)&&growthKeys.every(key=>Number.isSafeInteger(event.deltas[key]))&&iso(event.at)&&event.at>=save.createdAt&&event.at<=save.updatedAt)
  }
  for(const [index,game]of save.games.entries()){
    assert(exact(game,['id','ordinal','day','opponentId','home','status','preparation','appearances','stats'])&&game.id===`${save.id}:game:${index+1}`
      &&game.ordinal===index+1&&game.day===BASEBALL_CAREER_RULES.days[index]&&game.home===(index%2===0)
      &&BASEBALL_TEAMS.some(team=>team.id===game.opponentId&&team.id!==save.profile.teamId)&&['scheduled','active','complete'].includes(game.status))
    assert(Array.isArray(game.appearances)&&game.appearances.length<=2)
    assert(game.preparation===null||exact(game.preparation,['choice','at'])&&choices.has(game.preparation.choice)&&iso(game.preparation.at))
    assert(game.preparation===null?!eventIds.has(`${game.id}:preparation`):eventIds.has(`${game.id}:preparation`))
    if(game.preparation)expectedEvents.push({id:`${game.id}:preparation`,kind:'preparation',gameIndex:index,atBatId:null,choice:game.preparation.choice})
    if(game.status!=='scheduled')assert(game.preparation!==null)
    if(game.status==='scheduled')assert(game.appearances.length===0)
    if(game.status==='complete')assert(game.appearances.length===2&&eventIds.has(`${game.id}:game`))
    else assert(game.appearances.length<2&&!eventIds.has(`${game.id}:game`))
    for(const [slot,appearance]of game.appearances.entries()){
      assert(exact(appearance,['id','slot','source','origin','outcome','stats','pitchCount','finishedAt','resultSignature'])&&UUID.test(appearance.id)&&!appearanceIds.has(appearance.id)
        &&appearance.slot===slot+1&&appearanceSources.has(appearance.source)&&appearance.origin===save.source
        &&Number.isSafeInteger(appearance.pitchCount)&&appearance.pitchCount>=1&&iso(appearance.finishedAt)&&typeof appearance.resultSignature==='string'&&/^[a-f0-9]{8}$/.test(appearance.resultSignature))
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
    assert(exact(active,['id','gameIndex','slot','source','config'])&&UUID.test(active.id)&&!appearanceIds.has(active.id)&&game?.status==='active'
      &&active.gameIndex===save.currentGameIndex&&active.slot===game.appearances.length+1&&active.source===save.source)
    assert(exact(active.config,['handedness','pitcherHandedness','baseSpeedKmh','pitchMode'])&&active.config.handedness===save.profile.handedness
      &&['left','right'].includes(active.config.pitcherHandedness)&&active.config.baseSpeedKmh===save.settings.baseSpeedKmh&&active.config.pitchMode===save.settings.pitchMode)
  }
  assert(save.currentGameIndex===3?save.status==='complete'&&save.activeAtBat===null:save.status==='active'&&save.games[save.currentGameIndex].status!=='complete')
  assert(expectedEvents.length===save.ledger.length)
  const growth=clone(BASEBALL_CAREER_RULES.initial)
  for(const [index,event]of save.ledger.entries()){
    const expected=expectedEvents[index];assert(Object.keys(expected).every(key=>event[key]===expected[key]))
    const deltas=rewardFor(event.kind,event.choice)
    for(const key of growthKeys){const requested=growth[key]+(deltas[key]||0),next=key==='xp'?requested:Math.max(0,Math.min(100,requested));assert(event.deltas[key]===next-growth[key]);growth[key]=next}
  }
  assert(same(save.stats,totalStats(save.games))&&same(save.growth,ledgerGrowth(save.ledger)))
  return true
}

function transition(save,{expectedRevision,now}){
  validateBaseballCareerSave(save)
  assert(expectedRevision===save.revision,'conflict','The player save has changed.')
  assert(iso(now)&&now>=save.updatedAt)
  const next=clone(save);next.revision+=1;next.updatedAt=now;return next
}
function available(save){
  assert(save.status==='active','complete','The three-game trial is complete.')
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
    finishedAt:atBat.finalReceipt.completedAt,resultSignature:signature({state:atBat.state,receipt:atBat.finalReceipt})}
}
function recordAppearance(next,atBat,source){
  const gameIndex=next.currentGameIndex,game=next.games[gameIndex],slot=game.appearances.length+1
  game.status='active';game.appearances.push(completedSummary(atBat,source,next.source,slot));next.activeAtBat=null
  addEvent(next,{id:`${atBat.id}:appearance`,kind:'appearance',gameIndex,atBatId:atBat.id,deltas:BASEBALL_CAREER_RULES.appearance,at:next.updatedAt})
  if(game.appearances.length===2){
    game.status='complete'
    addEvent(next,{id:`${game.id}:game`,kind:'game',gameIndex,deltas:BASEBALL_CAREER_RULES.game,at:next.updatedAt})
    if(game.appearances.some(row=>row.stats.H||row.stats.BB))addEvent(next,{id:`${game.id}:objective`,kind:'objective',gameIndex,deltas:BASEBALL_CAREER_RULES.objective,at:next.updatedAt})
    next.currentGameIndex+=1
    if(next.currentGameIndex===3)next.status='complete'
  }
  game.stats=gameStats(game);next.stats=totalStats(next.games)
}

export function createBaseballCareerManualAtBat(save,{id,seed,now}={}){
  validateBaseballCareerSave(save);available(save);assert(UUID.test(id)&&uint32(seed)&&iso(now)&&now>=save.updatedAt)
  return createBaseballAtBatSession({id,seed,now,source:save.source,versions:dVersions(save),
    config:{handedness:save.profile.handedness,pitcherHandedness:seed%2?'left':'right',...save.settings}})
}

/** Automatic appearances use the same physical/count/field engine, not outcome rolls. */
export function simulateBaseballCareerAtBat(save,{id,seed,now,pitchBudget=BASEBALL_CAREER_RULES.automaticPitchBudget}={}){
  validateBaseballCareerSave(save);available(save);assert(UUID.test(id)&&uint32(seed)&&iso(now)&&now>=save.updatedAt)
  assert(Number.isInteger(pitchBudget)&&pitchBudget>=0&&pitchBudget<=BASEBALL_CAREER_RULES.automaticPitchBudget)
  const config={handedness:save.profile.handedness,pitcherHandedness:seed%2?'left':'right',...save.settings}
  let state=createBaseballAtBat({id,seed,...config}),random=seed
  const unit=()=>{random=mix(random+0x9e3779b9);return random/0x100000000},inputs=[]
  for(let n=0;state.status==='active';n++){
    assert(n<pitchBudget,'automatic-budget','Automatic simulation could not finish safely; the save remains unchanged.')
    const issued=nextBaseballAtBatPitch(state),pitch=issued.pitch,take=judgeBaseballTake(pitch),outside=take.outcome==='ball'
    const patience=.45+save.growth.discipline*.003
    const input=(outside?unit()<patience:unit()<.12)?{kind:'take'}:{kind:'swing',
      swingAtMs:pitch.flightTimeMs-110+(unit()*2-1)*(70+(100-save.growth.discipline)*.5+(100-save.growth.condition)*.2),
      aim:{x:pitch.target.x+(unit()*2-1)*(.06+(100-save.growth.power)*.001),y:pitch.target.y+(unit()*2-1)*(.06+(100-save.growth.discipline)*.001)}}
    const result=input.kind==='take'?take:judgeBaseballSwing(pitch,{...input,handedness:config.handedness})
    const fieldResult=['contact','perfect'].includes(result.outcome)?resolveBaseballFieldResult(result):null
    state=resolveBaseballAtBatPitch(state,{...issued,result,fieldResult,source:'automatic'})
    inputs.push({pitchId:issued.pitchId,input})
  }
  return freeze({schemaVersion:1,revision:1,mode:'automatic',id,careerId:save.id,gameIndex:save.currentGameIndex,
    slot:save.games[save.currentGameIndex].appearances.length+1,source:'automatic',origin:save.source,createdAt:now,updatedAt:now,config,
    versions:{...dVersions(save),atBatId:ids.atBatId,pitchPolicyId:ids.pitchPolicyId,fieldModelId:ids.fieldModelId,sessionId:ids.sessionId},state,inputs,
    finalReceipt:{id:`${id}:final`,revision:1,outcome:state.outcome,stats:clone(state.stats),completedAt:now}})
}

export function validateBaseballCareerAutomaticAtBat(save,atBat){
  assert(exact(atBat,['schemaVersion','revision','mode','id','careerId','gameIndex','slot','source','origin','createdAt','updatedAt','config','versions','state','inputs','finalReceipt']))
  assert(atBat.schemaVersion===1&&atBat.revision===1&&atBat.mode==='automatic'&&UUID.test(atBat.id)&&atBat.careerId===save.id
    &&atBat.gameIndex===save.currentGameIndex&&atBat.slot===save.games[save.currentGameIndex].appearances.length+1&&atBat.source==='automatic'&&atBat.origin===save.source)
  checkVersions(save,atBat)
  assert(exact(atBat.config,['handedness','pitcherHandedness','baseSpeedKmh','pitchMode'])&&atBat.config.handedness===save.profile.handedness
    &&atBat.config.baseSpeedKmh===save.settings.baseSpeedKmh&&atBat.config.pitchMode===save.settings.pitchMode)
  assert(iso(atBat.createdAt)&&atBat.updatedAt===atBat.createdAt&&atBat.createdAt>=save.updatedAt&&Array.isArray(atBat.inputs)&&atBat.inputs.length===atBat.state?.pitchCount)
  let expected=createBaseballAtBat({id:atBat.id,seed:atBat.state.seed,...atBat.config})
  for(const entry of atBat.inputs){
    assert(exact(entry,['pitchId','input'])&&object(entry.input))
    const issued=nextBaseballAtBatPitch(expected);assert(issued&&issued.pitchId===entry.pitchId)
    const input=entry.input;assert(input.kind==='take'?exact(input,['kind']):exact(input,['kind','swingAtMs','aim'])&&input.kind==='swing')
    const result=input.kind==='take'?judgeBaseballTake(issued.pitch):judgeBaseballSwing(issued.pitch,{...input,handedness:atBat.config.handedness})
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
    const deltas=command.choice==='rest'?BASEBALL_CAREER_RULES.recovery:{[command.choice]:2,...BASEBALL_CAREER_RULES.training}
    addEvent(next,{id:`${game.id}:preparation`,kind:'preparation',gameIndex:next.currentGameIndex,choice:command.choice,deltas,at:now})
  }else if(command.type==='start-manual'){
    assert(exact(command,['commandId','expectedRevision','type']));available(save);validateBaseballAtBatSession(atBat);checkVersions(save,atBat)
    assert(atBat.source===save.source&&atBat.state.status==='active'&&atBat.state.pitchCount===0&&atBat.revision===1&&atBat.pending===null
      &&atBat.config.handedness===save.profile.handedness&&atBat.config.baseSpeedKmh===save.settings.baseSpeedKmh&&atBat.config.pitchMode===save.settings.pitchMode)
    assert(!save.games.some(game=>game.appearances.some(row=>row.id===atBat.id)),'conflict')
    const game=next.games[next.currentGameIndex];game.status='active';game.stats=gameStats(game)
    next.activeAtBat={id:atBat.id,gameIndex:next.currentGameIndex,slot:game.appearances.length+1,source:atBat.source,config:clone(atBat.config)}
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
  assert(active&&active.id===atBat.id&&atBat.source===active.source&&same(atBat.config,active.config),'conflict')
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
  if(save.status==='complete')feedback.push('trial-complete')
  if(!feedback.length)feedback.push('next-opportunity')
  return freeze(clone({...view,rates:ratesFor(save.stats),statsBySource,feedback,trust:'server-recalculated-input-unverified'}))
}
