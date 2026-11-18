import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

export const SPRINT_COOKIE_NAME = 'sprint_participant'
export const SPRINT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180

function digest(secret, purpose, value) {
  return createHmac('sha256', secret).update(`${purpose}:${value}`).digest('hex')
}

export function hashSprintValue(secret, purpose, value) {
  return digest(secret, purpose, value)
}

function cookieValue(header) {
  if (typeof header !== 'string' || header.length > 16384) return null
  const matches = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${SPRINT_COOKIE_NAME}=`))
  if (matches.length !== 1) return null
  return matches[0].slice(SPRINT_COOKIE_NAME.length + 1)
}

/** Only a valid server signature establishes an anonymous participant. */
export function readSprintParticipant(req, secret, now = Date.now()) {
  const value = cookieValue(req.headers?.cookie)
  if (!value) return null
  const parts = /^(v1\.[0-9a-f-]{36}\.[0-9]{10})\.([a-f0-9]{64})$/.exec(value)
  if (!parts) return null
  const [, payload, signature] = parts
  const [, id, expiresAt] = payload.split('.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return null
  if (Number(expiresAt) * 1000 <= now) return null
  const expected = digest(secret, 'cookie', payload)
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  return { hash: digest(secret, 'participant', id) }
}

export function createSprintParticipant(secret, { secure = false, now = Date.now() } = {}) {
  const id = randomUUID()
  const expiresAt = Math.floor(now / 1000) + SPRINT_COOKIE_MAX_AGE
  const payload = `v1.${id}.${expiresAt}`
  const value = `${payload}.${digest(secret, 'cookie', payload)}`
  return {
    hash: digest(secret, 'participant', id),
    cookie: `${SPRINT_COOKIE_NAME}=${value}; Path=/api/playground/sprint; Max-Age=${SPRINT_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
  }
}

function normalizedAddress(value) {
  // Accept one address only: proxy lists, ports, CIDRs and zone IDs are ambiguous.
  if (typeof value !== 'string' || value.length > 200 || /[,/%\[\]]/.test(value)) return null
  const address = value.trim()
  const version = isIP(address)
  if (version === 4) return address
  if (version !== 6) return null
  // URL's IPv6 serializer gives equivalent spellings one canonical representation.
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical)
  if (!mapped) return canonical
  const high = Number.parseInt(mapped[1], 16)
  const low = Number.parseInt(mapped[2], 16)
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}

/** Only Vercel's platform header is trusted there; never fall back to its proxy socket. */
export function readSprintClientIp(req, env = process.env) {
  return normalizedAddress(env.VERCEL === '1'
    ? req.headers?.['x-vercel-forwarded-for']
    : req.socket?.remoteAddress)
}

export function sprintAddressHash(req, secret, env = process.env) {
  return digest(secret, 'rate-address', readSprintClientIp(req, env) || 'unknown')
}

export function hasSprintSameOrigin(req, env = process.env) {
  const origin = req.headers?.origin
  const host = req.headers?.host
  if (typeof origin !== 'string' || typeof host !== 'string' || /[\s/\\@]/.test(host)) return false
  const protocol = env.VERCEL === '1' || req.socket?.encrypted ? 'https:' : 'http:'
  try {
    const parsed = new URL(origin)
    return parsed.origin === origin && parsed.origin === new URL(`${protocol}//${host}`).origin
  } catch {
    return false
  }
}
