import { useEffect, useId, useRef, useState } from 'react'
import { createBaseballCareerRecoveryClient } from '@/lib/playground-baseball-career-recovery-client.mjs'
import { copyBaseballRecoveryCode } from '@/lib/playground-baseball-recovery-copy.mjs'
import styles from '@/styles/playground-baseball-career.module.css'

const copy={
  ko:{title:'이 선수의 복구 코드',importTitle:'복구 코드로 선수 불러오기',intro:'복구 코드를 보관하면 다른 브라우저에서도 이 선수의 성장을 이어갈 수 있습니다. 코드를 아는 사람은 이 선수를 조작할 수 있으므로 비공개로 보관해 주세요.',importIntro:'기존 브라우저의 선수와 기록은 유지한 채, 코드가 가리키는 선수만 연결합니다.',check:'복구 코드 확인',issue:'복구 코드 만들기',rotate:'새 코드로 교체',revoke:'복구 코드 폐기',show:'코드 표시',hide:'코드 숨기기',copy:'복사',import:'선수 불러오기',field:'복구 코드',displayField:'선택한 선수의 복구 코드',placeholder:'BCR1-…',confirmRotate:'새 코드로 바꾸면 이전 코드와 그 코드로 연결한 브라우저의 접근이 해제됩니다. 원래 브라우저와 선수 기록은 유지됩니다.',confirmRevoke:'코드를 폐기하면 그 코드와 연결한 브라우저의 접근이 해제됩니다. 원래 브라우저와 선수 기록은 유지됩니다.',confirm:'확인하고 진행',cancel:'취소',working:'복구 정보를 확인하고 있습니다.',checking:'코드 권한을 확인하고 있습니다.',copying:'복사하고 있습니다.',copied:'복사했습니다. 안전한 곳에 별도로 보관해 주세요.',manualCopy:'자동 복사가 되지 않았습니다. 표시된 코드를 길게 누르거나 선택해 직접 복사해 주세요.',found:'복구 코드를 확인했습니다.',issued:'복구 코드를 만들었습니다. 다른 브라우저에서 사용할 수 있도록 별도로 보관해 주세요.',rotated:'새 코드로 교체했습니다. 이전 코드와 그 코드의 연결은 해제되었습니다.',revoked:'복구 코드를 폐기했습니다. 기존 선수와 기록은 유지됩니다.',absent:'아직 복구 코드가 없습니다. 필요할 때 만들어 보관할 수 있습니다.',revokedState:'폐기된 코드입니다. 새 코드를 만들 수 있습니다.',restored:'선수를 연결했습니다. 저장된 기록을 확인합니다.',empty:'복구 코드를 입력해 주세요.',owner:'선수 목록을 새로고침한 뒤 다시 시도해 주세요. 코드 관리에는 처음 발급한 브라우저가 필요합니다.',limited:'요청이 많습니다. 1분 뒤 다시 시도해 주세요.',unavailable:'복구 정보를 확인하지 못했습니다. 코드를 확인하거나 처음 발급한 브라우저에서 다시 시도해 주세요.',notConfigured:'현재 복구 기능에 연결할 수 없습니다. 기존 선수와 기록은 유지됩니다.',privacy:'이 화면을 벗어나면 표시한 코드는 지워집니다. 코드에는 만료 기간이 없으며, 처음 발급한 브라우저에서 교체하거나 폐기할 수 있습니다.'},
  en:{title:'Recovery code for this batter',importTitle:'Restore a batter with a code',intro:'Keep a recovery code to continue this batter in another browser. Anyone with the code can control this batter, so keep it private.',importIntro:'Connect only the batter named by the code. This browser’s existing batters and records remain unchanged.',check:'Check recovery code',issue:'Create recovery code',rotate:'Replace code',revoke:'Revoke code',show:'Show code',hide:'Hide code',copy:'Copy',import:'Restore batter',field:'Recovery code',displayField:'Selected batter’s recovery code',placeholder:'BCR1-…',confirmRotate:'Replacing the code disables the old code and access granted to other browsers by that code. The original browser and batter records remain.',confirmRevoke:'Revoking the code also removes access granted to other browsers by that code. The original browser and batter records remain.',confirm:'Confirm and continue',cancel:'Cancel',working:'Checking recovery information.',checking:'Checking permission to view the code.',copying:'Copying the code.',copied:'Copied. Keep it separately in a safe place.',manualCopy:'Automatic copying was unavailable. Select or long-press the visible code and copy it manually.',found:'Recovery code checked.',issued:'Recovery code created. Keep it separately so you can use it in another browser.',rotated:'A new code replaced the previous code. Access granted by the previous code has been removed.',revoked:'Recovery code revoked. Existing batter records remain.',absent:'No recovery code yet. Create one when you want to keep a backup.',revokedState:'This code was revoked. You can create a new one.',restored:'Batter connected. Checking its saved records.',empty:'Enter your recovery code.',owner:'Refresh the batter list and try again. Code management requires the browser that originally created it.',limited:'Too many requests. Try again in one minute.',unavailable:'Recovery could not be confirmed. Check the code or try again in the original browser.',notConfigured:'Recovery is currently unavailable. Existing batters and records remain.',privacy:'Leaving this screen clears the displayed code. Codes do not expire; the original browser can replace or revoke them.'},
}
const messageFor=cause=>cause?.code==='owner_required'?'owner':cause?.code==='rate_limited'?'limited'
  :cause?.code==='not_configured'?'notConfigured':'unavailable'

