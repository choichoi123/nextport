import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSprintPublicRecords,
  normalizeSprintRegistrationResult,
  normalizeSprintWorldRecord,
} from '../lib/playground-sprint-registration.mjs'

const recordedAt = '2026-11-18T00:00:00.000Z'
const record = { rank: 1, playerName: 'runner', countryCode: 'KR', timeCs: 900, recordedAt }
const registered = { status: 'registered', record, records: [record], updatedAt: recordedAt }
const classification = (status, timeCs, previousTimeCs, improvementCs) => ({ status, timeCs, previousTimeCs, improvementCs })
const normalize = value => normalizeSprintWorldRecord(value, { registrationStatus: 'registered', timeCs: 900 })

test('historical record results distinguish first, improvement, equality and a slower registered time', () => {
  for (const value of [classification('first', 900, null, 0), classification('broken', 900, 901, 1),
    classification('tied', 900, 900, 0), classification('unchanged', 900, 899, 0)]) {
    const source = Object.freeze({ ...value, registrationIp: '203.0.113.7', privateMetadata: { participant: 'private' } })
    assert.deepEqual(normalize(source), value)
    assert.notEqual(normalize(source), source)
  }
})

test('legacy cached registrations have no inferred historical record even when their rank is one', () => {
  assert.equal(normalize(undefined), null)
  assert.equal(normalize(null), null)
  assert.equal(normalizeSprintRegistrationResult(registered).worldRecord, null)
  assert.equal(normalizeSprintRegistrationResult({ ...registered, worldRecord: null }).worldRecord, null)
})

test('historical classifications require successful registration and the registered score', () => {
  const first = classification('first', 900, null, 0)
  for (const registrationStatus of ['not_improved', 'not_qualified', 'verified', 'error', undefined]) {
    assert.throws(() => normalizeSprintWorldRecord(first, { registrationStatus, timeCs: 900 }), /invalid_response/)
  }
  for (const timeCs of [undefined, null, 899, '900', NaN, Infinity]) {
    assert.throws(() => normalizeSprintWorldRecord(first, { registrationStatus: 'registered', timeCs }), /invalid_response/)
  }
})

test('malformed or inconsistent historical results fail closed instead of triggering an announcement', () => {
  const invalid = [
    [], 'first', true, {}, classification('new', 900, null, 0),
    classification('first', '900', null, 0), classification('first', 0, null, 0),
    classification('first', 900.1, null, 0), classification('first', Infinity, null, 0),
    classification('first', 900, undefined, 0), classification('first', 900, 1000, 0),
    classification('first', 900, null, 1), classification('first', 900, null, '0'),
    classification('broken', 900, 900, 0), classification('broken', 900, 899, 0),
    classification('broken', 900, 901, 0), classification('broken', 900, 901, 2),
    classification('broken', 900, '901', 1), classification('broken', 900, 901.5, 1.5),
    classification('broken', 900, Number.MAX_SAFE_INTEGER + 1, 1),
    classification('tied', 900, 899, 0), classification('tied', 900, 901, 0),
    classification('tied', 900, 900, 1), classification('tied', 900, 900, -1),
    classification('unchanged', 900, 900, 0), classification('unchanged', 900, 901, 0),
    classification('unchanged', 900, 899, 1), classification('unchanged', 900, null, 0),
  ]
  for (const value of invalid) assert.throws(() => normalize(value), /invalid_response/)
})

test('normalized registration preserves the confirmed world result and discards all private metadata', () => {
  const privateFields = { ip: '203.0.113.7', registration_ip: '2001:db8::7', participantHash: 'private-hash' }
  const worldRecord = classification('broken', 900, 950, 50)
  const source = Object.freeze({ ...registered, ...privateFields,
    record: Object.freeze({ ...record, ...privateFields }),
    records: Object.freeze([Object.freeze({ ...record, ...privateFields })]),
    worldRecord: Object.freeze({ ...worldRecord, ...privateFields }),
  })
  assert.deepEqual(normalizeSprintRegistrationResult(source), { ...registered, worldRecord })
  assert.deepEqual(normalizeSprintPublicRecords(source.records), [record])
})

test('non-registering outcomes keep their result without historical celebrations', () => {
  for (const status of ['not_improved', 'not_qualified']) {
    for (const worldRecord of [undefined, null]) {
      const data = normalizeSprintRegistrationResult({ ...registered, status, record: null, worldRecord })
      assert.equal(data.status, status)
      assert.equal(data.worldRecord, null)
      assert.equal(data.record, null)
    }
    assert.throws(() => normalizeSprintRegistrationResult({ ...registered, status,
      worldRecord: classification('tied', 900, 900, 0) }), /invalid_response/)
  }
})

test('client rejects malformed records and world scores that do not match the registered record', () => {
  for (const data of [undefined, { ...registered, status: 'verified' }, { ...registered, record: null },
    { ...registered, records: Array(11).fill(record) }, { ...registered, records: [{ ...record, rank: 0 }] },
    { ...registered, records: [{ ...record, timeCs: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...registered, records: [{ ...record, recordedAt: null }] },
    { ...registered, worldRecord: classification('first', 899, null, 0) },
    { ...registered, worldRecord: classification('broken', 900, 901, 2) }]) {
    assert.throws(() => normalizeSprintRegistrationResult(data), /invalid_response/)
  }
})
