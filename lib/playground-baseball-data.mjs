// Semantic, bounded local records only. No network, disk, participant or rewards.
export const BASEBALL_DATA_SCHEMA_VERSION = 1
export const BASEBALL_DATA_LIMITS = Object.freeze({ sessions:5, attemptsPerSession:100 })

const hands = new Set(['left','right'])
const pitchTypes = new Set(['four-seam','slider','curveball','changeup'])
const outcomes = new Set(['perfect','contact','foul','miss','called-strike','ball'])
const abortReasons = new Set(['manual','blur','hidden','menu','route-change','escape','tab','focus-change','focus-leave','player-change','restart','unmount','version-change'])
const endReasons = new Set(['complete','player-change','restart','unmount','version-change'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const hash = /^[0-9a-f]{64}$/
const finite = value => typeof value === 'number' && Number.isFinite(value)
const object = value => value !== null && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value))
const clone = value => JSON.parse(JSON.stringify(value))
const keysOnly = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key))
const exactKeys = (value, keys) => keysOnly(value,keys) && keys.every(key => Object.hasOwn(value,key))
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value))
const inRange = (value,min,max) => finite(value) && value >= min && value <= max
const point2 = value => exactKeys(value,['x','y']) && finite(value.x) && finite(value.y)
const point3 = value => exactKeys(value,['x','y','z']) && finite(value.x) && finite(value.y) && finite(value.z)
const copyPoint = (value, dimensions = 3) => object(value) ? Object.fromEntries((dimensions===2?['x','y']:['x','y','z']).map(key=>[key,value[key]])) : null

const ruleNumbers = ['releaseDistanceM','windupMs','swingContactMs','swingDurationMs','sessionPitches','resolveAfterMs','minimumSpeedKmh','minimumOffspeedKmh','maximumSpeedKmh','gravityMps2','backspinLiftMps2','dragPerSecond','ballRadiusM','batRadiusM','batBarrelLengthM','batSweepRadiusM','batAngularSpeedRadPerMs','batRiseM','batActiveStartMs','batActiveEndMs','collisionToleranceM','courseMarginXM','courseMarginYM','plateMiddleZ','plateEndZ']
function validBounds(value) {
  return exactKeys(value,['left','right','bottom','top']) && Object.values(value).every(finite) && value.left < value.right && value.bottom < value.top
}
function validFiles(files) {
  return Array.isArray(files) && files.length > 0 && files.length <= 32 && new Set(files.map(file=>file?.path)).size===files.length && files.every(file=>
    exactKeys(file,['path','hash']) && typeof file.path==='string' && /^(?:lib|components|styles)\/[a-z0-9/_.-]*baseball[a-z0-9/_.-]*\.(?:mjs|js|css)$/.test(file.path) && !file.path.includes('..') && hash.test(file.hash))
}
function validVersions(value) {
  if (!exactKeys(value,['schemaVersion','engine','rules','presentation']) || value.schemaVersion!==BASEBALL_DATA_SCHEMA_VERSION) return false
  if (!exactKeys(value.engine,['algorithm','hash','files']) || value.engine.algorithm!=='sha256' || !hash.test(value.engine.hash) || !validFiles(value.engine.files)) return false
  if (!exactKeys(value.presentation,['hash','files']) || !hash.test(value.presentation.hash) || !validFiles(value.presentation.files)) return false
  if (!exactKeys(value.rules,['id','hash','snapshot']) || !['baseball-fixed-center-8cm-v1','baseball-fixed-center-8cm-v2'].includes(value.rules.id) || !hash.test(value.rules.hash)) return false
  const snapshot=value.rules.snapshot, rules=snapshot?.rules
  if (!exactKeys(snapshot,['rules','pitchTypes']) || !exactKeys(rules,[...ruleNumbers,'zone','aimBounds']) || !ruleNumbers.every(key=>finite(rules[key])) || !validBounds(rules.zone) || !validBounds(rules.aimBounds)) return false
  const expectedStartMs=value.rules.id==='baseball-fixed-center-8cm-v1'?20:0
  if (rules.ballRadiusM!==0.04 || rules.batRadiusM!==0.033 || rules.swingContactMs!==110 || rules.windupMs<=0 || rules.sessionPitches!==10 || rules.batActiveStartMs!==expectedStartMs || rules.batActiveEndMs!==210) return false
  return Array.isArray(snapshot.pitchTypes) && snapshot.pitchTypes.length===4 && new Set(snapshot.pitchTypes.map(profile=>profile?.id)).size===4 && snapshot.pitchTypes.every(profile=>
    exactKeys(profile,['id','ratio','dragPerSecond','acceleration']) && pitchTypes.has(profile.id) && inRange(profile.ratio,0.1,1) && inRange(profile.dragPerSecond,0.00001,2) && point3(profile.acceleration))
}

