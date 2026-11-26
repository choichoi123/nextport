import {
  advanceBaseballCareerAtBat, applyBaseballCareerCommand, createBaseballCareerManualAtBat,
  createBaseballCareerSave, simulateBaseballCareerAtBat, simulateBaseballCareerGame, sumBaseballCareerStats, validateBaseballCareerSave,
  BASEBALL_ANNUAL_APPEARANCES_PER_GAME, getBaseballCareerAppearancesPerGame,
} from './playground-baseball-career-v2.mjs'
import {
  applyBaseballAtBatSessionCommand, validateBaseballAtBatSession,
} from './playground-baseball-at-bat-session-v2.mjs'
import { BASEBALL_REGULAR_SEASON_GAMES, BASEBALL_REGULAR_SEASON_ID } from './playground-baseball-career-schedule.mjs'
import { isBaseballWinterPlan } from './playground-baseball-winter.mjs'

export const BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES = 3 * 1024 * 1024
export const BASEBALL_ANNUAL_MAX_SEASONS = 10
const MAX_ACTIONS = 16_000
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const setupKeys = ['id','profile','settings','versions','seed','now','source']
const optionalSetupKeys = ['continuation','winter','appearancesPerGame']
const continuationKeys = ['careerId','previousSeasonId','seasonNumber','startingGrowth','history']
const draftKeys = ['schemaVersion','setup','actions','career','session','revision','receipt']
const baseActionKeys = ['type','now','commandId']
const actionKeys = {
  prepare:['choice'], 'start-manual':['atBatId'], 'simulate-at-bat':['atBatId'], 'simulate-game':['atBatIds'],
  issue:['attemptId'], 'accept-input':['pitchId','attemptId','input'], pause:['pitchId','attemptId'], resolve:['pitchId','attemptId'],
}
const childActions = new Set(['issue','accept-input','pause','resolve'])
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
const exact = (value, keys, optional = []) => plain(value) && keys.every(key => Object.hasOwn(value,key))
  && Object.keys(value).every(key => keys.includes(key) || optional.includes(key))
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const id = value => typeof value === 'string' && ID.test(value)
const clone = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : plain(value) ? `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value)

function assert(condition, code = 'invalid') {
  if (!condition) throw Object.assign(new Error('Invalid baseball annual season.'), {code})
}

export function getBaseballAnnualIdentity(setup) {
  const {id:seasonId,continuation} = setup
  return {
    careerId:continuation?.careerId ?? seasonId,
    seasonId,
    seasonNumber:continuation?.seasonNumber ?? 1,
    previousSeasonId:continuation?.previousSeasonId ?? null,
  }
}

export function isBaseballCareerFinish(value) {
  return value === 'active' || value === 'retired'
}

export function summarizeBaseballAnnualTotals(history, stats) {
  const records = history.map(season=>season.stats)
  if (stats !== undefined) records.push(stats)
  return sumBaseballCareerStats(records)
}

export function isCompleteBaseballAnnualStats(stats, appearancesPerGame) {
  if (stats?.G !== BASEBALL_REGULAR_SEASON_GAMES || typeof stats.PA !== 'number') return false
  const legacy = getBaseballCareerAppearancesPerGame()
  const count = stats.PA / BASEBALL_REGULAR_SEASON_GAMES
  return (count === legacy || count === BASEBALL_ANNUAL_APPEARANCES_PER_GAME)
    && (appearancesPerGame === undefined || count === appearancesPerGame)
}

function validateContinuation(value, currentId) {
  assert(exact(value,continuationKeys) && id(value.careerId) && id(value.previousSeasonId) && plain(value.startingGrowth)
    && Number.isInteger(value.seasonNumber) && value.seasonNumber >= 2 && value.seasonNumber <= BASEBALL_ANNUAL_MAX_SEASONS
    && Array.isArray(value.history) && value.history.length === value.seasonNumber - 1)
  const seasonIds = new Set([currentId])
  for (const [index,season] of value.history.entries()) {
    assert(exact(season,['seasonId','seasonNumber','stats']) && id(season.seasonId)
      && season.seasonNumber === index + 1 && !seasonIds.has(season.seasonId)
      && isCompleteBaseballAnnualStats(season.stats))
    seasonIds.add(season.seasonId)
  }
  assert(value.history[0].seasonId === value.careerId && value.history.at(-1).seasonId === value.previousSeasonId)
  sumBaseballCareerStats(value.history.map(season=>season.stats))
}

/** A fixed seed for this career slot keeps local and server pitch generation identical. */
function slotSeed(seed, gameIndex, slot, appearancesPerGame) {
  let x = (seed + Math.imul(gameIndex * appearancesPerGame + slot, 0x9e3779b9)) >>> 0
  x = Math.imul(x ^ x >>> 16, 0x21f0aaad)
  x = Math.imul(x ^ x >>> 15, 0x735a2d97)
  return (x ^ x >>> 15) >>> 0
}

function validateWinter(winter, continuation) {
  assert(continuation?.seasonNumber === 2 && isBaseballWinterPlan(winter))
}

function validateFinish(finish, draft) {
  assert(isBaseballCareerFinish(finish) && draft.setup.continuation?.seasonNumber === BASEBALL_ANNUAL_MAX_SEASONS
    && draft.career.status === 'complete')
}

export function createBaseballAnnualDraft({id,profile,settings,versions,seed,now,source='manual',continuation,winter,appearancesPerGame}={}) {
  assert(typeof id === 'string' && ID.test(id))
  if (continuation !== undefined) validateContinuation(continuation,id)
  if (winter !== undefined) validateWinter(winter,continuation)
  const career = createBaseballCareerSave({id,profile,settings,versions,seed,now,source,scheduleId:BASEBALL_REGULAR_SEASON_ID,
    startingGrowth:continuation?.startingGrowth,appearancesPerGame})
  const setup = {id,profile:career.profile,settings:career.settings,versions:career.versions,seed,now,source,
    ...(career.appearancesPerGame === undefined ? {} : {appearancesPerGame:career.appearancesPerGame}),
    ...(continuation ? {continuation:clone(continuation)} : {}),
    ...(winter ? {winter:clone(winter)} : {})}
  return {schemaVersion:1,setup,actions:[],career,session:null,revision:0,receipt:null}
}

function validateHeader(draft) {
  assert(exact(draft,draftKeys,['finish']) && draft.schemaVersion === 1 && exact(draft.setup,setupKeys,optionalSetupKeys))
  assert(Array.isArray(draft.actions) && draft.actions.length <= MAX_ACTIONS && draft.revision === draft.actions.length)
  const {career,session,setup,receipt} = draft
  assert(plain(career) && Array.isArray(career.games) && career.id === setup.id
    && career.scheduleId === BASEBALL_REGULAR_SEASON_ID && iso(setup.now))
  assert(Object.hasOwn(career,'appearancesPerGame') === Object.hasOwn(setup,'appearancesPerGame')
    && (!Object.hasOwn(setup,'appearancesPerGame') || (setup.appearancesPerGame === BASEBALL_ANNUAL_APPEARANCES_PER_GAME
      && career.appearancesPerGame === setup.appearancesPerGame)))
  assert(Object.hasOwn(career,'startingGrowth') === Object.hasOwn(setup,'continuation'))
  if (Object.hasOwn(setup,'winter')) validateWinter(setup.winter,setup.continuation)
  if (Object.hasOwn(draft,'finish')) validateFinish(draft.finish,draft)
  assert(session === null || plain(session))
  assert(career.activeAtBat
    ? session?.id === career.activeAtBat.id && session.state?.status === 'active'
    : session === null || session.state?.status === 'complete' && career.games.some(game=>game.appearances.some(row=>row.id===session.id)))
  assert(receipt === null || plain(receipt) && career.status === 'complete')
}

/** Validate a local snapshot at the storage boundary. File import uses replay instead. */
export function validateBaseballAnnualDraft(draft) {
  validateHeader(draft)
  validateBaseballCareerSave(draft.career)
  const {setup,career,session} = draft
  assert(setup.seed === career.seed && setup.now === career.createdAt && setup.source === career.source
    && ['profile','settings','versions'].every(key=>canonical(setup[key])===canonical(career[key])))
  if (Object.hasOwn(setup,'continuation')) {
    validateContinuation(setup.continuation,setup.id)
    assert(canonical(setup.continuation.startingGrowth) === canonical(career.startingGrowth))
  }
  if (session) {
    validateBaseballAtBatSession(session)
    assert(session.versions.pitchPolicyId === career.versions.pitchPolicyId,'version-mismatch')
  }
  let previous = setup.now
  const appearancesPerGame = getBaseballCareerAppearancesPerGame(career)
  const commands = new Set()
  for (const action of draft.actions) {
    validateAction(action,previous,appearancesPerGame)
    assert(!commands.has(action.commandId),'conflict')
    commands.add(action.commandId)
    previous = action.now
  }
  return true
}

function validateAction(action, previous, appearancesPerGame) {
  assert(plain(action) && typeof action.type === 'string' && Object.hasOwn(actionKeys,action.type))
  assert(exact(action,[...baseActionKeys,...actionKeys[action.type]],action.type === 'pause' ? ['reason'] : [])
    && id(action.commandId) && iso(action.now) && action.now >= previous)
  if (Object.hasOwn(action,'atBatId')) assert(id(action.atBatId))
  if (Object.hasOwn(action,'atBatIds')) {
    const ids = action.atBatIds
    assert(Array.isArray(ids) && ids.length >= 1 && ids.length <= appearancesPerGame
      && ids.every(id) && new Set(ids).size === ids.length)
  }
}

function step(draft, action) {
  const {career,session} = draft
  const {type,commandId,now} = action
  const command = {type,commandId,expectedRevision:career.revision}
  const gameIndex = career.currentGameIndex
  const appearancesPerGame = getBaseballCareerAppearancesPerGame(career)
  const slot = (career.games[gameIndex]?.appearances.length || 0) + 1
  if (childActions.has(type)) {
    assert(career.activeAtBat && session?.id === career.activeAtBat.id,'missing-pitch')
    const input = {...command,expectedRevision:session.revision}
    if (type !== 'issue') Object.assign(input,{pitchId:action.pitchId,attemptId:action.attemptId})
    if (type === 'accept-input') input.input = action.input
    if (type === 'pause' && Object.hasOwn(action,'reason')) input.reason = action.reason
    const next = applyBaseballAtBatSessionCommand(session,input,{now,attemptId:action.attemptId})
    if (next.state.status !== 'complete') return {career,session:next,bats:[]}
    return {
      career:advanceBaseballCareerAtBat(career,next,{now,expectedRevision:career.revision}),
      session:next,bats:[child(next,gameIndex,slot)],
    }
  }
  if (type === 'prepare') return {career:applyBaseballCareerCommand(career,{...command,choice:action.choice},{now}),session:null,bats:[]}
  if (type === 'simulate-game') {
    assert(career.games[gameIndex] && action.atBatIds.length === appearancesPerGame + 1 - slot)
    assert(!career.games.some(game=>game.appearances.some(row=>action.atBatIds.includes(row.id))),'conflict')
    const ids = action.atBatIds.values()
    let seedSlot = slot
    const result = simulateBaseballCareerGame(career,{
      expectedRevision:career.revision,now,idFactory:()=>ids.next().value,
      seedFactory:()=>slotSeed(draft.setup.seed,gameIndex,seedSlot++,appearancesPerGame),
    })
    return {career:result.career,session:null,bats:result.atBats.map((atBat,index)=>child(atBat,gameIndex,slot+index))}
  }
  const config = {id:action.atBatId,seed:slotSeed(draft.setup.seed,gameIndex,slot,appearancesPerGame),now}
  const manual = type === 'start-manual'
  const atBat = manual ? createBaseballCareerManualAtBat(career,config) : simulateBaseballCareerAtBat(career,config)
  return {
    career:applyBaseballCareerCommand(career,command,{now,atBat}),session:manual ? atBat : null,
    bats:manual ? [] : [child(atBat,gameIndex,slot)],
  }
}

function child(snapshot, gameIndex, slot) {
  return {id:snapshot.id,gameIndex,slot,source:snapshot.source,expectedRevision:0,snapshot}
}

export function advanceBaseballAnnualDraft(draft, action) {
  validateHeader(draft)
  assert(draft.receipt === null && draft.career.status === 'active','complete')
  assert(draft.revision < MAX_ACTIONS,'local_capacity')
  validateAction(action,draft.actions.at(-1)?.now || draft.setup.now,getBaseballCareerAppearancesPerGame(draft.career))
  assert(!draft.actions.some(row=>row.commandId===action.commandId),'conflict')
  const next = step(draft,action)
  return {...draft,career:next.career,session:next.session,actions:[...draft.actions,clone(action)],revision:draft.revision+1}
}

function* replaySteps(value, includeAtBats) {
  assert(exact(value,['setup','actions'],['finish']) && exact(value.setup,setupKeys,optionalSetupKeys)
    && Array.isArray(value.actions) && value.actions.length <= MAX_ACTIONS)
  if (Object.hasOwn(value.setup,'winter')) validateWinter(value.setup.winter,value.setup.continuation)
  const hasFinish = Object.hasOwn(value,'finish')
  if (hasFinish) assert(isBaseballCareerFinish(value.finish) && value.setup.continuation?.seasonNumber === BASEBALL_ANNUAL_MAX_SEASONS)
  const draft = createBaseballAnnualDraft(value.setup)
  const appearancesPerGame = getBaseballCareerAppearancesPerGame(draft.career)
  const commands = new Set(), atBats = []
  let previous = draft.setup.now
  for (const action of value.actions) {
    validateAction(action,previous,appearancesPerGame)
    assert(draft.career.status === 'active' && !commands.has(action.commandId),'conflict')
    commands.add(action.commandId)
    const next = step(draft,action)
    draft.career = next.career
    draft.session = next.session
    if (includeAtBats) atBats.push(...next.bats)
    previous = action.now
    yield
  }
  draft.actions = clone(value.actions)
  draft.revision = draft.actions.length
  if (hasFinish) {
    validateFinish(value.finish,draft)
    draft.finish = value.finish
  }
  return {draft,atBats}
}

/** Reconstruct from settings and ordered inputs. Aggregate stats supplied by clients are never read. */
export function replayBaseballAnnualSubmission(value, {includeAtBats=true}={}) {
  const replay = replaySteps(value, includeAtBats)
  let result
  do { result = replay.next() } while (!result.done)
  return result.value
}

/** Give the browser a chance to paint during a long backup replay. */
export async function replayBaseballAnnualBackup(value, {signal}={}) {
  const replay = replaySteps(value, false)
  signal?.throwIfAborted()
  let sliceStart = performance.now()
  let result
  while (!(result = replay.next()).done) {
    if (performance.now() - sliceStart < 16) continue
    await new Promise(resolve => setTimeout(resolve,0))
    signal?.throwIfAborted()
    sliceStart = performance.now()
  }
  return result.value.draft
}
