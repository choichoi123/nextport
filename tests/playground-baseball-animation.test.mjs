import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BASEBALL_BATTER_FRAME_NAMES, BASEBALL_BATTER_FRAMES,
  BASEBALL_BATTER_TIMELINE, BASEBALL_BATTER_VISUAL_TIMELINE,
  getBaseballBatterFrames, sampleBaseballBatterAnimation,
} from '../lib/playground-baseball-animation.mjs'
import { BASEBALL_RULES, createBaseballPitch, judgeBaseballSwing, sampleBaseballPitch } from '../lib/playground-baseball.mjs'
import { validateBaseballPlayer } from '../lib/playground-baseball-teams.mjs'

test('양타석 16원본을 보존하고 선택된 디딤·접촉직전·마무리 6개만 v6 하체 보완본을 사용한다', () => {
  assert.deepEqual(BASEBALL_BATTER_FRAME_NAMES, ['ready', 'load', 'plant', 'precontact', 'contact', 'follow', 'recovery', 'reset'])
  const sources = []
  const revisions = []
  for (const hand of ['right', 'left']) {
    const frames = getBaseballBatterFrames(hand)
    assert.deepEqual(Object.keys(frames), BASEBALL_BATTER_FRAME_NAMES)
    for (const name of BASEBALL_BATTER_FRAME_NAMES) {
      const frame = frames[name]
      assert.equal(frame.name, name)
      assert.equal(frame.width, 1024)
      assert.equal(frame.height, 1536)
      const expected = ['ready', 'follow'].includes(name)
        ? `/images/playground/baseball/poses/20261123/batter-${name}-${hand}-angle-v4.png`
        : `/images/playground/baseball/motion/20261123-v5/${hand}-${name}-v5.png`
      assert.equal(frame.originalSrc, expected)
      const edited = ['plant', 'precontact', 'follow'].includes(name)
      assert.equal(frame.src, edited
        ? `/images/playground/baseball/motion/20261123-v6-foot-candidates/${hand}-${name}-v6.png`
        : expected)
      assert.equal(frame.poseRevision, edited ? 'v6-foot' : 'original')
      if (edited) revisions.push(`${hand}:${name}`)
      assert.ok(Object.isFrozen(frame) && Object.isFrozen(frame.footAnchor))
      sources.push(frame.src)
    }
  }
  assert.equal(new Set(sources).size, 16)
  assert.deepEqual(revisions, ['right:plant', 'right:precontact', 'right:follow', 'left:plant', 'left:precontact', 'left:follow'])
  assert.ok(Object.isFrozen(BASEBALL_BATTER_FRAMES))
  assert.equal(getBaseballBatterFrames('missing'), BASEBALL_BATTER_FRAMES.right)
})

test('16개 활성 PNG와 보존된 16원본의 IHDR 실제 픽셀 크기가 프레임 메타데이터와 일치한다', () => {
  for (const frames of Object.values(BASEBALL_BATTER_FRAMES)) {
    for (const frame of Object.values(frames)) {
      for (const src of new Set([frame.src, frame.originalSrc])) {
        const file = new URL(`../public${src}`, import.meta.url)
        const png = readFileSync(file)
        assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), src)
        assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR', src)
        assert.equal(png.readUInt32BE(16), frame.width, src)
        assert.equal(png.readUInt32BE(20), frame.height, src)
      }
    }
  }
})

test('기본 스윙은 110ms 접촉·520ms 준비 복귀 경계를 정확히 사용한다', () => {
  const timeline = BASEBALL_BATTER_TIMELINE
  assert.deepEqual(timeline.map(step => step.startMs), [0, 45, 80, 110, 155, 280, 420, 520])
  for (const hand of ['right', 'left']) {
    for (let index = 0; index < timeline.length; index += 1) {
      const step = timeline[index]
      assert.equal(sampleBaseballBatterAnimation(step.startMs, hand).name, step.frame)
      if (index > 0) assert.equal(sampleBaseballBatterAnimation(step.startMs - 0.001, hand).name, timeline[index - 1].frame)
    }
    assert.equal(sampleBaseballBatterAnimation(Number.MAX_VALUE, hand), getBaseballBatterFrames(hand).ready)
  }
})

