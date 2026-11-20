import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createSprintMaintenanceHandler } from '../lib/server/sprint-maintenance.mjs'

// Synthetic configuration only; every test injects its store and never opens a DB.
const env = {
  PLAYGROUND_DATABASE_URL: 'postgresql://sprint_runtime:test-password@example.invalid/development',
  PLAYGROUND_SIGNING_SECRET: 'test-only-signing-secret-that-is-at-least-32-bytes',
  PLAYGROUND_LEADERBOARD_ENABLED: 'true',
  CRON_SECRET: 'test-only-cron-secret-that-is-at-least-32-bytes',
}

function request(options = {}) {
  return { method: 'GET', ...options, headers: {
    authorization: `Bearer ${env.CRON_SECRET}`, ...options.headers,
  } }
}

function response() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function invoke(req = request(), dependencies = {}) {
  const res = response()
  await createSprintMaintenanceHandler({ env, ...dependencies })(req, res)
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.headers['x-content-type-options'], 'nosniff')
  assert.equal(res.headers['set-cookie'], undefined)
  return res
}

test('cron GET accepts only the exact Bearer secret, independently of Origin and User-Agent', async () => {
  let calls = 0
  const store = { purgeRegistrationIps: async () => { calls++; return { status: 'ok', deletedCount: 2 } } }
  const noOrigin = await invoke(request(), { store })
  assert.equal(noOrigin.statusCode, 200)
  assert.deepEqual(noOrigin.body, { status: 'ok', deletedCount: 2 })
  const unrelatedHeaders = await invoke(request({ headers: { origin: 'https://unrelated.invalid', 'user-agent': 'ordinary-client' } }), { store })
  assert.equal(unrelatedHeaders.statusCode, 200)
  assert.equal(calls, 2)

  let loaded = false
  for (const authorization of [undefined, null, [], '', 'Bearer', 'Bearer wrong',
    `bearer ${env.CRON_SECRET}`, `Bearer ${env.CRON_SECRET} `,
    `Basic ${env.CRON_SECRET}`, `Bearer ${env.CRON_SECRET}, Bearer ${env.CRON_SECRET}`]) {
    const res = await invoke(request({ headers: { authorization, 'user-agent': 'vercel-cron/1.0' },
      query: { secret: env.CRON_SECRET }, url: '/api/playground/sprint/maintenance?authenticated=true' }),
    { getStore: () => { loaded = true; return store } })
    assert.equal(res.statusCode, 401)
    assert.deepEqual(res.body, { status: 'error', code: 'unauthorized' })
  }
  assert.equal(loaded, false)
  assert.equal(calls, 2)
})

test('non-GET requests return 405 before checking configuration or loading a DB', async () => {
  let loaded = false
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', undefined]) {
    const res = await invoke(request({ method }), { env: {}, getStore: () => { loaded = true } })
    assert.equal(res.statusCode, 405)
    assert.equal(res.headers.allow, 'GET')
  }
  assert.equal(loaded, false)
})

test('missing, malformed and short cron secrets fail closed without loading a DB', async () => {
  let loaded = false
  for (const secret of [undefined, null, '', 'short', 'x'.repeat(31), 12345]) {
    const res = await invoke(request(), { env: { ...env, CRON_SECRET: secret }, getStore: () => { loaded = true } })
    assert.equal(res.statusCode, 503)
    assert.deepEqual(res.body, { status: 'unavailable', code: 'maintenance_unavailable' })
  }
  assert.equal(loaded, false)
  const exactMinimum = 'x'.repeat(32)
  const res = await invoke(request({ headers: { authorization: `Bearer ${exactMinimum}` } }), {
    env: { ...env, CRON_SECRET: exactMinimum },
    store: { purgeRegistrationIps: async () => ({ status: 'ok', deletedCount: 0 }) },
  })
  assert.equal(res.statusCode, 200)
})

