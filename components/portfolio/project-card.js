import ProjectArt from '@/components/preview/project-art'
import { useRouter } from 'next/router'
import { getPortfolioMessages, formatPortfolioMessage } from '@/lib/portfolio-messages.mjs'
import Arrow from './arrow'
import styles from '@/styles/portfolio-preview.module.css'

export default function ProjectCard({ project, index = 0, featured = false, onPreview, headingLevel = 'h3' }) {
  const { locale } = useRouter()
  const { card } = getPortfolioMessages(locale)
  const label = template => formatPortfolioMessage(template, { title: project.title })
  const Heading = headingLevel === 'h2' ? 'h2' : 'h3'
  const canPreview = !project.href && typeof onPreview === 'function'

  return (
    <article className={`${styles.projectCard} ${featured ? styles.featuredCard : ''}`}>
      <ProjectArt project={project} />
      <div className={styles.projectBody}>
        <div className={styles.projectMeta}><span>{String(index + 1).padStart(2, '0')} / {project.category}</span><span>{project.period}</span></div>
        <Heading className={styles.projectHeading} lang={project.translationMissing?.includes('title') ? 'ko' : undefined}>{project.title}</Heading>
        <p className={styles.projectDescription} lang={project.translationMissing?.includes('description') ? 'ko' : undefined}>{project.description}</p>
        {project.translationPending && <p className={styles.translationNote}>{card.translationPending}</p>}
        <dl className={styles.contribution}>
          <div><dt>{card.role}</dt><dd>{project.role}</dd></div>
          <div><dt>{card.contribution}</dt><dd>{project.highlight}</dd></div>
        </dl>
        {project.tags.length > 0 && <ul className={styles.tags} aria-label={label(card.technologies)}>{project.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}
        {(project.href || canPreview || project.github || project.youtube) && <div className={styles.projectActions}>
          {project.href && <a className={styles.caseLink} href={project.href} target="_blank" rel="noopener noreferrer" hrefLang={locale === 'en' ? 'ko' : undefined} aria-label={label(card.caseStudyLabel)}>{card.caseStudy}<Arrow diagonal /></a>}
          {canPreview && <button className={styles.caseLink} type="button" onClick={() => onPreview(project)} aria-label={label(card.previewLabel)}>{card.preview}<Arrow /></button>}
          {(project.github || project.youtube) && <div className={styles.projectLinks}>
            {project.github && <a href={project.github} target="_blank" rel="noopener noreferrer" aria-label={label(card.githubLabel)}>GitHub<Arrow diagonal /></a>}
            {project.youtube && <a href={project.youtube} target="_blank" rel="noopener noreferrer" aria-label={label(card.youtubeLabel)}>YouTube<Arrow diagonal /></a>}
          </div>}
        </div>}
      </div>
    </article>
  )
}
