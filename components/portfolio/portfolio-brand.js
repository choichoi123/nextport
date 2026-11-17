import Head from 'next/head'
import { useRouter } from 'next/router'
import { getPortfolioMessages } from '@/lib/portfolio-messages.mjs'
import portfolioBrand from '@/config/portfolio-brand'
import portfolioSocial from '@/config/portfolio-social.mjs'
import styles from '@/styles/portfolio-preview.module.css'

const brand = portfolioBrand.variants[portfolioBrand.activeBrand]
const faviconHref = process.env.NODE_ENV === 'development'
  ? brand.favicon.src
  : new URL(brand.favicon.src, portfolioSocial.siteOrigin).href

export default function PortfolioBrand() {
  const { locale } = useRouter()
  const { nav } = getPortfolioMessages(locale)
  return (
    <span className={styles.brandLogo}>
      <img className={styles.brandLogoLight} src={brand.logo.light} width="216" height="72" alt={nav.logo} />
      <img className={styles.brandLogoDark} src={brand.logo.dark} width="216" height="72" alt={nav.logo} />
    </span>
  )
}

export function PortfolioBrandFavicon() {
  return (
    <Head>
      <link key="portfolio-favicon" rel="icon" type="image/png" sizes={brand.favicon.sizes} href={faviconHref} />
    </Head>
  )
}
