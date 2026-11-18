import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPRINT_RIVAL_VERSION,
  SPRINT_RACE_MODES,
  SPRINT_RIVALS,
  normalizeSprintRivalSeed,
  createSprintRivalSeed,
  isSprintRaceMode,
  getSprintRivalLane,
  getSprintRivals,
  getSprintCompetitionStanding,
} from '../lib/playground-sprint-rivals.mjs'
import { SPRINT_TRACK } from '../lib/playground-sprint-track.mjs'

const running = (elapsedMs, distance = 0) => ({ status: 'running', elapsedMs, distance })
const sample = (elapsedMs, distance = 0) => getSprintRivals(running(elapsedMs, distance), 'competition')

test('modes and fixed opponent identities are immutable and use separate lanes', () => {
  assert.equal(SPRINT_RIVAL_VERSION, 'ghost-v3')
  assert.ok(Object.isFrozen(SPRINT_RACE_MODES))
  assert.ok(Object.isFrozen(SPRINT_RIVALS))
  assert.deepEqual(SPRINT_RACE_MODES, ['solo', 'competition'])
  assert.deepEqual(SPRINT_RIVALS.map(rival => rival.lane), [0, 1, 3, 4, 5])
  assert.equal(new Set(SPRINT_RIVALS.map(rival => rival.id)).size, 5)
  assert.ok(SPRINT_RIVALS.every(rival => Object.isFrozen(rival) && rival.acceleration > 0 && rival.maxSpeed > 0))
  for (const mode of ['solo', 'competition']) assert.equal(isSprintRaceMode(mode), true)
  for (const mode of [undefined, null, '', 'COMPETITION', 'multiplayer', 0, {}]) assert.equal(isSprintRaceMode(mode), false)
})

test('solo and unknown modes do not create opponents or a cosmetic position', () => {
  for (const mode of [undefined, null, 'solo', 'unknown']) {
    assert.deepEqual(getSprintRivals(running(3000, 20), mode), [])
    assert.equal(getSprintCompetitionStanding(running(3000, 20), mode), null)
  }
})

test('side and top views place all six runners in distinct lanes without crossing the player lane', () => {
  const side = SPRINT_RIVALS.map(rival => getSprintRivalLane(rival.lane))
  const top = SPRINT_RIVALS.map(rival => getSprintRivalLane(rival.lane, 'top'))
  assert.deepEqual(side, [0, 1, 3, 4, 5])
  assert.deepEqual(top, [1, 2, 4, 5, 6])
  for (const [view, rivals] of [['side', side], ['top', top]]) {
    const layout = SPRINT_TRACK[view]
    assert.equal(new Set([...rivals, layout.activeLane]).size, 6)
    assert.ok(rivals.every(lane => Number.isInteger(lane) && lane >= 0 && lane < layout.lanes && lane !== layout.activeLane))
  }
  for (const lane of [undefined, null, '0', 2, -1, .5, 6, NaN, Infinity]) assert.equal(getSprintRivalLane(lane), null)
  for (const view of [null, '', 'unknown', 'toString', '__proto__']) assert.equal(getSprintRivalLane(0, view), null)
})

test('idle and countdown opponents wait at zero despite a stale elapsed clock', () => {
  for (const status of ['idle', 'countdown']) {
    const rivals = getSprintRivals({ status, elapsedMs: 90000, distance: 100 }, 'competition')
    assert.equal(rivals.length, 5)
    assert.ok(rivals.every(rival => rival.status === status && rival.distance === 0 && rival.speed === 0 && rival.elapsedMs === 0 && rival.finishTimeMs === null))
  }
})

test('rivals accelerate smoothly with monotonic bounded progress and exact capped finishes', () => {
  let previous = sample(0)
  assert.ok(previous.every(rival => rival.distance === 0 && rival.speed === 0))
  for (let elapsed = 25; elapsed <= 12000; elapsed += 25) {
    const rivals = sample(elapsed)
    for (const [index, rival] of rivals.entries()) {
      assert.ok(rival.distance >= previous[index].distance)
      assert.ok(rival.distance >= 0 && rival.distance <= 100)
      assert.ok(rival.speed >= 0 && rival.speed <= SPRINT_RIVALS[index].maxSpeed)
      if (rival.status === 'finished') {
        assert.equal(rival.distance, 100)
        assert.equal(rival.speed, 0)
        assert.equal(rival.elapsedMs, rival.finishTimeMs)
      }
    }
    previous = rivals
  }
  const finished = sample(12000)
  assert.ok(finished.every(rival => rival.status === 'finished'))
  for (let index = 1; index < finished.length; index += 1) assert.ok(finished[index - 1].finishTimeMs > finished[index].finishTimeMs)
  for (const [index, rival] of finished.entries()) {
    const before = sample(rival.finishTimeMs - .001)[index]
    const at = sample(rival.finishTimeMs)[index]
    assert.equal(before.status, 'running')
    assert.ok(before.distance < 100)
    assert.deepEqual(at, rival)
  }
})

