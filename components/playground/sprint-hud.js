import { formatSprintTime } from '@/lib/playground-sprint.mjs'
import styles from '@/styles/playground-sprint-hud.module.css'

const glyphs = {
  0: ['01110', '11011', '11011', '11011', '11011', '11011', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '11011', '00011', '00110', '01100', '11000', '11111'],
  3: ['11110', '00011', '00011', '01110', '00011', '00011', '11110'],
  4: ['00011', '00111', '01111', '11011', '11111', '00011', '00011'],
  5: ['11111', '11000', '11000', '11110', '00011', '00011', '11110'],
  6: ['01110', '11000', '11000', '11110', '11011', '11011', '01110'],
  7: ['11111', '00011', '00011', '00110', '01100', '01100', '01100'],
  8: ['01110', '11011', '11011', '01110', '11011', '11011', '01110'],
  9: ['01110', '11011', '11011', '01111', '00011', '00011', '01110'],
  '.': ['0', '0', '0', '0', '0', '1', '1'],
  F: ['11111', '11000', '11000', '11110', '11000', '11000', '11000'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  N: ['11001', '11001', '11101', '11111', '11011', '11011', '11001'],
  S: ['01111', '11000', '11000', '01110', '00011', '00011', '11110'],
  H: ['11011', '11011', '11011', '11111', '11011', '11011', '11011'],
}

const copy = {
  ko: {
    time: '경과 시간', distance: '달린 거리', player: '선수 01', next: '다음 발', left: '← 왼발', right: '오른발 →',
    alternate: '← → 번갈아 달리기', refocus: '경기장을 선택해 조작', replay: '리플레이',
    touchLeft: '왼발 탭', touchRight: '오른발 탭', touchAlternate: '왼발·오른발 번갈아 탭', touchRefocus: '화면 버튼으로 조작',
    statuses: { idle: '준비', countdown: '출발 대기', running: '달리는 중', finished: '100m 완주', interrupted: '경기 중단' },
    kinds: { first: '첫 기록', best: '개인 기록 갱신', finish: '완주', demo: '시연 기록' }, improvement: '이전 최고 기록보다', faster: '더 빠르게',
    competition: { label: '가상 경쟁', current: '현재', final: '최종', leading: '선두', gap: '선두와', ready: '가상 선수', start: '명과 출발', separate: '이번 가상 경기 순위이며 온라인 TOP10 순위와 다릅니다.' },
  },
  en: {
    time: 'Elapsed time', distance: 'Distance', player: 'Runner 01', next: 'Next step', left: '← Left foot', right: 'Right foot →',
    alternate: 'Alternate ← and →', refocus: 'Select the track to control', replay: 'Replay',
    touchLeft: 'Tap left foot', touchRight: 'Tap right foot', touchAlternate: 'Alternate left and right taps', touchRefocus: 'Use the on-screen buttons',
    statuses: { idle: 'Ready', countdown: 'On your marks', running: 'Running', finished: '100m complete', interrupted: 'Run stopped' },
    kinds: { first: 'First finish', best: 'Personal best', finish: 'Finished', demo: 'Demo run' }, improvement: 'Previous best improved by', faster: 'faster',
    competition: { label: 'Virtual race', current: 'Position', final: 'Final', leading: 'Leading', gap: 'Behind leader', ready: 'Starting with', start: 'virtual runners', separate: 'This position belongs to the virtual race, separately from the online TOP10.' },
  },
}

function PixelType({ value, className }) {
  let offset = 0
  let path = ''
  for (const character of String(value)) {
    const rows = glyphs[character]
    if (!rows) continue
    for (let y = 0; y < rows.length; y += 1) {
      for (let x = 0; x < rows[y].length; x += 1) {
        if (rows[y][x] === '1') path += `M${offset + x} ${y}h1v1h-1z`
      }
    }
    offset += rows[0].length + (character === '.' ? 2 : 1)
  }
  const width = Math.max(1, offset - 1)
  return (
    <svg className={className} viewBox={`0 0 ${width} 7`} width={`${width / 7}em`} height="1em" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  )
}

function Measure({ pixel, value, unit, testId, className }) {
  return (
    <span className={className} data-testid={testId} data-value={`${value}${unit}`} aria-label={`${value}${unit}`}>
      {pixel ? <><span className={styles.srOnly}>{value}</span><PixelType value={value} /></> : value}
      <span className={styles.unit}>{unit}</span>
    </span>
  )
}

function TimerMark() {
  return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.2" /><path d="M8 1.5h4m-2 0v3m0 3v4l2.5 1.5M15 5l1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
}

function validCompetition(competition) {
  return competition && Number.isInteger(competition.total) && competition.total > 1
    && Number.isInteger(competition.position) && competition.position >= 1 && competition.position <= competition.total
}

export default function SprintHUD({ race, art, locale = 'ko', playerName, playerCountryLabel, replayMode = false, nextFoot, focused = false, inputMode = 'keyboard', competition = null }) {
  const text = copy[locale === 'en' ? 'en' : 'ko']
  const pixel = art === 'pixel'
  const distance = Number.isFinite(race.distance) ? Math.max(0, Math.min(100, race.distance)) : 0
  const status = replayMode ? text.replay : text.statuses[race.status] || text.statuses.idle
  const elapsed = race.status === 'finished' ? race.finishTimeMs ?? race.elapsedMs : race.elapsedMs
  const pointerControls = inputMode === 'pointer'
  const next = pointerControls
    ? nextFoot === 'left' ? text.touchLeft : nextFoot === 'right' ? text.touchRight : text.touchAlternate
    : nextFoot === 'left' ? text.left : nextFoot === 'right' ? text.right : text.alternate
  const refocus = pointerControls ? text.touchRefocus : text.refocus
  const name = Array.from(playerName || text.player).slice(0, 16).join('')
  const showCompetition = validCompetition(competition)
  const waiting = race.status === 'idle' || race.status === 'countdown' || !(race.elapsedMs > 0)
  const finished = race.status === 'finished'
  const rank = showCompetition ? `${competition.position}/${competition.total}${locale === 'en' ? '' : '위'}` : ''
  const gap = showCompetition && Number.isFinite(competition.leaderGapMeters) ? Math.max(0, competition.leaderGapMeters).toFixed(1) : null

  return (
    <div className={`${styles.hud} ${pixel ? styles.pixel : styles.realistic}`} data-art={pixel ? 'pixel' : 'realistic'}>
      <div className={styles.topRow}>
        <div className={`${styles.panel} ${styles.clockPanel}`}>
          <div className={styles.panelHeading}><span className={styles.metricLabel}>{!pixel && <TimerMark />}{text.time}</span><span className={styles.raceType}>100M</span></div>
          <Measure pixel={pixel} value={formatSprintTime(elapsed)} unit="s" testId="sprint-time" className={styles.time} />
        </div>
        <div className={`${styles.panel} ${styles.distancePanel}`}>
          <div className={styles.panelHeading}><span className={styles.metricLabel}>{text.distance}</span><span className={styles.trackLength}>/ 100m</span></div>
          <Measure pixel={pixel} value={distance.toFixed(1)} unit="m" testId="sprint-distance" className={styles.distance} />
          <div className={styles.progress} aria-hidden="true"><span style={{ width: `${distance}%` }} /></div>
        </div>
      </div>
      <div className={styles.metaRow}>
        <div className={styles.player}><span className={styles.playerNumber} aria-hidden="true">01</span><strong>{name}</strong>{playerCountryLabel && <span className={styles.country}>{playerCountryLabel}</span>}</div>
        <div className={styles.state}><span className={styles.stateDot} data-active={race.status === 'running'} /><span>{status}</span>{race.status === 'running' && !replayMode && <span className={styles.stepHint}>{focused ? `${text.next} · ${next}` : refocus}</span>}</div>
      </div>
      {showCompetition && <div className={styles.competitionRow} data-testid="sprint-competition" title={text.competition.separate}>
        <div className={styles.competitionPanel}>
          {waiting ? <span>{locale === 'en' ? `${text.competition.ready} ${competition.total - 1} ${text.competition.start}` : `${text.competition.ready} ${competition.total - 1}${text.competition.start}`}</span> : <>
            <span>{text.competition.label} · {finished ? text.competition.final : text.competition.current}</span><strong>{rank}</strong>
            {!finished && <span className={styles.competitionGap}>{competition.position === 1 ? text.competition.leading : gap !== null ? `${text.competition.gap} ${gap}m` : null}</span>}
          </>}
        </div>
      </div>}
    </div>
  )
}

function Laurel() {
  return <svg className={styles.laurel} viewBox="0 0 120 76" fill="none" aria-hidden="true"><path d="M45 64C18 55 17 25 35 11M75 64c27-9 28-39 10-53" stroke="currentColor" strokeWidth="1.2" /><path d="M30 48c-11 0-12-7-12-7 8-1 12 7 12 7Zm-4-12c-10-3-9-10-9-10 8 2 9 10 9 10Zm2-12c-8-6-5-12-5-12 7 4 5 12 5 12Zm9 32c-2-9 4-12 4-12 4 7-4 12-4 12Zm-9-12c1-9 7-10 7-10 2 8-7 10-7 10Zm0-14c4-8 10-7 10-7-1 8-10 7-10 7Zm62 18c11 0 12-7 12-7-8-1-12 7-12 7Zm4-12c10-3 9-10 9-10-8 2-9 10-9 10Zm-2-12c8-6 5-12 5-12-7 4-5 12-5 12Zm-9 32c2-9-4-12-4-12-4 7 4 12 4 12Zm9-12c-1-9-7-10-7-10-2 8 7 10 7 10Zm0-14c-4-8-10-7-10-7 1 8 10 7 10 7Z" fill="currentColor" /><path d="m60 20 3.2 7.2 7.8.8-5.8 5.3 1.6 7.7-6.8-4-6.8 4 1.6-7.7-5.8-5.3 7.8-.8L60 20Z" fill="currentColor" /></svg>
}

export function SprintFinish({ art, locale = 'ko', kind = 'finish', timeMs, improvementMs, playerName, competition = null }) {
  const text = copy[locale === 'en' ? 'en' : 'ko']
  const pixel = art === 'pixel'
  const title = text.kinds[kind] || text.kinds.finish
  const name = Array.from(playerName || text.player).slice(0, 16).join('')

  return (
    <div className={`${styles.finish} ${pixel ? styles.pixel : styles.realistic}`} data-testid="sprint-finish" data-kind={kind}>
      {pixel ? <div className={styles.chequered} aria-hidden="true" /> : <Laurel />}
      <p className={styles.finishWord}>{pixel ? <><span className={styles.srOnly}>FINISH</span><PixelType value="FINISH" /></> : 'FINISH'}</p>
      <p className={styles.finishKind}>{title}</p>
      <Measure pixel={pixel} value={formatSprintTime(timeMs)} unit="s" className={styles.finishTime} />
      <p className={styles.finisher}>{name}<span>100m</span></p>
      {validCompetition(competition) && <p className={styles.finishCompetition} data-testid="sprint-competition-result" title={text.competition.separate}><span>{text.competition.label} · {text.competition.final}</span><strong>{competition.position}/{competition.total}{locale === 'en' ? '' : '위'}</strong><span className={styles.srOnly}>{text.competition.separate}</span></p>}
      {kind === 'best' && Number.isFinite(improvementMs) && improvementMs > 0 && <p className={styles.improvement}>{text.improvement}<strong>−{formatSprintTime(improvementMs)}s</strong>{locale !== 'en' && <span>{text.faster}</span>}</p>}
    </div>
  )
}
