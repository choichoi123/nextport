import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPRINT_SECRET_TAP_COUNT,
  SPRINT_SECRET_WINDOW_MS,
  recordSprintSecretTap,
  isSprintVoltCommand,
  isSprintVoltCommandPrefix,
  shouldConsumeSprintSecretCall,
} from '../lib/playground-sprint-secret.mjs'
import { SPRINT_RULES, createSprintRace, startSprintRace, advanceSprintRace, applySprintStride, interruptSprintRace } from '../lib/playground-sprint.mjs'

test('five discrete taps within three seconds activate once and clear the tap sequence', () => {
  assert.equal(SPRINT_SECRET_TAP_COUNT, 5)
  assert.equal(SPRINT_SECRET_WINDOW_MS, 3000)
  let taps = []
  for (const [index, at] of [0, 500, 1000, 1500, 2000].entries()) {
    const result = recordSprintSecretTap(taps, at)
    assert.equal(result.activated, index === 4)
    taps = result.taps
  }
  assert.deepEqual(taps, [])
  assert.deepEqual(recordSprintSecretTap(taps, 2100), { taps: [2100], activated: false })
})

test('the inclusive three-second edge activates but one millisecond beyond it does not', () => {
  assert.deepEqual(recordSprintSecretTap([0, 500, 1000, 1500], 3000), { taps: [], activated: true })
  assert.deepEqual(recordSprintSecretTap([0, 500, 1000, 1500], 3001), { taps: [500, 1000, 1500, 3001], activated: false })
})

test('a sliding window expires only old taps rather than restarting the whole sequence', () => {
  const first = recordSprintSecretTap([0, 1800, 2200, 2600], 3100)
  assert.deepEqual(first, { taps: [1800, 2200, 2600, 3100], activated: false })
  assert.deepEqual(recordSprintSecretTap(first.taps, 3200), { taps: [], activated: true })
})

test('malformed clocks and previous samples never create a false activation', () => {
  for (const now of [undefined, null, '3000', -1, NaN, Infinity, -Infinity]) {
    assert.deepEqual(recordSprintSecretTap([0, 100, 200, 300], now), { taps: [], activated: false })
  }
  assert.deepEqual(recordSprintSecretTap([NaN, Infinity, -1, '100', null, 4000, 0, 500], 3500), { taps: [500, 3500], activated: false })
  for (const previous of [undefined, null, {}, '0,100,200,300']) {
    assert.deepEqual(recordSprintSecretTap(previous, 400), { taps: [400], activated: false })
  }
  assert.deepEqual(recordSprintSecretTap([1000, 1100, 1200, 1300], 100), { taps: [100], activated: false })
})

test('tap sampling preserves caller-owned history and allows equal timer-resolution timestamps', () => {
  const taps = Object.freeze([1000, 1000, 1000, 1000])
  assert.deepEqual(recordSprintSecretTap(taps, 1000), { taps: [], activated: true })
  assert.deepEqual(taps, [1000, 1000, 1000, 1000])
  const incomplete = recordSprintSecretTap(Object.freeze([100]), 200)
  incomplete.taps.push(300)
  assert.deepEqual(recordSprintSecretTap([100], 200), { taps: [100, 200], activated: false })
})

test('only the exact trimmed case-insensitive slash command activates the nickname path', () => {
  for (const name of ['/volt', '/VOLT', '  /Volt  ', '\t/volt\n']) assert.equal(isSprintVoltCommand(name), true)
  for (const name of ['', 'volt', '/', '/vol', '/volts', '/volt now', 'runner/volt', '/ volt', '/vol t', undefined, null, {}, 42]) {
    assert.equal(isSprintVoltCommand(name), false)
  }
})

test('command prefixes reserve only the typing sequence and never erase a normal nickname', () => {
  for (const name of ['/', '/v', '/vo', '/vol', '/volt', ' /VO ']) assert.equal(isSprintVoltCommandPrefix(name), true)
  for (const name of ['', ' ', 'V', 'Volt', '/voltage', '/runner', 'Jihoon', '최지훈', undefined, null, {}, 42]) {
    assert.equal(isSprintVoltCommandPrefix(name), false)
  }
})

test('a real countdown cancellation preserves the call until the exact GO boundary', () => {
  const countdown = startSprintRace(1000)
  const gunAt = 1000 + SPRINT_RULES.countdownMs
  assert.equal(countdown.startedAt, gunAt)
  assert.equal(shouldConsumeSprintSecretCall(countdown, 'competition', true), false)
  const beforeGun = interruptSprintRace(countdown, gunAt - 1)
  assert.equal(beforeGun.status, 'interrupted')
  assert.equal(beforeGun.updatedAt, gunAt - 1)
  assert.equal(shouldConsumeSprintSecretCall(beforeGun, 'competition', true), false)
  const atGun = interruptSprintRace(countdown, gunAt)
  assert.equal(atGun.status, 'interrupted')
  assert.equal(atGun.updatedAt, gunAt)
  assert.equal(shouldConsumeSprintSecretCall(atGun, 'competition', true), true)
  assert.equal(shouldConsumeSprintSecretCall(interruptSprintRace(countdown, gunAt + 100), 'competition', true), true)
})

test('normal running and completed engine states consume a used competition call', () => {
  const gunAt = 1000 + SPRINT_RULES.countdownMs
  let race = advanceSprintRace(startSprintRace(1000), gunAt)
  assert.equal(race.status, 'running')
  assert.equal(shouldConsumeSprintSecretCall(race, 'competition', true), true)
  for (let at = gunAt, stride = 0; at < gunAt + 26000 && race.status !== 'finished'; at += 50, stride += 1) {
    race = applySprintStride(race, stride % 2 ? 'right' : 'left', at)
  }
  assert.equal(race.status, 'finished')
  assert.equal(shouldConsumeSprintSecretCall(race, 'competition', true), true)
  // Clearing usedSecret after the first committed GO makes later frames inert.
  assert.equal(shouldConsumeSprintSecretCall(race, 'competition', false), false)
})

test('solo, unused calls and invalid/preparation states never consume the queued call', () => {
  const running = advanceSprintRace(startSprintRace(1000), 1000 + SPRINT_RULES.countdownMs)
  for (const mode of ['solo', undefined, null, '', 'COMPETITION']) {
    assert.equal(shouldConsumeSprintSecretCall(running, mode, true), false)
  }
  for (const used of [false, undefined, null, 0, 1, 'true']) {
    assert.equal(shouldConsumeSprintSecretCall(running, 'competition', used), false)
  }
  for (const race of [undefined, null, {}, createSprintRace(), startSprintRace(1000), { status: 'unknown' }]) {
    assert.equal(shouldConsumeSprintSecretCall(race, 'competition', true), false)
  }
})

test('an interrupted race requires finite gun and update times to consume a call', () => {
  const gunAt = SPRINT_RULES.countdownMs
  const before = Object.freeze({ status: 'interrupted', startedAt: gunAt, updatedAt: gunAt - 1 })
  assert.equal(shouldConsumeSprintSecretCall(before, 'competition', true), false)
  for (const invalid of [undefined, null, NaN, Infinity, -Infinity, String(gunAt)]) {
    assert.equal(shouldConsumeSprintSecretCall({ ...before, startedAt: invalid, updatedAt: gunAt + 1000 }, 'competition', true), false)
    assert.equal(shouldConsumeSprintSecretCall({ ...before, updatedAt: invalid }, 'competition', true), false)
  }
  assert.deepEqual(before, { status: 'interrupted', startedAt: gunAt, updatedAt: gunAt - 1 })
})
