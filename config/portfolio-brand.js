// 브랜드를 바꿀 때는 activeBrand를 'a', 'b', 'c' 중 하나로 변경합니다.
const portfolioBrand = {
  activeBrand: 'b',
  variants: {
    a: {
      logo: {
        light: '/images/brand/logo-a-editorial.png',
        dark: '/images/brand/logo-a-editorial.png',
      },
      favicon: {
        source: '/images/brand/favicon-a-editorial.png',
        src: '/images/brand/generated/favicon-a-96.png',
        sizes: '96x96',
      },
    },
    b: {
      logo: {
        light: '/images/brand/logo-b-jihoon-light.png',
        dark: '/images/brand/logo-b-jihoon-dark.png',
      },
      favicon: {
        source: '/images/brand/favicon-b-connection.png',
        src: '/images/brand/generated/favicon-b-96.png',
        sizes: '96x96',
      },
    },
    c: {
      logo: {
        light: '/images/brand/logo-c-electric.png',
        dark: '/images/brand/logo-c-electric.png',
      },
      favicon: {
        source: '/images/brand/favicon-c-electric.png',
        src: '/images/brand/generated/favicon-c-96.png',
        sizes: '96x96',
      },
    },
  },
}

module.exports = portfolioBrand
