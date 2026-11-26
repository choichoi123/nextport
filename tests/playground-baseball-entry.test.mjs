import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { BASEBALL_CAREER_BRAND } from '../lib/playground-baseball-brand.mjs'
import { localePath } from '../lib/portfolio-i18n.mjs'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { loadBindings, transform } = require('next/dist/build/swc')
await loadBindings()

const sources = new Map()
for (const path of ['pages/playground/index.js', 'pages/playground/baseball/career.js', 'components/playground/playground-shell.js']) {
  const url = new URL(`../${path}`, import.meta.url)
  const compiled = await transform(await fs.readFile(url, 'utf8'), {
    filename: fileURLToPath(url),
    disableNextSsg: true,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  })
  sources.set(path, compiled.code)
}

// Link, Shell과 dynamic은 경계만 대체한다. 실제 브라우저의 locale 이동이나
// 청크 요청 검증과 구분하며, 여기서는 허용 props와 mount 여부만 확인한다.
function renderPage(path, { locale = 'ko', environment = 'production', props = {}, serverAvailability = 'preparing' } = {}) {
  const seen = { links: [], shells: [], career: [], careerLoads: 0, heads: 0 }
  const shell = shellProps => {
    seen.shells.push(shellProps)
    return React.createElement('main', null, shellProps.children)
  }
  const Link = ({ children, href, prefetch, locale: linkLocale, scroll, ...attributes }) => {
    seen.links.push({ href, prefetch, locale: linkLocale, scroll, ...attributes })
    return React.createElement('a', { href, ...attributes }, children)
  }
  const target = { exports: {} }
  vm.runInNewContext(sources.get(path), {
    module: target, exports: target.exports, process: { env: { NODE_ENV: environment } },
    require: name => {
      if (name.startsWith('react')) return require(name)
      if (name === 'next/router') return { useRouter: () => ({ locale }) }
      if (name === 'next/link') return { __esModule: true, default: Link }
      if (name === 'next/dynamic') return { __esModule: true, default: (_loader, options) => {
        assert.equal(options.ssr, false, '서버 렌더는 저장 클라이언트를 초기화하지 않는다')
        return gameProps => {
          seen.careerLoads++
          seen.career.push(gameProps)
          return React.createElement('div', { 'data-entry-career-game': 'true' })
        }
      } }
      if (name === 'next/image') return { __esModule: true, default: ({ src, alt, loading }) => React.createElement('img', { src, alt, loading }) }
      if (name === 'next/head') return { __esModule: true, default: ({ children }) => { seen.heads++; return React.createElement(React.Fragment, null, children) } }
      if (name.endsWith('/playground-shell') || name.endsWith('/portfolio-shell')) return { __esModule: true, default: shell }
      if (name.endsWith('/playground-baseball-brand.mjs')) return { BASEBALL_CAREER_BRAND }
      if (name === '@/lib/server/baseball-db.mjs') return { readBaseballCareerAvailability: () => serverAvailability }
      if (name === '@/lib/server/baseball-version.mjs') return { createBaseballDataVersions: async () => ({ fixture: 'baseballVersions' }) }
      if (name === '@/lib/server/baseball-at-bat-api.mjs') return { createBaseballAtBatVersions: async () => ({ fixture: 'atBatStorageVersions' }) }
      if (name === '@/lib/server/baseball-career-api.mjs') return { createBaseballCareerVersions: async () => ({ fixture: 'baseballCareerVersions' }) }
      if (name === '@/lib/server/baseball-career-v2-api.mjs') return {
        createBaseballAtBatV2Versions: async () => ({ fixture: 'atBatV2StorageVersions' }),
        createBaseballCareerV2Versions: async () => ({ fixture: 'baseballCareerV2Versions' }),
      }
      if (name.endsWith('/baseball-career-game')) {
        seen.careerLoads++
        return { __esModule: true, default: gameProps => {
          seen.career.push(gameProps)
          return React.createElement('div', { 'data-entry-career-game': 'true' })
        } }
      }
      if (name.endsWith('.module.css')) return { __esModule: true, default: {} }
      throw new Error(`허용하지 않은 SSR 의존성: ${name}`)
    },
  })
  const html = renderToStaticMarkup(React.createElement(target.exports.default, props))
  return { html, seen, pageExports: target.exports }
}

