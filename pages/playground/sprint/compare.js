import { useRouter } from 'next/router'
import PlaygroundShell from '@/components/playground/playground-shell'
import SprintComparison from '@/components/playground/sprint-comparison'

export default function SprintComparePage() {
  const english = useRouter().locale === 'en'
  return <PlaygroundShell
    title={english ? 'Four Sprint Studies | Jihoon' : '100m 네 가지 비교 시안 | 최지훈'}
    description={english ? 'Compare top-down and side views in realistic and pixel styles with one shared race.' : '같은 달리기 규칙으로 시점과 그림체 네 가지를 비교하는 시안입니다.'}
  ><SprintComparison /></PlaygroundShell>
}

export function getStaticProps() {
  return process.env.NODE_ENV === 'development' ? { props: {} } : { notFound: true }
}
