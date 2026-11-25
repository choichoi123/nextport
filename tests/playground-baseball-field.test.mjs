import test from 'node:test'
import assert from 'node:assert/strict'
import { BASEBALL_FIELD_MODEL, getBaseballFieldFenceDistance, resolveBaseballFieldResult } from '../lib/playground-baseball-field.mjs'
import { BASEBALL_PITCH_TYPES, createBaseballPitch, getBaseballPitchSpeed, judgeBaseballSwing } from '../lib/playground-baseball.mjs'

const clone = value => JSON.parse(JSON.stringify(value))
function batted(speed = 120, angle = 25, direction = 0, overrides = {}) {
  const height = .75
  const vertical = speed / 3.6 * Math.sin(angle * Math.PI / 180)
  return { contacted:true, outcome:'contact', exitSpeedKmh:speed, launchAngleDeg:angle, directionDeg:direction,
    contactPoint:{ x:0,y:height,z:0 },
    landingTimeMs:(vertical+Math.sqrt(vertical**2+2*9.81*height))/9.81*1000,
    ...overrides }
}

test('기준 구장은 가상 고정 모형이며 표시와 판정이 같은 담장 곡선을 쓴다', () => {
  assert.equal(BASEBALL_FIELD_MODEL.version,'baseball-field-v1')
  assert.equal(getBaseballFieldFenceDistance(0),122)
  assert.equal(getBaseballFieldFenceDistance(-45),100)
  assert.equal(getBaseballFieldFenceDistance(45),100)
  for (const angle of [5,15,30,40]) {
    assert.equal(getBaseballFieldFenceDistance(angle),getBaseballFieldFenceDistance(-angle))
    assert.ok(getBaseballFieldFenceDistance(angle)>100)
    assert.ok(getBaseballFieldFenceDistance(angle)<122)
  }
  for (const angle of [NaN,Infinity,-46,46,'0']) assert.throws(()=>getBaseballFieldFenceDistance(angle),RangeError)
  assert.ok(Object.isFrozen(BASEBALL_FIELD_MODEL.fielders[0]))
})

test('접촉을 무조건 안타로 세지 않고 포구된 뜬공과 직선타를 구분한다', () => {
  const fly = resolveBaseballFieldResult(batted(40,40,-5))
  assert.equal(fly.outcome,'flyout')
  assert.equal(fly.reasonKey,'caught-fly')
  assert.equal(fly.isHit,false)
  assert.equal(fly.bases,0)
  assert.equal(fly.landingPoint,null)
  assert.ok(fly.fielderId)
  const line = resolveBaseballFieldResult(batted(60,16,-10))
  assert.equal(line.outcome,'lineout')
  assert.equal(line.reasonKey,'caught-line-drive')
  assert.equal(line.isHit,false)
  assert.ok(line.decisionPoint.y>0)
})

test('정타/일반 접촉 명칭과 점수·추정 거리만으로 안타나 홈런을 정하지 않는다', () => {
  const input = batted(40,40,-5)
  const before = resolveBaseballFieldResult(input)
  const other = resolveBaseballFieldResult({...input,outcome:'perfect',score:9999,quality:1,distanceM:100000})
  assert.deepEqual(other,before)
  assert.equal(other.outcome,'flyout')
})

test('땅볼 처리/송구가 1루 도달보다 빠르면 아웃이며 느리면 내야 안타가 가능하다', () => {
  const out = resolveBaseballFieldResult(batted(40,-28,-45))
  assert.equal(out.outcome,'groundout')
  assert.equal(out.reasonKey,'throw-beats-runner')
  assert.ok(out.landingPoint)
  assert.ok(out.defenseBaseTimesMs[0]<out.runnerBaseTimesMs[0])
  const hit = resolveBaseballFieldResult(batted(40,-20,-45))
  assert.equal(hit.outcome,'single')
  assert.equal(hit.reasonKey,'safe-single')
  assert.ok(hit.defenseBaseTimesMs[0]>=hit.runnerBaseTimesMs[0])
})

test('같은 고정 주력과 수비 처리 시간을 이용해 안전한 단타·2루타·3루타를 나눈다', () => {
  for (const [speed,angle,direction,outcome,bases] of [[40,-20,-45,'single',1],[90,32,-45,'double',2],[140,56,45,'triple',3]]) {
    const result = resolveBaseballFieldResult(batted(speed,angle,direction))
    assert.equal(result.outcome,outcome)
    assert.equal(result.isHit,true)
    assert.equal(result.bases,bases)
    for(let base=0;base<bases;base++) assert.ok(result.defenseBaseTimesMs[base]>=result.runnerBaseTimesMs[base])
    if(bases<3) assert.ok(result.defenseBaseTimesMs[bases]<result.runnerBaseTimesMs[bases])
  }
})

test('공중의 페어 타구가 담장 높이를 넘어야 홈런이며 가상의 착지점은 남기지 않는다', () => {
  const result = resolveBaseballFieldResult(batted(140,28,-45))
  assert.equal(result.outcome,'home-run')
  assert.equal(result.reasonKey,'over-fence')
  assert.equal(result.bases,4)
  assert.equal(result.isHit,true)
  assert.ok(result.decisionPoint.y>BASEBALL_FIELD_MODEL.stadium.fenceHeightM)
  assert.equal(result.landingPoint,null)
  const angle = Math.atan2(result.decisionPoint.x,result.decisionPoint.z)*180/Math.PI
  assert.ok(Math.abs(Math.hypot(result.decisionPoint.x,result.decisionPoint.z)-getBaseballFieldFenceDistance(angle))<1e-6)
})

