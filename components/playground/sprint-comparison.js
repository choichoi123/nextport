import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useRef, useState } from 'react'
import SprintScene from './sprint-scene'
import {
  SPRINT_RULES, createSprintRace, startSprintRace, advanceSprintRace,
  applySprintStride, applySprintCheer, interruptSprintRace, formatSprintTime,
} from '@/lib/playground-sprint.mjs'
import styles from '@/styles/playground-sprint.module.css'

const variants = [
  { id: 'A', view: 'top', art: 'realistic' },
  { id: 'B', view: 'side', art: 'realistic' },
  { id: 'C', view: 'top', art: 'pixel' },
  { id: 'D', view: 'side', art: 'pixel' },
]
const copy = {
  ko: {
    back: '놀이터', controls: '기존 조작 테스트', heading: ['100m,', '너만의 리듬으로.'],
    intro: '시점은 다르게, 달리기는 똑같이. 두 발의 리듬으로 네 가지 경기장을 달려보세요.',
    lab: 'LOCAL PLAYTEST / 02', tag: 'SOLO · 100 METRES', all: '네 가지 함께',
    top: '탑뷰', side: '사이드뷰', realistic: '실사풍', pixel: '도트',
    time: '시간', distance: '달린 거리', speed: '속도', strides: '유효 발걸음',
    idle: '출발선에 섰습니다', countdown: '출발을 준비하세요', running: '리듬을 이어가세요',
    finished: '100m 완주!', interrupted: '달리기가 중단되었습니다',
    demo: '자동 시연', demoNotice: '시연 중 · 자동 교대 입력 · 개인 기록 제외',
    start: '출발하기', restart: '다시 달리기', reset: '초기화', stop: '달리기 중단',
    field: '100m 달리기 조작 영역', focus: '경기장 클릭 → ← → 번갈아 누르기',
    focused: '키보드 연결됨', unfocused: '경기장을 클릭해 키보드를 연결하세요',
    instruction: '← 왼발 · → 오른발 · Space 응원 · Esc 중단. 길게 누르기는 연타로 계산하지 않습니다.',
    left: '왼발', right: '오른발', cheer: '응원', next: '다음 발', either: '어느 발이든',
    hint: '한 발씩 번갈아 누를수록 가속합니다. 같은 발의 연속 입력은 추진력을 더하지 않습니다.',
    cheerHint: 'Space를 눌러 달리는 선수에게 응원을 보내세요.',
    comparison: '같은 경기, 네 가지 표현', comparisonHint: '한 화면을 크게 보거나, 네 가지를 나란히 비교하세요. 보기 변경은 경기 규칙에 영향을 주지 않습니다.',
    enlarge: '크게 보기', captionTop: '레인과 경기장의 전체 흐름', captionSide: '보폭과 결승선 통과의 순간',
    linked: '모든 화면이 같은 거리·시간·입력을 공유합니다.',
    result: 'FINISH / 100M', resultDemo: '자동 시연 완주', resultPlay: '당신의 완주 기록',
    best: '이번 방문 최고 기록', noBest: '첫 완주를 기다리고 있어요',
    resultNote: '현재는 로컬 플레이 테스트입니다. 온라인 순위와 기록 저장은 아직 연결하지 않았습니다.',
    interruptedHint: '영역 밖으로 이동하거나 다른 창·탭으로 전환하면 중단됩니다. 출발부터 다시 달릴 수 있습니다.',
    footer: '실사풍은 생성한 경기장 배경과 2D 선수, 도트는 픽셀 그래픽으로 구성한 시안입니다.',
    liveStart: '출발! 좌우 방향키를 번갈아 눌러 달리세요.', cheerMessage: '끝까지, 한 걸음 더!',
  },
  en: {
    back: 'Playground', controls: 'Original controls test', heading: ['100 metres.', 'Find your rhythm.'],
    intro: 'Different views. The same race. Find your stride across four stadium styles.',
    lab: 'LOCAL PLAYTEST / 02', tag: 'SOLO · 100 METRES', all: 'Compare all four',
    top: 'Top-down', side: 'Side view', realistic: 'Realistic', pixel: 'Pixel',
    time: 'Time', distance: 'Distance', speed: 'Speed', strides: 'Valid strides',
    idle: 'On the starting line', countdown: 'On your marks', running: 'Keep your rhythm',
    finished: '100m complete!', interrupted: 'Run interrupted',
    demo: 'Watch demo', demoNotice: 'Demo · automatic alternating strides · not a personal record',
    start: 'Start running', restart: 'Run again', reset: 'Reset', stop: 'Stop run',
    field: '100m sprint controls area', focus: 'Click the track → alternate ← and →',
    focused: 'Keyboard connected', unfocused: 'Click the track to connect your keyboard',
    instruction: '← Left foot · → Right foot · Space to cheer · Esc to stop. Holding a key does not count as repeated strides.',
    left: 'Left foot', right: 'Right foot', cheer: 'Cheer', next: 'Next foot', either: 'Either foot',
    hint: 'Alternate your feet to accelerate. Repeating the same foot adds no extra push.',
    cheerHint: 'Press Space to cheer on the runner.',
    comparison: 'One race. Four looks.', comparisonHint: 'Enlarge one view or compare all four. Changing the view keeps the same race rules.',
    enlarge: 'Enlarge', captionTop: 'A clear view of the lanes and stadium', captionSide: 'Every stride. Every finish.',
    linked: 'Every view shares the same distance, time and input.',
    result: 'FINISH / 100M', resultDemo: 'Demo completed', resultPlay: 'Your finish time',
    best: 'Best this visit', noBest: 'Your first finish is ahead',
    resultNote: 'This is a local playtest. Online rankings and record storage are not connected yet.',
    interruptedHint: 'Leaving the controls area or switching windows or tabs interrupts the run. Start again when ready.',
    footer: 'Realistic studies combine a generated stadium background with a 2D runner; pixel studies use pixel graphics.',
    liveStart: 'Go! Alternate the left and right arrow keys.', cheerMessage: 'One more stride. You’ve got this!',
  },
}

