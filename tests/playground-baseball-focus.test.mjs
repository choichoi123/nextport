import test from 'node:test'
import assert from 'node:assert/strict'
import { BASEBALL_FOCUS_BOUNDS, createBaseballFocusProjection } from '../lib/playground-baseball-focus.mjs'
import { createBaseballStage, createBaseballProjection } from '../lib/playground-baseball-layout.mjs'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, getBaseballPitchSpeed, createBaseballPitch, sampleBaseballPitch, sampleBaseballBat, judgeBaseballSwing } from '../lib/playground-baseball.mjs'

const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
const baseFor = (hand = 'right', width = 364, height = 437) => createBaseballProjection(createBaseballStage(width, height, hand))
const focusFor = (base = baseFor(), width = 288, height = 300) => createBaseballFocusProjection(base, { width, height })

test('확대는 모든 깊이의 공·배트·타구에 같은 균일 affine을 적용한다', () => {
  for (const [width,height] of [[294,385],[364,437],[1018,679]]) for (const hand of ['right','left']) {
    const base = baseFor(hand,width,height)
    const focus = focusFor(base)
    for (const z of [16.5,8,1,0,-.2159,-.4318,-1.4]) {
      for (const world of [{x:-.2,y:.5,z},{x:0,y:.745,z},{x:.25,y:1.05,z}]) {
        const original = base.project(world)
        const projected = focus.project(world)
        const mapped = focus.fromBase(original.x,original.y)
        close(projected.x,mapped.x)
        close(projected.y,mapped.y)
        close(projected.scale,original.scale*focus.transform.zoom)
        close(projected.ground,original.ground*focus.transform.zoom+focus.transform.y)
        const recovered = focus.toBase(projected.x,projected.y)
        close(recovered.x,original.x)
        close(recovered.y,original.y)
      }
    }
  }
})

test('존 내부·경계·외곽의 터치 좌표는 원래 z0 조준 위치로 돌아온다', () => {
  for (const hand of ['right','left']) for (const [width,height] of [[288,300],[340,320],[380,340]]) {
    const focus = focusFor(baseFor(hand),width,height)
    for (const point of [{x:0,y:.745},{x:BASEBALL_RULES.zone.left,y:BASEBALL_RULES.zone.top},
      {x:BASEBALL_RULES.zone.right,y:BASEBALL_RULES.zone.bottom},{x:.30,y:.43},{x:-.31,y:1.08}]) {
      const screen = focus.project(point)
      assert.ok(focus.containsPoint(screen.x,screen.y))
      const aim = focus.unproject(screen.x,screen.y)
      close(aim.x,point.x)
      close(aim.y,point.y)
    }
  }
})

test('비율 맞춤 옆 공간도 실제 world 조준 공간이며 존 경계로 스냅하지 않는다', () => {
  const focus = focusFor(baseFor(),400,300)
  const point = {x:BASEBALL_FOCUS_BOUNDS.right+.10,y:.745}
  const screen = focus.project(point)
  assert.ok(screen.x>focus.contentRect.right)
  assert.ok(focus.containsPoint(screen.x,screen.y))
  const aim = focus.unproject(screen.x,screen.y)
  close(aim.x,point.x)
  close(aim.y,point.y)
  assert.ok(aim.x>BASEBALL_RULES.zone.right)
  assert.equal(focus.containsPoint(15,150),false)
  assert.equal(focus.containsPoint(385,150),false)
  assert.equal(focus.containsPoint(16,16),true)
  assert.equal(focus.containsPoint(384,284),true)
})

test('패널 밖의 좌표를 역변환해도 기존 게임 조준 범위 제한만 유지한다', () => {
  const focus = focusFor()
  assert.deepEqual(focus.unproject(-1e6,1e6),{x:BASEBALL_RULES.aimBounds.left,y:BASEBALL_RULES.aimBounds.bottom})
  assert.deepEqual(focus.unproject(1e6,-1e6),{x:BASEBALL_RULES.aimBounds.right,y:BASEBALL_RULES.aimBounds.top})
})

