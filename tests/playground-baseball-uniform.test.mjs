import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BASEBALL_BATTER_FRAME_NAMES, getBaseballBatterFrames } from '../lib/playground-baseball-animation.mjs'
import {
  BASEBALL_UNIFORM_LABELS as L, BASEBALL_UNIFORM_VERSION,
  getBaseballUniformRegions, getBaseballUniformMaterialKey,
  compileBaseballUniformMask, classifyBaseballUniformPixel, paintBaseballUniform,
  compileBaseballUndersleeveMask, paintBaseballUndersleeves,
  getBaseballUndersleeveRegions,
} from '../lib/playground-baseball-uniform.mjs'
import { BASEBALL_TEAMS } from '../lib/playground-baseball-teams.mjs'

const quad = (x, y, width, height) => [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]
function regions(overrides = {}) {
  return { src: '/test.png', width: 20, height: 20,
    helmet: [quad(2, 1, 6, 3)], jersey: [quad(2, 5, 12, 6)],
    sleeves: [quad(2, 5, 3, 6)], pants: [quad(2, 12, 12, 7)], protect: [],
    trim: [], piping: [], panels: [], ...overrides }
}
function image(width = 20, height = 20, rgba = [40, 80, 173, 255]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i)
  return { data, width, height }
}
const offset = (x, y, width = 20) => (y * width + x) * 4
const pixel = (img, x, y) => Array.from(img.data.slice(offset(x, y, img.width), offset(x, y, img.width) + 4))
const setPixel = (img, x, y, rgba) => img.data.set(rgba, offset(x, y, img.width))

test('16개 활성 프레임의 소스·PNG 크기와 유니폼 영역이 일치한다', () => {
  const sources = new Set()
  for (const handedness of ['right', 'left']) {
    const frames = getBaseballBatterFrames(handedness)
    for (const name of BASEBALL_BATTER_FRAME_NAMES) {
      const frame = frames[name]
      const data = getBaseballUniformRegions({ handedness, name, src: frame.src })
      assert.equal(data.src, frame.src)
      assert.equal(data.width, frame.width)
      assert.equal(data.height, frame.height)
      const png = readFileSync(new URL(`../public${data.src}`, import.meta.url))
      assert.equal(png.readUInt32BE(16), data.width)
      assert.equal(png.readUInt32BE(20), data.height)
      const mask = compileBaseballUniformMask(data, { feet: frame.feet })
      assert.equal(mask.length, 1024 * 1536)
      for (const label of [L.helmet, L.jersey, L.sleeve, L.pants, L.accent, L.secondary, L.piping]) {
        assert.ok(mask.includes(label), `${handedness}/${name}: missing material ${label}`)
      }
      sources.add(data.src)
    }
  }
  assert.equal(sources.size, 16)
})

test('소스 리비전·타석·프레임이 없으면 옛 영역으로 대체하지 않는다', () => {
  const frame = getBaseballBatterFrames('right').plant
  assert.throws(() => getBaseballUniformRegions({ handedness: 'right', name: 'plant', src: frame.originalSrc }), /mismatched/)
  assert.throws(() => getBaseballUniformRegions({ handedness: 'missing', name: 'ready', src: frame.src }), /Missing/)
  assert.throws(() => getBaseballUniformRegions({ handedness: 'right', name: 'missing', src: frame.src }), /Missing/)
  assert.throws(() => getBaseballUniformRegions({ handedness: 'right', name: 'ready' }), /Missing/)
})

test('양손 16개 정밀 영역은 알려진 시범 프로필에만 선택하고 다른 팀은 기준 영역을 사용한다', () => {
  for (const handedness of ['right', 'left']) {
    for (const name of BASEBALL_BATTER_FRAME_NAMES) {
      const frame = getBaseballBatterFrames(handedness)[name]
      const input = { handedness, name, src: frame.src }
      const baseline = getBaseballUniformRegions(input)
      assert.equal(getBaseballUniformRegions({ ...input, uniformProfile: 'future-profile' }), baseline)
      for (const uniformProfile of ['heroes-pilot-v1', 'twins-pilot-v1']) {
        const pilot = getBaseballUniformRegions({ ...input, uniformProfile })
        assert.notEqual(pilot, baseline)
        assert.equal(pilot.src, baseline.src)
        assert.equal(pilot.width, baseline.width)
        assert.equal(pilot.height, baseline.height)
        assert.equal(pilot.panels.filter(panel => panel.region === 'sleeve').length, 2)
        assert.equal(pilot.panels.filter(panel => panel.region === 'pants').length, 4)
        const mask = compileBaseballUniformMask(pilot, { feet: frame.feet })
        assert.ok(mask.includes(L.helmet) && mask.includes(L.pants) && mask.includes(L.jersey))
      }
      assert.throws(() => getBaseballUniformRegions({ ...input, uniformProfile: 'twins-pilot-v1', src: '/missing.png' }), /mismatched/)
    }
  }
})

