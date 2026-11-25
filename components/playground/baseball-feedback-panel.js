import Link from 'next/link'
import { useEffect, useId, useState } from 'react'
import BaseballHomeRunOverlay from './baseball-home-run-overlay'
import styles from '@/styles/playground-baseball-feedback.module.css'

const copy={
  ko:{on:'소리 켜짐',off:'소리 꺼짐',settings:'소리·연출',title:'경기장 소리와 연출',master:'전체 음량',effects:'타격·효과음',call:'심판 콜',crowd:'관중',entrance:'입장 효과음',entranceHint:'입장 효과음을 꺼도 이름·등번호 소개는 표시합니다.',entranceIdle:'입장 효과음은 새 타석 입장 때 별도로 준비합니다.',entranceLoading:'입장 효과음을 준비하고 있습니다.',entranceReady:'입장 효과음 준비 완료',entranceUnavailable:'입장 효과음 없이도 소개와 타격은 계속할 수 있습니다.',entranceRetry:'입장 효과음 다시 준비',strength:'연출 강도',normal:'기본',subtle:'약하게',none:'끄기',preview:'효과 시안',retry:'소리 다시 준비',idle:'투구 시작 또는 소리 버튼을 누르면 준비합니다.',loading:'효과음을 준비하고 있습니다. 타격은 계속할 수 있습니다.',ready:'효과음 준비 완료',partial:'일부 소리를 준비하지 못했습니다. 준비된 소리로 계속할 수 있습니다.',unavailable:'소리를 준비하지 못했습니다. 무음으로 타격할 수 있습니다.',note:'심판 콜은 성우가 녹음한 영어 음성입니다. 판정 문구는 선택한 언어로 표시합니다.',credits:'음원 출처·사용 조건'},
  en:{on:'Sound on',off:'Sound off',settings:'Sound & effects',title:'Ballpark sound and effects',master:'Master volume',effects:'Bat & effects',call:'Umpire calls',crowd:'Crowd',entrance:'Entrance sound',entranceHint:'The name and jersey introduction remains visible with the entrance sound off.',entranceIdle:'The entrance sound prepares separately for a new at-bat.',entranceLoading:'Preparing the entrance sound.',entranceReady:'Entrance sound ready',entranceUnavailable:'Introductions and batting continue without the entrance sound.',entranceRetry:'Prepare entrance sound again',strength:'Effect strength',normal:'Normal',subtle:'Subtle',none:'Off',preview:'Effects preview',retry:'Prepare sound again',idle:'Start a pitch or use the sound button to prepare audio.',loading:'Preparing sounds. Batting remains available.',ready:'Sounds ready',partial:'Some sounds are unavailable. Ready sounds can still play.',unavailable:'Sound is unavailable. You can keep batting silently.',note:'Umpire calls use recorded English voice acting. Decisions remain in your selected screen language.',credits:'Audio credits & licenses'},
}
const percent=value=>Math.round(Math.max(0,Math.min(1,Number.isFinite(value)?value:0))*100)

export default function BaseballFeedbackPanel({locale='ko',feedback,onOpen=null}){
  const text=copy[locale]||copy.ko,prefix=useId()
  if(!feedback)return null
  const {settings,status}=feedback
  const entranceStatus=feedback.entranceStatus||feedback.diagnostics?.entranceStatus||'idle'
  const statusText=!settings.enabled?text.off:status==='ready'?text.ready:status==='loading'?text.loading:status==='partial'?text.partial:status==='unavailable'||status==='error'?text.unavailable:text.idle
  function prepare(){void Promise.resolve(feedback.prepare()).catch(()=>{})}
  function toggle(){const enabled=!settings.enabled;feedback.setEnabled(enabled);if(enabled)prepare()}
  return <div className={styles.panel} data-baseball-feedback-controls>
    <button type="button" className={styles.toggle} aria-pressed={settings.enabled} onClick={toggle}>
      <span aria-hidden="true">{settings.enabled?'♪':'♩'}</span>{settings.enabled?text.on:text.off}
    </button>
    <details className={styles.preferences} onToggle={event=>{if(event.currentTarget.open)onOpen?.()}}>
      <summary>{text.settings}<span>{percent(settings.master)}%</span><span aria-hidden="true">⌄</span></summary>
      <div className={styles.popover}>
        <h3>{text.title}</h3>
        <div className={styles.levels}>{['master','effects','call','crowd'].map(channel=><label key={channel} htmlFor={`${prefix}-${channel}`}><span>{text[channel]}<output>{percent(settings[channel])}%</output></span><input id={`${prefix}-${channel}`} type="range" min="0" max="100" step="1" value={percent(settings[channel])} aria-valuetext={`${percent(settings[channel])}%`} onChange={event=>feedback.setVolume(channel,Number(event.target.value)/100)} /></label>)}</div>
        <label className={styles.entranceChoice}><input type="checkbox" checked={settings.entrance!==false} onChange={event=>feedback.setSettings({entrance:event.target.checked})} /><span>{text.entrance}<small>{text.entranceHint}</small></span></label>
        {settings.enabled&&settings.entrance!==false&&<><p className={styles.entranceStatus} role="status">{entranceStatus==='loading'?text.entranceLoading:entranceStatus==='ready'?text.entranceReady:['unavailable','blocked'].includes(entranceStatus)?text.entranceUnavailable:text.entranceIdle}</p>{['unavailable','blocked'].includes(entranceStatus)&&<button type="button" className={styles.retry} onClick={()=>void Promise.resolve(feedback.prepareEntrance()).catch(()=>{})}>{text.entranceRetry}</button>}</>}
        <fieldset><legend>{text.strength}</legend><div className={styles.strength}>{['normal','subtle','off'].map(value=><button type="button" key={value} aria-pressed={settings.strength===value} onClick={()=>feedback.setStrength(value)}>{value==='off'?text.none:text[value]}</button>)}</div></fieldset>
        <p className={styles.status} role="status">{statusText}</p>
        {settings.enabled&&['unavailable','error','idle','partial','blocked'].includes(status)&&<button type="button" className={styles.retry} onClick={prepare}>{text.retry}</button>}
        <p className={styles.note}>{text.note}</p>
        <p className={styles.note}>Wooden bat: <a href="https://freesound.org/people/CGEffex/sounds/93136/" target="_blank" rel="noreferrer">CGEffex</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a><br />Umpire: <a href="https://soundbible.com/tags-umpire.html" target="_blank" rel="noreferrer">Mike Koenig</a> · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a><br /><a href="/audio/playground/baseball/CREDITS.md" target="_blank" rel="noreferrer">{text.credits}</a></p>
        {process.env.NODE_ENV==='development'&&<Link className={styles.previewLink} href="/playground/baseball/effects" prefetch={false}>{text.preview} ↗</Link>}
      </div>
    </details>
  </div>
}

