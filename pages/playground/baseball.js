import { useRouter } from 'next/router'
import Head from 'next/head'
import PlaygroundShell from '@/components/playground/playground-shell'
import BaseballGame from '@/components/playground/baseball-game'
import { getBaseballBatterFrames } from '@/lib/playground-baseball-animation.mjs'
import { BASEBALL_SHARED_DELIVERIES, getBaseballSharedDeliverySrc, getBaseballBatterDeliverySrc } from '@/lib/playground-baseball-delivery.mjs'

// Match the initial right-handed preview. Other hands/clubs are not preloaded.
// Fetch can start in the HTML; the Scene still explicitly decodes two at a time.
const initialImages = [
  ...Object.keys(BASEBALL_SHARED_DELIVERIES).map(src => getBaseballSharedDeliverySrc(src)),
  ...Object.values(getBaseballBatterFrames('right')).map(frame => getBaseballBatterDeliverySrc(frame)),
]

export default function BaseballPage({ baseballVersions }) {
  const locale = useRouter().locale === 'en' ? 'en' : 'ko'
  return <PlaygroundShell immersive title={locale === 'ko' ? '타격장 | 최지훈' : 'Batting Practice | Jihoon'} description={locale === 'ko' ? '나만의 선수와 함께 포심·슬라이더·커브·체인지업의 궤적과 타이밍을 비교하는 야구 타격 시제품입니다.' : 'Compare four-seam, slider, curveball and changeup paths and timing in a baseball batting prototype.'}>
    <Head>{initialImages.map(src => <link key={src} rel="preload" as="image" href={src} fetchpriority="low" />)}</Head>
    <BaseballGame locale={locale} dataVersions={baseballVersions} />
  </PlaygroundShell>
}

// Node source hashing stays in getStaticProps and is removed from browser JS.
export async function getStaticProps() {
  const { createBaseballDataVersions } = await import('@/lib/server/baseball-version.mjs')
  return { props:{ baseballVersions:await createBaseballDataVersions() } }
}
