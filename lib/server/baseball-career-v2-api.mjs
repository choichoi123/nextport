import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createBaseballCareerSave, applyBaseballCareerCommand, advanceBaseballCareerAtBat, createBaseballCareerManualAtBat,
  simulateBaseballCareerAtBat, simulateBaseballCareerGame, validateBaseballCareerSave, publicBaseballCareerSave } from '../playground-baseball-career-v2.mjs'
import { BASEBALL_AT_BAT_RULES, BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID } from '../playground-baseball-at-bat-v2.mjs'
import { applyBaseballAtBatSessionCommand, publicBaseballAtBatSession, validateBaseballAtBatSession } from '../playground-baseball-at-bat-session-v2.mjs'
import { validateBaseballPlayer } from '../playground-baseball-teams.mjs'
import { BASEBALL_REGULAR_SEASON_ID, BASEBALL_REGULAR_SEASON_GAMES } from '../playground-baseball-career-schedule.mjs'
import { getBaseballCareerV2ReplayVersions } from '../playground-baseball-career-versions.mjs'
import { canonicalBaseballVersionJson, normalizeBaseballVersionSource } from './baseball-version.mjs'
import { createBaseballDataVersions } from './baseball-version.mjs'
import { createBaseballParticipant, hasBaseballCareerSameOrigin, readBaseballParticipant, shouldSecureBaseballCareerCookie } from './baseball-auth.mjs'
import { readBaseballCareerConfiguration } from './baseball-db.mjs'
import { getBaseballCareerStore } from './baseball-career-v2-db.mjs'

export const BASEBALL_CAREER_MAX_BODY_BYTES = 16 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA = /^[a-f0-9]{64}$/
const isUuid = value => typeof value === 'string' && UUID.test(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value, required, optional=[]) => object(value) && required.every(key=>Object.hasOwn(value,key)) && Object.keys(value).every(key=>[...required,...optional].includes(key))
const digest = value => createHash('sha256').update(value).digest('hex')
const commandHash = value => digest(canonicalBaseballVersionJson(value))
export { BASEBALL_CAREER_V2_TRIAL_HASHES, BASEBALL_CAREER_V2_PRIOR_REGULAR_HASHES } from '../playground-baseball-career-versions.mjs'

/** Pin the shared repertoire along with the V2 at-bat source. */
export async function createBaseballAtBatV2Versions({readSource=file=>readFile(path.join(process.cwd(),file)),getEngineVersions=createBaseballDataVersions}={}) {
  const engine=await getEngineVersions()
  const sourceHash=async file=>digest(normalizeBaseballVersionSource(await readSource(file)))
  const atBatSourceHash=async()=>{
    const contents=await Promise.all(['lib/playground-baseball-at-bat-v2.mjs','lib/playground-baseball-practice-pitches.mjs'].map(file=>readSource(file)))
    return digest(canonicalBaseballVersionJson(contents.map(normalizeBaseballVersionSource)))
  }
  const [atBatHash,fieldHash,sessionHash,growthHash]=await Promise.all([
    atBatSourceHash(),sourceHash('lib/playground-baseball-field.mjs'),
    sourceHash('lib/playground-baseball-at-bat-session-v2.mjs'),sourceHash('lib/playground-baseball-growth.mjs'),
  ])
  return {engineHash:engine.engine.hash,rulesHash:engine.rules.hash,atBatHash,fieldHash,sessionHash,growthHash}
}

