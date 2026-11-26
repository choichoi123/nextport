import { createBaseballLocalId } from './playground-baseball-data.mjs'
import { createBaseballIndexedDbRepository } from './playground-baseball-outbox.mjs'
import { getBaseballCareerAdvancePlan } from './playground-baseball-career-highlights.mjs'
import { BASEBALL_REGULAR_SEASON_GAMES } from './playground-baseball-career-schedule.mjs'
import { publicBaseballCareerSave, sumBaseballCareerStats } from './playground-baseball-career-v2.mjs'
import { publicBaseballAtBatSession } from './playground-baseball-at-bat-session-v2.mjs'
import { isBaseballWinterPlan } from './playground-baseball-winter.mjs'
import {
  advanceBaseballAnnualDraft,
  BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES,
  BASEBALL_ANNUAL_MAX_SEASONS,
  createBaseballAnnualDraft,
  getBaseballAnnualIdentity,
  isBaseballCareerFinish,
  replayBaseballAnnualBackup,
  validateBaseballAnnualDraft,
} from './playground-baseball-annual.mjs'

export const BASEBALL_ANNUAL_DATABASE = 'nextport-baseball-annual-v1'
const storeName = 'seasons'
const winterStoreName = 'winterDrafts'
const endpoint = '/api/playground/baseball/careers-annual'
const backupFormat = 'nextport-baseball-season-v1'
const backupMaxBytes = BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES + 1024
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const byteLength = value => new TextEncoder().encode(value).byteLength
const fail = code => Object.assign(new Error('The annual save operation could not be completed.'), {code})
const trainingChoices = ['mit','power','discipline','stamina']

function sameDraftVersion(first, second) {
  return first.revision === second.revision && Boolean(first.receipt) === Boolean(second.receipt)
    && first.finish === second.finish
}

function sameDraftSeason(first, second) {
  const previous = first?.setup?.continuation
  const next = second.setup.continuation
  return Boolean(previous && next && previous.careerId === next.careerId && previous.seasonNumber === next.seasonNumber)
}

function automaticPreparation(growth) {
  if (growth.condition <= 65) return 'rest'
  return trainingChoices.reduce((weakest, choice) => growth[choice] < growth[weakest] ? choice : weakest)
}

const errorCodes = new Set([
  'active_at_bat', 'automatic_budget', 'body_too_large', 'career_complete', 'command_conflict', 'database_unavailable',
  'input_already_accepted', 'input_required', 'invalid_command', 'invalid_response', 'local_capacity', 'local_conflict',
  'local_data_invalid', 'network_unavailable', 'not_configured', 'not_found', 'owner_required', 'pitch_paused',
  'pitch_required', 'preparation_complete', 'preparation_required', 'rate_limited', 'revision_conflict',
  'season_conflict', 'season_incomplete', 'season_limit', 'session_complete', 'storage_capacity', 'storage_full', 'storage_unavailable',
  'verification_unavailable', 'version_mismatch',
])
const domainCodes = {
  invalid: 'invalid_command', conflict: 'local_conflict', complete: 'career_complete',
  'at-bat-active': 'active_at_bat', 'automatic-budget': 'automatic_budget', 'input-already-accepted': 'input_already_accepted',
  'input-required': 'input_required', 'missing-pitch': 'pitch_required', paused: 'pitch_paused',
  'preparation-complete': 'preparation_complete', 'preparation-required': 'preparation_required',
  'version-mismatch': 'version_mismatch',
}

function safeCode(error, fallback = 'storage_unavailable') {
  if (errorCodes.has(error?.code)) return error.code
  if (Object.hasOwn(domainCodes, error?.code)) return domainCodes[error.code]
  if (error?.name === 'QuotaExceededError') return 'storage_full'
  if (error?.name === 'ConstraintError') return 'local_conflict'
  return fallback
}

function defaultId() {
  const id = createBaseballLocalId()
  if (!id) throw fail('storage_unavailable')
  return id
}

function defaultSeed() {
  if (!globalThis.crypto?.getRandomValues) throw fail('storage_unavailable')
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
}

