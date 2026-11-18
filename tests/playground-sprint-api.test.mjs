import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PassThrough } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createSprintApiHandler } from '../lib/server/sprint-api.mjs'
import { createSprintParticipant, readSprintClientIp, readSprintParticipant, sprintAddressHash, SPRINT_COOKIE_NAME } from '../lib/server/sprint-auth.mjs'
import { createSprintStore, readSprintConfiguration, SPRINT_BOARD_ID } from '../lib/server/sprint-db.mjs'
import { SPRINT_RULE_VERSION } from '../lib/playground-sprint-rules.mjs'
import { SPRINT_RULES, startSprintRace, applySprintStride, applySprintCheer } from '../lib/playground-sprint.mjs'

// Synthetic connection settings only; tests never import a driver or contact a DB.
const env = {
  PLAYGROUND_DATABASE_URL: 'postgresql://sprint_runtime:test-password@example.invalid/development',
  PLAYGROUND_SIGNING_SECRET: 'test-only-signing-secret-that-is-at-least-32-bytes',
  PLAYGROUND_LEADERBOARD_ENABLED: 'true',
  NODE_ENV: 'development',
}
const attemptId = '88888888-8888-4888-8888-888888888888'
const snapshot = { status: 'ok', records: [], updatedAt: null }

function request(body = {}, options = {}) {
  return { method: 'POST', headers: { host: 'localhost:3016', origin: 'http://localhost:3016',
    'content-type': 'application/json', ...options.headers }, socket: { remoteAddress: '127.0.0.1' }, body, ...options,
    ...(options.headers ? { headers: { host: 'localhost:3016', origin: 'http://localhost:3016', 'content-type': 'application/json', ...options.headers } } : {}) }
}

function response() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

function fixture(overrides = {}) {
  const calls = []
  const methods = {
    rateLimit: async () => ({ allowed: true, retryAfter: 60 }),
    leaderboard: async () => snapshot,
    createAttempt: async id => ({ attemptId: id, ruleVersion: 'sprint-v1', expiresAt: '2026-11-17T00:10:00Z' }),
    getAttempt: async id => ({ attemptId: id, ruleVersion: 'sprint-v1', expiresAt: '2026-11-17T00:10:00Z' }),
    finishAttempt: async (id, _participant, _hash, timeCs) => ({ status: 'verified', attemptId: id, timeCs, eligible: true }),
    registerRecord: async () => ({ status: 'registered', record: null, records: [] }),
    ...overrides,
  }
  const store = Object.fromEntries(Object.entries(methods).map(([name, fn]) => [name, async (...args) => {
    calls.push({ name, args })
    return fn(...args)
  }]))
  const identity = createSprintParticipant(env.PLAYGROUND_SIGNING_SECRET)
  const cookie = identity.cookie.split(';')[0]
  return { store, calls, cookie, identity }
}

async function invoke(action, req, options = {}) {
  const res = response()
  await createSprintApiHandler(action, { env, ...options })(req, res)
  return res
}

function recordCurrentRun() {
  let race = startSprintRace(0, SPRINT_RULE_VERSION)
  const events = []
  const gunAt = SPRINT_RULES.countdownMs
  for (let index = 0; index < 700 && race.status !== 'finished'; index += 1) {
    const atMs = index * 175
    const foot = index % 2 ? 'right' : 'left'
    const next = applySprintStride(race, foot, gunAt + atMs)
    if (next.steps > race.steps) events.push({ atMs, foot })
    race = next
    if (index % 3 === 1 && race.status === 'running') {
      const cheered = applySprintCheer(race, gunAt + atMs + 10)
      if (cheered.cheers > race.cheers) events.push({ atMs: atMs + 10, action: 'cheer' })
      race = cheered
    }
  }
  assert.equal(race.status, 'finished')
  assert.ok(events.some(event => event.action === 'cheer'))
  return { events, finishTimeMs: race.finishTimeMs }
}

test('unconfigured or disabled APIs do not load a database and distinguish unavailable from empty', async () => {
  let loaded = false
  for (const config of [{}, { ...env, PLAYGROUND_LEADERBOARD_ENABLED: 'false' }, { ...env, PLAYGROUND_SIGNING_SECRET: 'short' }]) {
    const res = await invoke('leaderboard', request({}, { method: 'GET' }), { env: config, getStore: () => { loaded = true } })
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.status, 'unavailable')
    assert.equal(res.body.code, 'not_configured')
    assert.equal(res.headers['cache-control'], 'no-store')
  }
  assert.equal(loaded, false)
  assert.equal(readSprintConfiguration({ ...env, PLAYGROUND_DATABASE_URL: 'postgresql://neondb_owner:fake@example.invalid/db' }), null)
})

