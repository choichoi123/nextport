import { createHash } from 'node:crypto'
import { validateBaseballDataSnapshot } from '../playground-baseball-data.mjs'
import { createBaseballPitch, judgeBaseballSwing, judgeBaseballSwingLegacyV1, judgeBaseballTake } from '../playground-baseball.mjs'
import { canonicalBaseballVersionJson, createBaseballDataVersions, isBaseballLegacyV1DataVersion } from './baseball-version.mjs'
import { createBaseballParticipant, hasBaseballSameOrigin, readBaseballParticipant } from './baseball-auth.mjs'
import { getBaseballStore, readBaseballConfiguration } from './baseball-db.mjs'

export const BASEBALL_MAX_BODY_BYTES = 512 * 1024
const clone = value => JSON.parse(JSON.stringify(value))
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const hash = value => createHash('sha256').update(canonicalBaseballVersionJson(value)).digest('hex')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function equalNumeric(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-9
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return left === right
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = Object.keys(left).sort(), b = Object.keys(right).sort()
  return a.length === b.length && a.every((key, index) => key === b[index] && equalNumeric(left[key], right[key]))
}

/** Recomputed client inputs are not server-issued challenges or proof of human input. */
export function verifyBaseballSubmission(body, versions) {
  if (!exact(body, ['revision', 'snapshot']) || !Number.isSafeInteger(body.revision) || body.revision < 1 || body.revision > 1000000
    || !validateBaseballDataSnapshot(body.snapshot).valid || body.snapshot.sessions.length !== 1) return { valid:false, code:'invalid_submission' }
  const snapshot = clone(body.snapshot), session = snapshot.sessions[0]
  const currentVersion = equalNumeric(session.versions.engine, versions.engine) && equalNumeric(session.versions.rules, versions.rules)
    && session.versions.schemaVersion === versions.schemaVersion
  const legacyVersion = !currentVersion && isBaseballLegacyV1DataVersion(session.versions, versions)
  if (!currentVersion && !legacyVersion) return { valid:false, code:'version_mismatch' }
  const judgeSwing = legacyVersion ? judgeBaseballSwingLegacyV1 : judgeBaseballSwing
  if (hash(session.versions.presentation.files) !== session.versions.presentation.hash) return { valid:false, code:'version_mismatch' }
  try {
    for (const attempt of session.attempts) {
      const original = attempt.pitch
      const pitch = createBaseballPitch({ speedKmh:original.speedKmh, seed:original.seed, target:original.target,
        pitchType:original.type, pitcherHandedness:original.pitcherHandedness })
      const normalizedPitch = Object.fromEntries(Object.keys(original).map(key => [key, pitch[key]]))
      if (!equalNumeric(original, normalizedPitch)) return { valid:false, code:'invalid_pitch' }
      attempt.pitch = clone(normalizedPitch)
      if (attempt.state !== 'completed') continue
      const result = attempt.swingAtMs === null ? judgeBaseballTake(pitch)
        : judgeSwing(pitch, { swingAtMs:attempt.swingAtMs, aim:attempt.aim, handedness:session.handedness })
      if (!equalNumeric(attempt.result, result)) return { valid:false, code:'result_mismatch' }
      attempt.result = clone(result)
    }
  } catch { return { valid:false, code:'invalid_pitch' } }
  return { valid:true, sessionId:session.sessionId, revision:body.revision, snapshot, hash:hash(snapshot) }
}

function errorResponse(res, status, code) {
  return res.status(status).json({ status:status === 503 ? 'unavailable' : 'error', code })
}

function bodyError(code, statusCode) { return Object.assign(new Error('Invalid baseball body'), { code, statusCode }) }
async function readJsonBody(req) {
  if (req.body !== undefined) {
    let value
    try { value = JSON.stringify(req.body) } catch { throw bodyError('invalid_submission', 400) }
    if (typeof value !== 'string') throw bodyError('invalid_submission', 400)
    if (Buffer.byteLength(value) > BASEBALL_MAX_BODY_BYTES) throw bodyError('body_too_large', 413)
    return req.body
  }
  if (typeof req.on !== 'function') throw bodyError('invalid_submission', 400)
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    const cleanup = () => { req.off('data', data); req.off('end', end); req.off('error', failed); req.off('aborted', failed) }
    const failed = () => { cleanup(); reject(bodyError('invalid_submission', 400)) }
    const data = chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > BASEBALL_MAX_BODY_BYTES) { cleanup(); req.resume(); reject(bodyError('body_too_large', 413)); return }
      chunks.push(bytes)
    }
    const end = () => { cleanup(); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(bodyError('invalid_submission', 400)) } }
    req.on('data', data); req.on('end', end); req.on('error', failed); req.on('aborted', failed)
  })
}

