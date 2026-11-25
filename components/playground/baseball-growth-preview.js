import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import BaseballScene from './baseball-scene'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, createBaseballPitch, getBaseballPitchSpeed, sampleBaseballBat, sampleBaseballPlatePassage } from '@/lib/playground-baseball.mjs'
import { compareBaseballGrowthPreview, BASEBALL_GROWTH_PREVIEW_RULES } from '@/lib/playground-baseball-growth-preview.mjs'
import { createBaseballFieldPresentation } from '@/lib/playground-baseball-field-presentation.mjs'
import { getBaseballTeam } from '@/lib/playground-baseball-teams.mjs'
import styles from '@/styles/playground-baseball-growth-preview.module.css'

const LEVELS=Object.freeze([40,70,100])
const INITIAL=Object.freeze({mode:'mit',pitchType:'four-seam',baseSpeedKmh:100,pitcher:'right',batter:'right',timing:0,dx:0,dy:-7.5})
const PRESETS=Object.freeze({center:{timing:0,dx:0,dy:0},edge70:{timing:0,dx:0,dy:-7.5},edge100:{timing:0,dx:0,dy:-7.95},outside:{timing:0,dx:0,dy:-9},foul:{timing:80,dx:0,dy:0},late:{timing:120,dx:0,dy:0}})
const TEAM=getBaseballTeam('heroes')
const copy={
  ko:{title:'성장이 만드는 작은 차이.',kicker:'BATTING LAB · GROWTH COMPARISON',intro:'같은 공과 같은 스윙을 40·70·100으로 비교합니다. 현재 선수에게 적용하기 전의 후보이며 선수·성적·경험치·DB에 저장하지 않습니다.',back:'선수 육성',badge:'개발 비교 · 저장 없음',controls:'비교 조건',mode:'비교할 능력',mit:'미트만',power:'파워만',both:'미트 + 파워',pitch:'구종',speed:'포심 기준 구속',pitcher:'투수',batter:'타석',rightPitcher:'우투',leftPitcher:'좌투',right:'우타',left:'좌타',preset:'경계 상황',presets:{center:'중앙 정타',edge70:'미트70 외곽',edge100:'미트100 외곽',outside:'모든 범위 밖',foul:'접촉 파울',late:'유효 시간 밖'},timing:'기준 스윙 시간차',timingHelp:'음수는 빠름, 양수는 늦음. 기준은 입력 후110ms입니다.',dx:'조준 좌우 차이',dy:'조준 높이 차이',offsetHelp:'공이 존 앞면을 지나는 위치를 기준으로 조준점을 이동합니다.',field:'같은 투구의 비교 재생',fieldHelp:'조작은 아래 버튼과 시간 탐색을 사용합니다. 선수 자세·공8cm·구종·구속은 기존과 같습니다. 음향과 실제 스윙 입력은 만들지 않습니다.',play:'같은 공 재생',pause:'멈춤',reset:'처음으로',contact:'판정 순간',end:'판정 결과',time:'존 통과 기준 시간',playing:'재생 중',paused:'정지 화면',complete:'재생 완료',selected:'선택한 화면',ability:'능력',preview:'이 능력 보기',radius:'접촉 허용 거리',powerMultiplier:'파워 배율',quality:'접촉 품질',exit:'타구 속도',distance:'예상 비거리',result:'수비 판정',assisted:'새 보조 접촉',baseContact:'기본 범위 접촉',noContact:'접촉 없음',saved:'저장하지 않음',geometry:'판정 순간의 실제 좌표',geometryHelp:'넓은 외곽선은 공 중심이 접촉으로 인정되는 범위입니다. 배트 자체가 커지는 것은 아닙니다.',baseRange:'기본 범위',grownRange:'선택한 성장 범위',bat:'실제 배트',ball:'공',aim:'고정 조준점',inactive:'유효 스윙 구간 밖 · 범위가 넓어져도 접촉하지 않습니다.',active:'같은 순간의 공 중심과 배트 선분으로 판정합니다.',guide:'미트는 접촉 허용 거리만 늘립니다. 새 외곽 접촉의 품질은 최대0.55이며 파워는 같은 품질의 타구 속도를 최대5% 보정합니다. 190km/h 상한과 기존 파울·수비 계산은 유지합니다.',cap:'190km/h 상한에 도달하면 파워가 높아도 속도는 더 늘지 않습니다.',noOutcomePromise:'더 강한 타구도 수비 위치에 따라 아웃이 될 수 있습니다. 예상 비거리와 실제 판정 지점은 구분합니다.',error:'비교 결과를 계산하지 못했습니다. 조건을 확인해 주세요. 기존 선수와 기록은 변경하지 않았습니다.',loading:'기존 경기장 이미지 준비 중',ready:'기존 경기장 이미지 준비됨',raw:'비교 계산 확인',pitches:{'four-seam':'포심',slider:'슬라이더',curveball:'커브',changeup:'체인지업'},outcomes:{miss:'헛스윙',foul:'파울',perfect:'정타',contact:'접촉',single:'단타',double:'2루타',triple:'3루타','home-run':'홈런',flyout:'뜬공 아웃',lineout:'직선타 아웃',groundout:'땅볼 아웃'},early:'빠름',late:'늦음',exact:'기준 일치'},
  en:{title:'Small gains. The same swing.',kicker:'BATTING LAB · GROWTH COMPARISON',intro:'Compare levels40,70 and100 with the same pitch and swing. These are proposed bonuses, not applied to your player. No player, statistics, XP or DB records are saved.',back:'Batter career',badge:'Development comparison · not saved',controls:'Comparison settings',mode:'Ability to compare',mit:'Contact only',power:'Power only',both:'Contact + power',pitch:'Pitch',speed:'Four-seam base speed',pitcher:'Pitcher',batter:'Batting side',rightPitcher:'Right-handed',leftPitcher:'Left-handed',right:'Right',left:'Left',preset:'Boundary examples',presets:{center:'Center contact',edge70:'Level70 edge',edge100:'Level100 edge',outside:'Outside all ranges',foul:'Foul contact',late:'Outside timing window'},timing:'Reference timing error',timingHelp:'Negative is early; positive is late. Reference contact is110ms after input.',dx:'Horizontal aim offset',dy:'Vertical aim offset',offsetHelp:'Offsets are measured from the ball at the front of the strike zone.',field:'Replay the same pitch',fieldHelp:'Use the buttons and time slider below. Existing poses,8cm ball and pitch speeds stay unchanged. This creates no audio or live swing inputs.',play:'Replay same pitch',pause:'Pause',reset:'Restart',contact:'Contact instant',end:'Field decision',time:'Time from zone passage',playing:'Playing',paused:'Paused frame',complete:'Playback complete',selected:'Selected view',ability:'Level',preview:'Show this level',radius:'Contact allowance',powerMultiplier:'Power multiplier',quality:'Contact quality',exit:'Exit speed',distance:'Estimated flight distance',result:'Field decision',assisted:'New assisted contact',baseContact:'Within base range',noContact:'No contact',saved:'Not saved',geometry:'Coordinates at judgment',geometryHelp:'The wide outline is the allowed range for the ball center. It does not enlarge the physical bat.',baseRange:'Base range',grownRange:'Selected growth range',bat:'Physical bat',ball:'Ball',aim:'Fixed aim point',inactive:'Outside the active swing window: a wider range cannot make contact.',active:'The ball center and bat segment use the same judgment instant.',guide:'Contact growth only expands the allowed distance. Newly assisted contact has a quality cap of0.55. Power adds up to5% exit speed at the same quality. The190km/h cap and existing foul and field rules remain.',cap:'Once the190km/h cap is reached, extra power cannot add speed.',noOutcomePromise:'A harder hit can still be caught. Estimated flight distance is separate from the actual field decision.',error:'The comparison could not be calculated. Check the settings. Existing players and records are unchanged.',loading:'Preparing existing ballpark images',ready:'Existing ballpark images ready',raw:'Inspect comparison calculation',pitches:{'four-seam':'Four-seam',slider:'Slider',curveball:'Curveball',changeup:'Changeup'},outcomes:{miss:'Miss',foul:'Foul',perfect:'Perfect contact',contact:'Contact',single:'Single',double:'Double',triple:'Triple','home-run':'Home run',flyout:'Flyout',lineout:'Lineout',groundout:'Groundout'},early:'early',late:'late',exact:'On reference'},
}
const n=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):'—'
const outcome=(row,text)=>text.outcomes[row.candidate.fieldResult?.outcome||row.candidate.result.outcome]||'—'