test('바운드 뒤 담장 밖으로 나가는 타구는 공중 홈런이 아닌 인정2루타다', () => {
  const result = resolveBaseballFieldResult(batted(130,36,-35))
  assert.equal(result.outcome,'double')
  assert.equal(result.reasonKey,'ground-rule-double')
  assert.equal(result.bases,2)
  assert.equal(result.landingPoint.y,0)
  assert.ok(result.decisionPoint.y>BASEBALL_FIELD_MODEL.stadium.fenceHeightM)
  assert.ok(Math.hypot(result.landingPoint.x,result.landingPoint.z)<Math.hypot(result.decisionPoint.x,result.decisionPoint.z))
})

test('공중에서 낮게 담장을 맞으면 장내로 반사된 경로를 계속 처리한다', () => {
  const input = batted(130,40,-45), result = resolveBaseballFieldResult(input)
  assert.equal(result.outcome,'double')
  assert.equal(result.wallContacts.length,1)
  const wall = result.wallContacts[0]
  assert.ok(wall.y>0&&wall.y<BASEBALL_FIELD_MODEL.stadium.fenceHeightM)
  assert.ok(wall.timeMs<input.landingTimeMs)
  assert.ok(result.decisionPoint.timeMs>wall.timeMs)
  assert.ok(Math.hypot(result.decisionPoint.x,result.decisionPoint.z)<Math.hypot(wall.x,wall.z))
  assert.ok(result.landingPoint)
})

test('동일 입력은 난수 없이 동일 결과이며 입력/고정 배치/반환 자료를 공유 수정하지 않는다', () => {
  const input = batted(140,56,45), original = clone(input)
  const a=resolveBaseballFieldResult(input),b=resolveBaseballFieldResult(clone(input))
  assert.deepEqual(a,b)
  assert.deepEqual(input,original)
  input.contactPoint.y=99
  assert.equal(a.contactPoint.y,.75)
  assert.ok(Object.isFrozen(a.path)&&Object.isFrozen(a.path[0]))
  assert.ok(Object.isFrozen(a.fielders)&&Object.isFrozen(a.fielders[0]))
})

test('결과 미니맵의 경로는 접촉부터 실제 판정까지 시간순이며 미래 착지를 섞지 않는다', () => {
  for(const [speed,angle,direction] of [[40,40,-5],[60,16,-10],[40,-28,-45],[140,28,-45],[130,36,-35],[130,40,-45]]) {
    const result=resolveBaseballFieldResult(batted(speed,angle,direction))
    assert.equal(result.path[0].timeMs,0)
    assert.deepEqual({x:result.path[0].x,y:result.path[0].y,z:result.path[0].z},result.contactPoint)
    assert.equal(result.path.at(-1).timeMs,result.decisionPoint.timeMs)
    assert.ok(result.playTimeMs>=result.decisionPoint.timeMs)
    for(let i=0;i<result.path.length;i++) {
      const p=result.path[i]
      assert.ok(['x','y','z','timeMs'].every(key=>Number.isFinite(p[key])))
      assert.ok(p.y>=0)
      if(i) assert.ok(p.timeMs>result.path[i-1].timeMs)
    }
    assert.ok(result.path.length<400)
    assert.equal(result.fielders.filter(f=>f.selected).length,result.fielderId?1:0)
  }
})

test('4구종·양투타의 실제 엔진 페어 접촉은 기존 투구/스윙 결과를 바꾸지 않고 처리한다', () => {
  let checked=0
  for(const type of BASEBALL_PITCH_TYPES) for(const pitcherHandedness of ['left','right']) for(const handedness of ['left','right']) for(const elapsed of [70,110,150]) {
    const pitch=createBaseballPitch({pitchType:type.id,speedKmh:getBaseballPitchSpeed(120,type.id),target:{x:.02,y:.75},seed:17,pitcherHandedness})
    const result=judgeBaseballSwing(pitch,{swingAtMs:pitch.flightTimeMs-elapsed,aim:pitch.target,handedness})
    if(result.outcome==='foul')continue
    assert.equal(result.contacted,true)
    const before=clone(result),field=resolveBaseballFieldResult(result)
    assert.ok(['single','double','triple','home-run','flyout','lineout','groundout'].includes(field.outcome))
    assert.deepEqual(result,before)
    checked++
  }
  assert.ok(checked>=16)
})

test('파울·무접촉·손상된 궤적은 가짜 안타/아웃으로 숨기지 않는다', () => {
  const valid=batted()
  for(const patch of [{contacted:false},{outcome:'foul'},{outcome:'miss'},{exitSpeedKmh:NaN},{exitSpeedKmh:191},
    {launchAngleDeg:Infinity},{launchAngleDeg:61},{directionDeg:45.001},{landingTimeMs:0},{landingTimeMs:100},
    {contactPoint:{x:0,y:.75,z:1}},{contactPoint:{x:0,y:-1,z:0}}, {contactPoint:null}]) {
    assert.throws(()=>resolveBaseballFieldResult({...valid,...patch}),TypeError)
  }
  assert.throws(()=>resolveBaseballFieldResult(null),TypeError)
})
