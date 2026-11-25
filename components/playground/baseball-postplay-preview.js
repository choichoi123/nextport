import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BaseballScene from './baseball-scene'
import { BASEBALL_RULES, createBaseballPitch, judgeBaseballSwing } from '@/lib/playground-baseball.mjs'
import { resolveBaseballFieldResult } from '@/lib/playground-baseball-field.mjs'
import { createBaseballFieldPresentation } from '@/lib/playground-baseball-field-presentation.mjs'
import { BASEBALL_TEAMS, getBaseballTeam } from '@/lib/playground-baseball-teams.mjs'
import styles from '@/styles/playground-baseball-postplay.module.css'

const CONTACT_CLOCK=10000, INITIAL_TIME=-250
const target={x:0,y:.75}
const copy={
  ko:{title:'타구와 다음 걸음.',kicker:'BATTING LAB · POSTPLAY PREVIEW',intro:'기존 수비 모델로 계산한 예시 결과와 새 동작을 비교합니다. 실제 투구·성적·성장·DB 저장은 만들지 않습니다.',back:'한 타석 연습',sound:'음향 시안',cases:'예시 상황',hand:'타석',right:'우타',left:'좌타',team:'구단',number:'등번호',numberError:'0~99의 숫자로 입력해 주세요.',play:'재생',pause:'일시정지',reset:'처음으로',time:'접촉 기준 표시 시간',speed:'재생 속도',focus:'확대 타격',strength:'동작',normal:'기본',reduced:'줄이기',off:'끄기',ready:'기존 이미지 준비됨',loading:'기존 이미지 준비 중',extraReady:'후속 동작 준비됨',extraLoading:'후속 동작은 별도로 준비합니다.',noSound:'이 화면은 시각 비교 전용입니다. 음향은 별도 시안에서 비교할 수 있습니다.',noAutoplay:'상황을 바꿔도 자동 재생하지 않습니다. 타구·결과 시간은 예시의 기존 수비 계산을 따릅니다.',badge:'개발용 예시 결과 · 저장하지 않음',contact:'접촉',lower:'배트 내림',steps:'첫걸음',decision:'판정 시점',review:'표시 자료',reason:{'over-fence':'공중 담장 통과','ground-rule-double':'바운드 뒤 담장 밖 · 인정2루타','throw-beats-runner':'1루 송구가 주자보다 빠름','caught-fly':'땅에 닿기 전 포구',strikeout:'예시 삼진 확정 후 반응'},outcomes:{'home-run':'홈런',double:'인정2루타',groundout:'땅볼 아웃',flyout:'뜬공 아웃','strikeout-swinging':'헛스윙 삼진'}},
  en:{title:'The ball. The next step.',kicker:'BATTING LAB · POSTPLAY PREVIEW',intro:'Compare example results computed by the existing field model and the new whole-body motion. This creates no real pitch, statistics, growth or DB records.',back:'At-bat practice',sound:'Sound preview',cases:'Example scenarios',hand:'Batting side',right:'Right',left:'Left',team:'Club',number:'Jersey number',numberError:'Enter a number from 0 to 99.',play:'Play',pause:'Pause',reset:'Restart',time:'Display time from contact',speed:'Playback speed',focus:'Batting close-up',strength:'Motion',normal:'Normal',reduced:'Reduced',off:'Off',ready:'Base images ready',loading:'Preparing base images',extraReady:'Extra motion ready',extraLoading:'Extra motion loads separately.',noSound:'Visual comparison only. Use the separate sound preview to compare audio.',noAutoplay:'Changing a scenario never starts playback. Ball and decision times follow the example’s existing field calculation.',badge:'Development example result · not saved',contact:'Contact',lower:'Lower bat',steps:'First steps',decision:'Decision time',review:'Display details',reason:{'over-fence':'Cleared the fence in the air','ground-rule-double':'Bounced out of play · ground-rule double','throw-beats-runner':'Throw reached first before runner','caught-fly':'Caught before touching ground',strikeout:'Reaction after an example confirmed strikeout'},outcomes:{'home-run':'Home run',double:'Ground-rule double',groundout:'Groundout',flyout:'Flyout','strikeout-swinging':'Swinging strikeout'}},
}

