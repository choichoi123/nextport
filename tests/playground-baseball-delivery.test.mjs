import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import sharp from 'sharp'
import { getBaseballBatterFrames } from '../lib/playground-baseball-animation.mjs'
import { getBaseballUniformRegions } from '../lib/playground-baseball-uniform.mjs'
import { BASEBALL_BATTER_DELIVERIES, BASEBALL_SHARED_DELIVERIES, getBaseballBatterDeliverySrc, getBaseballSharedDeliverySrc } from '../lib/playground-baseball-delivery.mjs'
import { BASEBALL_COMPRESSION_TEXTURE } from '../lib/playground-baseball-cloth.mjs'

const fileFor = src => new URL(`../public${src}`, import.meta.url)

test('Sharp 파일 디코딩에서16개 전송 이미지의 전체 RGBA·alpha·투명 RGB가 원본과 같다', async () => {
  let sourceBytes = 0, deliveryBytes = 0
  const sources = new Set(), targets = new Set()
  for (const handedness of ['right', 'left']) for (const [name, frame] of Object.entries(getBaseballBatterFrames(handedness))) {
    const target = getBaseballBatterDeliverySrc(frame)
    sources.add(frame.src); targets.add(target)
    assert.equal(getBaseballUniformRegions({ handedness, name, src:frame.src }).src, frame.src)
    const [original, delivered] = await Promise.all([
      sharp(readFileSync(fileFor(frame.src))).ensureAlpha().raw().toBuffer({ resolveWithObject:true }),
      sharp(readFileSync(fileFor(target))).ensureAlpha().raw().toBuffer({ resolveWithObject:true }),
    ])
    assert.equal(delivered.info.width, frame.width)
    assert.equal(delivered.info.height, frame.height)
    assert.equal(delivered.info.channels, 4)
    assert.ok(original.data.equals(delivered.data), `${handedness}/${name}: includes alpha-zero RGB`)
    sourceBytes += statSync(fileFor(frame.src)).size
    deliveryBytes += statSync(fileFor(target)).size
  }
  assert.equal(sources.size, 16)
  assert.equal(targets.size, 16)
  assert.deepEqual(new Set(Object.keys(BASEBALL_BATTER_DELIVERIES)), sources)
  assert.ok(deliveryBytes < sourceBytes)
})

test('미등록 소스·다른 크기를 원본으로 조용히 대체하지 않는다', () => {
  assert.throws(() => getBaseballBatterDeliverySrc('/missing.png'), /Missing verified/)
  const frame = getBaseballBatterFrames('right').ready
  assert.throws(() => getBaseballBatterDeliverySrc({ ...frame, width:512 }), /dimensions/)
  assert.equal(getBaseballBatterDeliverySrc(frame), getBaseballBatterDeliverySrc(frame.src))
  assert.ok(Object.isFrozen(BASEBALL_BATTER_DELIVERIES))
})

test('256 원단 파일은 보존된 원본의 Sharp pre-bake와 decoded 픽셀 손실이 없다', async () => {
  const original = fileFor('/images/playground/baseball/materials/20261124/compression-knit-gray-v1.png')
  const target = fileFor(BASEBALL_COMPRESSION_TEXTURE)
  const preBake = await sharp(readFileSync(original)).resize(256, 256, { fit:'fill', kernel:'lanczos3' }).ensureAlpha().raw().toBuffer()
  const delivered = await sharp(readFileSync(target)).ensureAlpha().raw().toBuffer({ resolveWithObject:true })
  assert.equal(delivered.info.width, 256)
  assert.equal(delivered.info.height, 256)
  assert.ok(preBake.equals(delivered.data))
  assert.ok(statSync(target).size < statSync(original).size)
})

test('공통 배경·투수 전송본은 치수·전체 RGBA·투명 RGB를 보존하며 각각 더 작다', async () => {
  const entries = Object.entries(BASEBALL_SHARED_DELIVERIES)
  assert.equal(entries.length, 2)
  const targets = new Set()
  let sourceBytes = 0, deliveryBytes = 0
  for (const [source, record] of entries) {
    const target = getBaseballSharedDeliverySrc(source)
    targets.add(target)
    const [original, delivered] = await Promise.all([
      sharp(readFileSync(fileFor(source))).ensureAlpha().raw().toBuffer({ resolveWithObject:true }),
      sharp(readFileSync(fileFor(target))).ensureAlpha().raw().toBuffer({ resolveWithObject:true }),
    ])
    assert.deepEqual([original.info.width, original.info.height], [record.width, record.height])
    assert.deepEqual([delivered.info.width, delivered.info.height, delivered.info.channels], [record.width, record.height, 4])
    assert.equal(delivered.data.length, record.width * record.height * 4)
    assert.ok(original.data.equals(delivered.data), `${source}: includes alpha-zero RGB`)
    const sourceSize = statSync(fileFor(source)).size, deliverySize = statSync(fileFor(target)).size
    assert.ok(deliverySize < sourceSize, source)
    sourceBytes += sourceSize; deliveryBytes += deliverySize
  }
  assert.equal(targets.size, 2)
  assert.ok(deliveryBytes < sourceBytes)
})

test('공통 전송본도 미등록·상속 키·크기 불일치를 원본으로 대체하지 않는다', () => {
  for (const source of ['/missing.png', '__proto__', 'constructor', null, undefined]) {
    assert.throws(() => getBaseballSharedDeliverySrc(source), /Missing verified shared/)
  }
  for (const [src, record] of Object.entries(BASEBALL_SHARED_DELIVERIES)) {
    assert.equal(getBaseballSharedDeliverySrc({ src, width:record.width, height:record.height }), record.src)
    assert.throws(() => getBaseballSharedDeliverySrc({ src, width:record.width - 1, height:record.height }), /dimensions/)
    assert.throws(() => getBaseballSharedDeliverySrc({ src, width:record.width, height:record.height - 1 }), /dimensions/)
    assert.ok(Object.isFrozen(record))
  }
  assert.ok(Object.isFrozen(BASEBALL_SHARED_DELIVERIES))
})