test('empty leaderboard succeeds without a participant cookie and permits short shared caching', async () => {
  const { store, calls } = fixture()
  const res = await invoke('leaderboard', request({}, { method: 'GET' }), { store })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, snapshot)
  assert.equal(res.headers['set-cookie'], undefined)
  assert.match(res.headers['cache-control'], /s-maxage=30/)
  assert.deepEqual(calls.map(call => call.name), ['rateLimit', 'leaderboard'])
})

test('issuance binds a private signed cookie to the stored attempt, then reuses the identity', async () => {
  const { store, calls } = fixture()
  const res = await invoke('attempts', request(), { store })
  assert.equal(res.statusCode, 201)
  assert.match(res.headers['set-cookie'], /HttpOnly; SameSite=Lax$/)
  assert.match(res.headers['set-cookie'], /Path=\/api\/playground\/sprint/)
  const participant = readSprintParticipant({ headers: { cookie: res.headers['set-cookie'].split(';')[0] } }, env.PLAYGROUND_SIGNING_SECRET)
  assert.equal(calls.find(call => call.name === 'createAttempt').args[1], participant.hash)
  assert.equal(JSON.stringify(res.body).includes(participant.hash), false)
  const reused = await invoke('attempts', request({}, { headers: { cookie: res.headers['set-cookie'].split(';')[0] } }), { store })
  assert.equal(reused.headers['set-cookie'], undefined)
  assert.equal(calls.filter(call => call.name === 'createAttempt').at(-1).args[1], participant.hash)
  const secure = await invoke('attempts', request(), { store, env: { ...env, NODE_ENV: 'production' } })
  assert.match(secure.headers['set-cookie'], /; Secure$/)
})

test('tampered, expired, duplicate and absent identity cookies cannot finish or register', async () => {
  const { store, cookie } = fixture()
  const expired = createSprintParticipant(env.PLAYGROUND_SIGNING_SECRET, { now: Date.now() - 181 * 86400000 }).cookie.split(';')[0]
  for (const value of ['', cookie.slice(0, -1) + (cookie.at(-1) === '0' ? '1' : '0'), expired, `${cookie}; ${cookie}`]) {
    for (const action of ['finish', 'records']) {
      const res = await invoke(action, request({ attemptId }, { headers: { cookie: value } }), { store })
      assert.equal(res.statusCode, 401)
      assert.equal(res.body.code, 'participant_required')
    }
  }
  assert.equal(SPRINT_COOKIE_NAME, 'sprint_participant')
})

test('cross-origin, missing origin, wrong method, wrong content type and oversized bodies fail before DB', async () => {
  const { store, calls } = fixture()
  const cases = [
    [request({}, { headers: { origin: 'https://attacker.invalid' } }), 403],
    [request({}, { headers: { origin: undefined } }), 403],
    [request({}, { method: 'GET' }), 405],
    [request({}, { headers: { 'content-type': 'text/plain' } }), 415],
    [request({}, { headers: { 'content-length': '131073' } }), 413],
    [request({ injectedScore: 1 }), 400],
    [request([]), 400],
  ]
  for (const [req, expected] of cases) {
    const res = await invoke('attempts', req, { store })
    assert.equal(res.statusCode, expected)
  }
  assert.equal(calls.length, 0)
})

test('database rate limiting covers both address and participant and returns Retry-After', async () => {
  const { store, calls, cookie } = fixture({ rateLimit: async (_key, action) => ({ allowed: action.endsWith('_ip'), retryAfter: 87.2 }) })
  const res = await invoke('attempts', request({}, { headers: { cookie } }), { store })
  assert.equal(res.statusCode, 429)
  assert.equal(res.body.code, 'rate_limited')
  assert.equal(res.headers['retry-after'], '88')
  assert.deepEqual(calls.map(call => call.args[1]), ['attempts_ip', 'attempts'])
  assert.notEqual(calls[0].args[0], calls[1].args[0])
  assert.equal(res.headers['set-cookie'], undefined)
})