test('렌더 전용 마무리는 접촉 시각을 유지하고 900ms에 끝나며 기본 타임라인에 영향을 주지 않는다', () => {
  assert.deepEqual(BASEBALL_BATTER_VISUAL_TIMELINE.map(step => step.startMs), [0, 45, 80, 110, 155, 520, 700, 900])
  for (let index = 0; index < BASEBALL_BATTER_VISUAL_TIMELINE.length; index += 1) {
    const step = BASEBALL_BATTER_VISUAL_TIMELINE[index]
    assert.equal(sampleBaseballBatterAnimation(step.startMs, 'right', { visualTail: true }).name, step.frame)
    if (index > 0) assert.equal(sampleBaseballBatterAnimation(step.startMs - 0.001, 'right', { visualTail: true }).name, BASEBALL_BATTER_VISUAL_TIMELINE[index - 1].frame)
  }
  assert.equal(sampleBaseballBatterAnimation(519, 'right', { visualTail: true }).name, 'follow')
  assert.equal(sampleBaseballBatterAnimation(520).name, 'ready')
  assert.equal(sampleBaseballBatterAnimation(899, 'left', { visualTail: true }).name, 'reset')
  assert.equal(sampleBaseballBatterAnimation(900, 'left', { visualTail: true }).name, 'ready')
})

test('취소·아직 시작하지 않은 시간·잘못된 시간은 준비 자세이며 시각 샘플은 순수하다', () => {
  for (const hand of ['right', 'left']) {
    for (const elapsed of [null, undefined, NaN, Infinity, -Infinity, -1, '110', {}, 110n]) {
      assert.equal(sampleBaseballBatterAnimation(elapsed, hand, { visualTail: true }), getBaseballBatterFrames(hand).ready)
    }
    const expected = sampleBaseballBatterAnimation(156, hand)
    for (const hz of [30, 60, 120]) {
      for (let elapsed = 0; elapsed < 950; elapsed += 1000 / hz) sampleBaseballBatterAnimation(elapsed, hand, { visualTail: true })
      assert.equal(sampleBaseballBatterAnimation(156, hand), expected)
    }
    assert.equal(sampleBaseballBatterAnimation(110, hand, null).name, 'contact')
  }
})

test('양타석 발 접점·헬멧은 각 원본의 개별 좌표이며 단순 반전으로 대체하지 않는다', () => {
  const expected = {
    right: [[580, 1360], [600, 1390], [850, 1430], [840, 1440], [700, 1410], [820, 1470], [630, 1370], [590, 1370]],
    left: [[340, 1365], [350, 1390], [180, 1435], [160, 1435], [285, 1405], [200, 1470], [250, 1450], [315, 1370]],
  }
  for (const hand of ['right', 'left']) {
    const frames = getBaseballBatterFrames(hand)
    assert.deepEqual(Object.values(frames).map(frame => [frame.footAnchor.x, frame.footAnchor.y]), expected[hand])
    for (const frame of Object.values(frames)) {
      assert.ok(Object.isFrozen(frame.helmetPolygon))
      assert.equal(frame.helmetPolygon.length, 4)
      const [topLeft, topRight, bottomRight, bottomLeft] = frame.helmetPolygon
      assert.ok(topLeft[0] < topRight[0] && topLeft[1] < bottomLeft[1])
      assert.deepEqual(bottomRight, [topRight[0], bottomLeft[1]])
      frame.helmetPolygon.forEach(([x, y]) => {
        assert.ok(Number.isFinite(x) && x >= 0 && x <= frame.width)
        assert.ok(Number.isFinite(y) && y >= 0 && y <= frame.height)
      })
    }
  }
  assert.notEqual(BASEBALL_BATTER_FRAMES.left.ready.footAnchor.x, 1024 - BASEBALL_BATTER_FRAMES.right.ready.footAnchor.x)
})

