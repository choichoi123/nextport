import { BASEBALL_FIELD_MODEL } from './playground-baseball-field.mjs'

// Display-only sampling of a result already produced by the field model.
// This module never resolves a pitch, advances a session, or invents a throw.
export const BASEBALL_FIELD_PRESENTATION = Object.freeze({
  id:'baseball-field-presentation-v1', firstStepsDistanceM:4,
})

const finite=value=>typeof value==='number'&&Number.isFinite(value)
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value))
const position=value=>value&&['x','y','z'].every(key=>finite(value[key]))&&value.y>=0
const timed=value=>position(value)&&finite(value.timeMs)&&value.timeMs>=0
const same=(a,b)=>a&&b&&['x','y','z','timeMs'].every(key=>a[key]===b[key])
const xyzSame=(a,b)=>['x','y','z'].every(key=>a[key]===b[key])
const copy=value=>Object.freeze({x:value.x,y:value.y,z:value.z,...(finite(value.timeMs)?{timeMs:value.timeMs}:{})})
const expected={single:{bases:1,isHit:true,reasons:['safe-single']},double:{bases:2,isHit:true,reasons:['safe-double','ground-rule-double']},
  triple:{bases:3,isHit:true,reasons:['safe-triple']},'home-run':{bases:4,isHit:true,reasons:['over-fence']},
  flyout:{bases:0,isHit:false,reasons:['caught-fly']},lineout:{bases:0,isHit:false,reasons:['caught-line-drive']},
  groundout:{bases:0,isHit:false,reasons:['throw-beats-runner']}}

function validPath(path){
  if(!Array.isArray(path)||path.length<2||path.length>4096)return false
  let previous=-1
  for(const point of path){if(!timed(point)||point.timeMs<=previous)return false;previous=point.timeMs}
  return path[0].timeMs===0
}

function validField(value){
  const outcome=value&&Object.hasOwn(expected,value.outcome)?expected[value.outcome]:null
  if(!outcome||value.modelVersion!==BASEBALL_FIELD_MODEL.version||value.bases!==outcome.bases||value.isHit!==outcome.isHit||!outcome.reasons.includes(value.reasonKey)
    ||!position(value.contactPoint)||!timed(value.decisionPoint)||value.decisionPoint.timeMs<=0
    ||!finite(value.playTimeMs)||value.playTimeMs<value.decisionPoint.timeMs||value.playTimeMs>BASEBALL_FIELD_MODEL.maximumPlayMs
    ||!validPath(value.path)||!Array.isArray(value.wallContacts)||value.wallContacts.length>value.path.length)return false
  if(value.path[0].timeMs!==0||!xyzSame(value.path[0],value.contactPoint)||!same(value.path.at(-1),value.decisionPoint))return false
  let previous=-1
  for(const point of value.wallContacts){if(!timed(point)||point.timeMs<=previous||point.timeMs>value.decisionPoint.timeMs)return false;previous=point.timeMs}
  if(value.landingPoint!==null&&!position(value.landingPoint))return false
  if(value.outcome==='home-run'&&(value.landingPoint!==null||value.decisionPoint.y<=BASEBALL_FIELD_MODEL.stadium.fenceHeightM))return false
  if(value.reasonKey==='ground-rule-double'&&(!value.landingPoint||value.landingPoint.y!==0))return false
  if(value.runnerBaseTimesMs!==undefined){
    if(!Array.isArray(value.runnerBaseTimesMs)||value.runnerBaseTimesMs.length!==3)return false
    previous=BASEBALL_FIELD_MODEL.runner.startDelayMs
    for(const time of value.runnerBaseTimesMs){if(!finite(time)||time<=previous)return false;previous=time}
  }else if(!['home-run','flyout','lineout'].includes(value.outcome)&&value.reasonKey!=='ground-rule-double')return false
  return true
}

/** Invalid or unsupported field data is absent, never repaired with a new arc. */
export function createBaseballFieldPresentation(fieldResult){
  if(!validField(fieldResult))return null
  const model=BASEBALL_FIELD_MODEL
  const firstBaseTimeMs=fieldResult.runnerBaseTimesMs?.[0]??model.runner.startDelayMs+model.baseDistanceM/model.runner.speedMps*1000
  return Object.freeze({version:BASEBALL_FIELD_PRESENTATION.id,modelVersion:fieldResult.modelVersion,
    outcome:fieldResult.outcome,bases:fieldResult.bases,isHit:fieldResult.isHit,reasonKey:fieldResult.reasonKey,
    contactPoint:copy(fieldResult.contactPoint),landingPoint:fieldResult.landingPoint?copy(fieldResult.landingPoint):null,
    decisionPoint:copy(fieldResult.decisionPoint),playTimeMs:fieldResult.playTimeMs,
    path:Object.freeze(fieldResult.path.map(copy)),wallContacts:Object.freeze(fieldResult.wallContacts.map(copy)),
    runner:Object.freeze({baseDistanceM:model.baseDistanceM,startDelayMs:model.runner.startDelayMs,firstBaseTimeMs})})
}

/**
 * A current manual trajectory may be shown before its receipt, but no final
 * celebration is authorized by it. Restored/automatic records are static only.
 * Preview is an explicitly separate presentation source, never a live result.
 */
