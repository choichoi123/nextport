import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import useBaseballFeedback from './use-baseball-feedback'
import useBaseballEntrance from './use-baseball-entrance'
import BaseballFeedbackPanel, { BaseballFeedbackOverlay } from './baseball-feedback-panel'
import BaseballEntranceOverlay from './baseball-entrance-overlay'
import BaseballContactBoostOverlay from './baseball-contact-boost-overlay'
import { createBaseballFeedbackGate, getBaseballResultFeedbackEvents } from '@/lib/playground-baseball-feedback.mjs'
import { BASEBALL_ENTRANCE } from '@/lib/playground-baseball-entrance.mjs'
import { BASEBALL_CONTACT_BOOST_DURATION_MS, getBaseballContactBoostPresentation } from '@/lib/playground-baseball-contact-boost.mjs'
import styles from '@/styles/playground-baseball-feedback.module.css'

const cases=[
  {key:'release',ko:'투수 릴리스',en:'Pitch release',type:'release'},
  {key:'swing',ko:'배트 바람',en:'Bat swing',type:'swing'},
  {key:'pass',ko:'공 통과',en:'Ball passage',type:'pass'},
  {key:'mitt',ko:'미트 포구',en:'Catcher mitt',type:'mitt'},
  {key:'miss',ko:'헛스윙·포구',en:'Swing and miss',type:'miss-sequence'},
  {key:'soft',ko:'가벼운 접촉',en:'Light contact',type:'contact',quality:.25},
  {key:'contact',ko:'배트 접촉',en:'Bat contact',type:'contact',quality:.65},
  {key:'perfect',ko:'정타 접촉',en:'Sweet spot',type:'contact',quality:.95},
  {key:'foul',ko:'파울 안내 자막',en:'Foul caption',type:'call',call:'foul'},
  {key:'ball',ko:'볼 콜 · 영어',en:'Ball call',type:'call',call:'ball'},
  {key:'strike',ko:'스트라이크 콜 · 영어',en:'Strike call',type:'call',call:'strike'},
  {key:'strikeout',ko:'삼진 콜 · 영어',en:'Strikeout call',type:'call',call:'strikeout'},
  {key:'hit',ko:'안타 반응',en:'Hit reaction',type:'result',outcome:'single'},
  {key:'out',ko:'아웃 반응',en:'Out reaction',type:'result',outcome:'groundout'},
  {key:'home-run',ko:'홈런 하이라이트',en:'Home-run highlight',type:'result',outcome:'home-run'},
]
const scenarios=[
  {key:'foul',ko:'파울 상황',en:'Foul sequence',type:'scenario'},
  {key:'hit',ko:'안타 상황',en:'Hit sequence',type:'scenario'},
  {key:'home-run',ko:'홈런 상황',en:'Home-run sequence',type:'scenario'},
  {key:'strikeout',ko:'헛스윙 삼진 상황',en:'Strikeout sequence',type:'scenario'},
]
const copy={
  ko:{title:'한 방의 소리와 여운.',kicker:'BATTING LAB · EFFECTS PREVIEW',back:'한 타석 연습',intro:'실제 녹음으로 만든 음향·연출 비교입니다. 표시 결과는 예시이며 투구·실제 성적·성장 보상·DB 저장을 만들지 않습니다.',prepare:'소리 준비하기',stop:'효과 시안 중지',samples:'상황으로 듣기',individual:'단품 소리 비교',badge:'개발 시안 · 합성 결과 · 저장하지 않음',idle:'비교할 상황이나 소리를 선택해 주세요.',selected:'마지막 선택',preparing:'선택한 시안의 소리를 준비하고 있습니다.',playing:'시안 재생 중',complete:'시안 완료',stopped:'시안을 중지했습니다.',note:'시안을 누르면 소리를 준비한 뒤 새로 시작합니다. 음소거 또는 준비 실패 때도 화면과 자막은 볼 수 있습니다.',body:'타격음 뒤에 관중과 콜이 이어지는 흐름을 비교합니다. 파울 안내는 자막이며, 스트라이크·볼·아웃·삼진 콜은 영어 녹음입니다.',captions:{foul:'파울',strike:'스트라이크',strikeout:'삼진',out:'아웃',ball:'볼',walk:'볼넷'}},
  en:{title:'The sound of solid contact.',kicker:'BATTING LAB · EFFECTS PREVIEW',back:'At-bat practice',intro:'Compare effects built from real recordings. Displayed results are examples; this page creates no pitch, real statistics, growth rewards or DB records.',prepare:'Prepare sound',stop:'Stop effects preview',samples:'Listen to a sequence',individual:'Individual sounds',badge:'Development sample · synthetic result · not saved',idle:'Choose a sequence or sound to compare.',selected:'Last selection',preparing:'Preparing sound for the selected preview.',playing:'Preview playing',complete:'Preview complete',stopped:'Preview stopped.',note:'A preview starts fresh after sound preparation. Captions and effects still work when muted or if preparation fails.',body:'Compare contact followed by a crowd reaction or call. Foul is caption-only; strike, ball, out and strikeout calls use English recordings.',captions:{foul:'FOUL',strike:'STRIKE',strikeout:'STRIKEOUT',out:'OUT',ball:'BALL',walk:'WALK'}},
}