test('player input, speed, steps, art and distance do not change the rival curves', () => {
  const first = Object.freeze({ ...running(5000, 20), speed: 0, steps: 1, art: 'realistic', lastFoot: 'left' })
  const second = Object.freeze({ ...running(5000, 80), speed: 12.2, steps: 120, art: 'pixel', lastFoot: 'right' })
  assert.deepEqual(getSprintRivals(first, 'competition'), getSprintRivals(second, 'competition'))
  assert.deepEqual(first, { ...running(5000, 20), speed: 0, steps: 1, art: 'realistic', lastFoot: 'left' })
})

test('replay seeks are deterministic, return fresh snapshots and never mutate the race', () => {
  const times = [0, 300, 1500, 5000, 9300, 10000]
  const saved = new Map(times.map(time => [time, sample(time)]))
  for (const time of [10000, 1500, 0, 9300, 5000, 300, 1500]) assert.deepEqual(sample(time), saved.get(time))
  const race = Object.freeze(running(5000, 49))
  const rivals = getSprintRivals(race, 'competition')
  rivals[0].distance = 99
  assert.deepEqual(getSprintRivals(race, 'competition'), saved.get(5000))
  assert.deepEqual(race, running(5000, 49))
})

test('finish and interruption freeze opponents at the same race instant', () => {
  const finish = Object.freeze({ status: 'finished', distance: 100, elapsedMs: 9500, finishTimeMs: 9500 })
  assert.deepEqual(getSprintRivals(finish, 'competition'), sample(9500))
  // A later presentation clock must not advance opponents after the crossing.
  assert.deepEqual(getSprintRivals({ ...finish, elapsedMs: 99000 }, 'competition'), sample(9500))
  const interrupted = getSprintRivals({ status: 'interrupted', elapsedMs: 5000 }, 'competition')
  for (const [index, rival] of interrupted.entries()) {
    assert.equal(rival.status, 'interrupted')
    assert.equal(rival.distance, sample(5000)[index].distance)
    assert.equal(rival.speed, 0)
  }
  assert.ok(getSprintRivals({ status: 'interrupted', elapsedMs: 20000 }, 'competition').every(rival => rival.status === 'finished'))
})

test('competition position uses current progress and exact crossing times with player-first ties', () => {
  assert.deepEqual(getSprintCompetitionStanding(running(0, 0), 'competition'), { position: 1, total: 6, finishedRivals: 0, leaderGapMeters: 0 })
  const rivals = sample(5000)
  assert.equal(getSprintCompetitionStanding(running(5000, 100), 'competition').position, 1)
  assert.equal(getSprintCompetitionStanding(running(5000, 0), 'competition').position, 6)
  assert.equal(getSprintCompetitionStanding(running(5000, rivals[2].distance), 'competition').position, 3)
  assert.equal(getSprintCompetitionStanding(running(5000, 0), 'competition').leaderGapMeters, rivals[4].distance)
  const finishMs = sample(12000)[2].finishTimeMs
  const finishAt = at => ({ status: 'finished', distance: 100, elapsedMs: at, finishTimeMs: at })
  assert.equal(getSprintCompetitionStanding(finishAt(finishMs - .001), 'competition').position, 3)
  assert.equal(getSprintCompetitionStanding(finishAt(finishMs), 'competition').position, 3)
  assert.equal(getSprintCompetitionStanding(finishAt(finishMs + .001), 'competition').position, 4)
  assert.equal(getSprintCompetitionStanding(finishAt(20000), 'competition').position, 6)
  assert.equal(getSprintCompetitionStanding(finishAt(20000), 'competition').finishedRivals, 5)
})

test('invalid clocks and distances have finite zero-based fallbacks', () => {
  for (const elapsedMs of [undefined, null, '5000', NaN, Infinity, -Infinity, -1]) {
    assert.deepEqual(sample(elapsedMs), sample(0))
  }
  for (const race of [undefined, null, {}, { status: 'unknown', elapsedMs: 5000 }]) {
    const rivals = getSprintRivals(race, 'competition')
    assert.ok(rivals.every(rival => rival.status === 'idle' && rival.distance === 0 && rival.speed === 0))
    assert.equal(getSprintCompetitionStanding(race, 'competition').position, 1)
  }
  for (const distance of [undefined, null, '50', NaN, Infinity, -Infinity, -1]) {
    assert.deepEqual(getSprintCompetitionStanding(running(5000, distance), 'competition'), getSprintCompetitionStanding(running(5000, 0), 'competition'))
  }
  assert.deepEqual(getSprintCompetitionStanding(running(5000, 1000), 'competition'), getSprintCompetitionStanding(running(5000, 100), 'competition'))
})

