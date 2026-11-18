import { createHash, randomUUID } from 'node:crypto'
import { validateSprintPlayer } from '../playground-sprint-player.mjs'
import { validateSprintSubmission } from '../playground-sprint-validation.mjs'
import { normalizeSprintWorldRecord } from '../playground-sprint-registration.mjs'
import { createSprintParticipant, hasSprintSameOrigin, readSprintClientIp, readSprintParticipant, sprintAddressHash } from './sprint-auth.mjs'
import { getSprintStore, readSprintConfiguration } from './sprint-db.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BODY_BYTES = 128 * 1024
const conflictCodes = new Set(['attempt_conflict', 'attempt_expired', 'attempt_not_verified', 'attempt_too_early'])
const safeCodes = new Set(['not_configured', 'attempt_not_found', ...conflictCodes,
  'invalid_submission', 'invalid_player', 'invalid_run', 'invalid_rule'])

function errorResponse(res, status, code, unavailable = false) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json({ status: unavailable ? 'unavailable' : 'error', code,
    message: unavailable ? 'Online records are unavailable.' : 'The request could not be completed.' })
}

function publicFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid public database response')
  return Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => {
    const item = value[field]
    if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) throw new Error('Invalid public database field')
    return [field, item]
  }))
}

function publicRecord(value) {
  return value === null ? null : publicFields(value, ['rank', 'playerName', 'countryCode', 'timeCs', 'recordedAt'])
}

/** Explicit public fields protect responses even if a private RPC gains metadata. */
function publicDatabaseResult(result) {
  const output = publicFields(result, ['status', 'attemptId', 'ruleVersion', 'expiresAt', 'timeCs', 'eligible', 'updatedAt'])
  if (Object.hasOwn(result, 'record')) output.record = publicRecord(result.record)
  if (Object.hasOwn(result, 'records')) {
    if (!Array.isArray(result.records)) throw new Error('Invalid public database records')
    output.records = result.records.map(publicRecord)
  }
  if (Object.hasOwn(result, 'worldRecord')) {
    output.worldRecord = normalizeSprintWorldRecord(result.worldRecord,
      { registrationStatus: result.status, timeCs: result.record?.timeCs })
  }
  return output
}

function sendDatabaseResult(res, result, successCode = 200) {
  if (result?.status === 'unavailable' || result?.status === 'error') {
    const code = safeCodes.has(result.code) ? result.code : 'invalid_submission'
    const unavailable = result.status === 'unavailable'
    const status = unavailable ? 503 : code === 'attempt_not_found' ? 404 : conflictCodes.has(code) ? 409 : 400
    return errorResponse(res, status, code, unavailable)
  }
  return res.status(successCode).json(publicDatabaseResult(result))
}

function validBody(req, fields) {
  const body = req.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  if (Object.keys(body).some(key => !fields.includes(key))) return false
  return true
}

function bodyError(code, statusCode) {
  return Object.assign(new Error('Invalid JSON body'), { code, statusCode })
}

/** Own the parser so size and syntax failures use the same JSON error contract. */
async function readJsonBody(req) {
  if (req.body !== undefined) {
    let serialized
    try { serialized = JSON.stringify(req.body) } catch { throw bodyError('invalid_submission', 400) }
    if (typeof serialized !== 'string') throw bodyError('invalid_submission', 400)
    if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) throw bodyError('body_too_large', 413)
    return req.body
  }
  if (typeof req.on !== 'function') throw bodyError('invalid_submission', 400)
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    function cleanup() {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      req.off('aborted', onError)
    }
    function onError() { cleanup(); reject(bodyError('invalid_submission', 400)) }
    function onData(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > MAX_BODY_BYTES) {
        cleanup()
        // Discard the remaining body without retaining it or destroying the response socket.
        req.resume()
        reject(bodyError('body_too_large', 413))
        return
      }
      chunks.push(bytes)
    }
    function onEnd() {
      cleanup()
      try { resolve(JSON.parse(Buffer.concat(chunks, size).toString('utf8'))) }
      catch { reject(bodyError('invalid_json', 400)) }
    }
    req.on('data', onData)
    req.once('end', onEnd)
    req.once('error', onError)
    req.once('aborted', onError)
  })
}

function inputHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function enforceRateLimit(store, key, action, res) {
  const limit = await store.rateLimit(key, action)
  if (limit.allowed === true) return true
  const retryAfter = Number.isFinite(limit.retryAfter) ? Math.max(1, Math.ceil(limit.retryAfter)) : 60
  res.setHeader('Retry-After', String(retryAfter))
  errorResponse(res, 429, 'rate_limited')
  return false
}

/** Injectable dependencies keep HTTP/error contracts testable without external DBs. */
export function createSprintApiHandler(action, dependencies = {}) {
  const methods = action === 'leaderboard' ? ['GET'] : ['POST']
  return async function sprintApi(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '))
      return errorResponse(res, 405, 'method_not_allowed')
    }
    const env = dependencies.env || process.env
    const config = readSprintConfiguration(env)
    if (!config) return errorResponse(res, 503, 'not_configured', true)
    if (req.method === 'POST') {
      if (!hasSprintSameOrigin(req, env)) return errorResponse(res, 403, 'invalid_origin')
      if (typeof req.headers?.['content-type'] !== 'string'
        || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'])) return errorResponse(res, 415, 'invalid_content_type')
      const contentLength = Number(req.headers?.['content-length'])
      if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return errorResponse(res, 413, 'body_too_large')
      try { req.body = await readJsonBody(req) }
      catch (error) { return errorResponse(res, error.statusCode || 400, error.code || 'invalid_submission') }
      const fields = action === 'attempts' ? [] : action === 'finish' ? ['attemptId', 'events', 'finishTimeMs'] : ['attemptId', 'playerName', 'countryCode']
      if (!validBody(req, fields)) return errorResponse(res, 400, 'invalid_submission')
    }
    try {
      const store = dependencies.store || await (dependencies.getStore || getSprintStore)(config)
      const addressHash = sprintAddressHash(req, config.secret, env)
      if (action === 'leaderboard') {
        if (!await enforceRateLimit(store, addressHash, action, res)) return
        const result = await store.leaderboard()
        if (result.status === 'ok') res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=30')
        return sendDatabaseResult(res, result)
      }
      if (!await enforceRateLimit(store, addressHash, `${action}_ip`, res)) return
      let participant = readSprintParticipant(req, config.secret)
      let cookie
      if (!participant && action === 'attempts') {
        participant = createSprintParticipant(config.secret, { secure: env.NODE_ENV === 'production' })
        cookie = participant.cookie
      }
      if (!participant) return errorResponse(res, 401, 'participant_required')
      if (!await enforceRateLimit(store, participant.hash, action, res)) return
      if (action === 'attempts') {
        const result = await store.createAttempt(randomUUID(), participant.hash)
        // A failed issuance does not create a misleading usable identity cookie.
        if (cookie && result.attemptId) res.setHeader('Set-Cookie', cookie)
        return sendDatabaseResult(res, result, 201)
      }
      const { attemptId } = req.body
      if (typeof attemptId !== 'string' || !UUID.test(attemptId)) return errorResponse(res, 400, 'invalid_attempt')
      if (action === 'finish') {
        const attempt = await store.getAttempt(attemptId, participant.hash)
        if (attempt.status === 'error' || attempt.status === 'unavailable') return sendDatabaseResult(res, attempt)
        let checked
        try {
          checked = (dependencies.validateSubmission || validateSprintSubmission)({ events: req.body.events,
            finishTimeMs: req.body.finishTimeMs, ruleVersion: attempt.ruleVersion })
        } catch (error) {
          const code = safeCodes.has(error?.code) ? error.code : 'invalid_submission'
          return errorResponse(res, 400, code)
        }
        const hash = inputHash({ ruleVersion: attempt.ruleVersion, events: checked.normalizedEvents, canonicalTimeMs: checked.canonicalTimeMs })
        return sendDatabaseResult(res, await store.finishAttempt(attemptId, participant.hash, hash, checked.timeCs, checked.canonicalTimeMs))
      }
      const player = validateSprintPlayer({ name: req.body.playerName, countryCode: req.body.countryCode, art: 'realistic' })
      if (!player.valid) return errorResponse(res, 400, 'invalid_player')
      const hash = inputHash({ attemptId, playerName: player.player.name, countryCode: player.player.countryCode })
      return sendDatabaseResult(res, await store.registerRecord(attemptId, participant.hash, hash,
        player.player.name, player.player.countryCode, readSprintClientIp(req, env)))
    } catch {
      // Neither connection strings, SQL details, request data nor cookies reach logs/responses.
      return errorResponse(res, 503, 'database_unavailable', true)
    }
  }
}