test('재질 키는 모든 도포 색과 엔진 버전을 포함하며 선수 이름·등번호와 분리된다', () => {
  assert.ok(getBaseballUniformMaterialKey({}).includes(BASEBALL_UNIFORM_VERSION))
  const base = { jersey: '#2054ad', helmet: '#154591', pants: '#f5f1e8', accent: '#ffffff', secondary: '#eeeeee', sleeve: '#333333', stripe: '#444444', pantsStripe: '#666666', pantsPiping: '#111111', jerseyTrim: '#222222', secondaryTrim: '#555555', undersleeve: '#181c22', uniformProfile: 'heroes-pilot-v1' }
  for (const field of Object.keys(base)) {
    assert.notEqual(getBaseballUniformMaterialKey(base), getBaseballUniformMaterialKey({ ...base, [field]: '#abcdef' }), field)
  }
  assert.equal(getBaseballUniformMaterialKey(base), getBaseballUniformMaterialKey({ ...base, name: '새 선수', jerseyNumber: '99' }))
})

test('소매·헬멧 우선순위와 피부·장갑·벨트·발 보호가 세부 경로보다 우선한다', () => {
  const data = regions({
    helmet: [quad(5, 4, 4, 4)],
    trim: [{ points: [[0, 7], [19, 7]], width: 5, material: 'accent' }],
    piping: [{ points: [[8, 10], [8, 20]], width: 4 }],
    protect: [quad(4, 6, 3, 3), quad(2, 10, 12, 2)],
  })
  const feet = { lead: { outline: quad(7, 17, 5, 3) } }
  const mask = compileBaseballUniformMask(data, { feet })
  const at = (x, y) => mask[y * data.width + x]
  assert.equal(at(3, 5), L.accent)
  assert.equal(at(5, 5), L.helmet)
  assert.equal(at(5, 7), L.outside)
  assert.equal(at(8, 10), L.outside)
  assert.equal(at(8, 15), L.piping)
  assert.equal(at(8, 18), L.outside)
  assert.equal(at(0, 7), L.outside)
  assert.equal(at(8, 11), L.outside)
})

test('범위 밖·잘못된 좌표·경로·패널과 이미지 크기를 거부한다', () => {
  assert.throws(() => compileBaseballUniformMask(regions({ width: 0 })), /dimensions/)
  assert.throws(() => compileBaseballUniformMask(regions({ pants: [[[0, 0], [21, 0], [1, 1]]] })), /coordinates/)
  assert.throws(() => compileBaseballUniformMask(regions({ jersey: [[[0, 0], [1, 1]]] })), /three/)
  assert.throws(() => compileBaseballUniformMask(regions({ piping: [{ points: [[0, 0], [1, 1]], width: -1 }] })), /stroke/)
  assert.throws(() => compileBaseballUniformMask(regions({ trim: [{ points: [[0, 0], [1, 1]], width: 1, material: 'skin' }] })), /material/)
  assert.throws(() => paintBaseballUniform(image(10, 10), {}, regions()), /dimensions/)
  const panel = { region: 'jersey', polygon: quad(5, 5, 9, 6), topLeft: [5, 5], topRight: [14, 5], bottomLeft: [5, 11], bottomRight: [14, 11] }
  assert.throws(() => compileBaseballUniformMask(regions({ panels: [{ ...panel, repeats: 0 }] })), /repeats/)
  assert.throws(() => compileBaseballUniformMask(regions({ panels: [{ ...panel, phase: NaN }] })), /phase/)
  assert.throws(() => compileBaseballUniformMask(regions({ panels: [{ ...panel, fadeEdges: ['knee'] }] })), /fadeEdges/)
})

test('도포는 알파·기하 영역 밖·피부·장갑·발의 모든 바이트를 보존한다', () => {
  const data = regions({ protect: [quad(6, 6, 2, 2)] })
  const feet = { lead: { outline: quad(7, 16, 4, 3) } }
  const img = image()
  for (let y = 12; y < 20; y++) for (let x = 0; x < 20; x++) setPixel(img, x, y, [240, 237, 225, 255])
  setPixel(img, 9, 7, [206, 142, 99, 255])
  setPixel(img, 10, 7, [240, 237, 225, 255])
  setPixel(img, 11, 7, [40, 80, 173, 12])
  const before = img.data.slice()
  const mask = compileBaseballUniformMask(data, { feet })
  const result = paintBaseballUniform(img, { jersey: '#ef7928', pants: '#99ccff' }, data, { feet })
  let changed = 0
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4
    assert.equal(img.data[p + 3], before[p + 3], `alpha ${i}`)
    const eligible = classifyBaseballUniformPixel(mask[i], before[p], before[p + 1], before[p + 2], before[p + 3])
    if (!eligible) assert.deepEqual(img.data.slice(p, p + 4), before.slice(p, p + 4), `protected ${i}`)
    if (img.data[p] !== before[p] || img.data[p + 1] !== before[p + 1] || img.data[p + 2] !== before[p + 2]) changed++
  }
  assert.equal(result.counts.changed, changed)
  assert.ok(changed > 0)
  assert.deepEqual(pixel(img, 9, 7), [206, 142, 99, 255])
  assert.deepEqual(pixel(img, 10, 7), [240, 237, 225, 255])
  assert.deepEqual(result.bounds, { left: 0, top: 0, right: 20, bottom: 20 })
})

