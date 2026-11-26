import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createBaseballAtBatSession, applyBaseballAtBatSessionCommand, publicBaseballAtBatSession, validateBaseballAtBatSession } from '../playground-baseball-at-bat-session.mjs'
import { matchesBaseballAtBatVersions } from '../playground-baseball-pitch-version-compat.mjs'
import { canonicalBaseballVersionJson, createBaseballDataVersions, normalizeBaseballVersionSource } from './baseball-version.mjs'
import { createBaseballParticipant, hasBaseballSameOrigin, readBaseballParticipant } from './baseball-auth.mjs'
import { readBaseballConfiguration } from './baseball-db.mjs'
import { getBaseballAtBatStore } from './baseball-at-bat-db.mjs'

export const BASEBALL_AT_BAT_MAX_BODY_BYTES = 16 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA = /^[a-f0-9]{64}$/
const isUuid = value => typeof value === 'string' && UUID.test(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const digest = value => createHash('sha256').update(value).digest('hex')
const commandHash = value => digest(canonicalBaseballVersionJson(value))

/** These identities are public source hashes, never credentials or database IDs. */
export async function createBaseballAtBatVersions({ readSource = file => readFile(path.join(process.cwd(), file)), getEngineVersions = createBaseballDataVersions } = {}) {
  const engine = await getEngineVersions()
  const sourceHash = async file => digest(normalizeBaseballVersionSource(await readSource(file)))
  const [atBatSourceHash, practicePitchHash, fieldHash, sessionHash] = await Promise.all([
    sourceHash('lib/playground-baseball-at-bat.mjs'), sourceHash('lib/playground-baseball-practice-pitches.mjs'),
    sourceHash('lib/playground-baseball-field.mjs'), sourceHash('lib/playground-baseball-at-bat-session.mjs'),
  ])
  const atBatHash = digest(canonicalBaseballVersionJson([atBatSourceHash, practicePitchHash]))
  return { engineHash:engine.engine.hash, rulesHash:engine.rules.hash, atBatHash, fieldHash, sessionHash }
}

function errorResponse(res, status, code, session) {
  return res.status(status).json({ status:status === 503 ? 'unavailable' : 'error', code, ...(session ? { session } : {}) })
}
function bodyError(code, statusCode) { return Object.assign(new Error('Invalid at-bat body'), { code, statusCode }) }
async function readJsonBody(req) {
  if (req.body !== undefined) {
    let encoded
    try { encoded = JSON.stringify(req.body) } catch { throw bodyError('invalid_command', 400) }
    if (typeof encoded !== 'string') throw bodyError('invalid_command', 400)
    if (Buffer.byteLength(encoded) > BASEBALL_AT_BAT_MAX_BODY_BYTES) throw bodyError('body_too_large', 413)
    return req.body
  }
  if (typeof req.on !== 'function') throw bodyError('invalid_command', 400)
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    const cleanup = () => { req.off('data', data); req.off('end', end); req.off('error', failed); req.off('aborted', failed) }
    const failed = () => { cleanup(); reject(bodyError('invalid_command', 400)) }
    const data = chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > BASEBALL_AT_BAT_MAX_BODY_BYTES) { cleanup(); req.resume(); reject(bodyError('body_too_large', 413)); return }
      chunks.push(bytes)
    }
    const end = () => { cleanup(); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(bodyError('invalid_command', 400)) } }
    req.on('data', data); req.on('end', end); req.on('error', failed); req.on('aborted', failed)
  })
}

