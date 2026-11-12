export function normalizeLocale(locale) {
  return locale === 'en' ? 'en' : 'ko'
}

export function localePath(path = '/', locale = 'ko') {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('언어 경로는 사이트 내부의 절대 경로여야 합니다.')
  }
  const [, pathname, suffix] = /^([^?#]*)(.*)$/su.exec(path)
  const unprefixed = pathname.replace(/^\/(?:ko|en)(?=\/|$)/u, '') || '/'
  if (unprefixed.startsWith('//') || unprefixed.includes('\\')) {
    throw new Error('언어 경로는 사이트 내부의 절대 경로여야 합니다.')
  }
  // 번역하지 않는 기존 페이지는 한국어 경로를 유지합니다.
  const legacy = ['/archive', '/about-me', '/gallery'].includes(unprefixed.replace(/\/$/u, ''))
  const prefix = normalizeLocale(locale) === 'en' && !legacy ? '/en' : ''
  return `${prefix}${unprefixed === '/' && prefix ? '' : unprefixed}${suffix}`
}
