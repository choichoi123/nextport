import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import BaseballScene from './baseball-scene'
import BaseballFeedbackPanel, { BaseballFeedbackOverlay } from './baseball-feedback-panel'
import useBaseballLiveFeedback from './use-baseball-live-feedback'
import useBaseballEntrance from './use-baseball-entrance'
import BaseballEntranceOverlay from './baseball-entrance-overlay'
import useBaseballPostplay from './use-baseball-postplay'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, createBaseballPitch, judgeBaseballSwing, judgeBaseballTake } from '@/lib/playground-baseball.mjs'
import { createBaseballGrowthSnapshot, validateBaseballGrowthSnapshot, judgeBaseballGrowthSwing } from '@/lib/playground-baseball-growth.mjs'
import { BASEBALL_AT_BAT_RULES, createBaseballAtBat, nextBaseballAtBatPitch, resolveBaseballAtBatPitch } from '@/lib/playground-baseball-at-bat.mjs'
import { BASEBALL_FIELD_MODEL, getBaseballFieldFenceDistance, resolveBaseballFieldResult } from '@/lib/playground-baseball-field.mjs'
import { createBaseballFieldPresentation, sampleBaseballFieldPresentation } from '@/lib/playground-baseball-field-presentation.mjs'
import { BASEBALL_TEAMS, getBaseballTeam, validateBaseballPlayer } from '@/lib/playground-baseball-teams.mjs'
import { getBaseballPlayerFeedback, revalidateBaseballPlayerField, handleBaseballCanvasKeyDown } from '@/lib/playground-baseball-input.mjs'
import styles from '@/styles/playground-baseball-at-bat.module.css'

const copy = {
  ko:{
    title:'한 타석의 승부.', kicker:'BATTING LAB · AT-BAT PRACTICE', practice:'한 타석 연습', ten:'10구 연습', back:'놀이터',
    setup:'선수와 상대 설정', name:'선수 이름', number:'등번호', numberHint:'0~99 · 07처럼 입력할 수 있어요.', hand:'타석', right:'우타', left:'좌타', team:'구단',
    nameError:'이름을 16자 이내로 입력해 주세요.', numberError:'등번호는 0~99의 숫자로 입력해 주세요.', playerError:'선수 설정을 확인해 주세요.',
    pitcher:'상대 투수', random:'랜덤 좌우투', rightPitcher:'우투', leftPitcher:'좌투', pitchMode:'투구 구성', mixed:'4구종 혼합', baseSpeed:'포심 기준 구속',
    enter:'타석 입장', loading:'이미지 준비 중', loadFailed:'선수 이미지를 불러오지 못했습니다. 경기장 안에서 다시 불러올 수 있습니다.',
    begin:'투구 받기', next:'다음 공', swing:'스윙', pause:'중단', resume:'같은 공 다시 준비', confirmSwing:'입력한 결과 확인', newAtBat:'다음 타석', change:'선수 변경',
    ready:'투구를 받을 준비가 됐습니다.', windup:'투구 준비', flight:'공을 보고 스윙하세요', swinging:'스윙!', fieldPlay:'타구 플레이 진행 중', paused:'승부를 잠시 멈췄습니다.', complete:'타석 종료',
    pauseBefore:'카운트와 공의 조건을 유지했습니다. 같은 공을 준비한 뒤 직접 다시 시작하세요.', pauseAfter:'스윙 입력을 유지했습니다. 다시 치지 않고 이미 입력한 승부의 결과를 확인합니다.',
    beginHint:'볼넷·삼진 또는 안타·아웃으로 끝날 때까지 같은 투수와 승부합니다.', liveHint:'공이 존 앞면에 도착할 때 배트로 맞추세요. 치지 않고 볼을 골라도 됩니다.',
    controls:'클릭·터치로 조준과 스윙 · 방향키 조준 / Space 스윙 / Esc 중단', focus:'확대 타격', pitcherFixed:'이 타석의 투수', committed:'확정 투구', current:'현재 공', pitchUnit:'구',
    result:'이번 공의 결과', count:'카운트', countKept:'2스트라이크 이후 파울 · 카운트 유지', before:'이전', after:'이후', history:'이 타석의 승부 기록', empty:'아직 확정된 공이 없습니다.',
    trace:'타구와 수비 결과', fieldModel:'가상 기준 구장 · 간이 수비·자동 주루 모델', fieldLegend:'금색: 공 경로 · 원: 수비 시작 위치 · 마름모: 판정 지점', reason:'판정 근거',
    timing:'기준 스윙 시간차', gap:'공·배트 표면 간격', noSwing:'지켜본 공', early:'빠름', late:'늦음', accurate:'기준 일치', inactive:'유효 스윙 구간 밖',
    exit:'타구 속도', distance:'예상 비거리', final:'최종 결과', stats:'이번 타석 기록', local:'로컬 타석 연습 · 새로고침하거나 이동하면 이 모드의 선수·승부 기록은 초기화됩니다. DB·시즌·경험치에는 반영하지 않습니다.',
    locked:'타석 중에는 선수와 투수 조건을 유지합니다.', intro:'주자 없는 한 타석입니다. 파울 승부가 이어지면 공 수 제한 없이 계속합니다.',
    versionChanged:'판정 버전이 변경됐습니다. 기존 승부 기록을 남기고 새 타석을 준비해 주세요.', error:'승부 결과를 확인하지 못했습니다. 기록을 바꾸지 않았으며 입력한 결과를 다시 확인할 수 있습니다.',
    data:'타석 데이터 확인', archive:'이 화면에서 마친 타석', completed:'완료', interrupted:'중단',
    memoryMode:'메모리 연습', storedMode:'개발 DB 저장', storageTitle:'타석 저장·이어하기', storageLoading:'저장 연결 확인 중', storageReady:'개발 DB 연결됨', storageEmpty:'저장된 타석이 없습니다.', storageRetry:'저장 다시 시도', storageRefresh:'목록 새로고침', storageResume:'이어하기', storagePending:'전송 대기 입력이 있습니다. 같은 요청으로 다시 확인합니다.', storageSaving:'승부 기록 저장 중', storageError:'저장을 확인하지 못했습니다. 다음 공을 시작하지 않고 기록을 유지합니다.', storageConflict:'다른 탭의 승부와 충돌했습니다. 기존 입력을 보존했으며 현재 서버 상태를 확인해 주세요.', storageUnavailable:'개발 DB가 설정되지 않았거나 연결할 수 없습니다. 메모리 연습을 선택할 수 있습니다.', storageLocalFailed:'브라우저 보관을 완료하지 못했습니다. 입력을 새로 받지 않고 멈췄습니다.', storageNote:'이름·등번호·구단은 이 브라우저에만 보관합니다. 개발 DB는 발급한 공과 입력·판정·카운트를 저장하며, 새로고침 후 직접 이어할 수 있습니다. 쿠키·브라우저 데이터 삭제나 다른 기기에서의 복구는 지원하지 않습니다.', storageSwitch:'모드 변경은 선수 설정 화면에서 할 수 있습니다.', storageUnknownPlayer:'저장 타자', storageRead:'서버 상태 확인', storageStored:'서버 확정 기록', storageRestoreHint:'기록을 불러왔습니다. 투구는 자동 시작하지 않습니다.',
    pitches:{'four-seam':'포심', slider:'슬라이더', curveball:'커브', changeup:'체인지업'},
    outcomes:{ball:'볼', 'called-strike':'지켜본 스트라이크', miss:'헛스윙', foul:'파울', contact:'페어 타격', perfect:'정타', walk:'볼넷', 'strikeout-looking':'루킹 삼진', 'strikeout-swinging':'헛스윙 삼진', single:'단타', double:'2루타', triple:'3루타', 'home-run':'홈런', flyout:'뜬공 아웃', lineout:'직선타 아웃', groundout:'땅볼 아웃'},
    reasons:{'caught-fly':'공이 땅에 닿기 전에 야수가 뜬공을 잡았습니다.', 'caught-line-drive':'야수가 낮고 빠른 타구를 땅에 닿기 전에 잡았습니다.', 'throw-beats-runner':'수비의 1루 송구가 타자주자보다 먼저 도착했습니다.', 'safe-single':'수비가 처리하기 전에 타자주자가 1루에 도달했습니다.', 'safe-double':'수비 처리 시간 안에 2루까지 안전하게 도달했습니다.', 'safe-triple':'수비 처리 시간 안에 3루까지 안전하게 도달했습니다.', 'over-fence':'페어 타구가 땅에 닿기 전에 담장 높이를 넘어갔습니다.', 'ground-rule-double':'페어 타구가 바운드한 뒤 담장 밖으로 나가 인정2루타가 됐습니다.'},
  },
  en:{
    title:'One at-bat. One contest.', kicker:'BATTING LAB · AT-BAT PRACTICE', practice:'At-bat practice', ten:'10-pitch practice', back:'Playground',
    setup:'Your batter and pitcher', name:'Player name', number:'Jersey number', numberHint:'0–99 · leading zero is supported.', hand:'Batting side', right:'Right', left:'Left', team:'Club',
    nameError:'Enter a name within 16 characters.', numberError:'Enter a jersey number from 0 to 99.', playerError:'Check the player settings.',
    pitcher:'Opposing pitcher', random:'Random throwing hand', rightPitcher:'Right-handed', leftPitcher:'Left-handed', pitchMode:'Pitch selection', mixed:'Four-pitch mix', baseSpeed:'Fastball reference speed',
    enter:'Enter the at-bat', loading:'Preparing images', loadFailed:'The player images could not load. Retry inside the field.',
    begin:'Receive pitch', next:'Next pitch', swing:'Swing', pause:'Pause', resume:'Prepare the same pitch', confirmSwing:'Confirm the existing swing', newAtBat:'Next at-bat', change:'Change player',
    ready:'Ready for the next pitch.', windup:'Windup', flight:'Read the pitch and swing', swinging:'Swing!', fieldPlay:'Ball in play', paused:'At-bat paused.', complete:'At-bat complete',
    pauseBefore:'The count and pitch conditions remain. Prepare this same pitch and start it yourself.', pauseAfter:'Your swing input remains. Confirm its result instead of taking another swing.',
    beginHint:'Face the same pitcher until a walk, strikeout, hit or out ends this at-bat.', liveHint:'Meet the ball with the bat at the front of the zone. You can also take a pitch.',
    controls:'Click or tap to aim and swing · Arrows aim / Space swings / Esc pauses', focus:'Batting close-up', pitcherFixed:'Pitcher for this at-bat', committed:'Resolved pitches', current:'Current pitch', pitchUnit:'pitch',
    result:'Pitch result', count:'Count', countKept:'Two-strike foul · count unchanged', before:'Before', after:'After', history:'This at-bat', empty:'No pitches resolved yet.',
    trace:'Batted-ball and field result', fieldModel:'Fictional benchmark park · simplified defense and automatic running', fieldLegend:'Gold: ball path · circles: starting fielders · diamond: decision point', reason:'Result explanation',
    timing:'Reference swing timing', gap:'Ball–bat surface gap', noSwing:'Taken pitch', early:'Early', late:'Late', accurate:'On time', inactive:'Outside the active swing',
    exit:'Exit velocity', distance:'Estimated distance', final:'Final result', stats:'At-bat statistics', local:'Local at-bat practice · leaving or refreshing clears this mode’s player and contest records. No DB, season or XP updates.',
    locked:'Batter and pitcher settings remain fixed during an at-bat.', intro:'One at-bat with no runners. Repeated fouls continue without a pitch-count limit.',
    versionChanged:'The judgment version changed. Keep the recorded pitches and prepare a new at-bat.', error:'The result could not be confirmed. Records remain unchanged; retry confirming the existing input.',
    data:'Inspect at-bat data', archive:'At-bats completed on this screen', completed:'Complete', interrupted:'Interrupted',
    memoryMode:'Memory practice', storedMode:'Development DB', storageTitle:'Save and resume an at-bat', storageLoading:'Checking storage connection', storageReady:'Development DB connected', storageEmpty:'No saved at-bats.', storageRetry:'Retry saving', storageRefresh:'Refresh list', storageResume:'Resume', storagePending:'An input is waiting to sync. Retry the same request.', storageSaving:'Saving this pitch', storageError:'Storage could not be confirmed. The next pitch is blocked and records remain.', storageConflict:'Another tab changed this at-bat. Your input remains; inspect the current server state.', storageUnavailable:'The development DB is not configured or cannot be reached. Memory practice is available.', storageLocalFailed:'Browser storage did not complete. The existing input remains and play is paused.', storageNote:'Name, jersey and club stay in this browser. The development DB saves issued pitches, inputs, results and counts. Resume manually after refreshing. Recovery after clearing cookies/browser data or on another device is not supported.', storageSwitch:'Change mode from player setup.', storageUnknownPlayer:'Saved batter', storageRead:'Inspect server state', storageStored:'Server-confirmed records', storageRestoreHint:'Records restored. Pitches do not resume automatically.',
    pitches:{'four-seam':'Four-seam', slider:'Slider', curveball:'Curveball', changeup:'Changeup'},
    outcomes:{ball:'Ball', 'called-strike':'Called strike', miss:'Swing and miss', foul:'Foul', contact:'Fair contact', perfect:'Perfect contact', walk:'Walk', 'strikeout-looking':'Called strikeout', 'strikeout-swinging':'Swinging strikeout', single:'Single', double:'Double', triple:'Triple', 'home-run':'Home run', flyout:'Flyout', lineout:'Lineout', groundout:'Groundout'},
    reasons:{'caught-fly':'A fielder caught the fly ball before it touched the ground.', 'caught-line-drive':'A fielder caught the low, fast line drive before it landed.', 'throw-beats-runner':'The throw reached first base before the batter-runner.', 'safe-single':'The batter-runner reached first before the defense completed the play.', 'safe-double':'The batter-runner safely reached second within the fielding time.', 'safe-triple':'The batter-runner safely reached third within the fielding time.', 'over-fence':'The fair ball cleared the fence in the air.', 'ground-rule-double':'The fair ball bounced out of the park for a ground-rule double.'},
  },
}

