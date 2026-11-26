const ENDPOINT='/api/playground/baseball/careers/recovery'
const CAREER_LIST='/api/playground/baseball/careers-v2'
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const CODE=/^BCR1(?:-[0-9A-HJKMNP-TV-Z]{4}){8}$/
const fail=code=>Object.assign(new Error('Career recovery unavailable'),{code})
const allowed=new Set(['recovery_unavailable','not_configured','owner_required','invalid_origin','invalid_content_type','rate_limited','body_too_large'])

/** Returned codes live only in the caller's current UI state. No journals or storage are opened. */
export function createBaseballCareerRecoveryClient({fetchImpl=globalThis.fetch,timeoutMs=20000}={}){
  const pending=new Set()
  let closed=false
  async function request(route,body){
    if(closed)throw fail('recovery_unavailable')
    const controller=new AbortController();pending.add(controller)
    const timer=setTimeout(()=>controller.abort(),timeoutMs)
    try{
      const send=()=>fetchImpl(`${ENDPOINT}/${route}`,{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      let response=await send(),value=await response.json()
      if(!closed&&route==='redeem'&&response.status===401&&value?.code==='owner_required'){
        // The list creates the browser's identity before redemption is rate-limited.
        const browser=await fetchImpl(CAREER_LIST,{method:'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal})
        if(!browser.ok||closed)throw fail('owner_required')
        response=await send()
        value=await response.json()
      }
      if(closed)throw fail('recovery_unavailable')
      if(!response.ok)throw fail(allowed.has(value?.code)?value.code:'recovery_unavailable')
      if(value?.status!=='ok'||!UUID.test(value.careerId)||![1,2].includes(value.version))throw fail('recovery_unavailable')
      if(route==='redeem')return {status:'ok',careerId:value.careerId,version:value.version}
      if(value.careerId!==body.careerId||value.version!==body.version||!['active','absent','revoked'].includes(value.state)
        ||value.state==='active'&&!CODE.test(value.code))throw fail('recovery_unavailable')
      return {status:'ok',careerId:value.careerId,version:value.version,state:value.state,...(value.state==='active'?{code:value.code}:{})}
    }catch(cause){throw fail(allowed.has(cause?.code)?cause.code:'recovery_unavailable')}
    finally{clearTimeout(timer);pending.delete(controller)}
  }
  const code=(action,careerId,version)=>{
    if(!UUID.test(careerId)||![1,2].includes(version))return Promise.reject(fail('recovery_unavailable'))
    return request('code',{careerId,version,action})
  }
  return {
    read:(id,version)=>code('read',id,version),issue:(id,version)=>code('issue',id,version),
    rotate:(id,version)=>code('rotate',id,version),revoke:(id,version)=>code('revoke',id,version),
    redeem:value=>typeof value==='string'&&value.length<=128?request('redeem',{code:value}):Promise.reject(fail('recovery_unavailable')),
    close:()=>{closed=true;for(const controller of pending)controller.abort();pending.clear()},
  }
}