test('client IP resolution trusts only the Vercel platform header there and only the socket locally', () => {
  const candidates = [
    ['203.0.113.7', '203.0.113.7'],
    [' 203.0.113.7 ', '203.0.113.7'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['::1', '::1'],
    ['::ffff:192.0.2.8', '192.0.2.8'],
    ['0:0:0:0:0:FFFF:c000:208', '192.0.2.8'],
  ]
  for (const [value, expected] of candidates) {
    const req = request({ ip: '192.0.2.99' }, { headers: {
      'x-vercel-forwarded-for': value, 'x-forwarded-for': '192.0.2.100', 'x-real-ip': '192.0.2.101',
    } })
    assert.equal(readSprintClientIp(req, { VERCEL: '1' }), expected)
    assert.equal(readSprintClientIp(req, {}), '127.0.0.1')
    assert.equal(readSprintClientIp(req, { VERCEL: true }), '127.0.0.1')
    assert.equal(readSprintClientIp(request({}, { socket: { remoteAddress: value } }), {}), expected)
  }
})

test('ambiguous, malformed or absent client addresses become null without a Vercel proxy fallback', () => {
  const invalid = [undefined, null, [], ['203.0.113.7'], '', 'unknown', 'example.invalid', '192.168.001.1',
    '203.0.113.7:443', '[2001:db8::1]:443', '[2001:db8::1]', '2001:db8::1/64', '203.0.113.7/32',
    'fe80::1%eth0', 'fe80::1%25eth0', '203.0.113.7, 192.0.2.8', '203.0.113.7,'.repeat(30), ' '.repeat(201)]
  for (const value of invalid) {
    const req = request({}, { headers: { 'x-vercel-forwarded-for': value,
      'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.10' } })
    assert.equal(readSprintClientIp(req, { VERCEL: '1' }), null)
    assert.equal(readSprintClientIp(request({}, { socket: { remoteAddress: value } }), {}), null)
  }
  assert.equal(readSprintClientIp({ headers: {} }, {}), null)
})

test('address rate hashes share the IP resolver, normalize equivalent addresses and hide unknown inputs', () => {
  const secret = env.PLAYGROUND_SIGNING_SECRET
  const hashFor = value => sprintAddressHash(request({}, { headers: { 'x-vercel-forwarded-for': value } }), secret, { VERCEL: '1' })
  assert.equal(hashFor('::ffff:192.0.2.8'), hashFor('192.0.2.8'))
  assert.equal(hashFor('2001:0db8:0:0:0:0:0:1'), hashFor('2001:db8::1'))
  assert.equal(hashFor(undefined), hashFor('not an address'))
  assert.notEqual(hashFor(undefined), sprintAddressHash(request(), secret, {}))
  assert.match(hashFor('203.0.113.7'), /^[a-f0-9]{64}$/)
})

test('streamed request parsing caps bytes and returns JSON syntax errors without touching DB', async () => {
  const { store, calls } = fixture()
  for (const [payload, status, code] of [['{bad json', 400, 'invalid_json'], ['{"padding":"' + 'x'.repeat(131072) + '"}', 413, 'body_too_large']]) {
    const stream = new PassThrough()
    Object.assign(stream, request())
    delete stream.body
    const pending = invoke('attempts', stream, { store })
    stream.end(payload)
    const res = await pending
    assert.equal(res.statusCode, status)
    assert.equal(res.body.code, code)
  }
  assert.equal(calls.length, 0)
  const stream = new PassThrough()
  Object.assign(stream, request())
  delete stream.body
  const pending = invoke('attempts', stream, { store })
  stream.end('{}')
  assert.equal((await pending).statusCode, 201)
})

test('finish uses the issued rule and canonical server score; normalized resubmissions hash identically', async () => {
  const { store, calls, cookie } = fixture()
  const validatorCalls = []
  const validateSubmission = value => {
    validatorCalls.push(value)
    return { timeCs: 956, canonicalTimeMs: 9555, normalizedEvents: [{ atMs: 0, foot: 'left' }] }
  }
  for (const finishTimeMs of [9554.5, 9555.5]) {
    const res = await invoke('finish', request({ attemptId, events: [{ atMs: 0, foot: 'left', ignored: 'value' }], finishTimeMs }, { headers: { cookie } }), { store, validateSubmission })
    assert.equal(res.body.timeCs, 956)
    assert.equal(res.body.status, 'verified')
  }
  assert.equal(validatorCalls[0].ruleVersion, 'sprint-v1')
  const finishes = calls.filter(call => call.name === 'finishAttempt')
  assert.equal(finishes[0].args[2], finishes[1].args[2])
  assert.deepEqual(finishes[0].args.slice(3), [956, 9555])
  assert.match(finishes[0].args[2], /^[a-f0-9]{64}$/)
})

test('real replay validator rejects fabricated scores before fixing a finish', async () => {
  const { store, calls, cookie } = fixture()
  const res = await invoke('finish', request({ attemptId, events: [], finishTimeMs: 1 }, { headers: { cookie } }), { store })
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.code, 'invalid_run')
  assert.equal(calls.some(call => call.name === 'finishAttempt'), false)
})

