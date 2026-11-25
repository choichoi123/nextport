import { canAnimateBaseballFieldPresentation, sampleBaseballFieldPresentation } from './playground-baseball-field-presentation.mjs'

/** Whole-pose display selection, deliberately independent of batting/field rules. */
export function sampleBaseballPostplayMotion({trajectory=null,reaction=null,nowMs,strength='normal'}={}) {
  if(!Number.isFinite(nowMs)||strength==='off')return null
  const reduced=strength==='reduced'
  if(reaction&&canAnimateBaseballFieldPresentation({...reaction,phase:'result'})&&
      ['strikeout-looking','strikeout-swinging','walk'].includes(reaction.outcome)) {
    if(!Number.isFinite(reaction.startAt))return null
    const elapsed=nowMs-reaction.startAt
    if(!Number.isFinite(elapsed)||elapsed<0)return null
    return {frame:'lower',kind:reaction.outcome==='walk'?'walk':'strikeout',alpha:reduced?1:Math.min(1,elapsed/140),
      meters:0,position:{x:0,z:0},elapsedMs:elapsed}
  }
  if(!trajectory||!canAnimateBaseballFieldPresentation({...trajectory,phase:'trajectory'}))return null
  if(!Number.isFinite(trajectory.startAt))return null
  const elapsed=nowMs-trajectory.startAt
  if(!Number.isFinite(elapsed)||elapsed<0)return null
  const state=sampleBaseballFieldPresentation(trajectory.presentation,elapsed)
  if(!state?.runner)return null
  const steps=state.runner.firstSteps,start=state.runner.startDelayMs,lowerEnd=start+110
  if(elapsed<start)return null
  if(reduced)return {frame:'lower',kind:'watch',alpha:1,meters:0,position:{x:0,z:0},elapsedMs:elapsed}
  // Preserve the approved follow-through, then use the new intact lowered-bat pose.
  if(elapsed<lowerEnd)return {frame:'lower',kind:'lower',alpha:Math.min(1,(elapsed-start)/90),meters:0,position:{x:0,z:0},elapsedMs:elapsed}
  if(steps.stopped&&!steps.complete)return {frame:'lower',kind:'watch',alpha:1,meters:0,position:{x:0,z:0},elapsedMs:elapsed}
  const meters=steps.meters
  const endAt=Math.min(trajectory.presentation.playTimeMs,start+steps.durationMs)
  const rawFade=Math.max(0,Math.min(1,1-(elapsed-endAt)/260)),fade=rawFade<1e-9?0:rawFade
  if(meters<=0||fade<=0)return {frame:'lower',kind:'departed',alpha:0,meters,position:{x:meters/Math.SQRT2,z:meters/Math.SQRT2},elapsedMs:elapsed}
  return {frame:`run${1+Math.floor(Math.max(0,elapsed-lowerEnd)/100)%3}`,kind:'run',alpha:fade,meters,
    position:{x:meters/Math.SQRT2,z:meters/Math.SQRT2},elapsedMs:elapsed,firstStepsComplete:Boolean(steps?.complete)}
}
