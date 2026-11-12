import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Analytics } from '@vercel/analytics/react'
import { Insights } from '@/components/insights'
import PortfolioBrand, { PortfolioBrandFavicon } from './portfolio-brand'
import Arrow from './arrow'
import { normalizeLocale, localePath } from '@/lib/portfolio-i18n.mjs'
import { getPortfolioMessages } from '@/lib/portfolio-messages.mjs'
import portfolioSocial, { getPortfolioSocialImage } from '@/config/portfolio-social.mjs'
import styles from '@/styles/portfolio-preview.module.css'

function ThemeButton({ label }) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button type="button" className={styles.themeButton} aria-label={label} onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}

export default function PortfolioShell({
  children,
  title,
  description,
  preview = false,
  examples = false,
  activePage = 'home',
  mainId = 'portfolio-main',
  languageQuery,
}) {
  const router = useRouter()
  const locale = normalizeLocale(router.locale)
  const messages = getPortfolioMessages(locale)
  const { nav } = messages
  const pageTitle = title || messages.meta.title
  const pageDescription = description || messages.meta.description
  const { siteOrigin } = portfolioSocial
  const socialImage = getPortfolioSocialImage()
  const canonical = `${siteOrigin}${localePath(router.pathname, locale)}`
  const [hash, setHash] = useState('')
  useEffect(() => {
    const updateHash = () => setHash(window.location.hash)
    updateHash()
    window.addEventListener('hashchange', updateHash)
    return () => window.removeEventListener('hashchange', updateHash)
  }, [router.asPath])
  const languageHref = { pathname: router.pathname, query: languageQuery || (router.isReady ? router.query : {}), hash }

  return (
    <div className={styles.page} lang={locale}>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonical} />
        {!preview && <>
          <link rel="alternate" hrefLang="ko" href={`${siteOrigin}${localePath(router.pathname, 'ko')}`} />
          <link rel="alternate" hrefLang="en" href={`${siteOrigin}${localePath(router.pathname, 'en')}`} />
          <link rel="alternate" hrefLang="x-default" href={`${siteOrigin}${localePath(router.pathname, 'ko')}`} />
        </>}
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:site_name" content={messages.meta.siteName} />
        <meta property="og:image" content={socialImage.url} />
        <meta property="og:image:width" content={String(socialImage.width)} />
        <meta property="og:image:height" content={String(socialImage.height)} />
        <meta property="og:image:type" content={socialImage.type} />
        <meta property="og:image:alt" content={messages.meta.imageAlt} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonical} />
        <meta property="og:locale" content={locale === 'en' ? 'en_US' : 'ko_KR'} />
        <meta property="og:locale:alternate" content={locale === 'en' ? 'ko_KR' : 'en_US'} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content={socialImage.url} />
        <meta name="twitter:image:alt" content={messages.meta.imageAlt} />
        {preview ? <meta name="robots" content="noindex, nofollow" /> : <>
          <meta name="naver-site-verification" content="cbaf6c94c9f869742c5755ca8b976783e266878e" />
          <meta name="google-site-verification" content="aZeJZGu7QX_-nX8d58FQ4YQ9hTjS3n9UwEW29pYZZB8" />
        </>}
      </Head>
      <PortfolioBrandFavicon />
      <a className={styles.skipLink} href={`#${mainId}`}>{nav.skip}</a>
      {preview && <div className={styles.previewBar}>
        <div className={styles.container}>
          <span><span className={styles.previewDot} />{nav.preview}{examples && <span className={styles.exampleLabel}>{nav.examples}</span>}</span>
          <Link href="/archive" locale="ko">{nav.archive} <Arrow diagonal /></Link>
        </div>
      </div>}
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link href="/" className={styles.identity} aria-label={nav.home} aria-current={activePage === 'home' ? 'page' : undefined}>
            <PortfolioBrand />
          </Link>
          <nav aria-label={nav.primary}>
            <Link href="/projects" aria-current={activePage === 'projects' ? 'page' : undefined}>{nav.projects}</Link>
            <Link href="/#approach">{nav.approach}</Link>
            <Link href="/#contact" className={styles.navContact}>{nav.contact} <Arrow diagonal /></Link>
          </nav>
          <div className={styles.headerActions}>
            <div className={styles.languageSwitch} role="group" aria-label={nav.language}>
              <Link href={languageHref} locale="ko" scroll={false} hrefLang="ko" aria-label={nav.korean} aria-current={locale === 'ko' ? 'true' : undefined}><span lang="ko">한국어</span></Link>
              <span aria-hidden="true">|</span>
              <Link href={languageHref} locale="en" scroll={false} hrefLang="en" aria-label={nav.english} aria-current={locale === 'en' ? 'true' : undefined}><span lang="en">English</span></Link>
            </div>
            <ThemeButton label={nav.theme} />
          </div>
        </div>
      </header>
      <main id={mainId}>{children}</main>
      <footer className={`${styles.footer} ${styles.container}`}>
        <span>CHOI JI HOON<span className={styles.footerDot}>.</span></span>
        <p>{nav.tagline}</p>
        <nav className={styles.footerLinks} aria-label={nav.footer}>
          <Link href="/projects">{nav.projects}<Arrow diagonal /></Link>
          <Link href="/#contact">{nav.contact}<Arrow diagonal /></Link>
        </nav>
      </footer>
      {!preview && <><Analytics /><Insights /></>}
    </div>
  )
}
