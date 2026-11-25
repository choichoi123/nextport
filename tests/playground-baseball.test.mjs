import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BASEBALL_RULES, BASEBALL_PITCH_TYPES, getBaseballPitchSpeed, createBaseballPitch, sampleBaseballPitch,
  sampleBaseballBat, sampleBaseballPlatePassage, isBaseballStrike, judgeBaseballSwing, judgeBaseballSwingLegacyV1, judgeBaseballTake, sampleBaseballBattedBall,
} from '../lib/playground-baseball.mjs'
import { BASEBALL_TEAMS, getBaseballTeam, validateBaseballPlayer } from '../lib/playground-baseball-teams.mjs'

const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`)
const pitchAt = (speedKmh = 120, target = { x: 0, y: 0.745 }) => createBaseballPitch({ speedKmh, seed: 17, target, pitcherHandedness: 'right' })
const swing = (pitch, overrides = {}) => judgeBaseballSwing(pitch, {
  swingAtMs: pitch.flightTimeMs - BASEBALL_RULES.swingContactMs,
  aim: pitch.target, handedness: 'right', ...overrides,
})
const barrelDistance = (ball, bat) => {
  const delta = { x: bat.end.x - bat.start.x, y: bat.end.y - bat.start.y, z: bat.end.z - bat.start.z }
  const fraction = Math.max(0, Math.min(1, ((ball.x - bat.start.x) * delta.x + (ball.y - bat.start.y) * delta.y + (ball.z - bat.start.z) * delta.z) /
    (delta.x ** 2 + delta.y ** 2 + delta.z ** 2)))
  return Math.hypot(ball.x - bat.start.x - fraction * delta.x, ball.y - bat.start.y - fraction * delta.y, ball.z - bat.start.z - fraction * delta.z)
}

test('야구 팀 10개는 3030 화면의 확정 이름·고유 ID·동결된 팔레트를 사용한다', () => {
  assert.deepEqual(BASEBALL_TEAMS.map(t => t.name), ['피움 히어로즈', '함성 라이온즈', 'MSG 랜더스', 'PT 위즈', '기세 타이거즈', 'GG 트윈스', '두근 베어스', 'XP 다이노스', '한방 이글스', '로켓 자이언츠'])
  assert.equal(new Set(BASEBALL_TEAMS.map(t => t.id)).size, 10)
  assert.ok(Object.isFrozen(BASEBALL_TEAMS) && BASEBALL_TEAMS.every(Object.isFrozen))
  assert.equal(getBaseballTeam('missing'), BASEBALL_TEAMS[0])
  for (const team of BASEBALL_TEAMS) for (const key of ['jersey', 'helmet', 'accent', 'pants']) assert.match(team[key], /^#[0-9a-f]{6}$/i)
})

test('선수 설정은 이름을 NFC·공백 정리하고 16 code point·좌우타·팀 ID를 엄격히 검사한다', () => {
  const accepted = validateBaseballPlayer({ name: '  가나다  ', handedness: 'left', teamId: 'heroes' })
  assert.equal(accepted.valid, true)
  assert.equal(accepted.player.name, '가나다')
  assert.equal(validateBaseballPlayer({ name: '😀'.repeat(16), handedness: 'right', teamId: 'giants' }).valid, true)
  for (const name of ['', '  ', 'x'.repeat(17), '이름\n', '이\u200b름', '\ud800']) assert.equal(validateBaseballPlayer({ name, handedness: 'right', teamId: 'heroes' }).valid, false)
  assert.equal(validateBaseballPlayer({ name: '선수', handedness: 'switch', teamId: 'heroes' }).valid, false)
  assert.equal(validateBaseballPlayer({ name: '선수', handedness: 'left', teamId: 'missing' }).valid, false)
  assert.equal(validateBaseballPlayer(null).valid, false)
})

test('등번호는 기본7·ASCII 1~2자리만 받으며 앞의0을 보존한다', () => {
  const player = { name: '선수', handedness: 'right', teamId: 'heroes' }
  assert.equal(validateBaseballPlayer(player).player.jerseyNumber, '7')
  for (const [input, expected] of [['00', '00'], ['07', '07'], [' 99 ', '99'], ['0', '0'], [7, '7']]) {
    assert.equal(validateBaseballPlayer({ ...player, jerseyNumber: input }).player.jerseyNumber, expected)
  }
  for (const input of ['', '100', '-1', '１', '1.0', 'a7', NaN, null, {}, -1, 1.5]) {
    assert.equal(validateBaseballPlayer({ ...player, jerseyNumber: input }).errors.jerseyNumber, 'invalid')
  }
})

test('4구종 게임 프로필은 동결되고 기준 구속과 실제 릴리스 구속을 명확히 구분한다', () => {
  assert.deepEqual(BASEBALL_PITCH_TYPES.map(profile => profile.id), ['four-seam', 'slider', 'curveball', 'changeup'])
  assert.ok(Object.isFrozen(BASEBALL_PITCH_TYPES))
  assert.ok(BASEBALL_PITCH_TYPES.every(profile => Object.isFrozen(profile) && Object.isFrozen(profile.acceleration)))
  for (const [base, expected] of [[80, [80, 70, 60, 66]], [120, [120, 106, 90, 98]], [160, [160, 141, 120, 131]]]) {
    assert.deepEqual(BASEBALL_PITCH_TYPES.map(profile => getBaseballPitchSpeed(base, profile.id)), expected)
  }
  assert.equal(getBaseballPitchSpeed(120), 120)
  const curve = createBaseballPitch({ pitchType: 'curveball', speedKmh: 120 })
  near(sampleBaseballPitch(curve, 0).speedKmh, 120)
  assert.equal(curve.speedKmh, 120) // The factory never applies the UI ratio twice.
})

test('포심의 기존 수치·ID와 추가 물리 필드가 없는 이전 객체의 샘플·판정은 호환된다', () => {
  const pitch = pitchAt()
  assert.equal(pitch.id, '17:right:120:0:0.745')
  near(pitch.flightTimeMs, 524.2268376083499, 1e-10)
  near(pitch.velocity.x, 0.6866929269489012, 1e-12)
  near(pitch.velocity.y, -0.31147248012293943, 1e-12)
  near(pitch.velocity.z, -33.32480380781432, 1e-12)
  const middle = sampleBaseballPitch(pitch, 250)
  near(middle.x, -0.1729624073315475, 1e-12)
  near(middle.y, 1.515270529440082, 1e-12)
  near(middle.z, 8.39376388520745, 1e-12)
  const legacy = { ...pitch }
  delete legacy.dragPerSecond
  delete legacy.acceleration
  for (const time of [0, 250, pitch.flightTimeMs, pitch.flightTimeMs + 12]) {
    assert.deepEqual(sampleBaseballPitch(legacy, time), sampleBaseballPitch(pitch, time))
  }
  assert.deepEqual(swing(legacy), swing(pitch))
  assert.deepEqual(judgeBaseballTake(legacy), judgeBaseballTake(pitch))
})

test('모든 구종·양투의 실제 3D 릴리스 구속과 중앙·외곽 목표 도착을 보존한다', () => {
  const targets = [{ x: 0, y: 0.745 }, { x: -1.25, y: 0.1 }, { x: 1.25, y: 0.1 }, { x: -1.25, y: 2 }, { x: 1.25, y: 2 }]
  for (const profile of BASEBALL_PITCH_TYPES) {
    const speeds = profile.id === 'four-seam' ? [80, 120, 160] : [60, getBaseballPitchSpeed(120, profile.id), 160]
    for (const speedKmh of speeds) for (const pitcherHandedness of ['right', 'left']) for (const target of targets) {
      const pitch = createBaseballPitch({ pitchType: profile.id, speedKmh, pitcherHandedness, target, seed: 17 })
      assert.equal(pitch.type, profile.id)
      assert.equal(pitch.dragPerSecond, profile.dragPerSecond)
      assert.ok(Object.isFrozen(pitch.acceleration))
      near(sampleBaseballPitch(pitch, 0).speedKmh, speedKmh)
      near(Math.hypot(...Object.values(pitch.velocity)) * 3.6, speedKmh)
      const end = sampleBaseballPitch(pitch, pitch.flightTimeMs)
      near(end.x, target.x); near(end.y, target.y); near(end.z, 0)
      assert.ok(Number.isFinite(pitch.flightTimeMs) && pitch.flightTimeMs > 0)
    }
  }
})

test('구종의 횡·상하 궤적은 다르지만 동일 seed 코스·양투 거울상·FPS 독립성은 유지한다', () => {
  const ids = new Set()
  const courses = []
  for (const profile of BASEBALL_PITCH_TYPES) {
    const speedKmh = getBaseballPitchSpeed(120, profile.id)
    const right = createBaseballPitch({ pitchType: profile.id, speedKmh, target: { x: 0.12, y: 0.745 }, pitcherHandedness: 'right' })
    const left = createBaseballPitch({ pitchType: profile.id, speedKmh, target: { x: -0.12, y: 0.745 }, pitcherHandedness: 'left' })
    near(right.acceleration.x, -left.acceleration.x)
    near(right.flightTimeMs, left.flightTimeMs)
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const r = sampleBaseballPitch(right, right.flightTimeMs * fraction)
      const l = sampleBaseballPitch(left, left.flightTimeMs * fraction)
      near(r.x, -l.x); near(r.y, l.y); near(r.z, l.z)
    }
    const expected = sampleBaseballPitch(right, right.flightTimeMs * 0.731)
    for (const hz of [15, 30, 60, 144]) {
      for (let elapsed = 0; elapsed < right.flightTimeMs; elapsed += 1000 / hz) sampleBaseballPitch(right, elapsed)
      assert.deepEqual(sampleBaseballPitch(right, right.flightTimeMs * 0.731), expected)
    }
    const sameCourse = createBaseballPitch({ pitchType: profile.id, speedKmh: 120, seed: 83 })
    ids.add(sameCourse.id)
    courses.push(sameCourse.target)
  }
  assert.equal(ids.size, 4)
  assert.ok(courses.every(target => target.x === courses[0].x && target.y === courses[0].y))
  const make = pitchType => createBaseballPitch({ pitchType, speedKmh: getBaseballPitchSpeed(120, pitchType), target: { x: 0, y: 0.745 }, pitcherHandedness: 'right' })
  const fastball = make('four-seam'), slider = make('slider'), curve = make('curveball'), change = make('changeup')
  const mid = pitch => sampleBaseballPitch(pitch, pitch.flightTimeMs / 2)
  assert.ok(mid(slider).x < mid(fastball).x - 0.05)
  assert.ok(mid(change).x > mid(fastball).x + 0.05)
  assert.ok(mid(curve).y > mid(fastball).y + 0.3)
  assert.ok(slider.flightTimeMs > fastball.flightTimeMs && curve.flightTimeMs > slider.flightTimeMs)
})

test('같은 도착 코스의 초기 방향 보정을 고려해도 실제 횡 곡률·진행 방향 변화가 구종과 투수 손을 따른다', () => {
  const velocity = (pitch, fraction) => {
    const time = pitch.flightTimeMs * fraction
    const before = sampleBaseballPitch(pitch, time - 0.05)
    const after = sampleBaseballPitch(pitch, time + 0.05)
    return { x: (after.x - before.x) * 10000, y: (after.y - before.y) * 10000, z: (after.z - before.z) * 10000 }
  }
  const verticalChanges = new Map()
  for (const profile of BASEBALL_PITCH_TYPES) for (const pitcherHandedness of ['right', 'left']) {
    const pitch = createBaseballPitch({ pitchType: profile.id, speedKmh: getBaseballPitchSpeed(120, profile.id), pitcherHandedness, target: { x: 0, y: 0.745 } })
    const [a, b, c] = [0.25, 0.5, 0.75].map(fraction => sampleBaseballPitch(pitch, pitch.flightTimeMs * fraction))
    const curvature = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)
    const early = velocity(pitch, 0.2), late = velocity(pitch, 0.8)
    const headingChange = Math.atan2(late.x, -late.z) - Math.atan2(early.x, -early.z)
    if (profile.id === 'four-seam') {
      near(curvature, 0, 1e-10)
      near(headingChange, 0, 1e-8)
    } else {
      assert.ok(curvature * pitch.acceleration.x > 0, `${profile.id}/${pitcherHandedness} curvature`)
      assert.ok(headingChange * pitch.acceleration.x > 0, `${profile.id}/${pitcherHandedness} heading`)
    }
    assert.ok(late.y < early.y)
    if (pitcherHandedness === 'right') verticalChanges.set(profile.id, late.y - early.y)
  }
  assert.ok(verticalChanges.get('curveball') < verticalChanges.get('four-seam') - 1)
})

test('모든 구종·양투·양타의 110ms 기준 스윙은 실제 캡슐에 접촉하고 결과에 구종을 보존한다', () => {
  for (const profile of BASEBALL_PITCH_TYPES) for (const base of [80, 120, 160]) {
    for (const pitcherHandedness of ['right', 'left']) for (const handedness of ['right', 'left']) {
      for (const target of [{ x: 0, y: 0.745 }, { x: -0.2809, y: 0.45172 }, { x: 0.2809, y: 1.0385 }]) {
        const pitch = createBaseballPitch({ pitchType: profile.id, speedKmh: getBaseballPitchSpeed(base, profile.id), pitcherHandedness, target })
        const result = swing(pitch, { handedness })
        assert.equal(result.contacted, true, `${profile.id}/${base}/${pitcherHandedness}/${handedness}/${JSON.stringify(target)}`)
        assert.equal(result.pitchType, profile.id)
        assert.equal(judgeBaseballTake(pitch).pitchType, profile.id)
        const ball = sampleBaseballPitch(pitch, result.contactAtMs)
        const bat = sampleBaseballBat({ swingElapsedMs: result.swingElapsedMs, aim: target, handedness })
        assert.deepEqual(result.contactPoint, sampleBaseballPlatePassage(pitch).point)
        near(ball.z, 0, 1e-12)
        near(barrelDistance(ball, bat), 0, 1e-12)
        near(result.contactAtMs, sampleBaseballPlatePassage(pitch).timeMs, 1e-12)
      }
    }
  }
})

test('구속은 초기 3D 속도 크기와 일치하고 빠른 공은 실제 비행시간이 짧다', () => {
  const times = [80, 100, 120, 140, 160].map(speed => {
    const pitch = pitchAt(speed)
    near(Math.hypot(...Object.values(pitch.velocity)) * 3.6, speed)
    near(sampleBaseballPitch(pitch, 0).speedKmh, speed)
    const end = sampleBaseballPitch(pitch, pitch.flightTimeMs)
    near(end.x, pitch.target.x); near(end.y, pitch.target.y); near(end.z, 0)
    assert.ok(pitch.flightTimeMs > 16.5 / (speed / 3.6) * 1000)
    return pitch.flightTimeMs
  })
  assert.ok(times.every((time, index) => index === 0 || time < times[index - 1]))
})

test('같은 seed는 같은 연속 코스를 만들며 범위는 존 경계·가까운 외곽까지만 확장한다', () => {
  const pitch = createBaseballPitch({ speedKmh: 140, seed: 42 })
  assert.deepEqual(pitch, createBaseballPitch({ speedKmh: 140, seed: 42 }))
  assert.ok(Object.isFrozen(pitch) && Object.isFrozen(pitch.target) && Object.isFrozen(pitch.velocity))
  const expected = sampleBaseballPitch(pitch, 333.125)
  for (const hz of [30, 60, 120]) {
    for (let time = 0; time < 500; time += 1000 / hz) sampleBaseballPitch(pitch, time)
    assert.deepEqual(sampleBaseballPitch(pitch, 333.125), expected)
  }
  const targets = Array.from({ length: 1024 }, (_, seed) => createBaseballPitch({ seed }).target)
  assert.equal(new Set(targets.map(target => JSON.stringify(target))).size, targets.length)
  const { zone, courseMarginXM: marginX, courseMarginYM: marginY } = BASEBALL_RULES
  for (const target of targets) {
    assert.ok(target.x >= zone.left - marginX && target.x < zone.right + marginX)
    assert.ok(target.y >= zone.bottom - marginY && target.y < zone.top + marginY)
  }
  assert.ok(targets.some(target => target.x < zone.left) && targets.some(target => target.x > zone.right))
  assert.ok(targets.some(target => target.y < zone.bottom) && targets.some(target => target.y > zone.top))
  assert.ok(targets.some(target => Math.abs(target.x - zone.left) < 0.002))
  assert.ok(targets.some(target => Math.abs(target.y - zone.top) < 0.002))
  assert.equal(sampleBaseballPitch(pitch, -1).visible, false)
})

test('투수 좌우손은 seed로 한 번 결정되고 코스·구속·FPS와 별도로 양쪽이 고르게 나타난다', () => {
  const hands = { right: 0, left: 0 }
  for (let seed = 0; seed < 1024; seed += 1) {
    const pitch = createBaseballPitch({ seed })
    hands[pitch.pitcherHandedness] += 1
    assert.equal(pitch.release.x, pitch.pitcherHandedness === 'right' ? -0.34 : 0.34)
    assert.equal(createBaseballPitch({ seed, speedKmh: 160 }).pitcherHandedness, pitch.pitcherHandedness)
    assert.equal(createBaseballPitch({ seed, target: { x: 0, y: 0.745 } }).pitcherHandedness, pitch.pitcherHandedness)
    for (const time of [0, 16.7, 33.3, 200]) sampleBaseballPitch(pitch, time)
    assert.deepEqual(createBaseballPitch({ seed }), pitch)
  }
  assert.ok(hands.right > 430 && hands.right < 594)
  assert.equal(hands.right + hands.left, 1024)
})

test('좌투·우투 강제 검수는 코스·실제 릴리스 구속을 유지하고 손·실접촉을 결과에 보존한다', () => {
  for (const speedKmh of [80, 100, 120, 140, 160]) {
    const right = createBaseballPitch({ seed: 17, speedKmh, target: { x: 0, y: 0.745 }, pitcherHandedness: 'right' })
    const left = createBaseballPitch({ seed: 17, speedKmh, target: right.target, pitcherHandedness: 'left' })
    assert.notEqual(left.id, right.id)
    assert.deepEqual(left.target, right.target)
    near(left.flightTimeMs, right.flightTimeMs)
    for (const pitch of [right, left]) {
      near(sampleBaseballPitch(pitch, 0).speedKmh, speedKmh)
      near(Math.hypot(...Object.values(pitch.velocity)) * 3.6, speedKmh)
      const destination = sampleBaseballPitch(pitch, pitch.flightTimeMs)
      near(destination.x, pitch.target.x); near(destination.y, pitch.target.y); near(destination.z, 0)
      const result = swing(pitch)
      assert.equal(result.contacted, true)
      assert.equal(result.pitcherHandedness, pitch.pitcherHandedness)
      assert.equal(judgeBaseballTake(pitch).pitcherHandedness, pitch.pitcherHandedness)
      const contact = sampleBaseballPitch(pitch, result.contactAtMs)
      assert.deepEqual(result.contactPoint, sampleBaseballPlatePassage(pitch).point)
      near(contact.z, 0, 1e-12)
      const miss = swing(pitch, { aim: { x: 1, y: 1.3 } })
      assert.equal(miss.outcome, 'miss')
      assert.equal(miss.pitcherHandedness, pitch.pitcherHandedness)
    }
  }
  const random = createBaseballPitch({ seed: 76 })
  assert.deepEqual(createBaseballPitch({ seed: 76, pitcherHandedness: 'left' }).target, random.target)
  assert.deepEqual(createBaseballPitch({ seed: 76, pitcherHandedness: 'right' }).target, random.target)
})

test('배트는 조준점을 중심으로 양타석·높이·110ms 기준과520ms 동작을 같은 기하로 표현한다', () => {
  for (const y of [0.50, 0.745, 1.0]) {
    const aim = { x: 0.08, y }
    const bat = sampleBaseballBat({ swingElapsedMs: 110, aim })
    assert.deepEqual(bat.sweetSpot, { ...aim, z: 0 })
    near(Math.hypot(bat.end.x - bat.start.x, bat.end.y - bat.start.y, bat.end.z - bat.start.z), BASEBALL_RULES.batBarrelLengthM)
    assert.equal(bat.radius, BASEBALL_RULES.batRadiusM)
    assert.equal(bat.active, true)
    assert.equal(bat.visible, true)
  }
  for (const time of [0, 20, 80, 110, 155, 210, 350, 520]) {
    const right = sampleBaseballBat({ swingElapsedMs: time, aim: { x: 0.1, y: 0.8 }, handedness: 'right' })
    const left = sampleBaseballBat({ swingElapsedMs: time, aim: { x: -0.1, y: 0.8 }, handedness: 'left' })
    for (const key of ['start', 'end', 'sweetSpot']) {
      near(right[key].x, -left[key].x); near(right[key].y, left[key].y); near(right[key].z, left[key].z)
    }
    assert.ok(Object.values(right.start).every(Number.isFinite))
    near(Math.hypot(right.end.x - right.start.x, right.end.y - right.start.y), BASEBALL_RULES.batBarrelLengthM, 1e-12)
    assert.equal(right.start.z, 0)
    assert.equal(right.end.z, 0)
    assert.equal(right.sweetSpot.z, 0)
    assert.equal(right.planeZ, 0)
  }
  assert.equal(sampleBaseballBat({ swingElapsedMs: -1, aim: { x: 0, y: 0.745 } }).visible, false)
  assert.equal(sampleBaseballBat({ swingElapsedMs: BASEBALL_RULES.batActiveStartMs - 0.001, aim: { x: 0, y: 0.745 } }).active, false)
  assert.equal(sampleBaseballBat({ swingElapsedMs: BASEBALL_RULES.batActiveEndMs + 0.001, aim: { x: 0, y: 0.745 } }).active, false)
  assert.equal(sampleBaseballBat({ swingElapsedMs: 520, aim: { x: 0, y: 0.745 } }).visible, false)
  assert.equal(BASEBALL_RULES.swingContactMs, 110)
  assert.equal(BASEBALL_RULES.swingDurationMs, 520)
})

test('양손·전체 동작에서 자유 조준 중심은 고정되고 배럴 방향만 회전하며 입력은 보존된다', () => {
  const times=[-1000,-.001,19.999999,20.000001,110.125,209.999999,210.000001,519.999999,10000,
    ...Array.from({length:521},(_,time)=>time)]
  for(const handedness of ['left','right']) for(const aim of [
    {x:0,y:.74511},{x:-.65,y:.15},{x:.65,y:1.4},{x:-.23,y:1.0},{x:.18,y:.49},
  ]) {
    const before={...aim}
    for(const time of times) {
      const bat=sampleBaseballBat({swingElapsedMs:time,aim,handedness})
      assert.deepEqual(bat.sweetSpot,{...aim,z:0})
      near((bat.start.x+bat.end.x)/2,aim.x,1e-12)
      near((bat.start.y+bat.end.y)/2,aim.y,1e-12)
      near(Math.hypot(bat.end.x-bat.start.x,bat.end.y-bat.start.y),.64,1e-12)
      assert.equal(bat.radius,.033)
      assert.equal(bat.start.z,0)
      assert.equal(bat.end.z,0)
    }
    const start=sampleBaseballBat({swingElapsedMs:20,aim,handedness})
    const middle=sampleBaseballBat({swingElapsedMs:110,aim,handedness})
    const end=sampleBaseballBat({swingElapsedMs:210,aim,handedness})
    assert.ok(start.angleRad < middle.angleRad && middle.angleRad < end.angleRad)
    assert.notDeepEqual(start.start,middle.start)
    assert.deepEqual(aim,before)
  }
})

test('타격은 정확한 앞면 통과 이벤트와 같은 면의 배트를 비교하고 타구도 그 사건에서 출발한다', () => {
  for (const speed of [80, 100, 120, 140, 160]) {
    const pitch = pitchAt(speed)
    const result = swing(pitch)
    assert.equal(result.outcome, 'perfect')
    assert.ok(result.score >= 98 && result.score <= 100)
    const passage = sampleBaseballPlatePassage(pitch)
    assert.equal(result.contactAtMs, passage.timeMs)
    const ball = sampleBaseballPitch(pitch, result.contactAtMs)
    const bat = sampleBaseballBat({ swingElapsedMs: result.swingElapsedMs, aim: pitch.target })
    assert.deepEqual(result.contactPoint, passage.point)
    assert.ok(ball.visible)
    assert.equal(result.contactPoint.z, 0)
    near(barrelDistance(ball, bat), 0, 1e-12)
    assert.equal(result.activeAtPlate, true)
    assert.equal(result.barrelGapM, 0)
    near(result.timingErrorMs, 0, 1e-9)
    near(result.aimErrorM, 0, 1e-12)
    near(result.swingElapsedMs, result.contactAtMs - (pitch.flightTimeMs - 110))
    assert.ok(result.barrelFraction >= 0 && result.barrelFraction <= 1 && Number.isFinite(result.relativeSpeedKmh))
  }
})

test('예전 목표점 반경을 쓰지 않으며 barrel 끝 접촉과 실제 상하 불일치를 구분한다', () => {
  const pitch = pitchAt()
  const tip = swing(pitch, { aim: { x: 0.30, y: 0.745 } })
  assert.equal(tip.contacted, true)
  assert.ok(tip.aimErrorM > 0.14 && tip.barrelFraction < 0.1)
  assert.ok(tip.quality < swing(pitch).quality)
  for (const aim of [{ x: 0.42, y: 0.745 }, { x: 0, y: 0.835 }, { x: 0, y: 1.1 }]) {
    const miss = swing(pitch, { aim })
    assert.equal(miss.outcome, 'miss')
    assert.equal(miss.contactAtMs, null)
    assert.equal(miss.contactPoint, null)
  }
  for (const shift of [-220, 220]) {
    assert.equal(swing(pitch, { swingAtMs: pitch.flightTimeMs - 110 + shift }).outcome, 'miss')
  }
})

test('공 직경8cm의 합성 반경7.3cm는 새 접촉 띠·끝캡을 포함하고1µm 바깥은 제외한다', () => {
  assert.equal(BASEBALL_RULES.ballRadiusM,.04)
  assert.equal(BASEBALL_RULES.ballRadiusM*2,.08)
  near(BASEBALL_RULES.ballRadiusM+BASEBALL_RULES.batRadiusM,.073,1e-15)
  const aim={x:0,y:.745}
  for(const handedness of ['left','right']) {
    const bat=sampleBaseballBat({swingElapsedMs:110,aim,handedness})
    const axis={x:(bat.end.x-bat.start.x)/.64,y:(bat.end.y-bat.start.y)/.64}
    const normal={x:-axis.y,y:axis.x}
    for(const [anchor,direction,fraction] of [
      [bat.sweetSpot,normal,.5],[bat.start,{x:-axis.x,y:-axis.y},0],[bat.end,axis,1],
    ]) for(const separation of [.071,.073,.073001]) {
      const target={x:anchor.x+direction.x*separation,y:anchor.y+direction.y*separation}
      for(const type of BASEBALL_PITCH_TYPES) for(const pitcherHandedness of ['left','right']) {
        const pitch=createBaseballPitch({pitchType:type.id,speedKmh:getBaseballPitchSpeed(120,type.id),target,pitcherHandedness})
        const result=swing(pitch,{aim,handedness})
        assert.equal(result.contacted,separation<=.073)
        assert.equal(result.activeAtPlate,true)
        near(result.barrelFraction,fraction,1e-10)
        near(result.barrelGapM,Math.max(0,separation-.073),1e-10)
        if(separation>.073)assert.equal(result.missReason,'outside-barrel')
        else assert.equal(result.missReason,null)
      }
    }
  }
})

test('앞면의 유한 배럴 전체·양끝·둥근 끝캡은 포함하고 반경 바깥은 실제 표면 간격으로 구분한다', () => {
  const aim = { x: 0, y: 0.745 }
  const radius = BASEBALL_RULES.ballRadiusM + BASEBALL_RULES.batRadiusM
  for (const handedness of ['right', 'left']) for(const elapsed of [0,8.8501940588,20,70,110,160,210]) {
    const bat = sampleBaseballBat({ swingElapsedMs: elapsed, aim, handedness })
    const axis = { x: (bat.end.x - bat.start.x) / BASEBALL_RULES.batBarrelLengthM, y: (bat.end.y - bat.start.y) / BASEBALL_RULES.batBarrelLengthM }
    const normal = { x: -axis.y, y: axis.x }
    for (const [anchor, direction, fraction] of [
      [bat.sweetSpot, normal, 0.5], [bat.start, normal, 0], [bat.end, normal, 1],
      [bat.start, { x: -axis.x, y: -axis.y }, 0], [bat.end, axis, 1],
    ]) for (const outsideM of [0, 1e-6]) {
      const target = { x: anchor.x + direction.x * (radius + outsideM), y: anchor.y + direction.y * (radius + outsideM) }
      const pitch = pitchAt(160, target)
      const result = swing(pitch, { aim, handedness, swingAtMs:sampleBaseballPlatePassage(pitch).timeMs-elapsed })
      assert.equal(result.contacted, outsideM === 0)
      assert.equal(result.activeAtPlate, true)
      near(result.barrelFraction, fraction, 1e-10)
      near(result.barrelGapM, outsideM, 1e-10)
      assert.equal(result.barrelClosestPoint.z, 0)
      if (outsideM) assert.equal(result.missReason, 'outside-barrel')
      else assert.equal(result.missReason, null)
    }
  }
})

test('앞면 통과 때의 유효0~210ms 경계와 음수·회복 시간 제외 이유를 거리와 혼동하지 않는다', () => {
  for (const type of BASEBALL_PITCH_TYPES) for (const pitcherHandedness of ['right', 'left']) for (const handedness of ['right', 'left']) {
    const pitch = createBaseballPitch({ pitchType: type.id, speedKmh: getBaseballPitchSpeed(120, type.id), pitcherHandedness, target: { x: 0, y: 0.745 } })
    const passage = sampleBaseballPlatePassage(pitch)
    for (const elapsed of [-10, -0.000001, -5e-10, 0, 8.8501940588, 19.999999, 20, 110, 210, 210.000001, 240, 520, 521]) {
      const active = elapsed >= 0 && elapsed <= 210
      const aim = pitch.target
      const result = swing(pitch, { swingAtMs: passage.timeMs - elapsed, aim, handedness })
      assert.equal(result.activeAtPlate, active, `${type.id}/${elapsed}`)
      assert.equal(result.contacted, active)
      near(result.timingErrorMs, BASEBALL_RULES.swingContactMs - elapsed, 1e-9)
      if (active) {
        assert.equal(result.barrelGapM, 0)
        assert.equal(result.contactAtMs, passage.timeMs)
      } else {
        assert.equal(result.missReason, 'outside-window')
        assert.equal(result.barrelGapM, null)
        assert.equal(result.barrelClosestPoint, null)
        assert.equal(result.barrelFraction, null)
        assert.equal(result.contactAtMs, null)
      }
    }
  }
})

test('초반8.85ms에 기하상 겹친 실제 입력은 파울이고 구버전 헛스윙은 따로 재계산한다', () => {
  const pitch=createBaseballPitch({speedKmh:140,seed:566508935,target:{x:0,y:.74511},pitcherHandedness:'right'})
  const options={swingAtMs:436.7999999523163,aim:{x:.08221664827820159,y:.7853936604407757},handedness:'right'}
  const result=judgeBaseballSwing(pitch,options)
  assert.equal(result.contacted,true)
  assert.equal(result.activeAtPlate,true)
  assert.equal(result.barrelGapM,0)
  assert.equal(result.outcome,'foul')
  assert.equal(result.score,10)
  near(result.directionDeg,80.46043919644326,1e-9)
  near(result.swingElapsedMs,8.850194058800867,1e-9)
  const legacy=judgeBaseballSwingLegacyV1(pitch,options)
  assert.equal(legacy.outcome,'miss')
  assert.equal(legacy.missReason,'outside-window')
  assert.equal(legacy.activeAtPlate,false)
  assert.equal(legacy.score,0)
  const clearMiss=judgeBaseballSwing(pitch,{...options,aim:{x:0,y:1.3}})
  assert.equal(clearMiss.activeAtPlate,true)
  assert.equal(clearMiss.contacted,false)
  assert.equal(clearMiss.missReason,'outside-barrel')
})

test('타격과 헛스윙의 시간차·조준 중앙 오차는 같은 기준이며 배럴 표면 간격과 별도다', () => {
  const pitch = pitchAt()
  const passage = sampleBaseballPlatePassage(pitch)
  for (const elapsed of [70, 110, 150]) {
    const centred = pitch.target
    const hit = swing(pitch, { swingAtMs: passage.timeMs - elapsed, aim: centred })
    const aim = { ...centred, y: centred.y + 0.4 }
    const miss = swing(pitch, { swingAtMs: passage.timeMs - elapsed, aim })
    assert.equal(hit.contacted, true)
    assert.equal(miss.contacted, false)
    assert.equal(hit.timingErrorMs, miss.timingErrorMs)
    near(hit.timingErrorMs, 110 - elapsed)
    for (const [result, position] of [[hit, centred], [miss, aim]]) {
      near(result.aimErrorM, Math.hypot(position.x - passage.point.x, position.y - passage.point.y))
      assert.deepEqual(result.platePassage, passage)
    }
    assert.equal(hit.barrelGapM, 0)
    assert.ok(miss.barrelGapM > 0.2)
  }
})

test('160km/h 공의 앞면 사건을 렌더 프레임 사이에서도 정확히 검사하고 FPS별 결과가 바뀌지 않는다', () => {
  const pitch = pitchAt(160)
  const swingAtMs = pitch.flightTimeMs - 110
  const expected = swing(pitch)
  const radius = BASEBALL_RULES.ballRadiusM + BASEBALL_RULES.batRadiusM
  const frameContacts = []
  for (let elapsed = 0; elapsed < 520; elapsed += 1000 / 30) {
    const bat = sampleBaseballBat({ swingElapsedMs: elapsed, aim: pitch.target })
    if (bat.active) frameContacts.push(barrelDistance(sampleBaseballPitch(pitch, swingAtMs + elapsed), bat) <= radius)
  }
  assert.ok(frameContacts.length > 0 && frameContacts.every(contact => !contact))
  assert.equal(expected.contacted, true)
  for (const hz of [15, 30, 60, 120, 144]) {
    for (let elapsed = 0; elapsed < 520; elapsed += 1000 / hz) {
      sampleBaseballPitch(pitch, swingAtMs + elapsed)
      sampleBaseballBat({ swingElapsedMs: elapsed, aim: pitch.target })
    }
    assert.deepEqual(swing(pitch), expected)
  }
})

test('양타석의 거울상 물리 조건은 같은 접촉 품질과 반대 타구 방향을 만든다', () => {
  const pitch = pitchAt()
  const mirrored = createBaseballPitch({
    speedKmh: pitch.speedKmh, seed: pitch.seed,
    target: { x: -pitch.target.x, y: pitch.target.y }, pitcherHandedness: 'left',
  })
  for (const shift of [-90, -40, 0, 40, 90]) {
    const right = swing(pitch, { swingAtMs: pitch.flightTimeMs - 110 + shift })
    const left = swing(mirrored, { swingAtMs: mirrored.flightTimeMs - 110 + shift, handedness: 'left' })
    assert.equal(right.outcome, left.outcome)
    near(right.directionDeg, -left.directionDeg)
    near(right.quality, left.quality)
    near(right.contactAtMs, left.contactAtMs)
  }
  for (const elapsed of [30, 200]) {
    const result = swing(pitch, { swingAtMs: sampleBaseballPlatePassage(pitch).timeMs - elapsed, aim:pitch.target })
    assert.equal(result.outcome, 'foul')
  }
})

test('중심이 고정되어도 정확한 시점의 정타·중간 타격·이른 늦은 파울의 품질 구분은 남는다', () => {
  const pitch=pitchAt(),passage=sampleBaseballPlatePassage(pitch)
  for(const handedness of ['left','right']) {
    const at=elapsed=>swing(pitch,{swingAtMs:passage.timeMs-elapsed,aim:pitch.target,handedness})
    const exact=at(110),early=at(140),late=at(80),earlyFoul=at(200),lateFoul=at(30)
    assert.equal(exact.outcome,'perfect')
    assert.equal(exact.score,100)
    for(const ordinary of [early,late]) {
      assert.equal(ordinary.outcome,'contact')
      assert.ok(ordinary.quality<exact.quality)
      assert.ok(ordinary.score<exact.score && ordinary.score>10)
      near(ordinary.barrelFraction,.5,1e-12)
    }
    for(const foul of [earlyFoul,lateFoul]) {
      assert.equal(foul.contacted,true)
      assert.equal(foul.outcome,'foul')
      assert.equal(foul.score,10)
      assert.ok(Math.abs(foul.directionDeg)>45)
    }
    assert.ok(early.directionDeg*late.directionDeg<0)
  }
})

test('공의 실제 상하 접촉차가 땅볼·라인드라이브·높은 타구의 각도 차이로 드러난다', () => {
  const pitch = pitchAt()
  const under = swing(pitch, { aim: { x: 0, y: 0.70 } })
  const middle = swing(pitch)
  const over = swing(pitch, { aim: { x: 0.15, y: 0.82 } })
  assert.ok([under, middle, over].every(result => result.contacted))
  assert.ok(under.launchAngleDeg > middle.launchAngleDeg && middle.launchAngleDeg > over.launchAngleDeg)
  assert.ok(under.launchAngleDeg > 35)
  assert.ok(over.launchAngleDeg < 0)
})

test('볼·스트라이크는 타격 성공과 독립적으로 보이는 앞면 존의 공 중심을 검사한다', () => {
  assert.equal(judgeBaseballTake(pitchAt()).outcome, 'called-strike')
  const outside = pitchAt(120, { x: 0.45, y: 0.745 })
  assert.equal(judgeBaseballTake(outside).outcome, 'ball')
  assert.equal(swing(outside).outcome, 'perfect')
  const low = pitchAt(120, { x: 0, y: BASEBALL_RULES.zone.bottom })
  assert.equal(judgeBaseballTake(low).outcome, 'called-strike')
  assert.equal(judgeBaseballTake(pitchAt()).timingErrorMs, null)
})

test('공유 앞면 통과 이벤트는 실제 sampler 좌표와 시각을 보존하고 Take와 같은 내부 여부를 제공한다', () => {
  for (const profile of BASEBALL_PITCH_TYPES) for (const base of [80, 120, 160]) for (const pitcherHandedness of ['right', 'left']) {
    const pitch = createBaseballPitch({ pitchType: profile.id, speedKmh: getBaseballPitchSpeed(base, profile.id), pitcherHandedness, seed: 318 })
    const before = JSON.stringify(pitch)
    const passage = sampleBaseballPlatePassage(pitch)
    const actual = sampleBaseballPitch(pitch, passage.timeMs)
    assert.deepEqual(passage.point, { x: actual.x, y: actual.y, z: 0 })
    near(actual.z, 0, 1e-12)
    near(passage.timeMs, pitch.flightTimeMs, 1e-9)
    assert.equal(passage.planeZ, 0)
    assert.ok(Object.isFrozen(passage) && Object.isFrozen(passage.point))
    assert.equal(isBaseballStrike(pitch), passage.inside)
    const take = judgeBaseballTake(pitch)
    assert.deepEqual(take.platePassage, passage)
    assert.equal(take.outcome, passage.inside ? 'called-strike' : 'ball')
    assert.equal(JSON.stringify(pitch), before)
  }
})

test('4구종·양투의 앞면 상하좌우·모서리는 포함하고 1µm 바깥은 코스 이동 없이 제외한다', () => {
  const z = BASEBALL_RULES.zone
  const middleY = (z.bottom + z.top) / 2
  const cases = [
    [{ x: z.left, y: middleY }, true], [{ x: z.right, y: middleY }, true],
    [{ x: 0, y: z.bottom }, true], [{ x: 0, y: z.top }, true],
    [{ x: z.left, y: z.bottom }, true], [{ x: z.right, y: z.top }, true],
    [{ x: z.left - 1e-6, y: middleY }, false], [{ x: z.right + 1e-6, y: middleY }, false],
    [{ x: 0, y: z.bottom - 1e-6 }, false], [{ x: 0, y: z.top + 1e-6 }, false],
  ]
  for (const profile of BASEBALL_PITCH_TYPES) for (const base of [80, 160]) for (const pitcherHandedness of ['right', 'left']) {
    for (const [target, inside] of cases) {
      const pitch = createBaseballPitch({ pitchType: profile.id, speedKmh: getBaseballPitchSpeed(base, profile.id), pitcherHandedness, target })
      const event = sampleBaseballPlatePassage(pitch)
      assert.equal(event.inside, inside, `${profile.id}/${base}/${pitcherHandedness}/${JSON.stringify(target)}`)
      near(event.point.x, target.x, 1e-12); near(event.point.y, target.y, 1e-12)
      if (!inside) assert.ok(event.point.x < z.left || event.point.x > z.right || event.point.y < z.bottom || event.point.y > z.top)
    }
  }
})

test('기존 실제 표본의 중앙 느린 커브·낮은 코스·가로 경계는 중간·끝면 대신 앞면 판정으로 일치한다', () => {
  // Minimal explicit reproductions of the audited browser/edge cases. Tests
  // remain portable: no private audit file, account data or local path is read.
  const cases = [
    { pitchType: 'curveball', speedKmh: 60, pitcherHandedness: 'left', target: { x: 0, y: 0.74511 }, inside: true },
    { pitchType: 'four-seam', speedKmh: 120, pitcherHandedness: 'right', target: { x: -0.09629249049913807, y: 0.5164327875802294 }, inside: true },
    { pitchType: 'four-seam', speedKmh: 160, pitcherHandedness: 'left', target: { x: 0.07393749462323479, y: 0.5010357809119168 }, inside: true },
    { pitchType: 'slider', speedKmh: 123, pitcherHandedness: 'right', target: { x: -0.1722931932162959, y: 0.49686000035606325 }, inside: true },
    { pitchType: 'slider', speedKmh: 70, pitcherHandedness: 'right', target: { x: -0.04283910358527676, y: 0.5325903412406128 }, inside: true },
    { pitchType: 'curveball', speedKmh: 120, pitcherHandedness: 'right', target: { x: 0.23304617714714254, y: 0.6680795119700302 }, inside: true },
    { pitchType: 'changeup', speedKmh: 115, pitcherHandedness: 'left', target: { x: 0.09559302089009863, y: 0.5160148135578438 }, inside: true },
    { pitchType: 'four-seam', speedKmh: 100, pitcherHandedness: 'left', target: { x: -0.22742923691798972, y: 0.5722973905511759 }, inside: true },
    { pitchType: 'curveball', speedKmh: 90, pitcherHandedness: 'right', target: { x: 0.22335622405279426, y: 0.786117305081645 }, inside: true },
    { pitchType: 'four-seam', speedKmh: 120, pitcherHandedness: 'left', target: { x: 0, y: 1.0085 }, inside: false },
    { pitchType: 'four-seam', speedKmh: 120, pitcherHandedness: 'right', target: { x: -0.2364, y: 0.9 }, inside: false },
  ]
  for (const item of cases) {
    const pitch = createBaseballPitch(item)
    const event = sampleBaseballPlatePassage(pitch)
    assert.equal(event.inside, item.inside)
    assert.equal(judgeBaseballTake(pitch).outcome, item.inside ? 'called-strike' : 'ball')
    assert.deepEqual(judgeBaseballTake(pitch).platePassage, event)
  }
  const curve = createBaseballPitch(cases[0])
  const swingBefore = swing(curve)
  sampleBaseballPlatePassage(curve)
  judgeBaseballTake(curve)
  assert.deepEqual(swing(curve), swingBefore)
})

test('타구는 접촉점에서 출발해 같은 시간에 같은 위치로 이동하고 예상 비거리에 착지한다', () => {
  const result = swing(pitchAt())
  assert.ok(result.distanceM > 0 && result.exitSpeedKmh > 0)
  const start = sampleBaseballBattedBall(result, 0)
  near(start.x, result.contactPoint.x); near(start.y, result.contactPoint.y); near(start.z, result.contactPoint.z)
  assert.equal(sampleBaseballBattedBall(result, -1).visible, false)
  const end = sampleBaseballBattedBall(result, result.landingTimeMs)
  near(end.y, 0)
  near(Math.hypot(end.x - result.contactPoint.x, end.z - result.contactPoint.z), result.distanceM)
  assert.equal(end.landed, true)
  assert.deepEqual(sampleBaseballBattedBall(result, result.landingTimeMs + 500), end)
  assert.equal(sampleBaseballBattedBall(swing(pitchAt(), { aim: { x: 1, y: 1 } }), 200).visible, false)
})

test('잘못된 숫자·seed·좌표·손잡이를 정상 투구나 성공 결과로 바꾸지 않는다', () => {
  for (const speedKmh of [NaN, Infinity, '120', 79, 161]) assert.throws(() => createBaseballPitch({ speedKmh }))
  for (const seed of [NaN, -1, 1.2, 0x100000000, '1']) assert.throws(() => createBaseballPitch({ seed }))
  for (const pitcherHandedness of [null, '', 'switch', 1, false]) assert.throws(() => createBaseballPitch({ pitcherHandedness }))
  for (const pitchType of [null, '', 'fastball', 'CURVEBALL', 1, {}]) {
    assert.throws(() => createBaseballPitch({ pitchType }))
    assert.throws(() => getBaseballPitchSpeed(120, pitchType))
  }
  for (const speed of [NaN, Infinity, '120', 79, 161]) assert.throws(() => getBaseballPitchSpeed(speed, 'curveball'))
  for (const type of ['slider', 'curveball', 'changeup']) {
    for (const speedKmh of [59.99, -1, Infinity, 161]) assert.throws(() => createBaseballPitch({ pitchType: type, speedKmh }))
  }
  for (const target of [{ x: NaN, y: 1 }, { x: 0, y: Infinity }, { x: 2, y: 1 }, null]) assert.throws(() => createBaseballPitch({ target }))
  const pitch = pitchAt()
  assert.throws(() => sampleBaseballPitch(pitch, NaN))
  assert.throws(() => sampleBaseballPitch({}, 0))
  assert.throws(() => sampleBaseballPlatePassage({}))
  assert.throws(() => sampleBaseballPitch({ ...pitch, dragPerSecond: 0 }, 0))
  assert.throws(() => sampleBaseballPitch({ ...pitch, acceleration: { x: 0, y: NaN, z: 0 } }, 0))
  assert.throws(() => sampleBaseballPitch({ ...pitch, acceleration: { x: 0, y: -6.81, z: 1 } }, 0))
  assert.throws(() => judgeBaseballSwing(pitch, { swingAtMs: NaN, aim: pitch.target }))
  assert.throws(() => swing(pitch, { handedness: 'both' }))
  assert.throws(() => swing(pitch, { aim: { x: 0, y: NaN } }))
  for (const time of [NaN, Infinity, '110', undefined]) assert.throws(() => sampleBaseballBat({ swingElapsedMs: time, aim: pitch.target }))
  assert.throws(() => sampleBaseballBat({ swingElapsedMs: 110, aim: { x: NaN, y: 0.7 } }))
  assert.throws(() => sampleBaseballBat({ swingElapsedMs: 110, aim: pitch.target, handedness: 'switch' }))
  assert.throws(() => sampleBaseballBattedBall(swing(pitch), Infinity))
})
