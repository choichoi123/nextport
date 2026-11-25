export const BASEBALL_CONTACT_BOOST_DURATION_MS=320
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const validId=value=>typeof value==='string'&&value.trim().length>0&&value.length<=1024&&!/[\u0000-\u001f\u007f]/.test(value)

/** Samples an existing fair-contact event, without predicting its field result. */
export function getBaseballContactBoostPresentation({effect,nowMs,strength='normal'}={}){
  if(strength!=='normal'||!effect||typeof effect!=='object'||Array.isArray(effect)||effect.type!=='contact'
    ||!['contact','perfect'].includes(effect.outcome)||!['live','preview'].includes(effect.origin)
    ||!validId(effect.id)||!finite(effect.atMs)||effect.atMs<0||!finite(nowMs)||nowMs<0)return null
  const ageMs=nowMs-effect.atMs
  if(ageMs<0||ageMs>=BASEBALL_CONTACT_BOOST_DURATION_MS)return null
  return Object.freeze({id:effect.id,ageMs,durationMs:BASEBALL_CONTACT_BOOST_DURATION_MS,
    remainingMs:BASEBALL_CONTACT_BOOST_DURATION_MS-ageMs,animationDelayMs:-ageMs,animated:true})
}
