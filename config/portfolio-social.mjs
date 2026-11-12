// OG는 방문자의 화면 테마와 별개입니다. 'light'로 바꾸면 밝은 안을 사용합니다.
const portfolioSocial = {
  siteOrigin: 'https://nextport-roan.vercel.app',
  activeImage: 'deep-green', // 'deep-green' | 'light'
  images: {
    light: { src: '/images/og-drafts/og-b-light-20261112.png' },
    'deep-green': { src: '/images/og-drafts/og-b-deep-green-20261112.png' },
  },
}

export function getPortfolioSocialImage() {
  const image = portfolioSocial.images[portfolioSocial.activeImage]
  if (!image) throw new Error('지원하지 않는 OG 이미지 설정입니다.')
  return {
    ...image,
    url: new URL(image.src, portfolioSocial.siteOrigin).href,
    width: 1200,
    height: 630,
    type: 'image/png',
  }
}

export default portfolioSocial
