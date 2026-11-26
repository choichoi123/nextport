import { createHash } from 'node:crypto'
import { BASEBALL_ANNUAL_MAX_SEASONS, BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES, getBaseballAnnualIdentity, isBaseballCareerFinish, isCompleteBaseballAnnualStats, replayBaseballAnnualSubmission } from '../playground-baseball-annual.mjs'
import { BASEBALL_REGULAR_SEASON_GAMES } from '../playground-baseball-career-schedule.mjs'
import { BASEBALL_ANNUAL_APPEARANCES_PER_GAME } from '../playground-baseball-career-v2.mjs'
import { supportsBaseballAnnualVersions } from '../playground-baseball-career-versions.mjs'
import { isBaseballAtBatPitchMode } from '../playground-baseball-practice-pitches.mjs'
import { validateBaseballPlayer } from '../playground-baseball-teams.mjs'
import { isBaseballWinterPlan } from '../playground-baseball-winter.mjs'
import { createBaseballParticipant, hasBaseballCareerSameOrigin, readBaseballParticipant, shouldSecureBaseballCareerCookie } from './baseball-auth.mjs'
import { createBaseballCareerV2Versions } from './baseball-career-v2-api.mjs'
import { canonicalBaseballVersionJson } from './baseball-version.mjs'
import { readBaseballCareerConfiguration } from './baseball-db.mjs'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const statsKeys = ['G','PA','AB','H','2B','3B','HR','BB','SO']
const growthKeys = ['mit','power','discipline','stamina','trust','xp','condition']
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key))
const isUuid = value => typeof value==='string'&&UUID.test(value)
const isSettledStats = stats => exact(stats,statsKeys) && isCompleteBaseballAnnualStats(stats)
  && statsKeys.every(key=>Number.isInteger(stats[key])&&stats[key]>=0&&stats[key]<=stats.PA)
const errorResponse = (res,status,code) => res.status(status).json({status:status===503?'unavailable':'error',code})
const bodyError = (code='invalid_command',statusCode=400) => Object.assign(new Error('Invalid season submission'),{code,statusCode})
const limit = BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES

async function readSubmission(req) {
  if (req.body !== undefined) {
    const serialized = JSON.stringify(req.body)
    if (typeof serialized !== 'string') throw bodyError()
    if (Buffer.byteLength(serialized) > limit) throw bodyError('body_too_large',413)
    return req.body
  }
  if (typeof req.on !== 'function') throw bodyError()
  return new Promise((resolve,reject) => {
    let size=0
    const chunks=[]
    const cleanup=()=>{req.off('data',data);req.off('end',end);req.off('error',failed);req.off('aborted',failed)}
    const failed=()=>{cleanup();reject(bodyError())}
    const data=chunk=>{
      const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)
      size+=bytes.length
      if(size>limit){cleanup();req.resume();reject(bodyError('body_too_large',413));return}
      chunks.push(bytes)
    }
    const end=()=>{
      cleanup()
      try { resolve(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))) }
      catch { reject(bodyError()) }
    }
    req.on('data',data);req.on('end',end);req.on('error',failed);req.on('aborted',failed)
  })
}

export function createBaseballAnnualStore(sql) {
  const call=async(query,parameters)=>{
    const result=(await sql.query(query,parameters))?.[0]?.result
    if(!object(result))throw new Error('Invalid season storage response')
    return result
  }
  const json=value=>value===null?null:JSON.stringify(value)
  const initial=(owner,id,hash,career=null,atBats=null)=> call(
    'SELECT baseball_private.baseball_settle_career_annual($1, $2::uuid, $3, $4::jsonb, $5::jsonb) AS result',
    [owner,id,hash,json(career),json(atBats)])
  const continued=(actor,id,hash,setup,career=null,atBats=null)=> call(
    setup.winter
      ? 'SELECT baseball_private.baseball_continue_career_annual_with_winter($1, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::jsonb) AS result'
      : 'SELECT baseball_private.baseball_continue_career_annual($1, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::jsonb) AS result',
    [actor,id,hash,json(setup),json(career),json(atBats)])
  const finished=(actor,id,hash,setup,finish,career=null,atBats=null)=>call(
    'SELECT baseball_private.baseball_continue_career_annual_with_finish($1, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7) AS result',
    [actor,id,hash,json(setup),json(career),json(atBats),finish])
  return {
    lookup:initial, save:initial, lookupContinuation:continued, saveContinuation:continued,
    lookupFinish:finished, saveFinish:finished,
    history:(actor,id)=>call('SELECT baseball_private.baseball_read_career_annual_history_with_winter($1, $2::uuid) AS result',[actor,id]),
  }
}

let cachedStore, cachedUrl
async function getBaseballAnnualStore(config) {
  if(cachedUrl===config.databaseUrl&&cachedStore)return cachedStore
  const {neon}=await import('@neondatabase/serverless')
  const sql=neon(config.databaseUrl)
  cachedStore=createBaseballAnnualStore({query:(query,values)=>sql.query(query,values,{fetchOptions:{signal:AbortSignal.timeout(30000)}})})
  cachedUrl=config.databaseUrl
  return cachedStore
}