function safeSession(snapshot, expectedId) {
  const checked = validateBaseballAtBatSession(snapshot)
  if (checked === false || checked?.valid === false) throw new Error('Invalid stored at-bat')
  const session = publicBaseballAtBatSession(snapshot)
  if (expectedId !== undefined && session.id !== expectedId) throw new Error('Invalid at-bat checkpoint identity')
  return session
}
function safeReceipt(receipt, id, commandId) {
  if (!exact(receipt, ['sessionId','commandId','revision']) || receipt.sessionId !== id || receipt.commandId !== commandId
    || !Number.isSafeInteger(receipt.revision) || receipt.revision < 1) throw new Error('Invalid at-bat receipt')
  return { sessionId:id, commandId, revision:receipt.revision }
}
function knownStoreError(res, result) {
  if (result?.status === 'not_found') return errorResponse(res, 404, 'not_found')
  if (result?.status !== 'error') return null
  const code = ['revision_conflict','command_conflict','rate_limited','invalid_command','not_found','storage_capacity'].includes(result.code) ? result.code : 'invalid_command'
  if (code === 'rate_limited') res.setHeader('Retry-After', '60')
  return errorResponse(res, code === 'rate_limited' ? 429 : code === 'not_found' ? 404 : code === 'storage_capacity' ? 413 : code.endsWith('conflict') ? 409 : 400, code)
}

function safeSummaries(result) {
  if (result?.status !== 'ok' || !Array.isArray(result.atBats) || result.atBats.length > 20) throw new Error('Invalid at-bat list')
  return result.atBats.map(row => {
    if (!isUuid(row?.id) || !Number.isSafeInteger(row.revision) || row.revision < 1 || !['active','complete'].includes(row.status)
      || !Number.isSafeInteger(row.pitchCount) || row.pitchCount < 0 || !Number.isInteger(row.balls) || row.balls < 0 || row.balls > 4
      || !Number.isInteger(row.strikes) || row.strikes < 0 || row.strikes > 3 || !['manual','development'].includes(row.source)
      || row.outcome !== null && !['walk','strikeout-looking','strikeout-swinging','single','double','triple','home-run','flyout','lineout','groundout'].includes(row.outcome)
      || typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) throw new Error('Invalid at-bat summary')
    return { id:row.id, revision:row.revision, status:row.status, pitchCount:row.pitchCount, balls:row.balls, strikes:row.strikes,
      outcome:row.outcome, source:row.source, updatedAt:new Date(row.updatedAt).toISOString() }
  })
}