function restoreWinterDraft(store, id, plan) {
  const request = store.get(id)
  request.onsuccess = () => {
    if (request.result === undefined) store.add(plan, id)
  }
}

/** The whole draft is replaced atomically so an older tab cannot erase input. */
export function createBaseballAnnualRepository(indexedDB = globalThis.indexedDB) {
  let database = null
  let opening = null
  function init() {
    if (database) return Promise.resolve()
    if (opening) return opening
    opening = new Promise((resolve, reject) => {
      let request
      try { request = indexedDB.open(BASEBALL_ANNUAL_DATABASE, 2) }
      catch { reject(fail('storage_unavailable')); return }
      let blocked = false
      request.onupgradeneeded = () => {
        const result = request.result
        if (!result.objectStoreNames.contains(storeName)) result.createObjectStore(storeName)
        if (!result.objectStoreNames.contains(winterStoreName)) result.createObjectStore(winterStoreName)
      }
      request.onerror = () => reject(fail(safeCode(request.error)))
      request.onblocked = () => { blocked = true; reject(fail('storage_unavailable')) }
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return }
        database = request.result
        database.onversionchange = close
        resolve()
      }
    }).finally(() => { opening = null })
    return opening
  }
  function close() {
    database?.close()
    database = null
  }
  function transaction(mode, stores, work) {
    return new Promise((resolve, reject) => {
      let txn, value, conflict
      try {
        txn = database.transaction(stores, mode)
        work(txn, result => { value = result }, () => {
          conflict = fail('local_conflict')
          txn.abort()
        })
      } catch (error) {
        reject(fail(safeCode(error)))
        return
      }
      txn.oncomplete = () => resolve(value)
      txn.onabort = txn.onerror = event => reject(conflict || fail(safeCode(event.target?.error || txn.error)))
    })
  }
  return {
    init,
    close,
    list: () => transaction('readonly', storeName, (txn, done) => {
      const request = txn.objectStore(storeName).getAll()
      request.onsuccess = () => done(request.result)
    }),
    read: id => transaction('readonly', storeName, (txn, done) => {
      const request = txn.objectStore(storeName).get(id)
      request.onsuccess = () => done(request.result)
    }),
    readWinterDraft: id => transaction('readonly', winterStoreName, (txn, done) => {
      const request = txn.objectStore(winterStoreName).get(id)
      request.onsuccess = () => done(request.result)
    }),
    saveWinterDraft: (id, plan) => transaction('readwrite', winterStoreName, txn => {
      txn.objectStore(winterStoreName).put(plan, id)
    }),
    restoreWinterDraft: (id, plan) => transaction('readwrite', winterStoreName, txn => {
      restoreWinterDraft(txn.objectStore(winterStoreName), id, plan)
    }),
    insert: (draft, winterDraft) => transaction('readwrite', winterDraft ? [storeName, winterStoreName] : storeName, (txn, _done, conflict) => {
      const store = txn.objectStore(storeName)
      const insert = () => {
        store.add(draft, draft.setup.id)
        if (winterDraft) restoreWinterDraft(txn.objectStore(winterStoreName), draft.setup.id, winterDraft)
      }
      if (!draft.setup.continuation) { insert(); return }
      // The read and write share one transaction even across independent tabs.
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) insert()
        else if (sameDraftSeason(cursor.value, draft)) conflict()
        else cursor.continue()
      }
    }),
    replace: (previous, draft, winterDraft) => transaction('readwrite', winterDraft ? [storeName, winterStoreName] : storeName, (txn, done, conflict) => {
      const store = txn.objectStore(storeName)
      const request = store.get(previous.setup.id)
      request.onsuccess = () => {
        const current = request.result
        if (!current || !sameDraftVersion(current,previous)) {
          conflict()
          return
        }
        store.put(draft, draft.setup.id)
        if (winterDraft) restoreWinterDraft(txn.objectStore(winterStoreName), draft.setup.id, winterDraft)
        done(draft)
      }
    }),
  }
}

