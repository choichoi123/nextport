import test from 'node:test'
import assert from 'node:assert/strict'
import { BASEBALL_PITCHER_BLEND_MS, BASEBALL_PITCHER_TIMELINE, getBaseballPitcherSpriteGeometry, sampleBaseballPitcherMotion } from '../lib/playground-baseball-pitcher.mjs'
import { createBaseballStage, createBaseballProjection, createBaseballPitcherPlacement } from '../lib/playground-baseball-layout.mjs'
import { BASEBALL_RULES, createBaseballPitch, sampleBaseballPitch } from '../lib/playground-baseball.mjs'

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
const weights = motion => Array.from({ length: 8 }, (_, frame) => motion.layers.find(layer => layer.frame === frame)?.alpha || 0)

test('우투 원본 손·발과 좌투 render flip의 raw 셀 좌표가 대칭이다', () => {
  const right = getBaseballPitcherSpriteGeometry('right')
  const left = getBaseballPitcherSpriteGeometry('left')
  assert.equal(right.cellWidth, 443.5)
  assert.equal(right.cellHeight, 443.5)
  assert.equal(right.releaseFrame, 4)
  assert.deepEqual(right.hand, { x: 180, y: 80 })
  assert.deepEqual(right.foot, { x: 265, y: 430 })
  assert.deepEqual(left.hand, { x: 263.5, y: 80 })
  assert.deepEqual(left.foot, { x: 178.5, y: 430 })
  assert.equal(right.flipX, false)
  assert.equal(left.flipX, true)
  close(left.hand.x + right.hand.x, right.cellWidth)
  close(left.foot.x + right.foot.x, right.cellWidth)
  assert.ok(Object.isFrozen(left) && Object.isFrozen(left.hand) && Object.isFrozen(left.foot))
})

test('양투의 실제 공 릴리스는 반전된 이미지 손 XY와 일치한다', () => {
  for (const pitcherHandedness of ['right', 'left']) for (const batterHandedness of ['right', 'left']) {
    for (const [width, height] of [[364, 437], [1018, 679]]) {
      const geometry = getBaseballPitcherSpriteGeometry(pitcherHandedness)
      const pitch = createBaseballPitch({ speedKmh: 120, seed: 17, pitcherHandedness })
      const projection = createBaseballProjection(createBaseballStage(width, height, batterHandedness))
      const placement = createBaseballPitcherPlacement(projection, { ...geometry, release: pitch.release })
      const ball = projection.project(sampleBaseballPitch(pitch, 0))
      const original = getBaseballPitcherSpriteGeometry('right')
      const renderedHandX = geometry.flipX ? geometry.cellWidth - original.hand.x : original.hand.x
      const renderedFootX = geometry.flipX ? geometry.cellWidth - original.foot.x : original.foot.x
      close(placement.x + renderedHandX * placement.scale, ball.x)
      close(placement.y + original.hand.y * placement.scale, ball.y)
      close(placement.y + original.foot.y * placement.scale, placement.moundPoint.ground)
      close(placement.x + renderedFootX * placement.scale, placement.footPoint.x)
      close(placement.width / geometry.cellWidth, placement.height / geometry.cellHeight)
    }
  }
})

test('0ms 준비와1200ms 릴리스는 섞이지 않은 단일 자세이며 비행 시각을 바꾸지 않는다', () => {
  for (const hand of ['right', 'left']) {
    const ready = sampleBaseballPitcherMotion(0, hand)
    assert.equal(ready.frame, 0)
    assert.equal(ready.released, false)
    assert.deepEqual(ready.layers, [{ frame: 0, alpha: 1, offsetX: 0, offsetY: 0 }])
    const release = sampleBaseballPitcherMotion(1200, hand)
    assert.equal(release.frame, 4)
    assert.equal(release.released, true)
    assert.deepEqual(release.layers, [{ frame: 4, alpha: 1, offsetX: 0, offsetY: 0 }])
    assert.equal(sampleBaseballPitcherMotion(1199.999, hand).released, false)
    assert.equal(sampleBaseballPitcherMotion(1200.001, hand).released, true)
    assert.equal(sampleBaseballPitcherMotion(1264, hand).layers.length, 1)
  }
  assert.equal(BASEBALL_RULES.windupMs, 1200)
  assert.equal(BASEBALL_RULES.swingContactMs, 110)
  assert.equal(BASEBALL_RULES.swingDurationMs, 520)
})

test('릴리스 단독 자세는64ms 유지하고 이후 세 자세만36ms 늦춰 같은 전환 간격을 보존한다', () => {
  assert.deepEqual(BASEBALL_PITCHER_TIMELINE.map(pose => pose.startMs), [0, 200, 550, 820, 1200, 1296, 1466, 1686])
  const transition = BASEBALL_PITCHER_TIMELINE.find(pose => pose.frame === 5).startMs
  const holdEnd = transition - BASEBALL_PITCHER_BLEND_MS
  assert.equal(holdEnd - BASEBALL_RULES.windupMs, 64)
  for (const hand of ['right', 'left']) {
    for (let elapsed = 1200; elapsed <= holdEnd; elapsed += 1) {
      assert.deepEqual(sampleBaseballPitcherMotion(elapsed, hand).layers, [{ frame: 4, alpha: 1, offsetX: 0, offsetY: 0 }])
    }
    assert.equal(sampleBaseballPitcherMotion(holdEnd + 0.001, hand).layers.length, 2)
    assert.equal(sampleBaseballPitcherMotion(1296, hand).frame, 5)
  }
})

