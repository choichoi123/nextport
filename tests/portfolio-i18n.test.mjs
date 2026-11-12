import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLocale, localePath } from '../lib/portfolio-i18n.mjs'

test('지원하는 영어 locale만 영어로 선택하고 나머지는 기본 한국어로 처리한다', () => {
  assert.equal(normalizeLocale('en'), 'en')
  for (const locale of ['ko', undefined, null, 'en-US', 'fr']) assert.equal(normalizeLocale(locale), 'ko')
})

test('언어를 바꿔도 목록 검색 query와 본문 hash를 보존하고 언어 접두어를 중복하지 않는다', () => {
  assert.equal(localePath('/projects?q=React%20map&category=mobile#results', 'en'), '/en/projects?q=React%20map&category=mobile#results')
  assert.equal(localePath('/en/projects?q=React%20map#results', 'ko'), '/projects?q=React%20map#results')
  assert.equal(localePath('/ko/projects', 'en'), '/en/projects')
  assert.equal(localePath('/en#contact', 'en'), '/en#contact')
  assert.equal(localePath('/', 'en'), '/en')
  assert.equal(localePath('/en', 'ko'), '/')
})

test('번역하지 않는 기존 페이지는 한국어 경로를 유지하며 외부 주소로 변환하지 않는다', () => {
  for (const page of ['archive', 'about-me', 'gallery']) {
    assert.equal(localePath(`/en/${page}?view=all#top`, 'en'), `/${page}?view=all#top`)
  }
  for (const input of ['https://example.com', '//example.com', '/en//example.com', '/\\example.com']) {
    assert.throws(() => localePath(input, 'en'), /사이트 내부/)
  }
})
