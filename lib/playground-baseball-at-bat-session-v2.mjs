// Existing modes retain their count and ledger policy. V2 requires pinned growth.
import { BASEBALL_RULES, judgeBaseballTake } from './playground-baseball.mjs'
import { isBaseballAtBatPitchMode } from './playground-baseball-practice-pitches.mjs'
import { BASEBALL_AT_BAT_RULES, createBaseballAtBat, nextBaseballAtBatPitch, resolveBaseballAtBatPitch } from './playground-baseball-at-bat-v2.mjs'
import { BASEBALL_FIELD_MODEL, resolveBaseballFieldResult } from './playground-baseball-field.mjs'

import { BASEBALL_GROWTH_RULES, validateBaseballGrowthSnapshot, judgeBaseballGrowthSwing as judgeBaseballSwing } from './playground-baseball-growth.mjs'

export const BASEBALL_AT_BAT_SESSION_VERSION = 'baseball-at-bat-session-v2'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const hash = /^[0-9a-f]{64}$/
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const finite = value => typeof value === 'number' && Number.isFinite(value)
const clone = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : object(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value)
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze);Object.freeze(value) }
  return value
}
const fail = (code, message) => { const error = new Error(message);error.code=code;throw error }
const assert = (condition, code='invalid', message='Invalid at-bat session value.') => { if (!condition) fail(code,message) }
const exact = (value, required, optional=[]) => object(value) && required.every(key => Object.hasOwn(value,key)) && Object.keys(value).every(key => [...required,...optional].includes(key))
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const configKeys = ['handedness','pitcherHandedness','baseSpeedKmh','pitchMode']
const hashKeys = ['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','growthHash']
const versionIds = {
  atBatId:BASEBALL_AT_BAT_RULES.id, pitchPolicyId:BASEBALL_AT_BAT_RULES.pitchPolicyId,
  fieldModelId:BASEBALL_FIELD_MODEL.version, sessionId:BASEBALL_AT_BAT_SESSION_VERSION, growthPolicyId:BASEBALL_GROWTH_RULES.id,
}
const pendingKeys = ['pitchId','number','index','pitch','attemptId','attemptNumber','status','input','issuedAt','inputAcceptedAt']
const attemptKeys = ['id','pitchId','number','status','issuedAt','pausedAt','inputAcceptedAt','resolvedAt','input','pauseReason']
const pauseReasons = new Set(['manual','visibility','focus','menu','route','reload','restore','other'])
const inputSources = new Set(['keyboard','pointer','mouse','touch','button','unknown'])
const sessionSources = new Set(['manual','development'])

function validateConfig(value) {
  assert(exact(value,configKeys))
  assert(['left','right'].includes(value.handedness) && ['left','right'].includes(value.pitcherHandedness))
  assert(finite(value.baseSpeedKmh) && value.baseSpeedKmh >= BASEBALL_RULES.minimumSpeedKmh && value.baseSpeedKmh <= BASEBALL_RULES.maximumSpeedKmh)
  assert(isBaseballAtBatPitchMode(value.pitchMode))
}

function normalizeVersions(value) {
  assert(exact(value,hashKeys,Object.keys(versionIds)))
  assert(hashKeys.every(key => typeof value[key] === 'string' && hash.test(value[key])))
  for (const [key,id] of Object.entries(versionIds)) assert(value[key] === undefined || value[key] === id,'version-mismatch','Unsupported at-bat rules version.')
  return { ...Object.fromEntries(hashKeys.map(key => [key,value[key]])), ...versionIds }
}

function normalizeInput(value, pitch) {
  if (value?.kind === 'take') {
    assert(exact(value,['kind']))
    return { kind:'take' }
  }
  assert(exact(value,['kind','swingAtMs','aim'],['source','surface']) && value.kind === 'swing')
  assert(finite(value.swingAtMs) && value.swingAtMs >= -BASEBALL_RULES.windupMs && value.swingAtMs <= pitch.flightTimeMs + BASEBALL_RULES.resolveAfterMs)
  assert(exact(value.aim,['x','y']) && finite(value.aim.x) && finite(value.aim.y)
    && Math.abs(value.aim.x) <= 2 && value.aim.y >= -.5 && value.aim.y <= 2.5)
  assert(value.source === undefined || inputSources.has(value.source))
  assert(value.surface === undefined || ['field','focus'].includes(value.surface))
  return { kind:'swing',swingAtMs:value.swingAtMs,aim:{x:value.aim.x,y:value.aim.y},
    ...(value.source === undefined ? {} : {source:value.source}), ...(value.surface === undefined ? {} : {surface:value.surface}) }
}

function matchingPending(session, command) {
  assert(session.pending,'missing-pitch','There is no issued pitch.')
  assert(command.pitchId === session.pending.pitchId && command.attemptId === session.pending.attemptId,
    'conflict','This pitch attempt is no longer current.')
  return session.pending
}