test('4구종·세 기준구속·양투·양타석의100seed와코스4극점은 공 전체가 확대 패널 안에 보인다', () => {
  const {zone,courseMarginXM:marginX,courseMarginYM:marginY} = BASEBALL_RULES
  const cases = Array.from({length:100},(_,seed)=>({seed}))
  for (const x of [zone.left-marginX,zone.right+marginX]) for (const y of [zone.bottom-marginY,zone.top+marginY]) {
    cases.push({seed:cases.length,target:{x,y}})
  }
  for (const batterHand of ['right','left']) {
    const base = baseFor(batterHand)
    // Current portrait min/tall and compact landscape surfaces, in CSS pixels.
    const focuses = [[288,360],[340,439],[490,218]].map(([width,height])=>focusFor(base,width,height))
    for (const profile of BASEBALL_PITCH_TYPES) for (const baseSpeed of [80,120,160]) for (const pitcherHandedness of ['right','left']) {
      const speedKmh = getBaseballPitchSpeed(baseSpeed,profile.id)
      for (const value of cases) {
        const pitch = createBaseballPitch({...value,speedKmh,pitchType:profile.id,pitcherHandedness})
        const check = elapsed => {
          const ball = sampleBaseballPitch(pitch,elapsed)
          for (const focus of focuses) {
            const screen = focus.project(ball)
            const radius = screen.scale*BASEBALL_RULES.ballRadiusM
            const v = focus.viewport
            assert.ok(screen.x-radius>=v.left-1e-7 && screen.x+radius<=v.right+1e-7 && screen.y-radius>=v.top-1e-7 && screen.y+radius<=v.bottom+1e-7,
              `공 잘림: ${profile.id}/기준${baseSpeed}/실제${speedKmh}/${pitcherHandedness}투/${batterHand}타/${value.seed}/${elapsed}ms`)
          }
        }
        for (let elapsed=0;elapsed<pitch.flightTimeMs;elapsed+=2) check(elapsed)
        check(pitch.flightTimeMs)
      }
    }
  }
})

test('스윙 전후의 실제 충돌·점수·기록은 확대 생성과 표시로 바뀌지 않는다', () => {
  for (const profile of BASEBALL_PITCH_TYPES) for (const hand of ['right','left']) for (const pitcherHandedness of ['right','left']) {
    const pitch = createBaseballPitch({speedKmh:getBaseballPitchSpeed(120,profile.id),pitchType:profile.id,seed:17,target:{x:0,y:.745},pitcherHandedness})
    for (const x of [0,.30,.42]) {
      const aim = {x:hand==='right'?x:-x,y:.745}
      const request = {swingAtMs:pitch.flightTimeMs-110,aim,handedness:hand}
      const before = judgeBaseballSwing(pitch,request)
      const focus = focusFor(baseFor(hand))
      for (const time of [0,20,80,110,155,210,350]) {
        const bat = sampleBaseballBat({swingElapsedMs:time,aim,handedness:hand})
        for (const key of ['start','end','sweetSpot']) focus.project(bat[key])
      }
      if (before.contacted) focus.project(before.contactPoint)
      assert.deepEqual(judgeBaseballSwing(pitch,request),before)
      const screen = focus.project(aim)
      const recovered = focus.unproject(screen.x,screen.y)
      const afterTouch = judgeBaseballSwing(pitch,{...request,aim:recovered})
      assert.equal(afterTouch.outcome,before.outcome)
      assert.equal(afterTouch.score,before.score)
      if (before.contacted) close(afterTouch.contactAtMs,before.contactAtMs)
    }
  }
})

test('공·배트의 화면 거리와 물리 반지름은 같은 비율로 확대된다', () => {
  const base = baseFor()
  const focus = focusFor(base)
  for (const profile of BASEBALL_PITCH_TYPES) for (const pitcherHandedness of ['right','left']) {
    const pitch = createBaseballPitch({speedKmh:getBaseballPitchSpeed(160,profile.id),pitchType:profile.id,seed:17,target:{x:0,y:.745},pitcherHandedness})
    const result = judgeBaseballSwing(pitch,{swingAtMs:pitch.flightTimeMs-110,aim:pitch.target,handedness:'right'})
    assert.equal(result.contacted,true)
    const bat = sampleBaseballBat({swingElapsedMs:result.swingElapsedMs,aim:pitch.target})
    const points = [result.contactPoint,bat.start,bat.end,bat.sweetSpot]
    for (let i=1;i<points.length;i++) {
      const a = base.project(points[0]), b = base.project(points[i])
      const x = focus.project(points[0]), y = focus.project(points[i])
      close(Math.hypot(x.x-y.x,x.y-y.y),Math.hypot(a.x-b.x,a.y-b.y)*focus.transform.zoom)
    }
    close(focus.project(result.contactPoint).scale*BASEBALL_RULES.ballRadiusM,base.project(result.contactPoint).scale*BASEBALL_RULES.ballRadiusM*focus.transform.zoom)
    close(focus.project(bat.start).scale*bat.radius,base.project(bat.start).scale*bat.radius*focus.transform.zoom)
  }
})