test('발 접점과 등번호 패널은 원본 안의 유한 좌표이고 contact·follow에서만 번호를 노출한다', () => {
  for (const hand of ['right', 'left']) {
    const frames = getBaseballBatterFrames(hand)
    for (const frame of Object.values(frames)) {
      for (const [value, maximum] of [[frame.footAnchor.x, frame.width], [frame.footAnchor.y, frame.height]]) {
        assert.ok(Number.isFinite(value) && value >= 0 && value <= maximum)
      }
      if (!['contact', 'follow'].includes(frame.name)) { assert.equal(frame.backNumber, null); continue }
      const panel = frame.backNumber
      assert.ok(Object.isFrozen(panel) && Object.isFrozen(panel.transform) && Object.isFrozen(panel.polygon))
      assert.ok(panel.polygon.length >= 4)
      panel.polygon.forEach(([x, y]) => {
        assert.ok(Number.isFinite(x) && x >= 0 && x <= frame.width)
        assert.ok(Number.isFinite(y) && y >= 0 && y <= frame.height)
      })
      const { x, y, rotationDeg, skewDeg, scaleX } = panel.transform
      assert.ok([x, y, rotationDeg, skewDeg, scaleX, panel.fontPx, panel.maxWidth, panel.maxHeight].every(Number.isFinite))
      assert.ok(panel.maxWidth > 0 && panel.maxHeight > 0 && panel.fontPx > 0 && scaleX > 0)
      assert.ok(x >= Math.min(...panel.polygon.map(point => point[0])) && x <= Math.max(...panel.polygon.map(point => point[0])))
      assert.ok(y >= Math.min(...panel.polygon.map(point => point[1])) && y <= Math.max(...panel.polygon.map(point => point[1])))
      assert.ok(x - panel.maxWidth / 2 >= 0 && x + panel.maxWidth / 2 <= frame.width)
      assert.ok(y - panel.maxHeight / 2 >= 0 && y + panel.maxHeight / 2 <= frame.height)
    }
  }
  assert.equal(BASEBALL_BATTER_FRAMES.right.follow.backNumber.transform.rotationDeg, -BASEBALL_BATTER_FRAMES.left.follow.backNumber.transform.rotationDeg)
  assert.equal(BASEBALL_BATTER_FRAMES.right.contact.backNumber.polygon.length, 6)
  assert.deepEqual(BASEBALL_BATTER_FRAMES.left.contact.backNumber.polygon, BASEBALL_BATTER_FRAMES.right.contact.backNumber.polygon.map(([x, y]) => [1024 - x, y]))
  assert.equal(BASEBALL_BATTER_FRAMES.right.contact.backNumber.transform.rotationDeg, -BASEBALL_BATTER_FRAMES.left.contact.backNumber.transform.rotationDeg)
})

test('16자세의 발 외곽·접지·배트 계측은 원본 안의 동결된 좌표이며 정확도 한계를 명시한다', () => {
  const sourcePoint = (value, frame, label) => {
    assert.ok(Array.isArray(value) && value.length === 2, label)
    assert.ok(Number.isFinite(value[0]) && value[0] >= 0 && value[0] <= frame.width, label)
    assert.ok(Number.isFinite(value[1]) && value[1] >= 0 && value[1] <= frame.height, label)
    assert.ok(Object.isFrozen(value), label)
  }
  for (const [hand, frames] of Object.entries(BASEBALL_BATTER_FRAMES)) {
    for (const frame of Object.values(frames)) {
      const label = `${hand}:${frame.name}`
      assert.equal(frame.landmarkAccuracyPx, ['plant', 'precontact', 'follow'].includes(frame.name) ? 15 : 12, label)
      assert.ok(Object.isFrozen(frame.registrationAnchor), label)
      const { x, y } = frame.registrationAnchor
      assert.ok(Number.isFinite(x) && x > 0 && x < frame.width, label)
      assert.ok(Number.isFinite(y) && y > 0 && y < frame.height, label)
      assert.deepEqual(Object.keys(frame.feet), ['lead', 'trail'], label)
      assert.ok(Object.isFrozen(frame.feet), label)
      for (const [footName, foot] of Object.entries(frame.feet)) {
        assert.ok(Object.isFrozen(foot) && Object.isFrozen(foot.outline) && Object.isFrozen(foot.contact), `${label}:${footName}`)
        assert.ok(foot.outline.length >= 8, `${label}:${footName}`)
        for (const p of [...foot.outline, ...foot.contact]) sourcePoint(p, frame, `${label}:${footName}`)
        assert.ok(['flat-sole', 'lifted', 'toe-pivot'].includes(foot.kind), `${label}:${footName}`)
        assert.ok(Number.isFinite(foot.liftPx) && foot.liftPx >= 0, `${label}:${footName}`)
        assert.ok(Object.isFrozen(foot.groundReference), `${label}:${footName}`)
        assert.ok(foot.groundReference.x >= 0 && foot.groundReference.x <= frame.width, `${label}:${footName}`)
        assert.ok(foot.groundReference.y >= 0 && foot.groundReference.y <= frame.height, `${label}:${footName}`)
      }
      assert.ok(Object.isFrozen(frame.batLandmarks), label)
      for (const [name, p] of Object.entries(frame.batLandmarks)) {
        if (name === 'knob' && p === null) continue // Occluded knobs have no invented coordinate.
        sourcePoint(p, frame, `${label}:bat:${name}`)
      }
      assert.ok(Math.hypot(
        frame.batLandmarks.barrelEnd[0] - frame.batLandmarks.grip[0],
        frame.batLandmarks.barrelEnd[1] - frame.batLandmarks.grip[1],
      ) > 100, `${label}:visible bat has a measurable length`)
    }
  }
})

