import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import BaseballAtBatGame from './baseball-at-bat-game'
import BaseballCareerRecovery from './baseball-career-recovery'
import { BASEBALL_CAREER_BRAND } from '@/lib/playground-baseball-brand.mjs'
import useBaseballFeedback from './use-baseball-feedback'
import useBaseballEntrance from './use-baseball-entrance'
import { BASEBALL_TEAMS, getBaseballTeam, validateBaseballPlayer } from '@/lib/playground-baseball-teams.mjs'
import { getBaseballPlayerFeedback, revalidateBaseballPlayerField } from '@/lib/playground-baseball-input.mjs'
import { BASEBALL_CAREER_RULES } from '@/lib/playground-baseball-career.mjs'
import { BASEBALL_CAREER_RULES as BASEBALL_CAREER_V2_RULES } from '@/lib/playground-baseball-career-v2.mjs'
import { createBaseballCareerView, reduceBaseballCareerView, getBaseballCareerResumeId, isBaseballCareerSessionCurrent, selectBaseballCareerCompletedAppearance } from '@/lib/playground-baseball-career-view.mjs'
import { getBaseballTrainingPreview, selectBaseballTrainingConfirmation } from '@/lib/playground-baseball-career-training-ui.mjs'
import styles from '@/styles/playground-baseball-career.module.css'

const copy={
  ko:{title:'나의 첫 세 경기.',kicker:'BATTING LAB · CAREER TRIAL',back:'한 타석 연습',intro:'한 선수를 저장하고, 준비부터 타석과 결산까지 이어갑니다. 실제 KBO 시즌과 구분한 가상 검수 일정입니다.',schedule:'3경기 · 1/4/7일 · 경기당 2타석',setup:'새 선수 만들기',name:'선수 이름',number:'등번호',numberHint:'0~99 · 07처럼 입력할 수 있어요.',hand:'타석',right:'우타',left:'좌타',team:'소속 구단',nameError:'이름을 16자 이내로 입력해 주세요.',numberError:'등번호는 0~99의 숫자로 입력해 주세요.',playerError:'선수 설정을 확인해 주세요.',speed:'포심 기준 구속',pitchMode:'투구 구성',mixed:'4구종 혼합',create:'선수 저장하고 시작',development:'개발 검수용 선수로 분류',saved:'저장한 선수',empty:'저장된 선수가 없습니다.',resume:'이어하기',refresh:'목록 새로고침',loading:'기록 확인 중',ready:'개발 DB 연결됨',error:'저장을 확인하지 못했습니다. 기존 기록과 대기 요청을 유지합니다.',conflict:'다른 탭에서 진행한 기록과 충돌했습니다. 대기 요청을 보존한 뒤 서버 기록을 확인해 주세요.',unavailable:'개발 DB에 연결할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.',retry:'대기 요청 재전송',inspect:'서버 기록 확인',adopt:'최신 서버 기록으로 계속',adoptHint:'이전 대기 요청은 별도 로컬 충돌 이력에 보존합니다.',preparation:'오늘의 준비',preparationHint:'매 경기 전 한 번 선택합니다. 성장 지표와 컨디션을 기록하며 기본 공·배트 판정에는 보너스를 더하지 않습니다.',power:'파워 훈련',discipline:'선구 훈련',stamina:'체력 훈련',rest:'회복',play:'타석을 선택하세요',manual:'직접 타격',automatic:'다음 타석 자동 진행',manualResume:'진행 중 타석 이어하기',manualHint:'클릭·터치·키보드는 기존 한 타석과 같습니다. 자동 진행은 직접 조작 자료와 구분해 보관합니다.',season:'시즌 기록',growth:'성장과 컨디션',ledger:'성장 원장',feedback:'코칭 노트',games:'경기 일정과 결산',game:'경기',day:'일',home:'홈',away:'원정',scheduled:'예정',active:'진행 중',complete:'완료',final:'세 경기의 첫걸음을 마쳤습니다.',finalHint:'이 결산은 3경기 검수 시즌입니다. 실제 144경기·다년 커리어·은퇴와 연결하지 않습니다.',newPlayer:'다른 선수 보기',localNote:'개발용 선수 저장입니다. 같은 브라우저의 쿠키와 보관 자료를 유지해야 이어할 수 있습니다. 기존 10구·단독 타석·100m 기록과 별도이며 투구는 자동 시작하지 않습니다.',condition:'컨디션',trust:'코치 신뢰',xp:'경험치',source:'진행 출처',manualSource:'직접',automaticSource:'자동',developmentSource:'개발 검수',reconnect:'개발 코드가 갱신됐습니다. 페이지를 새로고침한 뒤 저장된 선수를 다시 선택해 주세요.',pitches:{'four-seam':'포심',slider:'슬라이더',curveball:'커브',changeup:'체인지업'},outcomes:{walk:'볼넷','strikeout-looking':'루킹 삼진','strikeout-swinging':'헛스윙 삼진',single:'단타',double:'2루타',triple:'3루타','home-run':'홈런',flyout:'뜬공 아웃',lineout:'직선타 아웃',groundout:'땅볼 아웃'},feedbackKeys:{'next-opportunity':'오늘의 타석에서 다음 기회를 준비합니다.','first-hit':'첫 안타를 기록했습니다. 접촉과 결과를 함께 돌아보세요.','home-run-earned':'담장을 넘긴 타구를 기록했습니다. 같은 타이밍의 재현을 연습해 보세요.','walk-earned':'볼넷으로 출루했습니다. 스윙하지 않은 판단도 타석의 결과입니다.','strikeout-review':'삼진 기록이 있습니다. 조준점과 기준 타이밍을 복기해 보세요.','rest-advised':'컨디션이 낮습니다. 다음 경기 준비에서 회복을 고려해 보세요.','trial-complete':'세 경기 기록과 성장 원장을 바탕으로 다음 시즌을 설계할 수 있습니다.'},ledgerKinds:{preparation:'경기 준비',appearance:'타석 결과',game:'경기 결산',objective:'시즌 목표'}},
  en:{title:'My first three games.',kicker:'BATTING LAB · CAREER TRIAL',back:'At-bat practice',intro:'Save one batter and follow preparation, plate appearances and a season review. This fictional test schedule is separate from a real KBO season.',schedule:'3 games · days 1/4/7 · 2 appearances per game',setup:'Create a batter',name:'Player name',number:'Jersey number',numberHint:'0–99 · leading zero is supported.',hand:'Batting side',right:'Right',left:'Left',team:'Club',nameError:'Enter a name within 16 characters.',numberError:'Enter a jersey number from 0 to 99.',playerError:'Check the player settings.',speed:'Fastball reference speed',pitchMode:'Pitch selection',mixed:'Four-pitch mix',create:'Save player and begin',development:'Classify as a development sample',saved:'Saved players',empty:'No saved players.',resume:'Resume',refresh:'Refresh list',loading:'Checking records',ready:'Development DB connected',error:'Storage could not be confirmed. Existing records and pending requests remain.',conflict:'Another tab advanced this save. Keep the pending request and inspect the server record.',unavailable:'The development DB cannot be reached. Check the connection and retry.',retry:'Retry pending request',inspect:'Inspect server record',adopt:'Continue with the server record',adoptHint:'The old pending request stays in a separate local conflict record.',preparation:'Prepare for today',preparationHint:'Choose once before each game. Training and condition are recorded without changing the basic ball or bat judgment.',power:'Power training',discipline:'Plate discipline',stamina:'Stamina training',rest:'Recovery',play:'Choose your appearance',manual:'Bat manually',automatic:'Simulate next appearance',manualResume:'Resume the active appearance',manualHint:'Click, touch and keyboard work as in at-bat practice. Automatic play is retained separately from direct input.',season:'Season statistics',growth:'Growth and condition',ledger:'Growth ledger',feedback:'Coaching notes',games:'Schedule and game reviews',game:'Game',day:'Day',home:'Home',away:'Away',scheduled:'Scheduled',active:'In progress',complete:'Complete',final:'Your first three games are complete.',finalHint:'This review covers the three-game test season. It does not implement 144 games, a multi-year career or retirement.',newPlayer:'Choose another player',localNote:'Development saves require this same browser and its retained cookie/storage. They are separate from 10-pitch practice, standalone at-bats and 100m records. Pitches do not resume automatically.',condition:'Condition',trust:'Coach trust',xp:'Experience',source:'Play source',manualSource:'Manual',automaticSource:'Automatic',developmentSource:'Development',reconnect:'Development code changed. Refresh this page and choose the saved player again.',pitches:{'four-seam':'Four-seam',slider:'Slider',curveball:'Curveball',changeup:'Changeup'},outcomes:{walk:'Walk','strikeout-looking':'Called strikeout','strikeout-swinging':'Swinging strikeout',single:'Single',double:'Double',triple:'Triple','home-run':'Home run',flyout:'Flyout',lineout:'Lineout',groundout:'Groundout'},feedbackKeys:{'next-opportunity':'Build the next opportunity from this appearance.','first-hit':'Your first hit is recorded. Review both the contact and its result.','home-run-earned':'A ball cleared the fence. Practice reproducing that timing.','walk-earned':'A walk is recorded. Taking a pitch is a meaningful decision.','strikeout-review':'Review your aim and reference timing after a strikeout.','rest-advised':'Condition is low. Consider recovery before the next game.','trial-complete':'Use these three games and the growth ledger to plan the next season.'},ledgerKinds:{preparation:'Preparation',appearance:'Appearance',game:'Game review',objective:'Season objective'}},
}
const rate=value=>value===null?'—':value.toFixed(3).replace(/^0\./,'.')
const signed=value=>`${value>0?'+':''}${value}`
const preparationCopy={
  ko:{preview:'저장 전 예상 변화',previewNote:'상한과 하한을 적용한 예상값입니다. 준비 완료 후 서버의 실제 적용값을 확인합니다.',confirmed:'준비 저장 완료',actual:'서버에서 확인한 실제 변화',unchanged:'상한으로 인해 이 항목은 그대로입니다.',noChange:'이번 준비로 바뀐 수치는 없습니다.',cost:'컨디션 비용',recovery:'컨디션 회복',xp:'경험치'},
  en:{preview:'Preview before saving',previewNote:'Estimated values include caps. Confirm preparation to see the values actually applied by the server.',confirmed:'Preparation saved',actual:'Actual changes confirmed by the server',unchanged:'This value stayed at its cap.',noChange:'This preparation changed no values.',cost:'Condition cost',recovery:'Condition recovery',xp:'XP'},
}

