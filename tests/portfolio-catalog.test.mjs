import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPortfolioProjects, normalizePortfolioProjects } from '../lib/portfolio-preview.mjs'
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

test('언어별 분야 이름이나 기간 표시가 바뀌어도 안정된 분야 키와 시작 월로 필터·정렬한다', () => {
  const bilingual = [
    { id: 'older', title: 'Older', categoryKey: 'mobile', category: 'Mobile service', startMonth: '2025.12', period: 'December 2025', tags: [] },
    { id: 'unknown', title: 'Unknown', categoryKey: 'mobile', category: '모바일 서비스', startMonth: '', period: '2026.12', tags: [] },
    { id: 'newer', title: 'Newer', categoryKey: 'mobile', category: 'Mobile service', startMonth: '2026.02', period: 'February 2026', tags: [] },
    { id: 'web', title: 'Website', categoryKey: 'website', category: 'Website', startMonth: '2026.03', period: '', tags: [] },
  ]
  assert.deepEqual(filterPortfolioProjects(bilingual, { category: 'mobile', locale: 'en' }).map(project => project.id), ['newer', 'older', 'unknown'])
  assert.deepEqual(new Set(portfolioCategories(bilingual, { keys: true, locale: 'en' })), new Set(['mobile', 'website']))
  assert.deepEqual(bilingual.map(project => project.id), ['older', 'unknown', 'newer', 'web'])
})

test('영어 이름순 정렬은 표시 제목을 영어 locale 기준으로 비교한다', () => {
  const names = ['Zulu', 'alpha 10', 'Alpha 2', 'Éclair'].map((title, index) => ({ id: String(index), title, tags: [] }))
  assert.deepEqual(filterPortfolioProjects(names, { sort: 'title', locale: 'en' }).map(project => project.title), ['Alpha 2', 'alpha 10', 'Éclair', 'Zulu'])
})

test('같은 한영 원문에서 파생한 검색값으로 언어를 전환해도 이름·설명 검색 결과를 유지한다', () => {
  const richText = value => ({ rich_text: [{ plain_text: value }] })
  const pages = [
    { id: 'paju', properties: {
      Name: { title: [{ plain_text: '파주 바우처' }] },
      NameEn: richText('Paju Voucher'),
      Description: richText('주소 선택과 이용내역을 연결한 모바일 웹입니다.'),
      DescriptionEn: richText('A mobile web service for address selection and trip history.'),
    } },
    { id: 'other-mobile', properties: {
      Name: { title: [{ plain_text: '다른 모바일 프로젝트' }] },
      NameEn: richText('Another mobile project'),
      Description: richText('프로젝트 설명입니다.'),
      DescriptionEn: richText('A separate project.'),
    } },
  ]
  const original = structuredClone(pages)
  const ko = normalizePortfolioProjects(pages)
  const en = normalizePortfolioProjects(pages, { locale: 'en' })
  assert.equal(ko[0].searchText, en[0].searchText)
  for (const locale of ['ko', 'en']) {
    const localized = locale === 'en' ? en : ko
    for (const query of ['Paju', '파주', 'trip history', '이용내역']) {
      assert.deepEqual(filterPortfolioProjects(localized, { query, category: 'mobile', sort: 'title', locale }).map(project => project.id), ['paju'])
    }
  }
  assert.deepEqual(pages, original)
})
