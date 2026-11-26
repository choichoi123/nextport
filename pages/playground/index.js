import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import PlaygroundShell from '@/components/playground/playground-shell'
import { BASEBALL_CAREER_BRAND } from '@/lib/playground-baseball-brand.mjs'
import styles from '@/styles/playground-index.module.css'

const copy = {
  ko: {
    title: '놀이터 | 최지훈 포트폴리오',
    description: '100m 달리기, 오늘부터 타자와 조작 연습을 골라 즐기는 작은 놀이터입니다.',
    heading: ['게임을 고르고,', '나만의 리듬으로.'],
    introduction: '100m 질주부터 나만의 타자를 키우는 야구까지. 해보고 싶은 것을 골라보세요.',
    collection: '게임 선택',
    practice: '가볍게 시작하는 조작 연습',
    cardTitle: '방향키·Space 조작 연습',
    cardDescription: '방향키와 스페이스바의 반응이 궁금하다면, 작은 연습 화면에서 먼저 손을 풀어보세요.',
    input: '방향키 · Space',
    start: '조작 연습하기',
    startLabel: '방향키와 스페이스바 조작 연습하기',
    sprintTitle: '100m, 너만의 리듬으로',
    sprintDescription: '선수를 소개하고 두 발을 번갈아 눌러 100m를 달려보세요. 혼자 기록에 도전하거나, 다섯 가상 선수와 함께 질주할 수 있습니다.',
    sprintFeatures: ['혼자 달리기·가상 경쟁', '실사풍·도트풍', '완주 리플레이'],
    sprintInput: '← 왼발 · → 오른발 · Space 응원',
    sprintStart: '100m 달리기 시작하기',
    baseballFeatures: ['선수 육성·직접 타격', '10개 구단·좌우타', '144경기 시즌'],
    baseballInput: 'PC 클릭·키보드 · 모바일 터치',
    baseballLocal: '로컬 체험 가능',
    baseballPreview: 'Preview 검수',
    baseballPublic: '플레이 가능',
    baseballPreparing: '배포판 준비 중',
    baseballStart: '오늘부터 타자 시작하기',
    baseballStatus: '오늘부터 타자 준비 상태 보기',
    baseballNotice: '육성과 선수 저장·복구는 준비 중입니다. 게임 소개에서 현재 제공 범위를 확인해 주세요.',
    baseballPreviewNotice: 'Preview 전용 검수 기록으로 육성과 저장·복구를 시험합니다. 공개 서비스의 기록과 분리됩니다.',
  },
  en: {
    title: 'Playground | Jihoon Choi Portfolio',
    description: 'Choose the 100m sprint, Batter Journey or a little controls practice.',
    heading: ['Choose a game.', 'Find your rhythm.'],
    introduction: 'From a 100m dash to growing your own batter. Choose your next game.',
    collection: 'Choose your game',
    practice: 'Warm up with the controls',
    cardTitle: 'Arrow keys & Space practice',
    cardDescription: 'Curious how the controls feel? Warm up with the arrow keys and Space in a small practice space.',
    input: 'Arrow keys · Space',
    start: 'Try the controls',
    startLabel: 'Practice the arrow keys and Space',
    sprintTitle: '100 metres. Find your rhythm.',
    sprintDescription: 'Meet your runner and alternate your feet through 100 metres. Chase your own time or race five virtual runners.',
    sprintFeatures: ['Solo or virtual competition', 'Realistic or pixel style', 'Finish replay'],
    sprintInput: '← Left foot · → Right foot · Space to cheer',
    sprintStart: 'Start the 100m sprint',
    baseballFeatures: ['Training & manual batting', '10 clubs · left or right', '144-game season'],
    baseballInput: 'Mouse & keyboard · touch on mobile',
    baseballLocal: 'Local trial available',
    baseballPreview: 'Preview test',
    baseballPublic: 'Ready to play',
    baseballPreparing: 'Release in preparation',
    baseballStart: 'Start Batter Journey',
    baseballStatus: 'View Batter Journey status',
    baseballNotice: 'Career play, player saves and recovery are in preparation. Open the game introduction to see what is available.',
    baseballPreviewNotice: 'Try career play, saves and recovery with Preview test records, separate from the public service.',
  },
}

function KeyboardDiagram() {
  return (
    <div className={styles.playgroundDiagram} aria-hidden="true">
      <span className={styles.playgroundDiagramLabel}>ARROWS + SPACE</span>
      <div className={styles.playgroundKeyboard}>
        <div className={styles.playgroundArrowKeys}>
          <kbd className={`${styles.playgroundKey} ${styles.playgroundKeyUp}`}>↑</kbd>
          <kbd className={`${styles.playgroundKey} ${styles.playgroundKeyLeft}`}>←</kbd>
          <kbd className={`${styles.playgroundKey} ${styles.playgroundKeyDown}`}>↓</kbd>
          <kbd className={`${styles.playgroundKey} ${styles.playgroundKeyRight}`}>→</kbd>
        </div>
        <kbd className={`${styles.playgroundKey} ${styles.playgroundSpaceKey}`}>Space</kbd>
      </div>
      <span className={styles.playgroundDiagramNumber}>03</span>
    </div>
  )
}

