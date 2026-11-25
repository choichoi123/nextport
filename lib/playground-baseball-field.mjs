import { BASEBALL_RULES, sampleBaseballBattedBall } from './playground-baseball.mjs'

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
const finite = value => typeof value === 'number' && Number.isFinite(value)
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const point = value => ({ x:value.x, y:value.y, z:value.z })

// Fictional benchmark field and common defenders/runner, not measured KBO data.
export const BASEBALL_FIELD_MODEL = freeze({
  version:'baseball-field-v1',
  stadium:{ leftLineM:100, centerM:122, rightLineM:100, fenceHeightM:2.7 },
  baseDistanceM:27.432,
  stepMs:20,
  maximumPlayMs:30000,
  airDragPerSecond:0.12,
  ground:{ bounceRestitution:0.34, firstHorizontalRetention:0.64, laterHorizontalRetention:0.78, rollingDecelerationMps2:2.8, fenceRestitution:0.42 },
  runner:{ speedMps:7.6, startDelayMs:450, turnDelayMs:350 },
  fielders:[
    { id:'P', x:0, z:18.44, speedMps:5.0, reactionMs:420, reachM:1.05, catchHeightM:2.6, exchangeMs:420, throwSpeedMps:29 },
    { id:'C', x:0, z:-2.5, speedMps:4.5, reactionMs:500, reachM:1.05, catchHeightM:2.5, exchangeMs:500, throwSpeedMps:28 },
    { id:'1B', x:24, z:20, speedMps:5.2, reactionMs:500, reachM:1.15, catchHeightM:2.7, exchangeMs:380, throwSpeedMps:30 },
    { id:'2B', x:15, z:35, speedMps:5.5, reactionMs:480, reachM:1.10, catchHeightM:2.6, exchangeMs:380, throwSpeedMps:30 },
    { id:'SS', x:-14, z:36, speedMps:5.5, reactionMs:480, reachM:1.10, catchHeightM:2.6, exchangeMs:400, throwSpeedMps:31 },
    { id:'3B', x:-24, z:20, speedMps:5.1, reactionMs:500, reachM:1.10, catchHeightM:2.6, exchangeMs:400, throwSpeedMps:30 },
    { id:'LF', x:-34, z:80, speedMps:5.7, reactionMs:650, reachM:1.15, catchHeightM:2.7, exchangeMs:480, throwSpeedMps:31 },
    { id:'CF', x:0, z:95, speedMps:5.9, reactionMs:620, reachM:1.15, catchHeightM:2.7, exchangeMs:480, throwSpeedMps:32 },
    { id:'RF', x:34, z:80, speedMps:5.7, reactionMs:650, reachM:1.15, catchHeightM:2.7, exchangeMs:480, throwSpeedMps:31 },
  ],
})

function validateResult(result) {
  if (!result || result.contacted !== true || !['contact','perfect'].includes(result.outcome) ||
      !finite(result.exitSpeedKmh) || result.exitSpeedKmh < 40 || result.exitSpeedKmh > 190 ||
      !finite(result.launchAngleDeg) || result.launchAngleDeg < -28 || result.launchAngleDeg > 60 ||
      !finite(result.directionDeg) || Math.abs(result.directionDeg) > 45 ||
      !finite(result.landingTimeMs) || result.landingTimeMs <= 0 ||
      !result.contactPoint || !['x','y','z'].every(key => finite(result.contactPoint[key])) ||
      result.contactPoint.y < 0 || result.contactPoint.y > 3 || Math.abs(result.contactPoint.x) > 2 || Math.abs(result.contactPoint.z) > 1e-7) {
    throw new TypeError('A finite, fair contacted ball is required.')
  }
  const vertical = result.exitSpeedKmh / 3.6 * Math.sin(result.launchAngleDeg * Math.PI / 180)
  const expected = (vertical + Math.sqrt(vertical ** 2 + 2 * BASEBALL_RULES.gravityMps2 * result.contactPoint.y)) / BASEBALL_RULES.gravityMps2 * 1000
  if (Math.abs(expected - result.landingTimeMs) > 1e-6) throw new TypeError('The landing time must match the supplied trajectory.')
}

export function getBaseballFieldFenceDistance(angleDeg) {
  if (!finite(angleDeg) || Math.abs(angleDeg) > 45) throw new RangeError('A fair-field angle is required.')
  const stadium = BASEBALL_FIELD_MODEL.stadium
  const edge = angleDeg < 0 ? stadium.leftLineM : stadium.rightLineM
  return stadium.centerM - (stadium.centerM - edge) * (Math.abs(angleDeg) / 45) ** 1.6
}