export function createBaseballAnnualTransport({
  fetchImpl = globalThis.fetch,
  bootstrapRepository,
} = {}) {
  const requests = new Set()
  async function request(method, body, timeout, url = endpoint) {
    const controller = new AbortController()
    requests.add(controller)
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await fetchImpl(url, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        ...(body === undefined ? {} : {headers:{'Content-Type':'application/json'}, body}),
      })
      let value
      try { value = await response.json() }
      catch { throw fail(response.status === 413 ? 'body_too_large' : 'invalid_response') }
      if (!response.ok) throw fail(errorCodes.has(value?.code) ? value.code : 'database_unavailable')
      return value
    } catch (error) {
      throw fail(safeCode(error, 'network_unavailable'))
    } finally {
      clearTimeout(timer)
      requests.delete(controller)
    }
  }
  return {
    history(careerId) {
      if (!uuid.test(careerId)) throw fail('invalid_command')
      return request('GET', undefined, 15000, `${endpoint}?careerId=${careerId}`)
    },
    async settle(submission) {
      const body = JSON.stringify(submission)
      if (byteLength(body) > BASEBALL_ANNUAL_MAX_SUBMISSION_BYTES) throw fail('body_too_large')
      bootstrapRepository ||= createBaseballIndexedDbRepository()
      await bootstrapRepository.init()
      const bootstrap = await bootstrapRepository.withBootstrapLease(() => request('GET', undefined, 15000))
      if (bootstrap?.status !== 'ok') throw fail('invalid_response')
      return request('POST', body, 180000)
    },
    close() {
      for (const controller of requests) controller.abort()
      bootstrapRepository?.close()
    },
  }
}

const updatedAt = draft => draft.actions.at(-1)?.now || draft.setup.now
const canonicalTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

function verifiedReceipt(response, draft) {
  const receipt = response?.receipt
  const {careerId,seasonId,seasonNumber} = getBaseballAnnualIdentity(draft.setup)
  const stats = draft.career.stats
  if (response?.status !== 'stored' || receipt?.seasonId !== seasonId || receipt.careerId !== careerId
    || receipt.seasonNumber !== seasonNumber || !canonicalTime(receipt.savedAt) || !receipt.stats
    || Object.keys(receipt.stats).length !== Object.keys(stats).length
    || !Object.keys(stats).every(key => receipt.stats[key] === stats[key])) throw fail('invalid_response')
  const winter = draft.setup.winter
  if (winter === undefined ? Object.hasOwn(receipt, 'winter')
    : !isBaseballWinterPlan(receipt.winter) || receipt.winter.version !== winter.version || receipt.winter.direction !== winter.direction) {
    throw fail('invalid_response')
  }
  const finish = draft.finish
  if (finish === undefined ? Object.hasOwn(receipt,'finish') : receipt.finish !== finish) throw fail('invalid_response')
  return {seasonId,careerId,seasonNumber,savedAt:receipt.savedAt,stats:{...stats},
    ...(winter ? {winter:{...winter}} : {}),...(finish ? {finish} : {})}
}

function validDraft(draft) {
  try {
    if (!validateBaseballAnnualDraft(draft)) return false
    if (draft.receipt) verifiedReceipt({status:'stored',receipt:draft.receipt}, draft)
    return true
  } catch { return false }
}

function matchesVersions(pinned, current) {
  return Boolean(pinned && current && Object.keys(current).length
    && Object.keys(current).every(key => pinned[key] === current[key]))
}

function supportsSetup(setup, versions, priorAnnualVersions) {
  return matchesVersions(setup?.versions,versions) || !setup?.continuation && matchesVersions(setup?.versions,priorAnnualVersions)
}

