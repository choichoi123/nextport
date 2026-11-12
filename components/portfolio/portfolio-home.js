import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { selectFeaturedProjects } from '@/lib/portfolio-preview.mjs'
import ProjectArt from '@/components/preview/project-art'
import PortfolioShell from './portfolio-shell'
import ProjectCard from './project-card'
import Arrow from './arrow'
import styles from '@/styles/portfolio-preview.module.css'
import { getPortfolioMessages } from '@/lib/portfolio-messages.mjs'

function CaseDialog({ project, onClose }) {
  const ref = useRef(null)
  const { locale } = useRouter()
  const { card } = getPortfolioMessages(locale)

  useEffect(() => {
    const dialog = ref.current
    if (project && !dialog.open) dialog.showModal()
    else if (!project && dialog.open) dialog.close()
  }, [project])

  return (
    <dialog ref={ref} className={styles.caseDialog} aria-labelledby="preview-case-title" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
      {project && <div className={styles.dialogContent}>
        <div className={styles.dialogTop}><span>PROJECT PREVIEW</span><button type="button" onClick={() => ref.current.close()} aria-label={card.closeLabel}>{card.close} <span aria-hidden="true">×</span></button></div>
        <ProjectArt project={project} />
        <div className={styles.dialogCopy}>
          <p className={styles.eyebrow}>{project.category} · {project.period}</p>
          <h2 id="preview-case-title">{project.title}</h2>
          <p>{project.description}</p>
          <dl className={styles.contribution}><div><dt>{card.role}</dt><dd>{project.role}</dd></div><div><dt>{card.contribution}</dt><dd>{project.highlight}</dd></div></dl>
          <p className={styles.dialogNotice}>{card.dialogNotice}</p>
        </div>
      </div>}
    </dialog>
  )
}

export default function PortfolioHome({ projects = [], source, preview = false }) {
  const { locale } = useRouter()
  const { home, meta } = getPortfolioMessages(locale)
  const [selected, setSelected] = useState(null)
  useEffect(() => setSelected(null), [locale])
  const examples = preview && source === 'example'
  const visibleProjects = source === 'example' && !preview ? [] : projects
  const featured = selectFeaturedProjects(visibleProjects, source)

  return (
    <PortfolioShell
      title={preview ? meta.previewTitle : undefined}
      description={preview ? meta.previewDescription : undefined}
      preview={preview}
      examples={examples}
      mainId={preview ? 'preview-main' : 'portfolio-main'}
    >
      <section className={`${styles.hero} ${styles.container}`} id="intro" aria-labelledby="intro-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.heroLine} />INTERFACE. WORKFLOW. CONNECTION.</p>
          <h1 id="intro-title">{home.heroTitle[0]}<br /><span>{home.heroTitle[1]}</span></h1>
          <p className={styles.heroIntro}>{home.introBefore}<strong>{home.name}</strong>{home.introAfter}</p>
          <p className={styles.heroDescription}>{home.description[0]}<br className={styles.desktopBreak} /> {home.description[1]}</p>
          <div className={styles.heroActions}><a href="#work" className={styles.primaryButton}>{home.selected}<Arrow /></a><a href="#contact" className={styles.textButton}>{home.talk}<Arrow diagonal /></a></div>
          <div className={styles.heroExpertise}>{home.expertise.map(item => <span key={item}>{item}</span>)}</div>
        </div>
        <div className={styles.heroVisual} aria-label={home.visualLabel}>
          <div className={styles.visualTop}><span>FROM SCREEN TO WORKFLOW</span><span className={styles.visualIndex}>01 — 03</span></div>
          <div className={styles.visualHeading}>{home.visualTitle[0]}<br /><em>{home.visualTitle[1]}</em></div>
          <div className={styles.workflow}>
            {home.workflow.map((item, index) => <div key={index}><span className={styles.flowNumber}>{String(index + 1).padStart(2, '0')}</span><div><strong>{item.title}</strong><span>{item.caption}</span></div><span className={styles.flowIcon} aria-hidden="true">↗</span></div>)}
          </div>
          <div className={styles.visualBottom}><span className={styles.smallCross} aria-hidden="true">＋</span><span>{home.visualBottom}</span></div>
        </div>
      </section>

      <section className={`${styles.workSection} ${styles.container}`} id="work" aria-labelledby="work-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>SELECTED WORK</p><h2 id="work-title">{home.workTitle[0]}<br className={styles.mobileBreak} /> <span>{home.workTitle[1]}</span></h2></div><p>{home.workDescription[0]}<br />{home.workDescription[1]}</p></div>
        {examples && <p className={styles.sampleNote}>{home.sampleNote}</p>}
        {featured.length > 0 ? <div className={styles.projectGrid}>{featured.map((project, index) => <ProjectCard key={project.id} project={project} index={index} featured={index === 0} onPreview={examples ? setSelected : undefined} />)}</div>
          : <div className={styles.emptyState}><h3>{home.emptyTitle}</h3><p>{home.emptyBody}</p></div>}
        <div className={styles.workFooter}><p>{home.workFooter}</p><Link href="/projects" className={styles.textButton}>{home.allProjects}<Arrow diagonal /></Link></div>
      </section>

      <section className={`${styles.approachSection} ${styles.container}`} id="approach" aria-labelledby="approach-title">
        <div><p className={styles.eyebrow}>WHAT I CONNECT</p><h2 id="approach-title">{home.approachTitle[0]}<br />{home.approachTitle[1]}</h2></div>
        <div className={styles.approachList}>
          {home.approach.map((item, index) => <div key={index}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></div>)}
        </div>
      </section>

      <section className={`${styles.contactPanel} ${styles.container}`} id="contact" aria-labelledby="contact-title">
        <div><p className={styles.eyebrow}>LET&apos;S TALK</p><h2 id="contact-title">{home.contactTitle[0]}<br />{home.contactTitle[1]}</h2><p className={styles.contactDescription}>{home.contactDescription[0]}<br />{home.contactDescription[1]}</p></div>
        <div className={styles.contactLinks}>
          <a href="https://open.kakao.com/o/srGJzeff" target="_blank" rel="noopener noreferrer"><span><small>CONTACT</small>{home.kakao}</span><Arrow diagonal /></a>
          <a href="https://github.com/choichoi123/nextport" target="_blank" rel="noopener noreferrer"><span><small>SOURCE</small>{home.github}</span><Arrow diagonal /></a>
        </div>
      </section>
      {examples && <CaseDialog project={selected} onClose={() => setSelected(null)} />}
    </PortfolioShell>
  )
}
