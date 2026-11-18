import { normalizeSprintWorldRecord } from '@/lib/playground-sprint-registration.mjs'
import styles from '@/styles/playground-sprint-world-record.module.css'

const copy = {
  ko: {
    first: '첫 역대 최고 기록 수립', broken: '역대 최고 기록 갱신', tied: '역대 최고 기록과 동률',
    verified: '서버 등록 확정 · 100m', previous: '이전 역대 최고', improvement: '단축',
    firstNote: '이 순위표의 첫 기준 기록을 세웠습니다.', tiedNote: '최고 기록과 같은 시간입니다. 먼저 등록한 기록이 앞섭니다.',
  },
  en: {
    first: 'First all-time record set', broken: 'A new all-time record', tied: 'All-time record equalled',
    verified: 'Server confirmed · 100m', previous: 'Previous all-time best', improvement: 'Faster by',
    firstNote: 'You set the first benchmark for this leaderboard.', tiedNote: 'You matched the best time. Earlier registrations take precedence.',
  },
}

const glyphs = {
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
}

function PixelTitle({ value }) {
  let path = ''
  let offset = 0
  for (const character of value) {
    const rows = glyphs[character]
    if (!rows) { offset += 4; continue }
    rows.forEach((row, y) => [...row].forEach((cell, x) => {
      if (cell === '1') path += `M${offset + x} ${y}h1v1h-1z`
    }))
    offset += 6
  }
  return <svg className={styles.pixelTitle} viewBox={`0 0 ${offset - 1} 7`} fill="currentColor" shapeRendering="crispEdges" aria-hidden="true" focusable="false"><path d={path} /></svg>
}

function seconds(timeCs) {
  return (timeCs / 100).toFixed(2)
}

/** Only confirmed server outcomes can create a record announcement. */
export default function SprintWorldRecord({ worldRecord, visualStyle = 'realistic', locale = 'ko', compact = false, animate = false }) {
  let record
  try { record = normalizeSprintWorldRecord(worldRecord, { registrationStatus: 'registered', timeCs: worldRecord?.timeCs }) }
  catch { return null }
  if (!record || record.status === 'unchanged') return null
  const text = copy[locale === 'en' ? 'en' : 'ko']
  const pixel = visualStyle === 'pixel'
  const tied = record.status === 'tied'
  if (compact || tied) return <p className={compact ? styles.badge : styles.tied} data-world-record={record.status} data-visual={pixel ? 'pixel' : 'realistic'} {...(!compact ? { role: 'status' } : {})}>
    <span>{text[record.status]}</span><strong>{seconds(record.timeCs)}s</strong>
    {!compact && <small>{text.tiedNote}</small>}
  </p>

  const title = record.status === 'first' ? 'FIRST RECORD' : 'WORLD RECORD'
  return <section className={styles.celebration} data-world-record={record.status} data-visual={pixel ? 'pixel' : 'realistic'} data-animate={animate} role="status" aria-live="polite" aria-atomic="true">
    <div className={styles.lights} aria-hidden="true" />
    <div className={styles.sparks} aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--spark-index': index, '--spark-row': index % 4 }} />)}</div>
    <div className={styles.content}>
      <p className={styles.verified}>{text.verified}</p>
      <div className={styles.medal} aria-hidden="true"><span>1</span></div>
      <h3 className={styles.title}>{pixel ? <><span className={styles.srOnly}>{title}</span><PixelTitle value={title} /></> : title}</h3>
      <p className={styles.subtitle}>{text[record.status]}</p>
      <p className={styles.time}><strong>{seconds(record.timeCs)}</strong><span>s</span></p>
      {record.status === 'broken' ? <dl className={styles.comparison}><div><dt>{text.previous}</dt><dd>{seconds(record.previousTimeCs)}s</dd></div><div><dt>{text.improvement}</dt><dd>−{seconds(record.improvementCs)}s</dd></div></dl> : <p className={styles.firstNote}>{text.firstNote}</p>}
    </div>
  </section>
}
