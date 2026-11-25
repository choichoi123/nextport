import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { getBaseballSyncDiagnostic } from '@/lib/playground-baseball-sync-status.mjs'
import styles from '@/styles/playground-baseball-data.module.css'

const copy = {
  ko: {
    title:'데이터 수집 기반 · 로컬 검수', note:'기록 사본을 이 브라우저에 보관하고, 연결되면 서버 재계산 후 개발 DB에 저장합니다. 새로고침 후 기록은 복구되며 투구는 자동 재개하지 않습니다.',
    noteLoading:'브라우저에 보관한 기록을 확인하고 있습니다.', noteUnavailable:'브라우저 저장소를 사용할 수 없어 현재 탭의 메모리에만 수집합니다. 새로고침하면 미저장 자료가 사라질 수 있습니다.',
    localTitle:'브라우저 보관·개발 DB 동기화', pending:'저장 대기', saved:'DB 저장 확인', restored:'복구된 기록', syncing:'개발 DB와 동기화 중', offline:'연결을 확인하지 못했습니다. 대기 자료는 브라우저에 남습니다.', storageCapacity:'브라우저 보관 한도에 도달했습니다. 기존 자료는 유지됩니다.', retry:'다시 동기화', localReady:'브라우저 기록 보관 중', localHistory:'최근 보관·저장 기록', practiceState:'훈련 상태', location:'보관 상태', local:'브라우저', server:'개발 DB', activePractice:'미완료', endedPractice:'종료',
    syncErrors:{version:'이 기록의 규칙·엔진 버전을 확인해야 합니다. 저장 요청 원본은 변환·삭제하지 않고 보존 중입니다.',result:'기록된 입력과 서버 재계산 결과가 일치하지 않습니다. 저장 요청 원본을 그대로 보존 중입니다.',format:'기록 형식·필수값이 현재 검증 계약과 맞는지 확인해야 합니다. 원본은 변환·삭제하지 않고 보존 중입니다.',conflict:'더 최신인 기록 또는 다른 탭의 기록과 충돌했습니다. 기존 기록과 대기 원본을 보존 중입니다.',network:'서버 연결이나 응답을 확인하지 못했습니다. 대기 원본은 브라우저에 남으며 연결 확인 후 다시 동기화할 수 있습니다.',configuration:'개발용 저장 연결이 설정되어 있지 않습니다. 대기 원본은 브라우저에 보존 중입니다.',server:'개발 DB의 저장 응답을 확인하지 못했습니다. 대기 원본을 보존 중이며 연결 확인 후 다시 동기화할 수 있습니다.',local:'브라우저 보관 자료에 접근하지 못했습니다. 기존 자료를 지우지 말고 브라우저 저장소 상태를 확인해 주세요.',capacity:'브라우저 보관 한도에 도달했습니다. 기존 기록과 대기 원본은 유지됩니다.','request-capacity':'이 기록이 전송 크기 한도를 넘었습니다. 요청 원본을 보존하고 있으며 반복 전송만으로 해결되지 않습니다.',receipt:'서버의 저장 확인 영수증을 검증하지 못했습니다. 저장 완료로 바꾸지 않고 대기 원본을 보존 중입니다.',unknown:'저장 실패 원인을 확인해야 합니다. 기존 기록과 대기 원본을 보존 중입니다.'},
    waiting:'선수 설정 후 투구부터 기록합니다.', ready:'로컬 수집 준비', unavailable:'수집을 시작하지 못했습니다. 게임은 계속할 수 있습니다.', capacity:'메모리 수집 한도에 도달했습니다. 게임은 계속할 수 있습니다.', versionChanged:'버전 변경으로 이번 훈련 수집을 중단했습니다. 새 훈련부터 다시 수집합니다.',
    sessions:'보관 중인 훈련', attempts:'투구 시도', completed:'완료', aborted:'중단', swings:'스윙', engine:'엔진', rules:'규칙', presentation:'화면', schema:'수집 형식',
    unverified:'클라이언트 원본 · 입력 진위 미검증', details:'수집 데이터 확인', latest:'최근 훈련의 마지막 10개 시도', number:'시도 / 공', state:'상태', source:'스윙 입력', outcome:'결과',
    started:'진행 중', ended:'종료', pointer:'포인터', keyboard:'키보드', button:'스윙 버튼', field:'메인', focus:'확대', none:'—', take:'무스윙',
    outcomes:{ perfect:'정타', contact:'타격 성공', foul:'파울', miss:'헛스윙', 'called-strike':'지켜본 스트라이크', ball:'볼' },
    reasons:{ manual:'중단 버튼', blur:'창 비활성', hidden:'앱/탭 숨김', menu:'메뉴 열기', 'route-change':'경로 이동', escape:'Esc', tab:'Tab', 'focus-change':'확대 전환', 'focus-leave':'게임 밖 초점 이동', 'player-change':'선수 변경', restart:'새 훈련', unmount:'페이지 종료', 'version-change':'버전 변경' },
  },
  en: {
    title:'Data foundation · local review', note:'Record copies stay in this browser and sync to the development database after server recalculation. Refreshing restores records; pitches never resume automatically.',
    noteLoading:'Checking records kept in this browser.', noteUnavailable:'Browser storage is unavailable. Records stay only in this tab’s memory and unsaved data may be lost on refresh.',
    localTitle:'Browser storage · development DB sync', pending:'Pending', saved:'DB confirmed', restored:'Restored records', syncing:'Syncing with the development DB', offline:'The connection could not be confirmed. Pending records remain in this browser.', storageCapacity:'The browser storage limit was reached. Existing records are retained.', retry:'Retry sync', localReady:'Keeping browser records', localHistory:'Recent retained and stored practices', practiceState:'Practice state', location:'Storage', local:'Browser', server:'Development DB', activePractice:'Incomplete', endedPractice:'Ended',
    syncErrors:{version:'This record needs a rules and engine version review. Its original request remains unchanged and has not been converted or deleted.',result:'The recorded input and server recalculation do not match. The original request is retained unchanged.',format:'The record format or required fields need a compatibility review. The original has not been converted or deleted.',conflict:'This request conflicts with a newer record or another tab. Existing records and the pending original are retained.',network:'The server connection or response could not be confirmed. The pending original remains in this browser; retry after checking the connection.',configuration:'Development storage is not configured. The pending original remains in this browser.',server:'The development database response could not be confirmed. The pending original is retained; retry after checking the connection.',local:'Browser-retained records could not be accessed. Keep the existing data and check browser storage availability.',capacity:'Browser storage capacity was reached. Existing records and pending originals remain.','request-capacity':'This record exceeds the request size limit. The original is retained; repeated uploads alone will not fix it.',receipt:'The server storage receipt could not be verified. The request remains pending with its original retained.',unknown:'The storage failure needs investigation. Existing records and pending originals are retained.'},
    waiting:'Recording starts with pitches after player setup.', ready:'Local collection ready', unavailable:'Collection is unavailable. You can keep playing.', capacity:'The memory collection limit was reached. You can keep playing.', versionChanged:'This practice stopped collecting after a version change. Collection resumes with a new practice.',
    sessions:'Retained practices', attempts:'Pitch attempts', completed:'Completed', aborted:'Cancelled', swings:'Swings', engine:'Engine', rules:'Rules', presentation:'Presentation', schema:'Data schema',
    unverified:'Client source · input authenticity unverified', details:'Inspect collected data', latest:'Last 10 attempts in the latest practice', number:'Attempt / pitch', state:'State', source:'Swing input', outcome:'Result',
    started:'In progress', ended:'Ended', pointer:'Pointer', keyboard:'Keyboard', button:'Swing button', field:'Main', focus:'Close-up', none:'—', take:'No swing',
    outcomes:{ perfect:'Perfect contact', contact:'Contact', foul:'Foul', miss:'Swing and miss', 'called-strike':'Called strike', ball:'Ball' },
    reasons:{ manual:'Stop button', blur:'Window inactive', hidden:'App/tab hidden', menu:'Menu opened', 'route-change':'Route change', escape:'Esc', tab:'Tab', 'focus-change':'Close-up changed', 'focus-leave':'Focus left game', 'player-change':'Player changed', restart:'New practice', unmount:'Page closed', 'version-change':'Version changed' },
  },
}