function fenceDistanceAt(position) {
  return getBaseballFieldFenceDistance(clamp(Math.atan2(position.x,position.z)*180/Math.PI,-45,45))
}

function outsideFence(position) { return Math.hypot(position.x, position.z) >= fenceDistanceAt(position) }

function fenceIntersection(a, b) {
  let low = 0, high = 1
  for (let iteration = 0; iteration < 30; iteration++) {
    const amount = (low + high) / 2
    const p = { x:a.x + (b.x-a.x)*amount, z:a.z + (b.z-a.z)*amount }
    if (outsideFence(p)) high = amount
    else low = amount
  }
  const amount = high
  return { x:a.x+(b.x-a.x)*amount, y:a.y+(b.y-a.y)*amount, z:a.z+(b.z-a.z)*amount,
    timeMs:a.timeMs+(b.timeMs-a.timeMs)*amount }
}

function firstReach(position, timeMs, airborne) {
  const candidates = BASEBALL_FIELD_MODEL.fielders.map(fielder => ({ fielder,
    arrivalMs:fielder.reactionMs + Math.max(0,distance(fielder,position)-fielder.reachM) / fielder.speedMps * 1000,
  })).filter(({fielder,arrivalMs}) => arrivalMs <= timeMs + 1e-7 && (!airborne || position.y <= fielder.catchHeightM))
  candidates.sort((a,b) => a.arrivalMs-b.arrivalMs || a.fielder.id.localeCompare(b.fielder.id))
  return candidates[0] || null
}

const runnerBaseTimes = () => [1,2,3].map(base => BASEBALL_FIELD_MODEL.runner.startDelayMs +
  BASEBALL_FIELD_MODEL.baseDistanceM * base / BASEBALL_FIELD_MODEL.runner.speedMps * 1000 +
  BASEBALL_FIELD_MODEL.runner.turnDelayMs * (base-1))

function groundResult(position, reach) {
  const edge = BASEBALL_FIELD_MODEL.baseDistanceM / Math.sqrt(2)
  const bases = [{ x:edge,z:edge },{ x:0,z:edge*2 },{ x:-edge,z:edge }]
  const runner = runnerBaseTimes()
  const defense = bases.map(base => position.timeMs + reach.fielder.exchangeMs + distance(position,base) / reach.fielder.throwSpeedMps * 1000)
  const times = { runnerBaseTimesMs:runner, defenseBaseTimesMs:defense }
  if (defense[0] < runner[0]) return { ...times, outcome:'groundout', isHit:false, bases:0,
    reasonKey:'throw-beats-runner', playTimeMs:defense[0] }
  let safeBases = 1
  for (let base = 2; base <= 3; base++) {
    if (defense[base-1] < runner[base-1]) break
    safeBases = base
  }
  const outcome = ['single','double','triple'][safeBases-1]
  return { ...times, outcome, isHit:true, bases:safeBases, reasonKey:`safe-${outcome}`,
    playTimeMs:Math.max(position.timeMs,runner[safeBases-1]) }
}

/**
 * Deterministic empty-base benchmark only. Incoming-pitch and bat physics stay
 * in the existing engine. Fair contact is not automatically a hit.
 */
