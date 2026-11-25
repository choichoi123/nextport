import { useRouter } from 'next/router'
import PlaygroundShell from '@/components/playground/playground-shell'
import BaseballUniformReview from '@/components/playground/baseball-uniform-review'

export default function BaseballUniformReviewPage() {
  const locale = useRouter().locale === 'en' ? 'en' : 'ko'
  return <PlaygroundShell title={locale === 'en' ? 'Uniform regions | Jihoon' : '유니폼 합성 영역 | 최지훈'}
    description={locale === 'en' ? 'Development review of clothing regions on the existing baseball poses.' : '기존 야구 자세의 의상 합성 영역을 확인하는 개발용 화면입니다.'}>
    <BaseballUniformReview locale={locale} />
  </PlaygroundShell>
}

export function getStaticProps() {
  return process.env.NODE_ENV === 'development' ? { props: {} } : { notFound: true }
}
