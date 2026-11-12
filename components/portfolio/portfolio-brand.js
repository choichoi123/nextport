import Head from 'next/head'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import portfolioBrand from '@/config/portfolio-brand'
import styles from '@/styles/portfolio-preview.module.css'

const brand = portfolioBrand.variants[portfolioBrand.activeBrand]

export default function PortfolioBrand() {
  return (
    <span className={styles.brandLogo}>
      <img className={styles.brandLogoLight} src={brand.logo.light} width="216" height="72" alt="최지훈 포트폴리오" />
      <img className={styles.brandLogoDark} src={brand.logo.dark} width="216" height="72" alt="최지훈 포트폴리오" />
    </span>
  )
}

export function PortfolioBrandFavicon() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const theme = mounted && resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <Head>
      <link key="portfolio-favicon" rel="icon" type="image/png" href={brand.favicon[theme]} />
    </Head>
  )
}