function RangeInput({label,value,min,max,step=1,unit,onChange,hint}){
  const id=useId(),formatted=`${n(value,step<1?2:0)}${unit}`
  return <label className={styles.inputGroup} htmlFor={id}><span className={styles.inputRow}><span>{label}</span><output htmlFor={id}>{formatted}</output>
    <input id={id} type='range' min={min} max={max} step={step} value={value} aria-valuetext={formatted} aria-describedby={hint?`${id}-hint`:undefined} onChange={event=>onChange(Number(event.target.value))}/></span>{hint&&<small id={`${id}-hint`}>{hint}</small>}
  </label>
}

function ContactGeometry({sample,selected,text}){
  const bat=sampleBaseballBat({swingElapsedMs:sample.passage.timeMs-sample.input.swingAtMs,aim:sample.input.aim,handedness:sample.input.handedness})
  const point=sample.passage.point,base=BASEBALL_RULES.batRadiusM+BASEBALL_RULES.ballRadiusM
  const coords=value=>({x:value.x*100,y:-value.y*100})
  const a=coords(bat.start),b=coords(bat.end),p=coords(point),aim=coords(sample.input.aim)
  const radius=selected.profile.contactRadiusM*100
  const left=Math.min(-30,a.x-radius,b.x-radius,p.x-4)-8,right=Math.max(30,a.x+radius,b.x+radius,p.x+4)+8
  const top=Math.min(-105,a.y-radius,b.y-radius,p.y-4)-8,bottom=Math.max(-45,a.y+radius,b.y+radius,p.y+4)+8
  const distance=selected.baseline.result.barrelClosestPoint?Math.hypot(point.x-selected.baseline.result.barrelClosestPoint.x,point.y-selected.baseline.result.barrelClosestPoint.y):null
  return <figure className={styles.focusGuide}>
    <figcaption className={styles.sectionTitle}>{text.geometry}</figcaption>
    <svg className={styles.geometry} viewBox={`${left} ${top} ${right-left} ${bottom-top}`} role='img' aria-label={`${text.geometry} · ${n(selected.profile.contactRadiusM*100,3)}cm`}>
      <rect x={BASEBALL_RULES.zone.left*100} y={-BASEBALL_RULES.zone.top*100} width={(BASEBALL_RULES.zone.right-BASEBALL_RULES.zone.left)*100} height={(BASEBALL_RULES.zone.top-BASEBALL_RULES.zone.bottom)*100} fill='none' stroke='#b6cdbb' strokeWidth='.4'/>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke='#4b9d80' strokeWidth={selected.profile.contactRadiusM*200} strokeLinecap='round' opacity='.55'/>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke='#e5d8a5' strokeWidth={base*200} strokeLinecap='round' opacity='.3'/>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke='#e5d8a5' strokeWidth={BASEBALL_RULES.batRadiusM*200} strokeLinecap='round'/>
      <circle cx={p.x} cy={p.y} r={BASEBALL_RULES.ballRadiusM*100} fill='#fffdf5' stroke='#152e24' strokeWidth='.7'/>
      <path d={`M ${aim.x-2} ${aim.y} H ${aim.x+2} M ${aim.x} ${aim.y-2} V ${aim.y+2}`} stroke='#76e7ef' strokeWidth='.7'/>
    </svg>
    <p className={styles.help}>{text.geometryHelp}</p>
    <p className={styles.reason}>{text.baseRange}:7.300cm · {text.grownRange}:{n(selected.profile.contactRadiusM*100,3)}cm</p>
    <p className={styles.reason}>{text===copy.en?'Ball center to bat segment':'공 중심에서 배트 선분까지'}:{n(distance===null?null:distance*100,3)}cm</p>
    <p className={styles.reason}>{bat.active?text.active:text.inactive}</p>
  </figure>
}