/** Private aggregate. Its seed and full attempt/history arrays never form an API response. */
export function createBaseballAtBatSession({ id, seed, config, versions, now, growthSnapshot, source='manual' }={}) {
  assert(UUID.test(id) && iso(now) && sessionSources.has(source))
  validateConfig(config)
  assert(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff)
  validateBaseballGrowthSnapshot(growthSnapshot)
  const state = createBaseballAtBat({id,seed,...config,growthSnapshot})
  return freeze({schemaVersion:2,id,revision:1,createdAt:now,updatedAt:now,source,config:clone(config),
    versions:normalizeVersions(versions),growthSnapshot:clone(growthSnapshot),state,pending:null,attempts:[],finalReceipt:null})
}

/** Validate a persisted private checkpoint without accepting any client-owned score. */
export function validateBaseballAtBatSession(session) {
  assert(exact(session,['schemaVersion','id','revision','createdAt','updatedAt','source','config','versions','state','pending','attempts','finalReceipt','growthSnapshot']))
  assert(session.schemaVersion === 2 && UUID.test(session.id) && Number.isSafeInteger(session.revision) && session.revision >= 1)
  assert(iso(session.createdAt) && iso(session.updatedAt) && session.updatedAt >= session.createdAt && sessionSources.has(session.source))
  validateConfig(session.config)
  validateBaseballGrowthSnapshot(session.growthSnapshot)
  assert(canonical(session.growthSnapshot)===canonical(session.state?.growthSnapshot))
  assert(canonical(normalizeVersions(session.versions)) === canonical(session.versions))
  assert(session.state?.id === session.id && configKeys.every(key => session.state[key] === session.config[key]))
  try { nextBaseballAtBatPitch(session.state) } catch { fail('invalid','Invalid persisted at-bat count or result.') }
  assert(Array.isArray(session.attempts))
  const ids = new Set()
  for (const attempt of session.attempts) {
    assert(exact(attempt,attemptKeys) && UUID.test(attempt.id) && !ids.has(attempt.id))
    ids.add(attempt.id)
    assert(typeof attempt.pitchId === 'string' && Number.isSafeInteger(attempt.number) && attempt.number > 0)
    assert(['issued','paused','input-accepted','resolved','superseded'].includes(attempt.status))
    assert(iso(attempt.issuedAt) && attempt.issuedAt >= session.createdAt && attempt.issuedAt <= session.updatedAt)
    for (const key of ['pausedAt','inputAcceptedAt','resolvedAt']) assert(attempt[key] === null || iso(attempt[key]) && attempt[key] >= attempt.issuedAt && attempt[key] <= session.updatedAt)
    assert(attempt.pauseReason === null || pauseReasons.has(attempt.pauseReason))
    assert((attempt.input === null) === (attempt.inputAcceptedAt === null))
    assert(attempt.status !== 'resolved' || attempt.input !== null && attempt.resolvedAt !== null)
  }
  if (session.pending !== null) {
    const pending=session.pending, expected=nextBaseballAtBatPitch(session.state)
    assert(exact(pending,pendingKeys) && expected && pending.pitchId === expected.pitchId && pending.number === expected.number && pending.index === expected.index)
    assert(canonical(pending.pitch) === canonical(expected.pitch))
    assert(['issued','paused','input-accepted'].includes(pending.status) && UUID.test(pending.attemptId))
    const attempts=session.attempts.filter(attempt => attempt.pitchId === pending.pitchId), last=attempts.at(-1)
    assert(Number.isSafeInteger(pending.attemptNumber) && pending.attemptNumber === attempts.length && last?.id === pending.attemptId)
    assert(last.status === pending.status && last.issuedAt === pending.issuedAt && last.inputAcceptedAt === pending.inputAcceptedAt && canonical(last.input) === canonical(pending.input))
    assert((pending.input === null) === (pending.inputAcceptedAt === null))
    if (pending.input !== null) assert(canonical(normalizeInput(pending.input,pending.pitch)) === canonical(pending.input))
    if (pending.status === 'input-accepted') assert(pending.input !== null)
    if (pending.status === 'issued') assert(pending.input === null)
  }
  if (session.state.status === 'complete') {
    const receipt=session.finalReceipt
    assert(session.pending === null && exact(receipt,['id','revision','outcome','stats','completedAt']))
    assert(receipt.id === `${session.id}:final` && receipt.revision === session.revision && receipt.outcome === session.state.outcome
      && canonical(receipt.stats) === canonical(session.state.stats) && iso(receipt.completedAt) && receipt.completedAt === session.updatedAt)
  } else assert(session.finalReceipt === null)
  return true
}

/**
 * One server command per CAS revision. Persistent commandId deduplication belongs
 * to the transaction/commands table, including retries older than the snapshot.
 */
