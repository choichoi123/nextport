import { getPortfolioSitemapXml } from '@/lib/portfolio-seo.mjs'

export default function SitemapXml() {
  return null
}

export function getServerSideProps({ res }) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.end(getPortfolioSitemapXml())
  return { props: {} }
}
