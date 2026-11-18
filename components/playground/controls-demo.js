import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { CONTROL_WORLD, advanceControls, getControlCode, getMovement } from '@/lib/playground-controls.mjs'
import styles from '@/styles/playground-controls.module.css'

const initialPosition = { x: CONTROL_WORLD.width / 2, y: CONTROL_WORLD.height / 2 }
const keys = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight', 'Space']
const symbols = { ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', ArrowRight: '→', Space: 'SPACE' }
const copy = {
  ko: {
    back: '놀이터로 돌아가기', title: '손끝에서 시작하는 작은 움직임.', intro: '방향키로 움직이고, 스페이스바로 파동을 보내보세요.',
    start: '조작 시작', reset: '처음으로', stop: '입력 해제', active: '조작 중', idle: '입력 대기',
    focusHint: '영역을 클릭하거나 ‘조작 시작’을 누르세요.', arena: '키보드 조작 영역',
    instructions: '방향키로 이동, 스페이스바로 파동. Esc 또는 Tab으로 영역을 벗어나면 멈춥니다.',
    overlay: '클릭하거나 Tab으로 선택해 주세요', overlaySmall: '선택한 영역 안에서만 키보드를 사용합니다.',
    pressed: '지금 누른 키', held: '눌림', released: '해제', last: '마지막 입력', none: '아직 없어요',
    actions: '스페이스 동작', times: '회', position: '현재 위치', touch: '화면으로 조작하기',
    touchHint: '버튼을 누르고 있으면 계속 움직입니다.', guide: '이렇게 확인해 보세요',
    steps: ['방향키를 길게 누르거나 두 방향을 함께 눌러보세요.', '스페이스바를 눌러 파동과 동작 횟수를 확인하세요.', 'Esc를 누르거나 다른 곳을 클릭해 입력을 해제하세요.'],
    note: '지금은 조작을 확인하는 실험입니다. 원하는 게임의 움직임을 이 위에 만들어갈 수 있어요.',
    keyNames: { ArrowLeft: '왼쪽', ArrowUp: '위쪽', ArrowDown: '아래쪽', ArrowRight: '오른쪽', Space: '스페이스바' },
  },
  en: {
    back: 'Back to playground', title: 'A little movement, at your fingertips.', intro: 'Move with the arrow keys. Send a pulse with the spacebar.',
    start: 'Start controls', reset: 'Reset', stop: 'Release controls', active: 'Controls active', idle: 'Ready when you are',
    focusHint: 'Click the field or choose “Start controls”.', arena: 'Keyboard controls field',
    instructions: 'Arrow keys move. Space sends a pulse. Escape or Tab leaves the field and stops movement.',
    overlay: 'Click or Tab into the field', overlaySmall: 'Keyboard input stays inside the selected field.',
    pressed: 'Keys held', held: 'Held', released: 'Released', last: 'Last input', none: 'None yet',
    actions: 'Space actions', times: '', position: 'Position', touch: 'On-screen controls',
    touchHint: 'Hold a button to keep moving.', guide: 'Try it out',
    steps: ['Hold an arrow key, or press two directions together.', 'Press Space and watch the pulse and action count.', 'Press Escape or click elsewhere to release the controls.'],
    note: 'This is a controls experiment. The movement for a future game can start here.',
    keyNames: { ArrowLeft: 'Left', ArrowUp: 'Up', ArrowDown: 'Down', ArrowRight: 'Right', Space: 'Spacebar' },
  },
}

export default function ControlsDemo() {
  const text = copy[useRouter().locale === 'en' ? 'en' : 'ko']
  const fieldRef = useRef(null)
  const keyboardRef = useRef(new Set())
  const pointersRef = useRef(new Map())
  const focusedRef = useRef(false)
  const positionRef = useRef(initialPosition)
  const animationRef = useRef(null)
  const timeRef = useRef(null)
  const [position, setPosition] = useState(initialPosition)
  const [focused, setFocused] = useState(false)
  const [pressed, setPressed] = useState([])
  const [lastKey, setLastKey] = useState(null)
  const [actions, setActions] = useState(0)

  const heldKeys = useCallback(() => new Set([...keyboardRef.current, ...pointersRef.current.values()]), [])
  const stopAnimation = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    animationRef.current = null
    timeRef.current = null
  }, [])
  const clearInputs = useCallback(() => {
    keyboardRef.current.clear()
    pointersRef.current.clear()
    stopAnimation()
    setPressed([])
  }, [stopAnimation])
  const releaseControls = useCallback(() => {
    clearInputs()
    focusedRef.current = false
    setFocused(false)
    fieldRef.current?.blur()
  }, [clearInputs])

  const animate = useCallback(function frame(timestamp) {
    const currentKeys = new Set([...keyboardRef.current, ...pointersRef.current.values()])
    const movement = getMovement(currentKeys)
    if (!focusedRef.current || (!movement.x && !movement.y)) {
      animationRef.current = null
      timeRef.current = null
      return
    }
    const delta = timeRef.current === null ? 0 : (timestamp - timeRef.current) / 1000
    timeRef.current = timestamp
    const next = advanceControls(positionRef.current, currentKeys, delta)
    positionRef.current = next
    setPosition(previous => previous.x === next.x && previous.y === next.y ? previous : next)
    animationRef.current = requestAnimationFrame(frame)
  }, [])

  const syncKeys = useCallback(() => {
    const held = heldKeys()
    setPressed([...held])
    const movement = getMovement(held)
    if (focusedRef.current && (movement.x || movement.y)) {
      if (animationRef.current === null) animationRef.current = requestAnimationFrame(animate)
    } else stopAnimation()
  }, [animate, heldKeys, stopAnimation])

  // A short tap also moves; holding continues in the timestamp-based frame loop.
  function applyInput(code) {
    setLastKey(code)
    if (code === 'Space') setActions(value => value + 1)
    else {
      const next = advanceControls(positionRef.current, heldKeys(), 1 / 60)
      positionRef.current = next
      setPosition(next)
    }
    syncKeys()
  }

  function focusField() {
    fieldRef.current?.focus({ preventScroll: true })
  }

  function keyDown(event) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent?.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      releaseControls()
      return
    }
    const code = getControlCode(event)
    if (!code) return
    event.preventDefault()
    if (keyboardRef.current.has(code) || (code === 'Space' && event.repeat)) return
    keyboardRef.current.add(code)
    applyInput(code)
  }

  function keyUp(event) {
    const code = getControlCode(event)
    if (!code || !keyboardRef.current.has(code)) return
    event.preventDefault()
    keyboardRef.current.delete(code)
    syncKeys()
  }

  function pointerDown(event, code) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    focusField()
    pointersRef.current.set(event.pointerId, code)
    applyInput(code)
  }

  function pointerEnd(event) {
    if (pointersRef.current.delete(event.pointerId)) syncKeys()
  }

  function buttonActivate(event, code) {
    if (event.detail !== 0) return
    focusField()
    setLastKey(code)
    if (code === 'Space') setActions(value => value + 1)
    else {
      const next = advanceControls(positionRef.current, new Set([code]), 0.05)
      positionRef.current = next
      setPosition(next)
    }
  }

  function reset() {
    releaseControls()
    positionRef.current = initialPosition
    setPosition(initialPosition)
    setActions(0)
    setLastKey(null)
  }

  useEffect(() => {
    const visibilityChange = () => { if (document.hidden) releaseControls() }
    window.addEventListener('blur', releaseControls)
    window.addEventListener('nextport:playground-menu-open', releaseControls)
    document.addEventListener('visibilitychange', visibilityChange)
    return () => {
      window.removeEventListener('blur', releaseControls)
      window.removeEventListener('nextport:playground-menu-open', releaseControls)
      document.removeEventListener('visibilitychange', visibilityChange)
      keyboardRef.current.clear()
      pointersRef.current.clear()
      stopAnimation()
    }
  }, [releaseControls, stopAnimation])

  return (
    <section className={styles.section}>
      <Link href="/playground" className={styles.back}>← {text.back}</Link>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>PLAYGROUND / CONTROLS LAB</p>
        <h1>{text.title}</h1>
        <p>{text.intro}</p>
      </div>

      <div className={styles.layout}>
        <div className={styles.lab}>
          <div className={styles.toolbar}>
            <span className={styles.status} data-active={focused} role="status"><i aria-hidden="true" />{focused ? text.active : text.idle}</span>
            <div className={styles.actions}>
              <button type="button" className={styles.start} onClick={focusField}>{text.start}</button>
              <button type="button" onClick={releaseControls}>{text.stop}</button>
              <button type="button" onClick={reset}>{text.reset}</button>
            </div>
          </div>

          <p id="controls-instructions" className={styles.instructions}>{text.instructions}</p>
          <div
            ref={fieldRef} className={styles.field} tabIndex={0} role="region"
            aria-label={text.arena} aria-describedby="controls-instructions"
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Space Escape"
            data-active={focused} data-testid="controls-field"
            onKeyDown={keyDown} onKeyUp={keyUp} onPointerDown={focusField}
            onFocus={() => { focusedRef.current = true; setFocused(true) }}
            onBlur={() => { focusedRef.current = false; clearInputs(); setFocused(false) }}
          >
            <span className={styles.fieldLabel} aria-hidden="true">MOVE. PRESS. PLAY.</span>
            <span className={styles.crosshair} aria-hidden="true">+</span>
            <span className={styles.origin} aria-hidden="true">START</span>
            <div className={styles.player} data-space={pressed.includes('Space')} aria-hidden="true" style={{ left: `${position.x / CONTROL_WORLD.width * 100}%`, top: `${position.y / CONTROL_WORLD.height * 100}%` }}>
              {actions > 0 && <span key={actions} className={styles.pulse} />}
              <span className={styles.character}>J<span>.</span></span>
            </div>
            {!focused && <div className={styles.focusOverlay} aria-hidden="true"><span>↗</span><strong>{text.overlay}</strong><small>{text.overlaySmall}</small></div>}
          </div>

          <div className={styles.keyStrip}>
            <span>{text.pressed}</span>
            <div className={styles.keys}>{keys.map(code => <kbd key={code} data-pressed={pressed.includes(code)} aria-label={`${text.keyNames[code]} · ${pressed.includes(code) ? text.held : text.released}`}>{symbols[code]}</kbd>)}</div>
          </div>

          <div className={styles.touchControls}>
            <div><h2>{text.touch}</h2><p>{text.touchHint}</p></div>
            <div className={styles.pad}>
              {['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space'].map(code => <button
                key={code} type="button" data-direction={code} aria-label={text.keyNames[code]} aria-pressed={pressed.includes(code)}
                onPointerDown={event => pointerDown(event, code)} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
                onClick={event => buttonActivate(event, code)}
              >{symbols[code]}</button>)}
            </div>
          </div>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.readout}>
            <p className={styles.eyebrow}>LIVE INPUT</p>
            <dl>
              <div><dt>{text.last}</dt><dd>{lastKey ? text.keyNames[lastKey] : text.none}</dd></div>
              <div><dt>{text.position}</dt><dd className={styles.coordinates}><span>X <b data-testid="player-x">{Math.round(position.x)}</b></span><span>Y <b data-testid="player-y">{Math.round(position.y)}</b></span></dd></div>
              <div><dt>{text.actions}</dt><dd className={styles.count} role="status" aria-live="polite"><span data-testid="space-count">{actions}</span><small>{text.times}</small></dd></div>
            </dl>
          </div>
          <div className={styles.guide}>
            <h2>{text.guide}</h2>
            <ol>{text.steps.map(step => <li key={step}>{step}</li>)}</ol>
            <p>{focused ? text.note : text.focusHint}</p>
          </div>
        </aside>
      </div>
    </section>
  )
}
