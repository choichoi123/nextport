import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPRINT_COUNTRY_CODES, SPRINT_PLAYER_NAME_LIMIT, getSprintCountries, validateSprintPlayer,
} from '../lib/playground-sprint-player.mjs'

const basePlayer = { name: 'Jihoon', countryCode: 'KR', art: 'pixel' }

test('country choices cover the 249 ISO assignments without deprecated or macroregion codes', () => {
  assert.equal(SPRINT_COUNTRY_CODES.length, 249)
  assert.equal(new Set(SPRINT_COUNTRY_CODES).size, 249)
  assert.ok(Object.isFrozen(SPRINT_COUNTRY_CODES))
  assert.ok(SPRINT_COUNTRY_CODES.every(code => /^[A-Z]{2}$/.test(code)))
  for (const code of ['KR', 'SS', 'BQ', 'AX', 'PS', 'TW', 'AQ', 'UM']) assert.ok(SPRINT_COUNTRY_CODES.includes(code))
  for (const code of ['UK', 'EU', 'ZZ', 'AN', 'XK', 'AC', 'CQ']) assert.ok(!SPRINT_COUNTRY_CODES.includes(code))
})

test('country labels are localized, sorted and include independently rendered flags', () => {
  const korean = getSprintCountries('ko')
  const english = getSprintCountries('en')
  assert.equal(korean.length, 249)
  assert.equal(english.length, 249)
  assert.equal(korean.find(country => country.code === 'KR').label, '대한민국')
  assert.equal(english.find(country => country.code === 'KR').label, 'South Korea')
  assert.equal(english.find(country => country.code === 'KR').flag, '🇰🇷')
  const compare = new Intl.Collator('en').compare
  assert.ok(english.every((country, index) => !index || compare(english[index - 1].label, country.label) <= 0))
  english[0].label = 'Changed by a caller'
  assert.notEqual(getSprintCountries('en')[0].label, 'Changed by a caller')
})

test('a player is normalized without mutating the original input', () => {
  const original = Object.freeze({ name: '  지훈  ', countryCode: ' kr ', art: 'realistic', extra: 'ignored' })
  assert.deepEqual(validateSprintPlayer(original), {
    valid: true, errors: {}, player: { name: '지훈', countryCode: 'KR', art: 'realistic' },
  })
  assert.equal(original.name, '  지훈  ')
})

test('nickname limits count Unicode code points after NFC rather than UTF-16 units', () => {
  assert.equal(SPRINT_PLAYER_NAME_LIMIT, 16)
  assert.equal(validateSprintPlayer({ ...basePlayer, name: '🏃'.repeat(16) }).valid, true)
  assert.equal(validateSprintPlayer({ ...basePlayer, name: '🏃'.repeat(17) }).errors.name, 'tooLong')
  assert.equal(validateSprintPlayer({ ...basePlayer, name: 'e\u0301'.repeat(16) }).player.name, 'é'.repeat(16))
})

test('missing setup fields return field errors and never a partly valid player', () => {
  assert.deepEqual(validateSprintPlayer(), {
    valid: false, errors: { name: 'required', countryCode: 'required', art: 'invalid' }, player: null,
  })
  assert.equal(validateSprintPlayer(null).valid, false)
  assert.equal(validateSprintPlayer({ ...basePlayer, name: '　 ' }).errors.name, 'required')
  assert.equal(validateSprintPlayer({ ...basePlayer, name: 123 }).errors.name, 'invalid')
})

test('nicknames reject multiline, control, bidi and zero-width formatting characters', () => {
  for (const name of ['Ji\nhoon', 'Ji\rhoon', 'Ji\thoon', 'Ji\u0000hoon', 'Ji\u2028hoon', 'Ji\u2029hoon', 'Ji\u200bhoon', 'Ji\u200dhoon', 'Ji\u202ehoon', 'Ji\u2066hoon', 'Ji\ud800hoon']) {
    assert.equal(validateSprintPlayer({ ...basePlayer, name }).errors.name, 'invalid', JSON.stringify(name))
  }
  // Render names as React text; validation is not an HTML sanitizer.
  assert.equal(validateSprintPlayer({ ...basePlayer, name: '<Jihoon>' }).player.name, '<Jihoon>')
  assert.equal(validateSprintPlayer({ ...basePlayer, name: 'محمد' }).valid, true)
})

test('country and art validation accepts only supported choices', () => {
  for (const countryCode of ['ZZ', 'XK', 'EU', 'KOR', 'K1', 82]) {
    assert.equal(validateSprintPlayer({ ...basePlayer, countryCode }).errors.countryCode, 'invalid')
  }
  assert.equal(validateSprintPlayer({ ...basePlayer, countryCode: ' ' }).errors.countryCode, 'required')
  assert.equal(validateSprintPlayer({ ...basePlayer, art: '3d' }).errors.art, 'invalid')
  assert.equal(validateSprintPlayer({ ...basePlayer, art: 'realistic' }).valid, true)
  assert.equal(validateSprintPlayer({ ...basePlayer, art: 'pixel' }).valid, true)
})