const additionalSyncCopy={
  ko:{pitch:'기록된 투구 조건이 서버 재계산과 맞지 않습니다. 저장 요청 원본을 그대로 보존 중입니다.',limited:'서버 요청 한도에 도달했습니다. 대기 원본을 보존하고 있으니 잠시 뒤 다시 동기화해 주세요.',verification:'서버의 기록 검증 준비를 확인하지 못했습니다. 저장 요청 원본을 보존 중입니다.'},
  en:{pitch:'The recorded pitch does not match server recalculation. The original request is retained unchanged.',limited:'The server request limit was reached. Pending originals remain; retry sync after a short wait.',verification:'Server record verification is currently unavailable. The original request is retained.'},
}

const pendingCopy={
  ko:{inspect:'저장 대기 원본 확인',loading:'대기 원본을 읽고 있습니다.',show:'대기 원본 JSON 보기',hide:'읽은 원본 닫기',note:'브라우저에 남은 대기 요청의 읽기 전용 사본입니다. DB 저장 성공이나 기록 변환을 뜻하지 않습니다. 기록 내용이 포함되므로 공개하지 마세요.',empty:'현재 보관된 저장 대기 원본이 없습니다.',error:'대기 원본을 읽지 못했습니다. 기존 기록과 저장 상태는 변경하지 않았습니다.'},
  en:{inspect:'Inspect pending originals',loading:'Reading pending originals.',show:'Show pending original JSON',hide:'Close inspected originals',note:'This is a read-only copy of pending browser requests. It is not a database storage receipt or a converted record. Keep the record contents private.',empty:'No pending originals are currently retained.',error:'Pending originals could not be read. Existing records and storage status were not changed.'},
}

