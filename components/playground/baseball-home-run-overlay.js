import { useEffect, useId, useState } from 'react'
import { getBaseballHomeRunPresentation } from '@/lib/playground-baseball-home-run.mjs'
import styles from '@/styles/playground-baseball-home-run.module.css'

// A fixed decorative pattern never consumes the game's random sequence.
const streaks=[
  'M0 92 L290 220','M0 304 L265 300','M105 600 L355 425',
  'M905 600 L645 425','M1000 355 L735 315','M490 0 L495 135',
  'M0 205 L280 265','M0 480 L300 365','M300 600 L410 450',
  'M690 600 L590 450','M1000 475 L710 370','M190 0 L365 170',
]
const sparks=[
  {left:'8%',top:'21%',x:'-10px',y:'-12px'},
  {left:'91%',top:'48%',x:'12px',y:'-5px'},
  {left:'17%',top:'82%',x:'-7px',y:'13px'},
  {left:'82%',top:'82%',x:'9px',y:'12px'},
  {left:'5%',top:'51%',x:'-12px',y:'4px'},
  {left:'38%',top:'8%',x:'-3px',y:'-13px'},
  {left:'35%',top:'91%',x:'-4px',y:'13px'},
  {left:'66%',top:'92%',x:'5px',y:'12px'},
]

/** This view samples the owner's confirmed clock; it owns no timer or game input. */
export default function BaseballHomeRunOverlay({effect=null,locale='ko',strength='normal'}){
  const prefix=useId().replace(/:/g,''),[reduced,setReduced]=useState(false)
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)')
    const update=()=>setReduced(media.matches)
    update();media.addEventListener('change',update)
    return()=>media.removeEventListener('change',update)
  },[])
  const effectiveStrength=strength==='off'?'off':reduced?'reduced':strength
  const presentation=getBaseballHomeRunPresentation({effect,nowMs:typeof performance==='undefined'?0:performance.now(),variant:'arcade',strength:effectiveStrength})
  if(!presentation)return null
  const english=locale==='en',maskId=`${prefix}-home-run-safe`,gradientId=`${prefix}-home-run-light`
  const details=[]
  if(Number.isFinite(effect.exitSpeedKmh)&&effect.exitSpeedKmh>0)details.push(`${Math.round(effect.exitSpeedKmh)} km/h`)
  if(Number.isFinite(effect.distanceM)&&effect.distanceM>0)details.push(`${english?'Est.':'예상'} ${effect.distanceM.toFixed(1)} m`)
  return <div className={styles.overlay} data-baseball-home-run-arcade data-effect-id={presentation.id} data-variant={presentation.variant}
    data-strength={presentation.strength} data-animated={presentation.animated} data-age-ms={Math.round(presentation.ageMs)} data-delay-ms={Math.round(presentation.animationDelayMs)}
    style={{'--hr-age':`${presentation.ageMs}ms`,'--hr-delay':`${presentation.animationDelayMs}ms`,'--hr-duration':`${presentation.durationMs}ms`}} aria-hidden="true">
    <div className={styles.vignette} />
    <div className={styles.bloom} />
    <div className={styles.rim} />
    <svg className={styles.speedLines} viewBox="0 0 1000 600" preserveAspectRatio="none" focusable="false">
      <defs>
        <mask id={maskId}><rect width="1000" height="600" fill="white" /><ellipse cx="500" cy="300" rx="310" ry="185" fill="black" /><rect x="640" y="0" width="360" height="210" fill="black" /></mask>
        <radialGradient id={gradientId} gradientUnits="userSpaceOnUse" cx="500" cy="300" r="650"><stop offset="0" stopColor="#f8de9a" stopOpacity="0" /><stop offset=".44" stopColor="#f8de9a" stopOpacity=".3" /><stop offset=".82" stopColor="#fff4cf" stopOpacity=".95" /><stop offset="1" stopColor="#e3bf6a" stopOpacity=".5" /></radialGradient>
      </defs>
      <g mask={`url(#${maskId})`} stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" fill="none">
        {streaks.map((path,index)=><path key={path} d={path} className={styles.streak} data-streak-index={index} />)}
      </g>
    </svg>
    <div className={styles.sparkField}>{sparks.map((spark,index)=><i key={index} className={styles.spark} style={{left:spark.left,top:spark.top,'--spark-x':spark.x,'--spark-y':spark.y}} />)}</div>
    <div className={styles.banner}>
      <span className={styles.eyebrow}>✦ {english?'OVER THE FENCE':'담장을 넘긴 타구'} ✦</span>
      <strong>HOME RUN</strong>
      {!english&&<span className={styles.koreanTitle}>홈런</span>}
      {details.length>0&&<small>{details.join(' · ')}</small>}
    </div>
  </div>
}