test('30Hz는 모든 릴리스 상대 위상에서 첫 비행 프레임에 단독 frame4를 관찰한다', () => {
  const period = 1000 / 30
  for (const hand of ['right', 'left']) {
    for (let phase = 0; phase < 2000; phase += 1) {
      const delay = (phase + 0.5) / 2000 * period
      const firstAtOrAfterRelease = BASEBALL_RULES.windupMs + delay
      const motion = sampleBaseballPitcherMotion(firstAtOrAfterRelease, hand)
      assert.equal(motion.released, true)
      assert.deepEqual(motion.layers, [{ frame: 4, alpha: 1, offsetX: 0, offsetY: 0 }])
    }
  }
})

test('15Hz 위상96%는 첫 비행 프레임에 단독frame4이고 나머지4%도frame4를98%이상 유지한다', () => {
  const period = 1000 / 15
  const count = 2000
  for (const hand of ['right', 'left']) {
    let single = 0, blended = 0
    for (let phase = 0; phase < count; phase += 1) {
      const delay = (phase + 0.5) / count * period
      const motion = sampleBaseballPitcherMotion(BASEBALL_RULES.windupMs + delay, hand)
      assert.equal(motion.released, true)
      if (motion.layers.length === 1) {
        single += 1
        assert.deepEqual(motion.layers, [{ frame: 4, alpha: 1, offsetX: 0, offsetY: 0 }])
      } else {
        blended += 1
        assert.equal(motion.layers[0].frame, 4)
        assert.ok(motion.layers[0].alpha >= 0.98)
        assert.equal(motion.layers[1].frame, 5)
      }
    }
    assert.equal(single, 1920)
    assert.equal(blended, 80)
    const worst = sampleBaseballPitcherMotion(BASEBALL_RULES.windupMs + period - 1e-6, hand)
    assert.ok(worst.layers[0].alpha >= 0.98)
    assert.ok(worst.layers[0].alpha < 0.981)
  }
})

test('전환은 경계 직전32ms에만 부드럽게 진행하고 alpha 합은 항상1이다', () => {
  assert.equal(BASEBALL_PITCHER_BLEND_MS, 32)
  for (const hand of ['right', 'left']) {
    for (let time = 0; time <= 1900; time += .5) {
      const motion = sampleBaseballPitcherMotion(time, hand)
      assert.ok(motion.layers.length >= 1 && motion.layers.length <= 2)
      close(motion.layers.reduce((sum, layer) => sum + layer.alpha, 0), 1)
      for (const layer of motion.layers) {
        assert.ok(Number.isInteger(layer.frame) && layer.frame >= 0 && layer.frame <= 7)
        assert.ok(layer.alpha > 0 && layer.alpha <= 1)
        assert.equal(layer.offsetX, 0)
        assert.equal(layer.offsetY, 0)
      }
      assert.equal(motion.flipX, hand === 'left')
    }
    for (let index = 1; index < BASEBALL_PITCHER_TIMELINE.length; index++) {
      const { startMs, frame } = BASEBALL_PITCHER_TIMELINE[index]
      assert.equal(sampleBaseballPitcherMotion(startMs - 32, hand).layers.length, 1)
      const middle = sampleBaseballPitcherMotion(startMs - 16, hand)
      assert.equal(middle.layers.length, 2)
      close(middle.layers[0].alpha, .5)
      close(middle.layers[1].alpha, .5)
      assert.deepEqual(sampleBaseballPitcherMotion(startMs, hand).layers, [{ frame, alpha: 1, offsetX: 0, offsetY: 0 }])
    }
  }
})

test('전환 시작과 끝에서 자세별 alpha가 연속이고 마지막 자세는 안정적으로 유지된다', () => {
  for (const { startMs } of BASEBALL_PITCHER_TIMELINE.slice(1)) {
    for (const boundary of [startMs - 32, startMs]) {
      const before = weights(sampleBaseballPitcherMotion(boundary - .0001))
      const after = weights(sampleBaseballPitcherMotion(boundary + .0001))
      before.forEach((alpha, frame) => close(alpha, after[frame], 1e-9))
    }
  }
  assert.deepEqual(sampleBaseballPitcherMotion(1686).layers, sampleBaseballPitcherMotion(1e9).layers)
  assert.equal(sampleBaseballPitcherMotion(1e9).frame, 7)
  assert.ok(Object.isFrozen(BASEBALL_PITCHER_TIMELINE) && BASEBALL_PITCHER_TIMELINE.every(Object.isFrozen))
})

test('잘못된 시간은 준비 자세로 돌아가고 알려지지 않은 투구 손은 우투 기본값을 사용한다', () => {
  for (const time of [null, undefined, -1, NaN, Infinity, -Infinity, '1200', {}, []]) {
    for (const hand of ['right', 'left']) {
      const motion = sampleBaseballPitcherMotion(time, hand)
      assert.equal(motion.frame, 0)
      assert.equal(motion.released, false)
      assert.deepEqual(motion.layers, [{ frame: 0, alpha: 1, offsetX: 0, offsetY: 0 }])
    }
  }
  for (const hand of [null, undefined, 'switch', {}, 0]) {
    assert.equal(getBaseballPitcherSpriteGeometry(hand), getBaseballPitcherSpriteGeometry('right'))
    assert.equal(sampleBaseballPitcherMotion(1200, hand).flipX, false)
  }
})