/** Build-time source identities only; this never reads config or initializes a store. */
export async function createBaseballCareerVersions({readSource=file=>readFile(path.join(process.cwd(),file)),getAtBatVersions=createBaseballAtBatV2Versions}={}) {
  const [versions,career,schedule]=await Promise.all([
    getAtBatVersions(),readSource('lib/playground-baseball-career-v2.mjs'),readSource('lib/playground-baseball-career-schedule.mjs'),
  ])
  return {...versions,careerHash:digest(canonicalBaseballVersionJson([career,schedule].map(normalizeBaseballVersionSource))),
    pitchPolicyId:BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID}
}
function errorResponse(res,status,code) { return res.status(status).json({status:status===503?'unavailable':'error',code}) }
function bodyError(code,statusCode) { return Object.assign(new Error('Invalid career body'),{code,statusCode}) }
async function readJsonBody(req) {
  if(req.body!==undefined) {
    let encoded
    try{encoded=JSON.stringify(req.body)}catch{throw bodyError('invalid_command',400)}
    if(typeof encoded!=='string')throw bodyError('invalid_command',400)
    if(Buffer.byteLength(encoded)>BASEBALL_CAREER_MAX_BODY_BYTES)throw bodyError('body_too_large',413)
    return req.body
  }
  if(typeof req.on!=='function')throw bodyError('invalid_command',400)
  return new Promise((resolve,reject)=>{
    let size=0
    const chunks=[]
    const cleanup=()=>{req.off('data',data);req.off('end',end);req.off('error',failed);req.off('aborted',failed)}
    const failed=()=>{cleanup();reject(bodyError('invalid_command',400))}
    const data=chunk=>{
      const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length
      if(size>BASEBALL_CAREER_MAX_BODY_BYTES){cleanup();req.resume();reject(bodyError('body_too_large',413));return}
      chunks.push(bytes)
    }
    const end=()=>{cleanup();try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(bodyError('invalid_command',400))}}
    req.on('data',data);req.on('end',end);req.on('error',failed);req.on('aborted',failed)
  })
}
function safeCareer(snapshot,id) {
  if(!validateBaseballCareerSave(snapshot)||snapshot.id!==id)throw new Error('Invalid career checkpoint')
  return publicBaseballCareerSave(snapshot)
}
function safeAtBat(row,id) {
  if(row?.source==='automatic')return null
  if(!validateBaseballAtBatSession(row?.snapshot)||row.snapshot.id!==id)throw new Error('Invalid career at-bat')
  return publicBaseballAtBatSession(row.snapshot)
}
function safeReceipt(value,id,commandId) {
  if(!exact(value,['sessionId','commandId','revision'])||value.sessionId!==id||value.commandId!==commandId||!Number.isSafeInteger(value.revision)||value.revision<1)throw new Error('Invalid career receipt')
  return {sessionId:id,commandId,revision:value.revision}
}
function safeSummaries(result) {
  if(result?.status!=='ok'||!Array.isArray(result.careers)||result.careers.length>20)throw new Error('Invalid career list')
  return result.careers.map(row=>{
    const player=validateBaseballPlayer(row.profile)
    const totalGames=row.totalGames??3
    if(!isUuid(row?.id)||!Number.isSafeInteger(row.revision)||row.revision<1||!player.valid||!['active','complete'].includes(row.status)
      ||![3,BASEBALL_REGULAR_SEASON_GAMES].includes(totalGames)||!Number.isInteger(row.completedGames)||row.completedGames<0||row.completedGames>totalGames||typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt)))throw new Error('Invalid career summary')
    return {id:row.id,revision:row.revision,profile:player.player,status:row.status,completedGames:row.completedGames,
      ...(row.totalGames===undefined?{}:{totalGames}),updatedAt:new Date(row.updatedAt).toISOString()}
  })
}
function storeError(res,result) {
  if(result?.status==='not_found')return errorResponse(res,404,'not_found')
  const code=['revision_conflict','command_conflict','rate_limited','invalid_command','not_found','storage_capacity','slot_closed'].includes(result?.code)?result.code:'database_unavailable'
  if(code==='rate_limited')res.setHeader('Retry-After','60')
  return errorResponse(res,code==='rate_limited'?429:code==='storage_capacity'?413:code==='not_found'?404:code.endsWith('conflict')||code==='slot_closed'?409:code==='invalid_command'?400:503,code)
}
function domainError(res,error,expectedRevision,actualRevision,atBat=false) {
  const codes={conflict:'command_conflict','version-mismatch':'version_mismatch',complete:atBat?'session_complete':'career_complete','at-bat-active':'active_at_bat',
    'preparation-required':'preparation_required','preparation-complete':'preparation_complete','automatic-budget':'automatic_budget',
    'input-already-accepted':'input_already_accepted',paused:'pitch_paused','input-required':'input_required','missing-pitch':'pitch_required'}
  const code=expectedRevision!==undefined&&expectedRevision!==actualRevision?'revision_conflict':codes[error?.code]||'invalid_command'
  return errorResponse(res,code==='invalid_command'?400:409,code)
}

