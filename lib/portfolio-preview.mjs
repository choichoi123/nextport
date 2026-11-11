import { getNotionProjects } from './notion.mjs'

// 연결이 없는 /preview에서만 사용하는 예시이며 Notion 원본을 대신하지 않습니다.
const EXAMPLE_PROJECTS = [
  {
    id: 'preview-wiseop',
    title: '부산 교통약자 이동지원 WISEOP',
    description: '수요·차량·재배치 흐름을 연결한 관제 웹 애플리케이션입니다.',
    role: '웹 프론트엔드·백엔드·외부 시스템 연동',
    highlight: '결과불명 복구 · 늦은 응답 방어 · 결측과 0 구분',
    period: '2026.08–2026.11',
    tags: ['Java', 'Spring Boot', 'Thymeleaf', 'Alpine.js', 'Kakao Maps', 'JavaScript', 'H3', 'ECharts', 'ActiveMQ/JMS'],
    href: null,
    github: null,
    youtube: null,
    cover: null,
    category: '관제 웹 애플리케이션',
    art: 'dispatch',
  },
  {
    id: 'preview-paju',
    title: '파주 교통약자 바우처 앱',
    description: '가입·승인 확인부터 주소 선택·접수·이용내역까지 연결한 모바일 웹입니다.',
    role: '이용자·관리자 프론트엔드 / API 연동',
    highlight: '주소와 지도 좌표 연결 · 로그인과 센터 연동 상태 구분',
    period: '2026.02–2026.05',
    tags: ['React', 'Redux Toolkit', 'React Router', 'Axios', 'Kakao Maps', 'JavaScript'],
    href: null,
    github: null,
    youtube: null,
    cover: null,
    category: '모바일 WebView 서비스',
    art: 'mobile',
  },
  {
    id: 'preview-eksys',
    title: '이케이시스 홈페이지 리뉴얼',
    description: '회사 소개·제품 소개·오시는 길을 구성한 React 기반 반응형 홈페이지입니다.',
    role: 'React 기반 홈페이지·Fullpage Scroll 구현',
    highlight: '기존 정적 홈페이지를 반응형 회사 소개·제품 화면으로 리뉴얼',
    period: '2024.07–2024.08',
    tags: ['React', 'JavaScript', 'Node.js'],
    href: null,
    github: null,
    youtube: null,
    cover: null,
    category: '기업 웹사이트',
    art: 'diagram',
  },
]

// 표시 순서만 지정하며 프로젝트 내용은 조회한 Notion 데이터를 사용합니다.
const FEATURED_PROJECT_IDS = [
  '4144c6db16758078a2c5d4f55a1ba51c',
  '4154c6db167580b8afebcdc51b0c949f',
  'fba4c6db16758282868481b2e939c83b',
]

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function projectId(value) {
  return stringValue(value).replaceAll('-', '').toLowerCase()
}

export function selectFeaturedProjects(projects, source = 'notion') {
  if (source === 'example') return projects.slice(0, 3)

  const preferred = FEATURED_PROJECT_IDS
    .map((id) => projects.find((project) => projectId(project.id) === id))
    .filter(Boolean)
  const selected = []
  const seen = new Set()

  for (const project of [...preferred, ...projects]) {
    const key = projectId(project.id) || project
    if (seen.has(key)) continue
    seen.add(key)
    selected.push(project)
    if (selected.length === 3) break
  }
  return selected
}

function richText(parts) {
  if (!Array.isArray(parts)) return ''
  return parts.map((part) => typeof part?.plain_text === 'string' ? part.plain_text : '').join('').trim()
}

function publicUrl(value) {
  const candidate = stringValue(value)
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? candidate : null
  } catch {
    return null
  }
}

function monthValue(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})(?:-(\d{2})(?:T.+)?)?$/.exec(value)
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null
  if (match[3]) {
    const date = `${match[1]}-${match[2]}-${match[3]}`
    const timestamp = Date.parse(`${date}T00:00:00Z`)
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null
    if (value.includes('T') && !Number.isFinite(Date.parse(value))) return null
  }
  return `${match[1]}.${match[2]}`
}

