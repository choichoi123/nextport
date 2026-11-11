import Link from 'next/link'
import { useState } from 'react'
import PortfolioShell from '@/components/portfolio/portfolio-shell'
import ProjectCard from '@/components/portfolio/project-card'
import { TOKEN, DATABASE_ID, DATA_SOURCE_ID } from '@/config'
import { loadPortfolioProjects } from '@/lib/portfolio-preview.mjs'
import { filterPortfolioProjects, portfolioCategories } from '@/lib/portfolio-catalog.mjs'
import base from '@/styles/portfolio-preview.module.css'
import styles from '@/styles/portfolio-catalog.module.css'

export default function Projects({ projects = [] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('recent')
  const categories = portfolioCategories(projects)
  const visible = filterPortfolioProjects(projects, { query, category, sort })
  const filtered = query.trim() || category !== 'all'
  const reset = () => { setQuery(''); setCategory('all') }

  return (
    <PortfolioShell title="전체 프로젝트 | 최지훈 포트폴리오" description="업무와 사용자를 연결한 웹 프로젝트의 구현 경험을 소개합니다. 프로젝트 분야와 사용 기술로 살펴보세요." activePage="projects" mainId="projects-main">
      <section className={base.container + ' ' + styles.catalog} aria-labelledby="catalog-title">
        <Link href="/#work" className={styles.backLink}><span aria-hidden="true">←</span> 소개와 대표 프로젝트</Link>
        <div className={styles.intro}>
          <div><p className={base.eyebrow}>PROJECT ARCHIVE</p><h1 id="catalog-title">프로젝트마다 다른 문제,<br /><span>그 안에 담긴 구현 경험.</span></h1></div>
          <div className={styles.introAside}><p>이용자 서비스부터 관제와 설계 도구까지.<br />분야와 기술로 작업을 살펴보세요.</p><span className={styles.total}>ALL PROJECTS <strong>{String(projects.length).padStart(2, '0')}</strong></span></div>
        </div>

        {projects.length > 0 && <div className={styles.controls}>
          <form role="search" className={styles.searchForm} onSubmit={event => event.preventDefault()}>
            <label htmlFor="project-search">프로젝트 검색</label>
            <div className={styles.searchBox}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.5" /></svg>
              <input id="project-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="프로젝트명, 사용 기술, 키워드" aria-describedby="project-search-hint" />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기">×</button>}
            </div>
            <p id="project-search-hint" className={styles.hint}>여러 단어를 입력하면 모두 포함하는 프로젝트를 찾습니다.</p>
          </form>
          <div className={styles.sortField}><label htmlFor="project-sort">정렬</label><select id="project-sort" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">최근 시작 순</option><option value="title">이름순</option></select></div>
        </div>}

        {projects.length > 0 && <div className={styles.filterRow}>
          <div role="group" aria-label="프로젝트 분야" className={styles.filters}>
            <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>전체 <span>{projects.length}</span></button>
            {categories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}<span>{projects.filter(project => project.category === item).length}</span></button>)}
          </div>
          <p className={styles.resultCount} role="status" aria-live="polite" aria-atomic="true">{filtered ? '검색 결과 ' : '전체 '}<strong>{visible.length}</strong>개</p>
        </div>}

        {visible.length ? <div className={base.projectGrid}>{visible.map((project, index) => <ProjectCard key={project.id} project={project} index={index} headingLevel="h2" />)}</div>
          : <div className={styles.emptyState}>
            <span aria-hidden="true">{projects.length ? '⌕' : '+'}</span>
            <h2>{projects.length ? '조건에 맞는 프로젝트가 없습니다.' : '프로젝트를 준비하고 있습니다.'}</h2>
            <p>{projects.length ? '다른 키워드나 분야로 다시 살펴보세요.' : '정리한 프로젝트와 구현 경험을 이곳에 소개하겠습니다.'}</p>
            {projects.length > 0 && <button type="button" onClick={reset}>검색과 분야 초기화</button>}
          </div>}

        <div className={styles.closing}><p>프로젝트의 배경과 구현 과정은 각 상세 소개에서 이어집니다.</p><Link href="/#contact">경험에 대해 이야기하기 <span aria-hidden="true">↗</span></Link></div>
      </section>
    </PortfolioShell>
  )
}

export async function getStaticProps() {
  const data = await loadPortfolioProjects({ token: TOKEN, databaseId: DATABASE_ID, dataSourceId: DATA_SOURCE_ID })
  return { props: data, revalidate: 1 }
}