const homeRunCopy={
  ko:{legend:'홈런 연출 비교',classic:'현재형',arcade:'가속형',hint:'가속형은 페어 타격 때 짧게, 홈런 확정 때 강하게 한 번 더 표현합니다. 안타·홈런 상황을 눌러 비교해 주세요. 선택만으로 재생하지 않습니다.'},
  en:{legend:'Compare home-run effects',classic:'Classic',arcade:'Accelerated',hint:'Accelerated adds a short burst at fair contact, then a stronger burst when a home run is confirmed. Try the Hit or Home-run sequence. Changing the style does not start playback.'},
}

export default function BaseballEffectsPreview({locale='ko'}){
  const text=copy[locale]||copy.ko,homeRunText=homeRunCopy[locale]||homeRunCopy.ko,feedback=useBaseballFeedback({locale})
  const entrance=useBaseballEntrance({feedback,locale,origin:'preview'})
  const sequence=useRef(0),request=useRef(0),alive=useRef(false),timers=useRef(new Set()),gate=useRef(null),stage=useRef(null)
  if(!gate.current)gate.current=createBaseballFeedbackGate()
  const [selected,setSelected]=useState(null),[contact,setContact]=useState(null),[caption,setCaption]=useState(null),[eventCount,setEventCount]=useState(0),[phase,setPhase]=useState('idle')
  const [homeRunVariant,setHomeRunVariant]=useState('arcade')
  const [contactBoost,setContactBoost]=useState(null)
  const cancel=useCallback(()=>{
    request.current+=1
    timers.current.forEach(clearTimeout);timers.current.clear()
    entrance.cancel()
    feedback.stop()
    if(alive.current){setContact(null);setContactBoost(null);setCaption(null);setPhase('stopped')}
  },[feedback.stop,entrance.cancel])
  useEffect(()=>{
    alive.current=true
    const hidden=()=>{if(document.hidden)cancel()}
    window.addEventListener('blur',cancel);window.addEventListener('nextport:playground-menu-open',cancel);document.addEventListener('visibilitychange',hidden)
    return()=>{alive.current=false;cancel();window.removeEventListener('blur',cancel);window.removeEventListener('nextport:playground-menu-open',cancel);document.removeEventListener('visibilitychange',hidden)}
  },[cancel])
  useEffect(()=>{cancel();if(alive.current)setPhase('idle')},[locale,feedback.settings.enabled,cancel])
  function revealStage(){
    if(window.matchMedia('(max-width:800px), (max-height:500px)').matches)stage.current?.scrollIntoView({block:'start',inline:'nearest',behavior:'auto'})
  }
  async function prepare(){cancel();const ticket=request.current;setPhase('preparing');try{await feedback.prepare()}catch{/* The audio status identifies a failed preparation. */}if(alive.current&&ticket===request.current&&!document.hidden)setPhase('idle')}
  async function playEntrance(){
    cancel()
    const ticket=request.current
    setSelected({key:'entrance',ko:'타석 입장',en:'Batter entrance'});setPhase('preparing')
    // This explicit development sample waits for its separate optional clip.
    // Real entry uses the hook's500ms deadline without holding gameplay.
    try{await feedback.prepareEntrance()}catch{/* The visual introduction still works. */}
    if(!alive.current||ticket!==request.current||document.hidden)return
    revealStage()
    const token=entrance.prepare()
    entrance.enter(token,{name:locale==='en'?'JIHOON':'최지훈',jerseyNumber:'07',teamId:'heroes',handedness:'right'})
    setEventCount(value=>value+1);setPhase('playing')
    const timer=setTimeout(()=>{
      timers.current.delete(timer)
      if(alive.current&&ticket===request.current&&!document.hidden)setPhase('complete')
    },BASEBALL_ENTRANCE.durationMs+50)
    timers.current.add(timer)
  }
  async function play(sample){
    cancel()
    const ticket=request.current
    setSelected(sample);setPhase('preparing')
    // Unlock is invoked in this click. Only the synthetic preview waits for loading.
    try{await feedback.prepare()}catch{/* Continue with the visual preview only. */}
    if(!alive.current||ticket!==request.current||document.hidden)return
    revealStage()
    const serial=++sequence.current,id=`baseball-effects-preview:${serial}`,pitchId=`preview:${serial}`
    setEventCount(value=>value+1);setPhase('playing')
    const current=()=>alive.current&&ticket===request.current&&!document.hidden
    const later=(delay,work)=>{const timer=setTimeout(()=>{timers.current.delete(timer);if(current())work()},delay);timers.current.add(timer)}
    const send=events=>{if(!current())return;gate.current.take(events,performance.now()).forEach(value=>{
      feedback.emit(value)
      if(value.type==='contact'){
        setContact(value);later(220,()=>setContact(null))
        const boost=homeRunVariant==='arcade'?getBaseballContactBoostPresentation({effect:value,nowMs:performance.now(),strength:feedback.settings.strength}):null
        if(boost){setContactBoost(value);later(boost.remainingMs,()=>setContactBoost(active=>active?.id===value.id?null:active))}
      }
      if(value.type==='call'){setCaption(value.call);later(1000,()=>setCaption(null))}
    })}
    const physical=(type,extra={})=>send([{id:`${id}:${type}`,type,atMs:performance.now(),origin:'preview',mode:'at-bat',channel:'effects',...extra}])
    const call=value=>send([{id:`${id}:call:${value}`,type:'call',call:value,atMs:performance.now(),origin:'preview',mode:'at-bat',channel:'voice',confirmed:true}])
    const result=outcome=>send(getBaseballResultFeedbackEvents({scopeId:'effects-preview',pitchId,mode:'at-bat',origin:'preview',authority:'preview',confirmed:true,confirmedAtMs:performance.now(),
      result:{outcome:outcome==='strikeout-swinging'?'miss':'perfect',contacted:outcome!=='strikeout-swinging',quality:.95,distanceM:outcome==='home-run'?135:outcome==='strikeout-swinging'?0:42,exitSpeedKmh:outcome==='home-run'?165:outcome==='strikeout-swinging'?0:118},
      terminalOutcome:outcome,fieldResult:outcome==='strikeout-swinging'?null:{outcome},countAfter:outcome==='strikeout-swinging'?{balls:0,strikes:3}:null}))
    let finishAfter=1000
    if(sample.type==='scenario'){
      if(sample.key==='strikeout'){
        physical('swing');later(160,()=>physical('pass'));later(240,()=>physical('mitt'));later(430,()=>result('strikeout-swinging'));finishAfter=1900
      }else{
        physical('contact',{quality:sample.key==='foul'?.65:.95,outcome:sample.key==='foul'?'foul':'perfect'})
        if(sample.key==='foul'){later(300,()=>call('foul'));finishAfter=1500}
        if(sample.key==='hit'){later(650,()=>result('single'));finishAfter=3200}
        if(sample.key==='home-run'){later(950,()=>result('home-run'));finishAfter=3600}
      }
    }else if(sample.type==='result'){result(sample.outcome);finishAfter=2600}
    else if(sample.type==='call')call(sample.call)
    else if(sample.type==='miss-sequence'){physical('swing');later(120,()=>physical('pass'));later(200,()=>physical('mitt'))}
    else physical(sample.type,sample.type==='contact'?{quality:sample.quality,outcome:sample.key==='perfect'?'perfect':'contact'}:{})
    later(finishAfter,()=>setPhase('complete'))
  }
  const latest=feedback.lastEvent
  const record=latest?{type:latest.type,outcome:latest.outcome||null,call:latest.call||null,quality:latest.quality??null,origin:latest.origin,confirmed:latest.confirmed===true}:null
  return <section className={styles.preview} data-baseball-effects-preview>
    <header><div><p className={styles.previewKicker}>{text.kicker}</p><h1>{text.title}</h1></div><Link href="/playground/baseball/at-bat" prefetch={false}>← {text.back}</Link></header>
    <p>{text.intro}</p><BaseballFeedbackPanel locale={locale} feedback={feedback} onOpen={cancel} />
    <div className={styles.previewLayout}>
      <div><div ref={stage} className={styles.previewStage} data-feedback-preview-stage aria-label={text.badge}>
        <span className={styles.previewPoint} />
        {contact&&feedback.settings.strength!=='off'&&<span key={`contact-ring:${contact.id}`} className={styles.previewRing} data-perfect={contact.outcome==='perfect'} />}
        {homeRunVariant==='arcade'&&contactBoost&&<BaseballContactBoostOverlay key={`contact-boost:${contactBoost.id}`} effect={contactBoost} strength={feedback.settings.strength} />}
        <BaseballFeedbackOverlay locale={locale} effect={feedback.lastEvent} strength={feedback.settings.strength} homeRunVariant={homeRunVariant} />
        <BaseballEntranceOverlay locale={locale} intro={entrance.intro} strength={feedback.settings.strength} />
        {caption&&<span className={styles.previewCaption} aria-hidden="true">{text.captions[caption]||caption}</span>}
        <span className={styles.previewBadge}>{text.badge}</span>
      </div><p style={{marginTop:12}}>{text.body}</p></div>
      <section className={styles.previewControls}>
        <h2>{text.samples}</h2><div className={styles.previewTools}><button type="button" className={styles.prepareButton} onClick={()=>void prepare()}>{text.prepare}</button><button type="button" className={styles.stopButton} onClick={cancel} aria-label={text.stop}>{text.stop}</button></div>
        <button type="button" className={styles.entrancePreview} data-baseball-effect-entrance onClick={()=>void playEntrance()}><span>{locale==='en'?'Batter entrance':'타석 입장'}</span><small>{locale==='en'?'Prepare optional sound → example introduction':'선택 음원 준비 → 예시 선수 소개'}</small></button>
        <fieldset className={styles.homeRunComparison} data-baseball-home-run-comparison>
          <legend>{homeRunText.legend}</legend>
          <div className={styles.comparisonOptions}>{['classic','arcade'].map(value=><button key={value} type="button" data-baseball-home-run-variant={value} aria-pressed={homeRunVariant===value} onClick={()=>{if(value===homeRunVariant)return;cancel();setHomeRunVariant(value)}}>{homeRunText[value]}</button>)}</div>
          <p>{homeRunText.hint}</p>
        </fieldset>
        <div className={styles.scenarioButtons}>{scenarios.map(sample=><button type="button" key={sample.key} data-kind={sample.key} data-baseball-effect-scenario={sample.key} onClick={()=>void play(sample)}>{sample[locale]||sample.ko}<small>{sample.key==='strikeout'?(locale==='en'?'Swing → mitt → call':'스윙 → 미트 → 콜'):sample.key==='foul'?(locale==='en'?'Contact → caption':'접촉 → 자막'):homeRunVariant==='arcade'&&sample.key==='home-run'?(locale==='en'?'Contact burst → home-run burst':'타격 가속 → 홈런 가속'):homeRunVariant==='arcade'?(locale==='en'?'Contact burst → crowd':'타격 가속 → 관중'):(locale==='en'?'Contact → crowd':'접촉 → 관중')}</small></button>)}</div>
        <p className={styles.sampleStatus} role="status">{phase==='preparing'?text.preparing:phase==='playing'?text.playing:phase==='stopped'?text.stopped:phase==='complete'?text.complete:selected?`${text.selected}: ${selected[locale]||selected.ko}`:text.idle}</p>
        <p>{text.note}</p>
        <details className={styles.individualSounds}><summary>{text.individual}</summary><div className={styles.fixtureButtons}>{cases.map(sample=><button type="button" key={sample.key} data-kind={sample.key} data-baseball-effect-fixture={sample.key} onClick={()=>void play(sample)}>{sample[locale]||sample.ko}</button>)}</div></details>
        <div className={styles.sampleData}><code data-baseball-feedback-preview-log>{JSON.stringify({samples:eventCount,sequence:phase,selection:selected?.key||null,homeRunVariant,contactBoost:contactBoost?{outcome:contactBoost.outcome,atMs:contactBoost.atMs,durationMs:BASEBALL_CONTACT_BOOST_DURATION_MS}:null,lastEvent:record,entrance:entrance.intro?{origin:entrance.intro.origin,player:entrance.intro.player,startAt:entrance.intro.startAt}:null,audio:feedback.diagnostics},null,2)}</code></div>
      </section>
    </div>
  </section>
}
