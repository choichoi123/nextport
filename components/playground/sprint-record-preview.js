import { useEffect, useId, useRef, useState } from 'react'
import { buildSprintRecordPreview } from '@/lib/playground-sprint-record.mjs'
import { SPRINT_PLAYER_NAME_LIMIT, validateSprintPlayer } from '@/lib/playground-sprint-player.mjs'
import { formatSprintTime } from '@/lib/playground-sprint.mjs'
import SprintWorldRecord from './sprint-world-record'
import styles from '@/styles/playground-sprint-record.module.css'

const copy = {
  ko: {
    title: '기록 등록 미리보기', eyebrow: 'YOUR FINISH / RECORD DETAILS', close: '닫기',
    disconnected: 'DB 미연결 · 미리보기 전용', notice: '등록할 내용을 확인하는 화면입니다. 현재 기록 DB는 연결하지 않았습니다.', localNotice: '온라인 시도 없이 진행한 로컬 경기입니다. 미리보기만 가능하며 나중에 온라인으로 소급 등록할 수 없습니다.',
    name: '이름 · 닉네임', nameHint: '16자 이내의 이름이나 닉네임을 입력해 주세요.', country: '국적', time: '완주 기록', date: '완주 일시',
    confirm: '등록 내용 확인', disabled: 'DB 연결 후 등록 가능', summary: '확인한 등록 내용', ready: '아래 기록 내용을 확인해 주세요.',
    requiredName: '이름이나 닉네임을 입력해 주세요.', tooLongName: '이름은 16자 이내로 입력해 주세요.', invalidName: '줄바꿈이나 보이지 않는 제어문자 없이 입력해 주세요.',
    invalidCountry: '목록에서 국적을 선택해 주세요.', invalidRun: '완주 기록 정보를 확인할 수 없습니다. 이 화면을 닫고 다시 확인해 주세요.',
    readOnly: '완주 기록과 일시는 이번 경기의 결과로 고정됩니다.',
    onlineTitle: '온라인 기록 등록', online: '서버 검증 완료 · TOP10 등록 후보', onlineNotice: '공개할 이름·국적·기록을 확인해 주세요. 등록 순간 최신 TOP10과 이 브라우저의 기존 기록을 다시 비교합니다.', localOnly: '온라인 등록 불가 · 로컬 미리보기', notAvailable: '이번 경기는 온라인 등록 대상이 아닙니다.',
    publicNote: '등록하면 이름·국적·기록·서버 등록일시가 순위표에 공개됩니다. 익명 쿠키로 이 브라우저의 최고 기록 1개를 관리합니다.',
    privacyNote: '비정상 등록 확인을 위해 등록 IP를 보관하며 관리자만 조회할 수 있습니다. 30일이 지난 IP는 일일 정리 작업에서 자동 삭제됩니다.',
    registeredDate: '서버 등록일시', pendingDate: '등록 시 서버에서 확정', noRegistrationDate: '이번 경기는 등록되지 않음', localDate: '로컬 완주 일시', onlineFixed: '기록은 서버가 재계산한 0.01초 단위 값입니다. 서버 등록일시는 로컬 완주 일시와 다릅니다.',
    save: '등록', saving: '등록 중…', retry: '같은 내용으로 다시 등록', failed: '등록 결과를 확인하지 못했습니다. 같은 내용으로 재시도하면 중복 등록 없이 결과를 확인합니다.',
    doneTitle: '등록 완료', done: 'TOP10에 등록했습니다.', lost: '등록하는 동안 TOP10 자격이 바뀌어 등록되지 않았습니다. 완주 기록과 리플레이는 그대로 남아 있습니다.', notImproved: '이 브라우저에 같거나 더 빠른 기록이 있어 기존 기록을 유지했습니다.',
    verifying: '서버에서 완주 기록을 검증하고 있습니다.', verifyError: '온라인 완주 검증을 완료하지 못했습니다. 로컬 기록 미리보기는 계속 볼 수 있습니다.', retryVerify: '완주 검증 다시 시도', notEligible: '서버 검증은 완료했지만 현재 TOP10 등록 대상이 아닙니다.', rank: '확정 순위',
  },
  en: {
    title: 'Record registration preview', eyebrow: 'YOUR FINISH / RECORD DETAILS', close: 'Close',
    disconnected: 'DB not connected · preview only', notice: 'Review the details for your record. The record database is not connected yet.', localNotice: 'This local run did not have an online attempt. It can be previewed but cannot be registered online later.',
    name: 'Name · nickname', nameHint: 'Enter a name or nickname of up to 16 characters.', country: 'Nationality', time: 'Finish time', date: 'Finished at',
    confirm: 'Review registration details', disabled: 'Registration available after DB connection', summary: 'Reviewed record details', ready: 'Review the record details below.',
    requiredName: 'Enter a name or nickname.', tooLongName: 'Use 16 characters or fewer.', invalidName: 'Remove line breaks and invisible control characters.',
    invalidCountry: 'Choose a nationality from the list.', invalidRun: 'The finish details could not be verified. Close this preview and check the result again.',
    readOnly: 'The finish time and date are fixed to this run’s result.',
    onlineTitle: 'Register an online record', online: 'Server verified · TOP10 candidate', onlineNotice: 'Review your public name, nationality and time. The latest TOP10 and this browser’s existing record are checked again when you register.', localOnly: 'Local preview · no online registration', notAvailable: 'This run is not eligible for online registration.',
    publicNote: 'Registration publishes your name, nationality, time and server registration date. An anonymous cookie manages one best record for this browser.',
    privacyNote: 'Your registration IP address is retained to investigate abnormal registrations and is accessible only to administrators. IP addresses older than 30 days are automatically deleted by the daily cleanup.',
    registeredDate: 'Server registered at', pendingDate: 'Set by the server on registration', noRegistrationDate: 'This run was not registered', localDate: 'Local finish date', onlineFixed: 'The server recalculates the time in hundredths of a second. The server registration date differs from the local finish date.',
    save: 'Register', saving: 'Registering…', retry: 'Retry the same registration', failed: 'The registration result could not be confirmed. Retry the same details to retrieve the result without creating a duplicate.',
    doneTitle: 'Registration complete', done: 'Your record is in the TOP10.', lost: 'The TOP10 changed during registration, so this record was not registered. Your local time and replay remain available.', notImproved: 'This browser already has an equal or faster record. The existing record was kept.',
    verifying: 'The server is verifying your finish.', verifyError: 'Online verification could not be completed. You can still preview the local record.', retryVerify: 'Retry finish verification', notEligible: 'The server verified this run, but it is not currently eligible for TOP10 registration.', rank: 'Confirmed rank',
  },
}

