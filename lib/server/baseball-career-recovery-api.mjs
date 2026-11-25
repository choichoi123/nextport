import { hasBaseballSameOrigin, readBaseballParticipant } from './baseball-auth.mjs'
import { readBaseballConfiguration } from './baseball-db.mjs'
import { getBaseballCareerRecoveryStore } from './baseball-career-recovery-db.mjs'
import { createBaseballCareerRecoveryCode, normalizeBaseballCareerRecoveryCode, hashBaseballCareerRecoveryCode,
  encryptBaseballCareerRecoveryCode, decryptBaseballCareerRecoveryCode } from './baseball-career-recovery.mjs'

export const BASEBALL_CAREER_RECOVERY_BODY_BYTES=1024
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$/
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const exact=(value,keys)=>object(value)&&keys.length===Object.keys(value).length&&keys.every(key=>Object.hasOwn(value,key))
const invalid=(code='recovery_unavailable',statusCode=400)=>Object.assign(new Error('Career recovery unavailable'),{code,statusCode})
async function bodyFor(req){
  if(req.body!==undefined){
    let value
    try{value=JSON.stringify(req.body)}catch{throw invalid()}
    if(typeof value!=='string')throw invalid()
    if(Buffer.byteLength(value)>BASEBALL_CAREER_RECOVERY_BODY_BYTES)throw invalid('body_too_large',413)
    return req.body
  }
  if(typeof req.on!=='function')throw invalid()
  return new Promise((resolve,reject)=>{
    let size=0
    const chunks=[]
    const cleanup=()=>{req.off('data',data);req.off('end',end);req.off('error',failed);req.off('aborted',failed)}
    const failed=()=>{cleanup();reject(invalid())}
    const data=chunk=>{const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length
      if(size>BASEBALL_CAREER_RECOVERY_BODY_BYTES){cleanup();req.resume();reject(invalid('body_too_large',413));return}chunks.push(bytes)}
    const end=()=>{cleanup();try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(invalid())}}
    req.on('data',data);req.on('end',end);req.on('error',failed);req.on('aborted',failed)
  })
}
const errorResponse=(res,status,code='recovery_unavailable')=>res.status(status).json({status:status===503?'unavailable':'error',code})
function storeError(res,result){
  if(result?.code==='rate_limited'){res.setHeader('Retry-After','60');return errorResponse(res,429,'rate_limited')}
  return errorResponse(res,400)
}

/** Recovery only grants this player to the current browser; it never transfers ownership. */
export function createBaseballCareerRecoveryHandler({mode='code',...dependencies}={}){
  if(!['code','redeem'].includes(mode))throw new TypeError('Invalid recovery route')
  return async function recoveryApi(req,res){
    res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Pragma','no-cache')
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer')
    if(req.method!=='POST'){res.setHeader('Allow','POST');return errorResponse(res,405,'method_not_allowed')}
    const config=readBaseballConfiguration(dependencies.env||process.env)
    if(!config)return errorResponse(res,503,'not_configured')
    if(!hasBaseballSameOrigin(req))return errorResponse(res,403,'invalid_origin')
    if(req.query&&Object.keys(req.query).length)return errorResponse(res,400)
    if(typeof req.headers?.['content-type']!=='string'||!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']))return errorResponse(res,415,'invalid_content_type')
    const length=req.headers?.['content-length']
    if(length!==undefined&&(!Number.isSafeInteger(Number(length))||Number(length)<0))return errorResponse(res,400)
    if(Number(length)>BASEBALL_CAREER_RECOVERY_BODY_BYTES)return errorResponse(res,413,'body_too_large')
    let body
    try{body=await bodyFor(req)}catch(cause){return errorResponse(res,cause.statusCode||400,cause.code||'recovery_unavailable')}
    const now=dependencies.now?.()??Date.now(),participant=readBaseballParticipant(req,config.secret,now)
    // The existing list-only bootstrap must establish the requester's cookie
    // before a guess. Creating an actor per failed redemption defeats its rate limit.
    if(!participant)return errorResponse(res,401,'owner_required')
    if(mode==='code'&&(!exact(body,['careerId','version','action'])||!UUID.test(body.careerId)||![1,2].includes(body.version)||!['read','issue','rotate','revoke'].includes(body.action))
      ||mode==='redeem'&&(!exact(body,['code'])||!normalizeBaseballCareerRecoveryCode(body.code)))return errorResponse(res,400)
    try{
      const store=dependencies.store||await(dependencies.getStore||getBaseballCareerRecoveryStore)(config)
      if(mode==='redeem'){
        const result=await store.redeem(participant.hash,hashBaseballCareerRecoveryCode(body.code,config.secret))
        if(result?.status!=='ok')return storeError(res,result)
        if(!UUID.test(result.careerId)||![1,2].includes(result.version))throw invalid()
        return res.status(200).json({status:'ok',careerId:result.careerId,version:result.version})
      }
      let hash=null,encrypted=null
      if(['issue','rotate'].includes(body.action)){
        const code=(dependencies.createCode||createBaseballCareerRecoveryCode)()
        hash=hashBaseballCareerRecoveryCode(code,config.secret)
        encrypted=encryptBaseballCareerRecoveryCode(code,config.secret,body)
      }
      const result=await store.code(participant.hash,body.careerId,body.version,body.action,hash,encrypted)
      if(result?.status!=='ok')return storeError(res,result)
      if(!['active','absent','revoked'].includes(result.state))throw invalid()
      const value={status:'ok',careerId:body.careerId,version:body.version,state:result.state}
      if(result.state==='active')value.code=decryptBaseballCareerRecoveryCode(result.encryptedCode,config.secret,body)
      return res.status(200).json(value)
    }catch{return errorResponse(res,503)}
  }
}