const resultCopy={
  ko:{'home-run':'홈런',single:'안타',double:'2루타',triple:'3루타',flyout:'뜬공 아웃',lineout:'직선타 아웃',groundout:'땅볼 아웃',walk:'볼넷','strikeout-looking':'삼진','strikeout-swinging':'삼진'},
  en:{'home-run':'HOME RUN',single:'SINGLE',double:'DOUBLE',triple:'TRIPLE',flyout:'FLYOUT',lineout:'LINEOUT',groundout:'GROUNDOUT',walk:'WALK','strikeout-looking':'STRIKEOUT','strikeout-swinging':'STRIKEOUT'},
}

/** Decorative only; the existing result region remains the accessible announcement. */
export function BaseballFeedbackOverlay({locale='ko',effect=null,strength='normal',homeRunVariant='classic'}){
  const [visible,setVisible]=useState(null)
  useEffect(()=>{
    setVisible(null)
    if(!effect||effect.type!=='result'||effect.confirmed!==true||!resultCopy.ko[effect.outcome]||strength==='off')return
    const duration=effect.outcome==='home-run'?1200:850
    const age=Number.isFinite(effect.atMs)?Math.max(0,performance.now()-effect.atMs):0
    if(age>=duration)return
    setVisible(effect)
    const timer=setTimeout(()=>setVisible(null),duration-age)
    return()=>clearTimeout(timer)
    // A new object for an acknowledged result must not restart its display clock.
  },[effect?.id,strength])
  if(!visible||visible.id!==effect?.id||strength==='off')return null
  const homeRun=visible.outcome==='home-run',text=(resultCopy[locale]||resultCopy.ko)[visible.outcome]
  if(homeRun&&homeRunVariant==='arcade')return <BaseballHomeRunOverlay effect={visible} locale={locale} strength={strength} />
  const details=[]
  if(Number.isFinite(visible.exitSpeedKmh)&&visible.exitSpeedKmh>0)details.push(`${Math.round(visible.exitSpeedKmh)} km/h`)
  if(Number.isFinite(visible.distanceM)&&visible.distanceM>0)details.push(`${locale==='en'?'Est.':'예상'} ${visible.distanceM.toFixed(1)} m`)
  return <div className={`${styles.overlay} ${homeRun?styles.homeRun:styles.result}`} data-baseball-feedback-overlay data-outcome={visible.outcome} data-strength={strength} aria-hidden="true">
    {homeRun&&<><div className={styles.halo} />{Array.from({length:8},(_,index)=><i key={index} className={styles.spark} style={{'--spark-index':index}} />)}</>}
    <div className={styles.banner}>
      {homeRun&&<><span className={styles.star}>✦</span><span className={styles.eyebrow}>OVER THE FENCE</span></>}
      <strong>{homeRun?'HOME RUN':text}</strong>
      {homeRun&&locale!=='en'&&<span className={styles.koreanTitle}>홈런</span>}
      {details.length>0&&<small>{details.join(' · ')}</small>}
    </div>
  </div>
}
