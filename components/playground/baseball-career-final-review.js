import { useEffect, useId, useRef, useState } from 'react'
import { getBaseballTeam } from '@/lib/playground-baseball-teams.mjs'
import { summarizeBaseballAnnualTotals } from '@/lib/playground-baseball-annual.mjs'
import styles from '@/styles/playground-baseball-career-final-review.module.css'

const copy = {
  ko: {
    title: '10년차 통산 결산', year: year => `${year}년차`, totals: '10시즌 통산 성적', seasons: '시즌별 성적',
    timeline: '커리어 이정표', firstGame: '첫 출전', firstHit: '첫 안타', firstHomeRun: '첫 홈런',
    mostHits: '최다 안타 시즌', mostExtra: '최다 장타 시즌', bestAverage: '최고 타율 시즌', atBats: '타수',
    choose: '10년의 기록을 어떻게 마무리할까요?',
    saveActive: '현역으로 결산 저장', defer: '결정 보류 · 기록 먼저 보기', pickRetirement: '은퇴 선택',
    confirm: '은퇴를 확정할까요?', confirmText: '은퇴 상태와 10년차 성적을 함께 저장합니다. 통산과 시즌별 성적은 이후에도 열 수 있습니다.',
    confirmRetirement: '은퇴 확인 및 결산 저장', cancel: '선택으로 돌아가기',
    pending: { active: '현역 결산을 확인 중입니다.', retired: '은퇴 결산을 확인 중입니다.' },
    retry: { active: '현역 결산 다시 확인', retired: '은퇴 결산 다시 확인' },
    failed: '저장 결과를 확인하지 못했습니다. 같은 선택으로 다시 확인할 수 있습니다.',
    saved: { active: '현역 · 10년차 결산 저장 완료', retired: '은퇴 · 10년차 결산 저장 완료', legacy: '10년차 결산 저장 완료' },
    ceremony: '마지막 인사', farewell: (games, hits) => `${games}경기 동안 쌓은 ${hits}안타. 오랜 시즌을 함께해 고마웠습니다.`,
    replay: '은퇴 장면 다시 보기', records: '통산·시즌별 기록 보기', season: '시즌',
  },
  en: {
    title: 'Year 10 career review', year: year => `Year ${year}`, totals: 'Ten-season career totals', seasons: 'Season-by-season statistics',
    timeline: 'Career milestones', firstGame: 'Debut', firstHit: 'First hit', firstHomeRun: 'First home run',
    mostHits: 'Most hits in a season', mostExtra: 'Most extra-base hits in a season', bestAverage: 'Highest batting average', atBats: 'AB',
    choose: 'How would you like to close out these ten seasons?',
    saveActive: 'Save review as an active player', defer: 'Decide later and view records', pickRetirement: 'Choose retirement',
    confirm: 'Confirm retirement?', confirmText: 'Retirement will be saved with your Year 10 results. Your career and season records will remain available.',
    confirmRetirement: 'Confirm retirement and save review', cancel: 'Back to your choices',
    pending: { active: 'Checking your active-player review.', retired: 'Checking your retirement review.' },
    retry: { active: 'Check active-player review again', retired: 'Check retirement review again' },
    failed: 'The save was not confirmed. You can retry with the same choice.',
    saved: { active: 'Active player · Year 10 review saved', retired: 'Retired · Year 10 review saved', legacy: 'Year 10 review saved' },
    ceremony: 'A final farewell', farewell: (games, hits) => `${hits} hits across ${games} games. Thank you for all those seasons.`,
    replay: 'Replay the farewell', records: 'View career and season records', season: 'Season',
  },
}

