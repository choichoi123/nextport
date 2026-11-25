import test from 'node:test'
import assert from 'node:assert/strict'
import { BASEBALL_RULES } from '../lib/playground-baseball.mjs'
import { validateBaseballPlayer } from '../lib/playground-baseball-teams.mjs'
import { getBaseballPlayerFeedback, revalidateBaseballPlayerField, handleBaseballCanvasKeyDown } from '../lib/playground-baseball-input.mjs'

const player = { name:'선수', jerseyNumber:'07', handedness:'right', teamId:'heroes' }
const ko = { nameError:'이름 오류', numberError:'등번호 오류', playerError:'선수 설정 오류' }
const en = { nameError:'Name error', numberError:'Number error', playerError:'Player settings error' }

function keyboard(overrides = {}) {
  return { target:{tagName:'CANVAS'}, key:' ', code:'Space', repeat:false, prevented:false,
    preventDefault() { this.prevented = true }, ...overrides }
}
function input(initial = { x:0, y:.75 }) {
  const state = { aim:initial, aims:[], swings:[], inputs:[], pauses:0, pauseReasons:[] }
  return { state, press(event) {
    handleBaseballCanvasKeyDown(event, { aim:state.aim, onAim(value) { state.aim=value; state.aims.push(value) },
      onSwing(value, metadata) { state.swings.push(value); state.inputs.push(metadata) }, onPause(reason) { state.pauses++; state.pauseReasons.push(reason) } })
    return event
  } }
}

test('등번호만 잘못되면 이름은 유효하고 번호 안내·오류에만 접근성 연결을 건다', () => {
  const errors = validateBaseballPlayer({ ...player, jerseyNumber:'AA' }).errors
  const feedback = getBaseballPlayerFeedback(errors, ko)
  assert.deepEqual(errors, { jerseyNumber:'invalid' })
  assert.equal(feedback.name.invalid, false)
  assert.equal(feedback.name.describedBy, undefined)
  assert.equal(feedback.jerseyNumber.invalid, true)
  assert.equal(feedback.messages.length, 1)
  assert.equal(feedback.messages[0].text, ko.numberError)
  assert.equal(feedback.jerseyNumber.describedBy, `${feedback.numberHint} ${feedback.messages[0].id}`)
})

test('이름만 잘못되면 정상 등번호07의 오류를 표시하지 않는다', () => {
  const feedback = getBaseballPlayerFeedback(validateBaseballPlayer({ ...player, name:'' }).errors, ko)
  assert.equal(feedback.name.invalid, true)
  assert.equal(feedback.name.describedBy, feedback.messages[0].id)
  assert.equal(feedback.jerseyNumber.invalid, false)
  assert.equal(feedback.jerseyNumber.describedBy, feedback.numberHint)
  assert.deepEqual(feedback.messages.map(item=>item.text), [ko.nameError])
})

test('이름·번호가 함께 틀리면 두 오류와 각 필드의 별도 설명 ID를 모두 제공한다', () => {
  const feedback = getBaseballPlayerFeedback(validateBaseballPlayer({ ...player, name:'', jerseyNumber:'AA' }).errors, ko)
  assert.equal(feedback.name.invalid, true)
  assert.equal(feedback.jerseyNumber.invalid, true)
  assert.equal(feedback.messages.length, 2)
  assert.equal(new Set(feedback.messages.map(item=>item.id)).size, 2)
  assert.equal(feedback.name.describedBy, feedback.messages[0].id)
  assert.ok(feedback.jerseyNumber.describedBy.split(' ').includes(feedback.messages[1].id))
})

test('수정한 필드만 재검증하며 다른 오류를 숨기거나 아직 제출하지 않은 오류를 만들지 않는다', () => {
  const draft = { ...player, name:'', jerseyNumber:'AA' }
  const original = validateBaseballPlayer(draft).errors
  const stillWrong = revalidateBaseballPlayerField(original, { ...draft, name:'x'.repeat(17) }, 'name')
  assert.deepEqual(stillWrong, { name:'tooLong', jerseyNumber:'invalid' })
  const numberOnly = revalidateBaseballPlayerField(stillWrong, { ...draft, name:'선수' }, 'name')
  assert.deepEqual(numberOnly, { jerseyNumber:'invalid' })
  assert.equal(revalidateBaseballPlayerField(numberOnly, { ...player, teamId:'giants' }, 'teamId'), numberOnly)
  assert.deepEqual(revalidateBaseballPlayerField(numberOnly, { ...player, jerseyNumber:'00' }, 'jerseyNumber'), {})
  assert.deepEqual(original, { name:'required', jerseyNumber:'invalid' })
  assert.deepEqual(revalidateBaseballPlayerField({}, draft, 'name'), {})
})

test('검증 코드는 언어에 독립적이고 같은 오류가 현재 언어의 문구로 바뀐다', () => {
  const errors = validateBaseballPlayer({ ...player, name:'', jerseyNumber:'AA' }).errors
  const before = structuredClone(errors)
  const english = getBaseballPlayerFeedback(errors, en), korean = getBaseballPlayerFeedback(errors, ko)
  assert.deepEqual(english.messages.map(item=>item.text), [en.nameError,en.numberError])
  assert.deepEqual(korean.messages.map(item=>item.text), [ko.nameError,ko.numberError])
  assert.deepEqual(english.messages.map(item=>item.id), korean.messages.map(item=>item.id))
  assert.deepEqual(errors, before)
})

