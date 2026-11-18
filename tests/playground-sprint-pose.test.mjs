import test from 'node:test'
import assert from 'node:assert/strict'
import { getSprintPose, sampleSprintLeg, solveForwardKnee, SPRINT_POSE } from '../lib/playground-sprint-pose.mjs'

const length = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

test('the knee stays on the forward bend branch throughout a stride', () => {
  for (let step = 0; step < 720; step += 1) {
    const { hip, knee, ankle } = sampleSprintLeg(step / 720)
    const bend = (knee[0] - hip[0]) * (ankle[1] - hip[1]) - (knee[1] - hip[1]) * (ankle[0] - hip[0])
    assert.ok(bend > 0, `reverse bend at phase ${step / 720}`)
  }
})

test('both legs keep their anatomical segment lengths across a complete run cycle', () => {
  for (let step = 0; step < 720; step += 1) {
    const pose = getSprintPose({ status: 'running', speed: 10, distance: step / 720 * SPRINT_POSE.cycleDistance })
    for (const leg of Object.values(pose.legs)) {
      assert.ok(Math.abs(length(leg.hip, leg.knee) - SPRINT_POSE.thighLength) < 1e-8)
      assert.ok(Math.abs(length(leg.knee, leg.ankle) - SPRINT_POSE.shinLength) < 1e-8)
    }
    for (const arm of Object.values(pose.arms)) {
      assert.ok(Math.abs(length(arm.shoulder, arm.elbow) - SPRINT_POSE.upperArmLength) < 1e-8)
      assert.ok(Math.abs(length(arm.elbow, arm.wrist) - SPRINT_POSE.forearmLength) < 1e-8)
    }
  }
})

test('ground contact pushes from in front of the hip toward the rear before heel recovery', () => {
  const touchdown = sampleSprintLeg(0)
  const midStance = sampleSprintLeg(.2)
  const takeoff = sampleSprintLeg(.4)
  const recovered = sampleSprintLeg(.7)
  assert.ok(touchdown.ankle[0] > midStance.ankle[0])
  assert.ok(midStance.ankle[0] > takeoff.ankle[0])
  assert.equal(touchdown.ankle[1], -2)
  assert.equal(midStance.ankle[1], -2)
  assert.ok(recovered.ankle[1] < -30)
  assert.ok(recovered.knee[0] > recovered.hip[0])
})

test('takeoff and the cycle seam have continuous ankle and knee positions', () => {
  for (const boundary of [.4, 1]) {
    const before = sampleSprintLeg(boundary - 1e-7)
    const after = sampleSprintLeg(boundary + 1e-7)
    assert.ok(length(before.ankle, after.ankle) < .0001)
    assert.ok(length(before.knee, after.knee) < .0001)
  }
})

test('the matching arm travels backward when a leg lands forward', () => {
  const pose = getSprintPose({ status: 'running', speed: 8, distance: 0 })
  assert.ok(pose.legs.near.ankle[0] > pose.legs.near.hip[0])
  assert.ok(pose.arms.near.elbow[0] < pose.arms.near.shoulder[0])
  assert.ok(pose.arms.far.elbow[0] > pose.arms.far.shoulder[0])
  assert.equal(pose.legs.far.phase, .5)
})

test('unreachable targets are clamped without stretching bones or producing NaN', () => {
  for (const target of [[0, 1000], [0, 0]]) {
    const { hip, knee, ankle } = solveForwardKnee([0, 0], target)
    assert.ok([...hip, ...knee, ...ankle].every(Number.isFinite))
    assert.ok(Math.abs(length(hip, knee) - SPRINT_POSE.thighLength) < 1e-7)
    assert.ok(Math.abs(length(knee, ankle) - SPRINT_POSE.shinLength) < 1e-7)
  }
})

test('a finished runner raises both wrists above the head for the victory pose', () => {
  const race = Object.freeze({ status: 'finished', speed: 0, distance: 100, elapsedMs: 12345 })
  const pose = getSprintPose(race, { elapsedMs: 1000, durationMs: 2400 })
  assert.equal(pose.celebrating, true)
  assert.equal(pose.celebrationProgress, 1)
  for (const arm of Object.values(pose.arms)) {
    assert.ok(arm.wrist[1] < -107, 'the raised hand should pass above the head')
    assert.ok(arm.elbow[1] < arm.shoulder[1])
  }
  assert.equal(race.distance, 100)
  assert.equal(race.elapsedMs, 12345)
})

test('celebration keeps limb lengths fixed and lands without putting the feet below the ground', () => {
  const race = { status: 'finished', speed: 0, distance: 100 }
  let highestJump = 0
  for (let elapsedMs = 0; elapsedMs < 2400; elapsedMs += 13) {
    const pose = getSprintPose(race, { elapsedMs, durationMs: 2400 })
    highestJump = Math.max(highestJump, pose.jump)
    for (const leg of Object.values(pose.legs)) {
      assert.ok(Math.abs(length(leg.hip, leg.knee) - SPRINT_POSE.thighLength) < 1e-8)
      assert.ok(Math.abs(length(leg.knee, leg.ankle) - SPRINT_POSE.shinLength) < 1e-8)
      assert.ok(leg.ankle[1] - pose.jump <= -2 + 1e-8)
    }
    for (const arm of Object.values(pose.arms)) {
      assert.ok(Math.abs(length(arm.shoulder, arm.elbow) - SPRINT_POSE.upperArmLength) < 1e-8)
      assert.ok(Math.abs(length(arm.elbow, arm.wrist) - SPRINT_POSE.forearmLength) < 1e-8)
    }
  }
  assert.ok(highestJump > 9)
  assert.equal(getSprintPose(race, { elapsedMs: 0, durationMs: 2400 }).jump, 0)
  assert.equal(getSprintPose(race, { elapsedMs: 2400, durationMs: 2400 }).jump, 0)
})

test('invalid or completed celebrations and celebrations during a run leave the original pose unchanged', () => {
  const finished = { status: 'finished', speed: 0, distance: 100 }
  const running = { status: 'running', speed: 10, distance: 50 }
  for (const celebration of [{ elapsedMs: -1, durationMs: 2400 }, { elapsedMs: 2400, durationMs: 2400 }, { elapsedMs: 400, durationMs: 0 }, { elapsedMs: NaN, durationMs: 2400 }]) {
    assert.deepEqual(getSprintPose(finished, celebration), getSprintPose(finished))
  }
  assert.deepEqual(getSprintPose(running, { elapsedMs: 1000, durationMs: 2400 }), getSprintPose(running))
})