test('구종별 확대 배율을 바꾸지 않고 같은2.0m상단·같은 축을 사용한다', () => {
  assert.equal(BASEBALL_FOCUS_BOUNDS.top,2)
  const base = baseFor()
  const reference = focusFor(base,340,439)
  for (const profile of BASEBALL_PITCH_TYPES) {
    createBaseballPitch({pitchType:profile.id,speedKmh:getBaseballPitchSpeed(80,profile.id),seed:17})
    const focus = focusFor(base,340,439)
    assert.deepEqual(focus.bounds,reference.bounds)
    assert.deepEqual(focus.transform,reference.transform)
    const width = (BASEBALL_RULES.zone.right-BASEBALL_RULES.zone.left)*focus.nearScale
    assert.ok(width>110 && width<125)
  }
})

test('CSS 터치 역변환은 캔버스 backing store의 DPR과 무관하다', () => {
  const focus = focusFor()
  const world = {x:.123,y:.891}
  const screen = focus.project(world)
  const rect = {left:22,top:410,width:focus.width,height:focus.height}
  for (const dpr of [1,1.25,2,3]) {
    const backing = {width:Math.round(focus.width*dpr),height:Math.round(focus.height*dpr)}
    assert.ok(backing.width>0 && backing.height>0)
    const event = {clientX:rect.left+screen.x,clientY:rect.top+screen.y}
    const aim = focus.unproject(event.clientX-rect.left,event.clientY-rect.top)
    close(aim.x,world.x)
    close(aim.y,world.y)
  }
})

test('확대 생성은 원본 카메라와 옵션·world 상태를 변경하지 않는다', () => {
  const base = baseFor('left')
  const world = {x:.13,y:.9,z:2}
  const before = base.project(world)
  const options = {width:288,height:300,padding:16,bounds:{...BASEBALL_FOCUS_BOUNDS}}
  const snapshot = structuredClone(options)
  focusFor(base,340,320).project(world)
  createBaseballFocusProjection(base,options)
  assert.deepEqual(base.project(world),before)
  assert.deepEqual(world,{x:.13,y:.9,z:2})
  assert.deepEqual(options,snapshot)
  assert.ok(Object.isFrozen(BASEBALL_FOCUS_BOUNDS))
})

test('viewport·bounds·기준 투영과 좌표의 잘못된 입력을 엄격히 거부한다', () => {
  const base = baseFor()
  for (const options of [{width:32,height:300},{width:300,height:32},{width:0,height:300},{width:NaN,height:300},
    {width:Infinity,height:300},{width:'288',height:300},{width:288,height:300,padding:-1},{width:288,height:300,padding:null}]) {
    assert.throws(()=>createBaseballFocusProjection(base,options),RangeError)
  }
  for (const bounds of [null,{}, {left:0,right:0,bottom:0,top:1},{left:1,right:0,bottom:0,top:1},
    {left:0,right:1,bottom:1,top:1},{left:0,right:1,bottom:1,top:0},{left:NaN,right:1,bottom:0,top:1}]) {
    assert.throws(()=>createBaseballFocusProjection(base,{width:288,height:300,bounds}),RangeError)
  }
  for (const invalidBase of [null,{}, {project:()=>({x:0,y:0,scale:NaN,ground:0}),unproject:()=>({x:0,y:0})}]) {
    assert.throws(()=>focusFor(invalidBase),TypeError)
  }
  const focus = focusFor()
  assert.throws(()=>focus.toBase(Infinity,0),TypeError)
  assert.throws(()=>focus.fromBase(0,NaN),TypeError)
  assert.throws(()=>focus.unproject(0,NaN),TypeError)
  assert.equal(focus.containsPoint(NaN,100),false)
})
