import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BASEBALL_REGULAR_SEASON_GAMES, BASEBALL_REGULAR_SEASON_ID, getBaseballRegularSeasonSchedule,
} from '../lib/playground-baseball-career-schedule.mjs'
import {
  applyBaseballCareerCommand, createBaseballCareerManualAtBat, createBaseballCareerSave,
  publicBaseballCareerSave, simulateBaseballCareerAtBat, simulateBaseballCareerGame, validateBaseballCareerSave,
} from '../lib/playground-baseball-career-v2.mjs'
import { BASEBALL_TEAMS } from '../lib/playground-baseball-teams.mjs'

const uuid = index => `f0c10000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
const now = '2026-11-26T00:00:00.000Z'
const versions = Object.fromEntries(
  ['engineHash','rulesHash','atBatHash','fieldHash','sessionHash','careerHash','growthHash'].map((key, i) => [key, String(i + 1).repeat(64)]),
)
const profile = { name:'연습', handedness:'right', teamId:'wiz', jerseyNumber:'07' }
const fixture = scheduleId => createBaseballCareerSave({ id:uuid(1), profile, versions, seed:17, now, scheduleId })
const command = (save, type, fields = {}, atBat) =>
  applyBaseballCareerCommand(save, { commandId:uuid(20000 + save.revision), expectedRevision:save.revision, type, ...fields }, { now, atBat })
const prepare = (save, choice = 'mit') => command(save, 'prepare', { choice })
const simulateGame = (save, overrides = {}) => {
  let slot = 0
  return simulateBaseballCareerGame(save, { expectedRevision:save.revision, now,
    idFactory:() => uuid(1000 + save.currentGameIndex * 2 + slot++),
    seedFactory:() => 1 + save.currentGameIndex * 2 + slot, ...overrides })
}

test('144경기 일정은 열 구단에서 일관되며 모든 상대와 홈 및 원정 각각 8경기를 치른다', () => {
  for (const { id } of BASEBALL_TEAMS) {
    const games = getBaseballRegularSeasonSchedule(id)
    assert.equal(games.length, BASEBALL_REGULAR_SEASON_GAMES)
    assert.equal(games[0].day, 1)
    assert.ok(games.every((game, index) => index === 0 || game.day > games[index - 1].day))
    assert.ok(games.some((game, index) => index > 0 && game.day > games[index - 1].day + 1))
    const opponents = BASEBALL_TEAMS.filter(club => club.id !== id)
    for (const opponent of opponents) {
      assert.equal(games.filter(row => row.opponentId === opponent.id && row.home).length, 8)
      assert.equal(games.filter(row => row.opponentId === opponent.id && !row.home).length, 8)
    }
    for (const [index, game] of games.entries()) {
      assert.deepEqual(getBaseballRegularSeasonSchedule(game.opponentId)[index], {
        opponentId:id, day:game.day, home:!game.home,
      })
    }
  }
})

test('신규 시즌의 고정 일정과 구버전 3경기 세이브를 각각 검증한다', () => {
  const trial = fixture()
  assert.equal(Object.hasOwn(trial, 'scheduleId'), false)
  assert.deepEqual(trial.games.map(game => game.day), [1,4,7])
  assert.equal(prepare(trial).growth.mit, 42)
  assert.throws(() => fixture('unknown'))
  assert.throws(() => simulateGame(prepare(trial)), error => error.code === 'invalid')

  const save = fixture(BASEBALL_REGULAR_SEASON_ID)
  assert.equal(validateBaseballCareerSave({ ...save, seed:0 }), true)
  assert.equal(publicBaseballCareerSave(save).scheduleId, BASEBALL_REGULAR_SEASON_ID)
  assert.throws(() => validateBaseballCareerSave({ ...save, scheduleId:undefined }))
  for (const bad of [{ day:2 }, { home:!save.games[0].home }, { opponentId:profile.teamId }]) {
    const games = [{ ...save.games[0], ...bad }, ...save.games.slice(1)]
    assert.throws(() => validateBaseballCareerSave({ ...save, games }))
  }
})

test('경기 자동 진행은 준비된 경기의 남은 타석만 한 revision으로 저장한다', () => {
  const fresh = fixture(BASEBALL_REGULAR_SEASON_ID)
  assert.throws(() => simulateGame(fresh), error => error.code === 'preparation-required')
  const save = prepare(fresh)
  assert.throws(() => simulateGame(save,{ expectedRevision:1 }), error => error.code === 'conflict')
  const active = createBaseballCareerManualAtBat(save, { id:uuid(50), seed:159, now })
  assert.throws(() => simulateGame(command(save,'start-manual',{},active)), error => error.code === 'at-bat-active')
  assert.throws(() => simulateGame(save,{ idFactory:() => uuid(77) }), error => error.code === 'conflict')

  const { career, atBats } = simulateGame(save)
  assert.equal(career.revision, save.revision + 1)
  assert.equal(career.currentGameIndex, 1)
  assert.equal(career.stats.PA, 2)
  assert.deepEqual(atBats.map(row => [row.gameIndex,row.slot,row.growthSnapshot.careerRevision]), [
    [0,1,save.revision], [0,2,save.revision],
  ])
  assert.equal(publicBaseballCareerSave(career).statsBySource.automatic.PA, 2)
  assert.equal(career.ledger.filter(event => event.kind === 'game').length, 1)
  assert.equal(save.currentGameIndex, 0)
  assert.equal(save.stats.PA, 0)

  const first = simulateBaseballCareerAtBat(save,{ id:uuid(51), seed:159, now })
  const partial = command(save,'simulate-at-bat',{},first)
  const remaining = simulateGame(partial)
  assert.deepEqual(remaining.atBats.map(atBat => atBat.slot), [2])
  assert.deepEqual(remaining.career.games[0].appearances[0], partial.games[0].appearances[0])
  assert.equal(remaining.career.stats.PA, 2)
})

test('시즌 전체 144경기의 성장과 성적을 확정하고 마지막 타석 이후 이어쓰기를 막는다', () => {
  let save = fixture(BASEBALL_REGULAR_SEASON_ID)
  for (let index = 0; index < BASEBALL_REGULAR_SEASON_GAMES; index++) {
    const choice = index % 3 === 0 ? 'power' : 'rest'
    save = prepare(save, choice)
    if (index === 0) assert.equal(save.growth.power, 40)
    if (index === 3) assert.equal(save.growth.power, 41)
    const game = simulateGame(save)
    save = game.career
    assert.equal(save.currentGameIndex, index + 1)
    assert.equal(game.atBats.at(-1).growthSnapshot.gameIndex, index)
  }
  assert.equal(save.status, 'complete')
  assert.equal(save.stats.G, 144)
  assert.equal(save.stats.PA, 288)
  assert.equal(save.growth.power, 64)
  assert.equal(save.growth.discipline, 58)
  assert.equal(validateBaseballCareerSave(save), true)
  assert.ok(publicBaseballCareerSave(save).feedback.includes('regular-season-complete'))
  assert.throws(() => simulateGame(save), error => error.code === 'complete')
})
