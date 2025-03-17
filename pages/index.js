import Head from 'next/head'
import Layout from '../components/layout'
import Hero from '@/components/home/hero'


export default function Home() {
  return (
    <Layout>
      <Head>
        <title>최지훈 포트폴리오</title>
        <meta name="description" content="최지훈 포트폴리오!!" />
        <meta name="naver-site-verification" content="cbaf6c94c9f869742c5755ca8b976783e266878e" />
        <meta name="google-site-verification" content="aZeJZGu7QX_-nX8d58FQ4YQ9hTjS3n9UwEW29pYZZB8" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <section className="flex min-h-screen flex-col items-center justify-center text-gray-600 body-font">
        <div className="container mx-auto flex px-5 py-24 md:flex-row flex-col items-center">
          <Hero/>
          
        </div>
      </section>


    </Layout>
  )
}