test('흰 상의를 원본 파란색 밝기로 어둡게 만들지 않고 주름·하이라이트는 남긴다', () => {
  const img = image()
  setPixel(img, 8, 7, [20, 40, 86, 255])
  setPixel(img, 9, 7, [40, 80, 173, 255])
  setPixel(img, 10, 7, [100, 150, 220, 255])
  paintBaseballUniform(img, { jersey: '#f4f1e9' }, regions())
  assert.deepEqual(pixel(img, 9, 7), [244, 241, 233, 255])
  assert.ok(pixel(img, 8, 7)[0] < pixel(img, 9, 7)[0])
  assert.ok(pixel(img, 10, 7)[0] > pixel(img, 9, 7)[0])
  assert.ok(pixel(img, 8, 7)[0] > 110)
})

test('바지 중립 재질과 명시한 옆선을 서로 다른 색으로 처리한다', () => {
  const data = regions({ piping: [{ points: [[4.5, 12], [4.5, 19]], width: 2 }] })
  const img = image(20, 20, [245, 242, 238, 255])
  setPixel(img, 4, 14, [40, 80, 173, 255])
  paintBaseballUniform(img, { pants: '#f5f1e8', pantsPiping: '#aa2233' }, data)
  assert.deepEqual(pixel(img, 4, 14), [170, 34, 51, 255])
  assert.deepEqual(pixel(img, 4, 15), [245, 241, 232, 255])
  assert.deepEqual(pixel(img, 9, 14), [245, 241, 232, 255])
  assert.deepEqual(pixel(img, 9, 6), [245, 242, 238, 255])
})

test('accent·secondary 경로는 옷 안에서만 적용하고 마주친 보호 영역을 건너뛴다', () => {
  const data = regions({
    trim: [
      { points: [[0, 6.5], [19, 6.5]], width: 1, material: 'accent' },
      { points: [[0, 9.5], [19, 9.5]], width: 1, material: 'secondary' },
    ], protect: [quad(6, 6, 1, 1)],
  })
  const img = image()
  paintBaseballUniform(img, { jersey: '#555555', accent: '#ee1122', secondary: '#22cc99' }, data)
  assert.deepEqual(pixel(img, 8, 6), [238, 17, 34, 255])
  assert.deepEqual(pixel(img, 8, 9), [34, 204, 153, 255])
  assert.deepEqual(pixel(img, 6, 6), [40, 80, 173, 255])
  assert.deepEqual(pixel(img, 17, 6), [40, 80, 173, 255])
})

test('로컬 UV 줄무늬는 전체 이미지 X가 아닌 이동·기울어진 의복 패널을 따른다', () => {
  function striped(shift) {
    const polygon = [[10 + shift, 1], [50 + shift, 1], [60 + shift, 19], [20 + shift, 19]]
    const data = regions({ width: 100, helmet: [], sleeves: [], jersey: [polygon], pants: [],
      panels: [{ region: 'jersey', polygon, topLeft: polygon[0], topRight: polygon[1], bottomLeft: polygon[3], bottomRight: polygon[2] }],
    })
    const img = image(100, 20)
    const result = paintBaseballUniform(img, { jersey: '#ffffff', stripe: '#111111' }, data)
    return { img, result }
  }
  const a = striped(0), b = striped(17)
  assert.ok(a.result.counts.stripe > 0)
  assert.equal(a.result.counts.stripe, b.result.counts.stripe)
  for (let y = 0; y < 20; y++) for (let x = 0; x < 75; x++) assert.deepEqual(pixel(a.img, x, y), pixel(b.img, x + 17, y))
  const stripeX = y => Array.from({ length: 75 }, (_, x) => x).filter(x => pixel(a.img, x, y)[0] > 100 && pixel(a.img, x, y)[0] < 220)
  assert.notDeepEqual(stripeX(2), stripeX(17))
  const shades = new Set()
  for (let y = 0; y < 20; y++) for (let x = 0; x < 75; x++) {
    const value = pixel(a.img, x, y)[0]
    if (value > 80) shades.add(value)
  }
  assert.ok(shades.size > 4, 'antialiased intermediate shades')
  assert.ok(Math.min(...shades) >= 124, 'stripe blend cannot exceed 55 percent')
})

test('상의 stripe 설정을 바지에 복제하지 않고 명시한 pantsStripe만 바지 패널에 적용한다', () => {
  const polygon = quad(2, 12, 12, 7)
  const data = regions({ panels: [{ region: 'pants', polygon, topLeft: [2, 12], topRight: [14, 12], bottomLeft: [2, 19], bottomRight: [14, 19] }] })
  const a = image(20, 20, [245, 242, 238, 255])
  const b = image(20, 20, [245, 242, 238, 255])
  const onlyShirt = paintBaseballUniform(a, { stripe: '#111111' }, data)
  const explicitPants = paintBaseballUniform(b, { stripe: '#111111', pantsStripe: '#111111' }, data)
  assert.equal(onlyShirt.counts.stripe, 0)
  assert.ok(explicitPants.counts.stripe > 0)
  assert.notDeepEqual(a.data, b.data)
})