function Statistics({value,rates,text}){return <div className={styles.statistics} aria-label={text.season}>{['G','PA','AB','H','2B','3B','HR','BB','SO'].map(key=><div key={key}><small>{key}</small><strong>{value[key]}</strong></div>)}{rates&&<><div><small>AVG</small><strong>{rate(rates.AVG)}</strong></div><div><small>SLG</small><strong>{rate(rates.SLG)}</strong></div></>}</div>}


const focusCopy={
  ko:{home:'육성',schedule:'일정',records:'기록',player:'선수',title:'타자 육성',prepareTitle:'타석에 들어서기 전에.',today:'오늘의 준비',choose:'훈련 또는 회복을 골라 주세요.',confirm:'준비 완료',goPrepare:'타격 준비로',enter:'타석 입장',resume:'이 타석 이어하기',return:'육성으로',back:'뒤로',ready:'저장 준비됨',saving:'저장 확인 중',viewOnly:'화면을 둘러보는 동안 경기와 성장은 그대로 유지됩니다.',prepared:'오늘의 준비를 마쳤습니다.',trainingNote:'기존 능력·컨디션 규칙을 사용합니다. 직접 타격의 판정 보너스는 아직 적용하지 않습니다.',autoNote:'자동 진행은 다음 한 타석만 확정합니다.',profileNote:'진행 중 선수 설정은 유지됩니다. 다른 선수는 저장 목록에서 선택할 수 있습니다.',review:'타석 결산',growthEarned:'이번 타석의 성장',none:'새 성장 변화가 없습니다.',choosePlayer:'선수 선택',restore:'이전 타석이 남아 있습니다.',resultReady:'확정 결과를 확인했습니다.',connection:'저장 상태',training:'훈련',more:'상세 기록',trial:'3경기 육성 · 경기당 2타석',allDone:'첫 세 경기를 마쳤습니다.',trainingPreview:'선택한 준비의 변화',power:'파워',discipline:'선구',stamina:'체력'},
  en:{home:'Career',schedule:'Schedule',records:'Records',player:'Player',title:'Batter career',prepareTitle:'Before stepping into the box.',today:'Prepare for today',choose:'Choose training or recovery.',confirm:'Confirm preparation',goPrepare:'Prepare to bat',enter:'Enter the box',resume:'Resume this appearance',return:'Back to career',back:'Back',ready:'Storage ready',saving:'Checking storage',viewOnly:'Browsing these screens does not advance a game or award growth.',prepared:'Today’s preparation is complete.',trainingNote:'Existing ability and condition rules apply. Direct batting has no judgment bonus yet.',autoNote:'Simulation confirms only the next appearance.',profileNote:'The active player’s settings stay fixed. Choose another player from the save list.',review:'Appearance review',growthEarned:'Growth from this appearance',none:'No new growth changes.',choosePlayer:'Choose player',restore:'An unfinished appearance is waiting.',resultReady:'The final result is confirmed.',connection:'Save status',training:'Training',more:'Detailed records',trial:'Three-game career · two appearances per game',allDone:'Your first three games are complete.',trainingPreview:'Preparation preview',power:'Power',discipline:'Discipline',stamina:'Stamina'},
}

