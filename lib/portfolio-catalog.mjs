function searchable(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').trim()
}

function titleOrder(a, b) {
  return (a.title || '').localeCompare(b.title || '', 'ko-KR', { numeric: true, sensitivity: 'base' })
}

function startMonth(project) {
  // 표시 기간의 시작 월만 사용합니다. 종료일·수정일을 착수일로 추정하지 않습니다.
  return project.period?.match(/^\d{4}\.\d{2}(?=$|–)/u)?.[0] || ''
}

export function portfolioCategories(projects) {
  return [...new Set(projects.map(project => project.category).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko-KR'))
}

export function filterPortfolioProjects(projects, { query = '', category = 'all', sort = 'recent' } = {}) {
  const terms = searchable(query).split(/\s+/u).filter(Boolean)
  const matches = projects.filter(project => {
    if (category !== 'all' && project.category !== category) return false
    const content = searchable([project.title, project.description, project.category, ...(project.tags || [])].join(' '))
    return terms.every(term => content.includes(term))
  })

  return matches.sort(sort === 'title' ? titleOrder : (a, b) => {
    const first = startMonth(a)
    const second = startMonth(b)
    if (first !== second) return first < second ? 1 : -1
    return titleOrder(a, b)
  })
}