function projectPeriod(date) {
  const start = monthValue(date?.start)
  const end = monthValue(date?.end)
  if (start && end) return start === end ? start : `${start}–${end}`
  if (start) return `${start}–종료일 미정`
  if (end) return `시작일 미정–${end}`
  return '기간 미정'
}

function projectPresentation(title, tags) {
  const text = `${title} ${tags.join(' ')}`
  if (/WISE[\s-]?OP|관제/iu.test(text)) return { category: '관제 웹 애플리케이션', art: 'dispatch' }
  if (/파주|paju|WebView|모바일|바우처|앱/iu.test(text)) return { category: '모바일·이용자 서비스', art: 'mobile' }
  if (/홈페이지|웹사이트|website/iu.test(text)) return { category: '웹사이트', art: 'diagram' }
  return { category: '웹 프로젝트', art: 'diagram' }
}

function normalizeProject(page, index) {
  const properties = page?.properties || {}
  const title = richText(properties.Name?.title) || '제목 없는 프로젝트'
  const description = richText(properties.Description?.rich_text)
  const tags = Array.isArray(properties.Tags?.multi_select)
    ? properties.Tags.multi_select.map((tag) => stringValue(tag?.name)).filter(Boolean)
    : []
  const sentences = description.split(/(?<=[.!?。])\s+|\n+/u).filter(Boolean)
  const roleSentence = sentences.find((sentence) => (
    /^(?:제가|저는)\s+.*(?:담당|기여)/u.test(sentence)
    || /^(?:내 역할|본인 담당|개인 담당|담당 범위)\s*[:：]\s*\S/u.test(sentence)
  ))

  return {
    id: stringValue(page?.id) || `notion-project-${index + 1}`,
    title,
    description,
    role: roleSentence || '상세 소개에서 담당 범위 확인',
    highlight: '개인 기여와 검증 내용은 상세 소개에서 확인',
    period: projectPeriod(properties.WorkPeriod?.date),
    tags,
    href: publicUrl(page?.url),
    github: publicUrl(properties.GitHub?.url),
    youtube: publicUrl(properties.Youtube?.url),
    cover: publicUrl(page?.cover?.file?.url) || publicUrl(page?.cover?.external?.url),
    ...projectPresentation(title, tags),
  }
}

function portfolioConnection(config = {}) {
  for (const key of ['token', 'databaseId', 'dataSourceId']) {
    if (config[key] != null && typeof config[key] !== 'string') {
      throw new Error('포트폴리오 연결 설정은 문자열이어야 합니다.')
    }
  }
  return {
    token: stringValue(config.token),
    databaseId: stringValue(config.databaseId),
    dataSourceId: stringValue(config.dataSourceId),
  }

}

export async function loadPortfolioProjects(config = {}, { getProjects = getNotionProjects } = {}) {
  const connection = portfolioConnection(config)
  if (!connection.token && !connection.databaseId && !connection.dataSourceId) {
    return { source: 'unconfigured', projects: [] }
  }

  // 공개 페이지에는 실데이터만 전달하며 설정·인증 오류를 예시로 숨기지 않습니다.
  const result = await getProjects(connection)
  if (!Array.isArray(result?.results)) throw new Error('프로젝트 목록 응답 형식이 올바르지 않습니다.')
  return { source: 'notion', projects: result.results.map(normalizeProject) }
}

export async function loadPortfolioPreview(config = {}, dependencies = {}) {
  const connection = portfolioConnection(config)
  if (!connection.token && !connection.databaseId && !connection.dataSourceId) {
    return {
      source: 'example',
      projects: EXAMPLE_PROJECTS.map((project) => ({ ...project, tags: [...project.tags] })),
    }
  }

  return loadPortfolioProjects(connection, dependencies)
}