const initialAim = { x:0, y:(BASEBALL_RULES.zone.bottom + BASEBALL_RULES.zone.top) / 2 }
const FOCUS_PREFERENCE = 'nextport:baseball:batting-close-up'
const activePhase = phase => phase === 'windup' || phase === 'flight'
const isFair = result => result?.outcome === 'contact' || result?.outcome === 'perfect'
const seedFor = () => Math.floor(Math.random() * 0x100000000) >>> 0
const countLabel = count => `${count.balls}B ${count.strikes}S`
const inputCanvasFor = game => {
  const focus = game?.querySelector('[data-baseball-input="focus"]')
  return focus?.getBoundingClientRect().width > 0 ? focus : game?.querySelector('[data-baseball-input="field"]')
}

// 공마다 복사한 스냅샷을 소유하며 이후 커리어/체크포인트로 대체하지 않는다.
// 손상된 v2 값은 버전 오류로 막고 기본40 판정으로 조용히 돌아가지 않는다.
function captureGrowthSnapshot(session, expected = null) {
  if (!session || session.schemaVersion === 1) {
    if (expected !== null) throw new TypeError('A v2 growth snapshot cannot become a v1 session.')
    return null
  }
  if (session.schemaVersion !== 2) throw new TypeError('Unsupported at-bat session version.')
  validateBaseballGrowthSnapshot(session.growthSnapshot)
  validateBaseballGrowthSnapshot(session.state?.growthSnapshot)
  const keys = Object.keys(session.growthSnapshot)
  if (keys.some(key => session.growthSnapshot[key] !== session.state.growthSnapshot[key])) throw new TypeError('Growth snapshot mismatch.')
  if (expected !== null) {
    validateBaseballGrowthSnapshot(expected)
    if (keys.some(key => session.growthSnapshot[key] !== expected[key])) throw new TypeError('Growth changed during an at-bat.')
  }
  return createBaseballGrowthSnapshot(session.growthSnapshot)
}

function judgeAtBatRoundSwing(pitch, input, growthSnapshot = null) {
  return growthSnapshot === null ? judgeBaseballSwing(pitch, input)
    : judgeBaseballGrowthSwing(pitch, input, growthSnapshot)
}

// A released tap on a former Swing button must not activate a new Next button.
function ActionButton({ kind, onAction, disabled, children, className }) {
  const pointerIntent = useRef(null)
  return <button type="button" className={className} disabled={disabled}
    onPointerDown={() => { pointerIntent.current = kind }} onPointerCancel={() => { pointerIntent.current = null }}
    onKeyDown={event => { if (event.repeat && ['Space','Enter'].includes(event.code)) event.preventDefault() }}
    onClick={event => {
      if (event.detail !== 0 && pointerIntent.current !== kind) return
      pointerIntent.current = null
      onAction()
    }}>{children}</button>
}

function CountReadout({ balls, strikes, label, locale }) {
  return <div className={styles.count} role="group" aria-label={locale==='en'?`${label}: ${balls} balls, ${strikes} strikes`:`${label}: ${balls}볼 ${strikes}스트라이크`}>
    <div><span>B</span><strong>{balls}</strong><i aria-hidden="true">{[1,2,3].map(n => <b key={n} data-lit={balls >= n} />)}</i></div>
    <div><span>S</span><strong>{strikes}</strong><i aria-hidden="true">{[1,2].map(n => <b key={n} data-lit={strikes >= n} />)}</i></div>
  </div>
}

function FieldMap({ value, text, locale }) {
  const projection = point => ({ x:130 + point.x * 1.5, y:218 - point.z * 1.5 })
  const fence = Array.from({ length:37 }, (_,i) => {
    const angle = -45 + i * 2.5, radians = angle * Math.PI / 180
    const distance = getBaseballFieldFenceDistance(angle)
    return projection({ x:Math.sin(radians) * distance, z:Math.cos(radians) * distance })
  })
  const outline = `M130 218 L${fence.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L')} Z`
  const points = value.path.map(p => { const q=projection(p); return `${q.x.toFixed(2)},${q.y.toFixed(2)}` }).join(' ')
  const decision = projection(value.decisionPoint)
  const base=BASEBALL_FIELD_MODEL.baseDistanceM/Math.SQRT2*1.5
  const playback=createBaseballFieldPresentation(value)
  const final=playback?sampleBaseballFieldPresentation(playback,value.playTimeMs):null
  const runner=final?projection(final.runner.position):null
  return <figure className={styles.fieldMap}>
    <figcaption>{text.trace}</figcaption>
    <svg viewBox="0 0 260 238" role="img" aria-label={`${text.outcomes[value.outcome]} · ${text.reasons[value.reasonKey]}`}>
      <path d={outline} className={styles.park} />
      <path d={`M130 218 L${130-base} ${218-base} L130 ${218-base*2} L${130+base} ${218-base} Z`} className={styles.diamond} />
      {value.fielders.map(f => { const p=projection(f);return <g key={f.id}><circle cx={p.x} cy={p.y} r={f.id===value.fielderId?4.5:3} className={f.id===value.fielderId?styles.selectedFielder:styles.fielder} /><text x={p.x+5} y={p.y-4}>{f.id}</text></g> })}
      <polyline points={points} className={styles.ballPath} />
      <path d={`M${decision.x} ${decision.y-5} L${decision.x+5} ${decision.y} L${decision.x} ${decision.y+5} L${decision.x-5} ${decision.y} Z`} className={styles.decision} />
      <circle cx="130" cy="218" r="3" className={styles.home} />
      {runner&&<circle cx={runner.x} cy={runner.y} r="4" fill="#85e1d5" stroke="#17392e" strokeWidth="1.5" />}
    </svg>
    <p>{text.fieldLegend}</p><p>{locale==='en'?'Cyan runner: first-base leg only; awarded bases follow the result.':'청록 주자 점은 1루 구간만 표시하며 진루 결과는 판정을 따릅니다.'}</p><small>{text.fieldModel}</small>
  </figure>
}