function copyEnvironment(value) {
  return { viewportBucket:value?.viewportBucket, orientation:value?.orientation, focusEnabled:value?.focusEnabled, locale:value?.locale }
}
function validEnvironment(value) {
  return exactKeys(value,['viewportBucket','orientation','focusEnabled','locale']) && ['compact','medium','wide'].includes(value.viewportBucket) && ['portrait','landscape'].includes(value.orientation) && typeof value.focusEnabled==='boolean' && ['ko','en'].includes(value.locale)
}
function copyInput(value) {
  return { source:value?.source, surface:value?.surface, pointerType:value?.pointerType ?? null, code:value?.code ?? null }
}
function validInput(value) {
  if (!exactKeys(value,['source','surface','pointerType','code']) || !['field','focus'].includes(value.surface)) return false
  if (value.source==='pointer') return ['mouse','touch','pen'].includes(value.pointerType) && value.code===null
  if (value.source==='keyboard') return value.pointerType===null && value.code==='Space'
  return value.source==='button' && value.pointerType===null && value.code===null
}
function copyPitch(value) {
  return { type:value?.type, seed:value?.seed, speedKmh:value?.speedKmh, pitcherHandedness:value?.pitcherHandedness,
    dragPerSecond:value?.dragPerSecond, flightTimeMs:value?.flightTimeMs,
    release:copyPoint(value?.release), target:copyPoint(value?.target,2), velocity:copyPoint(value?.velocity), acceleration:copyPoint(value?.acceleration) }
}
function validPitch(value) {
  return exactKeys(value,['type','seed','speedKmh','pitcherHandedness','dragPerSecond','flightTimeMs','release','target','velocity','acceleration']) && pitchTypes.has(value.type) && Number.isInteger(value.seed) && inRange(value.seed,0,0xffffffff) && hands.has(value.pitcherHandedness) &&
    inRange(value.speedKmh,value.type==='four-seam'?80:60,160) && inRange(value.dragPerSecond,0.00001,2) && inRange(value.flightTimeMs,1,60000) && point3(value.release) && inRange(value.release.z,1,30) && point2(value.target) && inRange(value.target.x,-1.25,1.25) && inRange(value.target.y,0.1,2) && point3(value.velocity) && value.velocity.z<0 && point3(value.acceleration) && value.acceleration.z===0
}

