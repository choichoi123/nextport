import {useEffect,useId,useMemo,useState} from 'react'
import {getBaseballContactBoostPresentation} from '@/lib/playground-baseball-contact-boost.mjs'
import styles from '@/styles/playground-baseball-contact-boost.module.css'

const streaks=['M0 90 L290 220','M0 365 L285 330','M100 600 L355 425','M905 600 L645 425',
  'M1000 355 L735 315','M490 0 L495 135','M0 205 L280 265','M1000 475 L710 370']

/** A brief contact accent; result text and celebration belong to the later result. */
export default function BaseballContactBoostOverlay({effect=null,strength='normal'}){
  const prefix=useId().replace(/:/g,''),[reduced,setReduced]=useState(false)
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)')
    const update=()=>setReduced(media.matches)
    update();media.addEventListener('change',update)
    return()=>media.removeEventListener('change',update)
  },[])
  const {id,atMs,type,outcome,origin}=effect||{},effectiveStrength=reduced?'reduced':strength
  // Parent contact-ring cleanup must not change an animation already in progress.
  const presentation=useMemo(()=>getBaseballContactBoostPresentation({effect:{id,atMs,type,outcome,origin},
    nowMs:typeof performance==='undefined'?0:performance.now(),strength:effectiveStrength}),[id,atMs,type,outcome,origin,effectiveStrength])
  if(!presentation)return null
  const maskId=`${prefix}-contact-safe`,gradientId=`${prefix}-contact-light`
  return <div className={styles.overlay} data-baseball-contact-boost data-effect-id={presentation.id}
    data-age-ms={Math.round(presentation.ageMs)} data-delay-ms={Math.round(presentation.animationDelayMs)}
    style={{'--contact-boost-duration':`${presentation.durationMs}ms`,'--contact-boost-delay':`${presentation.animationDelayMs}ms`}} aria-hidden="true">
    <div className={styles.rim} />
    <svg className={styles.lines} viewBox="0 0 1000 600" preserveAspectRatio="none" focusable="false">
      <defs>
        <mask id={maskId}><rect width="1000" height="600" fill="white" /><ellipse cx="500" cy="300" rx="310" ry="185" fill="black" /><rect x="640" y="0" width="360" height="210" fill="black" /></mask>
        <radialGradient id={gradientId} gradientUnits="userSpaceOnUse" cx="500" cy="300" r="650"><stop offset="0" stopColor="#ffe4a1" stopOpacity="0" /><stop offset=".45" stopColor="#ffe4a1" stopOpacity=".3" /><stop offset=".85" stopColor="#fff2c7" stopOpacity=".9" /><stop offset="1" stopColor="#e5bd65" stopOpacity=".5" /></radialGradient>
      </defs>
      <g mask={`url(#${maskId})`} stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" fill="none">
        {streaks.map((path,index)=><path key={path} d={path} className={styles.streak} data-contact-streak={index} />)}
      </g>
    </svg>
  </div>
}