test('상의 패널 경계 2.5%에서 줄무늬만 부드럽게 사라지고 원단은 유지한다', () => {
  const polygon = quad(0, 0, 500, 100)
  const data = regions({ width: 500, height: 100, helmet: [], sleeves: [], pants: [], jersey: [polygon],
    panels: [{ region: 'jersey', polygon, topLeft: [0, 0], topRight: [500, 0], bottomLeft: [0, 100], bottomRight: [500, 100] }],
  })
  const img = image(500, 100)
  paintBaseballUniform(img, { jersey: '#ffffff', stripe: '#111111' }, data)
  assert.ok(pixel(img, 55, 0)[0] > pixel(img, 55, 1)[0])
  assert.ok(pixel(img, 55, 1)[0] > pixel(img, 55, 3)[0])
  assert.equal(pixel(img, 55, 3)[0], pixel(img, 55, 50)[0])
  assert.deepEqual(pixel(img, 100, 0), [255, 255, 255, 255])
})

test('RGB 진단 게이트는 피부·무색 장갑·낮은 alpha를 파란 상의로 오인하지 않는다', () => {
  assert.equal(classifyBaseballUniformPixel(L.jersey, 206, 142, 99, 255), 0)
  assert.equal(classifyBaseballUniformPixel(L.sleeve, 240, 240, 235, 255), 0)
  assert.equal(classifyBaseballUniformPixel(L.helmet, 20, 80, 150, 20), 0)
  assert.equal(classifyBaseballUniformPixel(L.jersey, 40, 80, 173, 255), L.jersey)
  assert.equal(classifyBaseballUniformPixel(L.pants, 230, 225, 215, 255), L.pants)
  assert.equal(classifyBaseballUniformPixel(L.piping, 40, 80, 173, 255), L.piping)
  assert.equal(classifyBaseballUniformPixel(L.piping, 233, 220, 216, 255), L.pants)
  assert.equal(classifyBaseballUniformPixel(L.piping, 206, 142, 99, 255), L.outside)
})

test('넓은 옆선 탐색 범위의 중립 원단은 인접 바지와 같은 재질로 도포한다', () => {
  const data = regions({ piping: [{ points: [[4.5, 12], [4.5, 19]], width: 6 }] })
  const img = image(20, 20, [233, 220, 216, 255])
  setPixel(img, 4, 14, [40, 80, 173, 255])
  const result = paintBaseballUniform(img, { pants: '#556677', pantsPiping: '#aa2233' }, data)
  assert.deepEqual(pixel(img, 5, 15), pixel(img, 10, 15))
  assert.notDeepEqual(pixel(img, 5, 15), [233, 220, 216, 255])
  assert.deepEqual(pixel(img, 4, 14), [170, 34, 51, 255])
  assert.equal(result.counts.piping, 1)
  assert.ok(result.counts.pants > 0)
})

test('도포가 입력 영역·패널·발 좌표를 변경하지 않고 빈 소스는 오류로 구분한다', () => {
  const data = regions({ panels: [{ region: 'jersey', polygon: quad(5, 5, 9, 6), topLeft: [5, 5], topRight: [14, 5], bottomLeft: [5, 11], bottomRight: [14, 11] }] })
  const feet = { lead: { outline: quad(5, 17, 5, 3) } }
  const before = JSON.stringify({ data, feet })
  paintBaseballUniform(image(), { stripe: '#123456' }, data, { feet })
  assert.equal(JSON.stringify({ data, feet }), before)
  assert.throws(() => paintBaseballUniform(image(20, 20, [0, 0, 0, 0]), {}, data), /Empty/)
})

test('알려진 시범 프로필에서만 깊은 헬멧·상의 그림자와 따뜻한 바지 원단을 복구한다', () => {
  for (const profile of ['heroes-pilot-v1', 'twins-pilot-v1', 'dinos-pilot-v1']) {
    assert.equal(classifyBaseballUniformPixel(L.helmet, 19, 22, 25, 255), L.outside)
    assert.equal(classifyBaseballUniformPixel(L.helmet, 19, 22, 25, 255, profile), L.helmet)
    assert.equal(classifyBaseballUniformPixel(L.jersey, 60, 65, 72, 255, profile), L.jersey)
    assert.equal(classifyBaseballUniformPixel(L.piping, 2, 7, 15, 255, profile), L.piping)
    assert.equal(classifyBaseballUniformPixel(L.jersey, 2, 7, 15, 255, profile), L.jersey)
    assert.equal(classifyBaseballUniformPixel(L.piping, 15, 16, 17, 255, profile), L.pants)
    assert.equal(classifyBaseballUniformPixel(L.pants, 170, 125, 85, 255), L.outside)
    assert.equal(classifyBaseballUniformPixel(L.pants, 170, 125, 85, 255, profile), L.pants)
    assert.equal(classifyBaseballUniformPixel(L.outside, 19, 22, 25, 255, profile), L.outside)
  }
  assert.equal(classifyBaseballUniformPixel(L.helmet, 19, 22, 25, 255, 'future-profile'), L.outside)
  const a = image(), b = image()
  paintBaseballUniform(a, {}, regions())
  paintBaseballUniform(b, { uniformProfile: 'future-profile' }, regions())
  assert.deepEqual(a.data, b.data)
})