test('issued sprint-v2 attempts verify mixed strides and cheers with the real server validator', async () => {
  const { store, calls, cookie } = fixture({
    createAttempt: async id => ({ attemptId: id, ruleVersion: SPRINT_RULE_VERSION, expiresAt: '2026-11-18T00:10:00Z' }),
    getAttempt: async id => ({ attemptId: id, ruleVersion: SPRINT_RULE_VERSION, expiresAt: '2026-11-18T00:10:00Z' }),
  })
  const issued = await invoke('attempts', request({}, { headers: { cookie } }), { store })
  assert.equal(issued.statusCode, 201)
  assert.equal(issued.body.ruleVersion, 'sprint-v2')

  const run = recordCurrentRun()
  const verified = await invoke('finish', request({ attemptId: issued.body.attemptId, ...run }, { headers: { cookie } }), { store })
  assert.equal(verified.statusCode, 200)
  assert.equal(verified.body.status, 'verified')
  const finish = calls.find(call => call.name === 'finishAttempt')
  assert.equal(finish.args[0], issued.body.attemptId)
  assert.deepEqual(finish.args.slice(3), [Math.floor(run.finishTimeMs / 10 + .5), run.finishTimeMs])
  const expectedHash = createHash('sha256').update(JSON.stringify({ ruleVersion: SPRINT_RULE_VERSION,
    events: run.events, canonicalTimeMs: run.finishTimeMs })).digest('hex')
  assert.equal(finish.args[2], expectedHash)

  // A cheer inside the cooldown cannot be smuggled into the verified input log.
  const cheerIndex = run.events.findIndex(event => event.action === 'cheer')
  const invalidEvents = [...run.events.slice(0, cheerIndex + 1), run.events[cheerIndex], ...run.events.slice(cheerIndex + 1)]
  const rejected = await invoke('finish', request({ attemptId: issued.body.attemptId,
    events: invalidEvents, finishTimeMs: run.finishTimeMs }, { headers: { cookie } }), { store })
  assert.equal(rejected.statusCode, 400)
  assert.equal(rejected.body.code, 'invalid_run')
  assert.equal(calls.filter(call => call.name === 'finishAttempt').length, 1)
})

test('outstanding sprint-v1 attempts retain their exact pre-v2 canonical time and finish hash', async () => {
  const { store, calls, cookie } = fixture()
  const events = Array.from({ length: 55 }, (_, index) => ({ atMs: index * 175, foot: index % 2 ? 'right' : 'left' }))
  // Recorded with the original 3000ms simulation gun, not the 4000ms presentation.
  const canonicalTimeMs = 9584.846622489975
  const verified = await invoke('finish', request({ attemptId, events, finishTimeMs: canonicalTimeMs }, { headers: { cookie } }), { store })
  assert.equal(verified.statusCode, 200)
  assert.equal(verified.body.timeCs, 958)
  const finish = calls.find(call => call.name === 'finishAttempt')
  assert.deepEqual(finish.args.slice(3), [958, canonicalTimeMs])
  const legacyHash = createHash('sha256').update(JSON.stringify({ ruleVersion: 'sprint-v1', events, canonicalTimeMs })).digest('hex')
  assert.equal(finish.args[2], legacyHash)
})

test('registration normalizes public fields, takes no score/date, and forwards stored database outcomes', async () => {
  const { store, calls, cookie } = fixture({ registerRecord: async () => ({ status: 'not_improved', record: { timeCs: 950 }, records: [] }) })
  const res = await invoke('records', request({ attemptId, playerName: '  e\u0301 runner  ', countryCode: ' kr ' }, { headers: { cookie } }), { store })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.status, 'not_improved')
  assert.deepEqual(calls.find(call => call.name === 'registerRecord').args.slice(3), ['é runner', 'KR', '127.0.0.1'])
  for (const body of [
    { attemptId, playerName: 'runner', countryCode: 'KR', timeCs: 1 },
    { attemptId, playerName: 'runner', countryCode: 'KR', recordedAt: '2000-01-01' },
    { attemptId, playerName: 'runner', countryCode: 'KR', ip: '203.0.113.7' },
    { attemptId, playerName: 'runner', countryCode: 'KR', clientIp: '203.0.113.7' },
    { attemptId, playerName: 'runner', countryCode: 'KR', registrationIp: '203.0.113.7' },
    { attemptId, playerName: 'runner', countryCode: 'KR', worldRecord: { status: 'first' } },
    { attemptId, playerName: 'runner\u202e', countryCode: 'KR' },
    { attemptId, playerName: 'runner', countryCode: 'ZZ' },
  ]) {
    const rejected = await invoke('records', request(body, { headers: { cookie } }), { store })
    assert.equal(rejected.statusCode, 400)
  }
  assert.equal(calls.filter(call => call.name === 'registerRecord').length, 1)
})