function inputCode(event) {
  if (event.code === 'ArrowLeft' || event.key === 'ArrowLeft') return 'left'
  if (event.code === 'ArrowRight' || event.key === 'ArrowRight') return 'right'
  if (event.code === 'Space' || event.key === ' ') return 'cheer'
  return null
}

export default function SprintComparison() {
  const locale = useRouter().locale === 'en' ? 'en' : 'ko'
  const text = copy[locale]
  const [race, setRace] = useState(createSprintRace)
  const [mode, setMode] = useState('all')
  const [focused, setFocused] = useState(false)
  const [pressed, setPressed] = useState([])
  const [isDemo, setIsDemo] = useState(false)
  const [bestTime, setBestTime] = useState(null)
  const [cheers, setCheers] = useState(0)
  const [cheering, setCheering] = useState(false)
  const areaRef = useRef(null)
  const raceRef = useRef(race)
  const keysRef = useRef(new Set())
  const pointersRef = useRef(new Map())
  const demoRef = useRef(false)
  const demoStepRef = useRef(0)
  const cheerTimerRef = useRef(null)
  const active = race.status === 'countdown' || race.status === 'running'

  const commit = useCallback(next => {
    raceRef.current = next
    setRace(next)
  }, [])
  const clearInputs = useCallback(() => {
    keysRef.current.clear()
    pointersRef.current.clear()
    setPressed([])
  }, [])
  const interrupt = useCallback(() => {
    clearInputs()
    commit(interruptSprintRace(raceRef.current, performance.now()))
  }, [clearInputs, commit])
  const focusArea = useCallback(() => {
    areaRef.current?.focus({ preventScroll: true })
    setFocused(document.activeElement === areaRef.current)
  }, [])

  useEffect(() => {
    if (!active) return
    let frame
    let lastPaint = 0
    const tick = now => {
      if (now - lastPaint >= 1000 / 30) {
        lastPaint = now
        let next = raceRef.current
        // Demonstration uses the same timestamped stride function as manual input.
        if (demoRef.current && next.startedAt !== null) {
          while (next.status !== 'finished' && next.startedAt + demoStepRef.current * 175 <= now) {
            const step = demoStepRef.current++
            next = applySprintStride(next, step % 2 ? 'right' : 'left', next.startedAt + step * 175)
          }
        }
        next = advanceSprintRace(next, now)
        commit(next)
        if (next.status === 'finished' || next.status === 'interrupted') return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, commit])

  useEffect(() => {
    if (race.status !== 'finished') return
    clearInputs()
    if (!isDemo) setBestTime(previous => previous === null ? race.finishTimeMs : Math.min(previous, race.finishTimeMs))
  }, [race.status, race.finishTimeMs, isDemo, clearInputs])

  useEffect(() => {
    const blur = () => { setFocused(false); interrupt() }
    const visibility = () => { if (document.hidden) blur() }
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', visibility)
      if (cheerTimerRef.current !== null) clearTimeout(cheerTimerRef.current)
    }
  }, [interrupt])

  function start(demo = false) {
    clearInputs()
    clearTimeout(cheerTimerRef.current)
    setCheering(false)
    demoRef.current = demo
    demoStepRef.current = 0
    setIsDemo(demo)
    commit(startSprintRace(performance.now()))
    focusArea()
  }

  function reset() {
    clearInputs()
    clearTimeout(cheerTimerRef.current)
    setCheering(false)
    setCheers(0)
    demoRef.current = false
    setIsDemo(false)
    commit(createSprintRace())
    focusArea()
  }

  function act(code) {
    if (code === 'cheer') {
      if (!demoRef.current) commit(applySprintCheer(raceRef.current, performance.now()))
      setCheers(value => value + 1)
      setCheering(true)
      clearTimeout(cheerTimerRef.current)
      cheerTimerRef.current = setTimeout(() => setCheering(false), 900)
    } else if (!demoRef.current) commit(applySprintStride(raceRef.current, code, performance.now()))
  }

  function keyDown(event) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent?.isComposing) return
    if (event.key === 'Tab') { setFocused(false); interrupt(); return }
    if (event.key === 'Escape') { event.preventDefault(); interrupt(); areaRef.current?.blur(); return }
    const code = inputCode(event)
    if (!code) return
    event.preventDefault()
    if (event.repeat || keysRef.current.has(code)) return
    keysRef.current.add(code)
    setPressed([...keysRef.current, ...pointersRef.current.values()])
    act(code)
  }

  function keyUp(event) {
    const code = inputCode(event)
    if (!code || !keysRef.current.has(code)) return
    event.preventDefault()
    keysRef.current.delete(code)
    setPressed([...keysRef.current, ...pointersRef.current.values()])
  }

  function pointerDown(event, code) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    focusArea()
    const alreadyPressed = keysRef.current.has(code) || [...pointersRef.current.values()].includes(code)
    pointersRef.current.set(event.pointerId, code)
    setPressed([...keysRef.current, ...pointersRef.current.values()])
    if (!alreadyPressed) act(code)
  }

  function pointerEnd(event) {
    pointersRef.current.delete(event.pointerId)
    setPressed([...keysRef.current, ...pointersRef.current.values()])
  }

  function changeMode(next) { setMode(next); focusArea() }
  const chosen = variants.filter(item => mode === 'all' || mode === item.id)
  const countdown = race.status === 'countdown' ? Math.max(1, Math.ceil((race.countdownEndsAt - race.updatedAt) / 1000)) : null
  const stateText = text[race.status]
  const viewName = item => `${text[item.view]} × ${text[item.art]}`

  return (
    <div className={styles.page} lang={locale}>
      <div className={styles.breadcrumbs}>
        <Link href="/playground">← {text.back}</Link>
        <Link href="/playground/controls">{text.controls} ↗</Link>
      </div>
      <section className={styles.intro} aria-labelledby="sprint-title">
        <div><p className={styles.eyebrow}>{text.lab}</p><h1 id="sprint-title">{text.heading[0]} <span>{text.heading[1]}</span></h1></div>
        <p className={styles.introText}>{text.intro}</p>
      </section>

      <section className={styles.game} aria-labelledby="race-heading" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); interrupt() }
      }}>
        <div className={styles.dashboard}>
          <div className={styles.raceIdentity}><span className={styles.raceDot} /><div><span className={styles.raceTag}>{text.tag}</span><h2 id="race-heading">{stateText}</h2></div></div>
          <dl className={styles.stats}>
            <div><dt>{text.time}</dt><dd data-testid="sprint-time">{formatSprintTime(race.elapsedMs)}<small>s</small></dd></div>
            <div><dt>{text.distance}</dt><dd data-testid="sprint-distance">{race.distance.toFixed(1)}<small>/ 100m</small></dd></div>
            <div><dt>{text.speed}</dt><dd>{(race.speed * 3.6).toFixed(1)}<small>km/h</small></dd></div>
          </dl>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.actions}>
            <button className={styles.start} type="button" onClick={() => start(false)}>{active ? '↻ ' : '▶ '}{race.status === 'idle' ? text.start : text.restart}</button>
            <button className={styles.secondary} type="button" onClick={() => start(true)}>{text.demo} ↗</button>
            {active ? <button className={styles.textButton} type="button" onClick={interrupt}>{text.stop}</button> : <button className={styles.textButton} type="button" onClick={reset}>{text.reset}</button>}
          </div>
          <span className={styles.connection}><i data-active={focused} />{isDemo && active ? text.demoNotice : focused ? text.focused : text.unfocused}</span>
        </div>

        <div className={styles.comparisonHeading}><div><h2>{text.comparison}</h2><p>{text.comparisonHint}</p></div><span className={styles.sync}>↔ SYNC</span></div>
        <div className={styles.viewSelector} role="group" aria-label={text.comparison}>
          <button type="button" aria-pressed={mode === 'all'} onClick={() => changeMode('all')}>{text.all}</button>
          {variants.map(item => <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => changeMode(item.id)}>{item.id}<span>{viewName(item)}</span></button>)}
        </div>
        <p id="sprint-instructions" className={styles.srOnly}>{text.instruction}</p>
        <div ref={areaRef} className={`${styles.arena} ${mode !== 'all' ? styles.single : ''}`} role="group" tabIndex={0}
          aria-label={text.field} aria-describedby="sprint-instructions" data-status={race.status} data-steps={race.steps} data-focused={focused} data-mode={mode}
          onFocus={event => { if (event.target === event.currentTarget) setFocused(true) }}
          onBlur={event => { if (event.target === event.currentTarget) { clearInputs(); setFocused(false) } }}
          onKeyDown={keyDown} onKeyUp={keyUp} onPointerDown={focusArea}>
          {chosen.map(item => <figure className={styles.scene} key={item.id}>
            <figcaption className={styles.sceneHeader}><div><span className={styles.letter}>{item.id}</span><h3>{viewName(item)}</h3></div><span>{item.art === 'pixel' ? 'PIXEL / 2D' : 'REALISTIC / 2D'}</span></figcaption>
            <div className={styles.sceneCanvas}>
              <SprintScene race={race} view={item.view} art={item.art} locale={locale} className={styles.canvas} />
              {countdown && <div className={styles.countdown} aria-hidden="true"><span>ON YOUR MARKS</span><strong>{countdown}</strong></div>}
              {race.status === 'finished' && <div className={styles.finishFlag} aria-hidden="true">FINISH · {formatSprintTime(race.finishTimeMs)}s</div>}
            </div>
            <div className={styles.sceneFooter}><span>{item.view === 'top' ? text.captionTop : text.captionSide}</span><button type="button" onPointerDown={event => event.stopPropagation()} onClick={() => changeMode(mode === item.id ? 'all' : item.id)} aria-label={mode === item.id ? text.all : `${viewName(item)} · ${text.enlarge}`}>{mode === item.id ? '⊞' : '⤢'}</button></div>
          </figure>)}
          {cheering && <div className={styles.cheerOverlay} key={cheers} aria-hidden="true">✦ {text.cheerMessage} ✦</div>}
        </div>
        <div className={styles.inputDock}>
          <div className={styles.feet}>
            {['left', 'right'].map(code => <button key={code} className={styles.foot} type="button" aria-pressed={pressed.includes(code)} aria-label={text[code]}
              onPointerDown={event => pointerDown(event, code)} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
              onClick={event => { if (event.detail === 0) { focusArea(); act(code) } }}><kbd>{code === 'left' ? '←' : '→'}</kbd><span>{text[code]}</span></button>)}
            <button className={styles.cheer} type="button" aria-label={`Space · ${text.cheer}`}
              onPointerDown={event => pointerDown(event, 'cheer')} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
              onClick={event => { if (event.detail === 0) { focusArea(); act('cheer') } }}><kbd>Space</kbd><span>✦ {text.cheer}</span></button>
          </div>
          <div className={styles.rhythm}><span>{text.next} <strong>{race.lastFoot === 'left' ? `→ ${text.right}` : race.lastFoot === 'right' ? `← ${text.left}` : text.either}</strong></span><span>{text.strides} <strong data-testid="sprint-strides">{race.steps}</strong></span></div>
        </div>
        <div className={styles.progress} aria-hidden="true"><span style={{ width: `${race.distance / SPRINT_RULES.distance * 100}%` }} /></div>
        <div className={styles.trackLabels} aria-hidden="true"><span>START / 0m</span><span>50m</span><span>FINISH / 100m</span></div>
        <div className={styles.instructions}><p>{text.hint}</p><p>{text.cheerHint}</p></div>
        <p className={styles.srOnly} role="status">{countdown ? `${text.countdown} ${countdown}` : race.status === 'running' ? text.liveStart : stateText}</p>
        {race.status === 'finished' && <section className={styles.result} aria-label={text.finished}>
          <div><p className={styles.eyebrow}>{text.result}</p><h2>{isDemo ? text.resultDemo : text.resultPlay}</h2><p className={styles.resultTime}>{formatSprintTime(race.finishTimeMs)}<span>s</span></p></div>
          <div className={styles.resultDetails}><p>{text.best}<strong>{bestTime === null ? text.noBest : `${formatSprintTime(bestTime)}s`}</strong></p><p>{text.resultNote}</p><button type="button" className={styles.start} onClick={() => start(false)}>{text.restart} ↗</button></div>
        </section>}
        {race.status === 'interrupted' && <p className={styles.interrupted} role="status">{text.interruptedHint}</p>}
      </section>
      <div className={styles.notes}><span>↔ {text.linked}</span><p>{text.footer}</p></div>
    </div>
  )
}