export default function Playground({ baseballCareerAvailability = 'preparing' }) {
  const english = useRouter().locale === 'en'
  const text = copy[english ? 'en' : 'ko']
  const brand = BASEBALL_CAREER_BRAND[english ? 'en' : 'ko']
  const development = process.env.NODE_ENV === 'development'
  const preview = !development && baseballCareerAvailability === 'preview'
  const production = !development && baseballCareerAvailability === 'production'
  const available = development || preview || production
  const baseballAction = available ? text.baseballStart : text.baseballStatus
  const availability = development ? 'local-trial' : preview ? 'preview-trial' : production ? 'available' : 'preparing'
  const availabilityLabel = development ? text.baseballLocal : preview ? text.baseballPreview : production ? text.baseballPublic : text.baseballPreparing

  return (
    <PlaygroundShell title={text.title} description={text.description}>
      <div className={styles.playgroundLanding} lang={english ? 'en' : 'ko'}>
        <section className={styles.playgroundIntro} aria-labelledby="playground-title">
          <div>
            <p className={styles.playgroundEyebrow}>PLAYGROUND</p>
            <h1 id="playground-title" className={styles.playgroundTitle}>
              {text.heading[0]}<br /><span>{text.heading[1]}</span>
            </h1>
          </div>
          <p className={styles.playgroundIntroduction}>{text.introduction}</p>
        </section>

        <section className={styles.playgroundCollection} aria-labelledby="playground-collection-title">
          <h2 id="playground-collection-title" className={styles.playgroundCollectionTitle}>{text.collection}</h2>
          <Link href="/playground/sprint" className={styles.playgroundCard} aria-label={text.sprintStart} aria-describedby="playground-sprint-description">
            <div className={styles.sprintDiagram} aria-hidden="true"><span>100<span>METRES</span></span><b>01 / FIND YOUR RHYTHM</b></div>
            <div className={styles.playgroundCardBody}>
              <p className={styles.playgroundCardEyebrow}>01 / 100M SPRINT</p>
              <h3 className={styles.playgroundCardTitle}>{text.sprintTitle}</h3>
              <p id="playground-sprint-description" className={styles.playgroundCardDescription}>{text.sprintDescription}</p>
              <ul className={styles.sprintFeatures}>{text.sprintFeatures.map(feature => <li key={feature}>{feature}</li>)}</ul>
              <span className={styles.playgroundInput}>{text.sprintInput}</span>
              <span className={styles.playgroundStart}>{text.sprintStart}<span aria-hidden="true">↗</span></span>
            </div>
          </Link>
          <Link href="/playground/baseball/career" prefetch={false} className={styles.playgroundCard} aria-label={baseballAction} aria-describedby="playground-baseball-description" data-playground-baseball-entry data-availability={availability}>
            <div className={styles.baseballDiagram} aria-hidden="true">
              <Image src="/images/playground/baseball/delivery/20261124/stadium-batting-view-lossless.webp" alt="" fill sizes="(max-width: 760px) 100vw, 560px" loading="eager" className={styles.baseballBackdrop} />
              <span className={styles.baseballDiagramLabel}>BATTING · GROW YOUR GAME</span>
              <span className={styles.baseballDiamond} />
              <span className={styles.baseballBall} />
              <b>02 / ONE AT-BAT AT A TIME</b>
            </div>
            <div className={styles.playgroundCardBody}>
              <p className={styles.playgroundCardEyebrow}>02 / BASEBALL CAREER</p>
              <span className={styles.baseballAvailability}>{availabilityLabel}</span>
              <h3 className={styles.playgroundCardTitle}>{brand.name}</h3>
              <p id="playground-baseball-description" className={styles.playgroundCardDescription}>{brand.description}</p>
              <ul className={styles.sprintFeatures}>{text.baseballFeatures.map(feature => <li key={feature}>{feature}</li>)}</ul>
              {(preview || !available) && <p className={styles.baseballNotice}>{preview ? text.baseballPreviewNotice : text.baseballNotice}</p>}
              <span className={styles.playgroundInput}>{text.baseballInput}</span>
              <span className={styles.playgroundStart}>{baseballAction}<span aria-hidden="true">↗</span></span>
            </div>
          </Link>
        </section>

        <section className={styles.practiceCollection} aria-labelledby="playground-practice-title">
          <h2 id="playground-practice-title" className={styles.playgroundCollectionTitle}>{text.practice}</h2>
          <Link
            href="/playground/controls"
            className={`${styles.playgroundCard} ${styles.practiceCard}`}
            aria-label={text.startLabel}
            aria-describedby="playground-controls-description"
          >
            <KeyboardDiagram />
            <div className={styles.playgroundCardBody}>
              <p className={styles.playgroundCardEyebrow}>03 / CONTROLS</p>
              <h3 className={styles.playgroundCardTitle}>{text.cardTitle}</h3>
              <p id="playground-controls-description" className={styles.playgroundCardDescription}>{text.cardDescription}</p>
              <span className={styles.playgroundInput}>{text.input}</span>
              <span className={styles.playgroundStart}>
                {text.start}
                <svg className={styles.playgroundStartIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </Link>
        </section>
      </div>
    </PlaygroundShell>
  )
}

export async function getStaticProps() {
  const { readBaseballCareerAvailability } = await import('@/lib/server/baseball-db.mjs')
  return { props: { baseballCareerAvailability: readBaseballCareerAvailability() } }
}
