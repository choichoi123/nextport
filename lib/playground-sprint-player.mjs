// ISO 3166-1 alpha-2 countries and territories; checked 2026-11-17.
// https://committee.iso.org/iso-3166-country-codes.html
// https://www.iso.org/obp/ui/#search/code/
// Cross-check: https://github.com/unicode-org/cldr/blob/main/common/validity/region.xml
// CLDR-only/reserved regions (AC, CP, CQ, DG, EA, IC, TA, XK) are not ISO assignments.
export const SPRINT_COUNTRY_CODES = Object.freeze(`
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ
EC EE EG EH ER ES ET
FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ
OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA
RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ
VA VC VE VG VI VN VU
WF WS
YE YT
ZA ZM ZW
`.trim().split(/\s+/))

export const SPRINT_PLAYER_NAME_LIMIT = 16
const countryCodes = new Set(SPRINT_COUNTRY_CODES)
// Keep a single visible line; reject controls, bidi/zero-width formatting and lone surrogates.
const invisibleName = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u

function countryFlag(code) {
  return [...code].map(letter => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join('')
}

/** Country labels are presentation only; selection uses stable alpha-2 codes. */
export function getSprintCountries(locale = 'ko') {
  const language = locale === 'en' ? 'en' : 'ko'
  const displayNames = typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames([language], { type: 'region', fallback: 'code' })
    : null
  const collator = new Intl.Collator(language)
  return SPRINT_COUNTRY_CODES.map(code => ({
    code,
    label: displayNames?.of(code) || code,
    flag: countryFlag(code),
  })).sort((left, right) => collator.compare(left.label, right.label) || left.code.localeCompare(right.code))
}

/** Local in-memory setup only: no persistence, identity lookup or IP-based nationality. */
export function validateSprintPlayer(input = {}) {
  const values = input && typeof input === 'object' ? input : {}
  const errors = {}
  let name = ''
  if (values.name === undefined || values.name === null || values.name === '') errors.name = 'required'
  else if (typeof values.name !== 'string') errors.name = 'invalid'
  else {
    const normalized = values.name.normalize('NFC')
    name = normalized.trim()
    if (invisibleName.test(normalized)) errors.name = 'invalid'
    else if (!name) errors.name = 'required'
    else if ([...name].length > SPRINT_PLAYER_NAME_LIMIT) errors.name = 'tooLong'
  }

  const countryCode = typeof values.countryCode === 'string' ? values.countryCode.trim().toUpperCase() : ''
  if (values.countryCode === undefined || values.countryCode === null || values.countryCode === '' || (typeof values.countryCode === 'string' && !countryCode)) errors.countryCode = 'required'
  else if (!countryCodes.has(countryCode)) errors.countryCode = 'invalid'

  const art = values.art
  if (art !== 'realistic' && art !== 'pixel') errors.art = 'invalid'
  const valid = Object.keys(errors).length === 0
  return { valid, errors, player: valid ? { name, countryCode, art } : null }
}
