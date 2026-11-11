import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPortfolioPreview, selectFeaturedProjects } from '../lib/portfolio-preview.mjs'

const connection = { token: 'test-token', dataSourceId: 'test-source' }
const text = (value) => [{ plain_text: value }]
const notionPage = (overrides = {}) => ({
  id: 'project-id',
  url: 'https://www.notion.so/project-id',
  properties: {
    Name: { title: text('실제 프로젝트') },
    Description: { rich_text: text('서버에서 읽은 설명입니다.') },
    Tags: { multi_select: [{ name: 'React' }] },
    WorkPeriod: { date: { start: '2026-08-20', end: '2026-11-10' } },
  },
  ...overrides,
})
const loadPages = (pages) => loadPortfolioPreview(connection, { getProjects: async () => ({ results: pages }) })

test('실제 목록은 지정한 대표작을 ID로 선택하고 원본 내용과 목록 순서는 변경하지 않는다', () => {
  const wiseop = Object.freeze({ id: '4144C6DB-1675-8078-A2C5-D4F55A1BA51C', title: '서버의 현재 제목' })
  const paju = Object.freeze({ id: '4154c6db-1675-80b8-afeb-cdc51b0c949f' })
  const eksys = Object.freeze({ id: 'fba4c6db16758282868481b2e939c83b' })
  const saas = Object.freeze({ id: '5e14c6db-1675-83f1-becc-0152a06b5485' })
  const first = Object.freeze({ id: 'first' })
  const projects = Object.freeze([first, saas, { id: 'other' }, eksys, wiseop, paju, { id: 'last' }])
  const selected = selectFeaturedProjects(projects, 'notion')
  assert.deepEqual(selected, [wiseop, paju, eksys])
  assert.equal(selected[0], wiseop)
  assert.equal(projects[0], first)
  assert.equal(projects[4], wiseop)
})

test('없는 대표작은 원래 목록 순서로 채우고 같은 ID의 중복은 한 번만 표시한다', () => {
  const first = { id: 'first' }
  const wiseop = { id: '4144c6db16758078a2c5d4f55a1ba51c' }
  const duplicate = { id: '4144c6db-1675-8078-a2c5-d4f55a1ba51c' }
  const saas = { id: '5e14c6db167583f1becc0152a06b5485' }
  const projects = [first, wiseop, duplicate, { id: 'second' }, saas]
  assert.deepEqual(selectFeaturedProjects(projects), [wiseop, first, { id: 'second' }])
  assert.deepEqual(selectFeaturedProjects([first, { id: 'second' }, { id: 'third' }, { id: 'fourth' }]), [first, { id: 'second' }, { id: 'third' }])
  assert.deepEqual(selectFeaturedProjects([]), [])
  assert.deepEqual(selectFeaturedProjects([first]), [first])
})

test('예시 모드는 대표 ID와 관계없이 전달된 예시 순서를 유지하며 최대 세 개만 표시한다', () => {
  const projects = [
    { id: 'example-first' },
    { id: '5e14c6db167583f1becc0152a06b5485' },
    { id: 'example-third' },
    { id: '4144c6db16758078a2c5d4f55a1ba51c' },
  ]
  assert.deepEqual(selectFeaturedProjects(projects, 'example'), projects.slice(0, 3))
})

test('모든 연결 설정이 비었을 때만 외부 조회 없이 명시적인 예시를 제공한다', async () => {
  for (const config of [undefined, {}, { token: ' ', databaseId: '', dataSourceId: '\t' }]) {
    const result = await loadPortfolioPreview(config, {
      getProjects: () => { throw new Error('예시 모드에서는 조회하면 안 됩니다.') },
    })
    assert.equal(result.source, 'example')
    assert.deepEqual(result.projects.map((project) => project.id), ['preview-wiseop', 'preview-paju', 'preview-eksys'])
    assert.ok(result.projects.every((project) => project.href === null && project.cover === null
      && project.github === null && project.youtube === null))
    assert.equal(result.projects[0].period, '2026.08–2026.11')
    assert.equal(result.projects[1].period, '2026.02–2026.05')
    assert.doesNotMatch(JSON.stringify(result.projects[1]), /OTP|Excel|유지보수/)
  }
})

