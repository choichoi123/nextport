import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BaseballScene from './baseball-scene'
import BaseballPitchComparison from './baseball-pitch-comparison'
import BaseballDataReview from './baseball-data-review'
import BaseballFeedbackPanel, { BaseballFeedbackOverlay } from './baseball-feedback-panel'
import useBaseballLiveFeedback from './use-baseball-live-feedback'
import useBaseballEntrance from './use-baseball-entrance'
import BaseballEntranceOverlay from './baseball-entrance-overlay'
import { BASEBALL_RULES, judgeBaseballSwing, judgeBaseballTake } from '@/lib/playground-baseball.mjs'
import { BASEBALL_PRACTICE_PITCH_TYPES, createBaseballPracticePitch, getBaseballPracticePitchSpeed, getBaseballPracticePitchType, isBaseballExtendedPracticePitchType } from '@/lib/playground-baseball-practice-pitches.mjs'
import { BASEBALL_TEAMS, getBaseballTeam, validateBaseballPlayer } from '@/lib/playground-baseball-teams.mjs'
import { getBaseballPlayerFeedback, revalidateBaseballPlayerField, handleBaseballCanvasKeyDown } from '@/lib/playground-baseball-input.mjs'
import { createBaseballDataCollector } from '@/lib/playground-baseball-data.mjs'
import styles from '@/styles/playground-baseball-game.module.css'

const copy = {
  ko: {
    persistedFresh:'새로고침·이동하면 플레이는 초기화됩니다. 저장된 수집 기록은 별도로 복구하며, 선수나 진행 중인 공은 자동 재개하지 않습니다.',
    title:'한 타석의 시작.', subtitle:'공의 속도를 읽고, 나만의 타이밍으로.', back:'놀이터', art:'시안 보기', prototype:'타격 시제품 · 포심', setup:'선수 설정', name:'선수 이름', number:'등번호', numberHint:'0~99 · 07처럼 입력할 수 있어요.', hand:'타석', right:'우타', left:'좌타', team:'구단', speed:'구속', enter:'타격장 입장', load:'선수 이미지를 준비하고 있습니다.', loadFailed:'선수 이미지를 불러오지 못했습니다. 이미지 다시 불러오기를 눌러주세요.', nameError:'이름을 16자 이내로 입력해 주세요.', numberError:'등번호는 0~99의 숫자로 입력해 주세요.', playerError:'선수 설정을 확인해 주세요.', begin:'투구 받기', next:'다음 공', restart:'같은 선수로 다시', change:'선수 변경', pause:'중단', resume:'다시 준비', paused:'훈련을 잠시 멈췄습니다.', pauseNote:'진행 중인 공은 취소했습니다. 완료한 결과는 유지되며, 다시 준비한 뒤 직접 투구를 시작합니다.', ready:'투구를 받을 준비가 됐습니다.', readyHelp:'막대 중심은 조준한 곳에 고정됩니다. 공이 존 앞면에 올 때 막대로 맞추세요. 막대 전체가 유효하며 중앙에 가까울수록 정타에 유리합니다.', timingHelp:'클릭·탭하면 해당 위치에 배트 중심을 고정하고 스윙합니다. 공이 타격면에 도착하기 조금 전에 입력해 보세요.', keyboard:'키보드: 방향키 조준 · Space 스윙 · Esc 중단', windup:'투구 준비', flight:'공을 보고 스윙하세요', swing:'스윙!', result:'이번 공의 결과', complete:'10구 훈련 완료', pitches:'투구', score:'점수', hits:'인플레이', perfect:'정타', timing:'기준 스윙 시간차', precision:'조준 중심 거리', exit:'타구 속도', distance:'예상 비거리', early:'빠름', late:'늦음', onTime:'정확', noSwing:'지켜본 공', history:'이번 훈련 기록', none:'첫 공을 기다립니다.', fresh:'새로고침·이동하면 이번 훈련은 초기화됩니다.', model:'구속 기반 게임 모델입니다. 타구 비거리는 추정치이며 실제 타격 능력 측정은 아닙니다.', pitchType:'포심 직구', practice:'10구 타격 훈련', preview:'팀·등번호를 바꾸며 선수를 확인해 보세요.', outcomes:{perfect:'정타',contact:'타격 성공',foul:'파울',miss:'헛스윙','called-strike':'지켜본 스트라이크',ball:'볼'}, loadingButton:'이미지 준비 중', beginHint:'투구 받기를 눌러 첫 공을 시작하세요.', live:'타격 중', readyBadge:'준비', summary:'이번 훈련 요약', swingButton:'스윙', aimCenter:'조준 중앙', identity:'훈련 중에는 선수 설정을 유지합니다.', resultHelp:'스윙 타이밍과 공이 통과한 위치를 확인하고 다음 공에 도전해 보세요.', namePlaceholder:'이름 또는 닉네임', meters:'m', second:'초', overall:'총점', record:'구', battedType:'타구 유형', grounder:'땅볼', lineDrive:'라인드라이브', flyBall:'뜬공', barrelGap:'공·배트 표면 간격', contactSurface:'표면 접촉', gapSurface:'타격면 도착 기준', inactiveBat:'도착 시 타격 구간 밖', timingNote:'시간차는 입력 {ms}ms 뒤의 기준 스윙과 공의 존 앞면 도착을 비교합니다. 조준 중심 거리는 명중 기준이 아니며, 막대 전체로 판정합니다.', missWindow:'공이 타격면에 도착할 때 배트가 유효 타격 구간에 없었습니다. 스윙 시점을 조절해 보세요.', missBarrel:'타격면에서 공과 막대가 닿지 않았습니다. 막대 전체로 공의 코스를 맞춰 보세요.', contactMarker:'타격면 접촉점', passageMarker:'존 앞면 통과점', markerNote:'표시점은 지면 착지점이 아닙니다.',
  },
  en: {
    persistedFresh:'Leaving or refreshing resets play. Saved data records recover separately; the player and a live pitch do not resume automatically.',
    title:'Your next at-bat.', subtitle:'Read the fastball. Find your timing.',back:'Playground',art:'Art concepts',prototype:'Batting prototype · four-seam',setup:'Your batter',name:'Player name',number:'Jersey number',numberHint:'0–99 · leading zero is supported.',hand:'Batting side',right:'Right',left:'Left',team:'Club',speed:'Pitch speed',enter:'Enter batting practice',load:'Preparing the player images.',loadFailed:'The player images could not load. Select Reload images to retry.',nameError:'Enter a name within 16 characters.',numberError:'Enter a jersey number from 0 to 99.',playerError:'Check the player settings.',begin:'Receive pitch',next:'Next pitch',restart:'Practice again',change:'Change player',pause:'Stop',resume:'Get ready again',paused:'Practice paused.',pauseNote:'The current pitch was cancelled. Completed results remain. Get ready and start the next pitch yourself.',ready:'Ready for the next pitch.',readyHelp:'The bat center stays at your aim. Meet the ball with the bar as it reaches the front of the zone. The whole bar can hit; contact nearer the middle favours a better hit.',timingHelp:'Click or tap to lock the bat center at that position and swing. Start just before the ball reaches the batting plane.',keyboard:'Keyboard: arrows to aim · Space to swing · Esc to stop',windup:'Windup',flight:'Read the ball and swing',swing:'Swing!',result:'Pitch result',complete:'Ten pitches complete',pitches:'Pitches',score:'Score',hits:'In play',perfect:'Perfect',timing:'Reference swing timing',precision:'Aim-centre distance',exit:'Exit velocity',distance:'Estimated distance',early:'Early',late:'Late',onTime:'On time',noSwing:'Taken pitch',history:'This practice',none:'Waiting for your first pitch.',fresh:'Leaving or refreshing clears this practice.',model:'A speed-based game model. Hit distance is an estimate, not a real batting-ability measurement.',pitchType:'Four-seam fastball',practice:'10-pitch practice',preview:'Preview your club and jersey number.',outcomes:{perfect:'Perfect contact',contact:'Contact',foul:'Foul',miss:'Swing and miss','called-strike':'Called strike',ball:'Ball'},loadingButton:'Preparing images',beginHint:'Select Receive pitch to start your first pitch.',live:'At bat',readyBadge:'Ready',summary:'Practice summary',swingButton:'Swing',aimCenter:'Center aim',identity:'Player settings stay fixed during practice.',resultHelp:'Review the timing and contact location, then try the next pitch.',namePlaceholder:'Name or nickname',meters:'m',second:'s',overall:'Total',record:'pitch',battedType:'Batted ball',grounder:'Ground ball',lineDrive:'Line drive',flyBall:'Fly ball',barrelGap:'Ball–bat surface gap',contactSurface:'Surface contact',gapSurface:'At the batting plane',inactiveBat:'Outside the active swing',timingNote:'Timing compares the reference swing, {ms}ms after input, with the ball reaching the front of the zone. Aim-centre distance is not the hit limit: the whole bar counts.',missWindow:'The bat was outside its active hitting phase when the ball reached the batting plane. Adjust when you swing.',missBarrel:'The ball and bar did not touch at the batting plane. Aim to meet the pitch with any part of the bar.',contactMarker:'Batting-plane contact',passageMarker:'Zone-front passage',markerNote:'The marker is not a ground-landing point.',
  },
}