/** Development career persistence. Names are fictional game profiles, not accounts. */
export function createBaseballCareerApiHandler(dependencies={}) {
  return async function careerApi(req,res) {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff')
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return errorResponse(res,405,'method_not_allowed')}
    const config=readBaseballCareerConfiguration(dependencies.env||process.env)
    if(!config)return errorResponse(res,503,'not_configured')
    if(!hasBaseballCareerSameOrigin(req,config))return errorResponse(res,403,'invalid_origin')
    const id=req.query?.id,atBatId=req.query?.atBatId
    if(id!==undefined&&!isUuid(id)||atBatId!==undefined&&(!isUuid(atBatId)||id===undefined))return errorResponse(res,400,'invalid_session_id')
    const now=dependencies.now?.()??Date.now(),nowIso=new Date(now).toISOString()
    const participant=readBaseballParticipant(req,config.secret,now)
    if(!participant&&(req.method==='POST'||id!==undefined))return errorResponse(res,401,'owner_required')
    let body
    if(req.method==='POST') {
      if(typeof req.headers?.['content-type']!=='string'||!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']))return errorResponse(res,415,'invalid_content_type')
      const length=req.headers?.['content-length']
      if(length!==undefined&&(!Number.isSafeInteger(Number(length))||Number(length)<0))return errorResponse(res,400,'invalid_command')
      if(Number(length)>BASEBALL_CAREER_MAX_BODY_BYTES)return errorResponse(res,413,'body_too_large')
      try{body=await readJsonBody(req)}catch(error){return errorResponse(res,error.statusCode||400,error.code||'invalid_command')}
      if(!isUuid(body?.commandId)||(id===undefined?!exact(body,['commandId','profile'],['settings','source']):!exact(body,['commandId','expectedRevision','command'])
        ||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||!object(body.command)||Object.hasOwn(body.command,'commandId')||Object.hasOwn(body.command,'expectedRevision')))return errorResponse(res,400,'invalid_command')
    }
    try {
      const owner=participant||createBaseballParticipant(config.secret,{now,secure:shouldSecureBaseballCareerCookie(req,config)})
      const store=dependencies.store||await(dependencies.getStore||getBaseballCareerStore)(config)
      if(req.method==='GET'&&id===undefined) {
        const result=await store.list(owner.hash)
        if(result.status!=='ok')return storeError(res,result)
        const careers=safeSummaries(result)
        if(owner.cookie)res.setHeader('Set-Cookie',owner.cookie)
        return res.status(200).json({status:'ok',careers})
      }
      const careerId=id||body.commandId,existing=await store.read(owner.hash,careerId,body?.commandId||null)
      if(req.method==='GET') {
        if(existing.status!=='ok')return storeError(res,existing)
        const career=safeCareer(existing.snapshot,careerId)
        if(!atBatId)return res.status(200).json({status:'ok',career})
        const row=await store.readAtBat(owner.hash,careerId,atBatId)
        if(row.status!=='ok')return storeError(res,row)
        const session=safeAtBat(row,atBatId)
        if(!session)return errorResponse(res,409,'automatic_at_bat')
        return res.status(200).json({status:'ok',session,career})
      }
      const hash=commandHash({route:atBatId||null,body})
      if(existing.status==='ok'&&existing.command) {
        if(!SHA.test(existing.command.hash)||existing.command.hash!==hash)return errorResponse(res,409,'command_conflict')
        const career=safeCareer(existing.snapshot,careerId),careerReceipt=safeReceipt({sessionId:careerId,commandId:body.commandId,revision:existing.command.revision},careerId,body.commandId)
        if(career.revision<careerReceipt.revision)throw new Error('Invalid career command revision')
        if(!atBatId)return res.status(200).json({status:'stored',career,receipt:careerReceipt,duplicate:true})
        const row=await store.readAtBat(owner.hash,careerId,atBatId)
        if(row.status!=='ok')return storeError(res,row)
        const session=safeAtBat(row,atBatId)
        if(!session)return errorResponse(res,409,'automatic_at_bat')
        const receipt=safeReceipt(existing.command.atBatReceipt,atBatId,body.commandId)
        if(session.revision<receipt.revision)throw new Error('Invalid career at-bat receipt')
        return res.status(200).json({status:'stored',session,receipt,career,careerReceipt,duplicate:true})
      }
      if(existing.status!=='ok'&&existing.status!=='not_found')return storeError(res,existing)
      if(id!==undefined&&existing.status==='not_found')return errorResponse(res,404,'not_found')
      if(id===undefined&&existing.status==='ok')return errorResponse(res,409,'command_conflict')
      let versions
      try{versions=await(dependencies.getVersions||createBaseballCareerVersions)()}catch{return errorResponse(res,503,'verification_unavailable')}
      if(existing.status==='ok'&&!getBaseballCareerV2ReplayVersions(existing.snapshot,versions))return errorResponse(res,409,'version_mismatch')
      const nextId=()=> (dependencies.idFactory||randomUUID)(),nextSeed=()=>dependencies.seed?.()??randomBytes(4).readUInt32LE()
      let next,changes=[],atBatReceipt=null,expectedRevision=id===undefined?0:existing.snapshot.revision,actualInputRevision=existing.snapshot?.revision
      try {
        if(id===undefined)next=createBaseballCareerSave({id:careerId,profile:body.profile,settings:body.settings,source:body.source,
          versions:{...versions,pitchPolicyId:BASEBALL_AT_BAT_RULES.pitchPolicyId},seed:nextSeed(),now:nowIso,scheduleId:BASEBALL_REGULAR_SEASON_ID})
        else if(atBatId) {
          const current=existing.snapshot.activeAtBat
          if(!current||current.id!==atBatId)return errorResponse(res,409,'slot_closed')
          const row=await store.readAtBat(owner.hash,careerId,atBatId)
          if(row.status!=='ok')return storeError(res,row)
          if(row.source==='automatic')return errorResponse(res,409,'automatic_at_bat')
          actualInputRevision=row.snapshot.revision
          const session=applyBaseballAtBatSessionCommand(row.snapshot,{...body.command,commandId:body.commandId,expectedRevision:body.expectedRevision},{now:nowIso,attemptId:nextId()})
          next=advanceBaseballCareerAtBat(existing.snapshot,session,{expectedRevision,now:nowIso})
          changes=[{id:atBatId,gameIndex:current.gameIndex,slot:current.slot,source:session.source,expectedRevision:body.expectedRevision,snapshot:session}]
          atBatReceipt={sessionId:atBatId,commandId:body.commandId,revision:session.revision}
        } else {
          let atBat
          const type=body.command.type
          if(!exact(body.command,type==='prepare'?['type','choice']:['type'])||!['prepare','start-manual','simulate-at-bat','simulate-game'].includes(type))return errorResponse(res,400,'invalid_command')
          if(type==='simulate-game') {
            if(existing.snapshot.scheduleId!==BASEBALL_REGULAR_SEASON_ID)return errorResponse(res,400,'invalid_command')
            const result=simulateBaseballCareerGame(existing.snapshot,{expectedRevision:body.expectedRevision,now:nowIso,idFactory:nextId,seedFactory:nextSeed})
            next=result.career
            changes=result.atBats.map(row=>({id:row.id,gameIndex:row.gameIndex,slot:row.slot,source:row.source,expectedRevision:0,snapshot:row}))
          } else {
            if(type==='start-manual')atBat=createBaseballCareerManualAtBat(existing.snapshot,{id:nextId(),seed:nextSeed(),now:nowIso})
            if(type==='simulate-at-bat')atBat=simulateBaseballCareerAtBat(existing.snapshot,{id:nextId(),seed:nextSeed(),now:nowIso})
            next=applyBaseballCareerCommand(existing.snapshot,{...body.command,commandId:body.commandId,expectedRevision:body.expectedRevision},{now:nowIso,atBat})
            if(atBat) {
              const current=next.activeAtBat||atBat
              changes=[{id:atBat.id,gameIndex:current.gameIndex,slot:current.slot,source:atBat.source,expectedRevision:0,snapshot:atBat}]
            }
          }
        }
      }catch(error){if(!error?.code)throw error;return domainError(res,error,body.expectedRevision,actualInputRevision,Boolean(atBatId))}
      const saved=await store.save(owner.hash,careerId,expectedRevision,body.commandId,hash,next,changes,atBatReceipt)
      if(saved.status!=='stored')return storeError(res,saved)
      const career=safeCareer(saved.snapshot,careerId),careerReceipt=safeReceipt(saved.receipt,careerId,body.commandId)
      if(career.revision<careerReceipt.revision)throw new Error('Invalid career saved revision')
      if(!atBatId)return res.status(200).json({status:'stored',career,receipt:careerReceipt,duplicate:saved.duplicate===true})
      const row=await store.readAtBat(owner.hash,careerId,atBatId)
      if(row.status!=='ok')return storeError(res,row)
      const session=safeAtBat(row,atBatId),receipt=safeReceipt(saved.atBatReceipt,atBatId,body.commandId)
      if(!session||session.revision<receipt.revision)throw new Error('Invalid career at-bat saved revision')
      return res.status(200).json({status:'stored',session,receipt,career,careerReceipt,duplicate:saved.duplicate===true})
    }catch{return errorResponse(res,503,'database_unavailable')}
  }
}

export { createBaseballCareerApiHandler as createBaseballCareerV2ApiHandler, createBaseballCareerVersions as createBaseballCareerV2Versions }