test('registration sends only a server-derived IP and preserves retry identity across address changes', async () => {
  const { store, calls, cookie } = fixture()
  const vercelEnv = { ...env, VERCEL: '1' }
  for (const ip of ['::ffff:203.0.113.7', '2001:db8::2', undefined, '203.0.113.7, 192.0.2.1']) {
    const res = await invoke('records', request({ attemptId, playerName: 'runner', countryCode: 'KR' }, {
      socket: { remoteAddress: '192.0.2.200' },
      headers: { cookie, origin: 'https://localhost:3016', 'x-vercel-forwarded-for': ip,
        'x-forwarded-for': '192.0.2.99', 'x-real-ip': '192.0.2.98' },
    }), { store, env: vercelEnv })
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.stringify(res.body).includes('203.0.113.7'), false)
  }
  const registrations = calls.filter(call => call.name === 'registerRecord')
  assert.deepEqual(registrations.map(call => call.args[5]), ['203.0.113.7', '2001:db8::2', null, null])
  assert.equal(new Set(registrations.map(call => call.args[2])).size, 1)
  assert.equal(new Set(registrations.map(call => call.args[1])).size, 1)
})

test('all public success responses allowlist fields and never expose private database metadata', async () => {
  const privateFields = { registrationIp: '203.0.113.7', registration_ip: '2001:db8::7', ip: '192.0.2.7',
    participantHash: 'private-participant', registrationIpRecordedAt: 'private-expiry' }
  const record = { rank: 1, playerName: 'runner', countryCode: 'KR', timeCs: 950, recordedAt: '2026-11-18T00:00:00Z' }
  const recordResult = { status: 'registered', record: { ...record, ...privateFields },
    records: [{ ...record, ...privateFields }], updatedAt: record.recordedAt, ...privateFields }
  const { store, cookie } = fixture({
    leaderboard: async () => ({ status: 'ok', records: recordResult.records, updatedAt: record.recordedAt, ...privateFields }),
    createAttempt: async id => ({ attemptId: id, ruleVersion: 'sprint-v1', expiresAt: '2026-11-18T00:10:00Z', ...privateFields }),
    finishAttempt: async id => ({ status: 'verified', attemptId: id, timeCs: 950, eligible: true, ...privateFields }),
    registerRecord: async () => recordResult,
  })
  const responses = [
    await invoke('leaderboard', request({}, { method: 'GET' }), { store }),
    await invoke('attempts', request(), { store }),
    await invoke('finish', request({ attemptId, events: [], finishTimeMs: 9500 }, { headers: { cookie } }), {
      store, validateSubmission: () => ({ timeCs: 950, canonicalTimeMs: 9500, normalizedEvents: [] }),
    }),
    await invoke('records', request({ attemptId, playerName: 'runner', countryCode: 'KR' }, { headers: { cookie } }), { store }),
  ]
  for (const res of responses) {
    assert.ok(res.statusCode >= 200 && res.statusCode < 300)
    const serialized = JSON.stringify(res.body)
    for (const [field, value] of Object.entries(privateFields)) {
      assert.equal(serialized.includes(field), false)
      assert.equal(serialized.includes(value), false)
    }
  }
  assert.deepEqual(responses[0].body, { status: 'ok', records: [record], updatedAt: record.recordedAt })
  assert.deepEqual(responses[2].body, { status: 'verified', attemptId, timeCs: 950, eligible: true })
  assert.deepEqual(responses[3].body, { status: 'registered', record, records: [record], updatedAt: record.recordedAt })
})

