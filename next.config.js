/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16.4.6 Pages Router의 초기 ISR 표시기 경합을 우회합니다.
  // Fast Refresh와 빌드·실행 오류 표시는 유지됩니다.
  devIndicators: false,
  outputFileTracingRoot: __dirname,
  // 육성 기록 검증에 필요한 원본 파일을 서버리스 함수에 포함합니다.
  outputFileTracingIncludes: {
    '/api/playground/baseball/{careers,careers-v2}{,/**}': [
      './lib/playground-baseball*.mjs',
      './components/playground/*baseball*.js',
      './styles/playground-baseball*.module.css',
    ],
  },
  // 프로젝트에서 직접 관리하는 AGENTS.md를 자동 수정하지 않습니다.
  agentRules: false,
  i18n: {
    locales: ['ko', 'en'],
    defaultLocale: 'ko',
    localeDetection: false,
  },
  async redirects() {
    return ['/archive', '/about-me', '/gallery'].map(path => ({
      source: `/en${path}`,
      destination: path,
      permanent: false,
      locale: false,
    }))
  },
  images: {
    remotePatterns: [
      'www.notion.so',
      'app.notion.com',
      'images.unsplash.com',
      's3.us-west-2.amazonaws.com',
      'prod-files-secure.s3.us-west-2.amazonaws.com'
    ].map(hostname => ({ hostname, pathname: '/**' })),
    formats: ['image/webp']
  }
}

module.exports = nextConfig
