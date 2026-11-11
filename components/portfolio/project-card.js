import ProjectArt from '@/components/preview/project-art'
import Arrow from './arrow'
import styles from '@/styles/portfolio-preview.module.css'

export default function ProjectCard({ project, index = 0, featured = false, onPreview, headingLevel = 'h3' }) {
  const Heading = headingLevel === 'h2' ? 'h2' : 'h3'
  const canPreview = !project.href && typeof onPreview === 'function'

  return (
    <article className={`${styles.projectCard} ${featured ? styles.featuredCard : ''}`}>
      <ProjectArt project={project} />
      <div className={styles.projectBody}>
        <div className={styles.projectMeta}><span>{String(index + 1).padStart(2, '0')} / {project.category}</span><span>{project.period}</span></div>
        <Heading className={styles.projectHeading}>{project.title}</Heading>
        <p className={styles.projectDescription}>{project.description}</p>
        <dl className={styles.contribution}>
          <div><dt>내 역할</dt><dd>{project.role}</dd></div>
          <div><dt>핵심 기여</dt><dd>{project.highlight}</dd></div>
        </dl>
        {project.tags.length > 0 && <ul className={styles.tags} aria-label={`${project.title} 사용 기술`}>{project.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}
        {(project.href || canPreview || project.github || project.youtube) && <div className={styles.projectActions}>
          {project.href && <a className={styles.caseLink} href={project.href} target="_blank" rel="noopener noreferrer" aria-label={`${project.title} 상세 사례 읽기 (새 탭)`}>상세 사례 읽기<Arrow diagonal /></a>}
          {canPreview && <button className={styles.caseLink} type="button" onClick={() => onPreview(project)} aria-label={`${project.title} 사례 미리보기`}>사례 미리보기<Arrow /></button>}
          {(project.github || project.youtube) && <div className={styles.projectLinks}>
            {project.github && <a href={project.github} target="_blank" rel="noopener noreferrer" aria-label={`${project.title} GitHub 저장소 (새 탭)`}>GitHub<Arrow diagonal /></a>}
            {project.youtube && <a href={project.youtube} target="_blank" rel="noopener noreferrer" aria-label={`${project.title} YouTube 영상 (새 탭)`}>YouTube<Arrow diagonal /></a>}
          </div>}
        </div>}
      </div>
    </article>
  )
}