function storageResponse(res,result,{careerId,seasonId,seasonNumber},{winter,finish,expectedAppearances}) {
  if(result?.status==='stored'){
    const {receipt}=result
    const savedAt=new Date(receipt?.savedAt)
    if(!exact(receipt,['careerId','seasonId','seasonNumber','savedAt','stats',...(winter?['winter']:[]),...(finish?['finish']:[])])
      ||receipt.careerId!==careerId||receipt.seasonId!==seasonId||receipt.seasonNumber!==seasonNumber
      ||receipt.finish!==finish
      ||(winter&&(!isBaseballWinterPlan(receipt.winter)
        ||receipt.winter.version!==winter.version||receipt.winter.direction!==winter.direction))
      ||typeof receipt.savedAt!=='string'||!Number.isFinite(savedAt.getTime())||!isSettledStats(receipt.stats)
      ||receipt.stats.PA!==expectedAppearances||typeof result.duplicate!=='boolean') {
      throw new Error('Invalid season receipt')
    }
    return res.status(200).json({status:'stored',duplicate:result.duplicate,receipt:{
      careerId,seasonId,seasonNumber,savedAt:savedAt.toISOString(),stats:receipt.stats,
      ...(winter?{winter:receipt.winter}:{}),...(finish?{finish}:{})
    }})
  }
  return storageError(res,result)
}

function storageError(res,result) {
  const errors={season_conflict:409,storage_capacity:413,rate_limited:429,invalid_command:400}
  if(result?.status==='not_found')return errorResponse(res,404,'not_found')
  const code=result?.code
  if(code==='rate_limited')res.setHeader('Retry-After','60')
  return Object.hasOwn(errors,code)?errorResponse(res,errors[code],code):errorResponse(res,503,'database_unavailable')
}

function historyResponse(res,result,careerId) {
  if(result?.status!=='ok')return storageError(res,result)
  const {history,latest,winter,finish}=result
  if(result.careerId!==careerId||!Array.isArray(history)||history.length===0||history.length>BASEBALL_ANNUAL_MAX_SEASONS
    ||history[0]?.seasonId!==careerId||new Set(history.map(season=>season?.seasonId)).size!==history.length
    ||!history.every((season,index)=>exact(season,['seasonId','seasonNumber','stats'])&&isUuid(season.seasonId)
      &&season.seasonNumber===index+1&&isSettledStats(season.stats))
    ||!exact(latest,['seasonId','seasonNumber','growth','profile','settings','source'])||latest.seasonId!==history.at(-1).seasonId
    ||latest.seasonNumber!==history.length||!exact(latest.growth,growthKeys)
    ||!growthKeys.every(key=>Number.isSafeInteger(latest.growth[key])&&latest.growth[key]>=0&&(key==='xp'||latest.growth[key]<=100))
    ||!exact(latest.settings,['baseSpeedKmh','pitchMode'])||!Number.isFinite(latest.settings.baseSpeedKmh)
    ||latest.settings.baseSpeedKmh<80||latest.settings.baseSpeedKmh>160||!isBaseballAtBatPitchMode(latest.settings.pitchMode)
    ||!['manual','development'].includes(latest.source)
    ||(winter!==undefined&&(history.length<2||!exact(winter,['2'])||!isBaseballWinterPlan(winter['2'])))
    ||(finish!==undefined&&(latest.seasonNumber!==BASEBALL_ANNUAL_MAX_SEASONS||!isBaseballCareerFinish(finish))))
    throw new Error('Invalid season history')
  const profile=validateBaseballPlayer(latest.profile)
  if(!profile.valid)throw new Error('Invalid season profile')
  return res.status(200).json({status:'ok',careerId,history,latest:{...latest,profile:profile.player},
    ...(winter?{winter}:{}),...(finish?{finish}:{})
  })
}

function validContinuation(setup) {
  if(!Object.hasOwn(setup,'continuation'))return !Object.hasOwn(setup,'winter')
  const value=setup.continuation
  return exact(value,['careerId','previousSeasonId','seasonNumber','startingGrowth','history'])&&isUuid(value.careerId)&&isUuid(value.previousSeasonId)
    &&value.careerId!==setup.id&&value.previousSeasonId!==setup.id&&Number.isInteger(value.seasonNumber)
    &&value.seasonNumber>=2&&value.seasonNumber<=BASEBALL_ANNUAL_MAX_SEASONS
    &&(!Object.hasOwn(setup,'winter')||(value.seasonNumber===2&&isBaseballWinterPlan(setup.winter)))
}