function localFinishDate(iso, locale) {
  const time = typeof iso === 'string' ? Date.parse(iso) : Number.NaN
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en' : 'ko', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time))
    : '—'
}

export default function SprintRecordPreview({ player, finishTimeMs, finishedAtISO, countries, locale = 'ko', visualStyle, onClose, onlineRun, registration = { status: 'idle' }, onRegister, onRetryVerification }) {
  if (!Array.isArray(countries)) throw new TypeError('SprintRecordPreview requires the page’s country labels.')
  const text = copy[locale === 'en' ? 'en' : 'ko']
  const id = useId()
  const dialogRef = useRef(null)
  const nameRef = useRef(null)
  const countryRef = useRef(null)
  const summaryRef = useRef(null)
  const alertRef = useRef(null)
  const outcomeRef = useRef(null)
  const submissionPendingRef = useRef(false)
  const nameComposingRef = useRef(false)
  const nameSubmitGuardRef = useRef(false)
  const nameSubmitGuardTimerRef = useRef(null)
  const fixedDetailsRef = useRef(registration.details || null)
  const previousStatusRef = useRef(registration.status)
  const [name, setName] = useState(() => registration.details?.playerName || player?.name || '')
  const [countryCode, setCountryCode] = useState(() => registration.details?.countryCode || player?.countryCode || '')
  const [errors, setErrors] = useState({})
  const [record, setRecord] = useState(null)
  const [fixedDetails, setFixedDetails] = useState(registration.details || null)
  const [submitting, setSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState(false)
  const [animateRecord, setAnimateRecord] = useState(false)
  const art = (visualStyle || player?.art) === 'pixel' ? 'pixel' : 'realistic'
  const online = onlineRun?.status === 'verified' && onlineRun.eligible
  const verified = onlineRun?.status === 'verified'
  const terminal = ['registered', 'not_qualified', 'not_improved'].includes(registration.status)
  const registered = registration.status === 'registered'
  const busy = submitting || registration.status === 'saving'
  const locked = !!(registration.details || fixedDetails) || busy
  const visibleTimeMs = verified ? onlineRun.timeCs * 10 : finishTimeMs
  const nameError = errors.name ? text[errors.name === 'required' ? 'requiredName' : errors.name === 'tooLong' ? 'tooLongName' : 'invalidName'] : null
  const countryError = errors.countryCode ? text.invalidCountry : null
  const runError = !!(errors.finishTimeMs || errors.finishedAtISO || errors.art)
  const timeText = Number.isFinite(visibleTimeMs) && visibleTimeMs > 0 ? `${formatSprintTime(visibleTimeMs)}s` : '—'
  const dateText = localFinishDate(finishedAtISO, locale)
  const nationality = countries.find(country => country.code === record?.countryCode)
  const specialOutcome = registered && ['first', 'broken', 'tied'].includes(registration.worldRecord?.status)

  useEffect(() => {
    if (terminal) return
    const target = nameRef.current && !nameRef.current.disabled ? nameRef.current : dialogRef.current
    target?.focus({ preventScroll: true })
  }, [])
  useEffect(() => () => clearTimeout(nameSubmitGuardTimerRef.current), [])
  useEffect(() => { if (record) summaryRef.current?.focus() }, [record])
  useEffect(() => { if (runError) alertRef.current?.focus() }, [runError])
  useEffect(() => { if (terminal) outcomeRef.current?.focus() }, [terminal])
  useEffect(() => {
    if (registration.status === 'registered' && previousStatusRef.current !== 'registered') setAnimateRecord(true)
    previousStatusRef.current = registration.status
  }, [registration.status])

  function keyDown(event) {
    event.stopPropagation()
    if (event.key === 'Escape') {
      if (event.nativeEvent?.isComposing || nameComposingRef.current) return
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const elements = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null)
    const first = elements[0]
    const last = elements.at(-1)
    const current = document.activeElement
    const listed = elements.includes(current)
    if (!first) { event.preventDefault(); dialogRef.current?.focus(); return }
    if (event.shiftKey && (current === first || !listed)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (current === last || !listed)) {
      event.preventDefault()
      first.focus()
    }
  }

  function guardComposingSubmit() {
    nameSubmitGuardRef.current = true
    clearTimeout(nameSubmitGuardTimerRef.current)
    nameSubmitGuardTimerRef.current = setTimeout(() => { nameSubmitGuardRef.current = false }, 0)
  }

  function nameKeyDown(event) {
    if (event.key !== 'Enter') return
    if (event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229 || nameComposingRef.current) {
      guardComposingSubmit()
      return
    }
    if (event.repeat) event.preventDefault()
  }

  async function submit(event) {
    event.preventDefault()
    if (terminal || submissionPendingRef.current || busy || nameComposingRef.current || nameSubmitGuardRef.current || event.nativeEvent?.isComposing) return
    if (online) {
      const priorDetails = registration.details || fixedDetailsRef.current
      const result = validateSprintPlayer({ name: priorDetails?.playerName ?? name, countryCode: priorDetails?.countryCode ?? countryCode, art })
      const nextErrors = { ...result.errors }
      if (!Number.isSafeInteger(onlineRun.timeCs) || onlineRun.timeCs <= 0) nextErrors.finishTimeMs = 'invalid'
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length) {
        if (nextErrors.name) nameRef.current?.focus()
        else if (nextErrors.countryCode) countryRef.current?.focus()
        return
      }
      if (typeof onRegister !== 'function') { setSubmissionError(true); return }
      const details = priorDetails || Object.freeze({ playerName: result.player.name, countryCode: result.player.countryCode })
      // Fix the payload before calling the parent or yielding. Even an ambiguous
      // network failure must retry these details, including after reopening.
      submissionPendingRef.current = true
      fixedDetailsRef.current = details
      setFixedDetails(details)
      setName(details.playerName)
      setCountryCode(details.countryCode)
      setSubmissionError(false)
      setSubmitting(true)
      dialogRef.current?.focus({ preventScroll: true })
      try { await onRegister(details) }
      catch { setSubmissionError(true) }
      finally { submissionPendingRef.current = false; setSubmitting(false) }
      return
    }
    const result = buildSprintRecordPreview({ player: { name, countryCode, art }, finishTimeMs: visibleTimeMs, finishedAtISO })
    setErrors(result.errors)
    setRecord(result.record)
    if (result.errors.name) nameRef.current?.focus()
    else if (result.errors.countryCode) countryRef.current?.focus()
  }

  function retryVerification() {
    // The retry button disappears as soon as verification starts.
    dialogRef.current?.focus({ preventScroll: true })
    void onRetryVerification()
  }

  return <div className={styles.backdrop} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={keyDown} onKeyUp={event => event.stopPropagation()}>
    <section ref={dialogRef} className={styles.dialog} data-art={art} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={terminal ? undefined : `${id}-notice`} tabIndex={-1}>
      <header className={styles.header}><div><p className={styles.eyebrow}>{text.eyebrow}</p><h2 id={`${id}-title`}>{registered ? text.doneTitle : online ? text.onlineTitle : text.title}</h2></div><button type="button" className={styles.closeIcon} aria-label={text.close} onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button></header>
      {!terminal && <div className={styles.notice} id={`${id}-notice`}><strong>{online ? text.online : onlineRun ? text.localOnly : text.disconnected}</strong><p>{online ? text.onlineNotice : onlineRun?.attemptId ? text[onlineRun.status === 'verifying' ? 'verifying' : onlineRun.status === 'verification_error' ? 'verifyError' : 'notEligible'] : onlineRun ? text.localNotice : text.notice}</p>{online && <p>{text.publicNote}</p>}{online && <p>{text.privacyNote}</p>}{onlineRun?.status === 'verification_error' && <button className={styles.retry} type="button" onClick={retryVerification}>{text.retryVerify}</button>}</div>}
      {!terminal && <form onSubmit={submit} noValidate aria-busy={busy} data-testid="sprint-record-registration">
        <div className={styles.fields}>
          <div className={styles.field}><label htmlFor={`${id}-name`}>{text.name}<span>{[...name.normalize('NFC')].length}/{SPRINT_PLAYER_NAME_LIMIT}</span></label><input id={`${id}-name`} ref={nameRef} value={name} disabled={locked} autoComplete="off" aria-required="true" aria-invalid={!!nameError} aria-describedby={`${id}-name-hint${nameError ? ` ${id}-name-error` : ''}`} onKeyDown={nameKeyDown} onCompositionStart={() => { nameComposingRef.current = true }} onCompositionEnd={() => { nameComposingRef.current = false; guardComposingSubmit() }} onChange={event => { setName(event.target.value); setRecord(null); setErrors(previous => ({ ...previous, name: undefined })) }} /><small id={`${id}-name-hint`}>{text.nameHint}</small>{nameError && <p className={styles.error} id={`${id}-name-error`} role="alert">{nameError}</p>}</div>
          <div className={styles.field}><label htmlFor={`${id}-country`}>{text.country}</label><select id={`${id}-country`} ref={countryRef} value={countryCode} disabled={locked} aria-required="true" aria-invalid={!!countryError} aria-describedby={countryError ? `${id}-country-error` : undefined} onChange={event => { setCountryCode(event.target.value); setRecord(null); setErrors(previous => ({ ...previous, countryCode: undefined })) }}>{countries.map(country => <option key={country.code} value={country.code}>{country.flag} {country.label}</option>)}</select>{countryError && <p className={styles.error} id={`${id}-country-error`} role="alert">{countryError}</p>}</div>
        </div>
        <div className={styles.readOnly} data-online={online} aria-describedby={`${id}-fixed-note`}><div className={styles.field}><label htmlFor={`${id}-time`}>{text.time}</label><input id={`${id}-time`} readOnly value={timeText} /></div>{!online && <div className={styles.field}><label htmlFor={`${id}-date`}>{text.localDate}</label><input id={`${id}-date`} readOnly value={dateText} /></div>}</div>
        <p className={styles.fixedNote} id={`${id}-fixed-note`}>{verified ? text.onlineFixed : text.readOnly}</p>
        {runError && <p ref={alertRef} className={styles.error} role="alert" tabIndex={-1}>{text.invalidRun}</p>}
        {(online || !locked) && <button type="submit" className={styles.confirm} data-testid="sprint-record-submit" disabled={busy || onlineRun?.status === 'verifying'}>{online ? text[busy ? 'saving' : registration.status === 'error' || submissionError ? 'retry' : 'save'] : text.confirm} <span aria-hidden="true">↗</span></button>}
      </form>}
      {!online && !terminal && record && <section ref={summaryRef} className={styles.summary} tabIndex={-1} aria-labelledby={`${id}-summary`}><h3 id={`${id}-summary`}>{text.summary}</h3><p role="status">{text.ready}</p><dl><div><dt>{text.name}</dt><dd>{record.playerName}</dd></div><div><dt>{text.country}</dt><dd>{nationality ? `${nationality.flag} ${nationality.label}` : record.countryCode}</dd></div><div><dt>{text.time}</dt><dd>{formatSprintTime(visibleTimeMs)}s</dd></div><div><dt>{text.localDate}</dt><dd><time dateTime={record.finishedAtISO}>{localFinishDate(record.finishedAtISO, locale)}</time></dd></div></dl></section>}
      {(registration.status === 'error' || submissionError) && !terminal && <p className={styles.error} role="alert">{text.failed}</p>}
      {registered ? <div ref={outcomeRef} tabIndex={-1} className={styles.result} data-testid="sprint-registration-result" aria-label={text.doneTitle}>
        <SprintWorldRecord worldRecord={registration.worldRecord} visualStyle={art} locale={locale} animate={animateRecord} />
        {!specialOutcome && <p className={styles.outcome} role="status">{text.done}</p>}
        <dl className={styles.resultDetails}><div><dt>{text.rank}</dt><dd>{registration.record?.rank}</dd></div><div><dt>{text.time}</dt><dd>{Number.isSafeInteger(registration.record?.timeCs) ? `${formatSprintTime(registration.record.timeCs * 10)}s` : '—'}</dd></div><div><dt>{text.registeredDate}</dt><dd>{registration.record?.recordedAt ? <time dateTime={registration.record.recordedAt}>{localFinishDate(registration.record.recordedAt, locale)}</time> : '—'}</dd></div></dl>
      </div> : terminal && <p ref={outcomeRef} tabIndex={-1} className={styles.outcome} role="status">{text[registration.status === 'not_qualified' ? 'lost' : 'notImproved']}</p>}
      <footer className={styles.footer}>{!terminal && !online && <button type="button" className={styles.unavailable} disabled>{onlineRun ? onlineRun.status === 'verifying' ? text.verifying : text.notAvailable : text.disabled}</button>}<button type="button" className={styles.closeButton} onClick={onClose}>{text.close}</button></footer>
    </section>
  </div>
}