test('이전 HMR 문자열 상태는 오류 객체로 오인하지 않으며 일반 설정 오류도 별도 연결한다', () => {
  for (const previous of ['', 'Old translated error', null, []]) {
    const feedback = getBaseballPlayerFeedback(previous, ko)
    assert.equal(feedback.messages.length, 0)
    assert.equal(feedback.name.invalid, false)
    assert.deepEqual(revalidateBaseballPlayerField(previous, player, 'name'), {})
  }
  const feedback = getBaseballPlayerFeedback({ handedness:'invalid', teamId:'invalid' }, en)
  assert.equal(feedback.messages.length, 1)
  assert.equal(feedback.messages[0].text, en.playerError)
  assert.equal(feedback.handedness.describedBy, feedback.messages[0].id)
  assert.equal(feedback.teamId.describedBy, feedback.messages[0].id)
})

test('Space를 길게 눌러도 반복 이벤트마다 기본 스크롤은 차단하고 스윙은 한 번만 요청한다', () => {
  const game = input()
  assert.equal(game.press(keyboard()).prevented, true)
  for (let index=0; index<20; index++) assert.equal(game.press(keyboard({repeat:true})).prevented, true)
  assert.equal(game.state.swings.length, 1)
  assert.deepEqual(game.state.swings[0], {x:0,y:.75})
  assert.deepEqual(game.state.inputs, [{ source:'keyboard', surface:'field', code:'Space' }])
  assert.equal(game.state.aims.length, 0)
})

test('네 방향키도 반복 스크롤을 차단하면서 최초 한 번만 같은 크기로 조준한다', () => {
  const cases = [['ArrowLeft',-.025,0],['ArrowRight',.025,0],['ArrowUp',0,.025],['ArrowDown',0,-.025]]
  for (const [key,x,y] of cases) {
    const game = input()
    assert.equal(game.press(keyboard({key,code:key})).prevented, true)
    for(let index=0; index<20; index++) assert.equal(game.press(keyboard({key,code:key,repeat:true})).prevented, true)
    assert.deepEqual(game.state.aim, {x,y:.75+y})
    assert.equal(game.state.aims.length, 1)
    assert.equal(game.state.swings.length, 0)
  }
})

test('키보드 조준은 기존 네 방향 경계를 유지한다', () => {
  const bounds = BASEBALL_RULES.aimBounds
  for (const [key,aim] of [['ArrowLeft',{x:bounds.left,y:.75}],['ArrowRight',{x:bounds.right,y:.75}],
    ['ArrowDown',{x:0,y:bounds.bottom}],['ArrowUp',{x:0,y:bounds.top}]]) {
    const game = input(aim)
    game.press(keyboard({key,code:key}))
    assert.deepEqual(game.state.aim, aim)
  }
})

test('텍스트 입력·선택·버튼에서는 Space와 방향키의 원래 동작을 가로채지 않는다', () => {
  for(const tagName of ['INPUT','TEXTAREA','SELECT','BUTTON']) for(const key of [' ','ArrowDown','Tab','Escape']) {
    const game=input(), event=keyboard({target:{tagName},key})
    game.press(event)
    assert.equal(event.prevented, false)
    assert.equal(game.state.swings.length + game.state.aims.length + game.state.pauses, 0)
  }
})

test('수정키와 IME 조합 중 게임 키를 실행하거나 기본 동작을 막지 않는다', () => {
  for(const override of [{altKey:true},{ctrlKey:true},{metaKey:true},{isComposing:true},{nativeEvent:{isComposing:true}}]) {
    for(const keys of [{key:' ',code:'Space'},{key:'ArrowDown',code:'ArrowDown'}]) {
      const game=input(), event=keyboard({...keys,...override})
      game.press(event)
      assert.equal(event.prevented,false)
      assert.equal(game.state.swings.length + game.state.aims.length + game.state.pauses,0)
    }
  }
})

test('Esc는 기본 동작을 차단해 중단하고 Tab은 초점 이동을 허용해 중단한다', () => {
  for(const repeat of [false,true]) for(const key of ['Escape','Tab']) {
    const game=input(), event=keyboard({key,code:key,repeat})
    game.press(event)
    assert.equal(event.prevented,key==='Escape')
    assert.equal(game.state.pauses,1)
    assert.deepEqual(game.state.pauseReasons, [key === 'Escape' ? 'escape' : 'tab'])
    assert.equal(game.state.swings.length + game.state.aims.length,0)
  }
})

test('확대 Canvas의 Space 입력 출처는 같은 조준점과 함께 한 번만 전달한다', () => {
  const game = input({x:.12,y:.86})
  const target = {tagName:'CANVAS', dataset:{baseballInput:'focus'}}
  game.press(keyboard({target}))
  game.press(keyboard({target,repeat:true}))
  assert.deepEqual(game.state.swings, [{x:.12,y:.86}])
  assert.deepEqual(game.state.inputs, [{source:'keyboard',surface:'focus',code:'Space'}])
})

test('무관한 키는 유지하고 기존 Shift+방향키 조준은 허용한다', () => {
  const game=input(), unrelated=keyboard({key:'Enter',code:'Enter'})
  game.press(unrelated)
  assert.equal(unrelated.prevented,false)
  assert.equal(game.state.swings.length + game.state.aims.length + game.state.pauses,0)
  assert.equal(game.press(keyboard({key:'ArrowRight',code:'ArrowRight',shiftKey:true})).prevented,true)
  assert.deepEqual(game.state.aim,{x:.025,y:.75})
})
