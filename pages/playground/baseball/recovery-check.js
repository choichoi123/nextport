import { useRouter } from 'next/router'
import PlaygroundShell from '@/components/playground/playground-shell'

// The fault fixture is not a dependency of the production page or the game.
const RecoveryCheck = process.env.NODE_ENV === 'development'
  ? require('@/components/playground/baseball-recovery-check').default
  : () => null

export default function BaseballRecoveryCheckPage() {
  const locale = useRouter().locale === 'en' ? 'en' : 'ko'
  return <PlaygroundShell title="Image recovery check | Jihoon" description="Development-only image recovery check.">
    <RecoveryCheck locale={locale} />
  </PlaygroundShell>
}

export function getStaticProps() {
  return process.env.NODE_ENV === 'development' ? { props:{} } : { notFound:true }
}
