import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import { getPortfolioMessages } from '@/lib/portfolio-messages.mjs'
import { PortfolioBrandFavicon } from '@/components/portfolio/portfolio-brand'
import portfolioSocial from '@/config/portfolio-social.mjs'
import styles from '@/styles/og-preview.module.css'

const variants = [
  {
    id: 'light',
    number: '01',
    name: '밝은 안',
    tone: 'LIGHT',
    description: '밝은 바탕 위에서 로고와 문구의 대비를 살펴봅니다.',
    src: portfolioSocial.images.light.src,
    filename: 'og-b-light-20261112.png',
  },
  {
    id: 'deep-green',
    number: '02',
    name: '딥그린 안',
    tone: 'DEEP GREEN',
    description: '짙은 바탕 위에서 로고와 문구의 대비를 살펴봅니다.',
    src: portfolioSocial.images['deep-green'].src,
    filename: 'og-b-deep-green-20261112.png',
  },
]

function Variant({ variant }) {
  const [failed, setFailed] = useState(false)
  const selected = variant.id === portfolioSocial.activeImage
  const onLoad = () => setFailed(false)
  const onError = () => setFailed(true)

  return (
    <section className={styles.variant} aria-labelledby={`og-${variant.id}`} data-selected={selected}>
      <header className={styles.variantHeading}>
        <div>
          <p className={styles.tone}>{variant.number} / {variant.tone}{selected && ' · 현재 선택'}</p>
          <h2 id={`og-${variant.id}`}>{variant.name}</h2>
        </div>
        <span className={styles.dimensions}>1200 × 630 PNG</span>
      </header>
      <p className={styles.variantDescription}>{variant.description}</p>

      <figure className={styles.original}>
        <img src={variant.src} width="1200" height="630" alt={`${variant.name}의 B JIHOON 공유 이미지. 사용자와 업무를 연결합니다.`} onLoad={onLoad} onError={onError} />
        <figcaption>원본 비율 · 화면 폭에 맞춰 표시</figcaption>
      </figure>
      {failed && <p className={styles.imageError} role="status">시안 이미지를 불러오지 못했습니다. 원본 파일이 준비되어 있는지 확인해 주세요.</p>}

      <div className={styles.actions}>
        <a href={variant.src} target="_blank" rel="noopener noreferrer" aria-label={`${variant.name} 원본 이미지 보기 (새 탭)`}>원본 보기 <span aria-hidden="true">↗</span></a>
        <a href={variant.src} download={variant.filename} aria-label={`${variant.name} PNG 다운로드 (1200 × 630)`}>PNG 다운로드 <span aria-hidden="true">↓</span></a>
      </div>

      <div className={styles.smallPreview}>
        {['ko', 'en'].map(locale => {
          const { meta } = getPortfolioMessages(locale)
          return <div className={styles.localePreview} key={locale}>
            <div className={styles.previewHeading}><h3>{locale === 'ko' ? '한국어' : 'English'} 링크 미리보기 예시</h3><span>320px 기준</span></div>
            <div className={styles.shareCard} lang={locale}>
              <img src={variant.src} width="320" height="168" alt="" onLoad={onLoad} onError={onError} />
              <div className={styles.shareText}>
                <span className={styles.domain}>{new URL(portfolioSocial.siteOrigin).hostname}</span>
                <p className={styles.shareTitle}>{meta.title}</p>
                <p className={styles.shareDescription}>{meta.description}</p>
              </div>
            </div>
          </div>
        })}
        <p className={styles.previewNote}>좁은 화면에서는 비율을 유지해 줄입니다. 공유 서비스별 표시 방식은 다를 수 있습니다.</p>
      </div>
    </section>
  )
}

export default function OgPreview() {
  return (
    <main className={styles.page} lang="ko">
      <Head>
        <title>OG 이미지 시안 비교 | 최지훈</title>
        <meta name="description" content="B JIHOON 로고를 사용한 밝은 안과 딥그린 안의 공유 이미지를 비교하는 검토 페이지입니다." />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <PortfolioBrandFavicon />
      <div className={styles.container}>
        <div className={styles.topBar}>
          <Link href="/preview" locale="ko" className={styles.backLink}><span aria-hidden="true">←</span> 포트폴리오 미리보기</Link>
          <span className={styles.status}>현재 OG: {variants.find(variant => variant.id === portfolioSocial.activeImage)?.name}</span>
        </div>
        <header className={styles.intro}>
          <p className={styles.eyebrow}>B JIHOON / OPEN GRAPH</p>
          <h1>같은 로고, 두 가지 톤.</h1>
          <p className={styles.description}>같은 구성과 문구를 사용한 두 안입니다.<br /> 원본 이미지와 작은 공유 카드에서 배경·글자·여백의 인상을 비교해 보세요.</p>
        </header>

        <div className={styles.grid}>{variants.map(variant => <Variant key={variant.id} variant={variant} />)}</div>
        <p className={styles.closing}>선택한 이미지는 홈·프로젝트 목록의 한영 공유 메타에 적용됩니다. 이미지 안의 한국어 문구는 두 언어에서 공통으로 사용합니다. 밝은 안으로 바꾸려면 OG 설정의 activeImage를 light로 변경합니다. 로고·파비콘·Notion 연동은 유지합니다.</p>
      </div>
    </main>
  )
}
