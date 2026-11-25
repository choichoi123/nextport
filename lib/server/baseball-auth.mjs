import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export const BASEBALL_COOKIE_NAME = 'baseball_participant'
export const BASEBALL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const digest = (secret, purpose, value) => createHmac('sha256', secret).update(`${purpose}:${value}`).digest('hex')

export function readBaseballParticipant(req, secret, now = Date.now()) {
  const header = req.headers?.cookie
  if (typeof header !== 'string' || header.length > 16384) return null
  const matches = header.split(';').map(value => value.trim()).filter(value => value.startsWith(`${BASEBALL_COOKIE_NAME}=`))
  if (matches.length !== 1) return null
  const parts = /^(v1\.([0-9a-f-]{36})\.([0-9]{10}))\.([a-f0-9]{64})$/.exec(matches[0].slice(BASEBALL_COOKIE_NAME.length + 1))
  if (!parts || !UUID.test(parts[2]) || Number(parts[3]) * 1000 <= now) return null
  const expected = digest(secret, 'baseball-cookie', parts[1])
  if (!timingSafeEqual(Buffer.from(parts[4]), Buffer.from(expected))) return null
  return { hash:digest(secret, 'baseball-participant', parts[2]) }
}

export function createBaseballParticipant(secret, { now = Date.now(), secure = false } = {}) {
  const id = randomUUID(), payload = `v1.${id}.${Math.floor(now / 1000) + BASEBALL_COOKIE_MAX_AGE}`
  return {
    hash:digest(secret, 'baseball-participant', id),
    cookie:`${BASEBALL_COOKIE_NAME}=${payload}.${digest(secret, 'baseball-cookie', payload)}; Path=/api/playground/baseball; Max-Age=${BASEBALL_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
  }
}

/** No address, fingerprint or other game's identity is used by this API. */
export function hasBaseballSameOrigin(req) {
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false
  const host = req.headers?.host, origin = req.headers?.origin
  if (typeof host !== 'string' || !host || /[\s/@\\]/.test(host)) return false
  if (origin === undefined) return req.method === 'GET'
  try {
    const parsed = new URL(origin)
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === host && parsed.origin === origin
  } catch { return false }
}
