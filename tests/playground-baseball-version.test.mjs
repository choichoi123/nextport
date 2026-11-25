import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  BASEBALL_ENGINE_SOURCE_FILES, BASEBALL_PRESENTATION_SOURCE_FILES,
  canonicalBaseballVersionJson, normalizeBaseballVersionSource,
  hashBaseballVersionContent, createBaseballDataVersions, isBaseballLegacyV1DataVersion,
} from '../lib/server/baseball-version.mjs'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES } from '../lib/playground-baseball.mjs'

const sha = /^[a-f0-9]{64}$/
const source = async file => readFile(new URL(`../${file}`, import.meta.url))

test('실행 파일과 규칙 내용의 SHA256을 사용하고 미커밋 Git HEAD에 의존하지 않는다', async () => {
  const versions = await createBaseballDataVersions({ readSource:source })
  assert.equal(versions.schemaVersion, 1)
  assert.equal(versions.engine.algorithm, 'sha256')
  assert.deepEqual(versions.engine.files.map(file => file.path), BASEBALL_ENGINE_SOURCE_FILES)
  for (const entry of [...versions.engine.files, ...versions.presentation.files]) {
    assert.match(entry.hash, sha)
    assert.equal(entry.hash, hashBaseballVersionContent(normalizeBaseballVersionSource(await source(entry.path))))
    assert.equal(entry.path.includes(':'), false)
    assert.equal(entry.path.includes('..'), false)
  }
  assert.equal(versions.engine.hash, hashBaseballVersionContent(canonicalBaseballVersionJson(versions.engine.files)))
  assert.equal(versions.presentation.hash, hashBaseballVersionContent(canonicalBaseballVersionJson(versions.presentation.files)))
  assert.equal(versions.rules.hash, hashBaseballVersionContent(canonicalBaseballVersionJson(versions.rules.snapshot)))
})

test('LF와 CRLF 소스는 같은 엔진·화면 버전이며 실제 코드 변경은 해당 해시만 바꾼다', async () => {
  const lf = await createBaseballDataVersions({ readSource:async file => normalizeBaseballVersionSource(await source(file)) })
  const crlf = await createBaseballDataVersions({ readSource:async file => normalizeBaseballVersionSource(await source(file)).replaceAll('\n', '\r\n') })
  assert.deepEqual(lf, crlf)
  const changedEngine = await createBaseballDataVersions({ readSource:async file => `${normalizeBaseballVersionSource(await source(file))}${file === BASEBALL_ENGINE_SOURCE_FILES[0] ? '\n// changed engine' : ''}` })
  assert.notEqual(changedEngine.engine.hash, lf.engine.hash)
  assert.equal(changedEngine.presentation.hash, lf.presentation.hash)
  assert.equal(changedEngine.rules.hash, lf.rules.hash)
  const changedScene = await createBaseballDataVersions({ readSource:async file => `${normalizeBaseballVersionSource(await source(file))}${file === 'components/playground/baseball-scene.js' ? '\n// changed scene' : ''}` })
  assert.notEqual(changedScene.presentation.hash, lf.presentation.hash)
  assert.equal(changedScene.engine.hash, lf.engine.hash)
})

test('8cm·110ms·4구종 스냅샷은 JSON 안전 복사이며 기존 설정을 변형하지 않는다', async () => {
  const versions = await createBaseballDataVersions({ readSource:source })
  assert.equal(versions.rules.id, 'baseball-fixed-center-8cm-v2')
  assert.equal(versions.rules.snapshot.rules.batActiveStartMs, 0)
  assert.equal(versions.rules.snapshot.rules.ballRadiusM, .04)
  assert.equal(versions.rules.snapshot.rules.swingContactMs, 110)
  assert.deepEqual(versions.rules.snapshot.rules, BASEBALL_RULES)
  assert.deepEqual(versions.rules.snapshot.pitchTypes, BASEBALL_PITCH_TYPES)
  assert.notEqual(versions.rules.snapshot.rules, BASEBALL_RULES)
  assert.notEqual(versions.rules.snapshot.pitchTypes, BASEBALL_PITCH_TYPES)
  assert.equal(Object.isFrozen(versions.rules.snapshot.pitchTypes[0].acceleration), true)
  assert.throws(() => { versions.rules.snapshot.rules.ballRadiusM = 1 }, TypeError)
  assert.deepEqual(JSON.parse(JSON.stringify(versions)), versions)
})

