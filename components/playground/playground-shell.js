import Head from 'next/head'
import PortfolioShell from '@/components/portfolio/portfolio-shell'

export default function PlaygroundShell({ title, description, children, immersive = false }) {
  return (
    <PortfolioShell title={title} description={description} activePage="playground" mainId="playground-main" immersive={immersive}>
      <Head><meta name="robots" content="noindex, nofollow" /></Head>
      {children}
    </PortfolioShell>
  )
}