test('예시 반환값의 수정이 다음 요청의 예시에 남지 않는다', async () => {
  const first = await loadPortfolioPreview()
  first.projects[0].title = '변경한 제목'
  first.projects[0].tags.push('추가 태그')
  const second = await loadPortfolioPreview()
  assert.notEqual(second.projects[0].title, first.projects[0].title)
  assert.ok(!second.projects[0].tags.includes('추가 태그'))
})

test('일부 설정은 구성 오류를 전달하며 예시로 대체하지 않는다', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('불완전한 설정에서 외부 요청하면 안 됩니다.') })
  for (const config of [{ token: 'token' }, { databaseId: 'database' }, { dataSourceId: 'source' }]) {
    await assert.rejects(loadPortfolioPreview(config), /Notion 설정이 불완전/)
  }
})

test('잘못된 타입의 설정을 무설정으로 취급하여 예시를 표시하지 않는다', async () => {
  for (const config of [{ token: 0 }, { databaseId: false }, { dataSourceId: {} }]) {
    await assert.rejects(loadPortfolioPreview(config), /설정은 문자열/)
  }
})

test('실제 조회 경로의 인증 실패를 빈 목록이나 예시로 숨기지 않는다', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"message":"원본 오류"}', { status: 401 }))
  await assert.rejects(loadPortfolioPreview(connection), /Notion 요청 실패 \(HTTP 401\)/)
})

test('조회 오류를 그대로 전달하고 설정값을 정리하여 기존 조회 함수에 넘긴다', async () => {
  const failure = new Error('조회 실패')
  let received
  await assert.rejects(loadPortfolioPreview({ token: ' token ', databaseId: ' database ', dataSourceId: ' source ' }, {
    getProjects: async (config) => { received = config; throw failure },
  }), (error) => error === failure)
  assert.deepEqual(received, { token: 'token', databaseId: 'database', dataSourceId: 'source' })
})

test('설정된 DB의 실제 빈 목록과 잘못된 응답을 구분한다', async () => {
  assert.deepEqual(await loadPages([]), { source: 'notion', projects: [] })
  await assert.rejects(loadPortfolioPreview(connection, { getProjects: async () => ({}) }), /응답 형식/)
})

test('필요한 공개 표시 필드만 반환하고 원본 응답이나 역할을 만들어 내지 않는다', async () => {
  const page = notionPage({
    created_by: { id: '비공개 작성자 메타데이터' },
    properties: { Description: { rich_text: text('개인 역할을 확인하지 않은 설명입니다.') } },
  })
  const original = structuredClone(page)
  const { projects } = await loadPages([page])
  assert.equal(projects[0].title, '제목 없는 프로젝트')
  assert.equal(projects[0].role, '상세 소개에서 담당 범위 확인')
  assert.equal(projects[0].period, '기간 미정')
  assert.deepEqual(projects[0].tags, [])
  assert.equal(projects[0].github, null)
  assert.equal(projects[0].youtube, null)
  assert.equal(projects[0].cover, null)
  assert.deepEqual(Object.keys(projects[0]).sort(), [
    'id', 'title', 'description', 'role', 'highlight', 'period', 'tags', 'href', 'github', 'youtube', 'cover', 'category', 'art',
  ].sort())
  assert.doesNotMatch(JSON.stringify(projects), /created_by|비공개 작성자/)
  assert.deepEqual(page, original)
  assert.doesNotThrow(() => JSON.stringify(projects))
})

test('누락된 프로젝트와 공개 주소에 가짜 링크를 채우지 않는다', async () => {
  const { projects } = await loadPages([null, { properties: {} }])
  assert.ok(projects.every((project) => project.href === null && project.github === null && project.youtube === null))
  assert.ok(projects.every((project) => project.description === '' && project.period === '기간 미정'))
  assert.notEqual(projects[0].id, projects[1].id)
})

test('제목 조각과 명시적인 담당 문장을 읽되 담당이 없는 설명에서 역할을 추정하지 않는다', async () => {
  const page = notionPage()
  page.properties.Name.title = [...text('프로젝트 '), ...text('제목')]
  page.properties.Description.rich_text = text('웹 도구입니다. 제가 React 화면을 담당했습니다. 운영 검증은 미확인입니다.')
  const { projects } = await loadPages([page, notionPage()])
  assert.equal(projects[0].title, '프로젝트 제목')
  assert.equal(projects[0].role, '제가 React 화면을 담당했습니다.')
  assert.equal(projects[0].highlight, '개인 기여와 검증 내용은 상세 소개에서 확인')
  assert.equal(projects[1].role, '상세 소개에서 담당 범위 확인')
})