test('시범 프로필의 넓은 재질 게이트도 보호된 어두운 장갑·피부·발과 alpha를 변경하지 않는다', () => {
  const data = regions({ protect: [quad(5, 5, 4, 4)] })
  const feet = { lead: { outline: quad(5, 16, 5, 3) } }
  for (const uniformProfile of ['heroes-pilot-v1', 'twins-pilot-v1', 'dinos-pilot-v1']) {
    const img = image(20, 20, [19, 22, 25, 255])
    setPixel(img, 6, 6, [206, 142, 99, 255])
    setPixel(img, 11, 6, [19, 22, 25, 20])
    const before = img.data.slice()
    const mask = compileBaseballUniformMask(data, { feet })
    paintBaseballUniform(img, { jersey: '#742637', helmet: '#681d35', uniformProfile }, data, { feet })
    for (let i = 0; i < mask.length; i++) {
      const p = i * 4
      assert.equal(img.data[p + 3], before[p + 3])
      if (!mask[i] || before[p + 3] < 32) assert.deepEqual(img.data.slice(p, p + 4), before.slice(p, p + 4))
    }
  }
})

test('GG 흰 원단은 시범 옵션에서만 중간 그림자를 밝히며 깊은 주름과 하이라이트 차이를 유지한다', () => {
  const a = image(), b = image()
  for (const img of [a, b]) {
    setPixel(img, 7, 7, [12, 24, 50, 255])
    setPixel(img, 8, 7, [24, 50, 100, 255])
    setPixel(img, 9, 7, [40, 80, 173, 255])
  }
  paintBaseballUniform(a, { jersey: '#f5f3ed' }, regions())
  paintBaseballUniform(b, { jersey: '#f5f3ed', uniformProfile: 'twins-pilot-v1' }, regions())
  assert.ok(pixel(b, 8, 7)[0] > pixel(a, 8, 7)[0])
  assert.ok(pixel(b, 7, 7)[0] < pixel(b, 8, 7)[0])
  assert.ok(pixel(b, 8, 7)[0] < pixel(b, 9, 7)[0])
  assert.deepEqual(pixel(b, 9, 7), pixel(a, 9, 7))
})

test('소매 패널에도 줄무늬를 도포하고 무릎 공유 변에서는 위아래 다리 줄무늬를 연속한다', () => {
  const data = regions({ width: 200, height: 200, helmet: [], jersey: [], sleeves: [quad(0, 0, 30, 200)], pants: [quad(40, 0, 160, 200)],
    panels: [
      { region: 'sleeve', polygon: quad(0, 0, 30, 200), topLeft: [0, 0], topRight: [30, 0], bottomLeft: [0, 200], bottomRight: [30, 200], repeats: 3, phase: 0.2, halfWidth: 0.03, fadeEdges: ['left', 'right'] },
      { region: 'pants', polygon: quad(40, 0, 160, 100), topLeft: [40, 0], topRight: [200, 0], bottomLeft: [40, 100], bottomRight: [200, 100], repeats: 5, phase: 0.2, halfWidth: 0.03, fadeEdges: ['left', 'right', 'top'] },
      { region: 'pants', polygon: quad(40, 100, 160, 100), topLeft: [40, 100], topRight: [200, 100], bottomLeft: [40, 200], bottomRight: [200, 200], repeats: 5, phase: 0.2, halfWidth: 0.03, fadeEdges: ['left', 'right', 'bottom'] },
    ],
  })
  const img = image(200, 200)
  for (let y = 0; y < 200; y++) for (let x = 40; x < 200; x++) setPixel(img, x, y, [245, 242, 238, 255])
  const result = paintBaseballUniform(img, { jersey: '#ffffff', stripe: '#30323a', pants: '#ffffff', pantsStripe: '#30323a', uniformProfile: 'twins-pilot-v1' }, data)
  assert.ok(result.counts.stripe > 0)
  assert.ok(Array.from({ length: 30 }, (_, x) => pixel(img, x, 50)[0]).some(value => value < 240))
  for (let x = 40; x < 200; x++) assert.deepEqual(pixel(img, x, 99), pixel(img, x, 100))
})

test('GG 원본 파란 옆선은 보호된 원본 이웃을 제외한 같은 원단 밝기로 복구한다', () => {
  const data = regions({ width: 40, height: 30, helmet: [], jersey: [], sleeves: [], pants: [quad(0, 0, 40, 30)],
    piping: [{ points: [[20.5, 0], [20.5, 30]], width: 2 }], protect: [quad(10, 12, 5, 5)],
  })
  const img = image(40, 30, [180, 175, 170, 255])
  for (let y = 0; y < 30; y++) setPixel(img, 20, y, [2, 7, 15, 255])
  for (let y = 12; y < 17; y++) for (let x = 10; x < 15; x++) setPixel(img, x, y, [255, 255, 255, 255])
  paintBaseballUniform(img, { pants: '#f5f3ed', pantsPiping: '#f5f3ed', uniformProfile: 'twins-pilot-v1' }, data)
  assert.deepEqual(pixel(img, 20, 14), pixel(img, 25, 14))
  assert.deepEqual(pixel(img, 12, 14), [255, 255, 255, 255])
})

