import { useCallback, useEffect, useRef, useState } from 'react'
import { BASEBALL_FEEDBACK_DEFAULT_SETTINGS, BASEBALL_FEEDBACK_STORAGE_KEY, createBaseballAudioEngine, normalizeBaseballFeedbackSettings } from '@/lib/playground-baseball-audio.mjs'

/** Baseball-only preference/audio lifetime. No physics, records or server writes. */
export default function useBaseballFeedback({locale='ko',disabled=false}={}){
  const [settings,setSettingsState]=useState(()=>({...BASEBALL_FEEDBACK_DEFAULT_SETTINGS}))
  const [diagnostics,setDiagnostics]=useState({status:'idle',decoded:0,pending:0,active:0})
  const [lastEvent,setLastEvent]=useState(null)
  const settingsRef=useRef(settings),localeRef=useRef(locale),disabledRef=useRef(disabled),engineRef=useRef(null),mountedRef=useRef(false),loadedRef=useRef(false),seenRef=useRef(new Set())
  localeRef.current=locale
  disabledRef.current=disabled

  const stop=useCallback(()=>{
    if(disabledRef.current)return
    engineRef.current?.stop()
    if(mountedRef.current)setLastEvent(null)
  },[])
  const applySettings=useCallback(patch=>{
    if(disabledRef.current)return settingsRef.current
    const next=normalizeBaseballFeedbackSettings({...settingsRef.current,...patch})
    settingsRef.current=next;engineRef.current?.setSettings(next)
    if(mountedRef.current)setSettingsState(next)
    if(loadedRef.current)try{window.localStorage.setItem(BASEBALL_FEEDBACK_STORAGE_KEY,JSON.stringify(next))}catch{/* Optional browser preference only. */}
    return next
  },[])
  const setEnabled=useCallback(value=>applySettings({enabled:typeof value==='function'?!!value(settingsRef.current.enabled):!!value}),[applySettings])
  const setEntrance=useCallback(value=>applySettings({entrance:typeof value==='function'?!!value(settingsRef.current.entrance):!!value}),[applySettings])
  const setVolume=useCallback((channel,value)=>{
    if(!['master','effects','call','crowd'].includes(channel)||typeof value!=='number'||!Number.isFinite(value))return settingsRef.current
    return applySettings({[channel]:value})
  },[applySettings])
  const setStrength=useCallback(value=>{
    if(!['normal','subtle','off'].includes(value))return settingsRef.current
    return applySettings({strength:value})
  },[applySettings])
  const prepare=useCallback(()=>!disabledRef.current&&engineRef.current?.prepare(localeRef.current)||Promise.resolve(false),[])
  const prepareEntrance=useCallback(()=>!disabledRef.current&&engineRef.current?.prepareEntrance()||Promise.resolve(false),[])
  const stopEntrance=useCallback(()=>{if(!disabledRef.current)engineRef.current?.stopEntrance()},[])
  const emitEntrance=useCallback(event=>!disabledRef.current&&mountedRef.current?engineRef.current?.playEntrance(event)||false:false,[])
  const emit=useCallback(event=>{
    if(disabledRef.current||!mountedRef.current||!event||typeof event.id!=='string'||event.id.length>512||typeof event.type!=='string'
      ||event.origin!==undefined&&!['live','preview'].includes(event.origin))return false
    const key=`${event.id}:${event.type}`,seen=seenRef.current
    if(seen.has(key))return false
    seen.add(key);if(seen.size>512)seen.delete(seen.values().next().value)
    const accepted=Object.freeze({...event})
    setLastEvent(accepted)
    // The pure event gate already owns due times. Missing audio is skipped, never queued.
    engineRef.current?.play(accepted,localeRef.current)
    return true
  },[])

  useEffect(()=>{
    if(disabled)return undefined
    mountedRef.current=true
    let restored=normalizeBaseballFeedbackSettings()
    try{restored=normalizeBaseballFeedbackSettings(JSON.parse(window.localStorage.getItem(BASEBALL_FEEDBACK_STORAGE_KEY)||'null'))}catch{/* Keep safe defaults. */}
    settingsRef.current=restored;setSettingsState(restored);loadedRef.current=true
    const engine=createBaseballAudioEngine({onState:state=>{if(mountedRef.current&&engineRef.current===engine)setDiagnostics(state)}})
    engineRef.current=engine;engine.setSettings(restored)
    const hidden=()=>{if(document.hidden)stop()}
    window.addEventListener('blur',stop)
    window.addEventListener('nextport:playground-menu-open',stop)
    document.addEventListener('visibilitychange',hidden)
    return()=>{
      mountedRef.current=false;loadedRef.current=false
      window.removeEventListener('blur',stop);window.removeEventListener('nextport:playground-menu-open',stop)
      document.removeEventListener('visibilitychange',hidden)
      if(engineRef.current===engine)engineRef.current=null
      engine.close();seenRef.current.clear()
    }
  },[stop,disabled])
  useEffect(()=>{if(!disabled)stop()},[locale,stop,disabled])
  return {settings,setSettings:applySettings,setEnabled,setEntrance,setVolume,setStrength,prepare,emit,stop,
    prepareEntrance,emitEntrance,stopEntrance,entranceStatus:diagnostics.entranceStatus||'idle',status:diagnostics.status,diagnostics,lastEvent}
}
