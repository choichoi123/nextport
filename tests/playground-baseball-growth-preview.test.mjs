import test from 'node:test'
import assert from 'node:assert/strict'
import { BASEBALL_GROWTH_PREVIEW_RULES, getBaseballGrowthPreviewProfile,
  compareBaseballGrowthPreview } from '../lib/playground-baseball-growth-preview.mjs'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, createBaseballPitch, getBaseballPitchSpeed,
  judgeBaseballSwing, judgeBaseballTake, sampleBaseballPlatePassage, sampleBaseballBat,
  sampleBaseballBattedBall } from '../lib/playground-baseball.mjs'
import { BASEBALL_FIELD_MODEL, resolveBaseballFieldResult } from '../lib/playground-baseball-field.mjs'

const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)
const copy = value => JSON.parse(JSON.stringify(value))
const compare = (fixture, mit = 40, power = 40) => compareBaseballGrowthPreview({ ...fixture, mit, power })
function fixture({ type = 'four-seam', baseSpeed = 120, pitcherHandedness = 'right', handedness = 'right',
  elapsed = 110, separation = 0, anchor = 'middle', sign = 1 } = {}) {
  const aim = { x: 0, y: .745 }, bat = sampleBaseballBat({ swingElapsedMs: elapsed, aim, handedness })
  const axis = { x: (bat.end.x - bat.start.x) / .64, y: (bat.end.y - bat.start.y) / .64 }
  const center = anchor === 'middle' ? bat.sweetSpot : bat[anchor]
  const direction = anchor === 'middle' ? { x: -axis.y * sign, y: axis.x * sign }
    : { x: axis.x * (anchor === 'start' ? -1 : 1), y: axis.y * (anchor === 'start' ? -1 : 1) }
  const pitch = createBaseballPitch({ seed: 42, speedKmh: getBaseballPitchSpeed(baseSpeed, type), pitchType: type,
    pitcherHandedness, target: { x: center.x + direction.x * separation, y: center.y + direction.y * separation } })
  return { pitch, input: { swingAtMs: sampleBaseballPlatePassage(pitch).timeMs - elapsed, aim, handedness } }
}

test('40/70/100은 합성 접촉 거리7.3/7.738/8.176cm와 파워1/1.025/1.05다', () => {
  assert.deepEqual(BASEBALL_GROWTH_PREVIEW_RULES.presets, [40, 70, 100])
  for (const [ability, multiplier, radius, power] of [[40, 1, .073, 1], [70, 1.06, .07738, 1.025], [100, 1.12, .08176, 1.05]]) {
    const result = getBaseballGrowthPreviewProfile({ mit: ability, power: ability })
    close(result.contactMultiplier, multiplier)
    close(result.contactRadiusM, radius)
    close(result.powerMultiplier, power)
    assert.equal(result.outerQualityMaximum, .55)
    assert.ok(Object.isFrozen(result))
  }
  close(getBaseballGrowthPreviewProfile({ mit: 46, power: 46 }).contactRadiusM - .073, .000876)
  close(getBaseballGrowthPreviewProfile({ mit: 46, power: 46 }).powerMultiplier, 1.005)
  assert.equal(getBaseballGrowthPreviewProfile({ mit: 0, power: 39 }).powerMultiplier, 1)
})

test('누락·NaN·문자·소수·범위 밖 능력은40으로 조용히 보정하지 않는다', () => {
  for (const bad of [undefined, null, NaN, Infinity, '70', -1, 101, 40.5]) {
    assert.throws(() => getBaseballGrowthPreviewProfile({ mit: bad, power: 40 }), RangeError)
    assert.throws(() => getBaseballGrowthPreviewProfile({ mit: 40, power: bad }), RangeError)
    assert.throws(() => compareBaseballGrowthPreview({ ...fixture(), mit: bad, power: 40 }), RangeError)
  }
  assert.throws(() => getBaseballGrowthPreviewProfile(), RangeError)
  for (const input of [null, [], { kind: 'unknown' }]) assert.throws(() => compareBaseballGrowthPreview({
    pitch: fixture().pitch, input, mit: 40, power: 40 }), TypeError)
})

test('기본40은4구종·양투·양타·시간과거리 경계에서 기존 결과와 수비를 그대로 재사용한다', () => {
  for (const { id: type } of BASEBALL_PITCH_TYPES) for (const pitcherHandedness of ['left', 'right']) {
    for (const handedness of ['left', 'right']) for (const elapsed of [-.001, 0, 110, 210, 210.001]) {
      for (const separation of [0, .073, .073001, .08176]) {
        const value = fixture({ type, pitcherHandedness, handedness, elapsed, separation })
        const result = judgeBaseballSwing(value.pitch, value.input), row = compare(value)
        assert.deepEqual(row.baseline.result, result)
        assert.equal(row.candidate.result, row.baseline.result)
        assert.equal(row.candidate.fieldResult, row.baseline.fieldResult)
        assert.equal(row.assisted, false)
        if (['contact', 'perfect'].includes(result.outcome)) assert.deepEqual(row.candidate.fieldResult, resolveBaseballFieldResult(result))
      }
    }
  }
})

