import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPRINT_RULES,
  createSprintRace,
  startSprintRace,
  advanceSprintRace,
  applySprintStride,
  applySprintCheer,
  interruptSprintRace,
  formatSprintTime,
} from '../lib/playground-sprint.mjs'
import { SPRINT_RULE_VERSION, LEGACY_SPRINT_RULE_VERSION } from '../lib/playground-sprint-rules.mjs'

function near(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`)
}

test('게임 표시와 TOP10의 0.01초 반올림 경계가 일치한다', () => {
  assert.equal(formatSprintTime(0), '0.00')
  assert.equal(formatSprintTime(1004.99), '1.00')
  assert.equal(formatSprintTime(1005), '1.01')
  assert.equal(formatSprintTime(9555), '9.56')
})

test('출발 신호 전 입력은 추진력이 되지 않고 신호 시각부터 시간이 흐른다', () => {
  const race = startSprintRace(100)
  const gunAt = 100 + SPRINT_RULES.countdownMs
  assert.equal(race.status, 'countdown')
  assert.equal(race.startedAt, gunAt)
  const early = applySprintStride(race, 'left', gunAt - 1)
  assert.equal(early.status, 'countdown')
  assert.equal(early.steps, 0)
  assert.equal(early.lastFoot, null)
  const atGun = advanceSprintRace(early, gunAt)
  assert.equal(atGun.status, 'running')
  assert.equal(atGun.elapsedMs, 0)
  const reaction = applySprintStride(atGun, 'left', gunAt + 150)
  assert.equal(reaction.elapsedMs, 150)
  assert.equal(reaction.steps, 1)
  assert.equal(reaction.speed, SPRINT_RULES.strideImpulse)
})

test('첫 유효 발 시각은 출발 자세 표시용으로 한 번만 고정하고 경기 시각과 별개로 유지한다', () => {
  const origin = 123.5
  const gunAt = origin + SPRINT_RULES.countdownMs
  let race = startSprintRace(origin)
  assert.equal(race.firstStrideAt, null)
  for (const offset of [0, 999, 1000, SPRINT_RULES.countdownMs - 1]) {
    race = applySprintStride(race, 'left', origin + offset)
    assert.equal(race.firstStrideAt, null)
    assert.equal(race.steps, 0)
    assert.equal(race.distance, 0)
    assert.equal(race.elapsedMs, 0)
  }
  race = advanceSprintRace(race, gunAt + 500)
  assert.equal(race.firstStrideAt, null)
  assert.equal(race.elapsedMs, 500)
  race = applySprintStride(race, 'left', gunAt + 500)
  assert.equal(race.firstStrideAt, gunAt + 500)
  assert.equal(race.startedAt, gunAt)
  race = applySprintStride(race, 'left', gunAt + 600)
  race = applySprintStride(race, 'right', gunAt + 700)
  assert.equal(race.firstStrideAt, gunAt + 500)
  assert.equal(race.steps, 2)
  assert.equal(race.elapsedMs, 700)
  assert.equal(applySprintStride(startSprintRace(origin), 'left', gunAt).firstStrideAt, gunAt)
})

test('새 교대 발에만 추진력을 주고 같은 발 반복은 감속한 상태를 유지한다', () => {
  const gunAt = SPRINT_RULES.countdownMs
  const first = applySprintStride(startSprintRace(0), 'left', gunAt)
  const repeated = applySprintStride(first, 'left', gunAt + 100)
  assert.equal(repeated.steps, 1)
  assert.equal(repeated.lastFoot, 'left')
  near(repeated.speed, SPRINT_RULES.strideImpulse * Math.exp(-SPRINT_RULES.drag * 0.1))
  const alternate = applySprintStride(repeated, 'right', gunAt + 200)
  assert.equal(alternate.steps, 2)
  assert.equal(alternate.lastFoot, 'right')
  near(alternate.speed, repeated.speed * Math.exp(-SPRINT_RULES.drag * 0.1) + SPRINT_RULES.strideImpulse)
  let capped = alternate
  for (let index = 0; index < 30; index += 1) capped = applySprintStride(capped, index % 2 ? 'right' : 'left', gunAt + 201 + index)
  assert.equal(capped.speed, SPRINT_RULES.maxSpeed)
})

test('입력을 멈춘 뒤 자연 감속하며 프레임을 나눠도 거리와 속도가 같다', () => {
  const gunAt = SPRINT_RULES.countdownMs
  const start = applySprintStride(startSprintRace(0), 'left', gunAt)
  const oneFrame = advanceSprintRace(start, gunAt + 1500)
  let manyFrames = start
  for (let at = gunAt + 10; at <= gunAt + 1500; at += 10) manyFrames = advanceSprintRace(manyFrames, at)
  near(manyFrames.distance, oneFrame.distance)
  near(manyFrames.speed, oneFrame.speed)
  assert.equal(oneFrame.elapsedMs, 1500)
  assert.ok(oneFrame.speed < start.speed)
  const almostStopped = advanceSprintRace(start, 100000)
  assert.ok(almostStopped.distance < SPRINT_RULES.strideImpulse / SPRINT_RULES.drag + 1e-8)
})

test('피니시 선 통과를 프레임 안에서 보간하고 종료 후 입력은 기록을 바꾸지 않는다', () => {
  const at99m = {
    ...advanceSprintRace(startSprintRace(0), SPRINT_RULES.countdownMs + 8000),
    distance: 99,
    speed: 10,
  }
  const finish = advanceSprintRace(at99m, SPRINT_RULES.countdownMs + 9000)
  const crossingMs = -Math.log1p(-SPRINT_RULES.drag / 10) / SPRINT_RULES.drag * 1000
  assert.equal(finish.status, 'finished')
  assert.equal(finish.distance, 100)
  near(finish.finishTimeMs, 8000 + crossingMs)
  assert.equal(finish.elapsedMs, finish.finishTimeMs)
  assert.strictEqual(advanceSprintRace(finish, 20000), finish)
  assert.strictEqual(applySprintStride(finish, 'right', 20000), finish)
  assert.strictEqual(interruptSprintRace(finish, 20000), finish)
})

test('동일한 교대 입력이면 화면 갱신 빈도에 관계없이 100m 기록이 같다', () => {
  function complete(extraFrames) {
    let race = startSprintRace(0)
    for (let step = 0; step < 300 && race.status !== 'finished'; step += 1) {
      const at = SPRINT_RULES.countdownMs + step * 160
      if (extraFrames && step > 0) {
        for (let offset = 10; offset < 160; offset += 10) race = advanceSprintRace(race, at - 160 + offset)
      }
      race = applySprintStride(race, step % 2 ? 'right' : 'left', at)
    }
    assert.equal(race.status, 'finished')
    return race
  }
  const lowFps = complete(false)
  const highFps = complete(true)
  near(lowFps.finishTimeMs, highFps.finishTimeMs)
  assert.equal(lowFps.steps, highFps.steps)
})

test('감속의 이론상 최대 거리만 결승선에 닿는 경우 무한 기록을 만들지 않는다', () => {
  const approach = {
    ...advanceSprintRace(startSprintRace(0), SPRINT_RULES.countdownMs),
    distance: 99,
    speed: SPRINT_RULES.drag,
  }
  const later = advanceSprintRace(approach, 1000000)
  assert.equal(later.status, 'running')
  assert.equal(later.finishTimeMs, null)
  assert.ok(later.distance < 100)
  assert.ok(Number.isFinite(later.elapsedMs))
})

test('중단은 진행 중인 경기만 멈추며 재시작은 별도의 깨끗한 상태를 만든다', () => {
  const idle = createSprintRace()
  assert.strictEqual(interruptSprintRace(idle, 100), idle)
  const countdown = interruptSprintRace(startSprintRace(0), SPRINT_RULES.countdownMs / 2)
  assert.equal(countdown.status, 'interrupted')
  const running = applySprintStride(startSprintRace(0), 'left', SPRINT_RULES.countdownMs)
  const interrupted = interruptSprintRace(running, SPRINT_RULES.countdownMs + 500)
  assert.equal(interrupted.status, 'interrupted')
  assert.equal(interrupted.speed, 0)
  assert.strictEqual(advanceSprintRace(interrupted, 10000), interrupted)
  assert.strictEqual(applySprintStride(interrupted, 'right', 10000), interrupted)
  const restart = startSprintRace(10000)
  assert.equal(restart.distance, 0)
  assert.equal(restart.steps, 0)
  assert.equal(restart.finishTimeMs, null)
})

test('역행·비정상 시각과 알 수 없는 발을 무시하고 입력 객체를 변경하지 않는다', () => {
  const start = Object.freeze(startSprintRace(10))
  const gunAt = 10 + SPRINT_RULES.countdownMs
  const running = Object.freeze(applySprintStride(start, 'left', gunAt))
  for (const badTime of [-1, Number.NaN, Infinity, undefined, gunAt - 1]) {
    assert.strictEqual(advanceSprintRace(running, badTime), running)
    assert.strictEqual(applySprintStride(running, 'right', badTime), running)
    assert.strictEqual(interruptSprintRace(running, badTime), running)
  }
  assert.strictEqual(applySprintStride(running, 'up', gunAt + 1000), running)
  advanceSprintRace(running, gunAt + 1000)
  assert.equal(running.distance, 0)
  assert.equal(running.speed, SPRINT_RULES.strideImpulse)
  assert.equal(start.steps, 0)
  assert.equal(start.status, 'countdown')
  assert.equal(startSprintRace(Number.NaN).status, 'idle')
})

test('기록 표시는 초 단위 두 자리 소수이며 비정상 값은 0으로 처리한다', () => {
  assert.equal(formatSprintTime(0), '0.00')
  assert.equal(formatSprintTime(12345), '12.35')
  assert.equal(formatSprintTime(99999), '100.00')
  for (const value of [-1, null, undefined, Infinity, Number.NaN]) assert.equal(formatSprintTime(value), '0.00')
})

test('새 경기는 v2이며 기존 v1을 명시하면 이전 규칙으로 유지한다', () => {
  for (const ruleVersion of [SPRINT_RULE_VERSION, LEGACY_SPRINT_RULE_VERSION]) {
    const race = startSprintRace(100, ruleVersion)
    assert.equal(race.ruleVersion, ruleVersion)
    assert.equal(race.lastStrideAt, null)
    assert.equal(race.lastCheerAt, null)
    assert.equal(race.cheers, 0)
  }
  assert.equal(createSprintRace().ruleVersion, 'sprint-v2')
  assert.equal(startSprintRace(0).ruleVersion, 'sprint-v2')
  for (const value of ['sprint-v3', null, 1, '']) {
    assert.throws(() => createSprintRace(value), RangeError)
    assert.throws(() => startSprintRace(0, value), RangeError)
  }
})

test('응원은 실제 교대 입력 뒤에만 제한된 추진력을 주며 발·걸음·출발 시각은 바꾸지 않는다', () => {
  const gunAt = SPRINT_RULES.countdownMs
  let race = startSprintRace(0)
  assert.equal(applySprintCheer(race, gunAt - 1).cheers, 0)
  assert.equal(applySprintCheer(race, gunAt).speed, 0)
  race = applySprintStride(race, 'left', gunAt)
  assert.equal(applySprintCheer(race, gunAt).cheers, 0)
  race = applySprintStride(race, 'right', gunAt + 100)
  const before = Object.freeze(race)
  const boosted = applySprintCheer(before, gunAt + 100)
  near(boosted.speed, before.speed + SPRINT_RULES.cheerImpulse)
  assert.equal(boosted.cheers, 1)
  assert.equal(boosted.lastCheerAt, gunAt + 100)
  for (const key of ['steps', 'lastFoot', 'lastStrideAt', 'firstStrideAt', 'startedAt', 'distance']) {
    assert.equal(boosted[key], before[key])
  }
  assert.equal(before.cheers, 0)
})

test('응원 제한은 350ms이며 수락하지 않은 입력은 제한 시각을 연장하지 않는다', () => {
  const gunAt = SPRINT_RULES.countdownMs
  let race = applySprintStride(startSprintRace(0), 'left', gunAt)
  race = applySprintStride(race, 'right', gunAt + 100)
  race = applySprintCheer(race, gunAt + 100)
  const limited = applySprintCheer(race, gunAt + 449)
  const advanced = advanceSprintRace(race, gunAt + 449)
  assert.deepEqual(limited, advanced)
  assert.equal(limited.lastCheerAt, gunAt + 100)
  const accepted = applySprintCheer(limited, gunAt + 450)
  assert.equal(accepted.cheers, 2)
  assert.equal(accepted.lastCheerAt, gunAt + 450)
  near(accepted.speed, advanceSprintRace(limited, gunAt + 450).speed + SPRINT_RULES.cheerImpulse)
})

test('응원은 최근 500ms의 유효 발을 요구하며 RAF 갱신·같은 발 반복으로 연장되지 않는다', () => {
  const gunAt = SPRINT_RULES.countdownMs
  let race = applySprintStride(startSprintRace(0), 'left', gunAt)
  race = applySprintStride(race, 'right', gunAt + 100)
  const atBoundary = applySprintCheer(race, gunAt + 600)
  assert.equal(atBoundary.cheers, 1)
  race = advanceSprintRace(race, gunAt + 500)
  race = applySprintStride(race, 'right', gunAt + 600)
  assert.equal(race.lastStrideAt, gunAt + 100)
  const expired = applySprintCheer(race, gunAt + 601)
  assert.deepEqual(expired, advanceSprintRace(race, gunAt + 601))
  assert.equal(expired.cheers, 0)
})

test('속도 상한에서 효과 없는 응원은 기록하지 않고 상한을 넘기지 않는다', () => {
  const gunAt = SPRINT_RULES.countdownMs
  let race = startSprintRace(0)
  for (let index = 0; index < 8; index++) race = applySprintStride(race, index % 2 ? 'right' : 'left', gunAt)
  assert.equal(race.speed, SPRINT_RULES.maxSpeed)
  const capped = applySprintCheer(race, gunAt)
  assert.equal(capped.speed, SPRINT_RULES.maxSpeed)
  assert.equal(capped.cheers, 0)
  assert.equal(capped.lastCheerAt, null)
  const allowed = applySprintCheer(capped, gunAt + 1)
  assert.equal(allowed.cheers, 1)
  assert.equal(allowed.speed, SPRINT_RULES.maxSpeed)
})

test('응원만으로 출발하거나 발 입력을 멈춘 뒤 완주할 수 없다', () => {
  const gunAt = SPRINT_RULES.countdownMs
  let idleFeet = startSprintRace(0)
  let stoppedFeet = applySprintStride(startSprintRace(0), 'left', gunAt)
  stoppedFeet = applySprintStride(stoppedFeet, 'right', gunAt + 100)
  for (let at = gunAt + 100; at < gunAt + 120000; at += 350) {
    idleFeet = applySprintCheer(idleFeet, at)
    stoppedFeet = applySprintCheer(stoppedFeet, at)
  }
  assert.equal(idleFeet.distance, 0)
  assert.equal(idleFeet.cheers, 0)
  assert.equal(stoppedFeet.status, 'running')
  assert.ok(stoppedFeet.distance < 10)
  assert.ok(stoppedFeet.cheers <= 2)
})

test('v1·중단·완료·비정상 시각에는 응원이 새 추진력을 주지 않는다', () => {
  const gunAt = SPRINT_RULES.countdownMs
  let legacy = applySprintStride(startSprintRace(0, LEGACY_SPRINT_RULE_VERSION), 'left', gunAt)
  legacy = applySprintStride(legacy, 'right', gunAt + 100)
  assert.deepEqual(applySprintCheer(legacy, gunAt + 101), advanceSprintRace(legacy, gunAt + 101))
  const race = Object.freeze(applySprintStride(startSprintRace(0), 'left', gunAt))
  for (const nowMs of [-1, Number.NaN, Infinity, undefined, gunAt - 1]) {
    assert.strictEqual(applySprintCheer(race, nowMs), race)
  }
  const interrupted = interruptSprintRace(race, gunAt + 100)
  assert.strictEqual(applySprintCheer(interrupted, gunAt + 200), interrupted)
  const finished = advanceSprintRace({ ...race, distance: 99, speed: 10 }, gunAt + 1000)
  assert.equal(finished.status, 'finished')
  assert.strictEqual(applySprintCheer(finished, gunAt + 2000), finished)
})

test('응원을 섞은 경기도 화면 갱신 간격과 무관하게 같은 가속·완주 기록을 만든다', () => {
  function complete({ cheer = false, extraFrames = false, ruleVersion = SPRINT_RULE_VERSION } = {}) {
    let race = startSprintRace(0, ruleVersion)
    for (let index = 0; index < 700 && race.status !== 'finished'; index++) {
      const at = SPRINT_RULES.countdownMs + index * 175
      if (extraFrames && index > 0) {
        for (let offset = 10; offset < 175; offset += 10) race = advanceSprintRace(race, at - 175 + offset)
      }
      race = applySprintStride(race, index % 2 ? 'right' : 'left', at)
      if (cheer && index % 2 === 0) race = applySprintCheer(race, at)
    }
    assert.equal(race.status, 'finished')
    return race
  }
  const baseline = complete()
  const legacy = complete({ ruleVersion: LEGACY_SPRINT_RULE_VERSION })
  const boosted = complete({ cheer: true })
  const highFps = complete({ cheer: true, extraFrames: true })
  assert.equal(legacy.finishTimeMs, 9584.846622489975)
  assert.equal(baseline.finishTimeMs, legacy.finishTimeMs)
  const improvementMs = baseline.finishTimeMs - boosted.finishTimeMs
  assert.ok(improvementMs > 100 && improvementMs < 250)
  assert.ok(boosted.cheers > 0)
  near(boosted.finishTimeMs, highFps.finishTimeMs)
  assert.equal(boosted.cheers, highFps.cheers)
  assert.equal(boosted.steps, highFps.steps)
})
