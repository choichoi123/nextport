// Fictional team names confirmed from the 3030 concept review on 2026-11-23.
// Colors are game art palettes, not official club branding specifications.
export const BASEBALL_TEAMS = Object.freeze([
  { id: 'heroes', name: '피움 히어로즈', shortName: '피움', jersey: '#742637', helmet: '#681d35', accent: '#f4eee4', pants: '#f3eee4', pantsPiping: '#742637', uniformProfile: 'heroes-pilot-v1' },
  { id: 'lions', name: '함성 라이온즈', shortName: '함성', jersey: '#2453a5', helmet: '#174b9e', accent: '#f5f3ed', pants: '#f8f8f3', pantsPiping: '#2453a5', uniformProfile: 'lions-club-v1' },
  { id: 'landers', name: 'MSG 랜더스', shortName: 'MSG', jersey: '#d32630', helmet: '#bd202b', accent: '#f7f4ed', pants: '#f7f4ed', pantsPiping: '#d32630', uniformProfile: 'landers-club-v1' },
  { id: 'wiz', name: 'PT 위즈', shortName: 'PT', jersey: '#222225', helmet: '#17191e', accent: '#cf2639', pants: '#f7f4ed', pantsPiping: '#222225', undersleeve: '#cf2639', uniformProfile: 'wiz-club-v1' },
  { id: 'tigers', name: '기세 타이거즈', shortName: '기세', jersey: '#f4f4ef', helmet: '#c92b38', accent: '#c92b38', pants: '#f8f8f3', pantsPiping: '#c92b38', undersleeve: '#c92b38', uniformProfile: 'tigers-club-v1' },
  { id: 'twins', name: 'GG 트윈스', shortName: 'GG', jersey: '#f5f3ed', helmet: '#181c22', accent: '#c73846', pants: '#f5f3ed', stripe: '#30323a', pantsStripe: '#30323a', pantsPiping: '#f5f3ed', undersleeve: '#181c22', uniformProfile: 'twins-pilot-v1' },
  { id: 'bears', name: '두근 베어스', shortName: '두근', jersey: '#ede7d9', helmet: '#202d48', accent: '#202d48', secondary: '#bd303c', pants: '#f4f0e7', pantsPiping: '#202d48', undersleeve: '#202d48', uniformProfile: 'bears-club-v1' },
  { id: 'dinos', name: 'XP 다이노스', shortName: 'XP', jersey: '#f0eee5', helmet: '#1c3856', accent: '#b6a06b', pants: '#f7f4ed', sleeve: '#1c3856', secondary: '#82b9b1', pantsPiping: '#1c3856', undersleeve: '#1c3856', undersleeveFit: 'right-elbow', uniformProfile: 'dinos-pilot-v1' },
  { id: 'eagles', name: '한방 이글스', shortName: '한방', jersey: '#dc681e', helmet: '#202d44', sleeve: '#202d44', accent: '#f5efe5', pants: '#f7f4ed', pantsPiping: '#202d44', uniformProfile: 'eagles-club-v1' },
  { id: 'giants', name: '로켓 자이언츠', shortName: '로켓', jersey: '#1e2f48', helmet: '#172c48', accent: '#cf3d45', secondary: '#f4f4ef', pants: '#f7f4ed', pantsPiping: '#1e2f48', undersleeve: '#1e2f48', undersleeveFit: 'right-elbow', uniformProfile: 'giants-club-v1' },
].map(team => Object.freeze(team)))

const teamsById = new Map(BASEBALL_TEAMS.map(team => [team.id, team]))
const invisibleName = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u
export const BASEBALL_PLAYER_NAME_LIMIT = 16

export function getBaseballTeam(id) {
  return teamsById.get(id) || BASEBALL_TEAMS[0]
}

/** Strict setup validation; the display fallback above never accepts unknown IDs. */
export function validateBaseballPlayer(input = {}) {
  const values = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const errors = {}
  let name = ''
  if (values.name === undefined || values.name === null || values.name === '') errors.name = 'required'
  else if (typeof values.name !== 'string') errors.name = 'invalid'
  else {
    const normalized = values.name.normalize('NFC')
    name = normalized.trim()
    if (invisibleName.test(normalized)) errors.name = 'invalid'
    else if (!name) errors.name = 'required'
    else if ([...name].length > BASEBALL_PLAYER_NAME_LIMIT) errors.name = 'tooLong'
  }
  if (values.handedness !== 'left' && values.handedness !== 'right') errors.handedness = 'invalid'
  if (!teamsById.has(values.teamId)) errors.teamId = 'invalid'
  const numberInput = values.jerseyNumber === undefined ? '7' : values.jerseyNumber
  let jerseyNumber = ''
  if (typeof numberInput === 'string') jerseyNumber = numberInput.trim()
  else if (typeof numberInput === 'number' && Number.isInteger(numberInput) && numberInput >= 0 && numberInput <= 99) jerseyNumber = String(numberInput)
  if (!/^[0-9]{1,2}$/.test(jerseyNumber)) errors.jerseyNumber = 'invalid'
  const valid = Object.keys(errors).length === 0
  return { valid, errors, player: valid ? Object.freeze({ name, handedness: values.handedness, teamId: values.teamId, jerseyNumber }) : null }
}