export function canAnimateBaseballFieldPresentation({origin,phase='result',currentManual=false,confirmed=false,authority=null}={}){
  if(!['trajectory','result'].includes(phase))return false
  if(origin==='preview')return authority==='preview'
  if(origin!=='live')return false
  return phase==='trajectory'?currentManual===true:confirmed===true&&['memory','server'].includes(authority)
}

function validPresentation(value){
  const outcome=value&&Object.hasOwn(expected,value.outcome)?expected[value.outcome]:null
  return Boolean(outcome)&&value.bases===outcome.bases&&value.isHit===outcome.isHit&&outcome.reasons.includes(value.reasonKey)
    &&value.version===BASEBALL_FIELD_PRESENTATION.id&&value.modelVersion===BASEBALL_FIELD_MODEL.version
    &&validPath(value.path)
    &&position(value.contactPoint)&&xyzSame(value.path[0],value.contactPoint)&&timed(value.decisionPoint)&&value.decisionPoint.timeMs>0&&same(value.path.at(-1),value.decisionPoint)
    &&finite(value.playTimeMs)&&value.playTimeMs>=value.decisionPoint.timeMs&&value.playTimeMs<=BASEBALL_FIELD_MODEL.maximumPlayMs
    &&Array.isArray(value.wallContacts)&&value.wallContacts.length<=value.path.length
    &&Array.from(value.wallContacts).every((point,index)=>timed(point)&&point.timeMs<=value.decisionPoint.timeMs&&(!index||point.timeMs>value.wallContacts[index-1].timeMs))
    &&value.runner?.baseDistanceM===BASEBALL_FIELD_MODEL.baseDistanceM&&value.runner.startDelayMs===BASEBALL_FIELD_MODEL.runner.startDelayMs
    &&finite(value.runner.firstBaseTimeMs)&&value.runner.firstBaseTimeMs>value.runner.startDelayMs
}

/**
 * elapsedMs is relative to the existing contact clock, not to the receipt.
 * Trace/wall arrays contain reached samples only. Outcome/awardedBases remain
 * model facts; callers must not present them as confirmed before their receipt.
 */
export function sampleBaseballFieldPresentation(presentation,elapsedMs){
  if(!validPresentation(presentation)||!finite(elapsedMs))return null
  const {path,decisionPoint,playTimeMs,runner}=presentation
  const started=elapsedMs>=0,time=clamp(elapsedMs,0,playTimeMs),ballTime=Math.min(time,decisionPoint.timeMs)
  let low=0,high=path.length-1
  while(low+1<high){const middle=(low+high)>>1;if(path[middle].timeMs<=ballTime)low=middle;else high=middle}
  if(ballTime===path[high].timeMs)low=high
  const a=path[low],b=path[Math.min(low+1,path.length-1)]
  const amount=a.timeMs===b.timeMs?0:(ballTime-a.timeMs)/(b.timeMs-a.timeMs)
  const ball=started?(ballTime===a.timeMs?a:Object.freeze({x:a.x+(b.x-a.x)*amount,y:a.y+(b.y-a.y)*amount,z:a.z+(b.z-a.z)*amount,timeMs:ballTime})):null
  const trace=started?path.slice(0,low+1):[]
  if(ball&&ball!==a)trace.push(ball)
  const progress=clamp((time-runner.startDelayMs)/(runner.firstBaseTimeMs-runner.startDelayMs),0,1)
  const meters=progress*runner.baseDistanceM,edge=runner.baseDistanceM/Math.SQRT2
  // Performance-clock addition/subtraction can land a fraction below the exact
  // display endpoint. Snap that sub-nanometer remainder, never the field clock.
  const firstStepsMeters=meters>=BASEBALL_FIELD_PRESENTATION.firstStepsDistanceM-1e-9
    ?BASEBALL_FIELD_PRESENTATION.firstStepsDistanceM:Math.min(meters,BASEBALL_FIELD_PRESENTATION.firstStepsDistanceM)
  const firstStepsDurationMs=(runner.firstBaseTimeMs-runner.startDelayMs)*BASEBALL_FIELD_PRESENTATION.firstStepsDistanceM/runner.baseDistanceM
  const running=started&&time>=runner.startDelayMs&&time<playTimeMs&&progress<1
  return Object.freeze({started,elapsedMs:time,ball,trace:Object.freeze(trace),
    wallContacts:Object.freeze(started?presentation.wallContacts.filter(point=>point.timeMs<=time):[]),
    ballComplete:started&&time>=decisionPoint.timeMs,playComplete:started&&time>=playTimeMs,
    runner:Object.freeze({position:Object.freeze({x:edge*progress,y:0,z:edge*progress}),progress,meters,
      moving:running,startDelayMs:runner.startDelayMs,firstBaseTimeMs:runner.firstBaseTimeMs,
      firstBaseReached:progress===1,awardedBases:presentation.bases,
      firstSteps:Object.freeze({progress:firstStepsMeters/BASEBALL_FIELD_PRESENTATION.firstStepsDistanceM,meters:firstStepsMeters,
        elapsedMs:clamp(time-runner.startDelayMs,0,firstStepsDurationMs),durationMs:firstStepsDurationMs,
        moving:running&&firstStepsMeters<BASEBALL_FIELD_PRESENTATION.firstStepsDistanceM,
        complete:firstStepsMeters===BASEBALL_FIELD_PRESENTATION.firstStepsDistanceM,
        stopped:started&&(time>=playTimeMs||firstStepsMeters===BASEBALL_FIELD_PRESENTATION.firstStepsDistanceM)})})})
}
