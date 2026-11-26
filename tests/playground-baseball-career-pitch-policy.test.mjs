import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { BASEBALL_RULES, judgeBaseballTake, sampleBaseballPlatePassage } from '../lib/playground-baseball.mjs'
import {
  BASEBALL_AT_BAT_RULES,
  BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID,
  createBaseballAtBat,
  nextBaseballAtBatPitch,
  resolveBaseballAtBatPitch,
} from '../lib/playground-baseball-at-bat-v2.mjs'
import { createBaseballGrowthSnapshot } from '../lib/playground-baseball-growth.mjs'

const zone = BASEBALL_RULES.zone
const growthSnapshot = createBaseballGrowthSnapshot({
  careerId: '22000000-0000-4000-8000-000000000001',
  careerRevision: 1, gameIndex: 0, slot: 1, mit: 40, power: 40,
})
const create = (seed, pitchPolicyId) => createBaseballAtBat({
  id: 'policy-sample', pitchMode: 'mixed-eight',
  pitcherHandedness: seed % 2 ? 'left' : 'right',
  baseSpeedKmh: 100 + seed % 61,
  seed, growthSnapshot, pitchPolicyId,
})
const atCount = (state, balls, strikes) => ({
  ...state, balls, strikes, pitchCount: balls + strikes, history: Array(balls + strikes).fill(null),
})
const repertoireType = pitch => pitch.practiceType ?? pitch.type
const edgeDistance = ({ x, y }) => Math.min(x - zone.left, zone.right - x, y - zone.bottom, zone.top - y)

test('default career pitch policy retains every sampled pre-balance target and pitch selection', () => {
  const hash = createHash('sha256')
  for (let balls = 0; balls <= 3; balls++) {
    for (let strikes = 0; strikes <= 2; strikes++) {
      for (let seed = 1; seed <= 256; seed++) {
        const state = atCount(create(seed), balls, strikes)
        assert.equal(state.pitchPolicyVersion, BASEBALL_AT_BAT_RULES.pitchPolicyId)
        const { pitchId, pitch } = nextBaseballAtBatPitch(state)
        hash.update(JSON.stringify([
          pitchId, pitch.seed, repertoireType(pitch), pitch.speedKmh,
          pitch.pitcherHandedness, pitch.target.x, pitch.target.y,
        ]))
      }
    }
  }
  // Captured from the previous release's engine before adding the new policy.
  assert.equal(hash.digest('hex'), '7b231c11b968043ab24a7d9a0fb87a9db24d3d376d695b4cfe5352000d4ea12c')
  assert.throws(() => create(1, 'unknown-pitch-policy'), /Invalid at-bat state/)
})

test('balanced career pitches reduce deep lows and early edges without changing the call or pitch type', () => {
  const counts = () => ({ earlyEdges: 0, earlyDeep: 0, twoStrikeDeep: 0, twoStrikeLows: 0 })
  const before = counts(), after = counts()
  const relocated = new Set(), types = new Set()
  for (let balls = 0; balls <= 3; balls++) {
    for (let strikes = 0; strikes <= 2; strikes++) {
      for (let seed = 1; seed <= 512; seed++) {
        const previous = nextBaseballAtBatPitch(atCount(create(seed), balls, strikes)).pitch
        const current = nextBaseballAtBatPitch(atCount(create(seed, BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID), balls, strikes)).pitch
        const oldPassage = sampleBaseballPlatePassage(previous), passage = sampleBaseballPlatePassage(current)
        assert.equal(passage.inside, oldPassage.inside)
        assert.equal(repertoireType(current), repertoireType(previous))
        assert.equal(current.speedKmh, previous.speedKmh)
        assert.equal(current.pitcherHandedness, previous.pitcherHandedness)
        types.add(repertoireType(current))
        const newDepth = zone.bottom - current.target.y
        if (strikes === 2) {
          if (previous.target.y < zone.bottom) {
            assert.equal(current.target.x, previous.target.x)
            assert.ok(newDepth >= 0.055 - 1e-12 && newDepth <= 0.175)
          } else {
            assert.deepEqual(current.target, previous.target)
          }
          before.twoStrikeLows += oldPassage.point.y < zone.bottom
          after.twoStrikeLows += passage.point.y < zone.bottom
          before.twoStrikeDeep += oldPassage.point.y < zone.bottom - 0.1
          after.twoStrikeDeep += passage.point.y < zone.bottom - 0.1
          continue
        }
        if (previous.target.y < zone.bottom && newDepth <= 0) {
          const side = current.target.x < zone.left ? 'left' : 'right'
          const offset = side === 'left' ? zone.left - current.target.x : current.target.x - zone.right
          assert.ok(offset >= 0.055 - 1e-12 && offset <= 0.11)
          assert.ok(current.target.y >= zone.bottom && current.target.y <= zone.top)
          relocated.add(side)
        }
        if (newDepth > 0) assert.ok(newDepth >= 0.055 - 1e-12 && newDepth <= 0.15)
        before.earlyEdges += oldPassage.inside && edgeDistance(oldPassage.point) <= 0.06
        after.earlyEdges += passage.inside && edgeDistance(passage.point) <= 0.06
        before.earlyDeep += oldPassage.point.y < zone.bottom - 0.1
        after.earlyDeep += passage.point.y < zone.bottom - 0.1
      }
    }
  }
  assert.ok(after.earlyEdges < before.earlyEdges * 0.85)
  assert.ok(after.earlyDeep < before.earlyDeep * 0.7)
  assert.ok(after.twoStrikeDeep < before.twoStrikeDeep)
  assert.equal(after.twoStrikeLows, before.twoStrikeLows)
  assert.deepEqual(relocated, new Set(['left', 'right']))
  assert.equal(types.size, 8)
})

test('balanced pitches replay from the saved policy and preserve the take count', () => {
  function finish(state) {
    while (state.status === 'active') {
      const issued = nextBaseballAtBatPitch(state)
      assert.deepEqual(nextBaseballAtBatPitch(state), issued)
      state = resolveBaseballAtBatPitch(state, { ...issued, result: judgeBaseballTake(issued.pitch) })
    }
    return state
  }

  for (let seed = 1; seed <= 16; seed++) {
    const balanced = create(seed, BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID)
    const completed = finish(balanced), old = finish(create(seed))
    assert.equal(completed.pitchPolicyVersion, BASEBALL_CAREER_BALANCED_PITCH_POLICY_ID)
    assert.deepEqual(finish(JSON.parse(JSON.stringify(balanced))), completed)
    assert.deepEqual(completed.history.map(event => event.countAfter), old.history.map(event => event.countAfter))
    assert.equal(completed.outcome, old.outcome)
  }
})