function confirmedHistory(value, id) {
  const history = value?.history
  const latest = value?.latest
  if (value?.status !== 'ok' || value.careerId !== id || !Array.isArray(history)
    || history.length < 1 || history.length > BASEBALL_ANNUAL_MAX_SEASONS || history[0]?.seasonId !== id
    || new Set(history.map(row => row?.seasonId)).size !== history.length
    || !history.every((row,index) => uuid.test(row?.seasonId) && row.seasonNumber === index+1
      && row.stats?.G === BASEBALL_REGULAR_SEASON_GAMES && row.stats.PA === BASEBALL_REGULAR_SEASON_GAMES * 2)
    || latest?.seasonId !== history.at(-1).seasonId || latest.seasonNumber !== history.length
    || !latest.growth || !latest.profile || !latest.settings || !['manual','development'].includes(latest.source)) throw fail('invalid_response')
  try { sumBaseballCareerStats(history.map(row => row.stats)) }
  catch { throw fail('invalid_response') }
  const winter = value.winter
  if (Object.hasOwn(value, 'winter') && (history.length < 2 || !winter || Object.getPrototypeOf(winter) !== Object.prototype
    || Object.keys(winter).length !== 1 || !Object.hasOwn(winter, '2') || !isBaseballWinterPlan(winter[2]))) throw fail('invalid_response')
  const finish = value.finish
  if (Object.hasOwn(value,'finish') && (history.length !== BASEBALL_ANNUAL_MAX_SEASONS || !isBaseballCareerFinish(finish))) throw fail('invalid_response')
  return {
    careerId:id,
    history:history.map(({seasonId,seasonNumber,stats}) => ({seasonId,seasonNumber,stats:{...stats}})),
    latest:{
      seasonId:latest.seasonId,seasonNumber:latest.seasonNumber,growth:{...latest.growth},
      profile:{...latest.profile},settings:{...latest.settings},source:latest.source,
    },
    ...(winter?.[2] ? {winter:{2:{...winter[2]}}} : {}),
    ...(finish ? {finish} : {}),
  }
}

const hasCompletedFirstSeason = draft => draft.career.status === 'complete' && draft.setup.continuation === undefined

async function readBackup(file, versions, priorAnnualVersions, signal) {
  if (typeof file !== 'string' && (!file || typeof file.text !== 'function' || !Number.isSafeInteger(file.size))) {
    throw fail('local_data_invalid')
  }
  if (typeof file !== 'string' && file.size > backupMaxBytes) throw fail('body_too_large')
  const contents = typeof file === 'string' ? file : await file.text()
  if (byteLength(contents) > backupMaxBytes) throw fail('body_too_large')
  let value
  try { value = JSON.parse(contents) }
  catch { throw fail('local_data_invalid') }
  if (!value || value.format !== backupFormat
    || Object.keys(value).some(key => !['format','setup','actions','winterDraft','finish'].includes(key))
    || !Object.hasOwn(value,'setup') || !Object.hasOwn(value,'actions')) throw fail('local_data_invalid')
  if (Object.hasOwn(value,'winterDraft') && !isBaseballWinterPlan(value.winterDraft)) throw fail('local_data_invalid')
  if (!supportsSetup(value.setup,versions,priorAnnualVersions)) throw fail('version_mismatch')
  try {
    const draft = await replayBaseballAnnualBackup(annualPayload(value),{signal})
    if (value.winterDraft && !hasCompletedFirstSeason(draft)) throw fail('local_data_invalid')
    return {draft,winterDraft:value.winterDraft}
  } catch { throw fail(signal.aborted ? 'storage_unavailable' : 'local_data_invalid') }
}

function annualPayload(value) {
  return {setup:value.setup,actions:value.actions,...(Object.hasOwn(value,'finish') ? {finish:value.finish} : {})}
}

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right)

/** A browser season may continue once it is ahead of and extends the confirmed archive. */
export function selectBaseballAnnualArchive(entry, careerId, archives) {
  const archive = archives?.[entry?.careerId || careerId]
  if (!archive || !entry?.annual) return archive
  if (entry.seasonNumber <= archive.latest.seasonNumber) return archive
  const extendsArchive = archive.history.every((row, index) => {
    const saved = entry.history?.[index]
    return saved?.seasonId === row.seasonId && saved.seasonNumber === row.seasonNumber
      && Object.keys(row.stats).every(key => row.stats[key] === saved.stats?.[key])
  })
  return extendsArchive ? undefined : archive
}

