import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPortfolioProjects } from '../lib/portfolio-preview.mjs'
import { filterPortfolioProjects, portfolioCategories } from '../lib/portfolio-catalog.mjs'

test('공개 홈과 목록의 무설정 로더는 외부 조회와 예시 프로젝트를 사용하지 않는다', async () => {
  for (const config of [undefined, {}, { token: ' ', databaseId: '', dataSourceId: '\t' }]) {
    assert.deepEqual(await loadPortfolioProjects(config, {
      getProjects: () => { throw new Error('무설정에서 외부 조회하면 안 됩니다.') },
    }), { source: 'unconfigured', projects: [] })
  }
})

test('공개 로더도 부분 설정과 인증 실패를 빈 목록이나 예시로 숨기지 않는다', async (t) => {
  await assert.rejects(loadPortfolioProjects({ token: 'test-token' }), /Notion 설정이 불완전/)
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }))
  await assert.rejects(loadPortfolioProjects({ token: 'test-token', dataSourceId: 'test-source' }), /HTTP 401/)
})

test('공개 로더는 실제 빈 응답을 보존하고 표시 필드만 전달한다', async () => {
  const config = { token: 'test-token', dataSourceId: 'test-source' }
  assert.deepEqual(await loadPortfolioProjects(config, { getProjects: async () => ({ results: [] }) }), { source: 'notion', projects: [] })
  const page = { id: 'actual-id', created_by: { id: 'private-author' }, properties: { Name: { title: [{ plain_text: '실제 제목' }] } } }
  const result = await loadPortfolioProjects(config, { getProjects: async () => ({ results: [page] }) })
  assert.equal(result.source, 'notion')
  assert.equal(result.projects[0].title, '실제 제목')
  assert.equal(result.projects[0].role, '상세 소개에서 담당 범위 확인')
  assert.doesNotMatch(JSON.stringify(result), /test-token|test-source|private-author|created_by/)
  await assert.rejects(loadPortfolioProjects(config, { getProjects: async () => ({}) }), /응답 형식/)
})

const projects = Object.freeze([
  Object.freeze({ id: 'old', title: '설계 도구', category: '웹 프로젝트', tags: ['React'], description: '다이어그램을 작성합니다.', period: '2020.09–2022.05' }),
  Object.freeze({ id: 'recent', title: '부산 관제', category: '관제 웹 애플리케이션', tags: ['JavaScript'], description: '지도에서 수요를 확인합니다.', period: '2026.08–2026.11' }),
  Object.freeze({ id: 'middle', title: 'SaaS 관제', category: '관제 웹 애플리케이션', tags: ['React'], description: '이용자 접수 화면입니다.', period: '2023.11–2024.06' }),
  Object.freeze({ id: 'unknown', title: '기간 미확인', category: '웹 프로젝트', tags: [], description: '', period: '시작일 미정–2026.12' }),
])

test('최근 시작 순 정렬은 종료일을 착수일로 사용하지 않고 원본을 변경하지 않는다', () => {
  assert.deepEqual(filterPortfolioProjects(projects).map(p => p.id), ['recent', 'middle', 'old', 'unknown'])
  assert.deepEqual(projects.map(p => p.id), ['old', 'recent', 'middle', 'unknown'])
  const byTitle = filterPortfolioProjects(projects, { sort: 'title' })
  assert.deepEqual(byTitle.map(p => p.title), [...projects].map(p => p.title).sort((a, b) => a.localeCompare(b, 'ko-KR', { numeric: true, sensitivity: 'base' })))
})

test('여러 검색어와 분야는 함께 적용되고 대소문자·전각 표기를 정규화한다', () => {
  assert.deepEqual(filterPortfolioProjects(projects, { query: '  ＲＥＡＣＴ  관제  ' }).map(p => p.id), ['middle'])
  assert.deepEqual(filterPortfolioProjects(projects, { query: 'react', category: '웹 프로젝트' }).map(p => p.id), ['old'])
  assert.deepEqual(filterPortfolioProjects(projects, { query: '존재하지않는내용' }), [])
  assert.deepEqual(filterPortfolioProjects(projects, { category: '관제 웹 애플리케이션' }).map(p => p.id), ['recent', 'middle'])
})

test('분야 목록은 실제 데이터에서 중복 없이 만들고 빈 데이터도 처리한다', () => {
  assert.deepEqual(new Set(portfolioCategories(projects)), new Set(['관제 웹 애플리케이션', '웹 프로젝트']))
  assert.deepEqual(portfolioCategories([]), [])
  assert.deepEqual(filterPortfolioProjects([]), [])
})