const initialAim = { x: 0, y: (BASEBALL_RULES.zone.bottom + BASEBALL_RULES.zone.top) / 2 }
const pitchCopy = {
  ko: {
    type:'구종', baseSpeed:'포심 기준 구속', effective:'다음 공',
    names:{'four-seam':'포심',slider:'슬라이더',curveball:'커브',changeup:'체인지업',sweeper:'스위퍼',splitter:'스플리터',sinker:'싱커',cutter:'커터'},
    prototype:`타격 시제품 · ${BASEBALL_PRACTICE_PITCH_TYPES.length}구종`,
    localOnly:'확장 구종(스위퍼·스플리터·싱커·커터) 결과는 이번 훈련 화면에서 볼 수 있습니다. 첫 확장 투구를 완료하면 개발용 저장이 끝나며, 기본 구종으로 새 훈련을 시작할 때 다시 저장됩니다.',
  },
  en: {
    type:'Pitch type', baseSpeed:'Fastball reference speed', effective:'Next pitch',
    names:{'four-seam':'Four-seam',slider:'Slider',curveball:'Curveball',changeup:'Changeup',sweeper:'Sweeper',splitter:'Splitter',sinker:'Sinker',cutter:'Cutter'},
    prototype:`Batting prototype · ${BASEBALL_PRACTICE_PITCH_TYPES.length} pitch types`,
    localOnly:'Sweeper, splitter, sinker and cutter results appear in this session. Development recording stops after the first completed pitch of one of these types and resumes when you start a new practice with one of the original four.',
  },
}
const FOCUS_PREFERENCE = 'nextport:baseball:batting-close-up'
const activePhase = phase => phase === 'windup' || phase === 'flight'
const seedFor = () => Math.floor(Math.random() * 0x100000000) >>> 0
const inputCanvasFor = game => {
  const focus = game?.querySelector('[data-baseball-input="focus"]')
  return focus?.getBoundingClientRect().width > 0 ? focus : game?.querySelector('[data-baseball-input="field"]')
}
const dataVersionKey = versions => versions ? [versions.schemaVersion, versions.engine?.hash, versions.rules?.hash, versions.presentation?.hash].join(':') : 'unavailable'
const dataEnvironment = ({ locale, focusEnabled }) => ({
  viewportBucket:window.innerWidth < 600 ? 'compact' : window.innerWidth < 1000 ? 'medium' : 'wide',
  orientation:window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
  locale:locale === 'en' ? 'en' : 'ko', focusEnabled,
})

