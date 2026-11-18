import { useRouter } from 'next/router'
import PlaygroundShell from '@/components/playground/playground-shell'
import SprintGame from '@/components/playground/sprint-game'
import { getSprintCountries } from '@/lib/playground-sprint-player.mjs'

export default function SprintPlayPage({ countries, development }) {
  const english = useRouter().locale === 'en'
  return <PlaygroundShell immersive
    title={english ? '100m Sprint | Jihoon' : '100m 달리기 | 최지훈'}
    description={english ? 'Find your rhythm in a stadium-sized 100m sprint.' : '경기장 안에서 두 발의 리듬으로 달리는 100m 게임입니다.'}
  ><SprintGame countries={countries} development={development} immersive /></PlaygroundShell>
}

export function getStaticProps({ locale = 'ko' } = {}) {
  return { props: { countries: getSprintCountries(locale), development: process.env.NODE_ENV === 'development' } }
}