test('authenticated finish explains personal-best and TOP10 exclusions without changing eligibility', async () => {
  const cases = [
    { timeCs: 893, eligible: false, personalBestTimeCs: 885, ineligibleReason: 'not_improved' },
    { timeCs: 885, eligible: false, personalBestTimeCs: 885, ineligibleReason: 'not_improved' },
    { timeCs: 884, eligible: true, personalBestTimeCs: 885, ineligibleReason: null },
    { timeCs: 950, eligible: false, personalBestTimeCs: null, ineligibleReason: 'not_qualified' },
    { timeCs: 950, eligible: true, personalBestTimeCs: null, ineligibleReason: null },
  ]
  for (const expected of cases) {
    const { store, calls, cookie } = fixture({ finishAttempt: async id => ({ status: 'verified', attemptId: id,
      ...expected, participantHash: 'private-participant', registrationIp: '203.0.113.7', privateReason: 'internal' }) })
    const res = await invoke('finish', request({ attemptId, events: [], finishTimeMs: expected.timeCs * 10 }, { headers: { cookie } }), {
      store, validateSubmission: () => ({ timeCs: expected.timeCs, canonicalTimeMs: expected.timeCs * 10, normalizedEvents: [] }),
    })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { status: 'verified', attemptId, ...expected })
    assert.deepEqual(calls.find(call => call.name === 'finishAttempt').args.slice(3), [expected.timeCs, expected.timeCs * 10])
    assert.equal(calls.some(call => call.name === 'registerRecord'), false)
    const serialized = JSON.stringify(res.body)
    for (const privateValue of ['private-participant', '203.0.113.7', 'internal']) assert.equal(serialized.includes(privateValue), false)
  }
})

test('cached finish results without an exclusion explanation stay compatible and do not invent a reason', async () => {
  for (const eligible of [true, false]) {
    const expected = { status: 'verified', attemptId, timeCs: 893, eligible }
    const { store, cookie } = fixture({ finishAttempt: async () => expected })
    const res = await invoke('finish', request({ attemptId, events: [], finishTimeMs: 8930 }, { headers: { cookie } }), {
      store, validateSubmission: () => ({ timeCs: 893, canonicalTimeMs: 8930, normalizedEvents: [] }),
    })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, expected)
    assert.equal(Object.hasOwn(res.body, 'personalBestTimeCs'), false)
    assert.equal(Object.hasOwn(res.body, 'ineligibleReason'), false)
  }
})

test('contradictory or malformed exclusion metadata never becomes a successful finish response', async () => {
  const invalid = [
    { personalBestTimeCs: 885 },
    { ineligibleReason: 'not_improved' },
    { personalBestTimeCs: '885', ineligibleReason: 'not_improved' },
    { personalBestTimeCs: 0, ineligibleReason: 'not_improved' },
    { personalBestTimeCs: 12001, ineligibleReason: 'not_improved' },
    { personalBestTimeCs: 885, ineligibleReason: 'unknown' },
    { personalBestTimeCs: null, ineligibleReason: 'not_improved' },
    { personalBestTimeCs: 885, ineligibleReason: 'not_qualified' },
    { personalBestTimeCs: null, ineligibleReason: null },
    { personalBestTimeCs: 900, ineligibleReason: 'not_improved' },
  ]
  for (const metadata of invalid) {
    const { store, cookie } = fixture({ finishAttempt: async () => ({ status: 'verified', attemptId, timeCs: 893,
      eligible: false, ...metadata }) })
    const res = await invoke('finish', request({ attemptId, events: [], finishTimeMs: 8930 }, { headers: { cookie } }), {
      store, validateSubmission: () => ({ timeCs: 893, canonicalTimeMs: 8930, normalizedEvents: [] }),
    })
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.code, 'database_unavailable')
    assert.equal(res.headers['cache-control'], 'no-store')
    assert.equal(Object.hasOwn(res.body, 'personalBestTimeCs'), false)
    assert.equal(Object.hasOwn(res.body, 'ineligibleReason'), false)
  }
})

test('personal-best explanation fields are not added to public ranking, issuance or registration responses', async () => {
  const metadata = { personalBestTimeCs: 885, ineligibleReason: 'not_improved' }
  const record = { rank: 1, playerName: 'runner', countryCode: 'KR', timeCs: 885, recordedAt: '2026-11-18T00:00:00Z' }
  const { store, cookie } = fixture({
    leaderboard: async () => ({ status: 'ok', records: [record], updatedAt: record.recordedAt, ...metadata }),
    createAttempt: async id => ({ attemptId: id, ruleVersion: SPRINT_RULE_VERSION, expiresAt: '2026-11-18T00:10:00Z', ...metadata }),
    registerRecord: async () => ({ status: 'not_improved', record: null, records: [record], ...metadata }),
  })
  const responses = [
    await invoke('leaderboard', request({}, { method: 'GET' }), { store }),
    await invoke('attempts', request({}, { headers: { cookie } }), { store }),
    await invoke('records', request({ attemptId, playerName: 'runner', countryCode: 'KR' }, { headers: { cookie } }), { store }),
  ]
  for (const res of responses) {
    assert.equal(res.statusCode >= 200 && res.statusCode < 300, true)
    assert.equal(Object.hasOwn(res.body, 'personalBestTimeCs'), false)
    assert.equal(Object.hasOwn(res.body, 'ineligibleReason'), false)
  }
})

