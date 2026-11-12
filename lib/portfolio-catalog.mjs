import { normalizeLocale } from './portfolio-i18n.mjs'

function languageTag(locale) {
  return normalizeLocale(locale) === 'en' ? 'en-US' : 'ko-KR'
}

function searchable(value, locale) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase(languageTag(locale)).trim()
}

function titleOrder(a, b, locale) {
  return (a.title || '').localeCompare(b.title || '', languageTag(locale), { numeric: true, sensitivity: 'base' })
}

function startMonth(project) {
  // 표시 기간의 시작 월만 사용합니다. 종료일·수정일을 착수일로 추정하지 않습니다.
  if (typeof project.startMonth === 'string') return /^\d{4}\.(?:0[1-9]|1[0-2])$/u.test(project.startMonth) ? project.startMonth : ''
  return project.period?.match(/^\d{4}\.\d{2}(?=$|–)/u)?.[0] || ''
}

export function portfolioCategories(projects, { keys = false, locale } = {}) {
  const categories = new Map()
  for (const project of projects) {
    const key = keys ? project.categoryKey || project.category : project.category
    if (key) categories.set(key, project.category || key)
  }
  return [...categories.keys()].sort((a, b) => categories.get(a).localeCompare(categories.get(b), languageTag(locale)))
}

export function filterPortfolioProjects(projects, { query = '', category = 'all', sort = 'recent', locale } = {}) {
  const terms = searchable(query, locale).split(/\s+/u).filter(Boolean)
  const matches = projects.filter(project => {
    if (category !== 'all' && project.categoryKey !== category && project.category !== category) return false
    const content = searchable([project.title, project.description, project.searchText, project.category, ...(project.tags || [])].join(' '), locale)
    return terms.every(term => content.includes(term))
  })

  return matches.sort(sort === 'title' ? (a, b) => titleOrder(a, b, locale) : (a, b) => {
    const first = startMonth(a)
    const second = startMonth(b)
    if (first !== second) return first < second ? 1 : -1
    return titleOrder(a, b, locale)
  })
}
