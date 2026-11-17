import test from 'node:test'
import assert from 'node:assert/strict'
import portfolioSocial from '../config/portfolio-social.mjs'
import {
  getPortfolioWebsiteSchema,
  serializePortfolioJsonLd,
  getPortfolioRobotsTxt,
  getPortfolioSitemapXml,
} from '../lib/portfolio-seo.mjs'

test('한영 홈은 같은 루트 사이트 식별자를 쓰고 목록·미리보기·보관 화면에는 구조화 데이터를 만들지 않는다', () => {
  const rootUrl = new URL('/', portfolioSocial.siteOrigin).href
  const korean = getPortfolioWebsiteSchema('/')
  assert.deepEqual(getPortfolioWebsiteSchema('/en'), korean)
  assert.equal(korean['@type'], 'WebSite')
  assert.equal(korean['@id'], `${rootUrl}#website`)
  assert.equal(korean.url, rootUrl)
  assert.equal(korean.name, '최지훈 포트폴리오')
  assert.deepEqual(korean.alternateName, ['Jihoon Choi Portfolio', 'JIHOON'])
  for (const pathname of ['/projects', '/en/projects', '/preview', '/en/preview', '/archive', '/about-me', '/gallery', undefined]) {
    assert.equal(getPortfolioWebsiteSchema(pathname), null)
  }
  assert.equal(getPortfolioWebsiteSchema('/', { preview: true }), null)
})

test('JSON-LD는 script 종료·HTML 특수문자·줄 구분자를 이스케이프하고 원래 값을 보존한다', () => {
  const value = { name: '</script><script>alert("test")</script>&\u2028\u2029' }
  const serialized = serializePortfolioJsonLd(value)
  assert.equal(/[<>&\u2028\u2029]/u.test(serialized), false)
  assert.deepEqual(JSON.parse(serialized), value)
})

test('sitemap은 같은 canonical origin의 한영 홈·목록 네 URL만 포함한다', () => {
  const xml = getPortfolioSitemapXml()
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => new URL(match[1]))
  assert.equal(locations.length, 4)
  assert.deepEqual(locations.map(url => url.pathname), ['/', '/en', '/projects', '/en/projects'])
  for (const url of locations) {
    assert.equal(url.origin, new URL(portfolioSocial.siteOrigin).origin)
    assert.equal(url.search, '')
    assert.equal(url.hash, '')
  }
})

test('robots는 보관·미리보기의 noindex를 읽도록 수집을 막지 않고 sitemap을 안내한다', () => {
  const robots = getPortfolioRobotsTxt()
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/u)
  assert.equal(/Disallow:|Noindex:/iu.test(robots), false)
  assert.match(robots, new RegExp(`Sitemap: ${new URL('/sitemap.xml', portfolioSocial.siteOrigin).href.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`))
})
