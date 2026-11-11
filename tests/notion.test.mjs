import test from 'node:test'
import assert from 'node:assert/strict'
import { getNotionProjects } from '../lib/notion.mjs'

const config = { token: 'test-token', databaseId: 'test-database' }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status })

test('설정이 없으면 외부 요청 없이 빈 목록을 반환한다', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('외부 요청이 발생하면 안 됩니다.') })
  assert.deepEqual(await getNotionProjects(), { results: [] })
})

test('일부 설정만 있으면 필요한 환경변수를 안내한다', async () => {
  for (const partial of [{ token: 'token' }, { databaseId: 'id' }, { dataSourceId: 'id' }]) {
    await assert.rejects(getNotionProjects(partial), /Notion 설정이 불완전.*NOTION_TOKEN/)
  }
})

test('기존 DB ID로 데이터 소스를 찾아 올바른 API 버전과 인증으로 조회한다', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return calls.length === 1
      ? response({ data_sources: [{ id: 'project-source' }] })
      : response({ results: [{ id: 'project-1' }], has_more: false })
  })

  assert.deepEqual(await getNotionProjects(config), { results: [{ id: 'project-1' }] })
  assert.equal(calls[0].url, 'https://api.notion.com/v1/databases/test-database')
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[1].url, 'https://api.notion.com/v1/data_sources/project-source/query')
  assert.equal(calls[1].options.method, 'POST')
  for (const { options } of calls) {
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    assert.equal(options.headers['Notion-Version'], '2025-09-03')
    assert.ok(options.signal instanceof AbortSignal)
  }
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    sorts: [{ property: 'Name', direction: 'ascending' }], page_size: 100,
  })
})

test('명시한 데이터 소스를 사용하고 100개 이후의 프로젝트도 합친다', async (t) => {
  const bodies = []
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `project-${index}` }))
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.notion.com/v1/data_sources/chosen-source/query')
    bodies.push(JSON.parse(options.body))
    return bodies.length === 1
      ? response({ results: firstPage, has_more: true, next_cursor: 'next-page' })
      : response({ results: [{ id: 'project-100' }], has_more: false, next_cursor: null })
  })

  const projects = await getNotionProjects({ token: 'test-token', dataSourceId: 'chosen-source' })
  assert.equal(projects.results.length, 101)
  assert.equal(projects.results[100].id, 'project-100')
  assert.equal(bodies[0].start_cursor, undefined)
  assert.equal(bodies[1].start_cursor, 'next-page')
})

test('데이터 소스가 여러 개면 임의로 고르지 않고 선택 설정을 안내한다', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response({ data_sources: [{ id: 'a' }, { id: 'b' }] }))
  await assert.rejects(getNotionProjects(config), /NOTION_DATA_SOURCE_ID/)
})

test('인증과 권한 등 HTTP 오류를 안내하고 토큰이나 원본 오류 본문은 노출하지 않는다', async (t) => {
  for (const [status, expected] of [[400, /Name/], [401, /NOTION_TOKEN/], [403, /읽기 권한/], [404, /연결 추가/], [429, /요청 한도/], [500, /다시 시도/]]) {
    await t.test(`HTTP ${status}`, async (subtest) => {
      subtest.mock.method(globalThis, 'fetch', async () => response({ message: 'test-token' }, status))
      await assert.rejects(getNotionProjects(config), (error) => {
        assert.match(error.message, new RegExp(`HTTP ${status}`))
        assert.match(error.message, expected)
        assert.doesNotMatch(error.message, /test-token/)
        return true
      })
    })
  }
})

test('네트워크 오류와 시간 초과를 읽을 수 있는 오류로 변환한다', async (t) => {
  for (const [error, expected] of [[new TypeError('fetch failed'), /연결할 수 없습니다/], [new DOMException('timeout', 'TimeoutError'), /시간이 초과/]]) {
    await t.test(error.name, async (subtest) => {
      subtest.mock.method(globalThis, 'fetch', async () => { throw error })
      await assert.rejects(getNotionProjects(config), expected)
    })
  }
})

test('잘못된 JSON과 목록 형식을 빈 프로젝트 목록으로 숨기지 않는다', async (t) => {
  await t.test('JSON 오류', async (subtest) => {
    subtest.mock.method(globalThis, 'fetch', async () => new Response('not json'))
    await assert.rejects(getNotionProjects(config), /응답을 읽을 수 없습니다/)
  })
  await t.test('목록 누락', async (subtest) => {
    subtest.mock.method(globalThis, 'fetch', async () => response({}))
    await assert.rejects(getNotionProjects({ token: 'token', dataSourceId: 'source' }), /응답 형식/)
  })
})

test('잘못되거나 반복된 다음 페이지 커서로 무한 요청하지 않는다', async (t) => {
  for (const cursor of [null, '', 'repeated-cursor']) {
    await t.test(`커서: ${cursor}`, async (subtest) => {
      let calls = 0
      subtest.mock.method(globalThis, 'fetch', async () => {
        calls++
        return response({ results: [], has_more: true, next_cursor: cursor })
      })
      await assert.rejects(getNotionProjects({ token: 'token', dataSourceId: 'source' }), /다음 페이지/)
      assert.ok(calls <= 2)
    })
  }
})
