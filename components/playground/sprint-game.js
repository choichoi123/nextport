import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useRef, useState } from 'react'
import SprintScene from './sprint-scene'
import { SprintBossIntro, SprintBossWinCue } from './sprint-boss-event'
import SprintHUD, { SprintFinish } from './sprint-hud'
import SprintRecordPreview from './sprint-record-preview'
import SprintWorldRecord from './sprint-world-record'
import SprintLeaderboard from './sprint-leaderboard'
import useSprintLeaderboard from './use-sprint-leaderboard'
import useSprintAudio from './use-sprint-audio'
import { classifySprintFinish } from '@/lib/playground-sprint-record.mjs'
import { getSprintIneligibilityNotice, getSprintRecordAction } from '@/lib/playground-sprint-registration.mjs'
import { createSprintRace, startSprintRace, advanceSprintRace, applySprintStride, applySprintCheer, interruptSprintRace, formatSprintTime } from '@/lib/playground-sprint.mjs'
import { getSprintStartSample } from '@/lib/playground-sprint-start.mjs'
import { loadSprintSceneFamily } from '@/lib/playground-sprint-scene-assets.mjs'
import { createSprintReplay, createSprintReplayTimeline, getSprintReplayPresentation } from '@/lib/playground-sprint-replay.mjs'
import { getSprintTrackFrame, SPRINT_TRACK } from '@/lib/playground-sprint-track.mjs'
import { createSprintRivalSeed, getSprintCompetitionStanding, isSprintRaceMode, SPRINT_RIVAL_VERSION } from '@/lib/playground-sprint-rivals.mjs'
import { getSprintBossState, selectSprintBoss, SPRINT_BOSS, withSprintBossPresentation } from '@/lib/playground-sprint-boss.mjs'
import { getSprintFinishReaction } from '@/lib/playground-sprint-finish-reaction.mjs'
import { isSprintVoltCommand, isSprintVoltCommandPrefix, recordSprintSecretTap, shouldConsumeSprintSecretCall } from '@/lib/playground-sprint-secret.mjs'
import { validateSprintPlayer, SPRINT_PLAYER_NAME_LIMIT } from '@/lib/playground-sprint-player.mjs'
import styles from '@/styles/playground-sprint-game.module.css'