const resultNumbers = ['timingErrorMs','aimErrorM','quality','score','exitSpeedKmh','launchAngleDeg','distanceM','directionDeg','landingTimeMs','contactAtMs','swingElapsedMs','barrelGapM','barrelFraction','pitchSpeedKmh','pitchFlightTimeMs']
const nullableNumbers = new Set(['timingErrorMs','aimErrorM','contactAtMs','swingElapsedMs','barrelGapM','barrelFraction'])
const resultKeys = [...resultNumbers,'outcome','contacted','activeAtPlate','contactPoint','barrelClosestPoint','missReason','pitcherHandedness','pitchType','platePassage']
function copyResult(value) {
  if (!object(value)) return null
  const output=Object.fromEntries(resultNumbers.map(key=>[key,value[key]]))
  for (const key of ['outcome','contacted','activeAtPlate','missReason','pitcherHandedness','pitchType']) output[key]=value[key]
  output.contactPoint=value.contactPoint===null?null:copyPoint(value.contactPoint)
  output.barrelClosestPoint=value.barrelClosestPoint===null?null:copyPoint(value.barrelClosestPoint)
  output.platePassage=object(value.platePassage)?{timeMs:value.platePassage.timeMs,planeZ:value.platePassage.planeZ,inside:value.platePassage.inside,point:copyPoint(value.platePassage.point)}:null
  if (Object.hasOwn(value,'relativeSpeedKmh')) output.relativeSpeedKmh=value.relativeSpeedKmh
  return output
}
function validResult(value, attempt, versions) {
  if (!keysOnly(value,[...resultKeys,'relativeSpeedKmh']) || !resultKeys.every(key=>Object.hasOwn(value,key)) || !outcomes.has(value.outcome)) return false
  if (!resultNumbers.every(key=>finite(value[key]) || nullableNumbers.has(key) && value[key]===null)) return false
  if (Object.hasOwn(value,'relativeSpeedKmh') && (!finite(value.relativeSpeedKmh) || value.relativeSpeedKmh<0)) return false
  if (typeof value.contacted!=='boolean' || typeof value.activeAtPlate!=='boolean' || !Number.isInteger(value.score) || !inRange(value.score,0,100) || !inRange(value.quality,0,1)) return false
  if (![null,'outside-window','outside-barrel'].includes(value.missReason) || !hands.has(value.pitcherHandedness) || !pitchTypes.has(value.pitchType)) return false
  if (value.pitcherHandedness!==attempt.pitch.pitcherHandedness || value.pitchType!==attempt.pitch.type || value.pitchSpeedKmh!==attempt.pitch.speedKmh || value.pitchFlightTimeMs!==attempt.pitch.flightTimeMs) return false
  const passage=value.platePassage
  if (!exactKeys(passage,['timeMs','planeZ','inside','point']) || !inRange(passage.timeMs,0,60000) || passage.planeZ!==0 || typeof passage.inside!=='boolean' || !point3(passage.point) || passage.point.z!==0) return false
  if (value.contactPoint!==null && !point3(value.contactPoint) || value.barrelClosestPoint!==null && !point3(value.barrelClosestPoint)) return false
  if (value.aimErrorM!==null && value.aimErrorM<0 || value.barrelGapM!==null && value.barrelGapM<0 || value.barrelFraction!==null && !inRange(value.barrelFraction,0,1)) return false
  if (value.exitSpeedKmh<0 || value.distanceM<0 || value.landingTimeMs<0) return false
  const hasSwing=attempt.swingAtMs!==null
  if (!hasSwing) return ['called-strike','ball'].includes(value.outcome) && value.timingErrorMs===null && value.swingElapsedMs===null && !value.contacted && value.contactPoint===null && value.score===0 && value.missReason===null && !value.activeAtPlate && (value.outcome==='called-strike')===passage.inside
  if (!['perfect','contact','foul','miss'].includes(value.outcome) || !finite(value.timingErrorMs) || !finite(value.swingElapsedMs)) return false
  if (Math.abs(value.timingErrorMs-(attempt.swingAtMs+versions.rules.snapshot.rules.swingContactMs-passage.timeMs))>1e-7 || Math.abs(value.swingElapsedMs-(passage.timeMs-attempt.swingAtMs))>1e-7) return false
  if (value.contacted) return ['perfect','contact','foul'].includes(value.outcome) && value.activeAtPlate && value.contactPoint!==null && value.contactAtMs===passage.timeMs && value.missReason===null && value.barrelGapM===0 && value.barrelFraction!==null
  return value.outcome==='miss' && value.contactPoint===null && value.contactAtMs===null && value.score===0 && value.missReason===(value.activeAtPlate?'outside-barrel':'outside-window')
}

/** Local correlation ID only; never an authentication token or a server-issued ID. */
export function createBaseballLocalId(cryptoObject = globalThis.crypto) {
  try {
    const direct=cryptoObject?.randomUUID?.()
    if (typeof direct==='string' && uuid.test(direct)) return direct
    if (typeof cryptoObject?.getRandomValues!=='function') return null
    const bytes=cryptoObject.getRandomValues(new Uint8Array(16))
    bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128
    const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('')
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  } catch { return null }
}

const sessionKeys=['sessionId','mode','handedness','versions','environment','startedAt','endedAt','status','endReason','attempts']
const attemptKeys=['attemptId','attemptNumber','pitchNumber','baseSpeedKmh','firstCenterPitch','environment','pitch','state','startedAt','endedAt','swingAtMs','aim','input','result','abortReason','elapsedMs']
function validAttempt(value, session, ids) {
  if (!exactKeys(value,attemptKeys) || !uuid.test(value.attemptId) || ids.has(value.attemptId)) return false
  ids.add(value.attemptId)
  if (!Number.isInteger(value.attemptNumber) || value.attemptNumber<1 || !Number.isInteger(value.pitchNumber) || !inRange(value.pitchNumber,1,10) || !inRange(value.baseSpeedKmh,80,160) || typeof value.firstCenterPitch!=='boolean' || !validEnvironment(value.environment) || !validPitch(value.pitch) || !isoDate(value.startedAt) || Date.parse(value.startedAt)<Date.parse(session.startedAt)) return false
  if (value.firstCenterPitch!== (value.pitchNumber===1)) return false
  const profile=session.versions.rules.snapshot.pitchTypes.find(item=>item.id===value.pitch.type)
  if (value.pitch.speedKmh!==Math.round(value.baseSpeedKmh*profile.ratio)) return false
  if (value.firstCenterPitch && (value.pitch.target.x!==0 || value.pitch.target.y!==(session.versions.rules.snapshot.rules.zone.bottom+session.versions.rules.snapshot.rules.zone.top)/2)) return false
  const hasSwing=value.swingAtMs!==null
  if (hasSwing ? !inRange(value.swingAtMs,-session.versions.rules.snapshot.rules.windupMs,60000) || !point2(value.aim) || !inRange(value.aim.x,-2,2) || !inRange(value.aim.y,-0.5,2.5) || !validInput(value.input) : value.aim!==null || value.input!==null) return false
  if (value.elapsedMs!==null && !inRange(value.elapsedMs,0,60000)) return false
  if (value.state==='started') return value.endedAt===null && value.result===null && value.abortReason===null && value.elapsedMs===null
  if (!isoDate(value.endedAt) || Date.parse(value.endedAt)<Date.parse(value.startedAt) || session.endedAt!==null && Date.parse(value.endedAt)>Date.parse(session.endedAt)) return false
  if (value.state==='completed') return value.abortReason===null && value.elapsedMs===null && validResult(value.result,value,session.versions)
  return value.state==='aborted' && value.result===null && abortReasons.has(value.abortReason)
}