test('fresh installation and incremental finish-explanation migration install the same RPC', async () => {
  const base = await readFile(new URL('../db/playground-sprint.sql', import.meta.url), 'utf8')
  const migration = await readFile(new URL('../db/migrations/20261118-sprint-finish-eligibility.sql', import.meta.url), 'utf8')
  const definition = /CREATE OR REPLACE FUNCTION sprint_private\.sprint_finish_attempt\([\s\S]*?\$function\$;/
  const initialDefinition = base.match(definition)
  const upgradedDefinition = migration.match(definition)
  assert.ok(initialDefinition)
  assert.ok(upgradedDefinition)
  assert.equal(initialDefinition[0], upgradedDefinition[0])
  assert.match(migration, /REVOKE ALL ON FUNCTION sprint_private\.sprint_finish_attempt\(uuid, text, text, integer, double precision\)\s+FROM PUBLIC, sprint_runtime;/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION sprint_private\.sprint_finish_attempt\(uuid, text, text, integer, double precision\)\s+TO sprint_runtime;/)
})

test('registration exposes only a consistent server-confirmed historical result and its public fields', async () => {
  const record = { rank: 1, playerName: 'runner', countryCode: 'KR', timeCs: 900, recordedAt: '2026-11-18T00:00:00Z' }
  for (const worldRecord of [
    { status: 'first', timeCs: 900, previousTimeCs: null, improvementCs: 0 },
    { status: 'broken', timeCs: 900, previousTimeCs: 950, improvementCs: 50 },
    { status: 'tied', timeCs: 900, previousTimeCs: 900, improvementCs: 0 },
    { status: 'unchanged', timeCs: 900, previousTimeCs: 899, improvementCs: 0 },
  ]) {
    const { store, cookie } = fixture({ registerRecord: async () => ({ status: 'registered', record, records: [record],
      updatedAt: record.recordedAt, worldRecord: { ...worldRecord, registrationIp: '203.0.113.7', participantHash: 'private' } }) })
    const res = await invoke('records', request({ attemptId, playerName: 'runner', countryCode: 'KR' }, { headers: { cookie } }), { store })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body.worldRecord, worldRecord)
    assert.equal(JSON.stringify(res.body).includes('203.0.113.7'), false)
    assert.equal(JSON.stringify(res.body).includes('private'), false)
  }
})

test('malformed historical classifications fail closed and old cached results remain compatible', async () => {
  const record = { rank: 1, playerName: 'runner', countryCode: 'KR', timeCs: 900, recordedAt: '2026-11-18T00:00:00Z' }
  for (const [status, worldRecord] of [
    ['registered', { status: 'broken', timeCs: 900, previousTimeCs: 950, improvementCs: 49 }],
    ['registered', { status: 'first', timeCs: 899, previousTimeCs: null, improvementCs: 0 }],
    ['registered', { status: 'tied', timeCs: 900, previousTimeCs: 900, improvementCs: '0' }],
    ['not_improved', { status: 'first', timeCs: 900, previousTimeCs: null, improvementCs: 0 }],
    ['not_qualified', { status: 'tied', timeCs: 900, previousTimeCs: 900, improvementCs: 0 }],
  ]) {
    const { store, cookie } = fixture({ registerRecord: async () => ({ status, record, records: [record], worldRecord }) })
    const res = await invoke('records', request({ attemptId, playerName: 'runner', countryCode: 'KR' }, { headers: { cookie } }), { store })
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.status, 'unavailable')
    assert.equal(res.body.code, 'database_unavailable')
    assert.equal(res.headers['cache-control'], 'no-store')
    assert.equal(Object.hasOwn(res.body, 'worldRecord'), false)
  }
  for (const status of ['registered', 'not_improved', 'not_qualified']) {
    for (const extra of [{}, { worldRecord: null }]) {
      const { store, cookie } = fixture({ registerRecord: async () => ({ status, record, records: [record], ...extra }) })
      const res = await invoke('records', request({ attemptId, playerName: 'runner', countryCode: 'KR' }, { headers: { cookie } }), { store })
      assert.equal(res.statusCode, 200)
      if (Object.hasOwn(extra, 'worldRecord')) assert.equal(res.body.worldRecord, null)
      else assert.equal(Object.hasOwn(res.body, 'worldRecord'), false)
    }
  }
})