export function applyBaseballAtBatSessionCommand(session, command, {now,attemptId,versions}={}) {
  validateBaseballAtBatSession(session)
  assert(object(command) && UUID.test(command.commandId) && Number.isSafeInteger(command.expectedRevision))
  assert(command.expectedRevision === session.revision,'conflict','The at-bat has changed. Reload its latest checkpoint.')
  assert(iso(now) && now >= session.updatedAt)
  if (versions !== undefined) assert(canonical(normalizeVersions(versions)) === canonical(session.versions),'version-mismatch','The checkpoint uses a different engine or rules version.')
  assert(session.state.status === 'active','complete','This at-bat already has its final receipt.')
  const next=clone(session)
  next.revision += 1;next.updatedAt=now
  if (command.type === 'issue') {
    assert(exact(command,['commandId','expectedRevision','type']))
    assert(UUID.test(attemptId) && !session.attempts.some(attempt => attempt.id === attemptId))
    assert(!session.pending?.input,'input-already-accepted','Confirm the existing swing instead of taking another attempt.')
    const issued=nextBaseballAtBatPitch(session.state)
    if (next.pending) next.attempts.find(attempt => attempt.id === next.pending.attemptId).status='superseded'
    const attemptNumber=next.attempts.filter(attempt => attempt.pitchId === issued.pitchId).length + 1
    next.pending={...clone(issued),attemptId,attemptNumber,status:'issued',input:null,issuedAt:now,inputAcceptedAt:null}
    next.attempts.push({id:attemptId,pitchId:issued.pitchId,number:issued.number,status:'issued',issuedAt:now,
      pausedAt:null,inputAcceptedAt:null,resolvedAt:null,input:null,pauseReason:null})
  } else if (command.type === 'accept-input') {
    assert(exact(command,['commandId','expectedRevision','type','pitchId','attemptId','input']))
    const pending=matchingPending(next,command)
    assert(pending.input === null,'input-already-accepted','This pitch already has an accepted input.')
    assert(pending.status === 'issued','paused','Prepare the same pitch before entering a new input.')
    const input=normalizeInput(command.input,pending.pitch)
    pending.input=input;pending.inputAcceptedAt=now;pending.status='input-accepted'
    Object.assign(next.attempts.find(attempt => attempt.id === pending.attemptId),{input:clone(input),inputAcceptedAt:now,status:'input-accepted'})
  } else if (command.type === 'pause') {
    assert(exact(command,['commandId','expectedRevision','type','pitchId','attemptId'],['reason']))
    assert(command.reason === undefined || pauseReasons.has(command.reason))
    const pending=matchingPending(next,command)
    pending.status='paused'
    Object.assign(next.attempts.find(attempt => attempt.id === pending.attemptId),{status:'paused',pausedAt:now,pauseReason:command.reason || 'other'})
  } else if (command.type === 'resolve') {
    assert(exact(command,['commandId','expectedRevision','type','pitchId','attemptId']))
    const pending=matchingPending(next,command)
    assert(pending.input !== null,'input-required','Store the existing pitch input before resolving its result.')
    const input=pending.input
    const result=input.kind === 'take' ? judgeBaseballTake(pending.pitch)
      : judgeBaseballSwing(pending.pitch,{swingAtMs:input.swingAtMs,aim:input.aim,handedness:next.config.handedness},next.growthSnapshot)
    const fieldResult=['contact','perfect'].includes(result.outcome) ? resolveBaseballFieldResult(result) : null
    next.state=resolveBaseballAtBatPitch(next.state,{pitchId:pending.pitchId,pitch:pending.pitch,result,fieldResult,source:next.source})
    Object.assign(next.attempts.find(attempt => attempt.id === pending.attemptId),{status:'resolved',resolvedAt:now})
    next.pending=null
    if (next.state.status === 'complete') next.finalReceipt={id:`${next.id}:final`,revision:next.revision,outcome:next.state.outcome,stats:clone(next.state.stats),completedAt:now}
  } else fail('invalid','Unsupported at-bat session command.')
  validateBaseballAtBatSession(next)
  return freeze(next)
}

const publicPitch = pitch => Object.fromEntries(Object.entries(pitch).filter(([key]) => !['seed','id'].includes(key)))

/** Only current issued physics and already confirmed events leave the server. */
export function publicBaseballAtBatSession(session) {
  validateBaseballAtBatSession(session)
  const {seed:privateSeed,history,...state}=session.state
  void privateSeed
  return freeze(clone({schemaVersion:2,id:session.id,revision:session.revision,createdAt:session.createdAt,updatedAt:session.updatedAt,
    source:session.source,versions:session.versions,config:session.config,growthSnapshot:session.growthSnapshot,
    state:{...state,history:history.slice(-20).map(row => ({...row,pitch:publicPitch(row.pitch)}))},
    pending:session.pending ? {...session.pending,pitch:publicPitch(session.pending.pitch)} : null,
    finalReceipt:session.finalReceipt,trust:'server-recalculated-input-unverified'}))
}