/** Validates the local export contract, not authenticity or a server result. */
export function validateBaseballDataSnapshot(value) {
  const errors=[]
  try {
    if (!exactKeys(value,['schemaVersion','storage','trust','sessions']) || value.schemaVersion!==BASEBALL_DATA_SCHEMA_VERSION || value.storage!=='memory' || value.trust!=='local-unverified' || !Array.isArray(value.sessions) || value.sessions.length>BASEBALL_DATA_LIMITS.sessions) return {valid:false,errors:['snapshot-shape']}
    const ids=new Set(); let activeSessions=0
    for (let index=0;index<value.sessions.length;index++) {
      const session=value.sessions[index], path=`sessions[${index}]`
      if (!exactKeys(session,sessionKeys) || !uuid.test(session.sessionId) || ids.has(session.sessionId) || session.mode!=='practice' || !hands.has(session.handedness) || !validVersions(session.versions) || !validEnvironment(session.environment) || !isoDate(session.startedAt) || !Array.isArray(session.attempts) || session.attempts.length>BASEBALL_DATA_LIMITS.attemptsPerSession) {errors.push(`${path}:session-shape`);continue}
      ids.add(session.sessionId)
      if (session.status==='active') {activeSessions++;if (session.endedAt!==null || session.endReason!==null || index!==value.sessions.length-1) errors.push(`${path}:active-session`)}
      else if (session.status!=='ended' || !endReasons.has(session.endReason) || !isoDate(session.endedAt) || Date.parse(session.endedAt)<Date.parse(session.startedAt)) errors.push(`${path}:ended-session`)
      let completed=0, started=0
      session.attempts.forEach((attempt,attemptIndex)=>{
        if (!validAttempt(attempt,session,ids) || attempt.attemptNumber!==attemptIndex+1 || attempt.pitchNumber!==completed+1) errors.push(`${path}.attempts[${attemptIndex}]:attempt-contract`)
        if (attempt.state==='completed') completed++
        if (attempt.state==='started') {started++;if(session.status!=='active' || attemptIndex!==session.attempts.length-1) errors.push(`${path}.attempts[${attemptIndex}]:active-attempt`)}
      })
      if (started>1 || completed>10 || session.endReason==='complete' && completed!==10) errors.push(`${path}:lifecycle`)
    }
    if (activeSessions>1) errors.push('multiple-active-sessions')
  } catch { errors.push('snapshot-value') }
  return {valid:errors.length===0,errors}
}