const metrics = ['G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'BB', 'SO', 'AVG', 'SLG']
const rate = value => value.toFixed(3).replace(/^0/, '')
const compareAverage = (a, b) => a.H * b.AB - b.H * a.AB

function bestSeasons(rows, measure) {
  const best = Math.max(...rows.map(row => measure(row.stats)))
  return best > 0 ? rows.filter(row => measure(row.stats) === best) : []
}

function bestAverageSeasons(rows) {
  const comparable = rows.filter(row => row.stats.AB > 0)
  const best = comparable.reduce((winner, row) => (
    !winner || compareAverage(row.stats, winner.stats) > 0 ? row : winner
  ), null)
  return best ? comparable.filter(row => compareAverage(row.stats, best.stats) === 0) : []
}

function CareerHighlights({ rows, labels, number }) {
  const firstYear = key => rows.find(row => row.stats[key] > 0)?.seasonNumber
  const years = rows => rows.map(row => labels.year(row.seasonNumber)).join(' · ')
  const extra = stats => stats['2B'] + stats['3B'] + stats.HR
  const mostHits = bestSeasons(rows, stats => stats.H)
  const mostExtra = bestSeasons(rows, extra)
  const averages = bestAverageSeasons(rows)
  const entries = [
    ...[['G', labels.firstGame], ['H', labels.firstHit], ['HR', labels.firstHomeRun]].map(([key, label]) => {
      const year = firstYear(key)
      return [label, year && labels.year(year)]
    }),
    [labels.mostHits, mostHits.length > 0 && `${number(mostHits[0].stats.H)} · ${years(mostHits)}`],
    [labels.mostExtra, mostExtra.length > 0 && `${number(extra(mostExtra[0].stats))} · ${years(mostExtra)}`],
    [labels.bestAverage, averages.length > 0 && averages.map(row => (
      `${labels.year(row.seasonNumber)} ${rate(row.stats.H / row.stats.AB)} (${number(row.stats.AB)} ${labels.atBats})`
    )).join(' · ')],
  ].filter(([, value]) => value)
  return <>
    <h3>{labels.timeline}</h3>
    <dl className={styles.milestones}>{entries.map(([label, value]) => (
      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
    ))}</dl>
  </>
}

export default function BaseballCareerFinalReview({
  locale, profile, rows, saved, finish, pendingFinish, saving, failed, disabled, onSettle, onRecords,
}) {
  const id = useId()
  const [confirming, setConfirming] = useState(false)
  const [replay, setReplay] = useState(0)
  const confirmation = useRef(null)
  const retirementButton = useRef(null)
  const labels = copy[locale] || copy.ko
  const number = new Intl.NumberFormat(locale === 'en' ? 'en' : 'ko').format
  const totals = summarizeBaseballAnnualTotals(rows)
  const stat = (result, key) => key in result.rates ? rate(result.rates[key]) : number(result.stats[key])
  const club = getBaseballTeam(profile.teamId)
  const status = saved ? finish || 'legacy' : pendingFinish ? 'pending' : confirming ? 'confirm' : 'choice'

  useEffect(() => {
    if (confirming && !saved && !pendingFinish) confirmation.current?.focus()
  }, [confirming, pendingFinish, saved])

  return <section className={styles.review} aria-labelledby={id} data-career-final-review={status}>
    <h2 id={id}>{labels.title}</h2>
    {saved && <p className={styles.status} role="status">{labels.saved[finish || 'legacy']}</p>}
    {finish === 'retired' && saved && <div className={styles.farewell}>
      <div key={replay} className={styles.farewellContent}>
        <h3>{labels.ceremony}</h3>
        <p className={styles.player}>{profile.name} · #{profile.jerseyNumber} · {club.name}</p>
        <p>{labels.farewell(number(totals.stats.G), number(totals.stats.H))}</p>
      </div>
      <button type="button" onClick={() => setReplay(value => value + 1)}>{labels.replay}</button>
    </div>}
    <div aria-label={labels.totals}>
      <h3>{labels.totals}</h3>
      <dl className={styles.totals}>{metrics.map(key => <div key={key}><dt>{key}</dt><dd>{stat(totals, key)}</dd></div>)}</dl>
    </div>
    <CareerHighlights rows={rows} labels={labels} number={number} />
    <details className={styles.breakdown}>
      <summary>{labels.seasons}</summary>
      <div className={styles.tableWrap}>
        <table><thead><tr><th scope="col">{labels.season}</th>{metrics.map(key => <th key={key} scope="col">{key}</th>)}</tr></thead>
          <tbody>{rows.map(row => {
            const result = summarizeBaseballAnnualTotals([], row.stats)
            return <tr key={row.seasonNumber}><th scope="row">{labels.year(row.seasonNumber)}</th>
              {metrics.map(key => <td key={key}>{stat(result, key)}</td>)}</tr>
          })}</tbody>
        </table>
      </div>
    </details>
    {saved ? <div className={styles.actions}><button className={styles.primary} type="button" onClick={onRecords}>{labels.records}</button></div>
      : <section className={styles.decision}>
        {pendingFinish ? <>
          <p>{labels.pending[pendingFinish]}</p>
          {failed && <p role="alert">{labels.failed}</p>}
          <div className={styles.actions}>
            <button className={styles.primary} type="button" disabled={disabled} onClick={() => onSettle(pendingFinish)}>{labels.retry[pendingFinish]}</button>
            <button type="button" onClick={onRecords}>{labels.records}</button>
          </div>
        </> : confirming ? <>
          <h3 ref={confirmation} tabIndex={-1}>{labels.confirm}</h3>
          <p>{labels.confirmText}</p>
          <div className={styles.actions}>
            <button className={styles.primary} type="button" disabled={disabled} onClick={() => onSettle('retired')}>{labels.confirmRetirement}</button>
            <button type="button" disabled={disabled} onClick={() => {
              setConfirming(false)
              requestAnimationFrame(() => retirementButton.current?.focus())
            }}>{labels.cancel}</button>
          </div>
        </> : <>
          <h3>{labels.choose}</h3>
          {failed && <p role="alert">{labels.failed}</p>}
          <div className={styles.actions}>
            <button className={styles.primary} type="button" disabled={disabled} onClick={() => onSettle('active')}>{labels.saveActive}</button>
            <button type="button" disabled={disabled} onClick={onRecords}>{labels.defer}</button>
            <button ref={retirementButton} type="button" disabled={disabled} onClick={() => setConfirming(true)}>{labels.pickRetirement}</button>
          </div>
        </>}
        {saving && <progress className={styles.saving} aria-label={labels.pending[pendingFinish] || labels.title} />}
      </section>}
  </section>
}
