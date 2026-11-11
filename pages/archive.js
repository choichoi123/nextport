import Head from 'next/head'
import Layout from '../components/layout'
import Hero from '@/components/home/hero'
import Link from 'next/link'


export default function ArchivedHome() {
  return (
    <Layout>
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-center text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        이전 버전의 홈 페이지입니다. <Link href="/" className="underline underline-offset-4">현재 포트폴리오로 이동</Link>
      </div>
      <Head>
        <title>이전 홈 보관본 | 최지훈 포트폴리오</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="최지훈 포트폴리오!!" />
        <meta name="naver-site-verification" content="cbaf6c94c9f869742c5755ca8b976783e266878e" />
        <meta name="google-site-verification" content="aZeJZGu7QX_-nX8d58FQ4YQ9hTjS3n9UwEW29pYZZB8" />
        <link rel="icon" href="/favicon.ico" />


        <meta property="og:title" content="최지훈 포트폴리오!!"/>
        <meta property="og:description" content="최지훈의 포트폴리오에 오신걸 환영합니다!!"/>
        <meta property="og:image" content="/opengraph-image.png"/>
        <meta property="og:type" content="website"/>
        <meta property="og:locale" content="ko_KR"/>
      </Head>
      <section className="flex min-h-screen flex-col items-center justify-center text-gray-600 body-font">
        <div className="container mx-auto flex px-5 py-24 md:flex-row flex-col items-center">
          <Hero/>

        </div>
      </section>


    </Layout>
  )
}