test('GG 옆선 복구 범위에도 바지 핀스트라이프를 이어 빈 세로 띠를 만들지 않는다', () => {
  const polygon = quad(0, 0, 100, 30)
  const data = regions({ width: 100, height: 30, helmet: [], jersey: [], sleeves: [], pants: [polygon],
    piping: [{ points: [[50.5, 0], [50.5, 30]], width: 12 }],
    panels: [{ region: 'pants', polygon, topLeft: [0, 0], topRight: [100, 0], bottomLeft: [0, 30], bottomRight: [100, 30], repeats: 4, phase: 0, halfWidth: 0.045, fadeEdges: [] }],
  })
  const a = image(100, 30, [245, 242, 238, 255]), b = image(100, 30, [245, 242, 238, 255])
  for (let y = 0; y < 30; y++) for (const img of [a, b]) setPixel(img, 50, y, [12, 24, 50, 255])
  paintBaseballUniform(a, { pants: '#f5f3ed', pantsPiping: '#f5f3ed', uniformProfile: 'twins-pilot-v1' }, data)
  paintBaseballUniform(b, { pants: '#f5f3ed', pantsPiping: '#f5f3ed', pantsStripe: '#30323a', uniformProfile: 'twins-pilot-v1' }, data)
  assert.ok(pixel(b, 50, 14)[0] < pixel(a, 50, 14)[0])
})

test('XP 컬러 패널은 의복 안에서만 순서대로 덮고 피부·헬멧·바지·발 보호를 지킨다', () => {
  const data = regions({
    colorPanels: [
      { material: 'sleeve', polygon: quad(0, 0, 20, 20) },
      { material: 'secondary', polygon: quad(7, 5, 3, 6) },
      { material: 'accent', polygon: quad(7, 6, 3, 2) },
    ], protect: [quad(8, 6, 1, 1)],
  })
  const feet = { lead: { outline: quad(5, 16, 5, 3) } }
  const mask = compileBaseballUniformMask(data, { feet })
  const at = (x, y) => mask[y * 20 + x]
  assert.equal(at(1, 6), L.outside)
  assert.equal(at(4, 2), L.helmet)
  assert.equal(at(4, 6), L.sleeve)
  assert.equal(at(7, 9), L.secondary)
  assert.equal(at(7, 6), L.accent)
  assert.equal(at(8, 6), L.outside)
  assert.equal(at(4, 14), L.pants)
  assert.equal(at(6, 17), L.outside)
})

test('XP 아이보리 소맷단은 마지막 jersey 트림으로 민트 띠 위에 얇게 표현한다', () => {
  const data = regions({ colorPanels: [{ material: 'sleeve', polygon: quad(2, 5, 12, 6) }],
    trim: [
      { points: [[2, 8.5], [14, 8.5]], width: 5, material: 'secondary' },
      { points: [[2, 8.5], [14, 8.5]], width: 1, material: 'jersey' },
    ],
  })
  const img = image()
  paintBaseballUniform(img, { jersey: '#f0eee5', sleeve: '#1c3856', secondary: '#82b9b1', uniformProfile: 'dinos-pilot-v1' }, data)
  assert.deepEqual(pixel(img, 8, 8), [240, 238, 229, 255])
  assert.deepEqual(pixel(img, 8, 7), [130, 185, 177, 255])
  assert.deepEqual(pixel(img, 8, 5), [28, 56, 86, 255])
})

test('XP 흰 몸통만 그림자를 밝히고 navy·gold·mint 원단의 기존 음영은 유지한다', () => {
  const data = regions({ colorPanels: [
    { material: 'sleeve', polygon: quad(2, 5, 3, 6) },
    { material: 'accent', polygon: quad(6, 5, 2, 6) },
    { material: 'secondary', polygon: quad(9, 5, 2, 6) },
  ] })
  const a = image(20, 20, [24, 50, 100, 255]), b = image(20, 20, [24, 50, 100, 255])
  const colors = { jersey: '#f0eee5', sleeve: '#1c3856', accent: '#b6a06b', secondary: '#82b9b1' }
  paintBaseballUniform(a, colors, data)
  paintBaseballUniform(b, { ...colors, uniformProfile: 'dinos-pilot-v1' }, data)
  assert.ok(pixel(b, 12, 7)[0] > pixel(a, 12, 7)[0])
  for (const x of [3, 6, 9]) assert.deepEqual(pixel(a, x, 7), pixel(b, x, 7))
})

test('컬러 패널은 의복 외 재질명과 원본 범위 밖 좌표를 거부한다', () => {
  assert.throws(() => compileBaseballUniformMask(regions({ colorPanels: [{ material: 'skin', polygon: quad(1, 1, 2, 2) }] })), /material/)
  assert.throws(() => compileBaseballUniformMask(regions({ colorPanels: [{ material: 'sleeve', polygon: quad(19, 19, 2, 2) }] })), /coordinates/)
})