test('구버전 호환은 확정된 v1 엔진·규칙과 검토한 현재 엔진에서만 허용한다', async () => {
  const current = await createBaseballDataVersions({ readSource:source })
  const legacy = JSON.parse(JSON.stringify(current))
  legacy.engine = { algorithm:'sha256', hash:'9ce1dd986b9d3f00bbc3c42ee89c346bd87ecead5d760eb5e4fc8063f2874f32',
    files:[{ path:'lib/playground-baseball.mjs', hash:'d095122187b7f637b4f547e9817ab2bfdbc6eefb6bc98556b855d13e537939f4' }] }
  legacy.rules.id = 'baseball-fixed-center-8cm-v1'
  legacy.rules.snapshot.rules.batActiveStartMs = 20
  legacy.rules.hash = 'f058ccdf82c8cd06f458421a2de09e5a03d0444f9d817cc82465193f70c095c5'
  const before = JSON.parse(JSON.stringify(legacy))
  assert.equal(isBaseballLegacyV1DataVersion(legacy, current), true)
  assert.deepEqual(legacy, before)
  assert.equal(isBaseballLegacyV1DataVersion(current, current), false)
  for (const mutate of [
    value => { value.engine.hash = 'f'.repeat(64) },
    value => { value.engine.files[0].hash = 'f'.repeat(64) },
    value => { value.rules.id = 'baseball-fixed-center-8cm-v2' },
    value => { value.rules.snapshot.rules.batActiveStartMs = 0 },
    value => { value.rules.hash = 'f'.repeat(64) },
  ]) {
    const altered = JSON.parse(JSON.stringify(legacy)); mutate(altered)
    assert.equal(isBaseballLegacyV1DataVersion(altered, current), false)
  }
  const nextEngine = JSON.parse(JSON.stringify(current)); nextEngine.engine.hash = 'f'.repeat(64)
  assert.equal(isBaseballLegacyV1DataVersion(legacy, nextEngine), false)
  const nextRules = JSON.parse(JSON.stringify(current)); nextRules.rules.snapshot.rules.batActiveEndMs += 1
  assert.equal(isBaseballLegacyV1DataVersion(legacy, nextRules), false)
})

test('버전 계산은 고정된 공개 소스만 읽고 실패를 가짜 정상 버전으로 대체하지 않는다', async () => {
  const requested = []
  await createBaseballDataVersions({ readSource:async file => { requested.push(file); return 'public source\n' } })
  assert.deepEqual(requested.sort(), [...BASEBALL_ENGINE_SOURCE_FILES,...BASEBALL_PRESENTATION_SOURCE_FILES].sort())
  assert.equal(requested.some(file => /env|token|secret|\.git|notion|sprint/i.test(file)), false)
  await assert.rejects(createBaseballDataVersions({ readSource:async () => { throw Error('missing source') } }), /missing source/)
  assert.equal(normalizeBaseballVersionSource('a\rb\r\nc\n'), 'a\nb\nc\n')
  assert.throws(() => normalizeBaseballVersionSource(new Uint8Array([0xff])), TypeError)
})

test('정규 JSON은 객체 키 순서에 독립적이고 배열 순서와 값은 보존한다', () => {
  assert.equal(canonicalBaseballVersionJson({ b:2,a:{ d:4,c:3 } }), canonicalBaseballVersionJson({ a:{ c:3,d:4 },b:2 }))
  assert.notEqual(canonicalBaseballVersionJson([1,2]), canonicalBaseballVersionJson([2,1]))
})

test('Node 버전 도우미는 페이지의 서버 정적 props에서만 호출한다', async () => {
  const page = (await source('pages/playground/baseball.js')).toString('utf8')
  assert.match(page, /export async function getStaticProps\(\)/)
  assert.match(page, /await import\('@\/lib\/server\/baseball-version\.mjs'\)/)
  assert.match(page, /dataVersions=\{baseballVersions\}/)
  const clientPart = page.split('export async function getStaticProps')[0]
  assert.equal(clientPart.includes('node:fs'), false)
  assert.equal(clientPart.includes('node:crypto'), false)
  assert.equal(clientPart.includes('import { createBaseballDataVersions'), false)
})
