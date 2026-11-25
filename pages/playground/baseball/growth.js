import Link from 'next/link'
import { useRouter } from 'next/router'
import PlaygroundShell from '@/components/playground/playground-shell'

let DevelopmentGrowthPreview=()=>null
if(process.env.NODE_ENV==='development'){
  DevelopmentGrowthPreview=require('@/components/playground/baseball-growth-preview').default
}

export default function BaseballGrowthPage(){
  const locale=useRouter().locale==='en'?'en':'ko'
  return <PlaygroundShell immersive
    title={locale==='ko'?'타자 성장 비교 | 최지훈':'Batter Growth Comparison | Jihoon'}
    description={locale==='ko'?'같은 투구와 스윙으로 미트·파워의 성장 후보를 저장 없이 비교합니다.':'Compare proposed contact and power growth using the same pitch and swing, without saving records.'}>
    {process.env.NODE_ENV==='development'?<DevelopmentGrowthPreview locale={locale}/>:<section style={{maxWidth:800,margin:'auto',padding:'48px 24px'}}>
      <h1>{locale==='ko'?'타자 성장 비교는 개발용입니다.':'Growth comparison is for development.'}</h1>
      <p>{locale==='ko'?'실제 선수나 성적을 변경하지 않는 로컬 비교 화면입니다.':'This local comparison does not change real players or statistics.'}</p>
      <Link href='/playground/baseball/career' prefetch={false}>{locale==='ko'?'선수 육성으로':'Go to batter career'} →</Link>
    </section>}
  </PlaygroundShell>
}