/** Each accepted game event updates one record. No render-frame sampling. */
export function createBaseballDataCollector({versions,idFactory=createBaseballLocalId,wallNow=Date.now} = {}) {
  let sessions=[], activeSession=null, activeAttempt=null
  let state=validVersions(versions)?'ready':'unavailable', reason=state==='ready'?null:'invalid-versions'
  const usedIds=new Set()
  const fail=(code,capacity=false) => {state=capacity?'capacity':'unavailable';reason=code;return false}
  const ready=() => {state='ready';reason=null}
  const timestamp=() => {const now=wallNow();if(!finite(now)) throw new TypeError('Invalid local clock');return new Date(now).toISOString()}
  const nextId=() => {const id=idFactory();if(typeof id!=='string' || !uuid.test(id) || usedIds.has(id)) throw new TypeError('Local ID unavailable');return id}
  const snapshot=()=>clone({schemaVersion:BASEBALL_DATA_SCHEMA_VERSION,storage:'memory',trust:'local-unverified',sessions})
  const guarded=action=>{try{return action()}catch{return fail('collection-error')}}
  const abort=(code,elapsedMs=null)=>{
    if(!activeAttempt || activeAttempt.state!=='started') return false
    if(!abortReasons.has(code) || elapsedMs!==null && !inRange(elapsedMs,0,60000)) return fail('invalid-abort')
    const endedAt=timestamp()
    if(Date.parse(endedAt)<Date.parse(activeAttempt.startedAt)) return fail('invalid-clock')
    Object.assign(activeAttempt,{state:'aborted',endedAt,abortReason:code,elapsedMs})
    activeAttempt=null;ready();return true
  }
  return Object.freeze({
    startSession(options={}) {
      return guarded(()=>{
        if(activeSession) return fail('session-active')
        if(sessions.length>=BASEBALL_DATA_LIMITS.sessions) return fail('session-capacity',true)
        const selected=options.versions ?? versions, environment=copyEnvironment(options.environment)
        if(!validVersions(selected) || !validEnvironment(environment) || !hands.has(options.handedness) || options.mode!=='practice') return fail('invalid-session')
        const sessionId=nextId(), startedAt=timestamp()
        activeSession={sessionId,mode:'practice',handedness:options.handedness,versions:clone(selected),environment,startedAt,endedAt:null,status:'active',endReason:null,attempts:[]}
        usedIds.add(sessionId);sessions.push(activeSession);ready();return sessionId
      }) || null
    },
    startAttempt(options={}) {
      return guarded(()=>{
        if(!activeSession || activeAttempt) return fail('attempt-lifecycle')
        if(activeSession.attempts.length>=BASEBALL_DATA_LIMITS.attemptsPerSession) return fail('attempt-capacity',true)
        const attempt={attemptId:nextId(),attemptNumber:activeSession.attempts.length+1,pitchNumber:options.pitchNumber,baseSpeedKmh:options.baseSpeedKmh,firstCenterPitch:options.firstCenterPitch,environment:copyEnvironment(options.environment),pitch:copyPitch(options.pitch),state:'started',startedAt:timestamp(),endedAt:null,swingAtMs:null,aim:null,input:null,result:null,abortReason:null,elapsedMs:null}
        const expected=activeSession.attempts.filter(item=>item.state==='completed').length+1
        if(attempt.pitchNumber!==expected || !validAttempt(attempt,activeSession,new Set())) return fail('invalid-attempt')
        usedIds.add(attempt.attemptId);activeAttempt=attempt;activeSession.attempts.push(attempt);ready();return attempt.attemptId
      }) || null
    },
    recordSwing(options={}) {
      return guarded(()=>{
        if(!activeAttempt || activeAttempt.swingAtMs!==null) return false
        const candidate={...activeAttempt,swingAtMs:options.swingAtMs,aim:copyPoint(options.aim,2),input:copyInput(options.input)}
        if(!validAttempt(candidate,activeSession,new Set())) return fail('invalid-swing')
        Object.assign(activeAttempt,{swingAtMs:candidate.swingAtMs,aim:candidate.aim,input:candidate.input});ready();return true
      })
    },
    completeAttempt(options={}) {
      return guarded(()=>{
        if(!activeAttempt) return false
        const candidate={...activeAttempt,state:'completed',endedAt:timestamp(),result:copyResult(options.result)}
        if(!validAttempt(candidate,activeSession,new Set())) return fail('invalid-result')
        Object.assign(activeAttempt,candidate);activeAttempt=null;ready();return true
      })
    },
    abortAttempt(options={}) {return guarded(()=>abort(options.reason,options.elapsedMs ?? null))},
    endSession(options={}) {
      return guarded(()=>{
        if(!activeSession) return false
        if(!endReasons.has(options.reason)) return fail('invalid-end')
        if(options.reason==='complete' && (activeAttempt || activeSession.attempts.filter(item=>item.state==='completed').length!==10)) return fail('incomplete-session')
        if(activeAttempt && !abort(options.reason)) return false
        const endedAt=timestamp()
        if(Date.parse(endedAt)<Date.parse(activeSession.startedAt)) return fail('invalid-clock')
        Object.assign(activeSession,{status:'ended',endedAt,endReason:options.reason});activeSession=null;ready();return true
      })
    },
    snapshot,
    status() {return {state,reason}},
  })
}