const plain = html => html.replace(/<[^>]*>/gu, '').replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&quot;', '"')
function anchor(html, href) {
  const entry = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gu)].find(match => match[1].includes(`href="${href}"`))
  assert.ok(entry, `${href} 링크가 있어야 한다`)
  return { attributes: entry[1], text: plain(entry[2]), html: entry[2] }
}

const expected = {
  ko: {
    name: '오늘부터 타자', sprint: '100m, 너만의 리듬으로', controls: '방향키·Space 조작 연습',
    sprintDescription: '선수를 소개하고 두 발을 번갈아 눌러 100m를 달려보세요.',
    controlsDescription: '방향키와 스페이스바의 반응이 궁금하다면, 작은 연습 화면에서 먼저 손을 풀어보세요.',
    local: '로컬 체험 가능', preparing: '배포판 준비 중', start: '오늘부터 타자 시작하기', status: '오늘부터 타자 준비 상태 보기',
    schedule: '144경기 시즌', unavailable: '이 화면에서는 아직 육성 플레이와 선수 저장·복구를 제공하지 않습니다.',
  },
  en: {
    name: 'Batter Journey', sprint: '100 metres. Find your rhythm.', controls: 'Arrow keys & Space practice',
    sprintDescription: 'Meet your runner and alternate your feet through 100 metres.',
    controlsDescription: 'Curious how the controls feel? Warm up with the arrow keys and Space in a small practice space.',
    local: 'Local trial available', preparing: 'Release in preparation', start: 'Start Batter Journey', status: 'View Batter Journey status',
    schedule: '144-game season', unavailable: 'Career play, player saves and recovery are not available here yet.',
  },
}

for (const locale of ['ko', 'en']) {
  test(`${locale} 놀이터는 기존 두 게임의 이름·경로·설명과 고유 접근성 연결을 유지한다`, () => {
    for (const environment of ['development', 'production']) {
      const { html, seen } = renderPage('pages/playground/index.js', { locale, environment })
      const text = expected[locale]
      assert.ok(html.includes(`lang="${locale}"`))
      for (const [href, title, description, id] of [
        ['/playground/sprint', text.sprint, text.sprintDescription, 'playground-sprint-description'],
        ['/playground/controls', text.controls, text.controlsDescription, 'playground-controls-description'],
      ]) {
        const link = anchor(html, href)
        assert.ok(link.text.includes(title))
        assert.ok(link.text.includes(description))
        assert.ok(link.attributes.includes(`aria-describedby="${id}"`))
        assert.ok(link.html.includes(`id="${id}"`))
      }
      const ids = [...html.matchAll(/\bid="([^"]+)"/gu)].map(match => match[1])
      assert.equal(new Set(ids).size, ids.length)
      assert.equal(seen.careerLoads, 0, '목록 SSR은 육성 게임을 초기화하지 않는다')
    }
  })

  test(`${locale} 야구 카드는 같은 육성 경로에서 로컬 체험과 운영 준비 상태를 구분한다`, () => {
    const text = expected[locale]
    for (const environment of ['development', 'production']) {
      const { html, seen } = renderPage('pages/playground/index.js', { locale, environment })
      const link = anchor(html, '/playground/baseball/career')
      const development = environment === 'development'
      assert.ok(link.text.includes(text.name))
      assert.ok(link.text.includes(BASEBALL_CAREER_BRAND[locale].description))
      assert.ok(link.text.includes(text.schedule), '새 선수의 시즌 분량을 표시한다')
      assert.ok(link.attributes.includes(`data-availability="${development ? 'local-trial' : 'preparing'}"`))
      assert.ok(link.attributes.includes('aria-describedby="playground-baseball-description"'))
      assert.ok(link.html.includes('id="playground-baseball-description"'))
      assert.ok(link.text.includes(development ? text.local : text.preparing))
      assert.ok(link.attributes.includes(`aria-label="${development ? text.start : text.status}"`))
      assert.equal(link.text.includes(development ? text.preparing : text.start), false)
      const nextLink = seen.links.find(item => item.href === '/playground/baseball/career')
      assert.equal(nextLink.prefetch, false)
      assert.equal(nextLink.locale, undefined, '목록 링크는 다른 언어를 강제로 지정하지 않는다')
      assert.ok(seen.shells[0].description.includes(text.name))
      assert.equal(seen.shells[0].title, locale === 'ko' ? '놀이터 | 최지훈 포트폴리오' : 'Playground | Jihoon Choi Portfolio')
    }
  })
}

