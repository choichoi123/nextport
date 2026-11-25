import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaseballObservation } from '../lib/playground-baseball-observation.mjs'
import { createBaseballPitch, judgeBaseballTake } from '../lib/playground-baseball.mjs'

function sample(startAt = 100, overrides = {}) {
  const pitch = createBaseballPitch({ seed:17 })
  return { now:startAt + 1200, startAt, phase:'flight', pitch, handedness:'right', swingAt:null,
    aim:{ x:0, y:0.745 }, swingAim:null,
    frame:{ flightMs:0, swingElapsedMs:null, ball:{ x:0, y:1, z:16.5 }, bat:null,
      main:{ ball:{ world:{ x:0, y:1, z:16.5 }, screen:{ x:15, y:22, radius:2, scale:30, ground:44 }, drawn:true },
        batStart:{ x:4, y:5 }, batEnd:{ x:10, y:11 }, sweetSpot:{ x:7, y:8 }, batLineWidth:3, batAlpha:0.62,
        batDrawn:true, zone:{ left:1, top:2, right:3, bottom:4 } }, focus:null,
      motion:{ name:'ready', footAnchor:{ x:580, y:1360 } }, placement:{ x:100, y:300, scale:0.2, stance:{ x:100, y:300 } },
      width:640, height:360, ratio:2, batted:false, resultAt:null }, ...overrides }
}

function finish(observer, startAt = 100, overrides = {}) {
  const first = sample(startAt)
  observer.capture(first)
  return observer.capture({ ...first, now:startAt + 2000, phase:'result', result:judgeBaseballTake(first.pitch), ...overrides })
}

test('관찰은 명시적 시작 후 새 공의 완료만 공개하고 재무장은 기록을 비운다', () => {
  const observer = createBaseballObservation()
  assert.deepEqual(observer.status(), { state:'idle', completed:0, aborted:0 })
  finish(observer)
  assert.deepEqual(observer.snapshot(), [])
  observer.arm(50)
  observer.capture(sample())
  assert.equal(observer.status().state, 'recording')
  assert.deepEqual(observer.snapshot(), [])
  finish(observer)
  assert.equal(observer.snapshot().length, 1)
  assert.equal(observer.status().state, 'armed')
  observer.arm(2500)
  assert.deepEqual(observer.snapshot(), [])
})

test('늦게 시작한 현재 공·이전 결과·중복 결과는 수집하지 않는다', () => {
  const observer = createBaseballObservation()
  observer.arm(101)
  finish(observer, 100)
  assert.deepEqual(observer.snapshot(), [])
  finish(observer, 200)
  finish(observer, 200)
  assert.equal(observer.status().completed, 1)
  observer.capture(sample(300, { phase:'complete', result:judgeBaseballTake(sample().pitch) }))
  assert.equal(observer.status().completed, 1)
})

test('공개 접촉 결과가 flight에 있어도 완료 전에는 snapshot에 나오지 않는다', () => {
  const observer = createBaseballObservation()
  observer.arm(0)
  observer.capture(sample(100, { result:{ outcome:'contact', contacted:true, contactAtMs:300, score:60 } }))
  assert.deepEqual(observer.snapshot(), [])
  observer.capture(sample(100, { now:2100, phase:'result', result:null }))
  assert.deepEqual(observer.snapshot(), [])
  observer.capture(sample(100, { now:2116, phase:'result', result:{ outcome:'contact', contacted:true, contactAtMs:300, score:60 } }))
  assert.equal(observer.snapshot()[0].result.score, 60)
})

test('16ms 표본 간격에도 스윙·상태 전환을 보존하고 공당320프레임으로 제한한다', () => {
  const observer = createBaseballObservation()
  observer.arm(0)
  observer.capture(sample(100, { now:1300 }))
  observer.capture(sample(100, { now:1301 }))
  observer.capture(sample(100, { now:1302, swingAt:2, swingAim:{ x:0.2, y:0.8 } }))
  finish(observer, 100)
  assert.deepEqual(observer.snapshot()[0].frames.map(frame => frame.now), [1300, 1302, 2100])
  observer.arm(0)
  for (let index = 0; index < 1000; index++) observer.capture(sample(100, { now:1300 + index * 16 }))
  observer.capture(sample(100, { now:18000, phase:'complete', result:judgeBaseballTake(sample().pitch) }))
  assert.equal(observer.snapshot()[0].frames.length, 320)
  assert.equal(observer.snapshot()[0].frames.at(-1).phase, 'complete')
})

