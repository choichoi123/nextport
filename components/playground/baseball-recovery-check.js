import { useCallback, useEffect, useRef, useState } from 'react'
import BaseballScene from '@/components/playground/baseball-scene'
import { getBaseballTeam } from '@/lib/playground-baseball-teams.mjs'
import { createBaseballImageLoader } from '@/lib/playground-baseball-image-loader.mjs'
import styles from '@/styles/playground-baseball-recovery-check.module.css'

const MISSING_IMAGE = '/images/playground/baseball/delivery/20261124/recovery-missing.webp'

// Development route only. Failure uses an actual missing image, not a fake Scene.
export default function BaseballRecoveryCheck({ locale = 'ko' }) {
  const host = useRef(null)
  const fault = useRef(null)
  const freshUrl = useRef('')
  const timer = useRef(null)
  const loader = useRef(null)
  const actualLoader = useRef(null)
  const [run, setRun] = useState(0)
  const [hand, setHand] = useState('right')
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [readout, setReadout] = useState('{}')
  const [counts, setCounts] = useState({ aim:0, swing:0, keys:0, faults:0 })
  if (!loader.current) {
    actualLoader.current = createBaseballImageLoader()
    loader.current = (src, cache) => {
      const actual = actualLoader.current
      const armed = fault.current
      if (armed && !armed.consumed && src.endsWith(`/${armed.hand}-ready-lossless.webp`)) {
        // React Strict Mode mounts share this one real 404 until it settles.
        if (!armed.promise) {
          setCounts(value => ({ ...value, faults:value.faults + 1 }))
          armed.promise = actual(MISSING_IMAGE, { minWidth:512, minHeight:256 }).finally(() => { armed.consumed = true })
        }
        return armed.promise
      }
      // Fixture caches are private; never reuse or poison the main game's Map.
      const url = freshUrl.current ? `${src}${src.includes('?') ? '&' : '?'}recoveryRun=${freshUrl.current}` : src
      return actual(url, { cache:Boolean(cache), minWidth:512, minHeight:256 })
    }
  }
  const assetsReady = useCallback((available, error) => {
    setReady(available)
    setMessage(error)
  }, [])
  useEffect(() => {
    const interval = setInterval(() => {
      const canvas = host.current?.querySelector('[data-baseball-input="field"]')
      if (!canvas) return
      const data = canvas.dataset
      const value = JSON.stringify({ requestedHand:hand, drawnFrame:data.assetKey || '', drawnTeam:data.uniformTeam || '',
        phase:data.assetPhase || '', frozen:data.previewFrozen || '', retained:data.retainedFrames || '0', staging:data.stagingFrames || '0',
        inputLocked:canvas.getAttribute('aria-disabled'), canvasWidth:canvas.width, canvasHeight:canvas.height,
        loading:{ elapsedMs:data.loadElapsedMs, sourcesMs:data.sourceReadyMs, backgroundMs:data.backgroundReadyMs,
          pitcherMs:data.pitcherReadyMs, battersMs:data.battersReadyMs, composeMs:data.composeMs, frames:data.composedFrames,
          bankReadyMs:data.bankReadyMs, inputReadyMs:data.inputReadyMs, status:data.loadStatus, reused:data.loadReused } }, null, 2)
      setReadout(value)
    }, 100)
    return () => clearInterval(interval)
  }, [hand])
  useEffect(() => () => clearTimeout(timer.current), [])
  function start(fail, fresh = false) {
    clearTimeout(timer.current)
    // A fresh run owns only its own two shared images, never all prior URL keys.
    actualLoader.current = createBaseballImageLoader()
    fault.current = fail ? { hand:'right', consumed:false, promise:null } : null
    freshUrl.current = fresh ? `${Date.now()}-${run + 1}` : ''
    setReady(false)
    setMessage('')
    setHand('right')
    setCounts({ aim:0, swing:0, keys:0, faults:0 })
    setRun(value => value + 1)
  }
  function failReplacement() {
    clearTimeout(timer.current)
    const next = hand === 'right' ? 'left' : 'right'
    fault.current = { hand:next, consumed:false, promise:null }
    setHand(next)
  }
  function cancelReplacement() {
    clearTimeout(timer.current)
    fault.current = null
    const original = hand
    setHand(original === 'right' ? 'left' : 'right')
    timer.current = setTimeout(() => setHand(original), 120)
  }
  return <section ref={host} className={styles.check} data-baseball-recovery-check="BASEBALL_RECOVERY_FIXTURE"
    data-ready={ready} data-aim-count={counts.aim} data-swing-count={counts.swing} data-key-count={counts.keys} data-fault-count={counts.faults}
    onKeyDown={event => { if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code)) { event.preventDefault(); setCounts(value => ({ ...value, keys:value.keys + 1 })) } }}>
    <h1>이미지 실패·재시도 검수</h1>
    <p>개발 전용 · 실제 Scene과 로더를 사용합니다. 실점·훈련 기록은 만들지 않습니다.</p>
    <div className={styles.controls}>
      <button type="button" onClick={() => start(false)}>정상 로딩 시작</button>
      <button type="button" onClick={() => start(false, true)}>새 URL로 로딩 측정</button>
      <button type="button" onClick={() => start(true)}>초기 1회 404</button>
      <button type="button" disabled={!ready} onClick={failReplacement}>교체 중 1회 404</button>
      <button type="button" disabled={!ready} onClick={cancelReplacement}>다른 타석 교체 후 즉시 취소</button>
      <button type="button" onClick={() => setCounts(value => ({ ...value, aim:0, swing:0, keys:0 }))}>입력 계수 초기화</button>
    </div>
    <p role="status">요청 {hand} · {ready ? '실제 표시 완료 / 입력 가능' : '입력 잠김'}{message ? ` · ${message}` : ''}</p>
    <p>조준 {counts.aim} · 스윙 {counts.swing} · 전달된 조작 키 {counts.keys} · 실제 404 요청 {counts.faults}</p>
    <p>실패 후 경기장 안의 ‘이미지 다시 불러오기’를 누르세요. 교체 실패에서는 이전 타석이 멈춘 채 남고, 복구 표시 뒤에만 입력이 전달되어야 합니다.</p>
    <BaseballScene key={run} handedness={hand} team={getBaseballTeam('heroes')} phase="flight" jerseyNumber="7" locale={locale}
      mainClassName={styles.field} imageLoader={loader.current} onAssetsReady={assetsReady}
      onAim={() => setCounts(value => ({ ...value, aim:value.aim + 1 }))}
      onSwing={() => setCounts(value => ({ ...value, swing:value.swing + 1 }))} />
    <pre className={styles.readout} data-recovery-readout>{readout}</pre>
  </section>
}