function CareerButton({kind,onAction,children,disabled=false,className}){
  const intent=useRef(null)
  return <button type='button' className={className} disabled={disabled}
    onPointerDown={()=>{intent.current=kind}} onPointerCancel={()=>{intent.current=null}}
    onKeyDown={event=>{if(event.repeat||event.nativeEvent.isComposing)event.preventDefault()}}
    onClick={event=>{if(event.detail!==0&&intent.current!==kind)return;intent.current=null;onAction()}}>{children}</button>
}

export default function BaseballCareerGame({locale='ko',dataVersions=null,storageVersions=null,careerVersions=null,v2StorageVersions=null,v2CareerVersions=null,enabled=false,preview=false}){
  const localDevelopment=process.env.NODE_ENV==='development'
  const previewMode=!localDevelopment&&enabled===true&&preview===true
  const careerEnabled=localDevelopment||previewMode
  const prefix=useId(),router=useRouter()
  const sharedFeedback=useBaseballFeedback({locale})
  const {intro:entranceIntro,prepare:prepareEntrance,enter:showEntrance,cancel:cancelEntrance}=useBaseballEntrance({feedback:sharedFeedback,locale})
  const clearCareerPresentation=useCallback(()=>{cancelEntrance();sharedFeedback.stop()},[cancelEntrance,sharedFeedback.stop])
  const [draft,setDraft]=useState({name:'',jerseyNumber:'7',teamId:'heroes',handedness:'right'})
  const [settings,setSettings]=useState({baseSpeedKmh:120,pitchMode:'mixed'})
  const [errors,setErrors]=useState({}),[development,setDevelopment]=useState(false)
  const [store,setStore]=useState({entries:[],history:[],busy:false,code:null}),[opening,setOpening]=useState(true)
  const [career,setCareer]=useState(null),[manual,setManual]=useState(null),[review,setReview]=useState(null)
  const modern=career?.schemaVersion!==1,rules=modern?BASEBALL_CAREER_V2_RULES:BASEBALL_CAREER_RULES
  const previewCopy=previewMode?{unavailable:locale==='en'?'Preview storage is unavailable. Existing records and pending requests remain.':'Preview 저장소에 연결하지 못했습니다. 기존 기록과 대기 요청은 유지합니다.',reconnect:locale==='en'?'The Preview version changed. Refresh this page and choose the saved player again.':'Preview 버전이 변경되었습니다. 새로고침한 뒤 저장된 선수를 다시 선택해 주세요.'}:{}
  const text={...(copy[locale]||copy.ko),mit:locale==='en'?'Contact training':'미트 훈련',localNote:locale==='en'?'Records stay on the server. Keep a recovery code to continue this player in another browser. Pitches never resume automatically.':'기록은 서버에 저장됩니다. 복구 코드를 보관하면 다른 브라우저에서도 선수를 이어갑니다. 투구는 자동 재개하지 않습니다.',...previewCopy}
  const f={...(focusCopy[locale]||focusCopy.ko),title:BASEBALL_CAREER_BRAND[locale==='en'?'en':'ko'].name,mit:locale==='en'?'Contact':'미트',...(modern?{trainingNote:locale==='en'?'Contact and power bonuses are fixed when you enter an appearance. Ball size and the timing window stay unchanged.':'미트·파워 보정은 타석 입장 때 고정합니다. 공 크기와 유효 타이밍은 그대로입니다.'}:{})}
  const [view,setView]=useState(createBaseballCareerView),[trainingChoice,setTrainingChoice]=useState(null),[trainingFeedback,setTrainingFeedback]=useState(null)
  const trainingEpoch=useRef(0),seenTrainingEvents=useRef(new Set())
  const clearTrainingFeedback=useCallback(()=>{trainingEpoch.current++;setTrainingFeedback(null)},[])
  const preparationText=preparationCopy[locale]||preparationCopy.ko
  const [reconnectNotice,setReconnectNotice]=useState(false),[operationPending,setOperationPending]=useState(false)
  const clientRef=useRef(null),alive=useRef(true),careerRef=useRef(null),manualRef=useRef(null),viewRef=useRef(view)
  const controlsRef=useRef(null),operationRef=useRef(false),selectionEpoch=useRef(0),contentRef=useRef(null)
  careerRef.current=career;manualRef.current=manual;viewRef.current=view
  const transition=useCallback(action=>{const next=reduceBaseballCareerView(viewRef.current,action);viewRef.current=next;setView(next);return next},[])
  const retainCareer=useCallback(value=>{careerRef.current=value;setCareer(value)},[])
  const goManage=useCallback((tab='home')=>{controlsRef.current?.pause();clearTrainingFeedback();clearCareerPresentation();transition({type:'manage',tab})},[clearTrainingFeedback,clearCareerPresentation,transition])
  useEffect(()=>{
    const leave=()=>{controlsRef.current?.pause();clearTrainingFeedback();clearCareerPresentation();transition({type:'cancel'})}
    router.events.on('routeChangeStart',leave)
    return()=>router.events.off('routeChangeStart',leave)
  },[router.events,clearTrainingFeedback,clearCareerPresentation,transition])
  useEffect(()=>{
    let cancelled=false
    alive.current=true;setOpening(true);clearTrainingFeedback()
    if(careerRef.current){setCareer(null);setManual(null);setReview(null);setReconnectNotice(true);transition({type:'select-career',careerId:null})}
    if(careerEnabled)void(async()=>{try{
      const storage=await import('@/lib/playground-baseball-career-hub-client.mjs')
      const client=await storage.openBaseballCareerHubClient({onChange:value=>{if(!cancelled&&alive.current)setStore(value)}})
      if(cancelled||!alive.current){client.close();return}clientRef.current=client
    }catch(cause){if(!cancelled&&alive.current)setStore(old=>({...old,code:cause.code||'storage_unavailable',busy:false}))}finally{if(!cancelled&&alive.current)setOpening(false)}})()
    else setOpening(false)
    return()=>{cancelled=true;alive.current=false;selectionEpoch.current++;trainingEpoch.current++;clientRef.current?.close();clientRef.current=null}
  },[careerEnabled,clearTrainingFeedback,transition])
  useEffect(()=>{if(contentRef.current)contentRef.current.scrollTop=0},[view.view,view.tab,career?.id])
  const onManualSession=useCallback(session=>{
    const owner=manualRef.current,currentCareer=careerRef.current
    if(!alive.current||!owner||session.id!==owner.session.id)return
    const checkpoint=clientRef.current?.snapshot().entries.find(entry=>entry.id===currentCareer?.id)?.checkpoint
    if(!checkpoint||checkpoint.revision<currentCareer.revision||!isBaseballCareerSessionCurrent({career:checkpoint,atBatId:owner.session.id,currentSession:owner.latestSession,nextSession:session}))return
    retainCareer(checkpoint)
    const reviewLedger=owner.reviewLedger||(session.state.status==='complete'?checkpoint.ledger.filter(event=>!owner.ledgerIds.includes(event.id)):null)
    const next={...owner,latestSession:session,reviewLedger};manualRef.current=next;setManual(next)
  },[retainCareer])
  const onControlReady=useCallback((id,controls)=>{if(manualRef.current?.session.id===id)controlsRef.current=controls},[])
  const onEntranceReady=useCallback(token=>{
    const owner=manualRef.current
    return Boolean(token&&alive.current&&viewRef.current.view==='batting'&&owner?.entryToken===token&&showEntrance(token,owner.player))
  },[showEntrance])
  const completed=selectBaseballCareerCompletedAppearance({career,atBatId:manual?.session.id,session:manual?.latestSession})
  const earned=completed?manual.reviewLedger||[]:[]
  const summary=completed?<section className={styles.panel} data-baseball-career-appearance-review>
    <h2>{f.review}</h2><p>{text.outcomes[completed.outcome]} · {completed.pitchCount}{locale==='en'?' pitches':'구'}</p>
    <Statistics value={{G:0,...completed.stats}} text={text}/><h3>{f.growthEarned}</h3>
    {!earned.length?<p>{f.none}</p>:<ul className={styles.notes}>{earned.map(event=><li key={event.id}>{text.ledgerKinds[event.kind]} · {Object.entries(event.deltas).filter(([,amount])=>amount!==0).map(([key,amount])=>`${text[key]} ${amount>0?'+':''}${amount}`).join(' / ')}</li>)}</ul>}
  </section>:null
  const embedded=useMemo(()=>manual?{player:manual.player,session:manual.session,latestSession:manual.latestSession,client:manual.client,onSession:onManualSession,
    feedback:sharedFeedback,entranceIntro,entryToken:manual.entryToken,onEntranceReady,onEntranceCancel:cancelEntrance,
    active:view.view==='batting',focused:true,onControlReady,summary}:null,
    [manual,onManualSession,sharedFeedback,entranceIntro,onEntranceReady,cancelEntrance,view.view,onControlReady,summary])
  const feedback=getBaseballPlayerFeedback(errors,text),busy=opening||store.busy||operationPending
  const pending=store.entries.find(entry=>entry.id===career?.id)?.pending
  const selectedVersions=modern?v2CareerVersions:careerVersions
  const selectedStorageVersions=modern?v2StorageVersions:storageVersions
  const versionMismatch=Boolean(career&&selectedVersions&&Object.keys(selectedVersions).some(key=>career.versions[key]!==selectedVersions[key]))
  const blocked=busy||Boolean(pending)||versionMismatch
  const current=career?.games[career.currentGameIndex],resumeId=getBaseballCareerResumeId(career)
  const team=getBaseballTeam(career?.profile.teamId||draft.teamId)
  const rows=[...new Map([...store.history.map(row=>[row.id,row]),...store.entries.map(entry=>{
    const remote=store.history.find(row=>row.id===entry.id)
    return[entry.id,{...(remote?.revision>(entry.checkpoint?.revision||0)?remote:entry.checkpoint),id:entry.id,entry,rulesVersion:entry.rulesVersion}]
  })]).values()].sort((a,b)=>Number(Boolean(b.entry?.pending))-Number(Boolean(a.entry?.pending))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,40)
  const errorText=['revision_conflict','command_conflict','local_conflict'].includes(store.code)?text.conflict:store.code==='client_reconnect_required'?text.reconnect:['not_configured','database_unavailable','owner_required'].includes(store.code)?text.unavailable
    :['storage_capacity','local_capacity'].includes(store.code)?(locale==='en'?'Storage capacity was reached. Existing records and pending requests remain.':'저장 한도에 도달했습니다. 기존 기록과 대기 요청을 유지합니다.')
      :store.code==='not_found'?(locale==='en'?'Access to this batter could not be confirmed. Refresh the list and reconnect using the original browser or a valid recovery code. Existing records and pending requests remain.':'선수 연결을 확인하지 못했습니다. 목록을 새로고침하고 원래 브라우저 또는 유효한 복구 코드로 다시 연결해 주세요. 기존 기록과 대기 요청은 유지합니다.'):text.error
  async function showCareer(value){
    if(!alive.current)return
    controlsRef.current?.pause();clearTrainingFeedback();clearCareerPresentation();manualRef.current?.client.close();controlsRef.current=null
    retainCareer(value);manualRef.current=null;setManual(null);setReview(null);setTrainingChoice(null);setReconnectNotice(false)
    transition({type:'select-career',careerId:value.id})
  }
  async function refresh(){try{await clientRef.current?.refresh()}catch{/* Existing journal publishes the error. */}}
  async function recoverCareer(id,version){
    if(operationRef.current)throw new Error('The current operation is still pending.')
    operationRef.current=true;setOperationPending(true)
    const ticket=++selectionEpoch.current
    try{const value=await clientRef.current.readRecovered(id,version);if(alive.current&&ticket===selectionEpoch.current){await showCareer(value.career);if(value.pending)setReview({id,career:value.career})}}
    finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function readCareer(id,retry=false){
    if(operationRef.current)return
    const ticket=++selectionEpoch.current;operationRef.current=true;setOperationPending(true)
    try{
      controlsRef.current?.pause();clearCareerPresentation()
      if(retry){const value=await clientRef.current.retry(id);if(alive.current&&ticket===selectionEpoch.current)await showCareer(value);return}
      const value=await clientRef.current.read(id)
      if(!alive.current||ticket!==selectionEpoch.current)return
      await showCareer(value.career);if(value.pending)setReview({id,career:value.career})
    }catch{/* Preserve the selected player and pending requests. */}finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function adopt(){if(!review||operationRef.current)return;operationRef.current=true;setOperationPending(true);try{await showCareer(await clientRef.current.adoptLatest(review.id))}catch{/* Conflict archive stays intact. */}finally{operationRef.current=false;if(alive.current)setOperationPending(false)}}
  function update(field,value){setDraft(old=>({...old,[field]:value}));setErrors(old=>revalidateBaseballPlayerField(old,{...draft,[field]:value},field))}
  async function create(event){
    event.preventDefault();const checked=validateBaseballPlayer(draft)
    if(!checked.valid){setErrors(checked.errors);return}
    if(!clientRef.current||busy||operationRef.current)return
    operationRef.current=true;setOperationPending(true)
    try{await showCareer(await clientRef.current.create(checked.player,settings,{source:development?'development':'manual'}));setErrors({})}catch{/* Retry retains the same create request. */}finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function command(value){
    if(!career||blocked||operationRef.current)return
    operationRef.current=true;setOperationPending(true);clearTrainingFeedback();clearCareerPresentation()
    const before=career,owner=career.id,ticket=trainingEpoch.current,selection=selectionEpoch.current
    try{const next=await clientRef.current.command(owner,value);if(alive.current&&careerRef.current?.id===owner){retainCareer(next);setReview(null);if(value.type==='prepare'){
      setTrainingChoice(null)
      const confirmed=selectBaseballTrainingConfirmation({before,after:next,choice:value.choice,seenIds:[...seenTrainingEvents.current],origin:'direct-command'})
      if(confirmed&&trainingEpoch.current===ticket&&selectionEpoch.current===selection&&viewRef.current.view==='manage'&&viewRef.current.tab==='home'){
        seenTrainingEvents.current.add(confirmed.id);setTrainingFeedback(confirmed)
      }
    }}}catch{/* Do not mint another command to retry. */}finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function enterManual(){
    if(!career||blocked||operationRef.current||career.status==='complete'||!current?.preparation)return
    clearTrainingFeedback()
    const nextView=transition({type:'request-manual',atBatId:resumeId}),intent=nextView.intent
    if(!intent)return
    operationRef.current=true;setOperationPending(true)
    const entryToken=resumeId?null:prepareEntrance(),ledgerIds=career.ledger.map(event=>event.id)
    const intended=()=>alive.current&&viewRef.current.intent?.epoch===intent.epoch&&viewRef.current.careerId===intent.careerId
    try{
      const value=resumeId?career:await clientRef.current.command(career.id,{type:'start-manual'})
      if(alive.current&&careerRef.current?.id===value.id)retainCareer(value)
      if(!intended()){cancelEntrance();return}
      const id=value.activeAtBat?.id;if(!id)throw new Error('Missing appearance')
      if(manualRef.current?.session.id===id){transition({type:'manual-ready',...intent,atBatId:id});return}
      const adapter=await clientRef.current.atBatAdapter(value.id,id,value.profile)
      if(!intended()){adapter.client.close();cancelEntrance();return}
      manualRef.current?.client.close();controlsRef.current=null
      const owner={...adapter,player:value.profile,entryToken,latestSession:adapter.session,ledgerIds,reviewLedger:null}
      manualRef.current=owner;setManual(owner);setReview(null)
      transition({type:'manual-ready',...intent,atBatId:id})
    }catch{cancelEntrance();if(alive.current)transition({type:'manual-failed',...intent})}finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  function chooseAnother(){try{clientRef.current?.selectNew()}catch{/* The current version status remains visible. */}selectionEpoch.current++;controlsRef.current?.pause();clearTrainingFeedback();clearCareerPresentation();manualRef.current?.client.close();manualRef.current=null;controlsRef.current=null;setManual(null);retainCareer(null);setReview(null);setTrainingChoice(null);transition({type:'select-career',careerId:null})}
  function prepareView(){if(career&&!blocked&&career.status!=='complete'&&current?.preparation){clearTrainingFeedback();clearCareerPresentation();transition({type:'prepare'})}}
  const trainingPreview=career&&trainingChoice?getBaseballTrainingPreview({growth:career.growth,rules,choice:trainingChoice}):null
  if(!careerEnabled)return <p>{locale==='en'?'Career play is in preparation.':'선수 육성은 준비 중입니다.'}</p>
  const setupView=(<div className={styles.setupGrid}>
      <form className={styles.panel} onSubmit={create} noValidate><p className={styles.kicker}>01 / YOUR PLAYER</p><h2>{text.setup}</h2><p>{locale==='en'?'New players use growth rules v2. Existing v1 players keep their original rules.':'새 선수는 미트·파워가 적용되는 v2로 시작합니다. 기존 v1 선수는 원래 규칙을 유지합니다.'}</p>
        <div className={styles.nameGrid}><label htmlFor={`${prefix}-name`}>{text.name}<input id={`${prefix}-name`} value={draft.name} autoComplete="off" maxLength={32} aria-invalid={feedback.name.invalid} aria-describedby={feedback.name.describedBy} onChange={event=>update('name',event.target.value)} /></label><label htmlFor={`${prefix}-number`}>{text.number}<input id={`${prefix}-number`} value={draft.jerseyNumber} inputMode="numeric" maxLength={2} aria-invalid={feedback.jerseyNumber.invalid} aria-describedby={feedback.jerseyNumber.describedBy} onChange={event=>update('jerseyNumber',event.target.value)} /></label></div>
        <p className={styles.hint} id={feedback.numberHint}>{text.numberHint}</p><fieldset><legend>{text.hand}</legend><div className={styles.segments}><button type="button" aria-pressed={draft.handedness==='right'} onClick={()=>update('handedness','right')}>{text.right}</button><button type="button" aria-pressed={draft.handedness==='left'} onClick={()=>update('handedness','left')}>{text.left}</button></div></fieldset>
        <label htmlFor={`${prefix}-team`}>{text.team}<select id={`${prefix}-team`} value={draft.teamId} onChange={event=>update('teamId',event.target.value)}>{BASEBALL_TEAMS.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label htmlFor={`${prefix}-speed`}>{text.speed}<select id={`${prefix}-speed`} value={settings.baseSpeedKmh} onChange={event=>setSettings(old=>({...old,baseSpeedKmh:Number(event.target.value)}))}>{[80,100,120,140,160].map(value=><option key={value} value={value}>{value} km/h</option>)}</select></label>
        <label htmlFor={`${prefix}-mode`}>{text.pitchMode}<select id={`${prefix}-mode`} value={settings.pitchMode} onChange={event=>setSettings(old=>({...old,pitchMode:event.target.value}))}><option value="mixed">{text.mixed}</option>{Object.entries(text.pitches).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        {localDevelopment&&<label className={styles.checkbox}><input type="checkbox" checked={development} onChange={event=>setDevelopment(event.target.checked)} />{text.development}</label>}
        {feedback.messages.map(message=><p key={message.id} id={message.id} className={styles.error} role="alert">{message.text}</p>)}
        <button className={styles.primary} type="submit" disabled={busy||Boolean(store.code)||!clientRef.current}>{text.create} →</button>
      </form>
      <div><section className={styles.panel}><h2>{text.saved}</h2>{!rows.length&&!busy&&!store.code&&<p>{text.empty}</p>}<ul className={styles.saved}>{rows.map((row,index)=><li key={row.id}><div><strong>{row.profile?.name||row.entry?.pending?.body.profile?.name||(locale==='en'?`Player ${index+1}`:`선수 ${index+1}`)}</strong><small>{row.status==='complete'?text.complete:text.active} · {row.completedGames??row.currentGameIndex??0}/3 · v{row.rulesVersion||row.schemaVersion||1}</small></div><div className={styles.actions}>{row.entry?.pending?<><button type="button" disabled={busy} onClick={()=>void readCareer(row.id,true)}>{text.retry}</button><button type="button" disabled={busy} onClick={()=>void readCareer(row.id)}>{text.inspect}</button></>:<button type="button" disabled={busy} onClick={()=>void readCareer(row.id)}>{text.resume}</button>}</div></li>)}</ul></section><BaseballCareerRecovery locale={locale} onRecovered={recoverCareer} disabled={busy}/>
      </div>
    </div>)
  const scheduleView=career&&(<section className={styles.panel}><h2>{text.games}</h2><div className={styles.games}>{career.games.map(game=><article key={game.id} data-status={game.status}><p className={styles.kicker}>{text.day} {game.day} · {text.game} {game.ordinal}</p><h3>{getBaseballTeam(game.opponentId).name}</h3><p>{text[game.status]} · {game.appearances.length}/2 PA</p>{game.preparation&&<p>{text[game.preparation.choice]}</p>}<Statistics value={game.stats} text={text} /><ol>{game.appearances.map(row=><li key={row.id}><strong>{text.outcomes[row.outcome]||row.outcome}</strong><small>{row.source==='automatic'?text.automaticSource:row.source==='development'?text.developmentSource:text.manualSource} · {row.pitchCount}{locale==='en'?' pitches':'구'}</small></li>)}</ol></article>)}</div></section>)
  const recordsView=career&&(<><section className={styles.panel}><h2>{text.source}</h2><div className={styles.sources}>{['manual','automatic','development'].map(source=><div key={source}><h3>{text[`${source}Source`]}</h3><Statistics value={career.statsBySource[source]} text={text} /></div>)}</div></section>
      <section className={styles.panel}><h2>{text.ledger}</h2><ol className={styles.ledger}>{career.ledger.map(event=><li key={event.id}><div><strong>{text.ledgerKinds[event.kind]||event.kind}</strong><span>{text.game} {event.gameIndex+1}{event.choice?` · ${text[event.choice]}`:''}</span></div><div>{Object.entries(event.deltas).filter(([,delta])=>delta!==0).map(([key,delta])=><span key={key}>{text[key]} {delta>0?'+':''}{delta}</span>)}</div></li>)}</ol></section>
      <details className={styles.data}><summary>{locale==='en'?'Inspect confirmed career records':'확정된 육성 기록 확인'}</summary><pre data-baseball-career-records>{JSON.stringify(career,null,2)}</pre></details></>)
  return <section className={`${styles.game} ${styles.focusGame}`} data-baseball-career data-career-rule-version={career?.schemaVersion||2} data-career-screen={view.view} data-career-player={Boolean(career)} onKeyDownCapture={event=>{
    if(event.target.closest('button')&&['Enter','Space'].includes(event.code)&&(event.repeat||event.nativeEvent.isComposing))event.preventDefault()
    if(event.key==='Enter'&&event.nativeEvent.isComposing)event.preventDefault()
  }}>
    <header className={styles.focusHeader}><div><p className={styles.kicker}>BATTING LAB · {previewMode?'PREVIEW':'CAREER'} · v{career?.schemaVersion||2}</p><h1>{view.view==='prepare'?f.prepareTitle:career?career.profile.name:f.title}</h1></div>
      <span className={styles.hint} role='status' aria-label={f.connection}>{busy?f.saving:store.code?f.connection:f.ready}</span>
      {!career&&<Link href='/playground/baseball/at-bat' prefetch={false}>← {text.back}</Link>}
    </header>
    {career&&view.view==='manage'&&<nav className={styles.focusNav} aria-label={f.title}>{['home','schedule','records','player'].map(tab=><button type='button' key={tab} aria-current={view.tab===tab?'page':undefined} data-active={view.tab===tab} onClick={()=>goManage(tab)}>{f[tab]}</button>)}</nav>}
    <div ref={contentRef} className={styles.focusContent} hidden={view.view==='batting'} id={`${prefix}-career-content`}>
      {previewMode&&!career&&<p className={styles.compactNotice} data-baseball-career-preview>{locale==='en'?'Preview test · Test records are stored separately from the public service.':'Preview 검수 · 기록은 공개 서비스와 분리해 저장합니다.'}</p>}
      {store.code&&<p className={styles.compactNotice} role='alert'>{errorText}</p>}
      {Object.entries(store.versionErrors||{}).filter(([version,code])=>code&&Number(version)!==store.activeVersion).map(([version])=><p className={styles.error} role='alert' key={version}>{locale==='en'?`The v${version} player list could not be loaded. Its existing records remain unchanged.`:`v${version} 선수 목록을 확인하지 못했습니다. 해당 버전의 기존 기록은 유지됩니다.`}</p>)}
      {reconnectNotice&&<p className={styles.hint}>{text.reconnect}</p>}
      {versionMismatch&&<p className={styles.error} role='alert'>{locale==='en'?'This save uses different rules. Existing records remain unchanged.':'다른 규칙 버전의 선수입니다. 기존 기록은 그대로 보존합니다.'}</p>}
      {pending&&<div className={styles.notice}><p>{busy?f.saving:text.error}</p><div className={styles.actions}><button type='button' disabled={busy} onClick={()=>void readCareer(career.id,true)}>{text.retry}</button><button type='button' disabled={busy} onClick={()=>void readCareer(career.id)}>{text.inspect}</button></div></div>}
      {review&&<div className={styles.notice}><p>{text.conflict}</p><p>{text.adoptHint}</p><button type='button' disabled={busy||review.career.revision<=(store.entries.find(entry=>entry.id===review.id)?.pending?.body.expectedRevision||0)} onClick={()=>void adopt()}>{text.adopt}</button></div>}
      {!career?setupView:view.view==='prepare'?<>
        <section className={styles.hero}><div className={styles.heroCopy}><p className={styles.kicker}>{resumeId?'RESUME APPEARANCE':'READY TO BAT'}</p><h2 className={styles.heroTitle}>{career.profile.name}</h2><p>{resumeId?f.restore:f.viewOnly}</p><div className={styles.heroMeta}><span>{team.name}</span><span>{career.profile.handedness==='left'?text.left:text.right}</span><span>{text.game} {current.ordinal} · {current.appearances.length+1}/2 PA</span></div></div><div className={styles.heroBadge} style={{'--team-color':team.helmet}}>#{career.profile.jerseyNumber}</div></section>
        <section className={styles.taskCard}><h2>{resumeId?f.resume:f.enter}</h2><p>{career.settings.baseSpeedKmh} km/h · {career.settings.pitchMode==='mixed'?text.mixed:text.pitches[career.settings.pitchMode]}</p><p>{f.trainingNote}</p><p>{text.manualHint}</p></section>
      </>:view.tab==='home'?<>
        <section className={styles.hero}><div className={styles.heroCopy}><p className={styles.kicker}>{f.trial}</p><h2 className={styles.heroTitle}>{career.status==='complete'?f.allDone:`${text.game} ${current.ordinal} · ${text.day} ${current.day}`}</h2><p>{career.status==='complete'?text.finalHint:getBaseballTeam(current.opponentId).name}</p><div className={styles.heroMeta}><span>{team.name}</span><span>{career.profile.handedness==='left'?text.left:text.right}</span><span>{career.status==='complete'?'3/3':`${career.currentGameIndex+1}/3`} {text.game}</span></div></div><div className={styles.heroBadge} style={{'--team-color':team.helmet}}>#{career.profile.jerseyNumber}</div></section>
        <div className={styles.metricGrid}>{['condition','xp','trust'].map(key=><div className={styles.metric} key={key}><span>{text[key]}</span><strong>{career.growth[key]}</strong></div>)}</div>
        {career.status!=='complete'&&<section className={styles.taskCard}>
          <h2>{current.preparation?f.prepared:f.today}</h2>
          {!current.preparation?<><p>{f.choose}</p>
            <div className={styles.trainingChoices}>{(modern?['mit','power','discipline','stamina','rest']:['power','discipline','stamina','rest']).map(choice=>{
              const preview=getBaseballTrainingPreview({growth:career.growth,rules,choice})
              if(!preview)return null
              const [main,...costs]=preview.rows
              return <button type='button' key={choice} aria-pressed={trainingChoice===choice} disabled={blocked} onClick={()=>setTrainingChoice(choice)}>
                <strong>{text[choice]}</strong><small className={styles.trainingChoiceValue}>{main.before} → {main.after} ({signed(main.delta)})</small>
                {costs.map(row=><small key={row.key}>{row.key==='condition'?preparationText.cost:preparationText.xp} {row.before} → {row.after} ({signed(row.delta)})</small>)}
              </button>
            })}</div>
            {trainingPreview&&<div className={styles.trainingPreview} role='status'><strong>{preparationText.preview}</strong>
              <dl className={styles.trainingChanges}>{trainingPreview.rows.map(row=><div key={row.key}><dt>{f[row.key]||text[row.key]}</dt><dd>{row.before} → {row.after} <span>({signed(row.delta)})</span></dd></div>)}</dl>
              <p>{preparationText.previewNote}</p>
            </div>}
          </>:<><p>{text[current.preparation.choice]} · {current.appearances.length}/2 PA</p><p>{resumeId?f.restore:text.manualHint}</p></>}
          {trainingFeedback&&<div key={trainingFeedback.id} className={styles.trainingConfirmed} data-baseball-training-confirmed data-growth-changed={trainingFeedback.changed} role='status' aria-live='polite' aria-atomic='true'>
            <strong>{preparationText.confirmed}</strong><p>{preparationText.actual}</p>
            <dl className={styles.trainingChanges}>{trainingFeedback.rows.map(row=><div key={row.key} data-changed={row.delta!==0}><dt>{f[row.key]||text[row.key]}</dt><dd>{row.before} → {row.after} <span>({signed(row.delta)})</span>{row.delta===0&&<small>{preparationText.unchanged}</small>}</dd></div>)}</dl>
            {!trainingFeedback.changed&&<p>{preparationText.noChange}</p>}
          </div>}
        </section>}
        <div className={styles.summaryGrid}><section className={styles.panel}><h2>{text.growth}</h2><div className={styles.growth}>{(modern?['mit','power','discipline','stamina']:['power','discipline','stamina']).map(key=><div key={key}><small>{f[key]}</small><strong>{career.growth[key]}</strong></div>)}</div><p>{f.trainingNote}</p><button type='button' onClick={()=>goManage('player')}>{locale==='en'?'Manage recovery code':'복구 코드 관리'}</button>{localDevelopment&&<p><Link href='/playground/baseball/growth' prefetch={false}>{locale==='en'?'Compare growth candidates':'성장 후보 비교하기'} →</Link></p>}</section><section className={styles.panel}><h2>{text.feedback}</h2><ul className={styles.notes}>{career.feedback.map(key=><li key={key}>{text.feedbackKeys[key]||key}</li>)}</ul></section></div>
      </>:view.tab==='schedule'?scheduleView:view.tab==='records'?<><section className={styles.panel}><h2>{text.season}</h2><Statistics value={career.stats} rates={career.rates} text={text}/></section>{recordsView}</>:<section className={styles.panel}><h2>{career.profile.name} · #{career.profile.jerseyNumber}</h2><p>{team.name} · {career.profile.handedness==='left'?text.left:text.right}</p><p>{career.settings.baseSpeedKmh} km/h · {career.settings.pitchMode==='mixed'?text.mixed:text.pitches[career.settings.pitchMode]}</p><p>{f.profileNote}</p><p>{text.localNote}</p><button type='button' disabled={busy} onClick={chooseAnother}>{f.choosePlayer}</button><button type='button' disabled={busy} onClick={()=>void refresh()}>{text.refresh}</button><BaseballCareerRecovery key={`${career.id}:${career.schemaVersion}`} careerId={career.id} version={career.schemaVersion} locale={locale} onRecovered={recoverCareer} disabled={busy}/></section>}
    </div>
    {embedded&&<div className={styles.focusStage} hidden={view.view!=='batting'}><BaseballAtBatGame key={manual.session.id} locale={locale} dataVersions={dataVersions} storageVersions={selectedStorageVersions} embeddedCareer={embedded}/></div>}
    {career&&<footer className={styles.focusActions}>
      {view.view==='batting'?<><span className={styles.hint}>{completed?f.resultReady:store.code?errorText:f.trial}</span><CareerButton kind='return-career' onAction={()=>goManage('home')}>{f.return} ↗</CareerButton></>:view.view==='prepare'?<><CareerButton kind='cancel-preparation' onAction={()=>goManage('home')}>{f.back}</CareerButton><CareerButton kind={resumeId?'resume-manual':'enter-manual'} className={styles.primary} disabled={blocked} onAction={()=>void enterManual()}>{busy?f.saving:resumeId?f.resume:f.enter} →</CareerButton></>:view.tab==='home'&&career.status!=='complete'&&!current.preparation?<CareerButton kind={`prepare:${trainingChoice||'none'}`} className={styles.primary} disabled={blocked||!trainingChoice} onAction={()=>void command({type:'prepare',choice:trainingChoice})}>{f.confirm} →</CareerButton>:view.tab==='home'&&career.status!=='complete'?<><CareerButton kind='simulate' disabled={blocked||Boolean(resumeId)} onAction={()=>void command({type:'simulate-at-bat'})}>{text.automatic}</CareerButton><CareerButton kind='open-preparation' className={styles.primary} disabled={blocked} onAction={prepareView}>{resumeId?f.resume:f.goPrepare} →</CareerButton></>:<CareerButton kind='return-home' onAction={()=>goManage('home')}>{f.home}</CareerButton>}
    </footer>}
  </section>
}
