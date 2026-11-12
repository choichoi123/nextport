/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    domains: [
      'www.notion.so',
      'app.notion.com',
      'images.unsplash.com',
      's3.us-west-2.amazonaws.com',
      'prod-files-secure.s3.us-west-2.amazonaws.com'
    ],
    formats: ['image/webp']
  }
}

module.exports = nextConfig
