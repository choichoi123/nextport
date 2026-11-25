import { useEffect, useState } from 'react'
import { getBaseballTeam } from '@/lib/playground-baseball-teams.mjs'
import { BASEBALL_ENTRANCE } from '@/lib/playground-baseball-entrance.mjs'
import styles from '@/styles/playground-baseball-entrance.module.css'

const DURATION_MS=BASEBALL_ENTRANCE.durationMs

/** The persistent player HUD owns the accessible identity; this is decoration. */
export default function BaseballEntranceOverlay({intro=null,locale='ko',strength='normal',compact=false}){
  const [visible,setVisible]=useState(null)
  useEffect(()=>{
    setVisible(null)
    const startedAt=Number.isFinite(intro?.startAt)?intro.startAt:intro?.atMs
    if(!intro?.id||!intro.player||!Number.isFinite(startedAt)||strength==='off')return
    const age=performance.now()-startedAt
    if(age<0||age>=DURATION_MS)return
    setVisible({...intro,startedAt,remaining:DURATION_MS-age})
    const timer=setTimeout(()=>setVisible(null),DURATION_MS-age)
    return()=>clearTimeout(timer)
    // The same acknowledged entry must retain its original display clock.
  },[intro?.id,strength])
  if(!visible||visible.id!==intro?.id||strength==='off')return null
  const player=visible.player,team=getBaseballTeam(player.teamId)
  const name=typeof player.name==='string'?[...player.name.normalize('NFC')].slice(0,16).join(''):''
  const number=/^[0-9]{1,2}$/.test(String(player.jerseyNumber))?String(player.jerseyNumber):'7'
  const english=locale==='en',hand=player.handedness==='left'?'left':'right'
  return <div className={`${styles.entrance}${compact?` ${styles.compact}`:''}`} data-baseball-entrance-overlay data-entry-id={visible.id} data-strength={strength} data-hand={hand} data-compact={compact}
    style={{'--team-color':team.helmet,'--team-accent':team.accent,'--entrance-duration':`${visible.remaining}ms`}} aria-hidden="true">
    <div className={styles.number}><span>{english?'NO.':'등번호'}</span><strong>{number}</strong></div>
    <div className={styles.identity}><span className={styles.kicker}>{english?'NOW BATTING':'타석 입장'}</span><strong className={styles.name}>{name}</strong><span className={styles.team}>{team.name}</span><span className={styles.hand}>{english?(hand==='left'?'LEFT-HANDED BATTER':'RIGHT-HANDED BATTER'):(hand==='left'?'좌타':'우타')}</span></div>
  </div>
}