test('XP16프레임은 별도 영역을 엄격하게 선택하고 PGG·기준 의상 테이블을 유지한다', () => {
  for (const handedness of ['right', 'left']) for (const name of BASEBALL_BATTER_FRAME_NAMES) {
    const frame = getBaseballBatterFrames(handedness)[name]
    const input = { handedness, name, src: frame.src }
    const baseline = getBaseballUniformRegions(input)
    const pgg = getBaseballUniformRegions({ ...input, uniformProfile: 'heroes-pilot-v1' })
    const xp = getBaseballUniformRegions({ ...input, uniformProfile: 'dinos-pilot-v1' })
    assert.notEqual(xp, baseline)
    assert.notEqual(xp, pgg)
    assert.equal(xp.src, frame.src)
    assert.ok(xp.colorPanels.length >= 1)
    assert.ok(xp.trim.some(path => path.material === 'jersey'))
    assert.equal(baseline.colorPanels, undefined)
    assert.equal(pgg.colorPanels, undefined)
    const mask = compileBaseballUniformMask(xp, { feet: frame.feet })
    for (const material of ['jersey', 'sleeve', 'accent', 'secondary', 'helmet', 'pants']) assert.ok(mask.includes(L[material]), `${handedness}/${name}: ${material}`)
    assert.throws(() => getBaseballUniformRegions({ ...input, src: '/missing.png', uniformProfile: 'dinos-pilot-v1' }), /mismatched/)
  }
})

function compressionRegions(overrides = {}) {
  const polygon = quad(2, 2, 14, 16)
  return { src: '/test.png', width: 20, height: 20, panels: [{ polygon, topLeft: [2, 2], topRight: [16, 2], bottomLeft: [2, 18], bottomRight: [16, 18] }], protect: [], ...overrides }
}
const grayTexture = () => image(8, 8, [128, 128, 128, 255])

test('헬멧 장식은 실제 헬멧 안에서만 칠하고 얼굴 보호와 다른 의복을 유지한다', () => {
  const data = regions({ helmetTrim: [{ points: [[0, 2.5], [20, 2.5]], width: 1, material: 'accent' }], protect: [quad(5, 2, 1, 1)] })
  const mask = compileBaseballUniformMask(data)
  assert.equal(mask[2 * 20 + 4], L.accent)
  assert.equal(mask[2 * 20 + 5], L.outside)
  assert.equal(mask[2 * 20 + 10], L.outside)
  assert.equal(mask[6 * 20 + 7], L.jersey)
})

test('이너 레이어는 손·장갑·배트·발·낮은 alpha와 영역 밖 모든 바이트를 보존한다', () => {
  const data = compressionRegions({ protect: [quad(6, 6, 3, 3)] })
  const feet = { lead: { outline: quad(5, 15, 5, 3) } }
  const img = image(20, 20, [210, 140, 95, 255])
  setPixel(img, 12, 7, [210, 140, 95, 12])
  const before = img.data.slice(), mask = compileBaseballUndersleeveMask(data, { feet })
  const result = paintBaseballUndersleeves(img, { undersleeve: '#cf2639' }, data, { texture: grayTexture(), feet })
  let changed = 0
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4
    assert.equal(img.data[p + 3], before[p + 3])
    if (!mask[i] || before[p + 3] < 32) assert.deepEqual(img.data.slice(p, p + 4), before.slice(p, p + 4))
    if (img.data[p] !== before[p] || img.data[p + 1] !== before[p + 1] || img.data[p + 2] !== before[p + 2]) changed++
  }
  assert.equal(result.changed, changed)
  assert.equal(result.counts.painted, changed)
  assert.equal(result.counts.transparent, 1)
})

test('상수 피부톤의 색상이 원단 hue로 전달되지 않으며 약한 원통·팔꿈치 주름을 표현한다', () => {
  const data = compressionRegions()
  const a = image(20, 20, [220, 150, 110, 255]), b = image(20, 20, [12, 180, 230, 255])
  for (const img of [a, b]) paintBaseballUndersleeves(img, { undersleeve: '#cf2639' }, data, { texture: grayTexture() })
  const mask = compileBaseballUndersleeveMask(data)
  for (let i = 0; i < mask.length; i++) if (mask[i]) assert.deepEqual(a.data.slice(i * 4, i * 4 + 4), b.data.slice(i * 4, i * 4 + 4))
  assert.ok(pixel(a, 2, 5)[0] < pixel(a, 8, 5)[0])
  assert.ok(pixel(a, 8, 9)[0] < pixel(a, 8, 5)[0])
})

test('원단 UV는 이동한 팔 패널을 따르고 겹친 패널을 중복 도포하지 않는다', () => {
  const texture = grayTexture()
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) setPixel(texture, x, y, [(x + y) % 2 ? 145 : 110, (x + y) % 2 ? 145 : 110, (x + y) % 2 ? 145 : 110, 255])
  const a = image(30, 20), b = image(30, 20)
  const dataA = compressionRegions({ width: 30 }), dataB = structuredClone(dataA)
  for (const panel of dataB.panels) {
    panel.polygon.forEach(point => { point[0] += 7 })
    for (const field of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) panel[field][0] += 7
  }
  dataA.panels.push(structuredClone(dataA.panels[0]))
  const result = paintBaseballUndersleeves(a, { undersleeve: '#202d48' }, dataA, { texture })
  paintBaseballUndersleeves(b, { undersleeve: '#202d48' }, dataB, { texture })
  for (let y = 2; y < 18; y++) for (let x = 2; x < 16; x++) assert.deepEqual(pixel(a, x, y), pixel(b, x + 7, y))
  assert.equal(result.counts.painted, 14 * 16)
})