test('windup 전체와 예상보다 이른 스윙도 기록하고 완료10구에서 자동으로 멈춘다', () => {
  const observer = createBaseballObservation()
  observer.arm(0)
  observer.capture(sample(100, { now:200, phase:'windup', frame:{ flightMs:-1100 } }))
  observer.capture(sample(100, { now:655, phase:'windup', swingAt:-645, swingAim:{ x:0, y:0.745 },
    input:{ at:655, source:'keyboard', surface:'field', code:'Space' }, frame:{ flightMs:-645, swingElapsedMs:0 } }))
  observer.capture(sample(100, { now:1100, phase:'windup', frame:{ flightMs:-200 } }))
  finish(observer, 100)
  assert.equal(observer.snapshot()[0].frames[0].flightMs, -1100)
  assert.equal(observer.snapshot()[0].frames[1].flightMs, -645)
  assert.equal(observer.snapshot()[0].swingAt, -645)
  for (let index = 1; index <= 20; index++) finish(observer, 100 + index * 3000)
  assert.deepEqual(observer.status(), { state:'complete', completed:10, aborted:0 })
  assert.equal(observer.snapshot().length, 10)
})

test('중단·교체된 미완료 공은 버리고 stop 뒤에도 완료 자료를 보존한다', () => {
  const observer = createBaseballObservation()
  observer.arm(0)
  observer.capture(sample(100))
  observer.capture({ phase:'paused', startAt:null })
  assert.equal(observer.status().aborted, 1)
  observer.capture(sample(3000))
  observer.capture(sample(6000))
  assert.equal(observer.status().aborted, 2)
  finish(observer, 6000)
  observer.capture(sample(9000))
  observer.stop()
  assert.deepEqual(observer.status(), { state:'stopped', completed:1, aborted:3 })
  finish(observer, 12000)
  assert.equal(observer.snapshot().length, 1)
})

test('완료 자료는 허용 필드만 복사하며 입력·snapshot 변경이 내부 자료에 영향을 주지 않는다', () => {
  const observer = createBaseballObservation()
  const input = sample(100, { now:1400, swingAt:100, name:'PRIVATE', cookies:'PRIVATE', input:{ at:1400, source:'pointer', surface:'field',
    pointerType:'mouse', x:15, y:22, point:{ x:0.1, y:0.7, cookie:'PRIVATE' }, name:'PRIVATE', url:'PRIVATE' } })
  input.pitch = { ...input.pitch, account:'PRIVATE' }
  input.frame.main.ball.screen.name = 'PRIVATE'
  input.frame.motion.url = 'PRIVATE'
  input.frame.main.marker = {kind:'passage',timeMs:500,world:{x:0,y:0.7,z:0,name:'PRIVATE'},screen:{x:20,y:30,url:'PRIVATE'}}
  observer.arm(0)
  observer.capture(input)
  input.frame.main.ball.screen.x = 999
  observer.capture({ ...sample(100), now:2100, phase:'result', result:{ outcome:'miss', score:0, name:'PRIVATE',
    barrelGapM:0.05,barrelClosestPoint:{x:0,y:0.6,z:0,name:'PRIVATE'},activeAtPlate:true,missReason:'outside-barrel' } })
  const records = observer.snapshot()
  assert.equal(JSON.stringify(records).includes('PRIVATE'), false)
  assert.equal(records[0].frames[0].main.ball.screen.x, 15)
  assert.equal(records[0].frames[0].main.batLineWidth, 3)
  assert.equal(records[0].frames[0].main.batDrawn, true)
  assert.equal(records[0].frames[0].batted, false)
  assert.deepEqual(records[0].frames[0].main.marker,{kind:'passage',timeMs:500,world:{x:0,y:0.7,z:0},screen:{x:20,y:30}})
  assert.equal(records[0].result.barrelGapM,0.05)
  assert.equal(records[0].result.missReason,'outside-barrel')
  assert.deepEqual(records[0].input.point, { x:0.1, y:0.7 })
  records[0].pitch.target.x = 900
  records[0].frames.length = 0
  assert.notEqual(observer.snapshot()[0].pitch.target.x, 900)
  assert.ok(observer.snapshot()[0].frames.length > 0)
})