test('다른 팀이나 주체가 명시되지 않은 담당 설명을 본인 역할로 추론하지 않는다', async () => {
  const descriptions = [
    '다른 팀이 백엔드를 담당했습니다.',
    'React 화면을 담당했습니다.',
    '외부 팀이 지도 기능에 기여했습니다.',
  ]
  const pages = descriptions.map((description) => notionPage({
    properties: { Description: { rich_text: text(description) } },
  }))
  const { projects } = await loadPages(pages)
  assert.ok(projects.every((project) => project.role === '상세 소개에서 담당 범위 확인'))
  assert.deepEqual(projects.map((project) => project.description), descriptions)
})

test('개인 범위를 명시한 소개 형식은 원문 그대로 역할에 표시한다', async () => {
  const descriptions = [
    '저는 지도 화면 구현을 담당했습니다.',
    '내 역할: 프론트엔드 개발',
    '본인 담당: API 연동',
    '개인 담당: 사용자 화면',
    '담당 범위: 지도 UI 구현',
  ]
  const pages = descriptions.map((description) => notionPage({
    properties: { Description: { rich_text: text(description) } },
  }))
  assert.deepEqual((await loadPages(pages)).projects.map((project) => project.role), descriptions)
})

test('프로젝트의 일반 소개를 개인 핵심 기여로 바꾸지 않는다', async () => {
  const page = notionPage()
  page.properties.Description.rich_text = text('AI 기반 수요예측과 최적 경로를 제공하는 프로젝트입니다.')
  const { projects } = await loadPages([page])
  assert.equal(projects[0].description, 'AI 기반 수요예측과 최적 경로를 제공하는 프로젝트입니다.')
  assert.equal(projects[0].role, '상세 소개에서 담당 범위 확인')
  assert.equal(projects[0].highlight, '개인 기여와 검증 내용은 상세 소개에서 확인')
  assert.notEqual(projects[0].highlight, projects[0].description)
})

test('월 단위 기간을 표시하고 날짜 누락·잘못된 날짜를 완료나 진행 중으로 추정하지 않는다', async () => {
  const periods = [
    [{ start: '2026-08-20', end: '2026-11-10' }, '2026.08–2026.11'],
    [{ start: '2026-02', end: '2026-05' }, '2026.02–2026.05'],
    [{ start: '2026-08-01', end: '2026-08-31' }, '2026.08'],
    [{ start: '2026-08-20', end: null }, '2026.08–종료일 미정'],
    [{ start: null, end: '2026-11-10' }, '시작일 미정–2026.11'],
    [{ start: '2026-02-30', end: '2026-13-01' }, '기간 미정'],
    [null, '기간 미정'],
  ]
  const pages = periods.map(([date]) => notionPage({ properties: { WorkPeriod: { date } } }))
  assert.deepEqual((await loadPages(pages)).projects.map((project) => project.period), periods.map(([, period]) => period))
})

test('실제 표지와 HTTP 링크를 보존하고 실행 URL이나 인증정보 포함 주소는 전달하지 않는다', async () => {
  const page = notionPage({ cover: { file: { url: 'https://images.example.com/cover.png' } } })
  page.properties.GitHub = { url: 'https://github.com/example/project' }
  page.properties.Youtube = { url: 'https://www.youtube.com/watch?v=example' }
  const invalid = notionPage({ url: 'javascript:alert(1)', cover: { external: { url: 'data:image/png;base64,example' } } })
  invalid.properties.GitHub = { url: 'https://user:password@example.com/project' }
  invalid.properties.Youtube = { url: '/invented-video' }
  const { projects } = await loadPages([page, invalid])
  assert.equal(projects[0].cover, 'https://images.example.com/cover.png')
  assert.equal(projects[0].href, page.url)
  assert.equal(projects[0].github, page.properties.GitHub.url)
  assert.equal(projects[0].youtube, page.properties.Youtube.url)
  assert.equal(projects[1].href, null)
  assert.equal(projects[1].github, null)
  assert.equal(projects[1].youtube, null)
  assert.equal(projects[1].cover, null)
})