test('개발 육성 페이지는 새 브랜드 메타와 기존 버전 props를 같은 게임에 전달한다', () => {
  const props = Object.fromEntries(['baseballVersions', 'atBatStorageVersions', 'baseballCareerVersions', 'atBatV2StorageVersions', 'baseballCareerV2Versions'].map(name => [name, Object.freeze({ fixture: name })]))
  for (const locale of ['ko', 'en']) {
    const { html, seen } = renderPage('pages/playground/baseball/career.js', { locale, environment: 'development', props })
    assert.equal(seen.careerLoads, 1)
    assert.equal(seen.career.length, 1)
    const game = seen.career[0]
    assert.equal(game.locale, locale)
    for (const [key, original] of [['dataVersions', 'baseballVersions'], ['storageVersions', 'atBatStorageVersions'], ['careerVersions', 'baseballCareerVersions'], ['v2StorageVersions', 'atBatV2StorageVersions'], ['v2CareerVersions', 'baseballCareerV2Versions']]) {
      assert.equal(game[key], props[original])
    }
    assert.equal(seen.shells[0].title, `${expected[locale].name} | ${locale === 'ko' ? '최지훈' : 'Jihoon'}`)
    assert.equal(seen.shells[0].description, BASEBALL_CAREER_BRAND[locale].description)
    assert.equal(seen.shells[0].immersive, true)
    assert.ok(html.includes('data-entry-career-game="true"'))
    assert.equal(game.enabled, true)
    assert.equal(game.preview, false)
    assert.equal(html.includes('data-baseball-career-availability'), false)
  }
})

test('운영 허용 전 육성 페이지는 브랜드·준비 안내와 기존 대체 경로를 보여 준다', () => {
  for (const locale of ['ko', 'en']) {
    const { html, seen } = renderPage('pages/playground/baseball/career.js', { locale })
    assert.equal(seen.careerLoads, 0)
    assert.equal(seen.career.length, 0)
    assert.ok(html.includes(`>${expected[locale].name}</h1>`))
    assert.ok(html.includes('data-baseball-career-availability="preparing"'))
    assert.ok(plain(html).includes(expected[locale].unavailable))
    assert.ok(plain(html).includes(expected[locale].preparing))
    assert.equal(/<form\b|<input\b|<button\b|data-entry-career-game/u.test(html), false)
    for (const href of ['/playground', '/playground/baseball/at-bat']) {
      anchor(html, href)
      assert.equal(seen.links.find(item => item.href === href).prefetch, false)
    }
    assert.equal(seen.shells[0].description, BASEBALL_CAREER_BRAND[locale].description)
  }
})

test('지정 Preview 표시는 한영 카드와 직접 육성 진입에서만 같은 허용 경계를 사용한다', () => {
  for (const locale of ['ko', 'en']) {
    const props = { baseballCareerAvailability: 'preview' }
    const landing = renderPage('pages/playground/index.js', { locale, props })
    const card = anchor(landing.html, '/playground/baseball/career')
    assert.ok(card.attributes.includes('data-availability="preview-trial"'))
    assert.ok(card.attributes.includes(`aria-label="${expected[locale].start}"`))
    assert.ok(card.text.includes(locale === 'ko' ? 'Preview 검수' : 'Preview test'))
    assert.equal(card.text.includes(expected[locale].preparing), false)
    assert.equal(landing.seen.careerLoads, 0, '카드는 저장 클라이언트를 시작하지 않는다')
    const page = renderPage('pages/playground/baseball/career.js', { locale, props })
    assert.equal(page.seen.careerLoads, 1)
    assert.equal(page.seen.career[0].enabled, true)
    assert.equal(page.seen.career[0].preview, true)
    assert.equal(page.seen.career[0].production, false)
    assert.equal(page.seen.career[0].locale, locale)
    assert.equal(page.html.includes('data-baseball-career-availability="preparing"'), false)
  }
})

