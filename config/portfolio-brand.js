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
        light: '/images/brand/favicon-a-editorial.png',
        dark: '/images/brand/favicon-a-editorial.png',
      },
    },
    b: {
      logo: {
        light: '/images/brand/logo-b-jihoon-light.png',
        dark: '/images/brand/logo-b-jihoon-dark.png',
      },
      favicon: {
        light: '/images/brand/favicon-b-connection.png',
        dark: '/images/brand/favicon-b-connection.png',
      },
    },
    c: {
      logo: {
        light: '/images/brand/logo-c-electric.png',
        dark: '/images/brand/logo-c-electric.png',
      },
      favicon: {
        light: '/images/brand/favicon-c-electric.png',
        dark: '/images/brand/favicon-c-electric.png',
      },
    },
  },
}

export default portfolioBrand