function safeStored(result, expected) {
  return result?.status === 'stored' && result.sessionId === expected.sessionId && result.revision === expected.revision
    && Number.isInteger(result.completed) && result.completed >= 0 && result.completed <= 10
    && Number.isInteger(result.aborted) && result.aborted >= 0 && result.aborted <= 100 && result.serverComputed === true
}
function safePractices(result) {
  if (result?.status !== 'ok' || !Array.isArray(result.practices) || result.practices.length > 20) throw new Error('Invalid baseball history')
  return result.practices.map(value => {
    if (!UUID.test(value?.sessionId) || !Number.isSafeInteger(value.revision) || value.revision < 1
      || !['active','ended'].includes(value.status) || !Number.isInteger(value.completed) || value.completed < 0 || value.completed > 10
      || !Number.isInteger(value.aborted) || value.aborted < 0 || value.aborted > 100 || !Number.isInteger(value.swings) || value.swings < 0 || value.swings > 100
      || typeof value.receivedAt !== 'string' || !Number.isFinite(Date.parse(value.receivedAt)) || value.serverComputed !== true) throw new Error('Invalid baseball history')
    return { sessionId:value.sessionId, revision:value.revision, status:value.status, completed:value.completed,
      aborted:value.aborted, swings:value.swings, receivedAt:value.receivedAt, serverComputed:true }
  })
}

export function createBaseballApiHandler(dependencies = {}) {
  return async function baseballApi(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff')
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return errorResponse(res, 405, 'method_not_allowed') }
    const env = dependencies.env || process.env, config = readBaseballConfiguration(env)
    if (!config) return errorResponse(res, 503, 'not_configured')
    if (!hasBaseballSameOrigin(req)) return errorResponse(res, 403, 'invalid_origin')
    let checked
    if (req.method === 'POST') {
      if (typeof req.headers?.['content-type'] !== 'string' || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'])) return errorResponse(res, 415, 'invalid_content_type')
      if (Number(req.headers?.['content-length']) > BASEBALL_MAX_BODY_BYTES) return errorResponse(res, 413, 'body_too_large')
      try { req.body = await readJsonBody(req) } catch (error) { return errorResponse(res, error.statusCode || 400, error.code || 'invalid_submission') }
      try { checked = verifyBaseballSubmission(req.body, await (dependencies.getVersions || createBaseballDataVersions)()) }
      catch { return errorResponse(res, 503, 'verification_unavailable') }
      if (!checked.valid) return errorResponse(res, 400, checked.code)
    }
    try {
      const participant = readBaseballParticipant(req, config.secret, dependencies.now?.())
        || createBaseballParticipant(config.secret, { now:dependencies.now?.(), secure:req.socket?.encrypted === true || req.headers?.origin?.startsWith('https://') === true })
      const store = dependencies.store || await (dependencies.getStore || getBaseballStore)(config)
      const result = req.method === 'GET' ? await store.practices(participant.hash)
        : await store.savePractice(participant.hash, checked.sessionId, checked.revision, checked.hash, checked.snapshot)
      if (result.status === 'error') {
        const codes = new Set(['stale_revision','session_conflict','rate_limited','invalid_submission'])
        const code = codes.has(result.code) ? result.code : 'invalid_submission'
        if (code === 'rate_limited') res.setHeader('Retry-After', '60')
        return errorResponse(res, code === 'rate_limited' ? 429 : code === 'invalid_submission' ? 400 : 409, code)
      }
      if (req.method === 'GET') {
        const practices = safePractices(result)
        if (participant.cookie) res.setHeader('Set-Cookie', participant.cookie)
        return res.status(200).json({ status:'ok', practices })
      }
      if (!safeStored(result, checked)) throw new Error('Invalid baseball receipt')
      if (participant.cookie) res.setHeader('Set-Cookie', participant.cookie)
      return res.status(200).json({ status:'stored', sessionId:result.sessionId, revision:result.revision,
        completed:result.completed, aborted:result.aborted, serverComputed:true })
    } catch { return errorResponse(res, 503, 'database_unavailable') }
  }
}