export function createBaseballCareerAnnualApiHandler(dependencies={}) {
  return async function annualCareerApi(req,res) {
    res.setHeader('Cache-Control','private, no-store')
    res.setHeader('X-Content-Type-Options','nosniff')
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return errorResponse(res,405,'method_not_allowed')}
    const config=readBaseballCareerConfiguration(dependencies.env||process.env)
    if(!config)return errorResponse(res,503,'not_configured')
    if(!hasBaseballCareerSameOrigin(req,config))return errorResponse(res,403,'invalid_origin')
    const query=req.query||{}
    const historyRequested=Object.keys(query).length>0
    if(historyRequested&&(req.method!=='GET'||!exact(query,['careerId'])||!isUuid(query.careerId)))return errorResponse(res,400,'invalid_command')
    const now=dependencies.now?.()??Date.now()
    const participant=readBaseballParticipant(req,config.secret,now)
    const getStore=()=>dependencies.store|| (dependencies.getStore||getBaseballAnnualStore)(config)
    if(historyRequested){
      if(!participant)return errorResponse(res,401,'owner_required')
      try{
        const store=await getStore()
        return historyResponse(res,await store.history(participant.hash,query.careerId),query.careerId)
      }catch{return errorResponse(res,503,'database_unavailable')}
    }
    if(req.method==='GET'){
      if(!participant)res.setHeader('Set-Cookie',createBaseballParticipant(config.secret,{now,secure:shouldSecureBaseballCareerCookie(req,config)}).cookie)
      return res.status(200).json({status:'ok'})
    }
    if(!participant)return errorResponse(res,401,'owner_required')
    if(typeof req.headers?.['content-type']!=='string'||!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']))return errorResponse(res,415,'invalid_content_type')
    const length=req.headers?.['content-length']
    if(length!==undefined&&(!Number.isSafeInteger(Number(length))||Number(length)<0))return errorResponse(res,400,'invalid_command')
    if(Number(length)>limit)return errorResponse(res,413,'body_too_large')
    let body,hash
    try{
      body=await readSubmission(req)
      const fields=['setup','actions']
      if(object(body)&&Object.hasOwn(body,'finish'))fields.push('finish')
      if(!exact(body,fields)||!object(body.setup)||!isUuid(body.setup.id)
        ||!object(body.setup.versions)||!Array.isArray(body.actions)||!validContinuation(body.setup)
        ||(Object.hasOwn(body.setup,'appearancesPerGame')&&body.setup.appearancesPerGame!==BASEBALL_ANNUAL_APPEARANCES_PER_GAME)
        ||(fields.length===3&&(!isBaseballCareerFinish(body.finish)||body.setup.continuation?.seasonNumber!==BASEBALL_ANNUAL_MAX_SEASONS)))throw bodyError()
      hash=createHash('sha256').update(canonicalBaseballVersionJson(body)).digest('hex')
    }catch(error){return errorResponse(res,error.statusCode||400,error.code||'invalid_command')}
    const identity=getBaseballAnnualIdentity(body.setup)
    const {seasonId,seasonNumber}=identity
    const expectedAppearances=BASEBALL_REGULAR_SEASON_GAMES*(body.setup.appearancesPerGame??2)
    const settlement={winter:body.setup.winter,finish:body.finish,expectedAppearances}
    const continuationArgs=[participant.hash,seasonId,hash,body.setup]
    const continued=seasonNumber>1
    try{
      const store=await getStore()
      // A lost receipt can be retrieved with the original input after a rules update.
      const prior=settlement.finish?await store.lookupFinish(...continuationArgs,settlement.finish)
        :continued?await store.lookupContinuation(...continuationArgs):await store.lookup(participant.hash,seasonId,hash)
      if(prior?.status!=='unconfirmed')return storageResponse(res,prior,identity,settlement)
      let versions
      try{versions=await(dependencies.getVersions||createBaseballCareerV2Versions)()}
      catch{return errorResponse(res,503,'verification_unavailable')}
      if(!supportsBaseballAnnualVersions(body.setup,versions))return errorResponse(res,409,'version_mismatch')
      let replay
      try{replay=(dependencies.replay||replayBaseballAnnualSubmission)({setup:body.setup,actions:body.actions})}
      catch{return errorResponse(res,400,'invalid_command')}
      const career=replay.draft.career
      if(career.id!==seasonId||career.status!=='complete'||career.currentGameIndex!==BASEBALL_REGULAR_SEASON_GAMES
        ||career.appearancesPerGame!==body.setup.appearancesPerGame||!isSettledStats(career.stats)
        ||career.stats.PA!==expectedAppearances||replay.atBats.length!==expectedAppearances)return errorResponse(res,409,'season_incomplete')
      const result=settlement.finish?await store.saveFinish(...continuationArgs,settlement.finish,career,replay.atBats)
        :continued?await store.saveContinuation(...continuationArgs,career,replay.atBats)
        :await store.save(participant.hash,seasonId,hash,career,replay.atBats)
      return storageResponse(res,result,identity,settlement)
    }catch{return errorResponse(res,503,'database_unavailable')}
  }
}