test('로드의 들린 앞발은 접지를 만들지 않고 원본 착지 기준과 공중 간격을 보존한다', () => {
  for (const hand of ['right', 'left']) {
    const frame = getBaseballBatterFrames(hand).load
    assert.equal(frame.feet.lead.kind, 'lifted')
    assert.deepEqual(frame.feet.lead.contact, [])
    assert.equal(frame.feet.lead.liftPx, 15)
    assert.deepEqual(frame.feet.lead.groundReference, frame.footAnchor)
    const visibleBottom = Math.max(...frame.feet.lead.outline.map(([, y]) => y))
    const gap = frame.feet.lead.groundReference.y - visibleBottom
    assert.ok(gap > 0 && Math.abs(gap - frame.feet.lead.liftPx) <= frame.landmarkAccuracyPx)
    assert.equal(frame.feet.trail.kind, 'flat-sole')
    assert.ok(frame.feet.trail.contact.length >= 2)
    assert.equal(frame.feet.trail.liftPx, 0)
  }
})

test('들린 앞발의 가상 착지 범위는 실제 접지와 분리된 밑창 폭을 보존한다', () => {
  for (const hand of ['right', 'left']) {
    const frame = getBaseballBatterFrames(hand).load
    const lead = frame.feet.lead
    assert.deepEqual(lead.contact, [], `${hand}:a lifted foot has no actual ground contact`)
    assert.ok(Object.isFrozen(lead.virtualContact) && lead.virtualContact.length >= 2, hand)
    for (const p of lead.virtualContact) {
      assert.ok(Object.isFrozen(p) && p.length === 2, hand)
      assert.ok(Number.isFinite(p[0]) && p[0] > 0 && p[0] < frame.width, hand)
      assert.ok(Number.isFinite(p[1]) && p[1] > 0 && p[1] < frame.height, hand)
    }
    const virtualLeft = Math.min(...lead.virtualContact.map(([x]) => x))
    const virtualRight = Math.max(...lead.virtualContact.map(([x]) => x))
    const shoeWidth = Math.max(...lead.outline.map(([x]) => x)) - Math.min(...lead.outline.map(([x]) => x))
    // A single point would wrongly make a raised foot take no horizontal space.
    assert.ok(virtualRight - virtualLeft >= shoeWidth * 0.7, `${hand}:virtual support retains the sole width`)
    assert.ok(virtualRight - virtualLeft <= shoeWidth * 1.2, `${hand}:virtual support does not invent a larger shoe`)
    assert.ok(lead.groundReference.x >= virtualLeft && lead.groundReference.x <= virtualRight, hand)
    assert.ok(lead.groundReference.y >= Math.min(...lead.virtualContact.map(([, y]) => y)) &&
      lead.groundReference.y <= Math.max(...lead.virtualContact.map(([, y]) => y)), hand)
  }
})

