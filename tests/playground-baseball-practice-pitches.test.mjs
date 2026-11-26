import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BASEBALL_PITCH_TYPES, BASEBALL_RULES, createBaseballPitch, getBaseballPitchSpeed,
  judgeBaseballSwing, judgeBaseballTake, sampleBaseballPitch, sampleBaseballPlatePassage,
} from '../lib/playground-baseball.mjs'
import {
  BASEBALL_PRACTICE_PITCH_TYPES, createBaseballPracticePitch, getBaseballPracticePitchSpeed,
  getBaseballPracticePitchType, isBaseballExtendedPracticePitchType,
} from '../lib/playground-baseball-practice-pitches.mjs'

const newTypes = ['sweeper', 'splitter', 'sinker', 'cutter']
const center = { x: 0, y: 0.745 }
const near = (actual, expected) => {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`)
}

test('기본 4구종의 물리는 유지되고 확장 구종은 별도 투구 목록에 추가된다', () => {
  const originalIds = BASEBALL_PITCH_TYPES.map(profile => profile.id)
  assert.deepEqual(originalIds, ['four-seam', 'slider', 'curveball', 'changeup'])
  assert.deepEqual(BASEBALL_PRACTICE_PITCH_TYPES.map(profile => profile.id), [...originalIds, ...newTypes])
  for (const pitchType of originalIds) {
    const speedKmh = getBaseballPitchSpeed(120, pitchType)
    const settings = { pitchType, seed: 17, target: center, pitcherHandedness: 'left' }
    assert.equal(getBaseballPracticePitchSpeed(120, pitchType), speedKmh)
    const original = createBaseballPitch({ ...settings, speedKmh })
    const practice = createBaseballPracticePitch({ ...settings, baseSpeedKmh: 120 })
    assert.deepEqual(practice, original)
    assert.equal(getBaseballPracticePitchType(practice), pitchType)
    assert.equal(isBaseballExtendedPracticePitchType(pitchType), false)
  }
  for (const pitchType of newTypes) {
    assert.throws(() => createBaseballPitch({ pitchType }), /Unknown baseball pitch/)
    for (const baseSpeedKmh of [79, 161]) {
      assert.throws(() => createBaseballPracticePitch({ pitchType, baseSpeedKmh }), RangeError)
    }
  }
})

test('새 구종은 기준 구속의 양끝과 좌우투에서 같은 타격면 좌표에 도착한다', () => {
  const targets = [center, ...[-1.25, 1.25].flatMap(x => [0.1, 2].map(y => ({ x, y })))]
  assert.deepEqual(newTypes.map(type => getBaseballPracticePitchSpeed(120, type)), [101, 103, 115, 113])
  for (const pitchType of newTypes) {
    assert.equal(isBaseballExtendedPracticePitchType(pitchType), true)
    for (const baseSpeedKmh of [80, 120, 160]) {
      for (const pitcherHandedness of ['left', 'right']) {
        for (const target of targets) {
          const settings = { pitcherHandedness, target, seed: 17 }
          const pitch = createBaseballPracticePitch({ ...settings, pitchType, baseSpeedKmh })
          const fastball = createBaseballPitch({ ...settings, speedKmh: baseSpeedKmh })
          assert.equal(getBaseballPracticePitchType(pitch), pitchType)
          assert.deepEqual(pitch.release, fastball.release)
          assert.deepEqual(pitch.target, fastball.target)
          near(sampleBaseballPitch(pitch, 0).speedKmh, getBaseballPracticePitchSpeed(baseSpeedKmh, pitchType))
          const passage = sampleBaseballPlatePassage(pitch)
          near(passage.point.x, target.x)
          near(passage.point.y, target.y)
          near(passage.timeMs, pitch.flightTimeMs)
          assert.equal(passage.point.z, 0)
          assert.equal(judgeBaseballTake(pitch).outcome, target === center ? 'called-strike' : 'ball')
        }
      }
    }
  }
})

test('가운데를 향하는 확장 구종의 변화량이 구별되고 좌우투 궤적과 접촉 판정이 대칭이다', () => {
  const pitchFor = (pitchType, pitcherHandedness = 'right') =>
    createBaseballPracticePitch({ pitchType, target: center, pitcherHandedness })
  const distanceFromChord = (pitch, axis) => {
    const middle = sampleBaseballPitch(pitch, pitch.flightTimeMs / 2)
    const fraction = middle.z / pitch.release.z
    return Math.abs(middle[axis] - (pitch.release[axis] * fraction + pitch.target[axis] * (1 - fraction)))
  }
  const prePlate = pitch => sampleBaseballPitch(pitch, pitch.flightTimeMs - 50)
  const finalDrop = pitch => prePlate(pitch).y - pitch.target.y
  const fastball = pitchFor('four-seam')
  const slider = pitchFor('slider')
  const changeup = pitchFor('changeup')
  const sweeper = pitchFor('sweeper')
  const splitter = pitchFor('splitter')
  const sinker = pitchFor('sinker')
  const cutter = pitchFor('cutter')

  assert.ok(distanceFromChord(sweeper, 'x') > distanceFromChord(slider, 'x') + 0.1)
  assert.ok(finalDrop(splitter) > finalDrop(changeup) + 0.03)
  // For a right-hander, the arm side is negative x and the glove side is positive x.
  assert.ok(sinker.flightTimeMs < changeup.flightTimeMs)
  assert.ok(prePlate(sinker).x - sinker.target.x > prePlate(changeup).x - changeup.target.x + 0.01)
  assert.ok(finalDrop(sinker) > finalDrop(fastball) + 0.03)
  assert.ok(finalDrop(sinker) < finalDrop(splitter))
  assert.ok(cutter.flightTimeMs < slider.flightTimeMs)
  assert.ok(prePlate(cutter).x < prePlate(fastball).x)
  assert.ok(distanceFromChord(cutter, 'x') > 0.05)
  assert.ok(distanceFromChord(cutter, 'x') < distanceFromChord(slider, 'x') - 0.03)
  for (const pitchType of newTypes) {
    const right = pitchFor(pitchType)
    const left = pitchFor(pitchType, 'left')
    near(right.flightTimeMs, left.flightTimeMs)
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const time = right.flightTimeMs * fraction
      const first = sampleBaseballPitch(right, time)
      const second = sampleBaseballPitch(left, time)
      near(first.x, -second.x)
      near(first.y, second.y)
      near(first.z, second.z)
    }
    for (const pitch of [right, left]) {
      const result = judgeBaseballSwing(pitch, {
        swingAtMs: pitch.flightTimeMs - BASEBALL_RULES.swingContactMs, aim: center,
      })
      assert.equal(result.contacted, true)
      near(result.contactPoint.x, center.x)
      near(result.contactPoint.y, center.y)
    }
  }
  assert.equal(BASEBALL_RULES.ballRadiusM * 2, 0.08)
})