export async function openBaseballAnnualClient({
  versions,
  priorAnnualVersions,
  onChange = () => {},
  repository = createBaseballAnnualRepository(),
  transport = createBaseballAnnualTransport(),
  idFactory = defaultId,
  seedFactory = defaultSeed,
  now = Date.now,
} = {}) {
  const drafts = new Map()
  const confirmedHistories = new Map()
  const careerSnapshots = new WeakMap()
  const backupController = new AbortController()
  let tail = Promise.resolve(), busy = false, closed = false, code = null

  function publicCareer(draft) {
    if (!careerSnapshots.has(draft.career)) careerSnapshots.set(draft.career, publicBaseballCareerSave(draft.career))
    return careerSnapshots.get(draft.career)
  }
  function draftArchive(draft) {
    const identity = getBaseballAnnualIdentity(draft.setup)
    return selectBaseballAnnualArchive(
      {...identity, annual:true, history:draft.setup.continuation?.history},
      identity.careerId, Object.fromEntries(confirmedHistories),
    )
  }
  function assertEditable(draft) {
    if (draftArchive(draft)) throw fail('season_conflict')
  }
  function snapshot() {
    return {
      entries: [...drafts.values()].map(draft => ({
        id:draft.setup.id, checkpoint:publicCareer(draft), pending:null, updatedAt:updatedAt(draft),
        annual:true, receipt:draft.receipt, ...getBaseballAnnualIdentity(draft.setup),
        history:draft.setup.continuation?.history || [],
        ...(draft.setup.winter ? {winter:{...draft.setup.winter}} : {}),
        ...(draft.finish ? {finish:draft.finish} : {}),
      })),
      confirmedHistories: Object.fromEntries(confirmedHistories),
      history: [], busy, code,
    }
  }
  function publish() { if (!closed) onChange(snapshot()) }
  function serial(work) {
    const next = tail.then(async () => {
      if (closed) throw fail('storage_unavailable')
      busy = true
      code = null
      publish()
      try { return await work() }
      catch (error) { code = safeCode(error); throw fail(code) }
      finally { busy = false; publish() }
    })
    tail = next.catch(() => {})
    return next
  }
  async function load(id) {
    const previous = drafts.get(id)
    const draft = await repository.read(id)
    if (!draft) throw fail('not_found')
    if (previous && sameDraftVersion(draft,previous)) return previous
    if (!validDraft(draft)) throw fail('local_data_invalid')
    drafts.set(id,draft)
    return draft
  }
  function selected(id) {
    const draft = drafts.get(id)
    if (!draft) throw fail('not_found')
    return draft
  }
  function actionFor(draft, command) {
    const action = {...command, commandId:idFactory(), now:new Date(Math.max(now(),Date.parse(updatedAt(draft)))).toISOString()}
    if (action.type === 'issue') action.attemptId = idFactory()
    if (action.type === 'start-manual' || action.type === 'simulate-at-bat') action.atBatId = idFactory()
    if (action.type === 'simulate-game') {
      const played = draft.career.games[draft.career.currentGameIndex]?.appearances.length
      if (!Number.isInteger(played) || played >= 2) throw fail('career_complete')
      action.atBatIds = Array.from({length:2-played}, () => idFactory())
    }
    return action
  }
  async function saveDraft(previous, next) {
    await repository.replace(previous,next)
    drafts.set(next.setup.id,next)
    return next
  }
  async function chooseFinish(draft, finish) {
    try {
      const pending = await saveDraft(draft,{...draft,finish})
      publish()
      return pending
    } catch (error) {
      if (safeCode(error) !== 'local_conflict') throw error
      const latest = await load(draft.setup.id)
      if (latest.finish !== finish) throw error
      return latest
    }
  }

  async function applyAction(previous, action) {
    assertEditable(previous)
    if (!supportsSetup(previous.setup,versions,priorAnnualVersions)) throw fail('version_mismatch')
    return saveDraft(previous,advanceBaseballAnnualDraft(previous, action))
  }
  async function advanceGames(id, scope) {
    const previous = selected(id)
    assertEditable(previous)
    const plan = getBaseballCareerAdvancePlan(previous.career,scope)
    if (plan.stopReason === 'active') throw fail('active_at_bat')
    if (plan.stopReason === 'unavailable') throw fail('invalid_command')
    if (!plan.count) return publicCareer(previous)
    if (!supportsSetup(previous.setup,versions,priorAnnualVersions)) throw fail('version_mismatch')

    let next = previous
    while (next.career.currentGameIndex < plan.endIndex) {
      // Yield before each complete game so the browser can show the busy state.
      await new Promise(resolve => setTimeout(resolve,0))
      if (closed) throw fail('storage_unavailable')
      const game = next.career.games[next.career.currentGameIndex]
      if (!game.preparation) {
        const preparation = {type:'prepare',choice:automaticPreparation(next.career.growth)}
        next = advanceBaseballAnnualDraft(next,actionFor(next,preparation))
      }
      next = advanceBaseballAnnualDraft(next,actionFor(next,{type:'simulate-game'}))
    }
    // A single compare-and-swap keeps the entire range atomic across tabs.
    return publicCareer(await saveDraft(previous,next))
  }
  async function reload() {
    const values = await repository.list()
    if (values.some(draft => !validDraft(draft))) throw fail('local_data_invalid')
    drafts.clear()
    for (const draft of values) drafts.set(draft.setup.id,draft)
  }

  async function readWinterDraft(id) {
    if (typeof id !== 'string' || !uuid.test(id)) throw fail('invalid_command')
    const plan = await repository.readWinterDraft(id)
    if (plan === undefined) return null
    if (!isBaseballWinterPlan(plan)) throw fail('local_data_invalid')
    return plan
  }

  async function saveWinterDraft(id, plan) {
    if (typeof id !== 'string' || !uuid.test(id) || !isBaseballWinterPlan(plan)) throw fail('invalid_command')
    const local = drafts.has(id) ? await load(id) : null
    const archive = local && draftArchive(local) || (!local && confirmedHistories.get(id))
    if (archive ? archive.latest.seasonNumber !== 1 : !(local && hasCompletedFirstSeason(local) && local.receipt)) {
      throw fail('season_incomplete')
    }
    await repository.saveWinterDraft(id, plan)
    return plan
  }

  async function startNextSeason(id, winter) {
    if (!uuid.test(id)) throw fail('invalid_command')
    const local = drafts.has(id) ? await load(id) : null
    const identity = local ? getBaseballAnnualIdentity(local.setup) : null
    const careerId = identity?.careerId || id
    const confirmed = local ? draftArchive(local) : confirmedHistories.get(careerId)
    const remote = Boolean(confirmed)
    if (!local && !remote) throw fail('not_found')
    if (!remote && (local.career.status !== 'complete' || !local.receipt)) throw fail('season_incomplete')
    const previous = remote ? confirmed.latest : {
      ...identity,growth:local.career.growth,profile:local.career.profile,
      settings:local.career.settings,source:local.career.source,
    }
    if (previous.seasonNumber >= BASEBALL_ANNUAL_MAX_SEASONS) throw fail('season_limit')
    if (winter !== undefined && (previous.seasonNumber !== 1 || !isBaseballWinterPlan(winter))) throw fail('invalid_command')
    const history = remote ? confirmed.history : [...(local.setup.continuation?.history || []), {
      seasonId:previous.seasonId,seasonNumber:previous.seasonNumber,stats:local.receipt.stats,
    }]
    const continuation = {
      careerId,previousSeasonId:previous.seasonId,seasonNumber:previous.seasonNumber+1,
      startingGrowth:previous.growth,history,
    }
    const draft = createBaseballAnnualDraft({
      id:idFactory(),profile:previous.profile,settings:previous.settings,source:previous.source,versions,
      seed:seedFactory(),now:new Date(Math.max(now(),local?.receipt ? Date.parse(local.receipt.savedAt) : 0)).toISOString(),continuation,winter,
    })
    // A tab that won the creation race already chose the season's seed and ID.
    try { await repository.insert(draft) }
    catch (error) {
      if (safeCode(error) !== 'local_conflict') throw error
      const existing = (await repository.list()).find(candidate => sameDraftSeason(candidate,draft))
      if (!existing || !validDraft(existing) || existing.setup.continuation.previousSeasonId !== previous.seasonId
        || draftArchive(existing)) throw error
      drafts.set(existing.setup.id,existing)
      return publicCareer(existing)
    }
    drafts.set(draft.setup.id,draft)
    return publicCareer(draft)
  }

  function createAdapter(careerId, initial, player) {
    const id = initial.session.id
    const listeners = new Set()
    let checkpoint = publicBaseballAtBatSession(initial.session)
    let lastReceipt = null, intent = null, adapterBusy = false, adapterCode = null, adapterClosed = false
    const state = () => ({
      entries:[{id, checkpoint, player, pending:intent ? {body:{expectedRevision:intent.childRevision}} : null}],
      history:[], lastReceipt, busy:adapterBusy, code:adapterCode,
    })
    const emit = () => { if (!adapterClosed) for (const listener of listeners) listener(state()) }
    const run = work => serial(async () => {
      if (adapterClosed) throw fail('storage_unavailable')
      adapterBusy = true
      adapterCode = null
      emit()
      try { return await work() }
      catch (error) { adapterCode = safeCode(error); throw fail(adapterCode) }
      finally { adapterBusy = false; emit() }
    })
    const currentSession = draft => {
      if (draft.session?.id !== id) throw fail('session_complete')
      return draft.session
    }
    async function applyIntent() {
      const draft = selected(careerId)
      if (!intent || currentSession(draft).revision !== intent.childRevision) throw fail('local_conflict')
      const next = await applyAction(draft,intent.action)
      checkpoint = publicBaseballAtBatSession(currentSession(next))
      lastReceipt = {sessionId:id, commandId:intent.action.commandId, revision:checkpoint.revision}
      intent = null
      return checkpoint
    }
    const client = {
      snapshot: state,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
      command: (atBatId, command) => run(async () => {
        if (atBatId !== id || intent) throw fail('local_conflict')
        const draft = selected(careerId)
        if (currentSession(draft).revision !== checkpoint.revision) throw fail('local_conflict')
        intent = {action:actionFor(draft,command),childRevision:checkpoint.revision}
        try { return await applyIntent() }
        catch (error) {
          // Retain a game input only when the attempted write could be repeated.
          if (!['local_conflict','storage_full','storage_unavailable'].includes(safeCode(error))) intent = null
          throw error
        }
      }),
      read: atBatId => run(async () => {
        if (atBatId !== id) throw fail('not_found')
        checkpoint = publicBaseballAtBatSession(currentSession(await load(careerId)))
        return {session:checkpoint,player,pending:state().entries[0].pending}
      }),
      retry: atBatId => run(async () => { if (atBatId !== id) throw fail('not_found'); return applyIntent() }),
      adoptLatest: atBatId => run(async () => {
        if (atBatId !== id) throw fail('not_found')
        checkpoint = publicBaseballAtBatSession(currentSession(await load(careerId)))
        if (intent && checkpoint.revision <= intent.childRevision) throw fail('local_conflict')
        intent = null
        return checkpoint
      }),
      close: () => { adapterClosed = true; listeners.clear() },
    }
    return {client,session:checkpoint,pending:null}
  }

  const client = {
    snapshot,
    refresh: () => serial(async () => { await reload(); return snapshot() }),
    create: (profile,settings,{source='manual'} = {}) => serial(async () => {
      const id = idFactory()
      if (!uuid.test(id) || !versions) throw fail('version_mismatch')
      const draft = createBaseballAnnualDraft({id,profile,settings,source,versions,seed:seedFactory(),now:new Date(now()).toISOString()})
      await repository.insert(draft)
      drafts.set(id,draft)
      return publicCareer(draft)
    }),
    read: id => serial(async () => ({career:publicCareer(await load(id)),pending:null})),
    loadHistory: id => serial(async () => {
      if (!uuid.test(id)) throw fail('invalid_command')
      let result
      try { result = await transport.history(id) }
      catch (error) { if (safeCode(error) === 'not_found') return null; throw error }
      const confirmed = confirmedHistory(result,id)
      confirmedHistories.set(id,confirmed)
      return confirmed
    }),
    readWinterDraft: id => serial(() => readWinterDraft(id)),
    saveWinterDraft: (id,plan) => serial(() => saveWinterDraft(id,plan)),
    startNextSeason: (id,winter) => serial(() => startNextSeason(id,winter)),
    adoptLatest: id => serial(async () => publicCareer(await load(id))),
    command: (id,command) => serial(async () => {
      const draft = selected(id)
      assertEditable(draft)
      return publicCareer(await applyAction(draft,actionFor(draft,command)))
    }),
    advance: (id,scope) => serial(() => advanceGames(id,scope)),
    atBatAdapter: (careerId,atBatId,player) => serial(async () => {
      const draft = await load(careerId)
      assertEditable(draft)
      if (draft.session?.id !== atBatId || draft.career.activeAtBat?.id !== atBatId) throw fail('not_found')
      return createAdapter(careerId,draft,player)
    }),
    exportSave: id => serial(async () => {
      const draft = await load(id)
      const winterDraft = hasCompletedFirstSeason(draft) ? await readWinterDraft(id) : null
      const contents = JSON.stringify({format:backupFormat,...annualPayload(draft),...(winterDraft ? {winterDraft} : {})})
      if (byteLength(contents) > backupMaxBytes) throw fail('body_too_large')
      return contents
    }),
    importSave: file => serial(async () => {
      const {draft,winterDraft} = await readBackup(file,versions,priorAnnualVersions,backupController.signal)
      const id = draft.setup.id
      const existing = await repository.read(id)
      if (existing) {
        if (!validDraft(existing)) throw fail('local_data_invalid')
        if (draft.finish && (existing.receipt || existing.finish) && draft.finish !== existing.finish) throw fail('local_conflict')
        if (sameJson(existing.setup,draft.setup) && sameJson(existing.actions,draft.actions)) {
          if (draft.finish && !existing.finish) return publicCareer(await chooseFinish(existing,draft.finish))
          if (winterDraft) await repository.restoreWinterDraft(id,winterDraft)
          drafts.set(id,existing)
          return publicCareer(existing)
        }
        if (existing.receipt || !sameJson(existing.setup,draft.setup) || existing.actions.length >= draft.actions.length
          || !sameJson(existing.actions,draft.actions.slice(0,existing.actions.length))) throw fail('local_conflict')
        await repository.replace(existing,draft,winterDraft)
      } else await repository.insert(draft,winterDraft)
      drafts.set(id,draft)
      return publicCareer(draft)
    }),
    settle: (id,finish) => serial(async () => {
      let draft = await load(id)
      assertEditable(draft)
      if (draft.career.status !== 'complete') throw fail('season_incomplete')
      const tenthSeason = getBaseballAnnualIdentity(draft.setup).seasonNumber === BASEBALL_ANNUAL_MAX_SEASONS
      if (finish !== undefined && (!tenthSeason || !isBaseballCareerFinish(finish))) throw fail('invalid_command')
      if (finish !== undefined && (draft.finish || draft.receipt) && draft.finish !== finish) throw fail('local_conflict')
      if (draft.receipt) return {career:publicCareer(draft),receipt:draft.receipt}
      if (!supportsSetup(draft.setup,versions,priorAnnualVersions)) throw fail('version_mismatch')
      if (tenthSeason && !draft.finish) {
        if (finish === undefined) throw fail('invalid_command')
        draft = await chooseFinish(draft,finish)
        if (draft.receipt) return {career:publicCareer(draft),receipt:draft.receipt}
      }
      const response = await transport.settle(annualPayload(draft))
      const receipt = verifiedReceipt(response,draft)
      const next = {...draft,receipt}
      try { await repository.replace(draft,next) }
      catch (error) {
        if (safeCode(error) !== 'local_conflict') throw error
        const latest = await load(id)
        if (!latest.receipt || !sameJson(latest.receipt,receipt)) throw error
        return {career:publicCareer(latest),receipt:latest.receipt}
      }
      drafts.set(id,next)
      return {career:publicCareer(next),receipt}
    }),
    close: () => {
      closed = true
      backupController.abort()
      transport.close?.()
      void tail.finally(() => repository.close())
    },
  }
  try { await repository.init(); await reload(); publish() }
  catch (error) { client.close(); throw fail(safeCode(error)) }
  return client
}
