import portfolioSocial from '../config/portfolio-social.mjs'
import { getPortfolioMessages } from './portfolio-messages.mjs'

const publicPaths = ['/', '/en', '/projects', '/en/projects']
const siteUrl = new URL('/', portfolioSocial.siteOrigin).href

export function getPortfolioWebsiteSchema(pathname, { preview = false } = {}) {
  if (preview || !['/', '/en'].includes(pathname)) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': new URL('#website', siteUrl).href,
    url: siteUrl,
    name: getPortfolioMessages('ko').meta.siteName,
    alternateName: [getPortfolioMessages('en').meta.siteName, 'JIHOON'],
  }
}

export function serializePortfolioJsonLd(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, character => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  ))
}

export function getPortfolioRobotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', siteUrl).href}\n`
}

function escapeXml(value) {
  return value.replace(/[<>&"']/gu, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character])
}

export function getPortfolioSitemapXml() {
  const entries = publicPaths.map(pathname => (
    `  <url><loc>${escapeXml(new URL(pathname, siteUrl).href)}</loc></url>`
  ))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
}