function fixtures(){
  const pitch=createBaseballPitch({speedKmh:130,seed:20261125,target,pitcherHandedness:'right'})
  const batted=(speed,angle,direction)=>{
    const radians=angle*Math.PI/180,vertical=speed/3.6*Math.sin(radians),height=.75
    const landingTimeMs=(vertical+Math.sqrt(vertical**2+2*BASEBALL_RULES.gravityMps2*height))/BASEBALL_RULES.gravityMps2*1000
    return {contacted:true,outcome:'contact',quality:.9,exitSpeedKmh:speed,launchAngleDeg:angle,directionDeg:direction,
      contactPoint:{x:0,y:height,z:0},contactAtMs:pitch.flightTimeMs,landingTimeMs,
      distanceM:speed/3.6*Math.cos(radians)*landingTimeMs/1000,timingErrorMs:0}
  }
  const fieldCases=[['home-run',140,28,-45],['ground-rule-double',130,36,-35],['groundout',40,-28,-45],['flyout',40,40,-5]].map(([key,speed,angle,direction])=>{
    const result=batted(speed,angle,direction),field=resolveBaseballFieldResult(result),presentation=createBaseballFieldPresentation(field)
    if(!presentation||field.outcome!==(key==='ground-rule-double'?'double':key)||key==='ground-rule-double'&&field.reasonKey!=='ground-rule-double')throw new Error('The development field example could not be prepared.')
    return {key,pitch,result,field,presentation,aim:target,outcome:field.outcome,reason:field.reasonKey,duration:field.playTimeMs+900}
  })
  const missAim={x:.65,y:1.4},miss=judgeBaseballSwing(pitch,{swingAtMs:pitch.flightTimeMs-BASEBALL_RULES.swingContactMs,aim:missAim,handedness:'right'})
  if(miss.contacted)throw new Error('The development strikeout example must miss the ball.')
  return [...fieldCases,{key:'strikeout',pitch,result:miss,field:null,presentation:null,aim:missAim,outcome:'strikeout-swinging',reason:'strikeout',duration:2100}]
}