test('디딤부터 마무리까지 뒤발은 발끝 피벗이며 들린 뒤꿈치를 전체 밑창 접지로 바꾸지 않는다', () => {
  for (const hand of ['right', 'left']) {
    const frames = getBaseballBatterFrames(hand)
    for (const name of ['plant', 'precontact', 'contact', 'follow']) {
      const frame = frames[name]
      const trail = frame.feet.trail
      assert.equal(frame.feet.lead.kind, 'flat-sole', `${hand}:${name}`)
      assert.equal(trail.kind, 'toe-pivot', `${hand}:${name}`)
      assert.ok(trail.contact.length >= 1, `${hand}:${name}`)
      const shoeTop = Math.min(...trail.outline.map(([, y]) => y))
      const shoeBottom = Math.max(...trail.outline.map(([, y]) => y))
      const contactTop = Math.min(...trail.contact.map(([, y]) => y))
      const contactBottom = Math.max(...trail.contact.map(([, y]) => y))
      assert.ok(shoeBottom - shoeTop > 100, `${hand}:${name}:raised heel remains in the outline`)
      assert.ok(contactBottom - contactTop <= frame.landmarkAccuracyPx, `${hand}:${name}:support is localized at the toe`)
      assert.ok(contactTop > shoeTop + 100, `${hand}:${name}:heel is not a support`)
      assert.ok(Math.abs(contactBottom - shoeBottom) <= frame.landmarkAccuracyPx * 2, `${hand}:${name}`)
      assert.equal(trail.liftPx, 0, `${hand}:${name}:toe support means the whole foot is not airborne`)
    }
  }
})

test('준비의 새 등록점은 양발 사이에 있고 기존 원본·사선 자세·등판 표시 규칙을 보존한다', () => {
  for (const hand of ['right', 'left']) {
    const frames = getBaseballBatterFrames(hand)
    const ready = frames.ready
    assert.equal(ready.src, `/images/playground/baseball/poses/20261123/batter-ready-${hand}-angle-v4.png`)
    assert.equal(ready.backNumber, null)
    const a = ready.feet.lead.groundReference
    const b = ready.feet.trail.groundReference
    assert.ok(ready.registrationAnchor.x > Math.min(a.x, b.x) && ready.registrationAnchor.x < Math.max(a.x, b.x))
    assert.ok(ready.registrationAnchor.y > Math.min(a.y, b.y) && ready.registrationAnchor.y < Math.max(a.y, b.y))
    assert.notDeepEqual(ready.registrationAnchor, ready.footAnchor)
    assert.equal(frames.precontact.batLandmarks.knob, null)
    assert.equal(frames.follow.batLandmarks.knob, null)
    assert.ok(frames.contact.backNumber && frames.follow.backNumber)
    for (const name of ['ready', 'recovery', 'reset']) {
      assert.equal(frames[name].feet.lead.kind, 'flat-sole')
      assert.equal(frames[name].feet.trail.kind, 'flat-sole')
    }
  }
})

test('애니메이션은 선수의 00·07 번호 문자열과 원본 투구·110/520 규칙·타격 결과를 바꾸지 않는다', () => {
  const pitch = createBaseballPitch({ speedKmh: 120, seed: 19 })
  const input = { swingAtMs: pitch.flightTimeMs - BASEBALL_RULES.swingContactMs, aim: pitch.target, handedness: 'right' }
  const before = { rules: JSON.stringify(BASEBALL_RULES), pitch: JSON.stringify(pitch), sample: sampleBaseballPitch(pitch, 100), result: judgeBaseballSwing(pitch, input) }
  for (const jerseyNumber of ['00', '07']) {
    const player = validateBaseballPlayer({ name: '타자', teamId: 'heroes', handedness: 'right', jerseyNumber }).player
    for (const elapsed of [0, 110, 155, 520, 900]) sampleBaseballBatterAnimation(elapsed, player.handedness, { visualTail: true })
    assert.equal(player.jerseyNumber, jerseyNumber)
  }
  assert.equal(BASEBALL_RULES.swingContactMs, 110)
  assert.equal(BASEBALL_RULES.swingDurationMs, 520)
  assert.equal(JSON.stringify(BASEBALL_RULES), before.rules)
  assert.equal(JSON.stringify(pitch), before.pitch)
  assert.deepEqual(sampleBaseballPitch(pitch, 100), before.sample)
  assert.deepEqual(judgeBaseballSwing(pitch, input), before.result)
})
