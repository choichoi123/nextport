import test from 'node:test'
import assert from 'node:assert/strict'
import { getSprintRecordAction } from '../lib/playground-sprint-registration.mjs'

const action = (labelKey, disabled = false) => ({ labelKey, disabled })

test('finish verification shows a disabled checking action rather than a local registration preview', () => {
  for (const registration of [undefined, null, { status: 'idle' }, { status: 'error' }]) {
    assert.deepEqual(getSprintRecordAction({ status: 'verifying', eligible: true }, registration),
      action('recordChecking', true))
  }
})

test('a successful registration always reopens its result even if finish eligibility remains true', () => {
  for (const run of [undefined, { status: 'verifying' }, { status: 'verified', eligible: true },
    { status: 'verified', eligible: false }, { status: 'local' }]) {
    assert.deepEqual(getSprintRecordAction(run, { status: 'registered' }), action('registrationResult'))
  }
})

test('late non-improvement and TOP10 exclusion reopen the decision instead of offering registration again', () => {
  for (const status of ['not_improved', 'not_qualified']) {
    for (const run of [{ status: 'verified', eligible: true }, { status: 'verifying' }, undefined]) {
      assert.deepEqual(getSprintRecordAction(run, { status }), action('recordResult'))
    }
  }
  assert.deepEqual(getSprintRecordAction({ status: 'verified', eligible: false, timeCs: 885,
    personalBestTimeCs: 885, ineligibleReason: 'not_improved' }, { status: 'idle' }), action('recordResult'))
})

test('an in-flight registration disables the finish action until the server returns an outcome', () => {
  for (const run of [undefined, { status: 'verifying' }, { status: 'verified', eligible: true },
    { status: 'verified', eligible: false }]) {
    assert.deepEqual(getSprintRecordAction(run, { status: 'saving' }), action('recordSaving', true))
  }
})

test('only an explicitly eligible verified finish offers TOP10 registration', () => {
  assert.deepEqual(getSprintRecordAction({ status: 'verified', eligible: true }, { status: 'idle' }),
    action('onlineRegister'))
  for (const eligible of [false, undefined, null, 'true', 1]) {
    assert.deepEqual(getSprintRecordAction({ status: 'verified', eligible }), action('recordResult'))
  }
})

test('an ambiguous registration error keeps the existing retry path instead of claiming completion', () => {
  const registration = { status: 'error', details: { playerName: 'runner', countryCode: 'KR' } }
  assert.deepEqual(getSprintRecordAction({ status: 'verified', eligible: true }, registration), action('onlineRegister'))
  assert.deepEqual(getSprintRecordAction({ status: 'verified', eligible: false }, registration), action('recordResult'))
  for (const status of ['verification_error', 'local', 'idle']) {
    assert.deepEqual(getSprintRecordAction({ status }, registration), action('register'))
  }
})

test('offline, unverified and unavailable run states retain the preview action', () => {
  for (const run of [undefined, null, {}, { status: 'idle' }, { status: 'local' }, { status: 'online' },
    { status: 'preparing' }, { status: 'verification_error' }, { status: 'unavailable' }]) {
    for (const registration of [undefined, null, { status: 'idle' }]) {
      assert.deepEqual(getSprintRecordAction(run, registration), action('register'))
    }
  }
})

test('action selection does not infer outcomes from public ranks or names and leaves its inputs unchanged', () => {
  const record = Object.freeze({ rank: 1, playerName: 'runner', countryCode: 'KR', timeCs: 885 })
  const records = Object.freeze([record])
  const run = Object.freeze({ status: 'verified', eligible: true, playerName: 'runner', rank: 1, records })
  const registration = Object.freeze({ status: 'error', record, records })
  const before = JSON.stringify({ run, registration })
  assert.deepEqual(getSprintRecordAction(run, registration), action('onlineRegister'))
  assert.deepEqual(getSprintRecordAction({ status: 'verification_error', record, records }, registration), action('register'))
  assert.equal(JSON.stringify({ run, registration }), before)
  assert.equal(run.records, records)
  assert.equal(registration.record, record)
})