function recordValue(state, version) {
  if (!state) return null
  // Future pitch courses, seeds and precomputed field outcomes stay out of DOM.
  return { id:state.id, rulesVersion:state.rulesVersion, pitchPolicyVersion:state.pitchPolicyVersion,
    engineVersion:version?.engineVersion, engineRulesVersion:version?.engineRulesVersion,
    fieldModelVersion:version?.fieldModelVersion, handedness:state.handedness,
    pitcherHandedness:state.pitcherHandedness, baseSpeedKmh:state.baseSpeedKmh, pitchMode:state.pitchMode,
    balls:state.balls, strikes:state.strikes, pitchCount:state.pitchCount, status:state.status,
    outcome:state.outcome, stats:state.stats, history:state.history }
}

export default function BaseballAtBatGame({ locale='ko', dataVersions=null, storageVersions=null, embeddedCareer=null }) {
  const text = copy[locale] || copy.ko
  const embeddedGrowth = useMemo(() => {
    try { return { snapshot:captureGrowthSnapshot(embeddedCareer?.session), invalid:false } }
    catch { return { snapshot:null, invalid:true } }
  },[embeddedCareer?.session])
  const careerActive=embeddedCareer?.active!==false,careerFocused=embeddedCareer?.focused===true
  const careerActiveRef=useRef(careerActive);careerActiveRef.current=careerActive
  const [careerDetails,setCareerDetails]=useState(false),careerDialogRef=useRef(null)
  const router = useRouter()
  const { feedback:gameFeedback, prepare:prepareFeedback, begin:beginFeedback,
    advance:advanceFeedback, finish:finishFeedback, cancel:cancelFeedback } = useBaseballLiveFeedback({locale,mode:'at-bat',feedbackOverride:embeddedCareer?.feedback})
  const {intro:entranceIntro,prepare:prepareEntrance,enter:showEntrance,cancel:cancelEntrance}=useBaseballEntrance({feedback:gameFeedback,locale,enabled:!embeddedCareer})
  const cancelEntry=useCallback(()=>{cancelEntrance();embeddedCareer?.onEntranceCancel?.()},[cancelEntrance,embeddedCareer?.onEntranceCancel])
  const {trajectory,reaction,begin:beginPostplay,contact:contactPostplay,confirm:confirmPostplay,cancel:cancelPostplay}=useBaseballPostplay()
  const prefix = useId()
  const [draft,setDraft] = useState({ name:'',jerseyNumber:'7',handedness:'right',teamId:'heroes' })
  const [settings,setSettings] = useState({ pitcherHandedness:'random',baseSpeedKmh:120,pitchMode:'mixed' })
  const [player,setPlayer] = useState(embeddedCareer?.player||null)
  const [errors,setErrors] = useState({})
  const [phase,setPhase] = useState(embeddedCareer?'paused':'setup')
  const [atBat,setAtBat] = useState(embeddedCareer?.session?.state||null)
  const [archive,setArchive] = useState([])
  const [pitch,setPitch] = useState(() => createBaseballPitch({ speedKmh:120,seed:1,target:initialAim,pitcherHandedness:'right' }))
  const [pitchStartAt,setPitchStartAt] = useState(null)
  const [swingAt,setSwingAt] = useState(null)
  const [swingAim,setSwingAim] = useState(null)
  const [aim,setAim] = useState(initialAim)
  const [result,setResult] = useState(null)
  const [resultAt,setResultAt] = useState(null)
  const [fieldResult,setFieldResult] = useState(null)
  const [assetsReady,setAssetsReady] = useState(false)
  const [assetError,setAssetError] = useState('')
  const [focusEnabled,setFocusEnabled] = useState(false)
  const [logicError,setLogicError] = useState(false)
  const [versionBlocked,setVersionBlocked] = useState(embeddedGrowth.invalid)
  const [storageMode,setStorageMode] = useState(Boolean(embeddedCareer))
  const [storageState,setStorageState] = useState({entries:[],history:[],code:null,busy:false})
  const [storageOpening,setStorageOpening] = useState(false)
  const [storageNotice,setStorageNotice] = useState(false)
  const [storageReview,setStorageReview] = useState(null)
  const [developmentSample,setDevelopmentSample] = useState(false)
  const storageModeRef=useRef(Boolean(embeddedCareer)),storageClientRef=useRef(null),serverSessionRef=useRef(embeddedCareer?.session||null),storageStartingRef=useRef(false),storageAliveRef=useRef(true)
  const storageStartEpoch=useRef(0)
  const gameRef = useRef(null), roundRef = useRef(null), atBatRef = useRef(embeddedCareer?.session?.state||null), aimRef = useRef(initialAim)
  const phaseRef = useRef(embeddedCareer?'paused':'setup'), previousVersion = useRef(null), atBatVersion = useRef(null)
  const engineVersion = `${dataVersions?.engine?.hash || 'local'}:${dataVersions?.rules?.hash || BASEBALL_AT_BAT_RULES.id}`
  const versionSignature=JSON.stringify([engineVersion,storageVersions,BASEBALL_RULES,BASEBALL_PITCH_TYPES,BASEBALL_AT_BAT_RULES,BASEBALL_FIELD_MODEL,embeddedGrowth.snapshot,embeddedGrowth.invalid])
  const setGamePhase = useCallback(value => { phaseRef.current=value;setPhase(value) },[])
  const updateAtBat = useCallback(value => { atBatRef.current=value;setAtBat(value) },[])
  const onAim = useCallback(value => {
    if(!careerActiveRef.current)return
    if (roundRef.current?.swingAt !== null && roundRef.current) return
    const target={x:value.x,y:value.y};aimRef.current=target;setAim(target)
  },[])

  const pause = useCallback(({preserveEntrance=false}={}) => {
    if(storageStartingRef.current)storageStartEpoch.current++
    const round=roundRef.current
    const waitingForFreshCareer=preserveEntrance&&!round&&Boolean(embeddedCareer?.entryToken)
    if(!waitingForFreshCareer)cancelFeedback(round)
    cancelPostplay()
    if(!preserveEntrance)cancelEntry()
    if (!round || round.finished || !activePhase(phaseRef.current)) return
    round.paused=true
    setPitchStartAt(null);setSwingAt(null);setSwingAim(null);setResult(null);setResultAt(null);setFieldResult(null)
    setGamePhase('paused')
    if(storageModeRef.current&&storageClientRef.current&&round.attemptId){
      round.pausePromise=Promise.resolve(round.acceptPromise).then(()=>{
        if(round.acceptFailed)return null
        return storageClientRef.current?.command(serverSessionRef.current.id,{type:'pause',pitchId:round.pitchId,attemptId:round.attemptId})
      }).then(session=>{if(session)serverSessionRef.current=session;return session}).catch(()=>null)
    }
  },[setGamePhase,cancelFeedback,cancelPostplay,cancelEntry,embeddedCareer?.entryToken])
  useEffect(()=>{
    embeddedCareer?.onControlReady?.(embeddedCareer.session.id,{pause,focus:()=>inputCanvasFor(gameRef.current)?.focus({preventScroll:true})})
    return()=>embeddedCareer?.onControlReady?.(embeddedCareer.session.id,null)
  },[pause,embeddedCareer?.onControlReady,embeddedCareer?.session.id])
  useEffect(()=>{if(!careerActive){pause();setCareerDetails(false)}},[careerActive,pause])
  useEffect(()=>{if(careerDetails){if(phaseRef.current!=='complete')pause();careerDialogRef.current?.querySelector('button')?.focus({preventScroll:true})}},[careerDetails,pause])
  const onAssetsReady = useCallback((ready,error) => {
    setAssetsReady(ready);setAssetError(error || '')
    if (!ready) pause({preserveEntrance:true})
    else if(!embeddedGrowth.invalid&&embeddedCareer?.onEntranceReady?.(embeddedCareer.entryToken))requestAnimationFrame(()=>revealMobileInput({careerEntry:true}))
  },[pause,embeddedCareer?.onEntranceReady,embeddedCareer?.entryToken,embeddedGrowth.invalid])

  const settle = useCallback(round => {
    if (!round || round.finished) return
    if(storageModeRef.current){
      if(round.settling)return
      round.settling=true
      setGamePhase('saving')
      void (async()=>{
        try{
          const client=storageClientRef.current
          if(round.acceptPromise)await round.acceptPromise
          if(round.acceptFailed)throw new Error('Input not confirmed')
          if(round.pausePromise)await round.pausePromise
          let session=serverSessionRef.current
          const alreadyResolved=session.state.history.some(row=>row.pitchId===round.pitchId)
          if(!alreadyResolved&&!session.pending?.input){
            session=await client.command(session.id,{type:'accept-input',pitchId:round.pitchId,attemptId:round.attemptId,input:round.input||{kind:'take'}})
            serverSessionRef.current=session
          }
          if(!alreadyResolved)session=await client.command(session.id,{type:'resolve',pitchId:round.pitchId,attemptId:round.attemptId})
          if(!storageAliveRef.current||roundRef.current!==round)return
          try { captureGrowthSnapshot(session,round.growthSnapshot??null) }
          catch { setVersionBlocked(true);throw new Error('Growth checkpoint mismatch') }
          serverSessionRef.current=session
          const row=session.state.history.find(value=>value.pitchId===round.pitchId)
          if(!row)throw new Error('Current pitch receipt missing')
          round.finished=true;round.paused=false;round.settling=false
          updateAtBat(session.state);setResult(row.result);setFieldResult(row.fieldResult);setLogicError(false)
          setGamePhase(session.state.status==='complete'?'complete':'result')
          const confirmedRow=session.state.history.find(value=>value.pitchId===round.pitchId)
          if(confirmedRow&&careerActiveRef.current)confirmPostplay(round,{authority:'server',result:confirmedRow.result,fieldResult:confirmedRow.fieldResult,
            terminalOutcome:confirmedRow.terminalOutcome})
          if(confirmedRow&&careerActiveRef.current)finishFeedback(round,{authority:'server',result:confirmedRow.result,fieldResult:confirmedRow.fieldResult,
            terminalOutcome:confirmedRow.terminalOutcome,countAfter:confirmedRow.countAfter})
          embeddedCareer?.onSession?.(session)
        }catch{
          // Keep the pending journal/receipt, but an old slot no longer owns UI
          // or the parent's shared sound after a career view/slot change.
          if(!storageAliveRef.current||roundRef.current!==round)return
          cancelFeedback(round)
          cancelPostplay()
          round.settling=false;round.paused=true;setPitchStartAt(null);setGamePhase('paused')
        }
      })()
      return
    }
    try {
      const decision=round.decision || (round.swingAt!==null?judgeAtBatRoundSwing(round.pitch,{swingAtMs:round.swingAt,aim:round.swingAim,handedness:round.handedness},round.growthSnapshot??null):judgeBaseballTake(round.pitch))
      const field=round.fieldResult || (isFair(decision)?resolveBaseballFieldResult(decision):null)
      const next=resolveBaseballAtBatPitch(atBatRef.current,{pitchId:round.pitchId,pitch:round.pitch,result:decision,fieldResult:field,source:'manual'})
      finishFeedback(round,{authority:'memory',result:decision,fieldResult:field,terminalOutcome:next.outcome,
        countAfter:{balls:next.balls,strikes:next.strikes}})
      confirmPostplay(round,{authority:'memory',result:decision,fieldResult:field,terminalOutcome:next.outcome})
      round.decision=decision;round.fieldResult=field;round.finished=true;round.paused=false
      updateAtBat(next);setResult(decision);setFieldResult(field);setLogicError(false)
      setGamePhase(next.status==='complete'?'complete':'result')
    } catch {
      cancelFeedback(round)
      cancelPostplay()
      setLogicError(true);round.paused=true;setPitchStartAt(null);setGamePhase('paused')
    }
  },[setGamePhase,updateAtBat,embeddedCareer,finishFeedback,cancelFeedback,confirmPostplay,cancelPostplay])

  useEffect(() => {
    if (!activePhase(phase)) return
    let frame
    const tick=now => {
      const round=roundRef.current
      if (!round || round.finished || round.paused) return
      advanceFeedback(round,now)
      const time=now-round.startAt-BASEBALL_RULES.windupMs
      if (phaseRef.current==='windup' && time>=0) setGamePhase('flight')
      if (round.decision && !round.revealed && time >= (round.decision.contacted?round.decision.contactAtMs:round.deadline)) {
        round.revealed=true;setResult(round.decision)
        if (round.decision.contacted) {setResultAt(round.startAt+BASEBALL_RULES.windupMs+round.decision.contactAtMs);contactPostplay(round)}
      }
      if (time>=round.deadline) { settle(round);return }
      frame=requestAnimationFrame(tick)
    }
    frame=requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  },[phase,setGamePhase,settle,advanceFeedback,contactPostplay])

  const swing = useCallback((value,metadata={}) => {
    if(!careerActiveRef.current)return
    const round=roundRef.current
    if (!round || round.finished || round.paused || round.swingAt!==null || !activePhase(phaseRef.current)) return
    const time=performance.now()-round.startAt-BASEBALL_RULES.windupMs
    const lockedAim=Object.freeze({x:value.x,y:value.y})
    // Accept once before resolving, including when a later calculation fails.
    round.swingAt=time;round.swingAim=lockedAim
    aimRef.current=lockedAim;setAim(lockedAim);setSwingAim(lockedAim);setSwingAt(time)
    if(storageModeRef.current&&storageClientRef.current){
      const source=metadata.source==='keyboard'?'keyboard':metadata.source==='pointer'?(metadata.pointerType==='touch'?'touch':'mouse'):metadata.source==='button'?'button':'unknown'
      round.input={kind:'swing',swingAtMs:time,aim:lockedAim,source,surface:metadata.surface==='focus'?'focus':'field'}
      round.acceptPromise=storageClientRef.current.command(serverSessionRef.current.id,{type:'accept-input',pitchId:round.pitchId,attemptId:round.attemptId,input:round.input})
        .then(session=>{if(storageAliveRef.current&&roundRef.current===round)serverSessionRef.current=session;return session})
        .catch(()=>{round.acceptFailed=true;if(storageAliveRef.current&&roundRef.current===round)pause();return null})
    }
    try {
      const decision=judgeAtBatRoundSwing(round.pitch,{swingAtMs:time,aim:lockedAim,handedness:round.handedness},round.growthSnapshot??null)
      const field=isFair(decision)?resolveBaseballFieldResult(decision):null
      round.decision=decision;round.fieldResult=field
      advanceFeedback(round)
      round.deadline=Math.max(round.deadline,time+BASEBALL_RULES.swingDurationMs,
        field?decision.contactAtMs+field.playTimeMs:0)
    } catch { setLogicError(true);pause() }
  },[pause,advanceFeedback])

  useEffect(() => {
    try { setFocusEnabled(window.localStorage.getItem(FOCUS_PREFERENCE)==='on') } catch { /* Optional preference. */ }
  },[])
  useEffect(()=>{
    storageAliveRef.current=true
    let unsubscribe
    if(embeddedCareer){
      storageClientRef.current=embeddedCareer.client
      setStorageState(embeddedCareer.client.snapshot())
      unsubscribe=embeddedCareer.client.subscribe?.(value=>{if(storageAliveRef.current)setStorageState(value)})
      const checkpoint=embeddedCareer.latestSession||embeddedCareer.session
      applyServerSession(checkpoint,embeddedCareer.player,{restored:checkpoint.state.pitchCount>0||Boolean(checkpoint.pending),preserveEntrance:Boolean(embeddedCareer.entryToken)})
    }
    if(storageModeRef.current&&!storageClientRef.current)setStorageState(old=>({...old,busy:false,code:'client_reconnect_required'}))
    return ()=>{storageAliveRef.current=false;unsubscribe?.();if(!embeddedCareer)storageClientRef.current?.close();storageClientRef.current=null}
    // Each embedded slot mounts with its own key/client; regular D owns its client.
  },[embeddedCareer?.client])
  useEffect(() => {
    const old=previousVersion.current;previousVersion.current=versionSignature
    if (old!==null && old!==versionSignature && atBatRef.current) { pause();setVersionBlocked(true) }
  },[versionSignature,pause])
  useEffect(() => {
    const hidden=()=>{if(document.hidden)pause()},blur=()=>pause(),menu=()=>pause()
    window.addEventListener('blur',blur);window.addEventListener('nextport:playground-menu-open',menu)
    document.addEventListener('visibilitychange',hidden)
    const route=()=>pause();router.events.on('routeChangeStart',route)
    return () => {
      window.removeEventListener('blur',blur);window.removeEventListener('nextport:playground-menu-open',menu)
      document.removeEventListener('visibilitychange',hidden);router.events.off('routeChangeStart',route)
      // The career parent owns its shared audio lifetime. An old child's cleanup
      // must not stop the newly prepared entrance for the next manual slot.
      if(!embeddedCareer)cancelFeedback(roundRef.current)
    }
  },[pause,router.events,cancelFeedback])

  function revealMobileInput(options) {
    if(embeddedCareer?.focused||!careerActiveRef.current)return
    const careerEntry=options?.careerEntry===true
    if (!careerEntry&&!window.matchMedia('(max-width:1000px)').matches) return
    const game=gameRef.current,scroller=careerEntry?game?.closest('[data-baseball-career]'):game
    const canvas=inputCanvasFor(game),actions=game?.querySelector('[data-baseball-field-actions]')
    if (!scroller || !canvas) return
    const frame=scroller.getBoundingClientRect(),input=canvas.getBoundingClientRect(),bottom=actions?.getBoundingClientRect().bottom ?? input.bottom
    const delta=bottom-frame.bottom+12
    if (delta>0) scroller.scrollBy({top:delta,behavior:'auto'})
    else if(input.top<frame.top+10) scroller.scrollBy({top:input.top-frame.top-10,behavior:'auto'})
  }
  function preserveScrollRoom() {
    if(embeddedCareer?.focused)return
    if (!window.matchMedia('(max-width:1000px)').matches) return
    const scroller=gameRef.current,layout=scroller?.querySelector('[data-baseball-at-bat-layout]')
    if (!scroller || !layout) return
    const top=layout.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop
    const padding=Number.parseFloat(window.getComputedStyle(scroller).paddingBottom)||0
    scroller.style.setProperty('--pa-mobile-flow-floor',`${Math.max(0,Math.ceil(scroller.clientHeight+scroller.scrollTop-top-padding))}px`)
  }
  function clearPresentation({preserveEntrance=false}={}) {
    if(!preserveEntrance)cancelEntry()
    if(!preserveEntrance)cancelFeedback(roundRef.current)
    cancelPostplay()
    roundRef.current=null;setPitchStartAt(null);setSwingAt(null);setSwingAim(null);setResult(null);setResultAt(null);setFieldResult(null)
    aimRef.current=initialAim;setAim(initialAim);setLogicError(false)
  }
  async function chooseStorage(enabled){
    if(phaseRef.current!=='setup'||storageOpening)return
    storageModeRef.current=enabled;setStorageMode(enabled);setStorageNotice(false);setStorageReview(null)
    if(!enabled){storageClientRef.current?.close();storageClientRef.current=null;serverSessionRef.current=null;return}
    if(process.env.NODE_ENV==='development'){
      storageClientRef.current?.close();storageClientRef.current=null
      setStorageOpening(true)
      try{
        const storage=await import('@/lib/playground-baseball-at-bat-client.mjs')
        const client=await storage.openBaseballAtBatClient({transport:storage.createDefaultBaseballAtBatTransport(),onChange:value=>{
          if(storageAliveRef.current&&storageModeRef.current)setStorageState(value)
        }})
        if(!storageAliveRef.current||!storageModeRef.current){client.close();return}
        storageClientRef.current=client
        await client.refresh()
      }catch(cause){if(storageAliveRef.current)setStorageState(old=>({...old,code:cause.code||'storage_unavailable',busy:false}))}
      finally{if(storageAliveRef.current)setStorageOpening(false)}
    }
  }
  function applyServerSession(session,visualPlayer,{restored=false,preserveEntrance=false}={}){
    let growthSnapshot
    try { growthSnapshot=captureGrowthSnapshot(session,embeddedGrowth.snapshot) }
    catch { clearPresentation();setVersionBlocked(true);setLogicError(true);setGamePhase('paused');return }
    serverSessionRef.current=session
    const display={...(visualPlayer||player||draft),handedness:session.config.handedness}
    const checked=validateBaseballPlayer(display)
    const nextPlayer=checked.valid?checked.player:{name:text.storageUnknownPlayer,jerseyNumber:'7',teamId:'heroes',handedness:session.config.handedness}
    setPlayer(nextPlayer);setDraft(nextPlayer)
    setSettings({pitcherHandedness:session.config.pitcherHandedness,baseSpeedKmh:session.config.baseSpeedKmh,pitchMode:session.config.pitchMode})
    updateAtBat(session.state);clearPresentation({preserveEntrance})
    embeddedCareer?.onSession?.(session)
    atBatVersion.current={engineVersion:`${session.versions.engineHash}:${session.versions.rulesHash}`,engineRulesVersion:dataVersions?.rules?.id||'local',fieldModelVersion:session.versions.fieldModelId}
    const incompatible=storageVersions?Object.keys(storageVersions).some(key=>session.versions[key]!==storageVersions[key]):Boolean(dataVersions&&(session.versions.engineHash!==dataVersions.engine.hash||session.versions.rulesHash!==dataVersions.rules.hash))
    setVersionBlocked(incompatible);setStorageNotice(restored)
    const pending=session.pending,last=session.state.history.at(-1)
    if(incompatible){
      if(last){setPitch(last.pitch);setResult(last.result);setFieldResult(last.fieldResult)}
      setGamePhase('paused');return
    }
    if(pending){
      setPitch(pending.pitch)
      const input=pending.input,decision=input?(input.kind==='take'?judgeBaseballTake(pending.pitch):judgeAtBatRoundSwing(pending.pitch,{swingAtMs:input.swingAtMs,aim:input.aim,handedness:session.config.handedness},growthSnapshot)):null
      roundRef.current={...pending,handedness:session.config.handedness,startAt:0,finished:false,paused:true,
        growthSnapshot,
        swingAt:input?.kind==='swing'?input.swingAtMs:null,swingAim:input?.kind==='swing'?input.aim:null,input,decision,fieldResult:isFair(decision)?resolveBaseballFieldResult(decision):null,
        deadline:pending.pitch.flightTimeMs+BASEBALL_RULES.resolveAfterMs,acceptedInput:Boolean(input)}
      setGamePhase('paused')
    }else if(session.state.status==='complete'){
      if(last){setPitch(last.pitch);setResult(last.result);setFieldResult(last.fieldResult)}
      setGamePhase('complete')
    }else{
      setPitch(createBaseballPitch({speedKmh:session.config.baseSpeedKmh,seed:1,target:initialAim,pitcherHandedness:session.config.pitcherHandedness}))
      setGamePhase('ready')
    }
  }
  async function restoreStorage(id,{retry=false}={}){
    const client=storageClientRef.current
    if(!client||storageStartingRef.current||activePhase(phaseRef.current))return
    cancelEntry()
    storageStartingRef.current=true
    try{
      let session,visualPlayer=client.snapshot().entries.find(entry=>entry.id===id)?.player
      if(retry)session=await client.retry(id)
      else{
        const read=await client.read(id,{name:draft.name||text.storageUnknownPlayer,jerseyNumber:draft.jerseyNumber||'7',teamId:draft.teamId,handedness:draft.handedness})
        session=read.session;visualPlayer=read.player
        if(!storageAliveRef.current)return
        if(read.pending){setStorageReview({id,session});applyServerSession(session,visualPlayer,{restored:true});return}
      }
      if(!storageAliveRef.current)return
      if(session.pending&&!session.pending.input&&session.pending.status==='issued')session=await client.command(session.id,{type:'pause',pitchId:session.pending.pitchId,attemptId:session.pending.attemptId,reason:'restore'})
      setStorageReview(null)
      applyServerSession(session,visualPlayer,{restored:true})
      requestAnimationFrame(revealMobileInput)
    }catch{/* The journal publishes a safe error code and preserves the intent. */}
    finally{storageStartingRef.current=false}
  }
  async function adoptServerState(id){
    if(!storageClientRef.current||storageStartingRef.current)return
    cancelEntry()
    storageStartingRef.current=true
    try{
      const session=await storageClientRef.current.adoptLatest(id)
      if(!storageAliveRef.current)return
      const visualPlayer=storageClientRef.current.snapshot().entries.find(entry=>entry.id===id)?.player
      setStorageReview(null);applyServerSession(session,visualPlayer,{restored:true})
    }catch{/* Keep both the input and the server checkpoint if archival fails. */}
    finally{storageStartingRef.current=false}
  }
  async function prepareServerAtBat(validPlayer,entranceToken){
    const client=storageClientRef.current
    if(!client||storageStartingRef.current)return
    storageStartingRef.current=true
    try{
      const config={handedness:validPlayer.handedness,pitcherHandedness:settings.pitcherHandedness==='random'?(seedFor()%2?'left':'right'):settings.pitcherHandedness,baseSpeedKmh:settings.baseSpeedKmh,pitchMode:settings.pitchMode}
      const session=await client.create(config,validPlayer,{source:developmentSample?'development':'manual'})
      if(!storageAliveRef.current)return
      if(atBatRef.current)setArchive(items=>[...items,recordValue(atBatRef.current,atBatVersion.current)])
      applyServerSession(session,validPlayer,{preserveEntrance:true})
      showEntrance(entranceToken,validPlayer)
      requestAnimationFrame(revealMobileInput)
    }catch{cancelEntrance()/* Pending create remains recoverable with the same command ID. */}
    finally{storageStartingRef.current=false}
  }
  function prepareAtBat(validPlayer) {
    if(storageModeRef.current){
      if(!storageClientRef.current||storageStartingRef.current)return
      cancelFeedback(roundRef.current);cancelPostplay()
      const token=prepareEntrance();void prepareServerAtBat(validPlayer,token);return
    }
    preserveScrollRoom()
    const previous=atBatRef.current
    if(previous) setArchive(items=>[...items,recordValue(previous,atBatVersion.current)])
    const seed=seedFor(),pitcherHandedness=settings.pitcherHandedness==='random'?(seed%2?'left':'right'):settings.pitcherHandedness
    const id=window.crypto?.randomUUID?.() || `local-${Date.now()}-${seed}`
    const next=createBaseballAtBat({id,handedness:validPlayer.handedness,pitcherHandedness,baseSpeedKmh:settings.baseSpeedKmh,pitchMode:settings.pitchMode,seed})
    updateAtBat(next);atBatVersion.current={engineVersion,engineRulesVersion:dataVersions?.rules?.id||'local',fieldModelVersion:BASEBALL_FIELD_MODEL.version};clearPresentation();setVersionBlocked(false);setGamePhase('ready')
    setPitch(createBaseballPitch({speedKmh:settings.baseSpeedKmh,seed:1,target:initialAim,pitcherHandedness}))
    const token=prepareEntrance();showEntrance(token,validPlayer)
    requestAnimationFrame(revealMobileInput)
  }
  function enter(event) {
    event.preventDefault()
    const checked=validateBaseballPlayer(draft)
    if(!checked.valid){setErrors(checked.errors);return}
    if(!assetsReady)return
    setPlayer(checked.player);setErrors({});prepareAtBat(checked.player)
  }
  async function startPitch() {
    if(!careerActiveRef.current||careerDetails)return
    if(!player || !assetsReady || versionBlocked || !['ready','result'].includes(phaseRef.current))return
    cancelEntry()
    if(storageModeRef.current){
      if(storageStartingRef.current||!storageClientRef.current)return
      prepareFeedback()
      // Move focus within the game before saving disables the clicked button.
      // A genuine window/menu/route departure still invalidates the launch epoch.
      inputCanvasFor(gameRef.current)?.focus({preventScroll:true})
      storageStartingRef.current=true
      const epoch=storageStartEpoch.current
      try{
        const session=await storageClientRef.current.command(serverSessionRef.current.id,{type:'issue'})
        if(!storageAliveRef.current)return
        let growthSnapshot
        try { growthSnapshot=captureGrowthSnapshot(session,embeddedGrowth.snapshot) }
        catch { clearPresentation();setVersionBlocked(true);setLogicError(true);setGamePhase('paused');return }
        serverSessionRef.current=session
        if(epoch!==storageStartEpoch.current||document.hidden||!['ready','result'].includes(phaseRef.current)
          ||session.revision!==storageClientRef.current.snapshot().lastReceipt?.revision||!session.pending||session.pending.input!==null){
          applyServerSession(session,player,{restored:true});return
        }
        const pending=session.pending,startAt=performance.now()
        setStorageNotice(false)
        preserveScrollRoom()
        roundRef.current={...pending,startAt,swingAt:null,swingAim:null,input:null,decision:null,fieldResult:null,revealed:false,finished:false,paused:false,
          growthSnapshot,
          handedness:player.handedness,deadline:pending.pitch.flightTimeMs+BASEBALL_RULES.resolveAfterMs}
        beginFeedback(roundRef.current,{scopeId:session.id,pitchId:pending.pitchId,attemptId:pending.attemptId})
        beginPostplay(roundRef.current)
        setPitch(pending.pitch);setPitchStartAt(startAt);setSwingAt(null);setSwingAim(null);setResult(null);setResultAt(null);setFieldResult(null);setLogicError(false);setGamePhase('windup')
        inputCanvasFor(gameRef.current)?.focus({preventScroll:true});requestAnimationFrame(revealMobileInput)
      }catch{/* Do not start a local substitute for an unconfirmed server pitch. */}
      finally{storageStartingRef.current=false}
      return
    }
    prepareFeedback()
    const previous=roundRef.current
    const issued=previous && !previous.finished ? previous : nextBaseballAtBatPitch(atBatRef.current)
    if(!issued)return
    preserveScrollRoom()
    const startAt=performance.now()
    roundRef.current={...issued,startAt,swingAt:null,decision:null,fieldResult:null,revealed:false,finished:false,paused:false,
      handedness:player.handedness,deadline:issued.pitch.flightTimeMs+BASEBALL_RULES.resolveAfterMs}
    beginFeedback(roundRef.current,{scopeId:atBatRef.current.id,pitchId:issued.pitchId,attemptId:issued.attemptId})
    beginPostplay(roundRef.current)
    setPitch(issued.pitch);setPitchStartAt(startAt);setSwingAt(null);setSwingAim(null);setResult(null);setResultAt(null);setFieldResult(null);setLogicError(false);setGamePhase('windup')
    inputCanvasFor(gameRef.current)?.focus({preventScroll:true});requestAnimationFrame(revealMobileInput)
  }
  function resume() {
    if(!careerActiveRef.current||careerDetails)return
    const round=roundRef.current
    if(!round || versionBlocked)return
    if(storageModeRef.current){
      const pending=storageClientRef.current?.snapshot().entries.find(entry=>entry.id===serverSessionRef.current?.id)?.pending
      if(pending){void restoreStorage(serverSessionRef.current.id,{retry:true});return}
      if(serverSessionRef.current?.pending?.input||round.input){round.acceptFailed=false;round.acceptPromise=null;settle(round)}
      else{round.paused=false;setGamePhase('ready')}
      return
    }
    if(round.swingAt!==null) {
      // Restore the already accepted input, never offer a second swing.
      const end=Math.max(round.deadline,round.pitch.flightTimeMs)
      const restoredStart=performance.now()-BASEBALL_RULES.windupMs-end
      round.startAt=restoredStart;setPitchStartAt(restoredStart);setSwingAt(round.swingAt);setSwingAim(round.swingAim)
      setResultAt(round.decision?.contacted?restoredStart+BASEBALL_RULES.windupMs+round.decision.contactAtMs:null)
      settle(round)
    } else {
      round.paused=false;setGamePhase('ready')
    }
  }
  function changePlayer() {
    cancelEntry()
    const previous=atBatRef.current
    if(previous)setArchive(items=>[...items,recordValue(previous,atBatVersion.current)])
    updateAtBat(null);setPlayer(null);clearPresentation();setVersionBlocked(false);setGamePhase('setup')
    serverSessionRef.current=null;setStorageNotice(false)
    gameRef.current?.style.removeProperty('--pa-mobile-flow-floor')
  }
  function updateDraft(field,value) {
    setDraft(old=>({...old,[field]:value}));setErrors(old=>revalidateBaseballPlayerField(old,{...draft,[field]:value},field))
    if((field==='handedness'||field==='teamId')&&draft[field]!==value)setAssetsReady(false)
  }
  function toggleFocus() {
    pause();const enabled=!focusEnabled;setFocusEnabled(enabled)
    try{window.localStorage.setItem(FOCUS_PREFERENCE,enabled?'on':'off')}catch{/* Optional preference. */}
  }
  function keyDown(event) {if(careerActiveRef.current&&!careerDetails)handleBaseballCanvasKeyDown(event,{aim:aimRef.current,onAim,onSwing:swing,onPause:pause})}
  function closeCareerDetails() {setCareerDetails(false);requestAnimationFrame(()=>inputCanvasFor(gameRef.current)?.focus({preventScroll:true}))}

  const displayPlayer=player||draft,team=getBaseballTeam(displayPlayer.teamId),playing=activePhase(phase),settled=phase==='result'||phase==='complete'
  const displayedGrowth=versionBlocked?null:roundRef.current?.growthSnapshot??embeddedGrowth.snapshot
  const growthLabel=displayedGrowth?(locale==='en'
    ? `Ball-center allowance ${(displayedGrowth.contactRadiusM*100).toFixed(3)}cm · Power ×${displayedGrowth.powerMultiplier.toFixed(3)} · Physical bat unchanged`
    : `공 중심 허용 거리 ${(displayedGrowth.contactRadiusM*100).toFixed(3)}cm · 파워 ×${displayedGrowth.powerMultiplier.toFixed(3)} · 실제 배트 크기 유지`):null
  const last=atBat?.history.at(-1),balls=atBat?.balls||0,strikes=atBat?.strikes||0
  const status=phase==='saving'?text.storageSaving:phase==='windup'?text.windup:phase==='flight'?(result&&isFair(result)?text.fieldPlay:swingAt!==null?text.swinging:text.flight):phase==='paused'?text.paused:phase==='complete'?text.complete:text.ready
  const feedback=getBaseballPlayerFeedback(errors,text)
  const hasPausedInput=phase==='paused'&&Boolean(roundRef.current)&&(roundRef.current.swingAt!==null||roundRef.current.acceptedInput||roundRef.current.input)
  const kind=versionBlocked?'new-version':playing?'swing':phase==='paused'?'resume':phase==='complete'?'new-at-bat':phase==='ready'?'begin':'next'
  const action=versionBlocked?()=>prepareAtBat(player):playing?()=>{inputCanvasFor(gameRef.current)?.focus({preventScroll:true});swing(aimRef.current,{source:'button',surface:'field'})}:phase==='paused'?resume:phase==='complete'?()=>prepareAtBat(player):startPitch
  const actionText=versionBlocked?text.newAtBat:playing?text.swing:phase==='paused'?(hasPausedInput?text.confirmSwing:text.resume):phase==='complete'?text.newAtBat:phase==='ready'?text.begin:text.next
  const storagePending=storageState.entries.find(entry=>entry.id===serverSessionRef.current?.id)?.pending
  const storageBlocked=storageMode&&!playing&&(storageOpening||storageState.busy||phase==='saving'||Boolean(storagePending)||Boolean(storageState.code&&!versionBlocked)||Boolean(embeddedCareer&&versionBlocked))
  const primary=<ActionButton key={kind} kind={kind} className={playing?styles.secondary:styles.primary} onAction={action} disabled={!assetsReady||(playing&&swingAt!==null)||storageBlocked}>{phase==='saving'?text.storageSaving:actionText}<span aria-hidden="true">→</span></ActionButton>
  const fieldActions=phase!=='setup'?<div className={styles.fieldActions} data-baseball-field-actions><div><strong>{settled&&result?text.outcomes[atBat?.outcome||result.outcome]:status}</strong><span>{countLabel({balls,strikes})} · {text.committed} {atBat?.pitchCount||0}</span></div>{careerFocused&&phase==='complete'?<button type='button' className={styles.primary} onClick={()=>setCareerDetails(true)}>{locale==='en'?'View appearance review':'타석 결산 보기'}</button>:!(embeddedCareer&&phase==='complete')&&primary}</div>:null
  const recordJson=useMemo(()=>JSON.stringify({storage:storageMode?'development-db':'memory',mode:'at-bat-practice',trust:storageMode?'server-recalculated-input-unverified':'local-unverified',current:recordValue(atBat,atBatVersion.current),previous:archive},null,2),[atBat,archive,storageMode])
  const scenePhase=settled&&fieldResult?'paused':phase
  const savedRows=[...new Map([...storageState.history.map(row=>[row.id,row]),...storageState.entries.map(entry=>{
    const summary=storageState.history.find(row=>row.id===entry.id)
    return [entry.id,{...(summary?.revision>(entry.checkpoint?.revision||0)?summary:entry.checkpoint),id:entry.id,entry}]
  })]).values()]
    .sort((a,b)=>Number(Boolean(b.entry?.pending))-Number(Boolean(a.entry?.pending))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,20)
  const storageMessage=['revision_conflict','command_conflict','local_conflict'].includes(storageState.code)?text.storageConflict
    :storageState.code==='client_reconnect_required'?(locale==='en'?'Development code changed. Select Change player, then select Development DB again. Browser-retained records remain.':'개발 코드가 갱신됐습니다. 선수 변경 후 개발 DB 저장을 다시 선택해 주세요. 브라우저에 보관된 기록은 유지됩니다.')
    :['storage_unavailable','storage_full','local_capacity','local_data_invalid'].includes(storageState.code)?text.storageLocalFailed
      :storageState.code==='storage_capacity'?(locale==='en'?'The server storage limit was reached. Your pending input and the previous checkpoint remain. Further play is paused.':'서버 저장 한도에 도달했습니다. 대기 입력과 기존 기록은 유지하며 승부를 멈췄습니다.')
        :['not_configured','database_unavailable','owner_required'].includes(storageState.code)?text.storageUnavailable:text.storageError

  return <section ref={gameRef} className={`${styles.game}${embeddedCareer?` ${styles.embedded}`:''}${careerFocused?` ${styles.careerFocused}`:''}`} data-baseball-at-bat data-phase={phase} data-focus-enabled={focusEnabled} data-career-active={careerActive}
    onKeyDown={keyDown} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))pause()}}>
    {!embeddedCareer&&<><header className={styles.heading}><div><p className={styles.kicker}>{text.kicker}</p><h1>{text.title}</h1></div><nav aria-label={text.practice} data-career-navigation={process.env.NODE_ENV==='development'}><Link href="/playground/baseball" prefetch={false}>{text.ten}</Link>{process.env.NODE_ENV==='development'&&<Link href="/playground/baseball/career" prefetch={false}>{locale==='en'?'Grow a batter':'선수 육성'}</Link>}<Link href="/playground" prefetch={false}>← {text.back}</Link></nav></header><p className={styles.intro}>{text.intro}</p></>}
    {process.env.NODE_ENV==='development'&&!embeddedCareer&&<section className={styles.storage} aria-label={text.storageTitle}>
      <div className={styles.storageTools}><strong>{text.storageTitle}</strong><div className={styles.segment}><button type="button" aria-pressed={!storageMode} disabled={phase!=='setup'||storageOpening||storageState.busy} onClick={()=>void chooseStorage(false)}>{text.memoryMode}</button><button type="button" aria-pressed={storageMode} disabled={phase!=='setup'||storageOpening||storageState.busy} onClick={()=>void chooseStorage(true)}>{text.storedMode}</button></div></div>
      {phase!=='setup'&&<p>{text.storageSwitch}</p>}
      {storageMode&&<>
        <label className={styles.sampleChoice}><input type="checkbox" checked={developmentSample} disabled={phase!=='setup'} onChange={event=>setDevelopmentSample(event.target.checked)} />{locale==='en'?'Classify as a development test':'개발 검수로 분류'}</label>
        <p role="status">{storageOpening||storageState.busy?text.storageLoading:storageState.code?storageMessage:text.storageReady}</p>
        <p>{text.storageNote}</p>
        <button type="button" disabled={storageOpening||storageState.busy||playing||phase==='saving'} onClick={()=>void (storageClientRef.current?storageClientRef.current.refresh().catch(()=>{}):chooseStorage(true))}>{text.storageRefresh}</button>
        {!savedRows.length&&!storageOpening&&!storageState.code&&<p>{text.storageEmpty}</p>}
        {savedRows.length>0&&<ul className={styles.savedList}>{savedRows.map((row,index)=><li key={row.id}><span>{row.entry?.player?.name||(locale==='en'?`Saved at-bat ${index+1}`:`저장 타석 ${index+1}`)} · {row.state?.pitchCount??row.pitchCount??0}{locale==='en'?' pitches':'구'} · {(row.state?.status||row.status)==='complete'?text.completed:text.interrupted}</span><div>{row.entry?.pending?<><button type="button" disabled={storageState.busy||playing||phase==='saving'} onClick={()=>void restoreStorage(row.id,{retry:true})}>{text.storageRetry}</button><button type="button" disabled={storageState.busy||playing||phase==='saving'} onClick={()=>void restoreStorage(row.id)}>{text.storageRead}</button></>:<button type="button" disabled={storageState.busy||playing||phase==='saving'} onClick={()=>void restoreStorage(row.id)}>{text.storageResume}</button>}</div></li>)}</ul>}
        {storageReview&&<div className={styles.storageReview}><p>{text.storageConflict}</p><p>{locale==='en'?'Continuing keeps your old pending command in a separate local conflict record and uses the server count.':'계속하면 기존 대기 명령은 별도 로컬 충돌 이력에 보존하고 서버의 카운트로 이어갑니다.'}</p><button type="button" disabled={storageState.busy||storageReview.session.revision<=(storageState.entries.find(entry=>entry.id===storageReview.id)?.pending?.body.expectedRevision||0)} onClick={()=>void adoptServerState(storageReview.id)}>{locale==='en'?'Continue with the current server record':'최신 서버 기록으로 계속'}</button></div>}
      </>}
    </section>}
    <div className={styles.layout} data-baseball-at-bat-layout>
      <div className={styles.fieldColumn} inert={careerFocused&&careerDetails?'':undefined} aria-hidden={careerFocused&&careerDetails?true:undefined}>
        <div className={styles.hud}>
          <div className={styles.player}><span style={{background:team.helmet}}>#{displayPlayer.jerseyNumber||'7'}</span><div><strong>{displayPlayer.name||(locale==='en'?'Your batter':'나만의 타자')}</strong><small>{team.name} · {displayPlayer.handedness==='left'?text.left:text.right}</small></div></div>
          <CountReadout balls={balls} strikes={strikes} label={text.count} locale={locale} />
          <div className={styles.pitchCount}><small>{text.committed}</small><strong>{atBat?.pitchCount||0}</strong>{playing&&<span>{text.current} {(atBat?.pitchCount||0)+1}</span>}</div>
        </div>
        <div className={careerFocused?styles.careerToolbar:undefined}>
        <div className={styles.viewOptions}><span title={growthLabel||undefined}>{text.pitcherFixed} · {pitch.pitcherHandedness==='left'?text.leftPitcher:text.rightPitcher} · {playing?`${text.pitches[pitch.type]} ${pitch.speedKmh} km/h`:settings.pitchMode==='mixed'?text.mixed:text.pitches[settings.pitchMode]}{growthLabel?` · ${growthLabel}`:''}</span><button type="button" aria-pressed={focusEnabled} aria-controls="baseball-batting-close-up" aria-label={`${text.focus} ${focusEnabled?'ON':'OFF'}`} onClick={toggleFocus}>{careerFocused&&locale==='en'?'Close-up':text.focus} <strong>{focusEnabled?'ON':'OFF'}</strong></button></div>
        <BaseballFeedbackPanel locale={locale} feedback={gameFeedback} onOpen={pause} />
        {careerFocused&&<button type='button' className={styles.careerDetailsButton} aria-label={locale==='en'?'Status & records':'상태·기록'} onClick={()=>setCareerDetails(true)}>{locale==='en'?'Details':'상태·기록'}</button>}
        </div>
        <BaseballScene mainClassName={styles.field} fieldActions={fieldActions} focusEnabled={focusEnabled} pitch={pitch} pitchStartAt={pitchStartAt} swingAt={swingAt} swingAim={swingAim} aim={aim} result={storageMode&&storageNotice&&settled?null:result} resultAt={resultAt} phase={scenePhase} handedness={displayPlayer.handedness} team={team} jerseyNumber={displayPlayer.jerseyNumber||'7'} locale={locale} onAim={onAim} onSwing={swing} onAssetsReady={onAssetsReady}
          renderEnabled={careerActive} observationEnabled={!careerFocused} growthContactRadiusM={displayedGrowth?.contactRadiusM??null}
          fieldTrajectory={trajectory} postplayReaction={reaction} enablePostplay={phase!=='setup'}
          feedbackStrength={gameFeedback.settings.strength} feedbackOverlay={<BaseballFeedbackOverlay locale={locale} effect={gameFeedback.lastEvent} strength={gameFeedback.settings.strength} />} entranceOverlay={<BaseballEntranceOverlay intro={embeddedCareer?embeddedCareer.entranceIntro:entranceIntro} locale={locale} strength={gameFeedback.settings.strength} />} focusEntranceOverlay={<BaseballEntranceOverlay intro={embeddedCareer?embeddedCareer.entranceIntro:entranceIntro} locale={locale} strength={gameFeedback.settings.strength} compact />} />
        <div className={styles.status} role="status"><span>{status}</span>{playing&&<button type="button" onClick={pause}>{text.pause}</button>}</div>
        <p className={styles.controls}>{text.controls}</p>
        {!careerFocused&&fieldResult&&settled&&<FieldMap value={fieldResult} text={text} locale={locale} />}
        <p className={styles.local}>{embeddedCareer?(locale==='en'?'Career practice · pitch results are confirmed by the server. The season advances from its receipt.':'선수 육성 연습 · 투구 결과는 서버에서 확정하며 시즌 진행은 그 영수증을 기준으로 반영합니다.'):storageMode?text.storageNote:text.local}</p>
        {process.env.NODE_ENV==='development'&&<details className={styles.data}><summary>{text.data}</summary><pre data-baseball-at-bat-records>{recordJson}</pre></details>}
      </div>
      <aside ref={careerDialogRef} className={`${styles.panel}${careerFocused?` ${styles.careerDialog}`:''}`} hidden={careerFocused&&!careerDetails} role={careerFocused?'dialog':undefined} aria-modal={careerFocused?true:undefined} aria-label={text.practice} onKeyDown={event=>{
        if(!careerFocused)return
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeCareerDetails();return}
        if(event.key==='Tab'){
          const nodes=[...event.currentTarget.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary')].filter(node=>node.getClientRects().length)
          const first=nodes[0],last=nodes.at(-1)
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
        }
      }}>
        {careerFocused&&<button type='button' className={styles.secondary} onClick={closeCareerDetails}>{locale==='en'?'Back to field':'경기장으로'}</button>}
        {growthLabel&&<p className={styles.explanation} data-baseball-growth-guide>{growthLabel}. {locale==='en'?'The green outline shows where the ball center is allowed to make contact.':'초록 외곽선은 접촉으로 인정하는 공 중심 범위입니다.'}</p>}
        {phase==='setup'?<form onSubmit={enter} noValidate>
          <p className={styles.kicker}>01 / YOUR BATTER</p><h2>{text.setup}</h2>
          <div className={styles.nameGrid}><label htmlFor={`${prefix}-name`}>{text.name}<input id={`${prefix}-name`} name="at-bat-player-name" autoComplete="off" maxLength={32} value={draft.name} onChange={e=>updateDraft('name',e.target.value)} aria-invalid={feedback.name.invalid} aria-describedby={feedback.name.describedBy} /></label><label htmlFor={`${prefix}-number`}>{text.number}<input id={`${prefix}-number`} name="at-bat-jersey-number" inputMode="numeric" maxLength={2} value={draft.jerseyNumber} onChange={e=>updateDraft('jerseyNumber',e.target.value)} aria-invalid={feedback.jerseyNumber.invalid} aria-describedby={feedback.jerseyNumber.describedBy} /></label></div>
          <p id={feedback.numberHint} className={styles.hint}>{text.numberHint}</p>
          <fieldset aria-invalid={feedback.handedness.invalid} aria-describedby={feedback.handedness.describedBy}><legend>{text.hand}</legend><div className={styles.segment}><button type="button" aria-pressed={draft.handedness==='right'} onClick={()=>updateDraft('handedness','right')}>{text.right}</button><button type="button" aria-pressed={draft.handedness==='left'} onClick={()=>updateDraft('handedness','left')}>{text.left}</button></div></fieldset>
          <label htmlFor={`${prefix}-team`}>{text.team}<select id={`${prefix}-team`} value={draft.teamId} onChange={e=>updateDraft('teamId',e.target.value)} aria-invalid={feedback.teamId.invalid} aria-describedby={feedback.teamId.describedBy}>{BASEBALL_TEAMS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label htmlFor={`${prefix}-pitcher`}>{text.pitcher}<select id={`${prefix}-pitcher`} value={settings.pitcherHandedness} onChange={e=>setSettings(old=>({...old,pitcherHandedness:e.target.value}))}><option value="random">{text.random}</option><option value="right">{text.rightPitcher}</option><option value="left">{text.leftPitcher}</option></select></label>
          <label htmlFor={`${prefix}-mode`}>{text.pitchMode}<select id={`${prefix}-mode`} value={settings.pitchMode} onChange={e=>setSettings(old=>({...old,pitchMode:e.target.value}))}><option value="mixed">{text.mixed}</option>{BASEBALL_PITCH_TYPES.map(type=><option key={type.id} value={type.id}>{text.pitches[type.id]}</option>)}</select></label>
          <label htmlFor={`${prefix}-speed`}>{text.baseSpeed}<select id={`${prefix}-speed`} value={settings.baseSpeedKmh} onChange={e=>setSettings(old=>({...old,baseSpeedKmh:Number(e.target.value)}))}>{[80,100,120,140,150,160].map(value=><option key={value} value={value}>{value} km/h</option>)}</select></label>
          {feedback.messages.length>0&&<div role="alert">{feedback.messages.map(message=><p key={message.id} id={message.id} className={styles.error}>{message.text}</p>)}</div>}
          {assetError&&<p className={styles.error} role="alert">{text.loadFailed}</p>}
          <button type="submit" className={styles.primary} disabled={!assetsReady||storageMode&&(storageOpening||storageState.busy||Boolean(storageState.code)||!storageClientRef.current)}>{assetsReady?text.enter:text.loading}<span aria-hidden="true">→</span></button>
        </form>:<>
          <p className={styles.kicker}>{text.practice}</p><h2>{phase==='complete'?text.final:phase==='paused'?text.paused:text.result}</h2>
          {versionBlocked&&<p className={styles.error} role="alert">{text.versionChanged}</p>}
          {logicError&&<p className={styles.error} role="alert">{text.error}</p>}
          {storageMode&&storageState.code&&<p className={styles.error} role="alert">{storageMessage}</p>}
          {storageMode&&storageNotice&&<p className={styles.hint}>{text.storageRestoreHint}</p>}
          {embeddedCareer&&storagePending&&<div className={styles.storageReview}><p>{text.storagePending}</p><button type="button" className={styles.secondary} disabled={storageState.busy} onClick={()=>void restoreStorage(serverSessionRef.current.id,{retry:true})}>{text.storageRetry}</button><button type="button" className={styles.secondary} disabled={storageState.busy} onClick={()=>void restoreStorage(serverSessionRef.current.id)}>{text.storageRead}</button></div>}
          {embeddedCareer&&storageReview&&<div className={styles.storageReview}><p>{text.storageConflict}</p><p>{locale==='en'?'The previous command is retained in a separate local conflict record.':'이전 명령은 별도 로컬 충돌 이력에 보존합니다.'}</p><button type="button" className={styles.secondary} disabled={storageState.busy||storageReview.session.revision<=(storageState.entries.find(entry=>entry.id===storageReview.id)?.pending?.body.expectedRevision||0)} onClick={()=>void adoptServerState(storageReview.id)}>{locale==='en'?'Continue with the server record':'서버 기록으로 계속'}</button></div>}
          {settled&&result?<div className={styles.result} data-outcome={atBat?.outcome||result.outcome} role="status">
            <span>{atBat?.pitchCount} / {text.pitchUnit}</span><h3>{text.outcomes[atBat?.outcome||result.outcome]}</h3>
            {last&&<p className={styles.countTransition}>{countLabel(last.countBefore)} <span aria-hidden="true">→</span> {countLabel(last.countAfter)}</p>}
            {last?.result.outcome==='foul'&&last.countBefore.strikes===2&&<p>{text.countKept}</p>}
            {fieldResult?<><p className={styles.reason}>{text.reasons[fieldResult.reasonKey]}</p><div className={styles.resultGrid}><div><small>{text.exit}</small><strong>{result.exitSpeedKmh.toFixed(0)} km/h</strong></div><div><small>{text.distance}</small><strong>{result.distanceM.toFixed(1)} m</strong></div></div></>:<div className={styles.resultGrid}><div><small>{text.timing}</small><strong>{result.timingErrorMs===null?'—':`${Math.round(Math.abs(result.timingErrorMs))} ms`}</strong><small>{result.timingErrorMs===null?text.noSwing:Math.abs(result.timingErrorMs)<1?text.accurate:result.timingErrorMs<0?text.early:text.late}</small></div><div><small>{text.gap}</small><strong>{Number.isFinite(result.barrelGapM)?result.barrelGapM>0&&result.barrelGapM<.001?'<0.1 cm':`${(result.barrelGapM*100).toFixed(1)} cm`:'—'}</strong><small>{result.activeAtPlate===false&&result.timingErrorMs!==null?text.inactive:''}</small></div></div>}
          </div>:<p className={styles.explanation}>{phase==='paused'?(hasPausedInput?text.pauseAfter:text.pauseBefore):playing?(result&&isFair(result)?text.fieldPlay:text.liveHint):text.beginHint}</p>}
          {!(embeddedCareer&&phase==='complete')&&<div className={styles.panelAction}>{primary}</div>}
          {!embeddedCareer&&!playing&&phase!=='saving'&&<button type="button" className={styles.secondary} disabled={storageMode&&storageState.busy} onClick={changePlayer}>{text.change}</button>}
          {phase==='complete'&&atBat&&<div className={styles.statistics} aria-label={text.stats}>{['PA','AB','H','BB','SO','HR'].map(key=><div key={key}><small>{key}</small><strong>{atBat.stats[key]}</strong></div>)}</div>}
          {phase==='complete'&&embeddedCareer?.summary}
          {careerFocused&&fieldResult&&settled&&<FieldMap value={fieldResult} text={text} locale={locale} />}
          <p className={styles.hint}>{text.locked}</p>
          <section className={styles.history}><h3>{text.history}</h3>{!atBat?.history.length?<p className={styles.hint}>{text.empty}</p>:<ol>{atBat.history.slice(-20).map(row=><li key={row.pitchId}><span>{row.number}</span><div><strong>{text.outcomes[row.terminalOutcome||row.result.outcome]}</strong><small>{text.pitches[row.pitch.type]} · {row.pitch.speedKmh} km/h</small></div><span>{countLabel(row.countBefore)}<br/>→ {countLabel(row.countAfter)}</span></li>)}</ol>}</section>
          <p className={styles.sessionNote}>{text.archive}: {archive.filter(value=>value.status==='complete').length+(atBat?.status==='complete'?1:0)}</p>
        </>}
      </aside>
    </div>
  </section>
}
