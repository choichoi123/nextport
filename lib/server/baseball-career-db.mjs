// Career saves and their at-bats are independent from ten-pitch and D practice.
export function createBaseballCareerStore(sql) {
  const call = async (query, values) => {
    const rows = await sql.query(query, values)
    const value = rows?.[0]?.result
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid career database response')
    return value
  }
  return {
    list: owner => call('SELECT baseball_private.baseball_list_careers($1) AS result', [owner]),
    read: (owner, id, commandId = null) => call(
      'SELECT baseball_private.baseball_read_career($1, $2::uuid, $3::uuid) AS result', [owner, id, commandId]),
    readAtBat: (owner, id, atBatId) => call(
      'SELECT baseball_private.baseball_read_career_at_bat($1, $2::uuid, $3::uuid) AS result', [owner, id, atBatId]),
    save: (owner, id, expectedRevision, commandId, commandHash, snapshot, atBats, atBatReceipt = null) => call(
      'SELECT baseball_private.baseball_save_career($1, $2::uuid, $3::integer, $4::uuid, $5, $6::jsonb, $7::jsonb, $8::jsonb) AS result',
      [owner, id, expectedRevision, commandId, commandHash, JSON.stringify(snapshot), JSON.stringify(atBats), JSON.stringify(atBatReceipt)]),
  }
}

let cachedUrl, cachedStore
export async function getBaseballCareerStore(config) {
  if (cachedUrl === config.databaseUrl && cachedStore) return cachedStore
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(config.databaseUrl)
  cachedStore = createBaseballCareerStore({ query:(query, values) => sql.query(query, values, { fetchOptions:{ signal:AbortSignal.timeout(15000) } }) })
  cachedUrl = config.databaseUrl
  return cachedStore
}
