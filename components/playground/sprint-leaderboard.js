import { useEffect, useId, useRef } from 'react'
import styles from '@/styles/playground-sprint-leaderboard.module.css'

const copy = {
  ko: {
    title: '100m TOP10', close: '닫기', refresh: '새로고침', loading: '온라인 순위를 불러오고 있습니다…',
    disconnected: '온라인 순위 DB가 연결되지 않았습니다.', unavailable: '온라인 기록 서비스를 일시적으로 사용할 수 없습니다.', error: '순위를 불러오지 못했습니다. 새로고침해 다시 확인해 주세요.',
    local: '로컬 플레이와 리플레이는 계속 이용할 수 있습니다. 온라인 시도를 발급받지 않은 경기는 등록할 수 없습니다.',
    empty: '아직 등록된 기록이 없습니다. 첫 TOP10 기록에 도전해 보세요.',
    rank: '순위', name: '이름 · 닉네임', country: '국적', time: '기록', date: '서버 등록일시', updated: '순위 갱신',
    policy: '이 브라우저의 최고 기록 1개 · 0.01초 기록이 같으면 먼저 등록한 기록 우선',
    dateNote: '날짜는 DB에서 확정한 등록일시를 현재 지역 시간으로 표시합니다. 로컬 완주 일시와 다릅니다.',
  },
  en: {
    title: '100m TOP10', close: 'Close', refresh: 'Refresh', loading: 'Loading online rankings…',
    disconnected: 'The online leaderboard database is not connected.', unavailable: 'Online records are temporarily unavailable.', error: 'Rankings could not be loaded. Refresh to try again.',
    local: 'Local play and replays remain available. Runs without an online attempt cannot be registered.',
    empty: 'No records have been registered yet. Try for the first TOP10 record.',
    rank: 'Rank', name: 'Name · nickname', country: 'Nationality', time: 'Time', date: 'Server registered at', updated: 'Last updated',
    policy: 'One best record for this browser · Equal hundredth-second times favor the earlier registration',
    dateNote: 'Dates are confirmed by the database and displayed in your local time. They differ from local finish dates.',
  },
}

function dateLabel(iso, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export default function SprintLeaderboard({ leaderboard, countries, locale = 'ko', art = 'realistic', onClose, onRefresh }) {
  const text = copy[locale === 'en' ? 'en' : 'ko']
  const id = useId()
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const loading = ['idle', 'loading'].includes(leaderboard.status)
  const ready = leaderboard.status === 'ready'
  useEffect(() => { closeRef.current?.focus() }, [])

  function refresh() {
    // Keep Escape and Tab inside the dialog when the active button is disabled.
    dialogRef.current?.focus({ preventScroll: true })
    void onRefresh()
  }

  function keyDown(event) {
    event.stopPropagation()
    if (event.nativeEvent?.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const elements = [...dialogRef.current.querySelectorAll('button:not([disabled]), [tabindex="0"]')].filter(element => element.offsetParent !== null)
    const first = elements[0]
    const last = elements.at(-1)
    if (!first) { event.preventDefault(); dialogRef.current?.focus(); return }
    if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus() }
  }

  return <div className={styles.backdrop} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={keyDown} onKeyUp={event => event.stopPropagation()}>
    <section ref={dialogRef} className={styles.dialog} data-art={art} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-policy`} tabIndex={-1} aria-busy={loading}>
      <header className={styles.header}><div><p className={styles.eyebrow}>ONLINE / 100M SPRINT</p><h2 id={`${id}-title`}>{text.title}</h2></div><button ref={closeRef} type="button" className={styles.close} aria-label={text.close} onClick={onClose}>×</button></header>
      <p className={styles.policy} id={`${id}-policy`}>{text.policy}</p>
      {loading && <p className={styles.message} role="status">{text.loading}</p>}
      {!loading && !ready && <div className={styles.message} role="status"><strong>{text[leaderboard.status === 'unavailable' ? leaderboard.code === 'not_configured' ? 'disconnected' : 'unavailable' : 'error']}</strong><p>{text.local}</p></div>}
      {ready && leaderboard.records.length === 0 && <p className={styles.message} role="status">{text.empty}</p>}
      {ready && leaderboard.records.length > 0 && <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">{text.rank}</th><th scope="col">{text.name}</th><th scope="col">{text.country}</th><th scope="col">{text.time}</th><th scope="col">{text.date}</th></tr></thead><tbody>{leaderboard.records.map(record => {
        const country = countries.find(item => item.code === record.countryCode)
        return <tr key={record.rank}><td className={styles.rank} data-label={text.rank}>{String(record.rank).padStart(2, '0')}</td><th scope="row" className={styles.name}>{record.playerName}</th><td className={styles.country} data-label={text.country}>{country ? `${country.flag} ${country.label}` : record.countryCode}</td><td className={styles.time} data-label={text.time}>{(record.timeCs / 100).toFixed(2)}s</td><td className={styles.date} data-label={text.date}><time dateTime={record.recordedAt}>{dateLabel(record.recordedAt, locale)}</time></td></tr>
      })}</tbody></table></div>}
      <footer className={styles.footer}><div><p>{text.dateNote}</p>{ready && leaderboard.updatedAt && <p>{text.updated} · <time dateTime={leaderboard.updatedAt}>{dateLabel(leaderboard.updatedAt, locale)}</time></p>}</div><button type="button" className={styles.refresh} onClick={refresh} disabled={loading}>↻ {text.refresh}</button></footer>
    </section>
  </div>
}
