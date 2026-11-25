import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { BASEBALL_RULES } from '@/lib/playground-baseball.mjs'
import { createBaseballFieldPresentation, canAnimateBaseballFieldPresentation } from '@/lib/playground-baseball-field-presentation.mjs'

/** Ephemeral display tickets only; never part of a saved pitch or a reward. */
export default function useBaseballPostplay() {
  const prefix=useId(), serial=useRef(0), current=useRef(null), mounted=useRef(false)
  const [trajectory,setTrajectory]=useState(null),[reaction,setReaction]=useState(null)
  useEffect(()=>{
    mounted.current=true;setTrajectory(null);setReaction(null)
    return()=>{mounted.current=false;if(current.current)current.current.postplayContext=null;current.current=null}
  },[])
  const cancel=useCallback(()=>{
    if(current.current)current.current.postplayContext=null
    current.current=null
    if(mounted.current){setTrajectory(null);setReaction(null)}
  },[])
  const begin=useCallback(round=>{
    cancel()
    if(!round)return
    round.postplayContext={id:`${prefix}:postplay:${++serial.current}`,origin:'live',currentManual:true,confirmed:false}
    current.current=round
  },[cancel,prefix])
  const contact=useCallback(round=>{
    const ticket=round?.postplayContext
    if(current.current!==round||round.paused||!ticket||!canAnimateBaseballFieldPresentation({...ticket,phase:'trajectory'}))return
    const presentation=createBaseballFieldPresentation(round.fieldResult)
    if(!presentation||!Number.isFinite(round.decision?.contactAtMs))return
    const startAt=round.startAt+BASEBALL_RULES.windupMs+round.decision.contactAtMs
    if(mounted.current)setTrajectory({id:ticket.id,origin:'live',currentManual:true,startAt,presentation})
  },[])
  const confirm=useCallback((round,{authority,result,fieldResult,terminalOutcome})=>{
    const ticket=round?.postplayContext
    if(current.current!==round||!ticket||ticket.confirmed||round.paused||!canAnimateBaseballFieldPresentation({...ticket,phase:'result',confirmed:true,authority}))return
    const outcome=terminalOutcome||fieldResult?.outcome
    if(!['home-run','single','double','triple','flyout','lineout','groundout','strikeout-looking','strikeout-swinging','walk'].includes(outcome))return
    ticket.confirmed=true
    const presentation=createBaseballFieldPresentation(fieldResult)
    const at=performance.now()
    if(mounted.current){
      if(presentation&&Number.isFinite(result?.contactAtMs))setTrajectory({id:ticket.id,origin:'live',currentManual:true,
        startAt:round.startAt+BASEBALL_RULES.windupMs+result.contactAtMs,presentation})
      setReaction({id:ticket.id,origin:'live',confirmed:true,authority,outcome,startAt:at})
    }
  },[])
  return {trajectory,reaction,begin,contact,confirm,cancel}
}