/** Codes stay in this mounted view only, separate from career checkpoints. */
export default function BaseballCareerRecovery({careerId=null,version=2,locale='ko',onRecovered,disabled=false}){
  const text=copy[locale]||copy.ko,prefix=useId(),displayRef=useRef(null),clientRef=useRef(null)
  const alive=useRef(false),epoch=useRef(0),busyRef=useRef(false)
  const [managed,setManaged]=useState(null),[importCode,setImportCode]=useState(''),[shown,setShown]=useState(false)
  const [confirm,setConfirm]=useState(null),[operation,setOperation]=useState(null),[message,setMessage]=useState(null),[manual,setManual]=useState(false)
  const current=useRef({careerId,version,onRecovered,disabled})
  current.current={careerId,version,onRecovered,disabled}
  useEffect(()=>{
    alive.current=true;clientRef.current=createBaseballCareerRecoveryClient()
    setManaged(null);setImportCode('');setShown(false);setConfirm(null);setMessage(null);setManual(false);setOperation(null);busyRef.current=false
    return()=>{alive.current=false;epoch.current++;clientRef.current?.close();clientRef.current=null}
  },[careerId,version])
  useEffect(()=>{if(manual&&shown){displayRef.current?.focus({preventScroll:true});displayRef.current?.select()}},[manual,shown])
  const begin=kind=>{
    if(busyRef.current||current.current.disabled||!clientRef.current)return null
    busyRef.current=true;const ticket=++epoch.current;setOperation(kind);setMessage(null);setManual(false)
    return{ticket,id:current.current.careerId,version:current.current.version}
  }
  const valid=scope=>alive.current&&epoch.current===scope.ticket&&current.current.careerId===scope.id&&current.current.version===scope.version
  const finish=scope=>{if(valid(scope)){busyRef.current=false;setOperation(null)}}
  async function manage(action){
    const scope=begin(action);if(!scope)return
    setConfirm(null);setShown(false);setManaged(null)
    try{
      const value=await clientRef.current[action](scope.id,scope.version)
      if(!valid(scope))return
      setManaged(value);setMessage(value.state==='absent'?'absent':value.state==='revoked'?action==='revoke'?'revoked':'revokedState':action==='rotate'?'rotated':action==='issue'?'issued':'found')
    }catch(cause){if(valid(scope))setMessage(messageFor(cause))}finally{finish(scope)}
  }
  async function copyCode(){
    const value=managed?.code;if(!value)return
    const scope=begin('copy');if(!scope)return
    try{
      const success=await copyBaseballRecoveryCode(value)
      if(!valid(scope))return
      if(success)setMessage('copied')
      else{setShown(true);setManual(true);setMessage('manualCopy')}
    }catch{if(valid(scope)){setShown(true);setManual(true);setMessage('manualCopy')}}finally{finish(scope)}
  }
  async function restore(event){
    event.preventDefault()
    if(!importCode.trim()){setMessage('empty');return}
    const scope=begin('restore');if(!scope)return
    try{
      const value=await clientRef.current.redeem(importCode)
      if(!valid(scope))return
      setImportCode('');setMessage('restored')
      await current.current.onRecovered?.(value.careerId,value.version)
    }catch(cause){if(valid(scope))setMessage(messageFor(cause))}finally{finish(scope)}
  }
  const busy=Boolean(operation),locked=busy||disabled,visibleMessage=message?(text[message]||message):null
  return <section className={styles.recoveryPanel} data-baseball-career-recovery aria-busy={busy} onKeyDownCapture={event=>{
    if(event.key==='Enter'&&event.nativeEvent.isComposing||event.target.closest('button')&&event.repeat&&['Enter','Space'].includes(event.code))event.preventDefault()
  }}>
    <h2>{careerId?text.title:text.importTitle}</h2><p>{careerId?text.intro:text.importIntro}</p>
    {careerId?<>
      <div className={styles.recoveryActions}><button type='button' disabled={locked} onClick={()=>void manage('read')}>{text.check}</button>
        {managed&&managed.state!=='active'&&<button type='button' className={styles.primary} disabled={locked} onClick={()=>void manage('issue')}>{text.issue}</button>}
      </div>
      {managed?.state==='active'&&<>
        <label className={styles.recoveryLabel} htmlFor={`${prefix}-display`}>{text.field}</label>
        <input ref={displayRef} id={`${prefix}-display`} className={styles.recoverySecret} type={shown?'text':'password'} value={managed.code} readOnly autoComplete='off' spellCheck={false} aria-label={text.displayField} />
        <div className={styles.recoveryActions}><button type='button' disabled={locked} aria-pressed={shown} aria-controls={`${prefix}-display`} onClick={()=>{setManual(false);setShown(value=>!value)}}>{shown?text.hide:text.show}</button><button type='button' disabled={locked} onClick={()=>void copyCode()}>{text.copy}</button></div>
        <div className={styles.recoveryActions}><button type='button' disabled={locked} onClick={()=>setConfirm('rotate')}>{text.rotate}</button><button type='button' disabled={locked} onClick={()=>setConfirm('revoke')}>{text.revoke}</button></div>
      </>}
      {confirm&&<div className={styles.recoveryWarning} role='group' aria-label={confirm==='rotate'?text.rotate:text.revoke}><p>{confirm==='rotate'?text.confirmRotate:text.confirmRevoke}</p><div className={styles.recoveryActions}><button type='button' className={styles.primary} disabled={locked} onClick={()=>void manage(confirm)}>{text.confirm}</button><button type='button' disabled={locked} onClick={()=>setConfirm(null)}>{text.cancel}</button></div></div>}
      <p className={styles.recoveryNote}>{text.privacy}</p>
    </>:<form className={styles.recoveryForm} onSubmit={restore} noValidate>
      <label htmlFor={`${prefix}-import`}>{text.field}</label>
      <input id={`${prefix}-import`} type='password' value={importCode} maxLength={128} autoComplete='off' autoCapitalize='characters' spellCheck={false} disabled={locked} placeholder={text.placeholder} onChange={event=>setImportCode(event.target.value)} aria-describedby={`${prefix}-status`} />
      <button type='submit' className={styles.primary} disabled={locked||!importCode.trim()}>{text.import} →</button>
    </form>}
    <p id={`${prefix}-status`} className={styles.recoveryStatus} role='status' aria-live='polite'>{busy?operation==='copy'?text.copying:operation==='read'?text.checking:text.working:visibleMessage||' '}</p>
  </section>
}