test('invalid DB configuration or owner credentials never load the store', async () => {
  let loaded = false
  for (const configuration of [{ ...env, PLAYGROUND_DATABASE_URL: '' },
    { ...env, PLAYGROUND_SIGNING_SECRET: 'short' },
    { ...env, PLAYGROUND_DATABASE_URL: 'postgresql://neondb_owner:fake@example.invalid/db' }]) {
    const res = await invoke(request(), { env: configuration, getStore: () => { loaded = true } })
    assert.equal(res.statusCode, 503)
  }
  assert.equal(loaded, false)
})

test('retention cleanup continues while online rankings are disabled', async () => {
  const disabled = { ...env, PLAYGROUND_LEADERBOARD_ENABLED: 'false' }
  let loaded = 0
  let purged = 0
  const res = await invoke(request(), { env: disabled, getStore: async config => {
    loaded++
    assert.equal(config.databaseUrl, env.PLAYGROUND_DATABASE_URL)
    assert.equal(config.secret, env.PLAYGROUND_SIGNING_SECRET)
    return { purgeRegistrationIps: async () => { purged++; return { status: 'ok', deletedCount: 1 } } }
  } })
  assert.equal(res.statusCode, 200)
  assert.equal(loaded, 1)
  assert.equal(purged, 1)
  assert.equal(disabled.PLAYGROUND_LEADERBOARD_ENABLED, 'false')
})

test('request scope, body and client time cannot alter the zero-argument purge', async () => {
  const calls = []
  const res = await invoke(request({ query: { retentionDays: '0', scope: 'all', before: '9999-01-01' },
    body: { deleteAll: true }, url: '/api/playground/sprint/maintenance?retentionDays=0&scope=all' }),
  { store: { purgeRegistrationIps: async (...args) => { calls.push(args); return { status: 'ok', deletedCount: 0 } } } })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(calls, [[]])
})

test('successful maintenance exposes only status and a validated deletion count', async () => {
  const res = await invoke(request(), { store: { purgeRegistrationIps: async () => ({
    status: 'ok', deletedCount: 3, ips: ['private-address'], sql: 'private-sql', token: 'private-token',
    executed_at: '2026-11-20T00:00:00Z', succeeded: true,
  }) } })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { status: 'ok', deletedCount: 3 })
  assert.deepEqual(Object.keys(res.body), ['status', 'deletedCount'])
})

test('a recorded SQL cleanup failure returns 503 without retrying or exposing history', async () => {
  let calls = 0
  const res = await invoke(request(), { store: { purgeRegistrationIps: async () => {
    calls++
    return { status: 'unavailable', deletedCount: null,
      executed_at: '2026-11-20T00:00:00Z', succeeded: false }
  } } })
  assert.equal(calls, 1)
  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.body, { status: 'unavailable', code: 'maintenance_unavailable' })
})

test('malformed RPC results fail closed and never leak SQL data or IPs', async () => {
  for (const result of [undefined, null, [], 'ok', 3, { status: 'error', deletedCount: 0 },
    { status: 'ok' }, ...[null, '3', -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
      .map(deletedCount => ({ status: 'ok', deletedCount, ips: ['private-address'] }))]) {
    const res = await invoke(request(), { store: { purgeRegistrationIps: async () => result } })
    assert.equal(res.statusCode, 503)
    assert.deepEqual(res.body, { status: 'unavailable', code: 'maintenance_unavailable' })
  }
})

test('store loading and SQL failures return a generic unavailable response', async () => {
  for (const dependencies of [
    { getStore: async () => { throw new Error('private-database-url-and-password') } },
    { store: { purgeRegistrationIps: async () => { throw new Error('private-ip-and-sql-details') } } },
    { store: {} },
  ]) {
    const res = await invoke(request(), dependencies)
    assert.equal(res.statusCode, 503)
    assert.deepEqual(res.body, { status: 'unavailable', code: 'maintenance_unavailable' })
    assert.equal(JSON.stringify(res.body).includes('private'), false)
  }
})

test('Vercel configuration schedules only the fixed daily maintenance path', async () => {
  const configuration = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.deepEqual(configuration.crons, [{ path: '/api/playground/sprint/maintenance', schedule: '0 0 * * *' }])
})
