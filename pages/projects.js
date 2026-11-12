import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import PortfolioShell from '@/components/portfolio/portfolio-shell'
import ProjectCard from '@/components/portfolio/project-card'
import { TOKEN, DATABASE_ID, DATA_SOURCE_ID } from '@/config'
import { loadPortfolioProjects } from '@/lib/portfolio-preview.mjs'
import { filterPortfolioProjects, portfolioCategories } from '@/lib/portfolio-catalog.mjs'
import { normalizeLocale } from '@/lib/portfolio-i18n.mjs'
import { getPortfolioMessages } from '@/lib/portfolio-messages.mjs'
import base from '@/styles/portfolio-preview.module.css'
import styles from '@/styles/portfolio-catalog.module.css'

export default function Projects({ projects = [] }) {
  const router = useRouter()
  const locale = normalizeLocale(router.locale)
  const { catalog, meta } = getPortfolioMessages(locale)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('recent')
  const categories = portfolioCategories(projects, { keys: true, locale })
  const visible = filterPortfolioProjects(projects, { query, category, sort, locale })
  const filtered = query.trim() || category !== 'all'
  const [countBefore, countAfter] = (filtered ? catalog.results : catalog.total).split('{count}')

  useEffect(() => {
    if (!router.isReady) return
    setQuery(typeof router.query.q === 'string' ? router.query.q : '')
    setCategory(typeof router.query.category === 'string' ? router.query.category : 'all')
    setSort(router.query.sort === 'title' ? 'title' : 'recent')
  }, [router.isReady, router.query.q, router.query.category, router.query.sort])

  const updateFilters = changes => {
    const next = { query, category, sort, ...changes }
    setQuery(next.query)
    setCategory(next.category)
    setSort(next.sort)
    const params = { ...router.query }
    if (next.query) params.q = next.query
    else delete params.q
    if (next.category !== 'all') params.category = next.category
    else delete params.category
    if (next.sort !== 'recent') params.sort = next.sort
    else delete params.sort
    const hash = window.location.hash
    router.replace({ pathname: router.pathname, query: params, hash }, undefined, { shallow: true, scroll: false })
  }
  const reset = () => updateFilters({ query: '', category: 'all' })
  const categoryLabel = key => projects.find(project => (project.categoryKey || project.category) === key)?.category || key
  const languageQuery = { ...(router.isReady ? router.query : {}), q: query || undefined, category: category === 'all' ? undefined : category, sort: sort === 'recent' ? undefined : sort }
  for (const key of Object.keys(languageQuery)) if (languageQuery[key] === undefined) delete languageQuery[key]

  return (
    <PortfolioShell title={meta.projectsTitle} description={meta.projectsDescription} activePage="projects" mainId="projects-main" languageQuery={languageQuery}>
      <section className={base.container + ' ' + styles.catalog} aria-labelledby="catalog-title">
        <Link href="/#work" className={styles.backLink}><span aria-hidden="true">←</span> {catalog.back}</Link>
        <div className={styles.intro}>
          <div><p className={base.eyebrow}>PROJECT ARCHIVE</p><h1 id="catalog-title">{catalog.title[0]}<br /><span>{catalog.title[1]}</span></h1></div>
          <div className={styles.introAside}><p>{catalog.description[0]}<br />{catalog.description[1]}</p><span className={styles.total}>ALL PROJECTS <strong>{String(projects.length).padStart(2, '0')}</strong></span></div>
        </div>

        {projects.length > 0 && <div className={styles.controls}>
          <form role="search" className={styles.searchForm} onSubmit={event => event.preventDefault()}>
            <label htmlFor="project-search">{catalog.search}</label>
            <div className={styles.searchBox}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.5" /></svg>
              <input id="project-search" type="search" value={query} onChange={event => updateFilters({ query: event.target.value })} placeholder={catalog.placeholder} aria-describedby="project-search-hint" />
              {query && <button type="button" onClick={() => updateFilters({ query: '' })} aria-label={catalog.clear}>×</button>}
            </div>
            <p id="project-search-hint" className={styles.hint}>{catalog.hint}</p>
          </form>
          <div className={styles.sortField}><label htmlFor="project-sort">{catalog.sort}</label><select id="project-sort" value={sort} onChange={event => updateFilters({ sort: event.target.value })}><option value="recent">{catalog.recent}</option><option value="title">{catalog.byTitle}</option></select></div>
        </div>}

        {projects.length > 0 && <div className={styles.filterRow}>
          <div role="group" aria-label={catalog.categories} className={styles.filters}>
            <button type="button" aria-pressed={category === 'all'} onClick={() => updateFilters({ category: 'all' })}>{catalog.all} <span>{projects.length}</span></button>
            {categories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => updateFilters({ category: item })}>{categoryLabel(item)}<span>{projects.filter(project => (project.categoryKey || project.category) === item).length}</span></button>)}
          </div>
          <p className={styles.resultCount} role="status" aria-live="polite" aria-atomic="true">{countBefore}<strong>{visible.length}</strong>{countAfter}</p>
        </div>}

        {visible.length ? <div className={base.projectGrid}>{visible.map((project, index) => <ProjectCard key={project.id} project={project} index={index} headingLevel="h2" />)}</div>
          : <div className={styles.emptyState}>
            <span aria-hidden="true">{projects.length ? '⌕' : '+'}</span>
            <h2>{projects.length ? catalog.emptyTitle : catalog.unconfiguredTitle}</h2>
            <p>{projects.length ? catalog.emptyBody : catalog.unconfiguredBody}</p>
            {projects.length > 0 && <button type="button" onClick={reset}>{catalog.reset}</button>}
          </div>}

        <div className={styles.closing}><p>{catalog.closing}</p><Link href="/#contact">{catalog.contact} <span aria-hidden="true">↗</span></Link></div>
      </section>
    </PortfolioShell>
  )
}

export async function getStaticProps({ locale } = {}) {
  const data = await loadPortfolioProjects({ token: TOKEN, databaseId: DATABASE_ID, dataSourceId: DATA_SOURCE_ID }, { locale })
  return { props: data, revalidate: 1 }
}