test('미트는 중앙 띠와 양쪽 둥근 끝캡의 추가 범위만 구제하며 기존 배트64cm와 공8cm를 유지한다', () => {
  assert.equal(BASEBALL_RULES.ballRadiusM * 2, .08)
  assert.equal(BASEBALL_RULES.batBarrelLengthM, .64)
  for (const handedness of ['left', 'right']) for (const anchor of ['middle', 'start', 'end']) {
    for (const [distance, mit, expected] of [[.073, 40, true], [.073001, 40, false], [.076, 70, true],
      [.079, 70, false], [.079, 100, true], [.08176, 100, true], [.081761, 100, false]]) {
      const row = compare(fixture({ handedness, anchor, separation: distance }), mit)
      assert.equal(row.candidate.result.contacted, expected, `${handedness}/${anchor}/${distance}/${mit}`)
      assert.equal(row.assisted, expected && distance > .073)
      if (row.assisted) {
        assert.ok(row.candidate.result.quality <= .55)
        assert.notEqual(row.candidate.result.outcome, 'perfect')
        assert.equal(row.candidate.result.barrelGapM, 0)
        assert.ok(row.baseline.result.barrelGapM > 0)
      }
    }
  }
})

test('4구종·좌우투·좌우타에서0/110/210ms는 유지하고 유효구간 밖은 성장으로 구제하지 않는다', () => {
  for (const { id: type } of BASEBALL_PITCH_TYPES) for (const pitcherHandedness of ['left', 'right']) {
    for (const handedness of ['left', 'right']) for (const elapsed of [-.001, 0, 110, 210, 210.001]) {
      const value = fixture({ type, pitcherHandedness, handedness, elapsed, separation: .079 })
      const row = compare(value, 100, 100), result = row.candidate.result
      const active = elapsed >= 0 && elapsed <= 210
      assert.equal(result.activeAtPlate, active)
      assert.equal(result.contacted, active)
      assert.equal(row.assisted, active)
      if (!active) {
        assert.equal(result, row.baseline.result)
        assert.equal(result.missReason, 'outside-window')
        assert.equal(row.candidate.fieldResult, null)
      } else {
        close(result.timingErrorMs, 110 - elapsed)
        close(result.contactAtMs, sampleBaseballPlatePassage(value.pitch).timeMs)
      }
    }
  }
})

test('기존 접촉의 품질·정타·발사각은 미트만 높여도 변하지 않는다', () => {
  for (const handedness of ['left', 'right']) for (const elapsed of [0, 70, 110, 160, 210]) {
    for (const separation of [0, .03, .07]) {
      const row = compare(fixture({ handedness, elapsed, separation }), 100, 40)
      assert.equal(row.candidate.result, row.baseline.result)
      assert.equal(row.candidate.fieldResult, row.baseline.fieldResult)
      assert.equal(row.assisted, false)
    }
  }
  const perfect = compare(fixture(), 100, 40)
  assert.equal(perfect.candidate.result.outcome, 'perfect')
  assert.ok(perfect.candidate.result.quality > .55)
})

test('보조 접촉의 품질 상한은 속도·각도·점수 전에 적용되고 품질 기준 반경은7.3cm다', () => {
  const row = compare(fixture({ separation: .079 }), 100, 40), result = row.candidate.result
  assert.equal(row.assisted, true)
  assert.equal(result.quality, .55)
  const offset = result.contactPoint.y - result.barrelClosestPoint.y
  close(result.launchAngleDeg, Math.max(-28, Math.min(60, 15 + .55 * 10 + offset / .073 * 32)))
  close(result.exitSpeedKmh, Math.max(40, Math.min(190, result.relativeSpeedKmh * (.85 + .55 * .42))))
  assert.equal(result.score, Math.round(30 + .55 * 45))
  assert.notEqual(result.outcome, 'perfect')
})

test('보조 접촉도 기존 각도·손·타이밍으로 파울 방향을 정하며 자동 페어로 바꾸지 않는다', () => {
  for (const handedness of ['left', 'right']) for (const elapsed of [0, 110, 210]) {
    const row = compare(fixture({ handedness, elapsed, separation: .079 }), 100, 100)
    const result = row.candidate.result
    const angle = (elapsed - 110) * .012, hand = handedness === 'right' ? 1 : -1
    const expected = Math.max(-85, Math.min(85, -hand * angle * 180 / Math.PI * 1.2 + hand * (result.barrelFraction - .5) * 22))
    close(result.directionDeg, expected)
    assert.equal(result.outcome === 'foul', Math.abs(expected) > 45)
    if (Math.abs(expected) > 45) assert.equal(row.candidate.fieldResult, null)
  }
})

