import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { selectFeaturedProjects } from '@/lib/portfolio-preview.mjs'
import ProjectArt from '@/components/preview/project-art'
import PortfolioShell from './portfolio-shell'
import ProjectCard from './project-card'
import Arrow from './arrow'
import styles from '@/styles/portfolio-preview.module.css'

function CaseDialog({ project, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (project && !dialog.open) dialog.showModal()
    else if (!project && dialog.open) dialog.close()
  }, [project])

  return (
    <dialog ref={ref} className={styles.caseDialog} aria-labelledby="preview-case-title" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
      {project && <div className={styles.dialogContent}>
        <div className={styles.dialogTop}><span>PROJECT PREVIEW</span><button type="button" onClick={() => ref.current.close()} aria-label="사례 미리보기 닫기">닫기 <span aria-hidden="true">×</span></button></div>
        <ProjectArt project={project} />
        <div className={styles.dialogCopy}>
          <p className={styles.eyebrow}>{project.category} · {project.period}</p>
          <h2 id="preview-case-title">{project.title}</h2>
          <p>{project.description}</p>
          <dl className={styles.contribution}><div><dt>내 역할</dt><dd>{project.role}</dd></div><div><dt>핵심 기여</dt><dd>{project.highlight}</dd></div></dl>
          <p className={styles.dialogNotice}>소개 내용과 카드 구성을 확인하는 예시입니다. 실제 상세 문서와 서비스 화면은 공개 준비 후 연결합니다.</p>
        </div>
      </div>}
    </dialog>
  )
}