test('이전 공 입력과 스윙 후 추가 클릭을 현재 공의 실제 스윙 입력으로 덮어쓰지 않는다', () => {
  const observer = createBaseballObservation()
  observer.arm(0)
  observer.capture(sample(100, { swingAt:0, input:{ at:50, source:'keyboard', surface:'field', code:'Space' } }))
  observer.capture(sample(100, { now:1320, swingAt:0, input:{ at:2000, source:'pointer', surface:'field', x:70, y:70 } }))
  observer.capture(sample(100, { now:1400, swingAt:100, input:{ at:1400, source:'pointer', surface:'field', x:10, y:20 } }))
  observer.capture(sample(100, { now:1450, swingAt:100, input:{ at:1450, source:'pointer', surface:'field', x:90, y:90 } }))
  finish(observer, 100)
  assert.equal(observer.snapshot()[0].input.at, 1400)
  assert.equal(observer.snapshot()[0].input.x, 10)
})

test('비정상 표본과 알 수 없는 필드는 RAF 관찰에서 무시한다', () => {
  const observer = createBaseballObservation()
  observer.arm(0)
  for (const invalid of [null, {}, sample(100, { now:NaN }), sample(100, { pitch:{ id:'https://private', type:'curveball' } })]) observer.capture(invalid)
  assert.deepEqual(observer.status(), { state:'armed', completed:0, aborted:0 })
  assert.throws(() => observer.arm(NaN), TypeError)
})

test('실제 배트·고정 조준·별도 복기는 서로 덮지 않고 허용한 숫자 필드만 독립 복사한다', () => {
  const observer=createBaseballObservation(), first=sample(100,{now:1400,swingAt:100,swingAim:{x:.1,y:.7}})
  first.frame.bat={radius:.033,active:true,visible:true,start:{x:1,y:2,z:0},end:{x:3,y:4,z:0},sweetSpot:{x:2,y:3,z:0}}
  first.frame.reviewBat={radius:.033,active:false,visible:true,angleRad:.4,progress:.1,
    start:{x:4,y:5,z:0,token:'PRIVATE'},end:{x:6,y:7,z:0},sweetSpot:{x:5,y:6,z:0},cookie:'PRIVATE'}
  first.frame.main.fixedAim={x:40,y:50,scale:60,url:'PRIVATE'}
  first.frame.main.review={kind:'passage',timeMs:500,batStart:{x:60,y:70},batEnd:{x:80,y:90},
    sweetSpot:{x:70,y:80},batLineWidth:4,batAlpha:.4,batDrawn:true,account:'PRIVATE'}
  first.frame.focus={fixedAim:{x:140,y:150},review:{...first.frame.main.review,batStart:{x:160,y:170}}}
  observer.arm(0)
  observer.capture(first)
  first.frame.reviewBat.start.x=999
  first.frame.main.fixedAim.x=999
  first.frame.main.review.batStart.x=999
  finish(observer)
  const frame=observer.snapshot()[0].frames[0]
  assert.deepEqual(frame.bat.start,{x:1,y:2,z:0})
  assert.deepEqual(frame.reviewBat.start,{x:4,y:5,z:0})
  assert.deepEqual(frame.main.fixedAim,{x:40,y:50,scale:60})
  assert.equal(frame.main.batStart.x,4)
  assert.equal(frame.main.review.batStart.x,60)
  assert.equal(frame.focus.review.batStart.x,160)
  assert.equal(frame.main.review.timeMs,500)
  assert.equal(frame.main.review.batAlpha,.4)
  assert.equal(frame.main.review.batDrawn,true)
  assert.equal(JSON.stringify(frame).includes('PRIVATE'),false)
  frame.main.review.batStart.x=888
  assert.equal(observer.snapshot()[0].frames[0].main.review.batStart.x,60)
})

test('알 수 없는 복기 종류·비정상 시각은 관찰 allowlist에 들어가지 않는다', () => {
  for(const review of [{kind:'future',timeMs:500},{kind:'passage',timeMs:NaN}]) {
    const observer=createBaseballObservation(), first=sample()
    first.frame.main.review=review
    observer.arm(0)
    observer.capture(first)
    finish(observer)
    assert.equal('review' in observer.snapshot()[0].frames[0].main,false)
  }
})
