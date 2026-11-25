import { useRouter } from 'next/router'
import Link from 'next/link'
import PlaygroundShell from '@/components/playground/playground-shell'

let DevelopmentPostplayPreview=()=>null
if(process.env.NODE_ENV==='development'){
  DevelopmentPostplayPreview=require('@/components/playground/baseball-postplay-preview').default
}

export default function BaseballPostplayPage(){
  const locale=useRouter().locale==='en'?'en':'ko'
  return <PlaygroundShell immersive title={locale==='ko'?'야구 타구·동작 시안 | 최지훈':'Baseball Postplay Preview | Jihoon'} description={locale==='ko'?'타구 표시 경로와 짧은 후속 동작을 실제 경기·저장과 분리해 비교합니다.':'Compare batted-ball paths and short postplay motion separately from real play and saved records.'}>
    {process.env.NODE_ENV==='development'?<DevelopmentPostplayPreview locale={locale} />:<section style={{maxWidth:800,margin:'auto',padding:'48px 24px'}}>
      <h1>{locale==='ko'?'야구 타구·동작 시안은 개발용입니다.':'Postplay comparison is for development.'}</h1>
      <p>{locale==='ko'?'실제 경기 기록을 만들지 않는 로컬 비교 화면입니다.':'This local comparison screen does not create real game records.'}</p>
      <Link href="/playground/baseball/at-bat" prefetch={false}>{locale==='ko'?'한 타석 연습으로':'Go to at-bat practice'} →</Link>
    </section>}
  </PlaygroundShell>
}
