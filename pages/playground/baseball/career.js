import { useRouter } from 'next/router'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import PlaygroundShell from '@/components/playground/playground-shell'
import { BASEBALL_CAREER_BRAND } from '@/lib/playground-baseball-brand.mjs'
import styles from '@/styles/playground-index.module.css'

// Only availability is serialized. Storage credentials stay server-side.
// This chunk is fetched and the client is mounted only for an available page.
const CareerGame = dynamic(() => import('@/components/playground/baseball-career-game'), { ssr: false, loading: CareerLoading })

function CareerLoading() {
  const english = useRouter().locale === 'en'
  return <section className={styles.careerNotice} role="status" data-baseball-career-loading>
    <p>{english ? 'Loading Batter Journey…' : '오늘부터 타자를 불러오는 중입니다…'}</p>
  </section>
}

export default function BaseballCareerPage({ baseballCareerAvailability = 'preparing', baseballVersions, atBatStorageVersions, baseballCareerVersions, atBatV2StorageVersions, baseballCareerV2Versions }) {
  const locale = useRouter().locale === 'en' ? 'en' : 'ko'
  const brand = BASEBALL_CAREER_BRAND[locale]
  const development = process.env.NODE_ENV === 'development'
  const preview = !development && baseballCareerAvailability === 'preview'
  const available = development || preview
  return <PlaygroundShell immersive
    title={`${brand.name} | ${locale === 'ko' ? '최지훈' : 'Jihoon'}`}
    description={brand.description}>
    {available
      ? <CareerGame enabled preview={preview} locale={locale} dataVersions={baseballVersions} storageVersions={atBatStorageVersions} careerVersions={baseballCareerVersions} v2StorageVersions={atBatV2StorageVersions} v2CareerVersions={baseballCareerV2Versions} />
      : <section className={styles.careerNotice} data-baseball-career-availability="preparing">
        <p className={styles.playgroundEyebrow}>BATTING · GROW YOUR GAME</p>
        <h1>{brand.name}</h1>
        <p className={styles.baseballAvailability} role="status">{locale === 'ko' ? '배포판 준비 중' : 'Release in preparation'}</p>
        <p>{brand.description}</p>
        <p>{locale === 'ko' ? '이 화면에서는 아직 육성 플레이와 선수 저장·복구를 제공하지 않습니다. 한 타석 연습에서 타격을 먼저 즐길 수 있습니다.' : 'Career play, player saves and recovery are not available here yet. You can try batting in at-bat practice.'}</p>
        <div className={styles.careerNoticeActions}>
          <Link href="/playground" prefetch={false}>{locale === 'ko' ? '놀이터로 돌아가기' : 'Back to the playground'} →</Link>
          <Link href="/playground/baseball/at-bat" prefetch={false}>{locale === 'ko' ? '한 타석 연습하기' : 'Try at-bat practice'} →</Link>
        </div>
      </section>}
  </PlaygroundShell>
}

export async function getStaticProps() {
  const { readBaseballCareerAvailability } = await import('@/lib/server/baseball-db.mjs')
  const baseballCareerAvailability = readBaseballCareerAvailability()
  const { createBaseballDataVersions } = await import('@/lib/server/baseball-version.mjs')
  const { createBaseballAtBatVersions } = await import('@/lib/server/baseball-at-bat-api.mjs')
  const { createBaseballCareerVersions } = await import('@/lib/server/baseball-career-api.mjs')
  const { createBaseballAtBatV2Versions, createBaseballCareerV2Versions } = await import('@/lib/server/baseball-career-v2-api.mjs')
  const [baseballVersions, atBatStorageVersions, baseballCareerVersions, atBatV2StorageVersions, baseballCareerV2Versions] = await Promise.all([
    createBaseballDataVersions(), createBaseballAtBatVersions(), createBaseballCareerVersions(), createBaseballAtBatV2Versions(), createBaseballCareerV2Versions(),
  ])
  return { props:{ baseballCareerAvailability, baseballVersions, atBatStorageVersions, baseballCareerVersions, atBatV2StorageVersions, baseballCareerV2Versions } }
}