test('운영이 허용된 한영 카드와 직접 진입은 공개 플레이 상태로 연결한다', () => {
  for (const locale of ['ko', 'en']) {
    const props = { baseballCareerAvailability: 'production' }
    const landing = renderPage('pages/playground/index.js', { locale, props })
    const card = anchor(landing.html, '/playground/baseball/career')
    assert.ok(card.attributes.includes('data-availability="available"'))
    assert.ok(card.attributes.includes(`aria-label="${expected[locale].start}"`))
    assert.ok(card.text.includes(locale === 'ko' ? '플레이 가능' : 'Ready to play'))
    assert.ok(!card.text.includes(expected[locale].preparing) && !card.text.includes('Preview'))
    assert.equal(landing.seen.careerLoads, 0)
    const page = renderPage('pages/playground/baseball/career.js', { locale, props })
    assert.equal(page.seen.careerLoads, 1)
    assert.equal(page.seen.career[0].enabled, true)
    assert.equal(page.seen.career[0].preview, false)
    assert.equal(page.seen.career[0].production, true)
    assert.equal(page.seen.career[0].locale, locale)
    assert.ok(!page.html.includes('data-baseball-career-availability="preparing"'))
  }
})

test('없는 값·잘못된 값·개발 enum은 호스팅 빌드에서 게임을 열지 않는다', () => {
  for (const value of [undefined, null, true, 'true', 'development', 'PRODUCTION', 'PREVIEW']) {
    const props = { baseballCareerAvailability: value }
    const page = renderPage('pages/playground/baseball/career.js', { props })
    assert.equal(page.seen.careerLoads, 0)
    assert.ok(page.html.includes('data-baseball-career-availability="preparing"'))
    const landing = renderPage('pages/playground/index.js', { props })
    assert.ok(anchor(landing.html, '/playground/baseball/career').attributes.includes('data-availability="preparing"'))
  }
})

test('서버 availability는 환경·연결 설정 없이 enum과 기존 버전 props만 직렬화한다', async () => {
  for (const availability of ['development', 'preview', 'production', 'preparing']) {
    for (const path of ['pages/playground/index.js', 'pages/playground/baseball/career.js']) {
      const { pageExports } = renderPage(path, { serverAvailability: availability })
      const value = await pageExports.getStaticProps()
      assert.equal(value.props.baseballCareerAvailability, availability)
      const expectedKeys = path.endsWith('/career.js')
        ? ['baseballCareerAvailability', 'baseballVersions', 'atBatStorageVersions', 'baseballCareerVersions', 'atBatV2StorageVersions', 'baseballCareerV2Versions']
        : ['baseballCareerAvailability']
      assert.deepEqual(Object.keys(value.props).sort(), expectedKeys.sort())
      assert.equal(/databaseUrl|signingSecret|BASEBALL_|postgres(?:ql)?:/i.test(JSON.stringify(value.props)), false)
    }
  }
})

test('실제 놀이터 Shell은 브랜드 props와 별개로 noindex와 공통 놀이터 표식을 유지한다', () => {
  const props = { title: '오늘부터 타자 | 최지훈', description: BASEBALL_CAREER_BRAND.ko.description, immersive: true, children: React.createElement('p', null, '본문') }
  const { html, seen } = renderPage('components/playground/playground-shell.js', { props })
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow"/>'))
  assert.equal(seen.heads, 1)
  assert.equal(seen.shells[0].activePage, 'playground')
  assert.equal(seen.shells[0].mainId, 'playground-main')
  assert.equal(seen.shells[0].title, props.title)
  assert.equal(seen.shells[0].description, props.description)
  assert.equal(seen.shells[0].immersive, true)
})

test('새 육성 경로도 기존 놀이터 경로처럼 한영 경로·query·hash를 보존한다', () => {
  assert.ok(Object.isFrozen(BASEBALL_CAREER_BRAND))
  for (const locale of ['ko', 'en']) assert.ok(Object.isFrozen(BASEBALL_CAREER_BRAND[locale]))
  for (const path of ['/playground', '/playground/sprint', '/playground/controls', '/playground/baseball/career']) {
    assert.equal(localePath(`${path}?from=playground#game`, 'en'), `/en${path}?from=playground#game`)
    assert.equal(localePath(`/en${path}?from=playground#game`, 'ko'), `${path}?from=playground#game`)
  }
})