/** The server issues pitches and recomputes input; browser timing is not proof of human play. */
export function createBaseballAtBatApiHandler(dependencies = {}) {
  return async function atBatApi(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff')
    if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return errorResponse(res, 405, 'method_not_allowed') }
    const config = readBaseballConfiguration(dependencies.env || process.env)
    if (!config) return errorResponse(res, 503, 'not_configured')
    if (!hasBaseballSameOrigin(req)) return errorResponse(res, 403, 'invalid_origin')
    const id = req.query?.id
    if (id !== undefined && !isUuid(id)) return errorResponse(res, 400, 'invalid_session_id')
    const now = dependencies.now?.() ?? Date.now()
    const participant = readBaseballParticipant(req, config.secret, now)
    if ((!participant && id !== undefined) || (!participant && req.method === 'POST')) return errorResponse(res, 401, 'owner_required')
    let body
    if (req.method === 'POST') {
      if (typeof req.headers?.['content-type'] !== 'string' || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'])) return errorResponse(res, 415, 'invalid_content_type')
      if (req.headers?.['content-length'] !== undefined && (!Number.isSafeInteger(Number(req.headers['content-length'])) || Number(req.headers['content-length']) < 0)) return errorResponse(res, 400, 'invalid_command')
      if (Number(req.headers?.['content-length']) > BASEBALL_AT_BAT_MAX_BODY_BYTES) return errorResponse(res, 413, 'body_too_large')
      try { body = await readJsonBody(req) } catch (error) { return errorResponse(res, error.statusCode || 400, error.code || 'invalid_command') }
      if (!isUuid(body?.commandId) || (id === undefined ? !exact(body, body.source === undefined ? ['commandId','settings'] : ['commandId','settings','source'])
        : !exact(body, ['commandId','expectedRevision','command']) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1 || !object(body.command)
          || Object.hasOwn(body.command, 'commandId') || Object.hasOwn(body.command, 'expectedRevision'))) return errorResponse(res, 400, 'invalid_command')
    }
    try {
      const owner = participant || createBaseballParticipant(config.secret, { now, secure:req.socket?.encrypted === true || req.headers?.origin?.startsWith('https://') === true })
      const store = dependencies.store || await (dependencies.getStore || getBaseballAtBatStore)(config)
      if (req.method === 'GET' && id === undefined) {
        const result = await store.list(owner.hash)
        if (result.status !== 'ok') return knownStoreError(res, result) || errorResponse(res, 503, 'database_unavailable')
        const atBats = safeSummaries(result)
        if (owner.cookie) res.setHeader('Set-Cookie', owner.cookie)
        return res.status(200).json({ status:'ok', atBats })
      }
      const sessionId = id || body.commandId
      const existing = await store.read(owner.hash, sessionId, body?.commandId || null)
      if (req.method === 'GET') {
        if (existing.status !== 'ok') return knownStoreError(res, existing) || errorResponse(res, 503, 'database_unavailable')
        return res.status(200).json({ status:'ok', session:safeSession(existing.snapshot, sessionId) })
      }
      const hash = commandHash(body)
      if (existing.status === 'ok') {
        if (existing.command) {
          if (!SHA.test(existing.command.hash) || existing.command.hash !== hash) return errorResponse(res, 409, 'command_conflict')
          const receipt = safeReceipt({ sessionId, commandId:body.commandId, revision:existing.command.revision }, sessionId, body.commandId)
          const session = safeSession(existing.snapshot, sessionId)
          if (session.revision < receipt.revision) throw new Error('Invalid stored at-bat receipt')
          return res.status(200).json({ status:'stored', session, receipt, duplicate:true })
        }
        if (id === undefined) return errorResponse(res, 409, 'command_conflict')
      } else if (existing.status !== 'not_found') return knownStoreError(res, existing) || errorResponse(res, 503, 'database_unavailable')
      else if (id !== undefined) return errorResponse(res, 404, 'not_found')
      let versions
      try { versions = await (dependencies.getVersions || createBaseballAtBatVersions)() } catch { return errorResponse(res, 503, 'verification_unavailable') }
      if (existing.status === 'ok' && !matchesBaseballAtBatVersions(existing.snapshot.versions, versions, existing.snapshot.config.pitchMode)) return errorResponse(res, 409, 'version_mismatch')
      let next
      try {
        next = id === undefined
          ? createBaseballAtBatSession({ id:sessionId, seed:dependencies.seed?.() ?? randomBytes(4).readUInt32LE(), config:body.settings, versions, source:body.source, now:new Date(now).toISOString() })
          : applyBaseballAtBatSessionCommand(existing.snapshot, { ...body.command, commandId:body.commandId, expectedRevision:body.expectedRevision },
            { now:new Date(now).toISOString(), attemptId:(dependencies.idFactory || randomUUID)() })
      } catch (error) {
        const stale = body.expectedRevision !== undefined && body.expectedRevision !== existing.snapshot?.revision
        const conflicts = { conflict:'command_conflict', 'version-mismatch':'version_mismatch', complete:'session_complete',
          'missing-pitch':'pitch_required', 'input-already-accepted':'input_already_accepted', paused:'pitch_paused', 'input-required':'input_required' }
        const code = stale ? 'revision_conflict' : conflicts[error?.code] || 'invalid_command'
        return errorResponse(res, code === 'invalid_command' ? 400 : 409, code)
      }
      const saved = await store.save(owner.hash, sessionId, id === undefined ? 0 : body.expectedRevision, body.commandId, hash, next)
      if (saved.status !== 'stored') return knownStoreError(res, saved) || errorResponse(res, 503, 'database_unavailable')
      const receipt = safeReceipt(saved.receipt, sessionId, body.commandId)
      const session = safeSession(saved.snapshot, sessionId)
      if (session.id !== sessionId || session.revision < receipt.revision) throw new Error('Invalid at-bat checkpoint')
      return res.status(200).json({ status:'stored', session, receipt, duplicate:saved.duplicate === true })
    } catch { return errorResponse(res, 503, 'database_unavailable') }
  }
}