function BaseballDataReview({ snapshot, status, persistence, onRetry, onInspectPending, inspectionScope=null, locale = 'ko' }) {
  const text = copy[locale] || copy.ko
  const pendingText=pendingCopy[locale]||pendingCopy.ko
  const [expanded, setExpanded] = useState(false)
  const [inspection,setInspection]=useState({state:'hidden',value:null})
  const inspectionEpoch=useRef(0),alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;inspectionEpoch.current++}},[])
  useEffect(()=>{inspectionEpoch.current++;setInspection({state:'hidden',value:null})},[inspectionScope,locale])
  const closeInspection=()=>{inspectionEpoch.current++;setInspection({state:'hidden',value:null})}
  async function inspectPending(){
    if(!onInspectPending||inspection.state==='loading')return
    const ticket=++inspectionEpoch.current
    setInspection({state:'loading',value:null})
    try{
      const value=await onInspectPending()
      if(!value||!Array.isArray(value.entries))throw new Error('Invalid pending inspection')
      if(alive.current&&ticket===inspectionEpoch.current)setInspection({state:'ready',value})
    }catch{if(alive.current&&ticket===inspectionEpoch.current)setInspection({state:'error',value:null})}
  }
  const sessions = snapshot?.sessions || []
  const latest = sessions.at(-1)
  const attempts = useMemo(() => (snapshot?.sessions || []).flatMap(session => session.attempts), [snapshot])
  const serialized = useMemo(() => expanded && snapshot ? JSON.stringify(snapshot, null, 2) : '', [snapshot, expanded])
  const versions = latest?.versions
  const message = status?.reason === 'version-change' ? text.versionChanged : status?.state === 'capacity' ? text.capacity : status?.state === 'unavailable' ? text.unavailable : latest ? text.ready : text.waiting
  const stateName = state => state === 'completed' ? text.completed : state === 'aborted' ? text.aborted : text.started
  const syncDiagnostic = getBaseballSyncDiagnostic(persistence)
  const storageMessage = (additionalSyncCopy[locale]||additionalSyncCopy.ko)[syncDiagnostic.kind] || text.syncErrors[syncDiagnostic.kind] || (syncDiagnostic.kind === 'loading' ? text.noteLoading : syncDiagnostic.kind === 'syncing' ? text.syncing : text.localReady)
  const note = persistence?.state === 'unavailable' ? text.noteUnavailable : text.note

  return <section className={styles.review} aria-label={text.title} data-baseball-data-foundation data-collection-state={status?.state || 'ready'}>
    <div className={styles.heading}><strong>{text.title}</strong><span>{text.unverified}</span></div>
    <p>{note}</p>
    <div className={styles.persistence} data-baseball-persistence={persistence?.state || 'loading'} data-sync-state={persistence?.sync || 'idle'} data-sync-code={syncDiagnostic.code || 'none'} data-sync-kind={syncDiagnostic.kind} data-pending={persistence?.pending || 0} data-saved={persistence?.saved || 0}>
      <strong>{text.localTitle}</strong><p role="status">{storageMessage}</p>
      <dl className={styles.metrics}>
        {[[text.pending,persistence?.pending || 0],[text.saved,persistence?.saved || 0],[text.restored,persistence?.restored || 0]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {onRetry && <button type="button" className={styles.retry} onClick={onRetry} disabled={persistence?.state === 'loading' || persistence?.sync === 'syncing'}>{text.retry}</button>}
      {process.env.NODE_ENV==='development'&&onInspectPending&&<div>
        <button type='button' className={styles.retry} disabled={persistence?.state==='loading'||inspection.state==='loading'} onClick={()=>void inspectPending()}>{pendingText.inspect}</button>
        {inspection.state!=='hidden'&&<button type='button' className={styles.retry} onClick={closeInspection}>{pendingText.hide}</button>}
        {inspection.state==='loading'&&<p role='status'>{pendingText.loading}</p>}
        {inspection.state==='error'&&<p role='alert'>{pendingText.error}</p>}
        {inspection.state==='ready'&&<><p>{pendingText.note}</p>{!inspection.value.entries.length&&<p>{pendingText.empty}</p>}
          <details><summary>{pendingText.show}</summary><pre data-baseball-pending-records>{JSON.stringify(inspection.value,null,2)}</pre></details>
        </>}
      </div>}
      {persistence?.history?.length > 0 && <div className={styles.tableWrap}><table><caption>{text.localHistory}</caption>
        <thead><tr><th>{text.practiceState}</th><th>{text.completed} / {text.aborted}</th><th>{text.location}</th></tr></thead>
        <tbody>{persistence.history.slice(0,10).map(item=><tr key={item.sessionId}><td>{item.status==='ended'?text.endedPractice:text.activePractice}</td><td>{item.completed} / {item.aborted}</td><td>{item.source==='server'?text.server:text.local}</td></tr>)}</tbody>
      </table></div>}
    </div>
    <p role="status" className={styles.status}>{message}</p>
    <dl className={styles.metrics}>
      {[[text.sessions, sessions.length], [text.attempts, attempts.length], [text.completed, attempts.filter(item => item.state === 'completed').length], [text.aborted, attempts.filter(item => item.state === 'aborted').length], [text.swings, attempts.filter(item => item.swingAtMs !== null).length]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {versions && <dl className={styles.versions}>
      <div><dt>{text.schema}</dt><dd>{snapshot.schemaVersion}</dd></div>
      <div><dt>{text.rules}</dt><dd>{versions.rules.id}</dd></div>
      {[[text.engine, versions.engine.hash], [text.presentation, versions.presentation.hash]].map(([label, hash]) => <div key={label}><dt>{label}</dt><dd><code title={hash}>{hash.slice(0, 16)}</code></dd></div>)}
    </dl>}
    {latest?.attempts.length > 0 && <div className={styles.tableWrap}>
      <table><caption>{text.latest}</caption><thead><tr><th>{text.number}</th><th>{text.state}</th><th>{text.source}</th><th>{text.outcome}</th></tr></thead>
        <tbody>{latest.attempts.slice(-10).map(item => <tr key={item.attemptId} data-baseball-data-attempt={item.attemptId}>
          <td>{item.attemptNumber} / {item.pitchNumber}</td><td>{stateName(item.state)}{item.abortReason && <small className={styles.reason}>{text.reasons[item.abortReason]}</small>}</td>
          <td>{item.input ? `${text[item.input.source]} · ${text[item.input.surface]}` : item.state === 'completed' ? text.take : text.none}</td>
          <td>{item.result ? text.outcomes[item.result.outcome] || text.none : text.none}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <details onToggle={event => setExpanded(event.currentTarget.open)}><summary>{text.details}</summary>
      {expanded && <pre data-baseball-data-records>{serialized || (locale === 'ko' ? '아직 수집한 훈련이 없습니다.' : 'No practice collected yet.')}</pre>}
    </details>
  </section>
}

export default memo(BaseballDataReview)
