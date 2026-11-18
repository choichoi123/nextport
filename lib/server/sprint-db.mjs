// Imported only by Pages API handlers; never import this module into a component.
import { SPRINT_RULE_VERSION } from '../playground-sprint-rules.mjs'

export const SPRINT_BOARD_ID = `sprint-100m:${SPRINT_RULE_VERSION}`

let cachedUrl
let cachedStore

export function readSprintConfiguration(env = process.env) {
  const databaseUrl = env.PLAYGROUND_DATABASE_URL
  const secret = env.PLAYGROUND_SIGNING_SECRET
  if (env.PLAYGROUND_LEADERBOARD_ENABLED !== 'true' || typeof databaseUrl !== 'string' || !databaseUrl
    || typeof secret !== 'string' || Buffer.byteLength(secret) < 32) return null
  try {
    const parsed = new URL(databaseUrl)
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.password) return null
    // The application must not silently connect using the database owner.
    if (decodeURIComponent(parsed.username) !== 'sprint_runtime') return null
  } catch {
    return null
  }
  return { databaseUrl, secret }
}

/** Each write RPC performs its entire transaction on PostgreSQL, not across HTTP calls. */
export function createSprintStore(sql) {
  async function call(query, values) {
    const rows = await sql.query(query, values)
    const value = rows?.[0]?.result
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid database response')
    return value
  }
  return {
    rateLimit: (key, action) => call('SELECT sprint_private.sprint_take_rate_limit($1, $2) AS result', [key, action]),
    leaderboard: () => call('SELECT sprint_private.sprint_get_leaderboard($1) AS result', [SPRINT_BOARD_ID]),
    createAttempt: (id, participant) => call('SELECT sprint_private.sprint_create_attempt($1::uuid, $2, $3) AS result', [id, participant, SPRINT_BOARD_ID]),
    getAttempt: (id, participant) => call('SELECT sprint_private.sprint_get_attempt($1::uuid, $2) AS result', [id, participant]),
    finishAttempt: (id, participant, hash, timeCs, canonicalTimeMs) => call(
      'SELECT sprint_private.sprint_finish_attempt($1::uuid, $2, $3, $4::integer, $5::double precision) AS result',
      [id, participant, hash, timeCs, canonicalTimeMs]),
    registerRecord: (id, participant, hash, playerName, countryCode, registrationIp) => call(
      'SELECT sprint_private.sprint_register_record($1::uuid, $2, $3, $4, $5, $6::inet) AS result',
      [id, participant, hash, playerName, countryCode, registrationIp]),
    purgeRegistrationIps: () => call('SELECT sprint_private.sprint_purge_registration_ips() AS result', []),
  }
}

export async function getSprintStore(config) {
  if (cachedStore && cachedUrl === config.databaseUrl) return cachedStore
  // Configuration is checked before this import, so local games need no DB module.
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(config.databaseUrl)
  const store = createSprintStore({
    query: (query, values) => sql.query(query, values, { fetchOptions: { signal: AbortSignal.timeout(15000) } }),
  })
  cachedUrl = config.databaseUrl
  cachedStore = store
  return store
}
