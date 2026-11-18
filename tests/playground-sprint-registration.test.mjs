import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSprintIneligibilityNotice,
  normalizeSprintEligibility,
  normalizeSprintPublicRecords,
  normalizeSprintRegistrationResult,
  normalizeSprintWorldRecord,
} from '../lib/playground-sprint-registration.mjs'

const recordedAt = '2026-11-18T00:00:00.000Z'
const record = { rank: 1, playerName: 'runner', countryCode: 'KR', timeCs: 900, recordedAt }
const registered = { status: 'registered', record, records: [record], updatedAt: recordedAt }
const classification = (status, timeCs, previousTimeCs, improvementCs) => ({ status, timeCs, previousTimeCs, improvementCs })
const normalize = value => normalizeSprintWorldRecord(value, { registrationStatus: 'registered', timeCs: 900 })

test('older finish responses remain usable without guessing a personal best or exclusion reason', () => {
  for (const eligible of [true, false]) {
    const source = Object.freeze({ timeCs: 893, eligible, rank: 1, playerName: '1235' })
    assert.deepEqual(normalizeSprintEligibility(source), { personalBestTimeCs: null, ineligibleReason: null })
  }
})

test('eligible finishes distinguish a first result from a faster personal result and discard private metadata', () => {
  for (const [timeCs, personalBestTimeCs] of [[893, null], [884, 885], [1, null], [1, 2], [12000, null]]) {
    const source = Object.freeze({ timeCs, eligible: true, personalBestTimeCs, ineligibleReason: null,
      participantHash: 'private-participant', registrationIp: '192.0.2.7' })
    assert.deepEqual(normalizeSprintEligibility(source), { personalBestTimeCs, ineligibleReason: null })
  }
})

test('a slower or equal personal result retains the confirmed best time and the non-improvement reason', () => {
  for (const [timeCs, personalBestTimeCs] of [[893, 885], [885, 885], [12000, 12000], [2, 1]]) {
    const source = Object.freeze({ timeCs, eligible: false, personalBestTimeCs, ineligibleReason: 'not_improved' })
    assert.deepEqual(normalizeSprintEligibility(source), { personalBestTimeCs, ineligibleReason: 'not_improved' })
  }
})

test('missing the TOP10 cutoff does not invent a personal best for a new participant', () => {
  assert.deepEqual(normalizeSprintEligibility({ timeCs: 893, eligible: false,
    personalBestTimeCs: null, ineligibleReason: 'not_qualified' }),
  { personalBestTimeCs: null, ineligibleReason: 'not_qualified' })
})

test('partial, malformed or contradictory eligibility details fail closed', () => {
  const eligible = { timeCs: 884, eligible: true, personalBestTimeCs: 885, ineligibleReason: null }
  const notImproved = { timeCs: 893, eligible: false, personalBestTimeCs: 885, ineligibleReason: 'not_improved' }
  const invalid = [
    null, undefined, [], 'verified', true, {},
    { timeCs: 893, eligible: false, personalBestTimeCs: 885 },
    { timeCs: 893, eligible: false, ineligibleReason: 'not_improved' },
    { ...eligible, personalBestTimeCs: undefined },
    { ...eligible, ineligibleReason: undefined },
    { ...notImproved, personalBestTimeCs: null },
    { ...notImproved, eligible: true },
    { ...notImproved, timeCs: 884 },
    { ...notImproved, ineligibleReason: null },
    { ...notImproved, ineligibleReason: 'not_qualified' },
    { ...eligible, personalBestTimeCs: 883 },
    { ...eligible, personalBestTimeCs: 884 },
    { ...eligible, eligible: false },
    { timeCs: 893, eligible: true, personalBestTimeCs: null, ineligibleReason: 'not_qualified' },
  ]
  for (const personalBestTimeCs of ['885', 0, -1, 885.5, NaN, Infinity, 12001, Number.MAX_SAFE_INTEGER + 1]) {
    invalid.push({ ...notImproved, personalBestTimeCs })
  }
  for (const timeCs of ['884', 0, -1, 884.5, NaN, Infinity, 12001]) {
    invalid.push({ ...eligible, timeCs }, { timeCs, eligible: true })
  }
  for (const value of [undefined, null, 'false', 0, 1]) invalid.push({ ...eligible, eligible: value })
  for (const ineligibleReason of ['', 'not-qualified', 'unknown', 0, false, {}]) invalid.push({ ...notImproved, ineligibleReason })
  for (const value of invalid) assert.throws(() => normalizeSprintEligibility(value), /invalid_response/)
})

test('verified slower finishes explain the existing best and exact difference in Korean and English', () => {
  const run = Object.freeze({ status: 'verified', timeCs: 893, eligible: false,
    personalBestTimeCs: 885, ineligibleReason: 'not_improved' })
  const ko = getSprintIneligibilityNotice(run, 'ko')
  assert.equal(ko.personalBestTimeCs, 885)
  assert.match(ko.title, /서버 검증 완료/)
  assert.doesNotMatch(ko.title, /로컬|미리보기/)
  for (const text of ['8.93초', '8.85초', '0.08초 느려']) assert.ok(ko.description.includes(text))
  assert.match(ko.shortText, /8\.85초/)
  assert.match(ko.policy, /이 브라우저/)
  assert.match(ko.policy, /닉네임/)
  const en = getSprintIneligibilityNotice(run, 'en')
  assert.equal(en.personalBestTimeCs, 885)
  assert.match(en.title, /server verified/i)
  assert.doesNotMatch(en.title, /local|preview/i)
  for (const text of ['8.93s', '8.85s', '0.08s slower']) assert.ok(en.description.includes(text))
  assert.match(en.shortText, /8\.85s/)
  assert.match(en.policy, /this browser/i)
  assert.match(en.policy, /nickname/i)
})