export function resolveBaseballFieldResult(result) {
  validateResult(result)
  const model = BASEBALL_FIELD_MODEL
  const radians = result.launchAngleDeg * Math.PI / 180
  const direction = result.directionDeg * Math.PI / 180
  const speed = result.exitSpeedKmh / 3.6
  const start = { ...point(result.contactPoint), timeMs:0 }
  const path = [start], wallContacts = []
  let previous = start, velocity = { x:speed*Math.cos(radians)*Math.sin(direction), y:speed*Math.sin(radians), z:speed*Math.cos(radians)*Math.cos(direction) }
  let exactAir = true, bounced = false, rolling = false, landingPoint = null
  const finish = (outcome, decision, reach = null) => {
    if (path.at(-1).timeMs !== decision.timeMs) path.push({ ...decision })
    return freeze({ ...outcome, modelVersion:model.version, contactPoint:point(start), landingPoint,
      decisionPoint:{...decision}, fieldingTimeMs:reach ? decision.timeMs : null, fielderId:reach?.fielder.id ?? null, wallContacts,
      fielders:model.fielders.map(fielder => ({ id:fielder.id,x:fielder.x,z:fielder.z,
        selected:fielder.id === reach?.fielder.id,
        ...(fielder.id === reach?.fielder.id ? { arrivalMs:reach.arrivalMs,reachPoint:point(decision) } : {}),
      })), path,
    })
  }
  let timeMs = 0
  while (timeMs < model.maximumPlayMs) {
    const nextTimeMs = exactAir ? Math.min(timeMs+model.stepMs,result.landingTimeMs) : timeMs+model.stepMs
    const dt = (nextTimeMs-timeMs)/1000
    let next
    if (exactAir) {
      next = { ...point(sampleBaseballBattedBall(result,nextTimeMs)),timeMs:nextTimeMs }
      const decay = Math.exp(-model.airDragPerSecond*nextTimeMs/1000)
      velocity = { x:speed*Math.cos(radians)*Math.sin(direction)*decay,
        y:speed*Math.sin(radians)-BASEBALL_RULES.gravityMps2*nextTimeMs/1000,
        z:speed*Math.cos(radians)*Math.cos(direction)*decay }
    } else {
      const horizontal = Math.hypot(velocity.x,velocity.z)
      const afterSpeed = rolling ? Math.max(0,horizontal-model.ground.rollingDecelerationMps2*dt) : horizontal*Math.exp(-model.airDragPerSecond*dt)
      const factor = horizontal > 0 ? afterSpeed/horizontal : 0
      const nextVelocity = { x:velocity.x*factor, z:velocity.z*factor,
        y:rolling ? 0 : velocity.y-BASEBALL_RULES.gravityMps2*dt }
      next = { x:previous.x+(velocity.x+nextVelocity.x)/2*dt,
        y:rolling ? 0 : previous.y+(velocity.y+nextVelocity.y)/2*dt,
        z:previous.z+(velocity.z+nextVelocity.z)/2*dt,timeMs:nextTimeMs }
      velocity = nextVelocity
    }
    if (outsideFence(next)) {
      const wall = fenceIntersection(previous,next)
      if (wall.y > model.stadium.fenceHeightM) {
        return finish({ outcome:bounced?'double':'home-run',isHit:true,bases:bounced?2:4,
          reasonKey:bounced?'ground-rule-double':'over-fence',playTimeMs:wall.timeMs },wall)
      }
      // An airborne wall strike remains live. Reflect inward before fielding.
      wallContacts.push({...wall})
      const normalLength = Math.hypot(wall.x,wall.z)
      const normal = { x:wall.x/normalLength,z:wall.z/normalLength }
      const dot = velocity.x*normal.x+velocity.z*normal.z
      velocity.x -= (1+model.ground.fenceRestitution)*dot*normal.x
      velocity.z -= (1+model.ground.fenceRestitution)*dot*normal.z
      exactAir = false
      next = { ...wall,x:wall.x-normal.x*.001,z:wall.z-normal.z*.001 }
      if (path.at(-1).timeMs !== next.timeMs) path.push({...next})
    }
    const reachedGround = next.y <= 1e-9 && (!rolling && (bounced || next.timeMs >= result.landingTimeMs || !exactAir))
    if (reachedGround) {
      next.y = 0
      if (!landingPoint) landingPoint = point(next)
      const first = !bounced
      bounced = true
      exactAir = false
      const landingVelocity = Math.abs(velocity.y)*model.ground.bounceRestitution
      velocity.y = landingVelocity
      const retention = first ? model.ground.firstHorizontalRetention : model.ground.laterHorizontalRetention
      velocity.x *= retention; velocity.z *= retention
      if (landingVelocity < 1.2) { rolling = true; velocity.y = 0 }
    }
    const airborneCatch = !bounced
    const reach = firstReach(next,next.timeMs,airborneCatch)
    if (reach && (airborneCatch || next.y <= .7)) {
      if (airborneCatch) {
        const outcome = result.launchAngleDeg >= 18 ? 'flyout' : 'lineout'
        return finish({ outcome,isHit:false,bases:0,reasonKey:outcome==='flyout'?'caught-fly':'caught-line-drive',playTimeMs:next.timeMs },next,reach)
      }
      return finish(groundResult(next,reach),next,reach)
    }
    if (Math.floor(next.timeMs / 80) > Math.floor(previous.timeMs / 80)) path.push({...next})
    previous = next
    timeMs = next.timeMs
  }
  // Finite supported trajectories should always reach a defender. Do not invent
  // a hit if future model changes make a play unresolved.
  throw new RangeError('The benchmark field could not resolve this play.')
}