test('invalid historical metadata on a leaderboard never becomes a cacheable success', async () => {
  const { store } = fixture({ leaderboard: async () => ({ ...snapshot,
    worldRecord: { status: 'first', timeCs: 900, previousTimeCs: null, improvementCs: 0 } }) })
  const res = await invoke('leaderboard', request({}, { method: 'GET' }), { store })
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.code, 'database_unavailable')
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('missing, expired, conflicting and unverified attempts preserve actionable HTTP outcomes', async () => {
  for (const [code, expected] of [['attempt_not_found', 404], ['attempt_expired', 409], ['attempt_conflict', 409], ['attempt_not_verified', 409], ['attempt_too_early', 409]]) {
    const { store, cookie } = fixture({ registerRecord: async () => ({ status: 'error', code }) })
    const res = await invoke('records', request({ attemptId, playerName: 'runner', countryCode: 'KR' }, { headers: { cookie } }), { store })
    assert.equal(res.statusCode, expected)
    assert.equal(res.body.code, code)
  }
})

test('DB failures return a generic unavailable response, never an empty success or raw secrets', async () => {
  const { store } = fixture({ leaderboard: async () => { throw new Error('postgresql://private-secret@private.example/private') } })
  const res = await invoke('leaderboard', request({}, { method: 'GET' }), { store })
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.code, 'database_unavailable')
  assert.equal(res.body.status, 'unavailable')
  assert.equal(JSON.stringify(res.body).includes('private-secret'), false)
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('DB adapter parameterizes all visitor values and exposes only fixed RPC queries', async () => {
  const queries = []
  const store = createSprintStore({ query: async (query, values) => { queries.push({ query, values }); return [{ result: snapshot }] } })
  const name = "visitor'; DROP TABLE records; --"
  await store.registerRecord(attemptId, 'participant', 'hash', name, 'KR', '2001:db8::7')
  assert.equal(queries[0].query.includes(name), false)
  assert.deepEqual(queries[0].values, [attemptId, 'participant', 'hash', name, 'KR', '2001:db8::7'])
  assert.match(queries[0].query, /^SELECT sprint_private\.sprint_register_record/)
  assert.match(queries[0].query, /\$6::inet/)
  await store.registerRecord(attemptId, 'participant', 'hash', name, 'KR', null)
  assert.equal(queries[1].values[5], null)
})

test('DB adapter selects the current v2 board only for leaderboard reads and new attempts', async () => {
  const queries = []
  const store = createSprintStore({ query: async (query, values) => { queries.push({ query, values }); return [{ result: snapshot }] } })
  assert.equal(SPRINT_RULE_VERSION, 'sprint-v2')
  assert.equal(SPRINT_BOARD_ID, `sprint-100m:${SPRINT_RULE_VERSION}`)
  await store.leaderboard()
  await store.createAttempt(attemptId, 'participant')
  await store.getAttempt(attemptId, 'participant')
  await store.finishAttempt(attemptId, 'participant', 'hash', 958, 9584.846622489975)
  assert.deepEqual(queries, [
    { query: 'SELECT sprint_private.sprint_get_leaderboard($1) AS result', values: ['sprint-100m:sprint-v2'] },
    { query: 'SELECT sprint_private.sprint_create_attempt($1::uuid, $2, $3) AS result', values: [attemptId, 'participant', 'sprint-100m:sprint-v2'] },
    { query: 'SELECT sprint_private.sprint_get_attempt($1::uuid, $2) AS result', values: [attemptId, 'participant'] },
    { query: 'SELECT sprint_private.sprint_finish_attempt($1::uuid, $2, $3, $4::integer, $5::double precision) AS result',
      values: [attemptId, 'participant', 'hash', 958, 9584.846622489975] },
  ])
})

test('DB adapter exposes the fixed IP-retention purge RPC without visitor arguments', async () => {
  const queries = []
  const result = { status: 'ok', deletedCount: 3 }
  const store = createSprintStore({ query: async (query, values) => { queries.push({ query, values }); return [{ result }] } })
  assert.deepEqual(await store.purgeRegistrationIps(), result)
  assert.deepEqual(queries, [{ query: 'SELECT sprint_private.sprint_purge_registration_ips() AS result', values: [] }])
})