test('an equal personal result is explained as equal rather than slower in both languages', () => {
  const run = { status: 'verified', timeCs: 885, eligible: false,
    personalBestTimeCs: 885, ineligibleReason: 'not_improved' }
  const ko = getSprintIneligibilityNotice(run, 'ko')
  assert.match(ko.description, /8\.85초.*같아/)
  assert.doesNotMatch(ko.description, /느려/)
  assert.match(ko.shortText, /같은 기록/)
  const en = getSprintIneligibilityNotice(run, 'en')
  assert.match(en.description, /8\.85s.*matches/)
  assert.doesNotMatch(en.description, /slower/)
  assert.match(en.shortText, /equal time/)
})

test('TOP10 cutoff and legacy exclusion notices preserve verification without inventing personal-best details', () => {
  const legacy = Object.freeze({ status: 'verified', timeCs: 893, eligible: false,
    playerName: 'runner', records: [record], rank: 1 })
  const cutoff = { ...legacy, personalBestTimeCs: null, ineligibleReason: 'not_qualified' }
  for (const locale of ['ko', 'en']) {
    const oldNotice = getSprintIneligibilityNotice(legacy, locale)
    const cutoffNotice = getSprintIneligibilityNotice(cutoff, locale)
    assert.equal(oldNotice.personalBestTimeCs, null)
    assert.equal(cutoffNotice.personalBestTimeCs, null)
    assert.doesNotMatch(oldNotice.description, /9\.00|8\.85|8\.93/)
    assert.match(cutoffNotice.description, /TOP10/)
    assert.notEqual(cutoffNotice.description, oldNotice.description)
    for (const notice of [oldNotice, cutoffNotice]) {
      assert.match(notice.title, locale === 'en' ? /server verified/i : /서버 검증 완료/)
      assert.doesNotMatch(notice.title, /로컬|미리보기|local|preview/i)
    }
  }
})

test('unverified runs and eligible finishes do not get an exclusion notice', () => {
  const registration = { status: 'not_improved', record: { timeCs: 885 } }
  for (const status of ['idle', 'local', 'online', 'verifying', 'verification_error', 'finished', undefined]) {
    assert.equal(getSprintIneligibilityNotice({ status, timeCs: 893, eligible: false }, 'ko', registration), null)
  }
  assert.equal(getSprintIneligibilityNotice(null, 'en', registration), null)
  assert.equal(getSprintIneligibilityNotice({ status: 'verified', timeCs: 884, eligible: true,
    personalBestTimeCs: 885, ineligibleReason: null }, 'en'), null)
})

test('a locked registration recheck can explain a newer personal best without mutating the finish snapshot', () => {
  const run = Object.freeze({ status: 'verified', timeCs: 893, eligible: true,
    personalBestTimeCs: 900, ineligibleReason: null })
  const laterResult = Object.freeze({ status: 'not_improved', record: Object.freeze({ timeCs: 880 }) })
  const ko = getSprintIneligibilityNotice(run, 'ko', laterResult)
  assert.equal(ko.personalBestTimeCs, 880)
  for (const text of ['8.80초', '0.13초 느려']) assert.ok(ko.description.includes(text))
  assert.doesNotMatch(ko.description, /9\.00초/)
  const en = getSprintIneligibilityNotice({ ...run, timeCs: 885 }, 'en',
    { status: 'not_improved', record: { timeCs: 885 } })
  assert.equal(en.personalBestTimeCs, 885)
  assert.match(en.description, /matches/)
  assert.equal(run.eligible, true)
  assert.equal(run.personalBestTimeCs, 900)
})

test('registration wording trusts only the authenticated own record of a non-improvement result', () => {
  const run = { status: 'verified', timeCs: 893, eligible: true, personalBestTimeCs: 900, ineligibleReason: null }
  for (const status of ['registered', 'not_qualified', 'saving', 'error', undefined]) {
    assert.equal(getSprintIneligibilityNotice(run, 'en', { status, record: { timeCs: 885 } }), null)
  }
  assert.equal(getSprintIneligibilityNotice(run, 'ko', { status: 'not_improved', record: null,
    records: [{ ...record, playerName: 'runner', timeCs: 885 }] }), null)
  const malformed = { status: 'verified', timeCs: 893, eligible: false,
    personalBestTimeCs: 900, ineligibleReason: 'not_improved' }
  const notice = getSprintIneligibilityNotice(malformed, 'en')
  assert.equal(notice.personalBestTimeCs, null)
  assert.match(notice.title, /server verified/i)
  assert.doesNotMatch(notice.description, /9\.00s/)
})

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
