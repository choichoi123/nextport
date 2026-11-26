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

/** 호스팅 환경에서는 해당 환경의 DB 호스트와 전용 제한 역할을 확인한다. */
export function readBaseballCareerConfiguration(env = process.env) {
  if (env.NODE_ENV === 'development') return readBaseballConfiguration(env)
  if (env.NODE_ENV !== 'production' || env.VERCEL !== '1') return null
  const environment = env.VERCEL_ENV
  let databaseUrl, secret, expectedHost
  if (environment === 'preview') {
    if (env.VERCEL_GIT_COMMIT_REF !== 'codex/baseball-career-preview' || env.BASEBALL_PREVIEW_ENABLED !== 'true') return null
    databaseUrl = env.BASEBALL_PREVIEW_DATABASE_URL
    secret = env.BASEBALL_PREVIEW_SIGNING_SECRET
    expectedHost = env.BASEBALL_PREVIEW_DATABASE_HOST
  } else if (environment === 'production') {
    if (env.BASEBALL_DATA_ENABLED !== 'true') return null
    databaseUrl = env.BASEBALL_DATABASE_URL
    secret = env.BASEBALL_SIGNING_SECRET
    expectedHost = env.BASEBALL_PRODUCTION_DATABASE_HOST
  } else return null
  if (typeof databaseUrl !== 'string' || typeof secret !== 'string' || Buffer.byteLength(secret) < 32
    || typeof expectedHost !== 'string' || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(expectedHost)) return null
  try {
    const parsed = new URL(databaseUrl), ssl = parsed.searchParams.getAll('sslmode')
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hostname !== expectedHost || !parsed.password
      || parsed.port && parsed.port !== '5432' || parsed.hash
      || decodeURIComponent(parsed.username) !== 'baseball_prod_runtime' || parsed.pathname !== '/baseball_prod'
      || ssl.length !== 1 || ssl[0] !== 'require') return null
  } catch { return null }
  return Object.freeze({ databaseUrl, secret, environment })
}

/** 렌더링에는 표시 상태만 전달한다. */
export function readBaseballCareerAvailability(env = process.env) {
  if (env.NODE_ENV === 'development') return 'development'
  return readBaseballCareerConfiguration(env)?.environment ?? 'preparing'
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