test('이너가 없는 구단은 원단 없이도 바이트를 보존하며 잘못된 의상·원단은 구분한다', () => {
  const img = image(), before = img.data.slice(), data = compressionRegions()
  assert.equal(paintBaseballUndersleeves(img, {}, data).changed, 0)
  assert.deepEqual(img.data, before)
  assert.throws(() => paintBaseballUndersleeves(img, { undersleeve: 'red' }, data, { texture: grayTexture() }), /color/)
  assert.throws(() => paintBaseballUndersleeves(img, { undersleeve: '#181c22' }, data), /texture/)
  assert.throws(() => compileBaseballUndersleeveMask(compressionRegions({ panels: [{ ...data.panels[0], vStart: 0.5, vEnd: 0.4 }] })), /vEnd/)
  assert.throws(() => compileBaseballUndersleeveMask(compressionRegions({ panels: [{ ...data.panels[0], repeatV: 0 }] })), /repeat/)
})

test('이너 광원은 같은 luminance의 다른 chroma에서 같고 피부 고주파를 전달하지 않는다', () => {
  const data = compressionRegions()
  const a = image(20, 20), b = image(20, 20)
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const value = 90 + x * 4
    setPixel(a, x, y, [value, value, value, 255])
    // 0.2126*17 - 0.7152*10 + 0.0722*49 = 0.
    setPixel(b, x, y, [value + 17, value - 10, value + 49, 255])
  }
  for (const img of [a, b]) paintBaseballUndersleeves(img, { undersleeve: '#cf2639' }, data, { texture: grayTexture() })
  const mask = compileBaseballUndersleeveMask(data)
  for (let i = 0; i < mask.length; i++) if (mask[i]) for (let c = 0; c < 3; c++) assert.ok(Math.abs(a.data[i * 4 + c] - b.data[i * 4 + c]) <= 1)
  const checker = image(20, 20), flat = image(20, 20, [130, 130, 130, 255])
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const gray = (x + y) % 2 ? 180 : 80
    setPixel(checker, x, y, [gray, gray, gray, 255])
  }
  for (const img of [checker, flat]) paintBaseballUndersleeves(img, { undersleeve: '#cf2639' }, data, { texture: grayTexture() })
  for (let y = 6; y < 14; y++) for (let x = 6; x < 12; x++) assert.ok(Math.abs(pixel(checker, x, y)[0] - pixel(flat, x, y)[0]) <= 2)
})

test('보호된 밝은 장갑·어두운 배트가 팔 원단의 저주파 광원에 섞이지 않는다', () => {
  const data = compressionRegions({ protect: [quad(7, 6, 4, 5)] })
  const a = image(20, 20, [130, 130, 130, 255]), b = image(20, 20, [130, 130, 130, 255])
  for (let y = 6; y < 11; y++) for (let x = 7; x < 11; x++) { setPixel(a, x, y, [255, 255, 255, 255]); setPixel(b, x, y, [0, 0, 0, 255]) }
  for (const img of [a, b]) paintBaseballUndersleeves(img, { undersleeve: '#181c22' }, data, { texture: grayTexture() })
  const mask = compileBaseballUndersleeveMask(data)
  for (let i = 0; i < mask.length; i++) if (mask[i]) assert.deepEqual(a.data.slice(i * 4, i * 4 + 4), b.data.slice(i * 4, i * 4 + 4))
})

test('10팀의16활성자세를 모두 읽고 CLUB 전용 배색·이너4팀을 구분한다', () => {
  assert.deepEqual(BASEBALL_TEAMS.filter(team => team.undersleeve).map(team => team.id), ['wiz', 'tigers', 'twins', 'bears'])
  const keys = BASEBALL_TEAMS.map(getBaseballUniformMaterialKey)
  assert.equal(new Set(keys).size, 10)
  for (const handedness of ['right', 'left']) for (const name of BASEBALL_BATTER_FRAME_NAMES) {
    const frame = getBaseballBatterFrames(handedness)[name]
    const input = { handedness, name, src: frame.src }
    const sleeves = getBaseballUndersleeveRegions(input)
    assert.equal(sleeves.src, frame.src)
    assert.equal(sleeves.panels.length, 4)
    assert.ok(compileBaseballUndersleeveMask(sleeves, { feet: frame.feet }).includes(1), `${handedness}/${name}: sleeve coverage`)
    for (const team of BASEBALL_TEAMS) {
      const geometry = getBaseballUniformRegions({ ...input, uniformProfile: team.uniformProfile })
      const mask = compileBaseballUniformMask(geometry, { feet: frame.feet })
      assert.equal(mask.length, frame.width * frame.height)
      for (const field of ['colorPanels', 'trim', 'helmetTrim']) for (const item of geometry[field] || []) assert.ok(!item.profiles || item.profiles.includes(team.uniformProfile))
      if (team.id === 'eagles') assert.ok(geometry.colorPanels.some(panel => panel.material === 'sleeve'))
      if (team.id === 'giants') assert.ok(geometry.colorPanels.some(panel => panel.material === 'secondary'))
    }
  }
  assert.throws(() => getBaseballUndersleeveRegions({ handedness: 'right', name: 'ready', src: '/wrong.png' }), /mismatched/)
})
