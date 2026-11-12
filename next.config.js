/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
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