test('seed creation uses one explicit draw and reserves zero for legacy fixed profiles', () => {
  assert.equal(createSprintRivalSeed(0), 1)
  assert.equal(createSprintRivalSeed(.5), 0x80000000)
  assert.equal(createSprintRivalSeed(1 - Number.EPSILON), 0xffffffff)
  for (const seed of [0, 1, 12345, 0xffffffff]) assert.equal(normalizeSprintRivalSeed(seed), seed)
  for (const seed of [undefined, null, '1', -1, .5, 0x100000000, NaN, Infinity, {}]) assert.equal(normalizeSprintRivalSeed(seed), 0)
  for (const draw of [null, '0.5', -1, 1, NaN, Infinity]) assert.equal(createSprintRivalSeed(draw), 0)
  for (const seed of [undefined, null, '1', -1, .5, 0x100000000, NaN, Infinity]) {
    assert.deepEqual(getSprintRivals(running(5000), 'competition', seed), sample(5000))
    assert.deepEqual(getSprintCompetitionStanding(running(5000, 50), 'competition', seed), getSprintCompetitionStanding(running(5000, 50), 'competition'))
  }
})

test('different seeds vary finish records and allow neighboring lane strengths to reverse', () => {
  const fields = new Set()
  let reversed = false
  for (let seed = 1; seed <= 128; seed += 1) {
    const field = getSprintRivals(running(20000), 'competition', seed)
    fields.add(field.map(rival => rival.finishTimeMs.toFixed(3)).join(','))
    assert.deepEqual(field.map(rival => [rival.id, rival.lane]), SPRINT_RIVALS.map(rival => [rival.id, rival.lane]))
    assert.ok(field.every(rival => Number.isFinite(rival.finishTimeMs) && rival.finishTimeMs > 8000 && rival.finishTimeMs < 11000))
    if (field.some((rival, index) => index > 0 && rival.finishTimeMs > field[index - 1].finishTimeMs)) reversed = true
  }
  assert.equal(fields.size, 128)
  assert.equal(reversed, true)
})

test('randomized curves stay monotonic and finish precisely without changing player state', () => {
  for (const seed of [1, 2, 123456, 0xffffffff]) {
    let previous = getSprintRivals(running(0), 'competition', seed)
    for (let elapsedMs = 100; elapsedMs <= 12000; elapsedMs += 100) {
      const race = Object.freeze({ ...running(elapsedMs, 50), speed: 0, steps: 999 })
      const rivals = getSprintRivals(race, 'competition', seed)
      for (const [index, rival] of rivals.entries()) {
        assert.ok(rival.distance >= previous[index].distance && rival.distance <= 100)
        assert.ok(rival.speed >= 0 && rival.speed <= SPRINT_RIVALS[index].maxSpeed + .42)
      }
      assert.deepEqual(race, { ...running(elapsedMs, 50), speed: 0, steps: 999 })
      previous = rivals
    }
    for (const rival of previous) {
      const before = getSprintRivals(running(rival.finishTimeMs - .001), 'competition', seed).find(item => item.id === rival.id)
      const at = getSprintRivals(running(rival.finishTimeMs), 'competition', seed).find(item => item.id === rival.id)
      assert.equal(before.status, 'running')
      assert.ok(before.distance < 100)
      assert.deepEqual(at, rival)
    }
  }
})

test('the same seed replays identically after seeks, style changes and cache eviction', () => {
  const seed = 314159
  const times = [0, 400, 2500, 7000, 11000]
  const saved = new Map(times.map(at => [at, getSprintRivals(running(at), 'competition', seed)]))
  for (let otherSeed = 1; otherSeed <= 80; otherSeed += 1) getSprintRivals(running(5000), 'competition', otherSeed)
  for (const at of [11000, 400, 7000, 0, 2500, 400]) {
    const alteredRace = Object.freeze({ ...running(at, 90), art: 'pixel', steps: 123, speed: 12.2, lastFoot: 'right' })
    assert.deepEqual(getSprintRivals(alteredRace, 'competition', seed), saved.get(at))
  }
  const mutable = getSprintRivals(running(2500), 'competition', seed)
  mutable[0].distance = 99
  mutable[0].finishTimeMs = 1
  assert.deepEqual(getSprintRivals(running(2500), 'competition', seed), saved.get(2500))
})

test('seeded standings use the selected field and exact finish ties', () => {
  for (const seed of [1, 2, 100, 0xffffffff]) {
    const rivals = getSprintRivals(running(20000), 'competition', seed)
    const sorted = [...rivals].sort((a, b) => a.finishTimeMs - b.finishTimeMs)
    const crossing = sorted[2].finishTimeMs
    const finishAt = time => ({ status: 'finished', distance: 100, elapsedMs: time, finishTimeMs: time })
    assert.equal(getSprintCompetitionStanding(finishAt(crossing - .001), 'competition', seed).position, 3)
    assert.equal(getSprintCompetitionStanding(finishAt(crossing), 'competition', seed).position, 3)
    assert.equal(getSprintCompetitionStanding(finishAt(crossing + .001), 'competition', seed).position, 4)
    assert.deepEqual(getSprintRivals({ ...finishAt(crossing), elapsedMs: 50000 }, 'competition', seed), getSprintRivals(running(crossing), 'competition', seed))
  }
  assert.deepEqual(getSprintRivals(running(5000), 'solo', 1234), [])
  assert.equal(getSprintCompetitionStanding(running(5000), 'solo', 1234), null)
})
