import { useRouter } from 'next/router'
import PlaygroundShell from '@/components/playground/playground-shell'
import SprintGame from '@/components/playground/sprint-game'
import { getSprintCountries } from '@/lib/playground-sprint-player.mjs'

export default function SprintPage({ countries, development }) {
  const english = useRouter().locale === 'en'
  return (
    <PlaygroundShell
      immersive={!development}
      title={english ? '100m Sprint & Replay | Jihoon' : '100m 달리기와 리플레이 | 최지훈'}
      description={english ? 'Set up your runner, alternate your feet and replay your 100m sprint from another view.' : '선수를 설정하고 두 발의 리듬으로 달린 뒤 다른 시점으로 완주 경기를 다시 보세요.'}
    >
      <SprintGame countries={countries} development={development} immersive={!development} />
    </PlaygroundShell>
  )
}

// Serialize labels once: Node and browser ICU versions can use different names.
export function getStaticProps({ locale = 'ko' } = {}) {
  return { props: { countries: getSprintCountries(locale), development: process.env.NODE_ENV === 'development' } }
}
