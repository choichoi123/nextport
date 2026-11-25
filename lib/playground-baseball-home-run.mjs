const DURATION_MS=1200
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const validId=value=>typeof value==='string'&&value.trim().length>0&&value.length<=1024&&!/[\u0000-\u001f\u007f]/.test(value)

/**
 * Sample an already gated, confirmed result. This is neither a new result gate
 * nor a clock owner: changing style/strength never creates a new display epoch.
 */
export function getBaseballHomeRunPresentation({effect,nowMs,variant='classic',strength='normal'}={}){
  if(!effect||typeof effect!=='object'||Array.isArray(effect)||effect.type!=='result'||effect.outcome!=='home-run'||effect.confirmed!==true
    ||!validId(effect.id)||!finite(effect.atMs)||effect.atMs<0||!finite(nowMs)||nowMs<0||strength==='off')return null
  const ageMs=nowMs-effect.atMs
  if(ageMs<0||ageMs>=DURATION_MS)return null
  // Unknown preferences use a stationary presentation, never extra movement.
  const normalizedStrength=['normal','subtle','reduced'].includes(strength)?strength:'subtle'
  return Object.freeze({id:effect.id,variant:variant==='arcade'?'arcade':'classic',strength:normalizedStrength,
    ageMs,durationMs:DURATION_MS,remainingMs:DURATION_MS-ageMs,animationDelayMs:-ageMs,animated:normalizedStrength==='normal'})
}