test('파워만 올리면 접촉·품질·코스·발사각은 같고 속도와 착지·비행·수비를 함께 재계산한다', () => {
  for (const { id: type } of BASEBALL_PITCH_TYPES) for (const pitcherHandedness of ['left', 'right']) {
    for (const handedness of ['left', 'right']) {
      const value = fixture({ type, baseSpeed: 100, pitcherHandedness, handedness }), row = compare(value, 40, 100)
      const original = row.baseline.result, result = row.candidate.result
      assert.equal(row.assisted, false)
      close(result.exitSpeedKmh, Math.min(190, original.exitSpeedKmh * 1.05))
      for (const key of ['quality', 'score', 'outcome', 'directionDeg', 'launchAngleDeg', 'contactAtMs', 'timingErrorMs']) assert.equal(result[key], original[key])
      assert.deepEqual(result.contactPoint, original.contactPoint)
      const vertical = result.exitSpeedKmh / 3.6 * Math.sin(result.launchAngleDeg * Math.PI / 180)
      close(result.landingTimeMs, (vertical + Math.sqrt(vertical ** 2 + 2 * 9.81 * result.contactPoint.y)) / 9.81 * 1000)
      close(sampleBaseballBattedBall(result, result.landingTimeMs).y, 0)
      assert.ok(result.landingTimeMs > original.landingTimeMs)
      assert.ok(result.distanceM > original.distanceM)
      assert.deepEqual(row.candidate.fieldResult, resolveBaseballFieldResult(result))
      const end = row.candidate.fieldResult.path.at(-1)
      assert.deepEqual(end, row.candidate.fieldResult.decisionPoint)
    }
  }
})

test('미트/파워는 독립적으로 비교하며 두 보정의 결합도 같은 궤적 계약을 통과한다', () => {
  const value = fixture({ baseSpeed: 100, separation: .079 })
  const powerOnly = compare(value, 40, 100), mitOnly = compare(value, 100, 40), combined = compare(value, 100, 100)
  assert.equal(powerOnly.candidate.result.outcome, 'miss')
  assert.equal(mitOnly.assisted, true)
  assert.equal(combined.assisted, true)
  assert.equal(combined.candidate.result.quality, mitOnly.candidate.result.quality)
  assert.equal(combined.candidate.result.launchAngleDeg, mitOnly.candidate.result.launchAngleDeg)
  close(combined.candidate.result.exitSpeedKmh, Math.min(190, mitOnly.candidate.result.exitSpeedKmh * 1.05))
  assert.deepEqual(combined.candidate.fieldResult, resolveBaseballFieldResult(combined.candidate.result))
})

test('상한190km/h를 유지하며 성장 자체로 안타/홈런을 보장하지 않는다', () => {
  const capped = compare(fixture({ baseSpeed: 160 }), 100, 100)
  assert.ok(capped.baseline.result.exitSpeedKmh < 190)
  assert.ok(capped.baseline.result.exitSpeedKmh * 1.05 > 190)
  assert.equal(capped.candidate.result.exitSpeedKmh, 190)
  assert.deepEqual(capped.candidate.fieldResult, resolveBaseballFieldResult(capped.candidate.result))
  const weak = compare(fixture({ baseSpeed: 80, anchor: 'end', separation: .079 }), 100, 100)
  assert.equal(weak.assisted, true)
  assert.equal(weak.candidate.fieldResult.isHit, false)
  assert.notEqual(weak.candidate.fieldResult.outcome, 'home-run')
  assert.equal(BASEBALL_FIELD_MODEL.runner.speedMps, 7.6)
})

test('지켜본 공은 성장과 관계없이 같은 스트라이크/볼 판정이며 수비 결과를 만들지 않는다', () => {
  for (const target of [{ x: 0, y: .745 }, { x: .4, y: .745 }]) {
    const pitch = createBaseballPitch({ seed: 42, target })
    const row = compareBaseballGrowthPreview({ pitch, input: { kind: 'take' }, mit: 100, power: 100 })
    assert.deepEqual(row.baseline.result, judgeBaseballTake(pitch))
    assert.equal(row.candidate.result, row.baseline.result)
    assert.equal(row.candidate.fieldResult, null)
    assert.equal(row.assisted, false)
  }
})

test('비교는 동일 입력에 결정적이고 투구·조준·기존 규칙/구장과 외부 객체를 바꾸지 않는다', () => {
  const value = fixture({ type: 'slider', handedness: 'left', separation: .079 })
  const mutable = copy(value), before = copy(mutable), rules = copy(BASEBALL_RULES), field = copy(BASEBALL_FIELD_MODEL)
  const a = compare(mutable, 70, 100), b = compare(mutable, 70, 100)
  assert.deepEqual(a, b)
  assert.deepEqual(mutable, before)
  assert.deepEqual(BASEBALL_RULES, rules)
  assert.deepEqual(BASEBALL_FIELD_MODEL, field)
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.candidate.result) && Object.isFrozen(a.profile))
  assert.equal(Object.isFrozen(mutable.pitch), false)
  assert.equal(Object.isFrozen(mutable.input.aim), false)
})
