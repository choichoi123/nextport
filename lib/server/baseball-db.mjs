// Server only. These credentials are independent from Notion and sprint.
export function readBaseballConfiguration(env = process.env) {
  if (env.NODE_ENV !== 'development' || env.BASEBALL_DATA_ENABLED !== 'true') return null
  const databaseUrl = env.BASEBALL_DATABASE_URL, secret = env.BASEBALL_SIGNING_SECRET
  if (typeof databaseUrl !== 'string' || typeof secret !== 'string' || Buffer.byteLength(secret) < 32) return null
  try {
    const parsed = new URL(databaseUrl)
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.password
      || decodeURIComponent(parsed.username) !== 'baseball_runtime' || parsed.pathname !== '/baseball_dev') return null
  } catch { return null }
  return { databaseUrl, secret }
}

export function createBaseballStore(sql) {
  const call = async (query, values) => {
    const rows = await sql.query(query, values)
    const value = rows?.[0]?.result
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid baseball database response')
    return value
  }
  return {
    savePractice: (owner, sessionId, revision, hash, snapshot) => call(
      'SELECT baseball_private.baseball_save_practice($1, $2::uuid, $3::integer, $4, $5::jsonb) AS result',
      [owner, sessionId, revision, hash, JSON.stringify(snapshot)]),
    practices: owner => call('SELECT baseball_private.baseball_get_practices($1) AS result', [owner]),
  }
}

let cachedUrl, cachedStore
export async function getBaseballStore(config) {
  if (cachedUrl === config.databaseUrl && cachedStore) return cachedStore
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(config.databaseUrl)
  cachedStore = createBaseballStore({ query:(query, values) => sql.query(query, values, { fetchOptions:{ signal:AbortSignal.timeout(15000) } }) })
  cachedUrl = config.databaseUrl
  return cachedStore
}
