import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePortfolioProject } from '../lib/portfolio-preview.mjs'
import { getCaseStudyLink } from '../lib/portfolio-messages.mjs'

const text = value => [{ plain_text: value }]
const page = () => ({
  id: 'example-project',
  url: 'https://example.com/korean',
  properties: {
    Name: { title: text('프로젝트') },
    Description: { rich_text: text('개인 역할이 명시되지 않은 프로젝트 소개입니다.') },
    NameEn: { rich_text: text('Project') },
    DescriptionEn: { rich_text: text('A project introduction without a confirmed individual role.') },
  },
})
const normalize = (value, locale) => normalizePortfolioProject(value, 0, { locale })

test('검증된 영문 상세는 영어 화면에서만 선택하고 한국어 원본 주소와 입력을 유지한다', () => {
  for (const href of ['https://example.com/english', 'http://example.com/english']) {
    const source = page()
    source.properties.DetailUrlEn = { url: ` ${href} ` }
    const original = structuredClone(source)
    const en = normalize(source, 'en')
    assert.equal(en.href, href)
    assert.equal(en.detailLanguage, 'en')
    for (const locale of ['ko', undefined, 'fr']) {
      const ko = normalize(source, locale)
      assert.equal(ko.href, source.url)
      assert.equal(ko.detailLanguage, 'ko')
    }
    assert.deepEqual(source, original)
  }
})

test('공란·상대주소·코드 프로토콜·인증정보 URL은 영문 상세로 내보내지 않고 한국어로 돌아간다', () => {
  const invalid = [
    undefined, null, '', '   ', 42, {},
    '/english', '//example.com/english', 'http:relative', 'https:example.com/english',
    'not a URL', 'https://', 'https://example.com:99999/english',
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///english',
    'https://user:password@example.com/english', 'https://user@example.com/english',
  ]
  for (const url of invalid) {
    const source = page()
    source.properties.DetailUrlEn = { url }
    const project = normalize(source, 'en')
    assert.equal(project.href, source.url)
    assert.equal(project.detailLanguage, 'ko')
  }
})

test('사용할 상세 링크가 모두 없으면 링크 props를 만들지 않고 유효한 영문 링크만 있으면 영어에서 사용한다', () => {
  const source = page()
  source.url = 'javascript:alert(1)'
  source.properties.DetailUrlEn = { url: null }
  for (const locale of ['ko', 'en']) {
    const project = normalize(source, locale)
    assert.equal(project.href, null)
    assert.equal(getCaseStudyLink(project, locale), null)
  }
  source.properties.DetailUrlEn.url = 'https://example.com/english'
  assert.equal(normalize(source, 'en').href, source.properties.DetailUrlEn.url)
  assert.equal(normalize(source, 'ko').href, null)
})

test('영문 상세 유무는 카드 번역 완료·누락과 한영 검색값을 바꾸지 않는다', () => {
  const source = page()
  const before = normalize(source, 'en')
  source.properties.DetailUrlEn = { url: 'https://example.com/english' }
  const connected = normalize(source, 'en')
  assert.equal(before.translationPending, false)
  assert.equal(connected.translationPending, false)
  assert.deepEqual(connected.translationMissing, before.translationMissing)
  assert.equal(connected.searchText, before.searchText)
  for (const field of ['id', 'title', 'description', 'role', 'highlight', 'period', 'startMonth', 'categoryKey', 'tags', 'cover']) {
    assert.deepEqual(connected[field], before[field])
  }
  source.properties.NameEn.rich_text = []
  const incomplete = normalize(source, 'en')
  assert.equal(incomplete.detailLanguage, 'en')
  assert.equal(incomplete.translationPending, true)
  assert.deepEqual(incomplete.translationMissing, ['title'])
})

test('버튼·접근성 이름·hrefLang는 실제 상세 언어를 따르고 역할 안내는 특정 언어를 단정하지 않는다', () => {
  const source = page()
  const fallback = normalize(source, 'en')
  assert.deepEqual(getCaseStudyLink(fallback, 'en'), {
    href: source.url, hrefLang: 'ko', text: 'Case study (Korean)',
    ariaLabel: 'Project case study in Korean (opens in a new tab)',
  })
  source.properties.DetailUrlEn = { url: 'https://example.com/english' }
  const english = normalize(source, 'en')
  assert.deepEqual(getCaseStudyLink(english, 'en'), {
    href: source.properties.DetailUrlEn.url, hrefLang: 'en', text: 'Case study (English)',
    ariaLabel: 'Project case study in English (opens in a new tab)',
  })
  const korean = normalize(source, 'ko')
  assert.deepEqual(getCaseStudyLink(korean, 'ko'), {
    href: source.url, hrefLang: 'ko', text: '상세 사례 읽기', ariaLabel: '프로젝트 상세 사례 읽기 (새 탭)',
  })
  for (const project of [fallback, english]) {
    assert.equal(project.role, 'See the case study for my role')
    assert.equal(project.highlight, 'See the case study for individual contributions and verification')
  }
  source.properties.RoleEn = { rich_text: text('Frontend development and API integration') }
  assert.equal(normalize(source, 'en').role, 'Frontend development and API integration')
})
