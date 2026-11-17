import { getPortfolioRobotsTxt } from '@/lib/portfolio-seo.mjs'

export default function RobotsTxt() {
  return null
}

export function getServerSideProps({ res }) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(getPortfolioRobotsTxt())
  return { props: {} }
}