const copy = {
  ko: {
    back: '놀이터', backToGames: '놀이터로 돌아가기', leaveNote: '페이지를 나가면 선수 설정·미등록 경기·리플레이가 초기화됩니다. 온라인 등록 기록은 유지됩니다.', compare: '네 가지 비교 시안', heading: ['100m,', '너만의 리듬으로.'], intro: '두 발로 달리고, 다른 시선으로 다시 보기.',
    setup: '출발 전, 당신의 선수를 소개해 주세요.', setupKicker: '01 / YOUR RUNNER', name: '이름 · 닉네임', namePlaceholder: '트랙에서 불릴 이름', country: '국적',
    secretTitle: '번개 도전 준비 완료', secretHint: '다음 경쟁 경기 1회에 루사인 볼트가 등장합니다.', secretCancel: '해제',
    appearance: '경기 그림체', realistic: '실사풍', pixel: '도트', realisticHint: '경기장의 질감, 선수의 움직임', pixelHint: '픽셀로 달리는 작은 운동장',
    raceMode: '달리기 방식', solo: '혼자 달리기', competition: '경쟁', soloHint: '나의 리듬과 기록에 집중', competitionHint: '반투명 가상 선수 5명과 함께', competitionNote: '다른 레인의 가상 선수들과 달립니다. 충돌이나 속도 보정 없이 같은 조작·기록 규칙을 사용하며, 경기 순위는 온라인 TOP10과 별개입니다.',
    localNote: '온라인 경기는 익명 쿠키와 발 입력으로 서버 검증을 받습니다. 이름·국적은 등록 버튼을 눌러 공개 등록할 때 전송하며, 리플레이는 이 페이지 안에만 유지합니다.',
    nameRequired: '선수 이름을 입력해 주세요.', nameTooLong: '이름은 16자 이내로 입력해 주세요.', nameInvalid: '줄바꿈이나 보이지 않는 제어문자 없이 입력해 주세요.',
    countryRequired: '국적을 선택해 주세요.', countryInvalid: '목록에서 국적을 선택해 주세요.', artInvalid: '그림체를 선택해 주세요.',
    start: '출발하기', restart: '다시 달리기', demo: '자동 시연', demoRunner: '시연 선수', demoNotice: '자동 시연 · 개인 기록 제외',
    changePlayer: '선수 변경', stop: '달리기 중단', time: '시간', distance: '달린 거리', speed: '속도', strides: '유효 발걸음',
    idle: '출발선에서 기다리는 중', countdown: '출발을 준비하세요', running: '리듬을 이어가세요', finished: '100m 완주!', interrupted: '달리기가 중단되었습니다',
    field: '100m 달리기 조작 영역', left: '왼발', right: '오른발', cheer: '응원', next: '다음 발', either: '어느 발이든',
    instructions: '← 왼발 · → 오른발을 번갈아 누르세요. Space는 응원, Esc·Tab은 경기 중단입니다.',
    setupInstructions: '출발 후 ←·→를 번갈아 누르세요. Space는 응원입니다.',
    touchSetupInstructions: '출발 후 화면의 왼발·오른발을 번갈아 탭하세요. 응원 버튼도 사용할 수 있습니다.',
    touchInstructions: '화면 아래 왼발·오른발을 번갈아 탭하세요. 응원 버튼으로 함성을 보내고, 메뉴를 열면 경기가 중단됩니다. 키보드 ←·→·Space도 사용할 수 있습니다.',
    touchHint: '왼발·오른발 번갈아 탭 · 길게 눌러도 연타되지 않아요.',
    touchStartHint: '버튼 위치를 확인하세요 · GO!부터 번갈아 탭',
    touchFocused: '화면 버튼으로 조작 중', touchUnfocused: '왼발·오른발 버튼으로 조작',
    touchLeft: '왼발 탭', touchRight: '오른발 탭', touchEither: '왼발·오른발 교대', touchInterruptedHint: '다시 달리기를 눌러 새 경기로 출발하세요.',
    hint: '길게 누르기는 연타가 아닙니다. 한 발씩 번갈아 내딛으면 가속합니다.', cheerMessage: '끝까지, 한 걸음 더!',
    focused: '키보드 연결됨', unfocused: '경기장을 클릭해 키보드를 연결하세요', live: 'LIVE / SIDE VIEW', side: '사이드뷰', top: '탑뷰', artSwitch: '그림체 전환',
    finishTitle: '당신의 완주 기록', demoFinish: '자동 시연 완주', best: '이번 방문 최고', noBest: '아직 직접 완주한 기록이 없어요',
    replay: '리플레이 보기', replayKicker: 'REPLAY / 100M', replayView: '리플레이 시점', play: '재생', pause: '일시정지', replayRestart: '처음부터', exitReplay: '결과로 돌아가기',
    replayPosition: '리플레이 재생 위치', replaySpeed: '재생 속도', replayHelp: 'Space 재생·정지 · ← → 1초 이동 · Esc 결과로 돌아가기',
    touchReplayHelp: '재생·일시정지 버튼과 시간 슬라이더로 리플레이를 확인하세요. 결과로 돌아가기 버튼으로 종료합니다.',
    replayNote: '출발 준비 4초부터 결승까지 재생하고, 루사인의 남은 우승 세레머니와 마지막 자세 1초를 포함합니다. 재생 위치는 영상 시간이며 완주 기록은 그대로입니다. 크라우칭 자세는 사이드뷰에서 볼 수 있습니다.',
    replayPreparation: '출발 준비', replayRace: '경기', replayFinish: '피니시', replayRecord: '완주 기록',
    replayError: '이번 경기의 리플레이를 준비하지 못했습니다. 완주 기록은 그대로 확인할 수 있습니다.',
    playScreen: '큰 플레이 화면', devScreen: '개발 화면', celebrate: '세리머니', celebrationHint: 'Space를 눌러 기쁨을 나눠보세요', defeat: '아쉬움', defeatHint: 'Space를 눌러 아쉬움을 표현해 보세요', defeatMessage: '다음엔 더 빠르게.',
    touchCelebrationHint: '세리머니 버튼을 탭해 기쁨을 나눠보세요.', touchDefeatHint: '아쉬움 버튼을 탭해 마음을 표현해 보세요.',
    register: '기록 등록 미리보기', recordResult: '기록 판정 보기', onlineRegister: 'TOP10 기록 등록', registrationNote: '로컬 플레이 기록 · 온라인 등록 대상이 아닙니다.',
    recordChecking: '기록 확인 중', registrationResult: '등록 결과 보기', recordSaving: '등록 중…',
    rankings: '온라인 TOP10', preparing: '경기 준비 중…', startAssetError: '출발 화면을 준비하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.', onlineRun: '온라인 경기 · 완주 후 서버 검증', localRun: '로컬 플레이 · 온라인 기록 대상 아님',
    onlineUnavailable: '온라인 연결을 사용할 수 없어 로컬로 달립니다. 이번 경기는 온라인에 등록되지 않습니다.',
    boardNotConfigured: '온라인 기록 DB 미연결 · 로컬 플레이 가능', boardUnavailable: '온라인 기록 서비스에 연결하지 못했습니다. 로컬 플레이는 가능합니다.',
    verifying: '서버에서 완주 기록을 검증하고 있습니다…', verified: '서버 검증 완료 · 등록 시 최신 TOP10을 다시 확인합니다.', notEligible: '서버 검증 완료 · 현재 TOP10 등록 대상이 아닙니다.',
    verificationError: '온라인 완주 검증을 완료하지 못했습니다. 로컬 기록과 리플레이는 유지됩니다.', retryVerification: '완주 검증 다시 시도',
    registered: '온라인 TOP10 등록 완료', notQualified: 'TOP10 자격이 바뀌어 온라인에 등록되지 않았습니다.', notImproved: '이 브라우저의 기존 최고 기록을 유지했습니다.',
    soundOn: '소리 켜짐', soundOff: '소리 꺼짐', soundUnavailable: '음원 준비 불가', soundReady: '관중 함성 준비됨', credits: '음원 출처',
    interruptedNote: '영역 밖으로 이동하거나 창·탭을 전환해 경기가 중단되었습니다. 출발선부터 다시 달릴 수 있습니다.',
    recordNote: '온라인 기록과 이번 방문의 로컬 최고 기록은 별도로 관리됩니다.',
    preview: '선수와 그림체를 고른 뒤 출발해 보세요.', footnote: '혼자 달리기와 가상 경쟁은 같은 조작·기록 규칙을 사용합니다. 가상 경기 순위와 온라인 TOP10은 별개입니다.',
  },
  en: {
    back: 'Playground', backToGames: 'Back to playground', leaveNote: 'Leaving clears runner settings, unregistered runs and replays. Registered online records stay saved.', compare: 'Four visual studies', heading: ['100 metres.', 'Find your rhythm.'], intro: 'Run in your rhythm. Replay from another angle.',
    setup: 'Before the start, meet your runner.', setupKicker: '01 / YOUR RUNNER', name: 'Name · nickname', namePlaceholder: 'Your name on the track', country: 'Nationality',
    secretTitle: 'Lightning challenge ready', secretHint: 'Lusain Volt will appear in your next competition race.', secretCancel: 'Cancel',
    appearance: 'Visual style', realistic: 'Realistic', pixel: 'Pixel', realisticHint: 'Stadium textures, natural movement', pixelHint: 'A little stadium made of pixels',
    raceMode: 'Run mode', solo: 'Solo run', competition: 'Competition', soloHint: 'Focus on your rhythm and time', competitionHint: 'Race five translucent virtual runners', competitionNote: 'Race virtual runners in separate lanes. Controls and timing stay the same, with no collisions or speed adjustments. Race position is separate from the online TOP10.',
    localNote: 'Online runs use an anonymous cookie and stride inputs for server verification. Your name and nationality are sent when you press Register to publish your record. Replays stay on this page.',
    nameRequired: 'Enter a runner name.', nameTooLong: 'Use 16 characters or fewer.', nameInvalid: 'Remove line breaks and invisible control characters.',
    countryRequired: 'Choose a nationality.', countryInvalid: 'Choose a nationality from the list.', artInvalid: 'Choose a visual style.',
    start: 'Start running', restart: 'Run again', demo: 'Watch demo', demoRunner: 'Demo runner', demoNotice: 'Automatic demo · not a personal record',
    changePlayer: 'Change runner', stop: 'Stop run', time: 'Time', distance: 'Distance', speed: 'Speed', strides: 'Valid strides',
    idle: 'Waiting on the starting line', countdown: 'Getting ready to start', running: 'Keep your rhythm', finished: '100m complete!', interrupted: 'Run interrupted',
    field: '100m sprint controls area', left: 'Left foot', right: 'Right foot', cheer: 'Cheer', next: 'Next foot', either: 'Either foot',
    instructions: 'Alternate ← left foot and → right foot. Space to cheer. Escape or Tab interrupts the run.',
    setupInstructions: 'After the start, alternate ← and →. Press Space to cheer.',
    touchSetupInstructions: 'After the start, alternate the left- and right-foot buttons. Tap Cheer for the crowd.',
    touchInstructions: 'Alternate taps on the left-foot and right-foot buttons below. Tap Cheer for the crowd, or open the menu to stop the run. Arrow keys and Space also work.',
    touchHint: 'Alternate left and right taps · holding is not repeated tapping.',
    touchStartHint: 'Find the buttons · alternate taps after GO!',
    touchFocused: 'Using on-screen controls', touchUnfocused: 'Use the left- and right-foot buttons',
    touchLeft: 'Tap left foot', touchRight: 'Tap right foot', touchEither: 'Alternate left and right', touchInterruptedHint: 'Choose Run again to start a new run.',
    hint: 'Holding a key is not repeated tapping. Alternate your feet to accelerate.', cheerMessage: 'One more stride. You’ve got this!',
    focused: 'Keyboard connected', unfocused: 'Click the track to connect your keyboard', live: 'LIVE / SIDE VIEW', side: 'Side view', top: 'Top-down', artSwitch: 'Change visual style',
    finishTitle: 'Your finish time', demoFinish: 'Demo completed', best: 'Best this visit', noBest: 'Your first manual finish is ahead',
    replay: 'Watch replay', replayKicker: 'REPLAY / 100M', replayView: 'Replay camera', play: 'Play', pause: 'Pause', replayRestart: 'From the start', exitReplay: 'Back to result',
    replayPosition: 'Replay position', replaySpeed: 'Playback speed', replayHelp: 'Space play/pause · ← → seek 1 second · Esc back to result',
    touchReplayHelp: 'Use Play, Pause and the timeline slider to watch the replay. Choose Back to result to leave it.',
    replayNote: 'Replay the four-second preparation, the race, any remaining Lusain victory ceremony and a one-second final pose. Playback time is separate from your unchanged finish time. View crouching poses from the side.',
    replayPreparation: 'Start preparation', replayRace: 'Race', replayFinish: 'Finish', replayRecord: 'Finish time',
    replayError: 'The replay for this run could not be prepared. Your finish time is still available.',
    playScreen: 'Large play screen', devScreen: 'Developer view', celebrate: 'Celebrate', celebrationHint: 'Press Space to celebrate your finish', defeat: 'Disappointment', defeatHint: 'Press Space to react to the result', defeatMessage: 'Next time, faster.',
    touchCelebrationHint: 'Tap Celebrate to celebrate your finish.', touchDefeatHint: 'Tap Disappointment to react to the result.',
    register: 'Preview record registration', recordResult: 'View record result', onlineRegister: 'Register TOP10 record', registrationNote: 'Local play record · not eligible for online registration.',
    recordChecking: 'Checking record', registrationResult: 'View registration result', recordSaving: 'Registering…',
    rankings: 'Online TOP10', preparing: 'Preparing your run…', startAssetError: 'The starting scene could not be prepared. Refresh the page and try again.', onlineRun: 'Online run · verified after finishing', localRun: 'Local play · not an online record',
    onlineUnavailable: 'Online records are unavailable, so this is a local run. This run cannot be registered online.',
    boardNotConfigured: 'Online record database not connected · local play available', boardUnavailable: 'Online records could not be reached. Local play is available.',
    verifying: 'The server is verifying your finish…', verified: 'Server verified · the latest TOP10 is checked when you register.', notEligible: 'Server verified · not currently eligible for TOP10 registration.',
    verificationError: 'Online verification could not be completed. Your local time and replay remain available.', retryVerification: 'Retry finish verification',
    registered: 'Registered in the online TOP10', notQualified: 'TOP10 qualification changed, so this record was not registered.', notImproved: 'This browser’s existing best record was kept.',
    soundOn: 'Sound on', soundOff: 'Sound off', soundUnavailable: 'Audio unavailable', soundReady: 'Crowd cheer ready', credits: 'Audio credits',
    interruptedNote: 'Leaving the controls area or switching windows or tabs interrupted this run. Start again when ready.',
    recordNote: 'Online records and your local best this visit are tracked separately.',
    preview: 'Choose your runner and style, then head to the start.', footnote: 'Solo and competition share the same controls and timing rules. Virtual race position is separate from the online TOP10.',
  },
}