export default function BaseballGame({ locale = 'ko', dataVersions = null }) {
  const text = copy[locale] || copy.ko
  const pitchesText = pitchCopy[locale] || pitchCopy.ko
  const router = useRouter()
  const { feedback:gameFeedback, prepare:prepareFeedback, begin:beginFeedback,
    advance:advanceFeedback, finish:finishFeedback, cancel:cancelFeedback } = useBaseballLiveFeedback({locale,mode:'practice'})
  const {intro:entranceIntro,prepare:prepareEntrance,enter:showEntrance,cancel:cancelEntrance}=useBaseballEntrance({feedback:gameFeedback,locale})
  const [draft, setDraft] = useState({ name:'', jerseyNumber:'7', handedness:'right', teamId:'heroes' })
  const [player, setPlayer] = useState(null)
  const [errors, setErrors] = useState({})
  const [phase, setPhase] = useState('setup')
  const [speed, setSpeed] = useState(120)
  const [pitchType, setPitchType] = useState('four-seam')
  const [pitch, setPitch] = useState(() => createBaseballPracticePitch())
  const [pitchStartAt, setPitchStartAt] = useState(null)
  const [swingAt, setSwingAt] = useState(null)
  const [swingAim, setSwingAim] = useState(null)
  const [result, setResult] = useState(null)
  const [resultAt, setResultAt] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [aim, setAim] = useState(initialAim)
  const [history, setHistory] = useState([])
  const [assetsReady, setAssetsReady] = useState(false)
  const [assetError, setAssetError] = useState('')
  const [focusEnabled, setFocusEnabled] = useState(false)
  const [dataSnapshot, setDataSnapshot] = useState(null)
  const [dataStatus, setDataStatus] = useState(null)
  const [persistenceState, setPersistenceState] = useState({ state:'loading', pending:0, saved:0, restored:0, history:[], sync:'idle', code:null })
  const gameRef = useRef(null)
  const roundRef = useRef(null)
  const seedRef = useRef(1)
  const aimRef = useRef(initialAim)
  const latestRef = useRef({ player, phase })
  const collectorRef = useRef(null)
  const dataSessionRef = useRef(null)
  const dataVersionBlockedRef = useRef(false)
  const dataVersionsRef = useRef(dataVersions)
  const dataEnvironmentRef = useRef({ locale, focusEnabled })
  const previousVersionRef = useRef(null)
  const dataSnapshotRef = useRef(null)
  const persistenceRef = useRef(null)
  const retryPersistenceRef = useRef(null)
  dataVersionsRef.current = dataVersions
  dataEnvironmentRef.current = { locale, focusEnabled }
  useEffect(() => { latestRef.current = { player, phase } }, [player, phase])

  // Semantic collection stays synchronous with the existing decision. The
  // separate effect submits snapshots to the asynchronous local queue, not RAF.
  const collectData = useCallback((method, value, publish = true) => {
    const collector = collectorRef.current
    if (!collector) return null
    try {
      const accepted = collector[method](value)
      const snapshot = collector.snapshot()
      dataSnapshotRef.current = snapshot
      if (publish) {
        setDataSnapshot(snapshot)
        setDataStatus(collector.status())
      }
      return accepted
    } catch {
      if (publish) setDataStatus({ state:'unavailable', reason:'collection-error' })
      return null
    }
  }, [])
  const beginDataSession = useCallback(handedness => {
    if (dataVersionBlockedRef.current) return null
    if (dataSessionRef.current) return dataSessionRef.current
    const versions = dataVersionsRef.current
    if (!versions) { setDataStatus({ state:'unavailable', reason:'missing-versions' }); return null }
    try {
      if (!collectorRef.current) collectorRef.current = createBaseballDataCollector({ versions })
      const id = collectData('startSession', { handedness, mode:'practice', versions, environment:dataEnvironment(dataEnvironmentRef.current) })
      dataSessionRef.current = id || null
      return id
    } catch {
      setDataStatus({ state:'unavailable', reason:'collection-error' })
      return null
    }
  }, [collectData])

  const endDataSession = useCallback((reason, publish = true) => {
    if (!dataSessionRef.current) return
    const round = roundRef.current
    if (round?.dataAttemptId && !round.finished) {
      collectData('abortAttempt', { reason, elapsedMs:Math.max(0,performance.now() - round.startAt) }, publish)
    }
    if (collectData('endSession', { reason }, publish)) dataSessionRef.current = null
  }, [collectData])

  const reportPersistenceError = useCallback(controller => {
    if (persistenceRef.current !== controller) return
    setPersistenceState(previous => ({ ...previous, state:'unavailable', sync:'error', code:'storage_unavailable' }))
  }, [])

  useEffect(() => {
    // This phase connects development data only. Production remains disabled.
    if (process.env.NODE_ENV !== 'development') return undefined
    let disposed = false
    let controller = null
    let finalSnapshot = null
    let initializing = false
    const initialize = () => {
      if (disposed || initializing || controller) return
      initializing = true
      setPersistenceState(previous => ({ ...previous, state:'loading', code:null }))
      import('@/lib/playground-baseball-outbox.mjs').then(({ openBaseballOutbox }) => openBaseballOutbox({
        onChange:state => { if (!disposed) setPersistenceState(state) },
      })).then(instance => {
        controller = instance
        if (disposed) {
          // A late StrictMode initialization may still finish an already queued
          // local write, but must never publish state or continue network work.
          if (finalSnapshot?.sessions.length) void instance.enqueue(finalSnapshot).catch(() => {})
          instance.close()
          return
        }
        persistenceRef.current = instance
        const snapshot = dataSnapshotRef.current
        if (snapshot?.sessions.length) void instance.enqueue(snapshot).catch(() => reportPersistenceError(instance))
      }).catch(() => {
        if (!disposed) setPersistenceState(previous => ({ ...previous, state:'unavailable', sync:'error', code:'storage_unavailable' }))
      }).finally(() => { initializing = false })
    }
    retryPersistenceRef.current = initialize
    initialize()
    return () => {
      disposed = true
      if (retryPersistenceRef.current === initialize) retryPersistenceRef.current = null
      // This is idempotent with the input-listener cleanup. An interrupted
      // browser shutdown may retain its earlier active snapshot, never a win.
      endDataSession('unmount', false)
      finalSnapshot = dataSnapshotRef.current
      if (controller) {
        if (finalSnapshot?.sessions.length) void controller.enqueue(finalSnapshot).catch(() => {})
        if (persistenceRef.current === controller) persistenceRef.current = null
        // close drains submitted local writes while aborting network/callbacks.
        controller.close()
      }
    }
  }, [endDataSession, reportPersistenceError])

  useEffect(() => {
    const controller = persistenceRef.current
    if (!controller || !dataSnapshot?.sessions.length) return
    void controller.enqueue(dataSnapshot).catch(() => reportPersistenceError(controller))
  }, [dataSnapshot, reportPersistenceError])

  const retryLocal = useCallback(() => {
    const controller = persistenceRef.current
    if (controller) void controller.retry().catch(() => reportPersistenceError(controller))
    else retryPersistenceRef.current?.()
  }, [reportPersistenceError])

  const inspectPendingLocal = useCallback(async () => {
    const controller=persistenceRef.current
    if(!controller)throw new Error('Pending inspection is unavailable.')
    const original=await controller.inspectPending()
    if(persistenceRef.current!==controller)throw new Error('Pending inspection was cancelled.')
    return original
  },[])

  const onAssetsReady = useCallback((ready, message = '') => { setAssetsReady(ready); setAssetError(message || '') }, [])
  const onAim = useCallback(value => {
    const round = roundRef.current
    if (round && !round.finished && round.swingAt !== null) return
    aimRef.current = value; setAim(value)
  }, [])
  const pause = useCallback((reason = 'manual') => {
    const round = roundRef.current
    cancelEntrance()
    cancelFeedback(round)
    if (!round || round.finished) return
    if (round.dataAttemptId) collectData('abortAttempt', { reason, elapsedMs:Math.max(0,performance.now() - round.startAt) })
    roundRef.current = null
    setPitchStartAt(null); setSwingAt(null); setSwingAim(null); setResult(null); setResultAt(null); setElapsed(0); setPhase('paused')
  }, [collectData, cancelFeedback,cancelEntrance])

  const versionKey = dataVersionKey(dataVersions)
  useEffect(() => {
    const previous = previousVersionRef.current
    previousVersionRef.current = versionKey
    // A locale transition may recreate props without changing these identities.
    if (previous !== null && previous !== versionKey) {
      pause('version-change')
      endDataSession('version-change')
      // The contract starts at pitch one. Keep game history, but do not label a
      // half-finished practice as a new complete training session.
      dataVersionBlockedRef.current = true
      setDataStatus({ state:'unavailable', reason:'version-change' })
      return
    }
    if (!dataVersionsRef.current) setDataStatus({ state:'unavailable', reason:'missing-versions' })
    else if (!collectorRef.current) setDataStatus({ state:'ready', reason:null })
  }, [versionKey, pause, endDataSession])

  useEffect(() => {
    try { setFocusEnabled(window.localStorage.getItem(FOCUS_PREFERENCE) === 'on') } catch { /* Preferences are optional. */ }
  }, [])
  useEffect(() => {
    if (phase === 'setup') gameRef.current?.style.removeProperty('--baseball-mobile-flow-floor')
  }, [phase])

  function toggleFocus() {
    // A new camera must not move the aim surface underneath a live swing.
    pause('focus-change')
    const enabled = !focusEnabled
    setFocusEnabled(enabled)
    try { window.localStorage.setItem(FOCUS_PREFERENCE, enabled ? 'on' : 'off') } catch { /* Keep the session preference. */ }
  }

  useEffect(() => {
    const hidden = () => { if (document.hidden) pause('hidden') }
    const blur = () => pause('blur')
    const menu = () => pause('menu')
    const route = () => pause('route-change')
    window.addEventListener('blur', blur)
    window.addEventListener('nextport:playground-menu-open', menu)
    document.addEventListener('visibilitychange', hidden)
    router.events.on('routeChangeStart', route)
    return () => {
      window.removeEventListener('blur', blur)
      window.removeEventListener('nextport:playground-menu-open', menu)
      document.removeEventListener('visibilitychange', hidden)
      router.events.off('routeChangeStart', route)
      // StrictMode's initial cleanup has no session, and an actual unmount must
      // not publish React state or invent a completed pitch.
      endDataSession('unmount', false)
      cancelFeedback(roundRef.current)
      roundRef.current = null
    }
  }, [pause, endDataSession, router.events, cancelFeedback])

  useEffect(() => {
    if (!activePhase(phase)) return
    let frame
    const tick = now => {
      const round = roundRef.current
      if (!round || round.finished) return
      advanceFeedback(round, now)
      const time = now - round.startAt - BASEBALL_RULES.windupMs
      setElapsed(time)
      if (phase === 'windup' && time >= 0) setPhase('flight')
      const deadline = Math.max(round.pitch.flightTimeMs + BASEBALL_RULES.resolveAfterMs,
        round.swingAt === null ? 0 : round.swingAt + BASEBALL_RULES.swingDurationMs)
      // The deterministic decision may be known, but a future hit is never rendered early.
      if (round.decision && !round.revealed) {
        const revealAt = round.decision.contacted ? round.decision.contactAtMs : deadline
        if (time >= revealAt) {
          round.revealed = true
          setResult(round.decision)
          setResultAt(round.decision.contacted ? round.startAt + BASEBALL_RULES.windupMs + round.decision.contactAtMs : null)
        }
      }
      if (time >= deadline) {
        round.finished = true
        const decision = round.decision || judgeBaseballTake(round.pitch)
        finishFeedback(round, { result:decision, authority:'memory' })
        if (round.dataAttemptId) collectData('completeAttempt', { result:decision })
        const completedPitchType = getBaseballPracticePitchType(round.pitch)
        if (isBaseballExtendedPracticePitchType(completedPitchType)) endDataSession('version-change')
        else if (round.index + 1 >= BASEBALL_RULES.sessionPitches) endDataSession('complete')
        setResult(decision)
        setHistory(items => [...items, { ...decision, pitchType:completedPitchType, pitchNumber:round.index + 1, speedKmh:round.pitch.speedKmh }])
        setPhase(round.index + 1 >= BASEBALL_RULES.sessionPitches ? 'complete' : 'result')
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, collectData, endDataSession, advanceFeedback, finishFeedback])

  const swing = useCallback((value, input) => {
    const round = roundRef.current
    if (!round || round.finished || round.swingAt !== null || !activePhase(latestRef.current.phase)) return
    const time = performance.now() - round.startAt - BASEBALL_RULES.windupMs
    const lockedAim = Object.freeze({ x:value.x, y:value.y })
    const decision = judgeBaseballSwing(round.pitch, { swingAtMs:time, aim:lockedAim, handedness:round.handedness })
    round.swingAt = time; round.decision = decision
    advanceFeedback(round)
    if (round.dataAttemptId) collectData('recordSwing', { swingAtMs:time, aim:lockedAim, input })
    aimRef.current = lockedAim
    setAim(lockedAim); setSwingAim(lockedAim); setSwingAt(time)
  }, [collectData, advanceFeedback])

  function updateDraft(key, value) {
    setDraft(previous => ({ ...previous, [key]:value }))
    setErrors(previous => revalidateBaseballPlayerField(previous, { ...draft, [key]:value }, key))
    if ((key === 'handedness' || key === 'teamId') && draft[key] !== value) setAssetsReady(false)
  }
  function revealMobileInput(includeActions = false) {
    if (!window.matchMedia('(max-width:1000px)').matches) return
    const scroller = gameRef.current
    const canvas = inputCanvasFor(scroller)
    if (!scroller || !canvas) return
    const frame = scroller.getBoundingClientRect(), input = canvas.getBoundingClientRect()
    const actions = includeActions ? scroller.querySelector('[data-baseball-field-actions]')?.getBoundingClientRect() : null
    const top = frame.top + 10, bottom = frame.bottom - 10
    const targetBottom = actions?.bottom ?? input.bottom
    const height = targetBottom - input.top
    const delta = height > bottom - top
      ? includeActions ? targetBottom - bottom : (input.top + input.bottom - top - bottom) / 2
      : input.top < top ? input.top - top : targetBottom > bottom ? targetBottom - bottom : 0
    if (Math.abs(delta) > 1) scroller.scrollBy({ top:delta, behavior:'auto' })
  }
  function preserveMobileScrollRoom() {
    if (!window.matchMedia('(max-width:1000px)').matches) return
    const scroller = gameRef.current, layout = scroller?.querySelector('[data-baseball-layout]')
    if (!scroller || !layout) return
    const contentTop = layout.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    const paddingBottom = Number.parseFloat(window.getComputedStyle(scroller).paddingBottom) || 0
    // Reserve only enough room for the current field position, not a whole
    // previous result panel. Shorter live content must not clamp scrollTop.
    const floor = Math.max(0, Math.ceil(scroller.clientHeight + scroller.scrollTop - contentTop - paddingBottom))
    scroller.style.setProperty('--baseball-mobile-flow-floor', `${floor}px`)
  }
  function enter(event) {
    event.preventDefault()
    const valid = validateBaseballPlayer(draft)
    if (!valid.valid) { setErrors(valid.errors); return }
    if (!assetsReady) return
    const entranceToken=prepareEntrance()
    endDataSession('player-change')
    dataVersionBlockedRef.current = false
    setPlayer(valid.player); setHistory([]); seedRef.current = seedFor(); setPhase('ready'); setErrors({})
    showEntrance(entranceToken,valid.player)
    // Measure after the form gives way to the field action bar. This moves only
    // the game's own scroller, without starting a pitch or touching ancestors.
    requestAnimationFrame(() => revealMobileInput(true))
  }
  function startPitch() {
    if (!player || !assetsReady || !['ready','result'].includes(phase) || history.length >= BASEBALL_RULES.sessionPitches) return
    cancelEntrance()
    prepareFeedback()
    preserveMobileScrollRoom()
    const next = createBaseballPracticePitch({ pitchType, baseSpeedKmh:speed, seed:(seedRef.current + history.length) >>> 0, target:history.length===0?initialAim:undefined })
    // The recorded sequence is contiguous and its first pitch is centered.
    // After a local-only result there is no valid way to resume that sequence.
    const recordPitch = !hasLocalOnlyResult && !isBaseballExtendedPracticePitchType(pitchType) && !dataVersionBlockedRef.current
    if (recordPitch && !dataSessionRef.current) beginDataSession(player.handedness)
    const dataAttemptId = recordPitch && dataSessionRef.current ? collectData('startAttempt', {
      pitch:next, pitchNumber:history.length + 1, baseSpeedKmh:speed, firstCenterPitch:history.length === 0,
      environment:dataEnvironment(dataEnvironmentRef.current),
    }) : null
    const startAt = performance.now()
    roundRef.current = { pitch:next, startAt, swingAt:null, decision:null, revealed:false, finished:false, handedness:player.handedness, index:history.length, dataAttemptId }
    beginFeedback(roundRef.current, {scopeId:dataAttemptId ? dataSessionRef.current : undefined,pitchId:dataAttemptId||undefined,attemptId:dataAttemptId||undefined})
    setPitch(next); setPitchStartAt(startAt); setSwingAt(null); setSwingAim(null); setResult(null); setResultAt(null); setElapsed(-BASEBALL_RULES.windupMs); setPhase('windup')
    const canvas = inputCanvasFor(gameRef.current)
    canvas?.focus({ preventScroll:true })
    // Keep mobile scrolling inside this game, and only reveal a clipped input.
    // scrollIntoView can also move viewport ancestors in an in-app browser.
    if (canvas && window.matchMedia('(max-width:1000px)').matches) {
      requestAnimationFrame(() => revealMobileInput(true))
    } else if (canvas?.dataset.baseballInput === 'focus') {
      const views = gameRef.current?.querySelector('[data-baseball-views]')
      const target = views && views.getBoundingClientRect().height <= gameRef.current.clientHeight - 12 ? views : canvas
      target.scrollIntoView({ block:'center', behavior:'instant' })
    }
  }
  function clearRound(nextPhase) {
    cancelEntrance()
    cancelFeedback(roundRef.current)
    roundRef.current = null; setPitchStartAt(null); setSwingAt(null); setSwingAim(null); setResult(null); setResultAt(null); setElapsed(0); onAim(initialAim); setPhase(nextPhase)
  }
  function restart() { endDataSession('restart'); dataVersionBlockedRef.current = false; setHistory([]); seedRef.current = seedFor(); clearRound('ready'); const token=prepareEntrance();showEntrance(token,player) }
  function changePlayer() { endDataSession('player-change'); setPlayer(null); setHistory([]); clearRound('setup') }
  function keyDown(event) {
    handleBaseballCanvasKeyDown(event, { aim:aimRef.current, onAim, onSwing:swing, onPause:pause })
  }

  const displayPlayer = player || draft
  const team = getBaseballTeam(displayPlayer.teamId)
  const playing = activePhase(phase)
  const settled = phase === 'result' || phase === 'complete'
  const effectiveSpeed = getBaseballPracticePitchSpeed(speed,pitchType)
  const displayedPitchType = getBaseballPracticePitchType(pitch)
  const hasLocalOnlyResult = history.some(item => isBaseballExtendedPracticePitchType(item.pitchType))
  const score = history.reduce((sum,item) => sum + item.score,0)
  const hits = history.filter(item => item.outcome === 'contact' || item.outcome === 'perfect').length
  const perfect = history.filter(item => item.outcome === 'perfect').length
  const status = phase === 'windup' ? text.windup : phase === 'flight' ? (swingAt === null ? text.flight : text.swing) : phase === 'paused' ? text.paused : phase === 'complete' ? text.complete : text.ready
  const pitchComparison = useMemo(() => <BaseballPitchComparison baseSpeedKmh={speed} pitcherHandedness={pitch.pitcherHandedness} selectedType={pitchType} names={pitchesText.names} locale={locale} onSelect={setPitchType} />, [speed, pitch.pitcherHandedness, pitchType, pitchesText.names, locale])
  const feedback = getBaseballPlayerFeedback(errors, text)
  // CSS exposes exactly one of these responsive placements to sight and focus.
  // Both placements use the same callbacks and the existing round guards.
  const primaryAction = playing ? <button type="button" className={styles.secondary} onClick={()=>{const canvas=inputCanvasFor(gameRef.current);canvas?.focus({preventScroll:true});swing(aimRef.current,{source:'button',surface:canvas?.dataset.baseballInput === 'focus' ? 'focus' : 'field'})}} disabled={swingAt!==null}>{text.swingButton}</button> : phase==='paused' ? <button type="button" className={styles.primary} onClick={()=>clearRound('ready')}>{text.resume} <span aria-hidden="true">→</span></button> : phase==='complete' ? <button type="button" className={styles.primary} onClick={restart}>{text.restart} <span aria-hidden="true">→</span></button> : <button type="button" className={styles.primary} onClick={startPitch} disabled={!assetsReady}>{phase==='ready'?text.begin:text.next} <span aria-hidden="true">→</span></button>
  const fieldActions = phase !== 'setup' ? <div className={styles.fieldActionBar} role="group" aria-label={locale === 'ko' ? '경기장 투구 조작' : 'Field pitch controls'} data-baseball-field-actions>
    <div className={styles.fieldActionCopy}><strong>{settled && result ? text.outcomes[result.outcome] : status}</strong><span>{Math.min(history.length+(playing?1:0),10)}/10 · {playing ? pitch.speedKmh : effectiveSpeed} km/h</span></div>
    {primaryAction}
  </div> : null

  return <section ref={gameRef} className={styles.game} data-focus-enabled={focusEnabled} onKeyDown={keyDown} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) pause('focus-leave') }}>
    <header className={styles.heading}><div><p className={styles.kicker}>BATTING LAB · PROTOTYPE 01</p><h1>{text.title}</h1></div><nav aria-label={locale === 'ko' ? '타격장 이동' : 'Batting navigation'}><a href="/images/playground/baseball/concepts/20261123/index.html">{text.art} ↗</a><Link href="/playground/baseball/at-bat" prefetch={false}>{locale === 'ko' ? '한 타석 연습' : 'At-bat practice'} →</Link><Link href="/playground">← {text.back}</Link></nav></header>
    <div className={styles.layout} data-baseball-layout>
      <div className={styles.fieldColumn}>
        <div className={styles.hud}><div className={styles.player}><span style={{ background:team.helmet, color:'#fff' }}>#{displayPlayer.jerseyNumber || '7'}</span><div><strong>{displayPlayer.name || (locale === 'ko' ? '나만의 타자' : 'Your batter')}</strong><small>{team.name} · {displayPlayer.handedness === 'left' ? text.left : text.right}</small></div></div><div className={styles.readings}><div><small>{text.pitches}</small><strong>{Math.min(history.length+(playing?1:0),10)}<em>/10</em></strong></div><div><small>{playing?text.speed:pitchesText.effective}</small><strong>{playing ? pitch.speedKmh : effectiveSpeed}<em>km/h</em></strong></div><div><small>{text.score}</small><strong>{score}</strong></div></div></div>
        <div className={styles.viewOptions}>
          <span data-pitcher-handedness={pitch.pitcherHandedness} data-baseball-practice-pitch-type={displayedPitchType}>{locale === 'en' ? (playing?'Pitcher':'On field') : (playing?'투수':'화면')} · {pitch.pitcherHandedness === 'left' ? (locale === 'en' ? 'Left-handed' : '좌투') : (locale === 'en' ? 'Right-handed' : '우투')} · {pitchesText.names[displayedPitchType]}</span>
          <button className={styles.focusToggle} type="button" aria-pressed={focusEnabled} aria-controls="baseball-batting-close-up" onClick={toggleFocus}>{locale === 'en' ? 'Batting close-up' : '확대 타격'} <strong>{focusEnabled ? 'ON' : 'OFF'}</strong></button>
        </div>
        <BaseballFeedbackPanel locale={locale} feedback={gameFeedback} onOpen={()=>pause('menu')} />
        <BaseballScene mainClassName={styles.field} fieldActions={fieldActions} focusEnabled={focusEnabled} pitch={pitch} pitchStartAt={pitchStartAt} swingAt={swingAt} swingAim={swingAim} aim={aim} result={result} resultAt={resultAt} phase={phase} handedness={displayPlayer.handedness} team={team} jerseyNumber={displayPlayer.jerseyNumber || '7'} locale={locale} onAim={onAim} onSwing={swing} onAssetsReady={onAssetsReady}
          feedbackStrength={gameFeedback.settings.strength} feedbackOverlay={<BaseballFeedbackOverlay locale={locale} effect={gameFeedback.lastEvent} strength={gameFeedback.settings.strength} />} entranceOverlay={<BaseballEntranceOverlay intro={entranceIntro} locale={locale} strength={gameFeedback.settings.strength} />} focusEntranceOverlay={<BaseballEntranceOverlay intro={entranceIntro} locale={locale} strength={gameFeedback.settings.strength} compact />} />
        <div className={styles.status}><span className={playing ? styles.live : ''}>{phase === 'setup' ? text.preview : status}</span>{playing && <strong>{(Math.max(0,elapsed)/1000).toFixed(2)}<small>{text.second}</small></strong>}{playing && <button type="button" onClick={()=>pause('manual')}>{text.pause}</button>}</div>
        <p className={styles.controls}>{text.readyHelp}</p><p className={styles.keyboard}>{text.keyboard}</p>
        {process.env.NODE_ENV === 'development' && <BaseballDataReview snapshot={dataSnapshot} status={dataStatus} persistence={persistenceState} onRetry={retryLocal} onInspectPending={inspectPendingLocal} inspectionScope={player} locale={locale} />}
        <div className={styles.comparisonSlot} data-inactive={playing} aria-hidden={playing || undefined} inert={playing ? '' : undefined}>{pitchComparison}</div>
      </div>
      <aside className={styles.panel} aria-label={text.practice}>
        {phase === 'setup' ? <form onSubmit={enter} noValidate className={styles.form}>
          <p className={styles.kicker}>01 / YOUR BATTER</p><h2>{text.setup}</h2>
          <div className={styles.nameGrid}><label>{text.name}<input autoComplete="off" name="baseball-player-name" placeholder={text.namePlaceholder} value={draft.name} onChange={event=>updateDraft('name',event.target.value)} maxLength={32} aria-invalid={feedback.name.invalid} aria-describedby={feedback.name.describedBy} /></label><label>{text.number}<input name="baseball-jersey-number" inputMode="numeric" pattern="[0-9]{1,2}" maxLength={2} value={draft.jerseyNumber} onChange={event=>updateDraft('jerseyNumber',event.target.value)} aria-label={text.number} aria-invalid={feedback.jerseyNumber.invalid} aria-describedby={feedback.jerseyNumber.describedBy} /></label></div>
          <p id={feedback.numberHint} className={styles.hint}>{text.numberHint}</p>
          <fieldset aria-invalid={feedback.handedness.invalid} aria-describedby={feedback.handedness.describedBy}><legend>{text.hand}</legend><div className={styles.segment}><button type="button" aria-pressed={draft.handedness==='right'} onClick={()=>updateDraft('handedness','right')}>{text.right}</button><button type="button" aria-pressed={draft.handedness==='left'} onClick={()=>updateDraft('handedness','left')}>{text.left}</button></div></fieldset>
          <label>{text.team}<select value={draft.teamId} onChange={event=>updateDraft('teamId',event.target.value)} aria-invalid={feedback.teamId.invalid} aria-describedby={feedback.teamId.describedBy}>{BASEBALL_TEAMS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>{pitchesText.type}<select value={pitchType} onChange={event=>setPitchType(event.target.value)}>{BASEBALL_PRACTICE_PITCH_TYPES.map(item=><option key={item.id} value={item.id}>{pitchesText.names[item.id]}</option>)}</select></label>
          <label>{pitchesText.baseSpeed}<select value={speed} onChange={event=>setSpeed(Number(event.target.value))}>{[80,100,120,140,150,160].map(value=><option key={value} value={value}>{value} km/h</option>)}</select></label>
          <p className={styles.pitchSelection}>{pitchesText.names[pitchType]} <strong>{effectiveSpeed} km/h</strong></p>
          {feedback.messages.length > 0 && <div role="alert">{feedback.messages.map(message => <p key={message.id} id={message.id} className={styles.error}>{message.text}</p>)}</div>}
          {assetError && <p role="alert" className={styles.error}>{text.loadFailed}</p>}
          <button className={styles.primary} type="submit" disabled={!assetsReady}>{assetsReady?text.enter:text.loadingButton} <span>→</span></button>
          <p className={styles.hint}>{text.timingHelp}</p>
        </form> : <>
          <p className={styles.kicker}>{pitchesText.prototype}</p><h2>{phase==='complete'?text.summary:phase==='paused'?text.paused:settled?text.result:text.practice}</h2>
          {settled && result ? <div className={styles.result} data-outcome={result.outcome} role="status">
            <span>{String(history.length).padStart(2,'0')} / {text.record}</span><h3>{text.outcomes[result.outcome]}</h3>
            <div className={styles.resultGrid}>
              <div><small>{text.timing}</small><strong>{result.timingErrorMs===null?'—':`${Math.round(Math.abs(result.timingErrorMs))} ms`}</strong><span>{result.timingErrorMs===null?text.noSwing:Math.abs(result.timingErrorMs)<1?text.onTime:result.timingErrorMs<0?text.early:text.late}</span></div>
              <div><small>{text.precision}</small><strong>{Number.isFinite(result.aimErrorM)?`${(result.aimErrorM*100).toFixed(1)} cm`:'—'}</strong><span>{text.aimCenter}</span></div>
              <div><small>{text.barrelGap}</small><strong>{Number.isFinite(result.barrelGapM)?(result.barrelGapM>0&&result.barrelGapM<.001?'<0.1 cm':`${(result.barrelGapM*100).toFixed(1)} cm`):'—'}</strong><span>{result.timingErrorMs===null?text.noSwing:result.activeAtPlate===false?text.inactiveBat:result.contacted?text.contactSurface:text.gapSurface}</span></div>
              <div><small>{text.score}</small><strong>+{result.score}</strong></div>
            </div>
            {result.missReason && <p className={styles.resultReason}>{result.missReason==='outside-window'?text.missWindow:text.missBarrel}</p>}
            {Number.isFinite(result.timingErrorMs) && <p className={styles.resultNote}>{text.timingNote.replace('{ms}',BASEBALL_RULES.swingContactMs)}</p>}
            <p className={styles.markerNote}><strong>{result.contacted?text.contactMarker:text.passageMarker}</strong><br/>{text.markerNote}</p>
            {result.contacted && <p>{text.exit} <b>{result.exitSpeedKmh.toFixed(0)} km/h</b><br/>{text.distance} <b>{result.distanceM.toFixed(1)} m</b><br/>{text.battedType} <b>{result.launchAngleDeg < 8 ? text.grounder : result.launchAngleDeg < 25 ? text.lineDrive : text.flyBall}</b></p>}
          </div> : <p className={styles.explanation}>{phase==='paused'?text.pauseNote:playing?text.timingHelp:text.beginHint}</p>}
          <div className={styles.stats}><div><small>{text.overall}</small><strong>{score}</strong></div><div><small>{text.hits}</small><strong>{hits}</strong></div><div><small>{text.perfect}</small><strong>{perfect}</strong></div></div>
          {!playing && phase!=='complete' && <>
            <label>{pitchesText.type}<select value={pitchType} onChange={event=>setPitchType(event.target.value)}>{BASEBALL_PRACTICE_PITCH_TYPES.map(item=><option key={item.id} value={item.id}>{pitchesText.names[item.id]}</option>)}</select></label>
            <label>{pitchesText.baseSpeed}<select value={speed} onChange={event=>setSpeed(Number(event.target.value))}>{[80,100,120,140,150,160].map(value=><option key={value} value={value}>{value} km/h</option>)}</select></label>
            <p className={styles.pitchSelection}>{pitchesText.effective} · {pitchesText.names[pitchType]} <strong>{effectiveSpeed} km/h</strong></p>
          </>}
          <div className={styles.panelPrimaryAction}>{primaryAction}</div>
          {!playing && <button type="button" className={styles.secondary} onClick={changePlayer}>{text.change}</button>}
          <p className={styles.hint}>{text.model}</p>
          {history.length>0 && <div className={styles.history}><h3>{text.history}</h3><ol>{history.map(item=><li key={item.pitchNumber}><span>{String(item.pitchNumber).padStart(2,'0')}</span><strong>{text.outcomes[item.outcome]}</strong><small>{pitchesText.names[item.pitchType || 'four-seam']}<br/>{item.speedKmh} km/h</small><b>+{item.score}</b></li>)}</ol></div>}
        </>}
        {process.env.NODE_ENV === 'development' && dataVersions && (hasLocalOnlyResult || isBaseballExtendedPracticePitchType(pitchType)) && <p className={styles.hint}>{pitchesText.localOnly}</p>}
        <p className={styles.sessionNote}>{process.env.NODE_ENV === 'development' ? text.persistedFresh : text.fresh}</p>
      </aside>
    </div>
  </section>
}
