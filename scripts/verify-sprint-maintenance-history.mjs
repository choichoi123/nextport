// Local PostgreSQL/WASM integration checks. No .env, network DB or production data.
// Supply an already installed PGlite entry file with PGLITE_MODULE_PATH.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createSprintMaintenanceHandler } from '../lib/server/sprint-maintenance.mjs'
import { createSprintStore } from '../lib/server/sprint-db.mjs'
import { createSprintApiHandler } from '../lib/server/sprint-api.mjs'

const modulePath = process.env.PGLITE_MODULE_PATH
if (!modulePath || !isAbsolute(modulePath)) {
  throw new Error('PGLITE_MODULE_PATH must point to an existing absolute local PGlite entry file')
}
const { PGlite } = await import(pathToFileURL(modulePath).href)
const db = new PGlite()
const checks = []
let activeCheck = 'initialize local database'
const history = 'sprint_private.sprint_ip_cleanup_runs'
const migrationPath = 'db/migrations/20261120-sprint-maintenance-history.sql'
const readSql = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const hash = n => String(n).padStart(64, '0')
const env = {
  PLAYGROUND_DATABASE_URL: 'postgresql://sprint_runtime:synthetic-password@example.invalid/local',
  PLAYGROUND_SIGNING_SECRET: 'synthetic-signing-secret-at-least-32-bytes',
  PLAYGROUND_LEADERBOARD_ENABLED: 'true',
  CRON_SECRET: 'synthetic-cron-secret-at-least-32-bytes',
}
let queries = 0
const store = createSprintStore({ async query(sql, values) {
  queries++
  await db.exec('SET ROLE sprint_runtime')
  try { return (await db.query(sql, values)).rows }
  finally { await db.exec('RESET ROLE') }
} })
async function check(name, run) {
  activeCheck = name
  await run()
  checks.push(name)
}
async function rows(sql, values = []) { return (await db.query(sql, values)).rows }
async function historyRows() {
  return rows(`SELECT executed_at, succeeded, deleted_count FROM ${history} ORDER BY executed_at`)
}
async function snapshot({ ips = false } = {}) {
  const tables = [
    ['sprint_boards', 'id'], ['sprint_records', 'id'], ['sprint_attempts', 'id'],
    ['sprint_world_records', 'board_id'],
    ...(ips ? [['sprint_record_ips', 'record_id']] : []),
  ]
  const result = {}
  for (const [table, order] of tables) {
    result[table] = (await rows(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY ${order})::text, '[]')) AS digest FROM sprint_private.${table} t`))[0].digest
  }
  return result
}
async function invoke({ authorization = `Bearer ${env.CRON_SECRET}`, method = 'GET', dependencies = {} } = {}) {
  const res = { code: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value },
    status(value) { this.code = value; return this },
    json(value) { this.body = value; return this },
  }
  await createSprintMaintenanceHandler({ env, store, ...dependencies })({ method,
    headers: { authorization, 'user-agent': 'synthetic-client', 'x-forwarded-for': '192.0.2.20' },
    query: { before: '9999-01-01', retentionDays: 0, scope: 'all', token: 'synthetic-request-token' },
    body: { succeeded: true, deletedCount: 999, executedAt: '1900-01-01' },
  }, res)
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.headers['set-cookie'], undefined)
  return res
}
async function expectDenied(role, sql) {
  await db.exec(`SET ROLE ${role}`)
  try { await assert.rejects(db.exec(sql), error => error.code === '42501') }
  finally { await db.exec('RESET ROLE') }
}
try {
  for (const path of ['db/playground-sprint.sql',
    'db/migrations/20261118-sprint-registration-ips.sql',
    'db/migrations/20261118-sprint-world-records.sql',
    'db/migrations/20261118-sprint-v2.sql',
    'db/migrations/20261118-sprint-finish-eligibility.sql']) {
    await db.exec(await readSql(path))
  }
  for (let n = 1; n <= 3; n++) {
    const board = `sprint-100m:sprint-v${n === 1 ? 1 : 2}`
    await db.query(`INSERT INTO sprint_private.sprint_attempts
      (id, board_id, participant_hash, created_at, expires_at)
      VALUES ($1, $2, $3, clock_timestamp(), clock_timestamp() + interval '10 minutes')`, [uuid(n + 100), board, hash(n)])
    await db.query(`INSERT INTO sprint_private.sprint_records
      (id, board_id, attempt_id, participant_hash, player_name, country_code, time_cs, recorded_at, registration_seq)
      VALUES ($1, $2, $3, $4, $5, 'KR', $6, clock_timestamp(), $7)`,
    [uuid(n), board, uuid(n + 100), hash(n), `Synthetic ${n}`, 1000 + n, n])
    // Reserved example addresses only. Derive expiry from one timestamp exactly.
    await db.query(`INSERT INTO sprint_private.sprint_record_ips
      SELECT $1::uuid, $2::inet, stamp, stamp + interval '30 days'
      FROM (SELECT clock_timestamp() - ($3::integer * interval '1 day') AS stamp) t`,
    [uuid(n), n === 3 ? '2001:db8::1' : `192.0.2.${n}`, n === 3 ? 2 : 31])
  }
  await db.exec(`INSERT INTO sprint_private.sprint_world_records
    SELECT DISTINCT ON (board_id) board_id, time_cs, player_name, country_code,
      recorded_at, registration_seq, attempt_id
    FROM sprint_private.sprint_records ORDER BY board_id, time_cs`)
  const initial = await snapshot({ ips: true })
  const migration = await readSql(migrationPath)
  await check('migration adds history without changing existing game data', async () => {
    await db.exec(migration)
    assert.deepEqual(await snapshot({ ips: true }), initial)
    assert.deepEqual(await historyRows(), [])
  })
  const stableGameData = await snapshot()
  await check('history contains exactly the three approved typed fields', async () => {
    const columns = await rows(`SELECT column_name, data_type, is_nullable
      FROM information_schema.columns WHERE table_schema = 'sprint_private'
      AND table_name = 'sprint_ip_cleanup_runs' ORDER BY ordinal_position`)
    assert.deepEqual(columns, [
      { column_name: 'executed_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      { column_name: 'succeeded', data_type: 'boolean', is_nullable: 'NO' },
      { column_name: 'deleted_count', data_type: 'integer', is_nullable: 'YES' },
    ])
  })
  await check('runtime and PUBLIC cannot read, forge or mutate history', async () => {
    await db.exec('CREATE ROLE maintenance_history_visitor NOLOGIN')
    for (const role of ['sprint_runtime', 'maintenance_history_visitor']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        assert.equal((await rows('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, history, privilege]))[0].allowed, false)
      }
      for (const sql of [`SELECT * FROM ${history}`, `INSERT INTO ${history} VALUES (clock_timestamp(), true, 0)`,
        `UPDATE ${history} SET succeeded = true`, `DELETE FROM ${history}`]) await expectDenied(role, sql)
    }
    assert.equal((await rows(`SELECT has_function_privilege('sprint_runtime', 'sprint_private.sprint_purge_registration_ips()', 'EXECUTE') AS allowed`))[0].allowed, true)
    await expectDenied('maintenance_history_visitor', 'SELECT sprint_private.sprint_purge_registration_ips()')
  })
  await check('invalid history values cannot masquerade as valid counts', async () => {
    for (const values of [[null, true, 0], [new Date(), null, 0], [new Date(), true, null],
      [new Date(), true, -1], [new Date(), false, 0]]) {
      await assert.rejects(db.query(`INSERT INTO ${history} VALUES ($1, $2, $3)`, values), error => ['23502', '23514'].includes(error.code))
    }
    assert.equal((await historyRows()).length, 0)
  })
  await check('unauthenticated, non-GET and unconfigured calls create no history', async () => {
    const before = queries
    assert.equal((await invoke({ authorization: 'Bearer wrong' })).code, 401)
    assert.equal((await invoke({ method: 'POST' })).code, 405)
    assert.equal((await invoke({ dependencies: { env: {} } })).code, 503)
    assert.equal(queries, before)
    assert.deepEqual(await snapshot({ ips: true }), initial)
    assert.equal((await historyRows()).length, 0)
  })
  await check('API and runtime RPC atomically delete only expired IPs and record success', async () => {
    const before = Date.now()
    const result = await invoke()
    assert.equal(result.code, 200)
    assert.deepEqual(result.body, { status: 'ok', deletedCount: 2 })
    const receipt = (await historyRows())[0]
    assert.equal(receipt.succeeded, true)
    assert.equal(receipt.deleted_count, 2)
    assert.ok(new Date(receipt.executed_at).getTime() >= before - 1)
    assert.ok(new Date(receipt.executed_at).getTime() <= Date.now() + 1)
    assert.deepEqual((await rows('SELECT record_id FROM sprint_private.sprint_record_ips')).map(r => r.record_id), [uuid(3)])
    assert.deepEqual(await snapshot(), stableGameData)
  })
  await check('zero deletions are a successful execution with a new receipt', async () => {
    assert.deepEqual((await invoke()).body, { status: 'ok', deletedCount: 0 })
    const receipts = await historyRows()
    assert.equal(receipts.length, 2)
    assert.equal(receipts[1].succeeded, true)
    assert.equal(receipts[1].deleted_count, 0)
  })
  await check('reapplying the migration preserves existing history and game data', async () => {
    const before = await snapshot({ ips: true })
    const receipts = await historyRows()
    await db.exec(migration)
    assert.deepEqual(await historyRows(), receipts)
    assert.deepEqual(await snapshot({ ips: true }), before)
  })
  await check('caller search_path cannot redirect the fixed private tables', async () => {
    await db.exec(`CREATE TABLE public.sprint_ip_cleanup_runs (marker integer);
      CREATE TABLE public.sprint_record_ips (marker integer);
      SET search_path = public, pg_catalog;`)
    assert.deepEqual((await invoke()).body, { status: 'ok', deletedCount: 0 })
    await db.exec('RESET search_path')
    assert.equal((await historyRows()).length, 3)
    assert.equal((await rows('SELECT count(*)::int AS n FROM public.sprint_ip_cleanup_runs'))[0].n, 0)
  })
  await check('purge SQL failure rolls back deletions and persists false with unknown count', async () => {
    // One timestamp keeps the original 30-day constraint exact.
    await db.query(`INSERT INTO sprint_private.sprint_record_ips
      SELECT $1::uuid, '192.0.2.10'::inet, stamp, stamp + interval '30 days'
      FROM (SELECT clock_timestamp() - interval '31 days' AS stamp) t`, [uuid(1)])
    const before = await snapshot({ ips: true })
    await db.exec(`CREATE FUNCTION public.fail_ip_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic-private-address-and-token'; END; $$;
      CREATE TRIGGER fail_ip_cleanup AFTER DELETE ON sprint_private.sprint_record_ips
      FOR EACH ROW EXECUTE FUNCTION public.fail_ip_cleanup();`)
    const result = await invoke()
    assert.equal(result.code, 503)
    assert.deepEqual(result.body, { status: 'unavailable', code: 'maintenance_unavailable' })
    assert.deepEqual(await snapshot({ ips: true }), before)
    const receipts = await historyRows()
    assert.equal(receipts.length, 4)
    assert.equal(receipts[3].succeeded, false)
    assert.equal(receipts[3].deleted_count, null)
    assert.equal(JSON.stringify(receipts).includes('synthetic-'), false)
    await db.exec('DROP TRIGGER fail_ip_cleanup ON sprint_private.sprint_record_ips')
  })
  await check('history write failure rolls back the purge and never returns false success', async () => {
    const before = await snapshot({ ips: true })
    const receipts = await historyRows()
    await db.exec(`CREATE FUNCTION public.fail_history_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic-private-address-and-token'; END; $$;
      CREATE TRIGGER fail_history_write BEFORE INSERT ON ${history}
      FOR EACH ROW EXECUTE FUNCTION public.fail_history_write();`)
    const result = await invoke()
    assert.equal(result.code, 503)
    assert.deepEqual(result.body, { status: 'unavailable', code: 'maintenance_unavailable' })
    assert.deepEqual(await historyRows(), receipts)
    assert.deepEqual(await snapshot({ ips: true }), before)
    await db.exec(`DROP TRIGGER fail_history_write ON ${history}`)
  })
  await check('connection failure remains unavailable without fabricated execution history', async () => {
    const receipts = await historyRows()
    const result = await invoke({ dependencies: { store: undefined,
      getStore: async () => { throw new Error('synthetic-private-connection-string') } } })
    assert.equal(result.code, 503)
    assert.deepEqual(result.body, { status: 'unavailable', code: 'maintenance_unavailable' })
    assert.deepEqual(await historyRows(), receipts)
  })
  await check('later successful execution recovers and all original game records remain', async () => {
    const result = await invoke()
    assert.equal(result.code, 200)
    assert.deepEqual(result.body, { status: 'ok', deletedCount: 1 })
    assert.equal((await historyRows()).length, 5)
    assert.deepEqual(await snapshot(), stableGameData)
    assert.deepEqual(Object.keys(result.body).sort(), ['deletedCount', 'status'])
  })
  await check('real loopback HTTP crosses authentication, API, runtime role and PostgreSQL history', async () => {
    const handler = createSprintMaintenanceHandler({ env, store })
    const leaderboardHandler = createSprintApiHandler('leaderboard', { env, store })
    const server = createServer((req, res) => {
      res.status = value => { res.statusCode = value; return res }
      res.json = value => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); return res }
      const selected = req.url === '/api/playground/sprint/leaderboard' ? leaderboardHandler : handler
      void selected(req, res).catch(() => { res.statusCode = 500; res.end() })
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const base = `http://127.0.0.1:${server.address().port}`
      const receipts = await historyRows()
      const denied = await fetch(`${base}/api/playground/sprint/maintenance`, { headers: { authorization: 'Bearer wrong' } })
      assert.equal(denied.status, 401)
      assert.deepEqual(await historyRows(), receipts)
      const response = await fetch(`${base}/api/playground/sprint/maintenance?retentionDays=0`, {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.deepEqual(await response.json(), { status: 'ok', deletedCount: 0 })
      assert.equal((await historyRows()).length, receipts.length + 1)
      await db.exec(`CREATE TRIGGER fail_http_cleanup BEFORE DELETE ON sprint_private.sprint_record_ips
        FOR EACH STATEMENT EXECUTE FUNCTION public.fail_ip_cleanup()`)
      const failure = await fetch(`${base}/api/playground/sprint/maintenance`, {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      })
      assert.equal(failure.status, 503)
      assert.deepEqual(await failure.json(), { status: 'unavailable', code: 'maintenance_unavailable' })
      const latest = (await historyRows()).at(-1)
      assert.equal(latest.succeeded, false)
      assert.equal(latest.deleted_count, null)
      await db.exec('DROP TRIGGER fail_http_cleanup ON sprint_private.sprint_record_ips')
      const leaderboardResponse = await fetch(`${base}/api/playground/sprint/leaderboard`)
      assert.equal(leaderboardResponse.status, 200)
      const leaderboard = await leaderboardResponse.json()
      assert.equal(leaderboard.status, 'ok')
      assert.equal(leaderboard.records.length, 2)
      assert.ok(Object.keys(leaderboard).every(key => ['status', 'records', 'updatedAt', 'worldRecord'].includes(key)))
      for (const record of leaderboard.records) {
        assert.deepEqual(Object.keys(record).sort(), ['countryCode', 'playerName', 'rank', 'recordedAt', 'timeCs'])
      }
      for (const forbidden of ['executed_at', 'succeeded', 'deleted_count', 'registration_ip', env.CRON_SECRET]) {
        assert.equal(JSON.stringify(leaderboard).includes(forbidden), false)
      }
      assert.deepEqual(await snapshot(), stableGameData)
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
  console.log(JSON.stringify({ status: 'passed', engine: (await rows('SHOW server_version'))[0].server_version,
    checks: checks.length, verified: checks }, null, 2))
} catch (error) {
  // Never dump SQL statements, fixture IPs, environment objects or error payloads.
  console.error(JSON.stringify({ status: 'failed', check: activeCheck, errorCode: error.code || error.name }))
  process.exitCode = 1
} finally {
  await db.close()
}