function inputCode(event) {
  if (event.code === 'ArrowLeft' || event.key === 'ArrowLeft') return 'left'
  if (event.code === 'ArrowRight' || event.key === 'ArrowRight') return 'right'
  if (event.code === 'Space' || event.key === ' ') return 'cheer'
  return null
}

const replayTimelines = new WeakMap()
function replayTimelineFor(run) {
  if (!run) return null
  // Keep already completed in-memory runs usable after a local code refresh.
  if (!replayTimelines.has(run)) {
    const clip = createSprintReplay({ events: run.clip.events, finishTimeMs: run.clip.finishTimeMs })
    replayTimelines.set(run, createSprintReplayTimeline(clip, run))
  }
  return replayTimelines.get(run)
}

export default function SprintGame({ countries, development = false, immersive = false }) {
  const router = useRouter()
  const locale = router.locale === 'en' ? 'en' : 'ko'
  const text = copy[locale]
  const [draft, setDraft] = useState({ name: '', countryCode: 'KR', art: 'realistic' })
  const [errors, setErrors] = useState({})
  const [editing, setEditing] = useState(true)
  const [art, setArt] = useState('realistic')
  const [raceMode, setRaceMode] = useState('solo')
  const [runMode, setRunMode] = useState('solo')
  const [runSeed, setRunSeed] = useState(0)
  const [bossPreview, setBossPreview] = useState('auto')
  const [secretArmed, setSecretArmed] = useState(false)
  const [runBoss, setRunBoss] = useState(false)
  const [bossIntro, setBossIntro] = useState(null)
  const [startAssetsPreparing, setStartAssetsPreparing] = useState(false)
  const [startAssetError, setStartAssetError] = useState(false)
  const [bossVictoryExtraMs, setBossVictoryExtraMs] = useState(0)
  const bossVictoryExtraRef = useRef(0)
  const [player, setPlayer] = useState(null)
  const [race, setRace] = useState(createSprintRace)
  const [focused, setFocused] = useState(false)
  const [inputMode, setInputMode] = useState('keyboard')
  const inputModeExplicitRef = useRef(false)
  const [pressed, setPressed] = useState([])
  const [isDemo, setIsDemo] = useState(false)
  const [bestTime, setBestTime] = useState(null)
  const [lastRun, setLastRun] = useState(null)
  const [replayError, setReplayError] = useState(false)
  const [replayMode, setReplayMode] = useState(false)
  const [replayView, setReplayView] = useState('side')
  const [replayTime, setReplayTime] = useState(0)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [replayRate, setReplayRate] = useState(1)
  const [cheering, setCheering] = useState(false)
  const [finishSummary, setFinishSummary] = useState(null)
  const [finishedAtISO, setFinishedAtISO] = useState(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const { leaderboard, run: onlineRun, registration, refresh: refreshLeaderboard, beginAttempt, resetRun, verifyFinish, retryVerification, register: registerRecord } = useSprintLeaderboard()
  const startingRef = useRef(false)
  const introRef = useRef(null)
  const startSequenceRef = useRef(0)
  const leaderboardTriggerRef = useRef(null)
  const recordTriggerRef = useRef(null)
  const [celebration, setCelebration] = useState(null)
  const celebrationStartedRef = useRef(null)
  const { enabled: audioEnabled, setEnabled: setAudioEnabled, status: audioStatus, prepare: prepareAudio, playCheer, stop: stopAudio } = useSprintAudio()
  const [audioPlays, setAudioPlays] = useState(0)
  const requestCheer = useCallback(async () => {
    if (await playCheer()) setAudioPlays(value => value + 1)
  }, [playCheer])
  const areaRef = useRef(null)
  const nameRef = useRef(null)
  const raceRef = useRef(race)
  const keysRef = useRef(new Set())
  const pointersRef = useRef(new Map())
  const eventsRef = useRef([])
  const runPlayerRef = useRef(null)
  const runModeRef = useRef('solo')
  const runSeedRef = useRef(0)
  const runBossRef = useRef(false)
  const secretArmedRef = useRef(false)
  const secretTapsRef = useRef([])
  const rememberedNameRef = useRef('')
  const nameComposingRef = useRef(false)
  const nameSubmitGuardRef = useRef(false)
  const nameSubmitGuardTimerRef = useRef(null)
  const runSecretRef = useRef(false)
  const demoRef = useRef(false)
  const demoStepRef = useRef(0)
  const cheerTimerRef = useRef(null)
  const finalizedRef = useRef(null)
  const replayModeRef = useRef(false)
  const replayTimeRef = useRef(0)
  const active = race.status === 'countdown' || race.status === 'running'
  const preparing = onlineRun.status === 'preparing' || startAssetsPreparing || bossIntro !== null
  const modalOpen = recordOpen || leaderboardOpen

  // This preference only changes labels. Keyboard and pointer inputs always
  // keep the same engine, held-input state, timing and online submission.
  useEffect(() => {
    const preference = window.matchMedia('(max-width: 1000px), (pointer: coarse)')
    const updatePreference = () => {
      if (!inputModeExplicitRef.current) setInputMode(preference.matches ? 'pointer' : 'keyboard')
    }
    updatePreference()
    preference.addEventListener('change', updatePreference)
    return () => preference.removeEventListener('change', updatePreference)
  }, [])

  function selectInputMode(mode) {
    inputModeExplicitRef.current = true
    setInputMode(mode)
  }

  const commit = useCallback(next => {
    raceRef.current = next
    // Preparing includes the boss entrance and countdown. Only the actual gun
    // consumes a call, including an interruption at the exact start boundary.
    if (shouldConsumeSprintSecretCall(next, runModeRef.current, runSecretRef.current)) {
      secretArmedRef.current = false
      runSecretRef.current = false
      setSecretArmed(false)
    }
    setRace(next)
  }, [])
  const clearInputs = useCallback(() => { keysRef.current.clear(); pointersRef.current.clear(); setPressed([]) }, [])
  const focusArea = useCallback(() => {
    areaRef.current?.focus({ preventScroll: true })
    setFocused(document.activeElement === areaRef.current)
  }, [])
  const cancelBossIntro = useCallback(() => {
    const pending = introRef.current
    introRef.current = null
    if (pending) { cancelAnimationFrame(pending.frame); pending.resolve(false) }
    setBossIntro(null)
  }, [])
  const playBossIntro = useCallback(() => new Promise(resolve => {
    const startedAt = performance.now()
    const pending = { frame: 0, resolve }
    introRef.current = pending
    setBossIntro({ elapsedMs: 0 })
    const tick = now => {
      if (introRef.current !== pending) return
      const elapsedMs = now - startedAt
      if (elapsedMs >= SPRINT_BOSS.introDurationMs) {
        introRef.current = null
        setBossIntro(null)
        resolve(true)
        return
      }
      setBossIntro({ elapsedMs })
      pending.frame = requestAnimationFrame(tick)
    }
    pending.frame = requestAnimationFrame(tick)
  }), [])
  const interrupt = useCallback(() => {
    const wasIntroducing = introRef.current !== null
    cancelBossIntro()
    setStartAssetsPreparing(false)
    if (startingRef.current || ['countdown', 'running'].includes(raceRef.current.status)) {
      startSequenceRef.current += 1
      startingRef.current = false
      resetRun()
    }
    clearInputs()
    stopAudio()
    clearTimeout(cheerTimerRef.current)
    setCheering(false)
    celebrationStartedRef.current = null
    setCelebration(null)
    if (replayModeRef.current) setReplayPlaying(false)
    else commit(wasIntroducing ? { ...createSprintRace(), status: 'interrupted' } : interruptSprintRace(raceRef.current, performance.now()))
  }, [cancelBossIntro, clearInputs, commit, resetRun, stopAudio])
  const applyRecordedStride = useCallback((previous, foot, now) => {
    const next = applySprintStride(previous, foot, now)
    if (next.steps > previous.steps) eventsRef.current.push({ atMs: next.updatedAt - next.startedAt, foot })
    return next
  }, [])

  useEffect(() => {
    if (!active) return
    let frame
    let lastPaint = 0
    const tick = now => {
      if (!['countdown', 'running'].includes(raceRef.current.status)) return
      if (now - lastPaint >= 1000 / 30) {
        lastPaint = now
        let next = raceRef.current
        if (demoRef.current && next.startedAt !== null) {
          while (next.status !== 'finished' && next.startedAt + demoStepRef.current * 175 <= now) {
            const index = demoStepRef.current++
            next = applyRecordedStride(next, index % 2 ? 'right' : 'left', next.startedAt + index * 175)
          }
        }
        next = advanceSprintRace(next, now)
        commit(next)
        if (!['countdown', 'running'].includes(next.status)) return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, applyRecordedStride, commit])

  useEffect(() => {
    if (race.status !== 'finished' || finalizedRef.current === race.startedAt) return
    finalizedRef.current = race.startedAt
    clearInputs()
    try {
      const clip = createSprintReplay({ events: eventsRef.current, finishTimeMs: race.finishTimeMs, ruleVersion: race.ruleVersion })
      setLastRun({ clip, player: runPlayerRef.current, isDemo: demoRef.current, raceMode: runModeRef.current, rivalVersion: SPRINT_RIVAL_VERSION, rivalSeed: runSeedRef.current, bossEncounter: runBossRef.current })
    } catch { setReplayError(true) }
    const summary = classifySprintFinish({ finishTimeMs: race.finishTimeMs, previousBestMs: bestTime, isDemo: demoRef.current })
    setFinishSummary(summary)
    setBestTime(summary.bestTimeMs)
    setFinishedAtISO(new Date().toISOString())
    if (!demoRef.current) void verifyFinish(eventsRef.current, race.finishTimeMs)
    void requestCheer()
  }, [race.status, race.startedAt, race.finishTimeMs, bestTime, clearInputs, requestCheer, verifyFinish])

  // Finish the boss's visual gesture after the player crosses, without advancing
  // the official clock or changing the input clip. Replay has its own visual timeline.
  useEffect(() => {
    if (race.status !== 'finished' || replayMode) return
    const boss = getSprintBossState(race, runMode, runSeed, runBoss)
    if (!boss?.won || !boss.celebrating) return
    const remainingMs = boss.celebrationDurationMs - boss.celebrationElapsedMs
    const previousExtraMs = bossVictoryExtraRef.current
    if (previousExtraMs >= remainingMs) return
    const startedAt = performance.now()
    let frame
    const tick = now => {
      const extraMs = Math.min(remainingMs, previousExtraMs + now - startedAt)
      bossVictoryExtraRef.current = extraMs
      setBossVictoryExtraMs(extraMs)
      if (extraMs < remainingMs) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [race, replayMode, runBoss, runMode, runSeed])

  useEffect(() => () => {
    startSequenceRef.current += 1
    const pending = introRef.current
    introRef.current = null
    if (pending) { cancelAnimationFrame(pending.frame); pending.resolve(false) }
  }, [])

  const celebrating = celebration !== null
  useEffect(() => {
    if (!celebrating) return
    let frame
    const tick = now => {
      if (celebrationStartedRef.current === null) return
      const elapsedMs = now - celebrationStartedRef.current
      if (elapsedMs >= 2400) { celebrationStartedRef.current = null; setCelebration(null); return }
      setCelebration(previous => previous ? { ...previous, elapsedMs, durationMs: 2400 } : null)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [celebrating])

  useEffect(() => {
    if (!replayMode || !replayPlaying || !lastRun) return
    let frame
    let previous = performance.now()
    const tick = now => {
      const next = Math.min(replayTimelineFor(lastRun).durationMs, replayTimeRef.current + Math.max(0, now - previous) * replayRate)
      previous = now
      replayTimeRef.current = next
      setReplayTime(next)
      if (next >= replayTimelineFor(lastRun).durationMs) { setReplayPlaying(false); return }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [replayMode, replayPlaying, replayRate, lastRun])

  useEffect(() => {
    const blur = () => { setFocused(false); interrupt() }
    const visibility = () => { if (document.hidden) blur() }
    window.addEventListener('blur', blur)
    window.addEventListener('nextport:playground-menu-open', blur)
    document.addEventListener('visibilitychange', visibility)
    // Includes the shared header and locale links, not just in-game exits.
    router.events.on('routeChangeStart', interrupt)
    return () => {
      window.removeEventListener('blur', blur)
      window.removeEventListener('nextport:playground-menu-open', blur)
      document.removeEventListener('visibilitychange', visibility)
      router.events.off('routeChangeStart', interrupt)
      clearTimeout(cheerTimerRef.current)
      clearTimeout(nameSubmitGuardTimerRef.current)
    }
  }, [interrupt, router.events])

  function selectArt(value) {
    setArt(value)
    setDraft(previous => ({ ...previous, art: value }))
    if (!editing) focusArea()
  }
  function canChangeSecretCall() {
    return editing && !preparing && !modalOpen && !startingRef.current
  }
  function armSecretCall() {
    if (!canChangeSecretCall()) return
    secretTapsRef.current = []
    secretArmedRef.current = true
    setSecretArmed(true)
  }
  function tapSetupTitle() {
    if (!canChangeSecretCall() || secretArmedRef.current) return
    const next = recordSprintSecretTap(secretTapsRef.current, performance.now())
    secretTapsRef.current = next.taps
    if (next.activated) armSecretCall()
  }
  function clearSecretCall() {
    if (!canChangeSecretCall()) return
    secretTapsRef.current = []
    secretArmedRef.current = false
    setSecretArmed(false)
  }
  function changeRunnerName(event) {
    const name = event.target.value
    if (!isSprintVoltCommandPrefix(name)) rememberedNameRef.current = name
    setDraft(previous => ({ ...previous, name }))
    setErrors(previous => ({ ...previous, name: undefined }))
  }
  function acceptNameCommand() {
    if (!canChangeSecretCall() || nameComposingRef.current || nameSubmitGuardRef.current || !isSprintVoltCommand(draft.name)) return false
    armSecretCall()
    setDraft(previous => ({ ...previous, name: rememberedNameRef.current }))
    setErrors(previous => ({ ...previous, name: undefined }))
    requestAnimationFrame(() => nameRef.current?.focus({ preventScroll: true }))
    return true
  }
  function runnerNameKeyDown(event) {
    if (event.key !== 'Enter') return
    if (event.repeat) { event.preventDefault(); return }
    if (event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229 || nameComposingRef.current) { guardComposingSubmit(); return }
    nameSubmitGuardRef.current = false
    if (acceptNameCommand()) { event.preventDefault(); event.stopPropagation() }
  }
  function guardComposingSubmit() {
    // Let the IME commit text while ignoring a native submit from that same
    // event turn. A separate, intentional Enter still starts normally.
    nameSubmitGuardRef.current = true
    clearTimeout(nameSubmitGuardTimerRef.current)
    nameSubmitGuardTimerRef.current = setTimeout(() => { nameSubmitGuardRef.current = false }, 0)
  }
  async function beginRace(demo = false, selectedPlayer = player) {
    if (modalOpen || startingRef.current || ['countdown', 'running'].includes(raceRef.current.status)) return
    if (demo && (!development || immersive)) return
    const selectedMode = isSprintRaceMode(raceMode) ? raceMode : 'solo'
    const selectedSeed = selectedMode === 'competition' ? createSprintRivalSeed() : 0
    const selectedSecret = secretArmedRef.current && selectedMode === 'competition'
    const selectedBoss = selectSprintBoss(selectedSeed, selectedMode, selectedSecret ? 'always' : development && !immersive ? bossPreview : 'auto')
    startingRef.current = true
    setStartAssetsPreparing(true)
    setStartAssetError(false)
    const sequence = ++startSequenceRef.current
    // Move focus before the setup controls become disabled. Otherwise Chrome can
    // blur the submitting control to the document and cancel this same request.
    focusArea()
    void prepareAudio()
    if (demo) resetRun()
    else {
      const attempt = await beginAttempt()
      if (sequence !== startSequenceRef.current) return
      if (!attempt) { startingRef.current = false; setStartAssetsPreparing(false); return }
      if (document.hidden) { startingRef.current = false; setStartAssetsPreparing(false); resetRun(); return }
    }
    // Decode the entire side-view family, including start sheets, before either
    // clock starts; cold background/run loads must not consume preparation time.
    // Shared cache work can finish after cancellation, but cannot start a race.
    let assets
    try { assets = await loadSprintSceneFamily({ art, view: 'side', bossEnabled: selectedBoss, defeat: false }) }
    catch { assets = { status: 'error' } }
    if (sequence !== startSequenceRef.current) return
    setStartAssetsPreparing(false)
    if (document.hidden || assets?.status !== 'ready') {
      startingRef.current = false
      resetRun()
      if (!document.hidden) setStartAssetError(true)
      return
    }
    clearInputs()
    stopAudio()
    void prepareAudio()
    clearTimeout(cheerTimerRef.current)
    setCheering(false)
    setEditing(false)
    setReplayMode(false)
    replayModeRef.current = false
    setReplayPlaying(false)
    setLastRun(null)
    setReplayError(false)
    setFinishSummary(null)
    setFinishedAtISO(null)
    setRecordOpen(false)
    celebrationStartedRef.current = null
    setCelebration(null)
    setBossVictoryExtraMs(0)
    bossVictoryExtraRef.current = 0
    eventsRef.current = []
    finalizedRef.current = null
    demoRef.current = demo
    demoStepRef.current = 0
    setIsDemo(demo)
    const runner = demo ? { name: text.demoRunner, countryCode: draft.countryCode, art } : selectedPlayer
    runPlayerRef.current = runner
    runModeRef.current = selectedMode
    runSeedRef.current = selectedSeed
    runBossRef.current = selectedBoss
    runSecretRef.current = selectedSecret
    setRunMode(selectedMode)
    setRunSeed(selectedSeed)
    setRunBoss(selectedBoss)
    setPlayer(runner)
    commit(createSprintRace())
    if (selectedBoss && !immersive) requestAnimationFrame(() => areaRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }))
    if (selectedBoss && !await playBossIntro()) return
    if (sequence !== startSequenceRef.current) return
    if (document.hidden) {
      startingRef.current = false
      resetRun()
      return
    }
    startingRef.current = false
    commit(startSprintRace(performance.now()))
    requestAnimationFrame(() => {
      focusArea()
      if (!immersive) areaRef.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    })
  }
  function submit(event) {
    event.preventDefault()
    if (nameComposingRef.current || nameSubmitGuardRef.current || startingRef.current || preparing || modalOpen) return
    // Also handle mobile form submission without a physical Enter key.
    if (acceptNameCommand()) return
    const result = validateSprintPlayer({ ...draft, art })
    setErrors(result.errors)
    if (!result.valid) {
      if (result.errors.name) nameRef.current?.focus()
      else document.getElementById('runner-country')?.focus()
      return
    }
    rememberedNameRef.current = result.player.name
    setDraft(result.player)
    beginRace(false, result.player)
  }
  function editPlayer() {
    interrupt()
    resetRun()
    replayModeRef.current = false
    setReplayMode(false)
    setReplayPlaying(false)
    setEditing(true)
    setIsDemo(false)
    setRunBoss(false)
    runBossRef.current = false
    setBossVictoryExtraMs(0)
    bossVictoryExtraRef.current = 0
    clearTimeout(cheerTimerRef.current)
    setCheering(false)
    setRecordOpen(false)
    setFinishSummary(null)
    setFinishedAtISO(null)
    commit(createSprintRace())
    requestAnimationFrame(() => nameRef.current?.focus())
  }
  function setReplayPosition(value) {
    const time = Math.max(0, Math.min(replayTimelineFor(lastRun)?.durationMs || 0, value))
    replayTimeRef.current = time
    setReplayTime(time)
  }
  function beginReplay() {
    if (!lastRun || startingRef.current || modalOpen) return
    clearInputs()
    setCheering(false)
    stopAudio()
    celebrationStartedRef.current = null
    setCelebration(null)
    setRecordOpen(false)
    replayModeRef.current = true
    setReplayMode(true)
    setReplayView('side')
    setReplayPosition(0)
    setReplayRate(1)
    setReplayPlaying(true)
    focusArea()
    if (!immersive) areaRef.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  function exitReplay() {
    replayModeRef.current = false
    setReplayMode(false)
    setReplayPlaying(false)
    clearInputs()
    focusArea()
  }
  function toggleReplay() {
    if (replayTimeRef.current >= replayTimelineFor(lastRun).durationMs) setReplayPosition(0)
    setReplayPlaying(value => !value)
  }
  function act(code) {
    if (editing || preparing || replayModeRef.current || modalOpen) return
    if (code === 'cheer') {
      if (raceRef.current.status === 'finished') {
        const kind = getSprintFinishReaction(raceRef.current, runModeRef.current, runSeedRef.current, runBossRef.current)
        if (kind === 'defeat') stopAudio()
        else void requestCheer()
        clearTimeout(cheerTimerRef.current)
        setCheering(false)
        celebrationStartedRef.current = performance.now()
        setCelebration({ kind, elapsedMs: 0, durationMs: 2400 })
        return
      }
      if (!demoRef.current) {
        const previous = raceRef.current
        const next = applySprintCheer(previous, performance.now())
        if (next.cheers > previous.cheers) eventsRef.current.push({ atMs: next.updatedAt - next.startedAt, action: 'cheer' })
        commit(next)
      }
      void requestCheer()
      setCheering(true)
      clearTimeout(cheerTimerRef.current)
      cheerTimerRef.current = setTimeout(() => setCheering(false), 900)
    } else if (!demoRef.current) commit(applyRecordedStride(raceRef.current, code, performance.now()))
  }
  function keyDown(event) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent?.isComposing) return
    if (modalOpen) return
    if (event.key === 'Tab') { setFocused(false); interrupt(); return }
    if (event.key === 'Escape') { event.preventDefault(); if (replayModeRef.current) exitReplay(); else { interrupt(); areaRef.current?.blur() } return }
    if (preparing) { if (inputCode(event)) event.preventDefault(); return }
    const code = inputCode(event)
    if (!code || editing) return
    selectInputMode('keyboard')
    event.preventDefault()
    if (event.repeat || keysRef.current.has(code)) return
    keysRef.current.add(code)
    setPressed([...keysRef.current, ...pointersRef.current.values()])
    if (replayModeRef.current) {
      if (code === 'cheer') toggleReplay()
      else { setReplayPlaying(false); setReplayPosition(replayTimeRef.current + (code === 'left' ? -1000 : 1000)) }
    } else act(code)
  }
  function keyUp(event) {
    const code = inputCode(event)
    if (!code || !keysRef.current.has(code)) return
    event.preventDefault()
    keysRef.current.delete(code)
    setPressed([...keysRef.current, ...pointersRef.current.values()])
  }
  function pointerDown(event, code) {
    if (event.button !== 0 || raceRef.current.status !== 'running' || editing || preparing || replayModeRef.current || modalOpen || demoRef.current) return
    selectInputMode('pointer')
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    focusArea()
    const held = keysRef.current.has(code) || [...pointersRef.current.values()].includes(code)
    pointersRef.current.set(event.pointerId, code)
    setPressed([...keysRef.current, ...pointersRef.current.values()])
    if (!held) act(code)
  }
  function pointerEnd(event) {
    pointersRef.current.delete(event.pointerId)
    setPressed([...keysRef.current, ...pointersRef.current.values()])
  }

  const replayTimeline = replayTimelineFor(lastRun)
  const replayPresentation = replayMode && replayTimeline ? getSprintReplayPresentation(replayTimeline, replayTime) : null
  const displayedRace = replayPresentation?.race || race
  const displayedBossExtraMs = replayPresentation ? replayPresentation.bossVictoryExtraMs : bossVictoryExtraMs
  const displayedMode = editing ? raceMode : replayMode && lastRun ? lastRun.raceMode || 'solo' : runMode
  const displayedSeed = editing ? 0 : replayMode && lastRun ? lastRun.rivalSeed || 0 : runSeed
  const displayedBoss = editing ? false : replayMode && lastRun ? lastRun.bossEncounter === true : runBoss
  const competition = getSprintCompetitionStanding(displayedRace, displayedMode, displayedSeed, displayedBoss)
  const bossState = withSprintBossPresentation(getSprintBossState(displayedRace, displayedMode, displayedSeed, displayedBoss), displayedBossExtraMs)
  const displayedPlayer = replayMode && lastRun ? lastRun.player : player
  const nationality = countries.find(country => country.code === displayedPlayer?.countryCode)
  const startSample = getSprintStartSample(displayedRace)
  const startSignal = !editing && !bossIntro && !modalOpen ? startSample.label : null
  const nameError = errors.name ? text[errors.name === 'required' ? 'nameRequired' : errors.name === 'tooLong' ? 'nameTooLong' : 'nameInvalid'] : null
  const countryError = errors.countryCode ? text[errors.countryCode === 'required' ? 'countryRequired' : 'countryInvalid'] : null
  const canRunAgain = !editing && !isDemo && !!player
  const finishReaction = getSprintFinishReaction(race, runMode, runSeed, runBoss)
  const displayedFinishReaction = getSprintFinishReaction(displayedRace, displayedMode, displayedSeed, displayedBoss)
  const finishAction = finishReaction === 'defeat' ? text.defeat : text.celebrate
  const pointerControls = inputMode === 'pointer'
  const startControlsPreview = immersive && !replayMode && displayedRace.status === 'countdown'
  const instructions = pointerControls ? text.touchInstructions : text.instructions
  const replayHelp = pointerControls ? text.touchReplayHelp : text.replayHelp
  const finishReactionHint = pointerControls
    ? finishReaction === 'defeat' ? text.touchDefeatHint : text.touchCelebrationHint
    : finishReaction === 'defeat' ? text.defeatHint : text.celebrationHint
  const nextFootHint = pointerControls
    ? race.lastFoot === 'left' ? text.touchRight : race.lastFoot === 'right' ? text.touchLeft : text.touchEither
    : race.lastFoot === 'left' ? `→ ${text.right}` : race.lastFoot === 'right' ? `← ${text.left}` : text.either
  const exclusionNotice = getSprintIneligibilityNotice(onlineRun, locale, registration)
  const recordAction = getSprintRecordAction(onlineRun, registration)
  const registrationNote = registration.status === 'registered' ? text.registered : registration.status === 'not_qualified' ? text.notQualified : registration.status === 'not_improved' ? exclusionNotice?.shortText || text.notImproved : onlineRun.status === 'verifying' ? text.verifying : onlineRun.status === 'verification_error' ? text.verificationError : onlineRun.status === 'verified' ? onlineRun.eligible ? text.verified : exclusionNotice.shortText : text.registrationNote

  function renderLeaderboardButton() {
    return <button type="button" className={styles.leaderboardButton} disabled={active || preparing || modalOpen} onClick={event => {
      leaderboardTriggerRef.current = event.currentTarget
      clearInputs()
      stopAudio()
      setReplayPlaying(false)
      setLeaderboardOpen(true)
      void refreshLeaderboard()
    }}>{text.rankings} ↗</button>
  }

  function renderSetup() {
    return <form className={styles.setup} onSubmit={submit} noValidate aria-busy={preparing}>
      <div className={styles.setupHeading}><button type="button" className={styles.secretTrigger} disabled={preparing || modalOpen} onClick={tapSetupTitle} onKeyDown={event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault() }}>{text.setupKicker}</button><h2>{text.setup}</h2></div>
      <p className={styles.modeNote}>{pointerControls ? text.touchSetupInstructions : text.setupInstructions}</p>
      {secretArmed && <div className={styles.secretNotice} data-art={art} role="status"><span className={styles.secretBadge} aria-hidden="true">⚡</span><p><strong>{text.secretTitle}</strong><span>{text.secretHint}</span></p><button type="button" className={styles.secretCancel} disabled={preparing || modalOpen} onClick={clearSecretCall}>{text.secretCancel}</button></div>}
      <div className={styles.setupGrid}>
        <div className={styles.formField}><label htmlFor="runner-name">{text.name}<span>{[...draft.name.normalize('NFC')].length}/{SPRINT_PLAYER_NAME_LIMIT}</span></label><input id="runner-name" disabled={preparing || modalOpen} ref={nameRef} value={draft.name} autoComplete="off" placeholder={text.namePlaceholder} aria-required="true" aria-invalid={!!nameError} aria-describedby={nameError ? 'runner-name-error' : undefined} onChange={changeRunnerName} onKeyDown={runnerNameKeyDown} onCompositionStart={() => { nameComposingRef.current = true }} onCompositionEnd={() => { nameComposingRef.current = false; guardComposingSubmit() }} />{nameError && <p id="runner-name-error" className={styles.error} role="alert">{nameError}</p>}</div>
        <div className={styles.formField}><label htmlFor="runner-country">{text.country}</label><select id="runner-country" disabled={preparing || modalOpen} value={draft.countryCode} aria-required="true" aria-invalid={!!countryError} aria-describedby={countryError ? 'runner-country-error' : undefined} onChange={event => setDraft(previous => ({ ...previous, countryCode: event.target.value }))}>{countries.map(country => <option key={country.code} value={country.code}>{country.flag} {country.label}</option>)}</select>{countryError && <p id="runner-country-error" className={styles.error} role="alert">{countryError}</p>}</div>
      </div>
      <fieldset className={styles.artOptions}><legend>{text.raceMode}</legend><div>{['solo','competition'].map(value => <label key={value} className={styles.artOption} data-selected={raceMode === value}><input type="radio" disabled={preparing || modalOpen} name="runner-mode" value={value} checked={raceMode === value} onChange={() => setRaceMode(value)} /><span className={styles.modeSwatch} aria-hidden="true">{value === 'solo' ? '01' : '06'}</span><span><strong>{text[value]}</strong><small>{value === 'solo' ? text.soloHint : text.competitionHint}</small></span><span className={styles.radioMark} aria-hidden="true" /></label>)}</div>{raceMode === 'competition' && <p className={styles.modeNote}>{text.competitionNote}</p>}</fieldset>
      <fieldset className={styles.artOptions}><legend>{text.appearance}</legend><div>{['realistic','pixel'].map(value => <label key={value} className={styles.artOption} data-selected={art === value}><input type="radio" disabled={preparing || modalOpen} name="runner-art" value={value} checked={art === value} onChange={() => selectArt(value)} /><span className={`${styles.artSwatch} ${value === 'pixel' ? styles.pixelSwatch : ''}`} aria-hidden="true">{value === 'pixel' ? '▟' : '◒'}</span><span><strong>{text[value]}</strong><small>{value === 'pixel' ? text.pixelHint : text.realisticHint}</small></span><span className={styles.radioMark} aria-hidden="true" /></label>)}</div>{errors.art && <p className={styles.error} role="alert">{text.artInvalid}</p>}</fieldset>
      {development && !immersive && <div className={styles.formField}><label htmlFor="sprint-boss-preview">{locale === 'ko' ? '강적 검수 · 개발 전용' : 'Boss preview · development only'}</label><select id="sprint-boss-preview" disabled={preparing || modalOpen} value={bossPreview} onChange={event => setBossPreview(event.target.value)}><option value="auto">{locale === 'ko' ? '실제 확률 · 30%' : 'Normal chance · 30%'}</option><option value="always">{locale === 'ko' ? '항상 등장 · 경쟁 모드' : 'Always appear · competition'}</option><option value="never">{locale === 'ko' ? '등장하지 않음' : 'Never appear'}</option></select></div>}
      <div className={styles.setupBottom}><p>{text.localNote}</p><div><button className={styles.primary} type="submit" disabled={preparing || modalOpen}>{preparing ? text.preparing : `${text.start} ↗`}</button>{development && !immersive && <button className={styles.secondary} type="button" disabled={preparing || modalOpen} onClick={() => beginRace(true)}>{text.demo}</button>}</div></div>
      <div className={styles.setupLinks}><Link href="/playground" className={styles.returnLink}>← {text.backToGames}</Link>{renderLeaderboardButton()}{renderSoundButton()}<a href="/audio/playground/sprint/CREDITS.md" target="_blank" rel="noreferrer">{text.credits} ↗</a>{development && immersive && <Link href="/playground/sprint">{text.devScreen} ↗</Link>}</div>
      <p className={styles.leaveNotice}>{text.leaveNote}</p>
      {preparing && <p className={styles.onlineSetupNotice} role="status">{text.preparing}</p>}
      {startAssetError && !preparing && <p className={styles.startAssetError} role="alert">{text.startAssetError}</p>}
      {!preparing && ['unavailable', 'error'].includes(leaderboard.status) && <p className={styles.onlineSetupNotice} role="status">{leaderboard.code === 'not_configured' ? text.boardNotConfigured : text.boardUnavailable}</p>}
    </form>
  }

  function renderStyleSwitch() {
    return <div className={styles.styleSwitcher} role="group" aria-label={text.artSwitch}>{['realistic','pixel'].map(value => <button type="button" key={value} disabled={modalOpen || preparing} aria-pressed={art === value} onClick={() => selectArt(value)}>{text[value]}</button>)}</div>
  }

  function renderSoundButton() {
    const label = !audioEnabled ? text.soundOff : audioStatus === 'unavailable' ? text.soundUnavailable : text.soundOn
    return <button type="button" className={styles.soundButton} disabled={modalOpen || preparing} aria-label={label} aria-pressed={audioEnabled} title={audioEnabled && audioStatus === 'ready' ? text.soundReady : label} onClick={() => { const next = !audioEnabled; setAudioEnabled(next); if (next) void prepareAudio(); if (!editing) focusArea() }}><span aria-hidden="true">{audioEnabled ? '♪' : '♩'}</span><span>{label}</span></button>
  }

  function renderRecordButton() {
    return <button ref={recordTriggerRef} className={styles.secondary} type="button" disabled={preparing || recordAction.disabled} aria-busy={recordAction.disabled || undefined} onClick={() => { clearInputs(); setRecordOpen(true); stopAudio() }}>{text[recordAction.labelKey]}</button>
  }

  function renderLiveControls(startPreview = false) {
    return <div className={styles.liveControls}>
      <div className={styles.inputDock}><div className={styles.feet}>
        {race.status !== 'finished' && ['left','right'].map(code => <button key={code} type="button" className={styles.foot} disabled={race.status !== 'running' || isDemo} aria-label={text[code]} aria-pressed={pressed.includes(code)} onPointerDown={event => pointerDown(event,code)} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} onClick={event => { if(event.detail === 0) {selectInputMode('keyboard');focusArea();act(code)} }}>{pointerControls || startPreview ? <span className={styles.touchMark} aria-hidden="true">TAP</span> : <kbd>{code === 'left' ? '←' : '→'}</kbd>}<span>{text[code]}</span></button>)}
        <button className={styles.cheerButton} type="button" disabled={startPreview} aria-label={`${pointerControls ? '' : 'Space · '}${race.status === 'finished' ? finishAction : text.cheer}`} onClick={event => { selectInputMode(event.detail === 0 ? 'keyboard' : 'pointer'); focusArea(); act('cheer') }}>{!pointerControls && <kbd>Space</kbd>} {race.status === 'finished' && finishReaction === 'defeat' ? '↘' : '✦'} {race.status === 'finished' ? finishAction : text.cheer}</button>
      </div><div className={styles.rhythm}><span>{race.status === 'finished' ? text.best : text.next}<strong>{race.status === 'finished' ? bestTime === null ? '—' : `${formatSprintTime(bestTime)}s` : nextFootHint}</strong></span><span>{text.strides}<strong data-testid="sprint-strides">{race.steps}</strong></span></div></div>
      {(pointerControls || startPreview) && <p className={styles.touchHint}>{startPreview ? text.touchStartHint : race.status === 'finished' ? finishReactionHint : race.status === 'interrupted' ? text.touchInterruptedHint : text.touchHint}</p>}
      <div className={styles.raceActions}><div className={styles.raceStatus}><span className={styles.onlineRunNote} role="status">{isDemo ? text.demoNotice : preparing ? text.preparing : onlineRun.status === 'local' ? text.localRun : onlineRun.status === 'online' ? text.onlineRun : race.status === 'finished' ? registrationNote : ''}</span><span className={styles.connection}><i data-active={focused} />{pointerControls ? focused ? text.touchFocused : text.touchUnfocused : focused ? text.focused : text.unfocused}</span></div><div className={styles.buttonRow}>{active ? <button type="button" className={styles.textButton} onClick={interrupt}>{text.stop}</button> : <>{canRunAgain && <button className={styles.secondary} type="button" disabled={preparing || modalOpen} onClick={() => beginRace(false)}>{text.restart}</button>}<button className={styles.textButton} type="button" onClick={editPlayer}>{text.changePlayer}</button></>}</div></div>
      {startAssetError && !preparing && <p className={styles.startAssetError} role="alert">{text.startAssetError}</p>}
      {!immersive && <p className={styles.inputHint}>{instructions}{!pointerControls && <><br />{text.hint}</>}</p>}
    </div>
  }

  function renderReplayControls() {
    return <section className={styles.replayControls} aria-label={text.replay}>
      <div className={styles.replayToolbar}><div className={styles.buttonRow}><button type="button" className={styles.primary} onClick={() => { toggleReplay(); focusArea() }}>{replayPlaying ? `Ⅱ ${text.pause}` : `▶ ${text.play}`}</button><button type="button" className={styles.secondary} onClick={() => { setReplayPosition(0); setReplayPlaying(true); focusArea() }}>{text.replayRestart}</button></div><div className={styles.styleSwitcher} role="group" aria-label={text.replayView}>{['side','top'].map(view => <button key={view} type="button" aria-pressed={replayView === view} onClick={() => { setReplayView(view); focusArea() }}>{text[view]}</button>)}</div></div>
      <div className={styles.replayMeta}><span>{text[replayPresentation?.phase === 'preparation' ? 'replayPreparation' : replayPresentation?.phase === 'finish' ? 'replayFinish' : 'replayRace']}</span><span>{text.replayRecord} <strong>{formatSprintTime(lastRun.clip.finishTimeMs)}s</strong></span></div>
      <div className={styles.seekRow}><span>{formatSprintTime(replayTime)}s</span><input type="range" min="0" max={replayTimeline.durationMs} step="1" value={replayTime} aria-label={text.replayPosition} aria-valuetext={locale === 'ko' ? `${formatSprintTime(replayTime)}초 / ${formatSprintTime(replayTimeline.durationMs)}초` : `${formatSprintTime(replayTime)} / ${formatSprintTime(replayTimeline.durationMs)} seconds`} onChange={event => { setReplayPlaying(false); setReplayPosition(Number(event.target.value)) }} /><span>{formatSprintTime(replayTimeline.durationMs)}s</span></div>
      <div className={styles.replayBottom}><label>{text.replaySpeed}<select aria-label={text.replaySpeed} value={replayRate} onChange={event => setReplayRate(Number(event.target.value))}><option value={.5}>0.5×</option><option value={1}>1×</option></select></label><button className={styles.textButton} type="button" onClick={exitReplay}>{text.exitReplay} ↗</button></div>{!immersive && <p>{text.replayNote}</p>}
    </section>
  }

  function closeRecordPreview() { setRecordOpen(false); requestAnimationFrame(() => recordTriggerRef.current?.isConnected && !recordTriggerRef.current.disabled ? recordTriggerRef.current.focus({ preventScroll: true }) : focusArea()) }
  function closeLeaderboard() { setLeaderboardOpen(false); requestAnimationFrame(() => leaderboardTriggerRef.current?.isConnected ? leaderboardTriggerRef.current.focus({ preventScroll: true }) : editing ? nameRef.current?.focus() : focusArea()) }
  function gameBlur(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return
    // A disabled setup control losing focus is an internal preparation change.
    // Explicit focus leaving the game and window/visibility events still cancel.
    if (startingRef.current && !event.relatedTarget && event.target.disabled && document.hasFocus() && !document.hidden) {
      focusArea()
      return
    }
    setFocused(false)
    interrupt()
  }
  const nextFoot = race.lastFoot === 'left' ? 'right' : race.lastFoot === 'right' ? 'left' : null

  return <div className={`${styles.page} ${immersive ? styles.immersive : ''}`} lang={locale} data-layout={immersive ? 'play' : 'development'} data-input-mode={inputMode} data-audio-status={audioStatus} data-audio-enabled={audioEnabled} data-audio-plays={audioPlays} data-secret-armed={secretArmed}>
    {!immersive && <>
      <div className={styles.breadcrumbs}><Link href="/playground">← {text.back}</Link><div className={styles.developerLinks}>{development && <Link href="/playground/sprint/play">{text.playScreen} ↗</Link>}{development && <Link href="/playground/sprint/compare">{text.compare} ↗</Link>}</div></div>
      <section className={styles.intro} aria-labelledby="sprint-title"><div><p className={styles.eyebrow}>PLAYGROUND / 100M SPRINT</p><h1 id="sprint-title">{text.heading[0]} <span>{text.heading[1]}</span></h1></div><p>{text.intro}</p></section>
    </>}
    {immersive && <h1 className={styles.srOnly}>{text.heading.join(' ')}</h1>}
    <section className={styles.game} aria-label={locale === 'ko' ? '100m 달리기' : '100m sprint'} onBlur={gameBlur}>
      {editing && !immersive && renderSetup()}
      <div className={styles.stadium} data-art={art}>
        {!immersive && <div className={styles.stadiumTop}><div className={styles.runnerBadge}><span className={styles.liveDot} data-replay={replayMode} /><div><span className={styles.stageLabel}>{replayMode ? text.replayKicker : editing ? 'START LINE / 100M' : text.live}</span><h2>{editing ? text.preview : displayedPlayer?.name}</h2>{!editing && <p>{nationality?.flag} {nationality?.label}{isDemo ? ` · ${text.demoNotice}` : ''}</p>}</div></div><div className={styles.stageToolsInline}>{!editing && renderLeaderboardButton()}{renderStyleSwitch()}{!editing && renderSoundButton()}</div></div>}
        <p className={styles.srOnly} id="sprint-game-instructions">{replayMode ? replayHelp : instructions}</p>
        <div ref={areaRef} className={styles.arena} role="group" tabIndex={editing || modalOpen ? -1 : 0} aria-label={text.field} aria-describedby="sprint-game-instructions" data-status={displayedRace.status} data-view={replayMode ? replayView : 'side'} data-art={art} data-mode={replayMode ? 'replay' : 'race'} data-replay-phase={replayPresentation?.phase || ''} data-replay-position={replayMode ? replayTime : ''} data-boss-celebration-ms={bossState?.celebrationElapsedMs ?? ''} data-race-mode={displayedMode} data-focused={focused} data-steps={displayedRace.steps} data-celebrating={celebrating} data-finish-reaction={displayedFinishReaction || ''} data-active-reaction={celebration?.kind || ''} data-boss-encounter={displayedBoss} data-boss-intro={bossIntro !== null} data-start-phase={startSample.phase} data-start-signal={startSignal === 'GO' ? 'go' : startSignal ? 'marks' : ''}
          style={{ '--sprint-camera-position': `${getSprintTrackFrame(displayedRace.distance, replayMode ? replayView : 'side').runnerX / SPRINT_TRACK.WIDTH * 100}%` }}
          onFocus={event => { if(event.target === event.currentTarget) setFocused(true) }} onBlur={event => { if(event.target === event.currentTarget) { clearInputs(); setFocused(false) } }}
          onKeyDown={keyDown} onKeyUp={keyUp} onPointerDown={event => { if (!editing && !modalOpen && !preparing && !event.target.closest('button,input,select,a,textarea,label')) focusArea() }}>
          <SprintScene race={displayedRace} view={replayMode ? replayView : 'side'} art={art} locale={locale} className={styles.canvas} fit={immersive ? 'cover' : 'natural'} celebration={replayMode ? null : celebration} raceMode={displayedMode} rivalSeed={displayedSeed} bossEncounter={displayedBoss} bossVictoryExtraMs={displayedBossExtraMs} />
          {(!editing || !immersive) && <SprintHUD race={displayedRace} art={art} locale={locale} playerName={displayedPlayer?.name} playerCountryLabel={nationality?.label} replayMode={replayMode} nextFoot={nextFoot} focused={focused} inputMode={inputMode} competition={competition} />}
          {immersive && !editing && <div className={styles.stageTools}>{renderLeaderboardButton()}{renderStyleSwitch()}{renderSoundButton()}{development && <Link href="/playground/sprint">{text.devScreen} ↗</Link>}</div>}
          {immersive && editing && <div className={styles.setupOverlay}>{renderSetup()}</div>}
          {bossIntro && <SprintBossIntro art={art} locale={locale} elapsedMs={bossIntro.elapsedMs} durationMs={SPRINT_BOSS.introDurationMs} />}
          {!editing && !bossIntro && !modalOpen && <SprintBossWinCue art={art} locale={locale} bossState={bossState} />}
          {startSignal && <div className={styles.countdown} data-art={art} data-phase={startSample.phase} data-signal={startSignal === 'GO' ? 'go' : 'marks'} data-testid="sprint-start-signal" aria-hidden="true">{startSignal !== 'GO' && <span>{startSignal}</span>}<strong key={startSample.count || startSignal}>{startSignal === 'GO' ? 'GO!' : startSample.count}</strong></div>}
          {cheering && !replayMode && !celebrating && <div className={styles.cheerOverlay} aria-hidden="true">✦ {text.cheerMessage} ✦</div>}
          {celebrating && <div className={styles.celebrationLabel} data-reaction={celebration.kind || 'victory'} aria-hidden="true">{celebration.kind === 'defeat' ? text.defeatMessage : `✦ ${text.celebrate} ✦`}</div>}
          {race.status === 'finished' && !editing && !replayMode && finishSummary && !modalOpen && !celebrating && !bossState?.celebrating && <div className={styles.resultOverlay}>
            <section className={styles.finishCard} data-art={art} aria-label={text.finished}>
              <SprintFinish art={art} locale={locale} kind={finishSummary.kind} timeMs={race.finishTimeMs} improvementMs={finishSummary.improvementMs} playerName={player?.name} competition={getSprintCompetitionStanding(race, runMode, runSeed, runBoss)} />
              {registration.status === 'registered' && <SprintWorldRecord worldRecord={registration.worldRecord} visualStyle={art} locale={locale} compact />}
              <div className={styles.finishActions}>{lastRun && <button className={styles.primary} type="button" disabled={preparing} onClick={beginReplay}>↺ {text.replay}</button>}{!isDemo && renderRecordButton()}{canRunAgain && <button className={styles.secondary} type="button" disabled={preparing || modalOpen} onClick={() => beginRace(false)}>{text.restart} ↗</button>}{isDemo && <button className={styles.secondary} type="button" onClick={editPlayer}>{text.changePlayer}</button>}<Link href="/playground" className={styles.secondary}>← {text.backToGames}</Link></div>
              <p className={styles.finishHint}>{finishReactionHint}</p>{!isDemo && <><p className={styles.registrationNote} role="status">{registrationNote}</p>{onlineRun.status === 'verification_error' && <button type="button" className={styles.verificationRetry} onClick={retryVerification}>{text.retryVerification}</button>}</>}{replayError && <p className={styles.error} role="alert">{text.replayError}</p>}
              <p className={styles.leaveNotice}>{text.leaveNote}</p>
            </section>
          </div>}
          {leaderboardOpen && <SprintLeaderboard leaderboard={leaderboard} countries={countries} locale={locale} art={art} onClose={closeLeaderboard} onRefresh={refreshLeaderboard} />}
          {recordOpen && finishedAtISO && <SprintRecordPreview player={{...player,art}} visualStyle={art} finishTimeMs={race.finishTimeMs} finishedAtISO={finishedAtISO} countries={countries} locale={locale} onClose={closeRecordPreview} onlineRun={onlineRun} registration={registration} onRegister={registerRecord} onRetryVerification={retryVerification} />}
          {immersive && !editing && race.status === 'interrupted' && <div className={styles.interruptionOverlay}><section><h2>{text.interrupted}</h2><p>{text.interruptedNote}</p><div className={styles.buttonRow}>{canRunAgain && <button className={styles.primary} type="button" disabled={preparing || modalOpen} onClick={() => beginRace(false)}>{text.restart}</button>}<button className={styles.secondary} type="button" onClick={editPlayer}>{text.changePlayer}</button><Link href="/playground" className={styles.secondary}>← {text.backToGames}</Link></div><p className={styles.leaveNotice}>{text.leaveNote}</p></section></div>}
          {immersive && !editing && !modalOpen && <div className={styles.stageBottom} data-art={art} data-start-preview={startControlsPreview}>{replayMode && lastRun ? renderReplayControls() : renderLiveControls(startControlsPreview)}</div>}
        </div>
        {!immersive && <div className={styles.telemetry}><span>{replayMode ? text[replayView] : text[race.status]}</span><dl><div><dt>{text.time}</dt><dd>{formatSprintTime(displayedRace.elapsedMs)}s</dd></div><div><dt>{text.distance}</dt><dd>{displayedRace.distance.toFixed(1)}m</dd></div><div><dt>{text.speed}</dt><dd>{(displayedRace.speed*3.6).toFixed(1)}km/h</dd></div><div><dt>Audio</dt><dd>{audioStatus} / {audioPlays}</dd></div></dl></div>}
      </div>
      {!immersive && !editing && !modalOpen && (replayMode && lastRun ? renderReplayControls() : renderLiveControls())}
      {!immersive && race.status === 'finished' && !editing && <div className={styles.visitBest}><span>{text.best}</span><strong>{bestTime === null ? text.noBest : `${formatSprintTime(bestTime)}s`}</strong></div>}
      {!immersive && race.status === 'interrupted' && !editing && <p className={styles.interrupted} role="status">{text.interruptedNote}</p>}
      <p className={styles.srOnly} role="status" aria-atomic="true">{replayMode ? `${text.replay} · ${text[replayView]}` : startSignal === 'GO' ? 'GO!' : startSignal ? `${startSignal} · ${startSample.count}` : text[race.status]}</p>
    </section>
    {!immersive && <p className={styles.footnote}>{text.footnote}</p>}
  </div>
}
