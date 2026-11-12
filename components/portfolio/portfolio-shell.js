import Head from 'next/head'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Analytics } from '@vercel/analytics/react'
import { Insights } from '@/components/insights'
import PortfolioBrand, { PortfolioBrandFavicon } from './portfolio-brand'
import Arrow from './arrow'
import styles from '@/styles/portfolio-preview.module.css'

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button type="button" className={styles.themeButton} aria-label="화면 테마 전환" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}

export default function PortfolioShell({
  children,
  title = '최지훈 포트폴리오',
  description = '사용자와 업무를 연결하는 웹 개발자 최지훈의 포트폴리오입니다. 프로젝트의 문제와 역할, 구현 과정을 소개합니다.',
  preview = false,
  examples = false,
  activePage = 'home',
  mainId = 'portfolio-main',
}) {
  return (
    <div className={styles.page} lang="ko">
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content="/opengraph-image.png" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="ko_KR" />
        {preview ? <meta name="robots" content="noindex, nofollow" /> : <>
          <meta name="naver-site-verification" content="cbaf6c94c9f869742c5755ca8b976783e266878e" />
          <meta name="google-site-verification" content="aZeJZGu7QX_-nX8d58FQ4YQ9hTjS3n9UwEW29pYZZB8" />
        </>}
      </Head>
      <PortfolioBrandFavicon />
      <a className={styles.skipLink} href={`#${mainId}`}>본문으로 건너뛰기</a>
      {preview && <div className={styles.previewBar}>
        <div className={styles.container}>
          <span><span className={styles.previewDot} />디자인 미리보기{examples && <span className={styles.exampleLabel}>예시 콘텐츠</span>}</span>
          <Link href="/archive">기존 홈과 비교하기 <Arrow diagonal /></Link>
        </div>
      </div>}
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link href="/" className={styles.identity} aria-label="최지훈 포트폴리오 홈" aria-current={activePage === 'home' ? 'page' : undefined}>
            <PortfolioBrand />
          </Link>
          <nav aria-label="주요 메뉴">
            <Link href="/projects" aria-current={activePage === 'projects' ? 'page' : undefined}>프로젝트</Link>
            <Link href="/#approach">하는 일</Link>
            <Link href="/#contact" className={styles.navContact}>연락하기 <Arrow diagonal /></Link>
          </nav>
          <ThemeButton />
        </div>
      </header>
      <main id={mainId}>{children}</main>
      <footer className={`${styles.footer} ${styles.container}`}>
        <span>CHOI JI HOON<span className={styles.footerDot}>.</span></span>
        <p>사용자와 업무를 연결하는 웹 개발자</p>
        <nav className={styles.footerLinks} aria-label="하단 메뉴">
          <Link href="/projects">프로젝트<Arrow diagonal /></Link>
          <Link href="/#contact">연락하기<Arrow diagonal /></Link>
        </nav>
      </footer>
      {!preview && <><Analytics /><Insights /></>}
    </div>
  )
}
