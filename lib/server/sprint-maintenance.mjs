import { createHash, timingSafeEqual } from 'node:crypto'
import { getSprintStore, readSprintConfiguration } from './sprint-db.mjs'

function unavailable(res) {
  return res.status(503).json({ status: 'unavailable', code: 'maintenance_unavailable' })
}

function hasCronAuthorization(header, secret) {
  if (typeof header !== 'string') return false
  // Fixed-size digests keep timingSafeEqual safe even for different header lengths.
  const actual = createHash('sha256').update(header).digest()
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(actual, expected)
}

/** Authenticated cron only; request parameters cannot change the SQL retention policy. */
export function createSprintMaintenanceHandler(dependencies = {}) {
  return async function sprintMaintenance(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ status: 'error', code: 'method_not_allowed' })
    }

    const env = dependencies.env || process.env
    const secret = env.CRON_SECRET
    if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) return unavailable(res)
    if (!hasCronAuthorization(req.headers?.authorization, secret)) {
      return res.status(401).json({ status: 'error', code: 'unauthorized' })
    }

    // Retention still runs while public rankings are disabled. Reuse all DB/role checks.
    const config = readSprintConfiguration({ ...env, PLAYGROUND_LEADERBOARD_ENABLED: 'true' })
    if (!config) return unavailable(res)

    try {
      const store = dependencies.store || await (dependencies.getStore || getSprintStore)(config)
      // No request data, client clock, scope or retention interval reaches this fixed RPC.
      const result = await store.purgeRegistrationIps()
      if (!result || typeof result !== 'object' || Array.isArray(result) || result.status !== 'ok'
        || !Number.isSafeInteger(result.deletedCount) || result.deletedCount < 0) return unavailable(res)
      // Never forward SQL details, stored IPs or additional RPC fields.
      return res.status(200).json({ status: 'ok', deletedCount: result.deletedCount })
    } catch {
      // Connection errors, credentials and database data do not reach logs/responses.
      return unavailable(res)
    }
  }
}