export default function PortfolioHome({ projects = [], source, preview = false }) {
  const [selected, setSelected] = useState(null)
  const examples = preview && source === 'example'
  const visibleProjects = source === 'example' && !preview ? [] : projects
  const featured = selectFeaturedProjects(visibleProjects, source)

  return (
    <PortfolioShell
      title={preview ? '포트폴리오 디자인 미리보기 | 최지훈' : undefined}
      description={preview ? '업무 흐름을 지도와 웹 화면으로 연결하는 개발자 최지훈의 포트폴리오 디자인 예시입니다.' : undefined}
      preview={preview}
      examples={examples}
      mainId={preview ? 'preview-main' : 'portfolio-main'}
    >
      <section className={`${styles.hero} ${styles.container}`} id="intro" aria-labelledby="intro-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.heroLine} />INTERFACE. WORKFLOW. CONNECTION.</p>
          <h1 id="intro-title">복잡한 업무를,<br /><span>명확한 웹 경험으로.</span></h1>
          <p className={styles.heroIntro}>안녕하세요, 웹 개발자 <strong>최지훈</strong>입니다.</p>
          <p className={styles.heroDescription}>교통약자 이동지원 이용자 앱부터 관제 웹까지.<br className={styles.desktopBreak} /> 업무 흐름을 이해하고 화면과 API를 연결합니다.</p>
          <div className={styles.heroActions}><a href="#work" className={styles.primaryButton}>대표 프로젝트 보기<Arrow /></a><a href="#contact" className={styles.textButton}>함께 이야기하기<Arrow diagonal /></a></div>
          <div className={styles.heroExpertise}><span>서비스 프론트엔드</span><span>지도·관제 UI</span><span>웹 애플리케이션 연동</span></div>
        </div>
        <div className={styles.heroVisual} aria-label="사용자 화면과 업무 시스템을 연결하는 개발 경험">
          <div className={styles.visualTop}><span>FROM SCREEN TO WORKFLOW</span><span className={styles.visualIndex}>01 — 03</span></div>
          <div className={styles.visualHeading}>화면을 넘어,<br /><em>일의 흐름까지.</em></div>
          <div className={styles.workflow}>
            <div><span className={styles.flowNumber}>01</span><div><strong>사용자의 화면</strong><span>모바일 · WebView</span></div><span className={styles.flowIcon} aria-hidden="true">↗</span></div>
            <div><span className={styles.flowNumber}>02</span><div><strong>운영자의 업무</strong><span>지도 · 관제 · 관리</span></div><span className={styles.flowIcon} aria-hidden="true">↗</span></div>
            <div><span className={styles.flowNumber}>03</span><div><strong>시스템의 연결</strong><span>웹 API · 외부 연동</span></div><span className={styles.flowIcon} aria-hidden="true">↗</span></div>
          </div>
          <div className={styles.visualBottom}><span className={styles.smallCross} aria-hidden="true">＋</span><span>사용자와 업무 사이의 연결을 만듭니다.</span></div>
        </div>
      </section>

      <section className={`${styles.workSection} ${styles.container}`} id="work" aria-labelledby="work-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>SELECTED WORK</p><h2 id="work-title">프로젝트에 담긴<br className={styles.mobileBreak} /> <span>문제와 해결의 과정.</span></h2></div><p>서로 다른 사용자와 업무,<br />그리고 제가 맡은 역할을 담았습니다.</p></div>
        {examples && <p className={styles.sampleNote}>화면 검토를 위한 예시 프로젝트입니다. 이미지는 실제 서비스 화면이 아닌 구성 스케치입니다.</p>}
        {featured.length > 0 ? <div className={styles.projectGrid}>{featured.map((project, index) => <ProjectCard key={project.id} project={project} index={index} featured={index === 0} onPreview={examples ? setSelected : undefined} />)}</div>
          : <div className={styles.emptyState}><h3>아직 표시할 프로젝트가 없습니다.</h3><p>프로젝트 소개가 준비되면 이곳에서 확인할 수 있습니다.</p></div>}
        <div className={styles.workFooter}><p>프로젝트마다 다른 제약과 선택의 이유가 있습니다.</p><Link href="/projects" className={styles.textButton}>전체 프로젝트 보기<Arrow diagonal /></Link></div>
      </section>

      <section className={`${styles.approachSection} ${styles.container}`} id="approach" aria-labelledby="approach-title">
        <div><p className={styles.eyebrow}>WHAT I CONNECT</p><h2 id="approach-title">사용자와 업무를<br />함께 이해하는 개발.</h2></div>
        <div className={styles.approachList}>
          <div><span>01</span><div><h3>사용자가 다음 행동을 알 수 있도록</h3><p>가입, 승인, 위치 선택과 접수. 여러 단계를 하나의 자연스러운 화면 흐름으로 연결합니다.</p></div></div>
          <div><span>02</span><div><h3>복잡한 정보를 읽을 수 있도록</h3><p>지도 위의 수요와 차량, 여러 업무 상태를 목적에 맞게 표현하고 조작할 수 있게 만듭니다.</p></div></div>
          <div><span>03</span><div><h3>화면과 시스템이 같은 뜻을 갖도록</h3><p>API 응답과 화면 상태를 연결하며, 성공과 실패 사이의 예외 상황도 함께 다룹니다.</p></div></div>
        </div>
      </section>

      <section className={`${styles.contactPanel} ${styles.container}`} id="contact" aria-labelledby="contact-title">
        <div><p className={styles.eyebrow}>LET&apos;S TALK</p><h2 id="contact-title">다음 문제를<br />함께 풀어가요.</h2><p className={styles.contactDescription}>채용과 협업, 프로젝트에 관한 이야기를 기다립니다.<br />편한 방법으로 연락해 주세요.</p></div>
        <div className={styles.contactLinks}>
          <a href="https://open.kakao.com/o/srGJzeff" target="_blank" rel="noopener noreferrer"><span><small>CONTACT</small>카카오 오픈채팅으로 연락하기</span><Arrow diagonal /></a>
          <a href="https://github.com/choichoi123/nextport" target="_blank" rel="noopener noreferrer"><span><small>SOURCE</small>포트폴리오 GitHub 보기</span><Arrow diagonal /></a>
        </div>
      </section>
      {examples && <CaseDialog project={selected} onClose={() => setSelected(null)} />}
    </PortfolioShell>
  )
}
