// Development at-bats use their own tables/RPCs; the ten-pitch store is untouched.
export function createBaseballAtBatStore(sql) {
  const call = async (query, values) => {
    const rows = await sql.query(query, values)
    const value = rows?.[0]?.result
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid at-bat database response')
    return value
  }
  return {
    list: owner => call('SELECT baseball_private.baseball_list_at_bats($1) AS result', [owner]),
    read: (owner, id, commandId = null) => call(
      'SELECT baseball_private.baseball_read_at_bat($1, $2::uuid, $3::uuid) AS result', [owner, id, commandId]),
    save: (owner, id, expectedRevision, commandId, commandHash, snapshot) => call(
      'SELECT baseball_private.baseball_save_at_bat($1, $2::uuid, $3::integer, $4::uuid, $5, $6::jsonb) AS result',
      [owner, id, expectedRevision, commandId, commandHash, JSON.stringify(snapshot)]),
  }
}

let cachedUrl, cachedStore
export async function getBaseballAtBatStore(config) {
  if (cachedUrl === config.databaseUrl && cachedStore) return cachedStore
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(config.databaseUrl)
  cachedStore = createBaseballAtBatStore({ query:(query, values) => sql.query(query, values, { fetchOptions:{ signal:AbortSignal.timeout(15000) } }) })
  cachedUrl = config.databaseUrl
  return cachedStore
}