export default function BaseballPostplayPreview({locale='ko'}){
  const text=copy[locale]||copy.ko,examples=useMemo(fixtures,[])
  const [caseKey,setCaseKey]=useState('home-run'),[hand,setHand]=useState('right'),[teamId,setTeamId]=useState('heroes'),[number,setNumber]=useState('07')
  const [elapsed,setElapsed]=useState(INITIAL_TIME),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[focus,setFocus]=useState(false),[strength,setStrength]=useState('normal')
  const [assetsReady,setAssetsReady]=useState(false),[assetError,setAssetError]=useState(''),[extraAssets,setExtraAssets]=useState('idle')
  const host=useRef(null),time=useRef(INITIAL_TIME)
  const sample=examples.find(value=>value.key===caseKey)||examples[0],team=getBaseballTeam(teamId),validNumber=/^[0-9]{1,2}$/.test(number.trim())
  const stop=useCallback(()=>setPlaying(false),[])
  const seek=value=>{stop();time.current=value;setElapsed(value)}
  const ready=useCallback((value,error)=>{setAssetsReady(value);setAssetError(error||'');if(!value)setPlaying(false)},[])
  useEffect(()=>{
    const hidden=()=>{if(document.hidden)stop()}
    window.addEventListener('blur',stop);window.addEventListener('nextport:playground-menu-open',stop);document.addEventListener('visibilitychange',hidden)
    return()=>{window.removeEventListener('blur',stop);window.removeEventListener('nextport:playground-menu-open',stop);document.removeEventListener('visibilitychange',hidden)}
  },[stop])
  useEffect(()=>{stop()},[locale,stop])
  useEffect(()=>{
    const root=host.current;if(!root)return
    const read=()=>setExtraAssets(root.querySelector('[data-postplay-assets]')?.getAttribute('data-postplay-assets')||'idle')
    read();const observer=new MutationObserver(read)
    observer.observe(root,{subtree:true,attributes:true,attributeFilter:['data-postplay-assets']})
    return()=>observer.disconnect()
  },[])
  useEffect(()=>{
    if(!playing)return
    let frame,previous=performance.now()
    const tick=now=>{
      const next=Math.min(sample.duration,time.current+(now-previous)*speed)
      previous=now;time.current=next;setElapsed(next)
      if(next>=sample.duration){setPlaying(false);return}
      frame=requestAnimationFrame(tick)
    }
    frame=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(frame)
  },[playing,speed,sample.duration])
  const trajectory=sample.presentation?{id:`postplay-preview:${sample.key}`,origin:'preview',authority:'preview',startAt:CONTACT_CLOCK,presentation:sample.presentation}:null
  const reaction=sample.presentation?null:{id:'postplay-preview:strikeout',origin:'preview',authority:'preview',confirmed:true,outcome:'strikeout-swinging',startAt:CONTACT_CLOCK+500}
  const phase=elapsed>=(sample.field?.playTimeMs??500)?'complete':'flight'
  const jumpPoints=[{label:text.contact,value:0},{label:text.lower,value:500},{label:text.steps,value:800},{label:text.decision,value:sample.field?.decisionPoint.timeMs??500}]
  const play=()=>{if(!assetsReady||!validNumber)return;if(time.current>=sample.duration){time.current=INITIAL_TIME;setElapsed(INITIAL_TIME)}setPlaying(true)}
  return <section ref={host} className={styles.preview} data-baseball-postplay-preview>
    <header className={styles.heading}><div><p className={styles.kicker}>{text.kicker}</p><h1>{text.title}</h1></div><nav><Link href="/playground/baseball/at-bat" prefetch={false}>{text.back} →</Link><Link href="/playground/baseball/effects" prefetch={false}>{text.sound} →</Link></nav></header>
    <p className={styles.intro}>{text.intro}</p>
    <div className={styles.layout}>
      <div className={styles.stageColumn}>
        <div className={styles.badge}>{text.badge}</div>
        <BaseballScene mainClassName={styles.field} focusEnabled={focus} pitch={sample.pitch}
          pitchStartAt={CONTACT_CLOCK-BASEBALL_RULES.windupMs-sample.pitch.flightTimeMs}
          swingAt={sample.pitch.flightTimeMs-BASEBALL_RULES.swingContactMs} swingAim={sample.aim} aim={sample.aim}
          result={sample.result} resultAt={sample.presentation?CONTACT_CLOCK:null} phase={phase} handedness={hand} team={team}
          jerseyNumber={validNumber?number.trim():'7'} locale={locale} onAssetsReady={ready} feedbackStrength={strength}
          fieldTrajectory={trajectory} postplayReaction={reaction} enablePostplay observationEnabled={false} presentationTime={CONTACT_CLOCK+elapsed} />
        <div className={styles.playback}><button type="button" disabled={!assetsReady||!validNumber} onClick={playing?stop:play} aria-pressed={playing}>{playing?text.pause:text.play}</button><button type="button" onClick={()=>seek(INITIAL_TIME)}>{text.reset}</button><label>{text.speed}<select value={speed} onChange={event=>setSpeed(Number(event.target.value))}><option value={.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label></div>
        <label className={styles.timeline}>{text.time}<output>{(elapsed/1000).toFixed(2)} s</output><input type="range" min={INITIAL_TIME} max={sample.duration} step={10} value={elapsed} onChange={event=>seek(Number(event.target.value))} /></label>
        <div className={styles.jumps}>{jumpPoints.map((point,index)=><button type="button" key={index} onClick={()=>seek(point.value)}>{point.label}</button>)}</div>
      </div>
      <aside className={styles.controls}>
        <h2>{text.cases}</h2><div className={styles.cases}>{examples.map(value=><button type="button" key={value.key} data-baseball-postplay-case={value.key} aria-pressed={caseKey===value.key} onClick={()=>{setCaseKey(value.key);seek(INITIAL_TIME)}}>{text.outcomes[value.outcome]}</button>)}</div>
        <p className={styles.reason}>{text.reason[sample.reason]}</p>
        <fieldset><legend>{text.hand}</legend><div className={styles.segments}>{['right','left'].map(value=><button type="button" key={value} aria-pressed={hand===value} onClick={()=>{stop();setHand(value)}}>{text[value]}</button>)}</div></fieldset>
        <div className={styles.playerGrid}><label>{text.team}<select value={teamId} onChange={event=>{stop();setTeamId(event.target.value)}}>{BASEBALL_TEAMS.map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select></label><label>{text.number}<input value={number} inputMode="numeric" maxLength={2} aria-invalid={!validNumber} aria-describedby={!validNumber?'postplay-number-error':undefined} onChange={event=>{stop();setNumber(event.target.value)}} /></label></div>
        {!validNumber&&<p className={styles.error} id="postplay-number-error" role="alert">{text.numberError}</p>}
        <label className={styles.check}><input type="checkbox" checked={focus} onChange={event=>setFocus(event.target.checked)} />{text.focus}</label>
        <label className={styles.motion}>{text.strength}<select value={strength} onChange={event=>setStrength(event.target.value)}><option value="normal">{text.normal}</option><option value="reduced">{text.reduced}</option><option value="off">{text.off}</option></select></label>
        <p className={styles.status} role="status">{assetError||`${assetsReady?text.ready:text.loading} · ${extraAssets==='ready'?text.extraReady:text.extraLoading}`}</p>
        <p>{text.noAutoplay}</p><p>{text.noSound}</p>
        <details><summary>{text.review}</summary><pre data-baseball-postplay-preview-log>{JSON.stringify({scenario:sample.key,outcome:sample.outcome,reason:sample.reason,elapsedMs:Math.round(elapsed),phase,playing,baseImagesReady:assetsReady,postplayAssets:extraAssets,origin:'preview',saved:false},null,2)}</pre></details>
      </aside>
    </div>
  </section>
}