export default function BaseballGrowthPreview({locale='ko'}){
  const text=copy[locale]||copy.ko
  const [config,setConfig]=useState(INITIAL),[level,setLevel]=useState(70),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[visible,setVisible]=useState(true)
  const [asset,setAsset]=useState({ready:false,error:null}),[assetEpoch,setAssetEpoch]=useState(0)
  const [clientReady,setClientReady]=useState(false)
  const frame=useRef(null),clock=useRef(0)
  const stop=useCallback(()=>setPlaying(false),[])
  const assetsReady=useCallback((ready,error)=>{setAsset({ready,error:error?true:null});if(!ready)setPlaying(false)},[])
  const sample=useMemo(()=>{
    try{
      const pitch=createBaseballPitch({speedKmh:getBaseballPitchSpeed(config.baseSpeedKmh,config.pitchType),pitchType:config.pitchType,pitcherHandedness:config.pitcher,seed:20261125,target:{x:0,y:.75}})
      const passage=sampleBaseballPlatePassage(pitch)
      const input={swingAtMs:passage.timeMs-BASEBALL_RULES.swingContactMs+config.timing,aim:{x:config.dx/100,y:.75+config.dy/100},handedness:config.batter}
      const rows=LEVELS.map(value=>({level:value,...compareBaseballGrowthPreview({pitch,input,mit:config.mode==='power'?40:value,power:config.mode==='mit'?40:value})}))
      const contactClock=BASEBALL_RULES.windupMs+passage.timeMs
      const duration=contactClock+Math.max(1100,...rows.map(row=>row.candidate.fieldResult?.playTimeMs||0))+600
      return {pitch,passage,input,rows,contactClock,duration,error:null}
    }catch{return {error:true}}
  },[config])
  const selected=sample.error?null:sample.rows.find(row=>row.level===level)
  const fieldPresentation=useMemo(()=>selected?.candidate.fieldResult?createBaseballFieldPresentation(selected.candidate.fieldResult):null,[selected])
  const trajectory=useMemo(()=>fieldPresentation?{origin:'preview',authority:'preview',id:'growth-preview',presentation:fieldPresentation,startAt:sample.contactClock}:null,[fieldPresentation,sample.contactClock])
  // Exact diagnostic floats differ at the last bit between JS runtimes. Mount
  // this unsaved development lab after hydration; never round gameplay inputs
  // or suppress a hydration mismatch in its full-precision inspection record.
  useEffect(()=>{setClientReady(true)},[])
  useEffect(()=>{
    const hidden=()=>{setVisible(!document.hidden);if(document.hidden)stop()}
    window.addEventListener('blur',stop);window.addEventListener('nextport:playground-menu-open',stop);document.addEventListener('visibilitychange',hidden)
    hidden()
    return()=>{window.removeEventListener('blur',stop);window.removeEventListener('nextport:playground-menu-open',stop);document.removeEventListener('visibilitychange',hidden)}
  },[stop])
  useEffect(()=>{stop()},[locale,stop])
  useEffect(()=>{
    if(!playing||sample.error||!asset.ready)return undefined
    const start=performance.now()-clock.current
    const tick=now=>{const next=Math.min(sample.duration,now-start);clock.current=next;setTime(next);if(next<sample.duration)frame.current=requestAnimationFrame(tick);else setPlaying(false)}
    frame.current=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(frame.current)
  },[playing,sample,asset.ready])
  function seek(next){stop();clock.current=next;setTime(next)}
  function update(patch){seek(0);setConfig(old=>({...old,...patch}))}
  function play(){if(!asset.ready||sample.error)return;if(clock.current>=sample.duration){clock.current=0;setTime(0)}setPlaying(true)}
  if(process.env.NODE_ENV!=='development')return null
  if(!clientReady)return <section className={styles.preview}><p role='status'>{locale==='en'?'Preparing growth comparison.':'성장 비교를 준비하고 있습니다.'}</p></section>
  return <section className={styles.preview} data-baseball-growth-preview data-saved='false' onKeyDownCapture={event=>{if(event.target.closest('button')&&(event.repeat||event.nativeEvent.isComposing)&&['Space','Enter'].includes(event.code))event.preventDefault()}}>
    <header className={styles.heading}><div><p className={styles.kicker}>{text.kicker}</p><h1>{text.title}</h1></div><nav aria-label={text.controls}><a href='#growth-field'>{locale==='en'?'Ballpark':'경기장'}</a><a href='#growth-cards'>{locale==='en'?'Numbers & range':'수치·범위'}</a><Link href='/playground/baseball/career' prefetch={false}>← {text.back}</Link></nav></header>
    <p className={styles.notice}>{text.badge}</p><p className={styles.help}>{text.intro}</p>
    <div className={styles.layout}>
      <aside className={styles.controls} aria-label={text.controls}>
        <h2 className={styles.sectionTitle}>{text.controls}</h2>
        <fieldset><legend>{text.mode}</legend><div className={styles.modes}>{['mit','power','both'].map(mode=><button type='button' key={mode} aria-pressed={config.mode===mode} onClick={()=>update({mode})}>{text[mode]}</button>)}</div></fieldset>
        <label>{text.pitch}<select value={config.pitchType} onChange={event=>update({pitchType:event.target.value})}>{BASEBALL_PITCH_TYPES.map(type=><option key={type.id} value={type.id}>{text.pitches[type.id]}</option>)}</select></label>
        <label>{text.speed}<select value={config.baseSpeedKmh} onChange={event=>update({baseSpeedKmh:Number(event.target.value)})}>{[80,100,120,140,160].map(value=><option key={value} value={value}>{value}km/h</option>)}</select></label>
        <div className={styles.inputRow}><label>{text.pitcher}<select value={config.pitcher} onChange={event=>update({pitcher:event.target.value})}><option value='right'>{text.rightPitcher}</option><option value='left'>{text.leftPitcher}</option></select></label><label>{text.batter}<select value={config.batter} onChange={event=>update({batter:event.target.value})}><option value='right'>{text.right}</option><option value='left'>{text.left}</option></select></label></div>
        <fieldset><legend>{text.preset}</legend><div className={styles.presets}>{Object.entries(PRESETS).map(([key,value])=><button type='button' key={key} data-growth-preset={key} aria-pressed={config.timing===value.timing&&config.dx===value.dx&&config.dy===value.dy} onClick={()=>update(value)}>{text.presets[key]}</button>)}</div></fieldset>
        <RangeInput label={text.timing} value={config.timing} min={-140} max={140} unit='ms' onChange={timing=>update({timing})} hint={text.timingHelp}/>
        <RangeInput label={text.dx} value={config.dx} min={-45} max={45} step={.05} unit='cm' onChange={dx=>update({dx})}/>
        <RangeInput label={text.dy} value={config.dy} min={-20} max={20} step={.05} unit='cm' onChange={dy=>update({dy})} hint={text.offsetHelp}/>
        <p className={styles.help}>{text.guide}</p>
      </aside>
      <div className={styles.fieldColumn}>
        {sample.error?<p className={styles.error} role='alert'>{text.error}</p>:<>
          <div className={styles.stageMeta} id='growth-field'><h2 className={styles.sectionTitle}>{text.field}</h2><span>{text.selected}:{level} · {sample.pitch.speedKmh}km/h</span></div>
          <div inert='' aria-hidden='true'>
            <BaseballScene key={assetEpoch} mainClassName={styles.field} pitch={sample.pitch} pitchStartAt={0} swingAt={sample.input.swingAtMs} swingAim={sample.input.aim} aim={sample.input.aim}
              result={selected.candidate.result} resultAt={sample.contactClock} phase={time<BASEBALL_RULES.windupMs?'windup':time<sample.contactClock?'flight':'result'}
              handedness={config.batter} team={TEAM} jerseyNumber='07' locale={locale} onAssetsReady={assetsReady} focusEnabled={false} observationEnabled={false} renderEnabled={visible}
              presentationTime={time} comparisonPreview enablePostplay fieldTrajectory={trajectory}/>
          </div>
          <p className={styles.help}>{text.fieldHelp}</p>
          <div className={styles.playback}><button type='button' disabled={!asset.ready||playing} onClick={play}>{text.play}</button><button type='button' disabled={!playing} onClick={stop}>{text.pause}</button><button type='button' onClick={()=>seek(0)}>{text.reset}</button><button type='button' onClick={()=>seek(sample.contactClock)}>{text.contact}</button><button type='button' onClick={()=>seek(sample.duration)}>{text.end}</button></div>
          <RangeInput label={text.time} value={Math.round(time-sample.contactClock)} min={-Math.ceil(sample.contactClock)} max={Math.ceil(sample.duration-sample.contactClock)} unit='ms' onChange={value=>seek(Math.max(0,Math.min(sample.duration,value+sample.contactClock)))}/>
          <p className={styles.reason} role='status'>{asset.error?(locale==='en'?'The ballpark images could not be prepared.':'경기장 이미지를 준비하지 못했습니다.'):!asset.ready?text.loading:playing?text.playing:time>=sample.duration?text.complete:text.paused}</p>
          {asset.error&&<button type='button' onClick={()=>{seek(0);setAsset({ready:false,error:null});setAssetEpoch(value=>value+1)}}>{locale==='en'?'Retry images':'이미지 다시 준비'}</button>}
          <div className={styles.cards} id='growth-cards' aria-label={text.ability}>{sample.rows.map(row=><article key={row.level} className={styles.card} data-selected={row.level===level} data-growth-level={row.level}>
            <header className={styles.cardHeader}><strong>{text.ability} {row.level}</strong><button type='button' aria-label={`${text.preview} ${row.level}`} aria-pressed={level===row.level} onClick={()=>{stop();setLevel(row.level)}}>{text.preview}</button></header>
            <p className={styles.reason}>{locale==='en'?'Contact':'미트'} {row.profile.mit} · {locale==='en'?'Power':'파워'} {row.profile.power}</p>
            <p className={styles.reason}>{row.assisted?text.assisted:row.candidate.result.contacted?text.baseContact:text.noContact}</p>
            <dl className={styles.metrics}>{[[text.radius,`${n(row.profile.contactRadiusM*100,3)}cm`],[text.powerMultiplier,`×${n(row.profile.powerMultiplier,3)}`],[text.quality,n(row.candidate.result.quality,3)],[text.exit,`${n(row.candidate.result.exitSpeedKmh)}km/h`],[text.distance,`${n(row.candidate.result.distanceM)}m`],[text.result,outcome(row,text)]].map(([label,value])=><div className={styles.metric} key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          </article>)}</div>
          <p className={styles.compareSummary}>{text.noOutcomePromise} {sample.rows.some(row=>row.candidate.result.exitSpeedKmh>=190)?text.cap:''}</p>
          <ContactGeometry sample={sample} selected={selected} text={text}/>
          <details className={styles.raw}><summary>{text.raw}</summary><pre data-baseball-growth-preview-records>{JSON.stringify({origin:'preview',saved:false,policy:BASEBALL_GROWTH_PREVIEW_RULES,pitch:sample.pitch,input:sample.input,rows:sample.rows.map(row=>({level:row.level,profile:row.profile,assisted:row.assisted,result:row.candidate.result,fieldResult:row.candidate.fieldResult?{outcome:row.candidate.fieldResult.outcome,reason:row.candidate.fieldResult.reasonKey,decisionPoint:row.candidate.fieldResult.decisionPoint}:null}))},null,2)}</pre></details>
        </>}
      </div>
    </div>
  </section>
}
