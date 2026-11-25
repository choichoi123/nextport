const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)

export function createBaseballCareerRecoveryStore(sql){
  const call=async(query,values)=>{
    const rows=await sql.query(query,values),result=rows?.[0]?.result
    if(!object(result))throw new Error('Invalid career recovery database response')
    return result
  }
  return {
    code:(actor,id,version,action,hash=null,encrypted=null)=>call('SELECT baseball_private.baseball_career_recovery_code($1,$2::uuid,$3::integer,$4,$5,$6) AS result',[actor,id,version,action,hash,encrypted]),
    redeem:(actor,hash)=>call('SELECT baseball_private.baseball_redeem_career_code($1,$2) AS result',[actor,hash]),
    resolveOwner:(actor,id,version)=>call('SELECT baseball_private.baseball_resolve_career_owner($1,$2::uuid,$3::integer) AS result',[actor,id,version]),
    listAccessible:(actor,version)=>call('SELECT baseball_private.baseball_list_accessible_careers($1,$2::integer) AS result',[actor,version]),
  }
}

/** Resolves only the selected player. It never replaces the browser's identity. */
export function withBaseballCareerAccess(baseStore,recoveryStore,{version=1}={}){
  if(![1,2].includes(version))throw new Error('Unsupported career access version')
  const authorized=async(actor,id,work)=>{
    const access=await recoveryStore.resolveOwner(actor,id,version)
    if(access.status!=='ok')return access
    if(typeof access.ownerHash!=='string'||!/^[a-f0-9]{64}$/.test(access.ownerHash))throw new Error('Invalid career access response')
    return work(access.ownerHash)
  }
  return {
    ...baseStore,
    list:actor=>recoveryStore.listAccessible(actor,version),
    read:(actor,id,commandId=null)=>authorized(actor,id,owner=>baseStore.read(owner,id,commandId)),
    readAtBat:(actor,id,atBatId)=>authorized(actor,id,owner=>baseStore.readAtBat(owner,id,atBatId)),
    save:(actor,id,expectedRevision,...args)=>expectedRevision===0?baseStore.save(actor,id,expectedRevision,...args)
      :authorized(actor,id,owner=>baseStore.save(owner,id,expectedRevision,...args)),
  }
}

let cachedUrl,cachedStore
export async function getBaseballCareerRecoveryStore(config){
  if(cachedUrl===config.databaseUrl&&cachedStore)return cachedStore
  const {neon}=await import('@neondatabase/serverless')
  const sql=neon(config.databaseUrl)
  cachedStore=createBaseballCareerRecoveryStore({query:(query,values)=>sql.query(query,values,{fetchOptions:{signal:AbortSignal.timeout(15000)}})})
  cachedUrl=config.databaseUrl
  return cachedStore
}
