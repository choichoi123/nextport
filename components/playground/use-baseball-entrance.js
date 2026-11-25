import {useCallback,useEffect,useId,useRef,useState} from 'react'
import {createBaseballEntranceController} from '@/lib/playground-baseball-entrance.mjs'

/** The existing feedback owner supplies audio; this hook never creates an engine. */
export default function useBaseballEntrance({feedback,locale='ko',origin='live',enabled=true}={}){
  const prefix=useId(),controller=useRef(null),mounted=useRef(false),latest=useRef({feedback,origin,enabled})
  latest.current={feedback,origin,enabled}
  const [intro,setIntro]=useState(null)
  const prepare=useCallback(()=>latest.current.enabled?controller.current?.prepare({origin:latest.current.origin})||null:null,[])
  const enter=useCallback((token,player)=>latest.current.enabled?controller.current?.enter(token,player)||false:false,[])
  const cancel=useCallback(()=>{if(latest.current.enabled)controller.current?.cancel()},[])
  useEffect(()=>{
    if(!enabled)return undefined
    const owner=feedback
    mounted.current=true;setIntro(null)
    const value=createBaseballEntranceController({idPrefix:`${prefix}:entrance`,
      prepareAudio:()=>owner?.prepareEntrance?.()||false,playAudio:event=>owner?.emitEntrance?.(event)||false,
      stopAudio:()=>owner?.stopEntrance?.(),onIntro:value=>{if(mounted.current)setIntro(value)},
      isAllowed:()=>{
        const settings=latest.current.feedback?.settings
        return latest.current.enabled&&settings?.enabled!==false&&settings?.entrance!==false&&settings?.master>0&&settings?.effects>0
          &&!document.hidden&&document.hasFocus()
      }})
    controller.current=value
    const hidden=()=>{if(document.hidden)value.cancel()},stop=()=>value.cancel()
    window.addEventListener('blur',stop);window.addEventListener('nextport:playground-menu-open',stop);document.addEventListener('visibilitychange',hidden)
    return()=>{
      mounted.current=false;if(controller.current===value)controller.current=null
      window.removeEventListener('blur',stop);window.removeEventListener('nextport:playground-menu-open',stop);document.removeEventListener('visibilitychange',hidden)
      value.dispose()
    }
  },[enabled,prefix,feedback?.prepareEntrance,feedback?.emitEntrance,feedback?.stopEntrance])
  useEffect(()=>{if(enabled)controller.current?.cancel()},[locale,origin,enabled])
  const audible=feedback?.settings?.enabled!==false&&feedback?.settings?.entrance!==false&&feedback?.settings?.master>0&&feedback?.settings?.effects>0
  useEffect(()=>{if(enabled&&!audible)controller.current?.silence()},[enabled,audible])
  return {intro:enabled?intro:null,prepare,enter,cancel}
}
