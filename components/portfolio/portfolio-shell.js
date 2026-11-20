import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { Analytics } from '@vercel/analytics/react'
import { Insights } from '@/components/insights'
import PortfolioBrand, { PortfolioBrandFavicon } from './portfolio-brand'
import Arrow from './arrow'
import { normalizeLocale, localePath } from '@/lib/portfolio-i18n.mjs'
import { getPortfolioMessages } from '@/lib/portfolio-messages.mjs'
import { getPortfolioWebsiteSchema, serializePortfolioJsonLd } from '@/lib/portfolio-seo.mjs'
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

function HeaderNavigation({ nav, activePage, className, onNavigate }) {
  return <nav aria-label={nav.primary} className={className}>
    <Link href="/projects" aria-current={activePage === 'projects' ? 'page' : undefined} onClick={onNavigate}>{nav.projects}</Link>
    <Link href="/#approach" onClick={onNavigate}>{nav.approach}</Link>
    <Link href="/#contact" className={styles.navContact} onClick={onNavigate}>{nav.contact} <Arrow diagonal /></Link>
    <Link href="/playground" aria-current={activePage === 'playground' ? 'page' : undefined} onClick={onNavigate}>{nav.playground}</Link>
  </nav>
}

function LanguageSwitch({ nav, href, locale, onNavigate }) {
  return <div className={styles.languageSwitch} role="group" aria-label={nav.language}>
    <Link href={href} locale="ko" scroll={false} hrefLang="ko" aria-label={nav.korean} aria-current={locale === 'ko' ? 'true' : undefined} onClick={onNavigate}><span lang="ko">한국어</span></Link>
    <span aria-hidden="true">|</span>
    <Link href={href} locale="en" scroll={false} hrefLang="en" aria-label={nav.english} aria-current={locale === 'en' ? 'true' : undefined} onClick={onNavigate}><span lang="en">English</span></Link>
  </div>
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
  immersive = false,
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
  const websiteSchema = getPortfolioWebsiteSchema(router.pathname, { preview })
  const [hash, setHash] = useState('')
  const compactPlayground = activePage === 'playground'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuToggleRef = useRef(null)
  const menuPanelRef = useRef(null)
  const mobileMenuId = useId()
  const closeMobileMenu = useCallback((restoreFocus = false) => {
    setMobileMenuOpen(false)
    if (restoreFocus) menuToggleRef.current?.focus({ preventScroll: true })
  }, [])
  const menuNavigate = () => closeMobileMenu()
  function toggleMobileMenu() {
    if (mobileMenuOpen) { closeMobileMenu(true); return }
    // Touch browsers do not always focus the menu button. Interrupt explicitly.
    window.dispatchEvent(new CustomEvent('nextport:playground-menu-open'))
    setMobileMenuOpen(true)
  }
  useEffect(() => {
    if (!compactPlayground) return
    const media = window.matchMedia('(max-width: 1000px), (pointer: coarse)')
    const routeChange = () => closeMobileMenu()
    const mediaChange = () => { if (!media.matches) closeMobileMenu() }
    media.addEventListener('change', mediaChange)
    router.events.on('routeChangeStart', routeChange)
    return () => {
      media.removeEventListener('change', mediaChange)
      router.events.off('routeChangeStart', routeChange)
    }
  }, [compactPlayground, closeMobileMenu, router.events])
  useEffect(() => {
    if (mobileMenuOpen) menuPanelRef.current?.querySelector('a')?.focus({ preventScroll: true })
  }, [mobileMenuOpen])
  useEffect(() => {
    const updateHash = () => setHash(window.location.hash)
    updateHash()
    window.addEventListener('hashchange', updateHash)
    return () => window.removeEventListener('hashchange', updateHash)
  }, [router.asPath])
  const languageHref = { pathname: router.pathname, query: languageQuery || (router.isReady ? router.query : {}), hash }

  return (
    <div className={`${styles.page}${immersive ? ` ${styles.immersiveShell}` : ''}`} lang={locale}>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonical} />
        {websiteSchema && <script
          key="portfolio-website"
          id="portfolio-website"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializePortfolioJsonLd(websiteSchema) }}
        />}
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
      <header className={`${styles.header}${compactPlayground ? ` ${styles.compactPlaygroundHeader}` : ''}`}
        onKeyDown={event => {
          if (mobileMenuOpen && event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            closeMobileMenu(true)
          }
        }}
        onBlur={event => {
          if (mobileMenuOpen && !event.currentTarget.contains(event.relatedTarget)) closeMobileMenu()
        }}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link href="/" className={styles.identity} aria-label={nav.home} aria-current={activePage === 'home' ? 'page' : undefined}>
            <PortfolioBrand />
          </Link>
          <HeaderNavigation nav={nav} activePage={activePage} className={compactPlayground ? styles.desktopNavigation : undefined} />
          <div className={`${styles.headerActions}${compactPlayground ? ` ${styles.desktopHeaderActions}` : ''}`}>
            <LanguageSwitch nav={nav} href={languageHref} locale={locale} />
            <ThemeButton label={nav.theme} />
          </div>
          {compactPlayground && <button ref={menuToggleRef} className={styles.mobileMenuToggle} type="button"
            aria-label={mobileMenuOpen ? nav.closeMenu : nav.openMenu} aria-expanded={mobileMenuOpen} aria-controls={mobileMenuId}
            onClick={toggleMobileMenu}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {mobileMenuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>}
        </div>
        {compactPlayground && <div className={styles.mobileMenuLayer} hidden={!mobileMenuOpen}>
          <div className={styles.mobileMenuBackdrop} aria-hidden="true" onPointerDown={event => { event.preventDefault(); closeMobileMenu(true) }} />
          <div ref={menuPanelRef} id={mobileMenuId} className={styles.mobileMenuPanel}>
            <HeaderNavigation nav={nav} activePage={activePage} onNavigate={menuNavigate} />
            <div className={styles.mobileMenuOptions}>
              <LanguageSwitch nav={nav} href={languageHref} locale={locale} onNavigate={menuNavigate} />
              <ThemeButton label={nav.theme} />
            </div>
          </div>
        </div>}
      </header>
      <main id={mainId}>{children}</main>
      {!immersive && <footer className={`${styles.footer} ${styles.container}`}>
        <span>CHOI JI HOON<span className={styles.footerDot}>.</span></span>
        <p>{nav.tagline}</p>
        <nav className={styles.footerLinks} aria-label={nav.footer}>
          <Link href="/projects">{nav.projects}<Arrow diagonal /></Link>
          <Link href="/#contact">{nav.contact}<Arrow diagonal /></Link>
        </nav>
      </footer>}
      {!preview && <><Analytics /><Insights /></>}
    </div>
  )
}
