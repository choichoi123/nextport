import { useRouter } from 'next/router'
import Head from 'next/head'
import PlaygroundShell from '@/components/playground/playground-shell'
import BaseballAtBatGame from '@/components/playground/baseball-at-bat-game'
import { getBaseballBatterFrames } from '@/lib/playground-baseball-animation.mjs'
import { BASEBALL_SHARED_DELIVERIES, getBaseballSharedDeliverySrc, getBaseballBatterDeliverySrc } from '@/lib/playground-baseball-delivery.mjs'

const initialImages = [
  ...Object.keys(BASEBALL_SHARED_DELIVERIES).map(src => getBaseballSharedDeliverySrc(src)),
  ...Object.values(getBaseballBatterFrames('right')).map(frame => getBaseballBatterDeliverySrc(frame)),
]

export default function BaseballAtBatPage({ baseballVersions, atBatStorageVersions }) {
  const locale = useRouter().locale === 'en' ? 'en' : 'ko'
  return <PlaygroundShell immersive
    title={locale === 'ko' ? '한 타석 연습 | 최지훈' : 'At-bat Practice | Jihoon'}
    description={locale === 'ko' ? '볼카운트와 파울 승부를 이어가며 볼넷·삼진·안타·아웃까지 한 타석을 연습합니다.' : 'Play a full at-bat through balls, strikes and fouls to a walk, strikeout, hit or out.'}>
    <Head>{initialImages.map(src => <link key={src} rel="preload" as="image" href={src} fetchpriority="low" />)}</Head>
    <BaseballAtBatGame locale={locale} dataVersions={baseballVersions} storageVersions={atBatStorageVersions} />
  </PlaygroundShell>
}

export async function getStaticProps() {
  const { createBaseballDataVersions } = await import('@/lib/server/baseball-version.mjs')
  const { createBaseballAtBatVersions } = await import('@/lib/server/baseball-at-bat-api.mjs')
  const [baseballVersions, atBatStorageVersions] = await Promise.all([createBaseballDataVersions(), createBaseballAtBatVersions()])
  return { props:{ baseballVersions, atBatStorageVersions } }
}
