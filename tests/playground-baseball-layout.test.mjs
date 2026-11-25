import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { BASEBALL_BALLPARK_LANDMARKS, BASEBALL_PITCHER_RELEASE_SPRITE, BASEBALL_BATTER_FIT_OPTIONS, createBaseballStage, createBaseballProjection, createBaseballPitcherPlacement, fitBaseballBatter } from '../lib/playground-baseball-layout.mjs'
import { getBaseballBatterFrames } from '../lib/playground-baseball-animation.mjs'
import { BASEBALL_RULES, createBaseballPitch, sampleBaseballPitch } from '../lib/playground-baseball.mjs'

// Measured alpha>=32 bounds across all eight approved frames, relative to front sole.
const BOUNDS = {
  right: { left: -797, right: 314, top: -1456, bottom: 165 },
  left: { left: -268, right: 803, top: -1455, bottom: 156 },
}
const OFFSET = { right: { x: -140, y: 70 }, left: { x: 180, y: 70 } }
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)

test('배경 타석의 두 대각선 교점과 준비 양발 중앙이 모든 크기에서 일치한다', () => {
  for (const [width, height] of [[1672, 941], [1018, 679], [866, 410], [364, 437], [294, 385], [515, 310], [2000, 680]]) {
    for (const hand of ['right', 'left']) {
      const stage = createBaseballStage(width, height, hand)
      const batter = fitBaseballBatter(stage, BOUNDS[hand])
      close(batter.x + OFFSET[hand].x * batter.scale, stage.stance.x)
      close(batter.y + OFFSET[hand].y * batter.scale, stage.stance.y)
      const [a, b, c, d] = stage.box
      const cross = (u, v) => u.x * v.y - u.y * v.x
      const from = p => ({ x: p.x - stage.stance.x, y: p.y - stage.stance.y })
      close(cross(from(a), from(c)), 0)
      close(cross(from(b), from(d)), 0)
    }
  }
})

test('세로 화면은 선택한 타석을 확보하고 배경과 투구 투영 원점을 함께 이동한다', () => {
  for (const hand of ['right', 'left']) {
    const stage = createBaseballStage(364, 437, hand)
    close(stage.stance.x, 364 * (hand === 'right' ? 0.34 : 0.66))
    close(stage.centerX, stage.background.x + 838 * stage.background.width / 1672)
    assert.ok(hand === 'right' ? stage.centerX > 182 : stage.centerX < 182)
    assert.ok(stage.background.x <= 0 && stage.background.x + stage.background.width >= 364)
    assert.ok(stage.background.y <= 0 && stage.background.y + stage.background.height >= 437)
  }
})

test('넓은 PC·좁은 모바일에서 모든 동작 외곽과 타석 바닥을 보존한다', () => {
  for (const [width, height] of [[1018, 679], [866, 410], [364, 437], [294, 385], [515, 310], [2000, 680]]) {
    for (const hand of ['right', 'left']) {
      const stage = createBaseballStage(width, height, hand)
      const batter = fitBaseballBatter(stage, BOUNDS[hand])
      const bounds = BOUNDS[hand]
      const margin = Math.min(12, width * 0.025)
      assert.ok(batter.x + bounds.left * batter.scale >= margin - 1e-7)
      assert.ok(batter.x + bounds.right * batter.scale <= width - margin + 1e-7)
      assert.ok(batter.y + bounds.top * batter.scale >= margin - 1e-7)
      assert.ok(batter.y + bounds.bottom * batter.scale <= height - margin + 1e-7)
      assert.ok(stage.box.every(point => point.y <= height - margin + 1e-7))
      assert.ok(batter.scale * 1450 > Math.min(200, height * 0.4))
    }
  }
})

test('크기 오류는 거부하고 같은 입력의 배치 계산은 훈련 상태와 무관하다', () => {
  for (const size of [0, -1, NaN, Infinity, '390']) assert.throws(() => createBaseballStage(size, 437), RangeError)
  const before = createBaseballStage(364, 437, 'left')
  fitBaseballBatter(before, BOUNDS.left)
  assert.deepEqual(createBaseballStage(364, 437, 'left'), before)
})

test('배경 카메라 이동은 지면과 공의 전체 투영에 같은 양으로 반영된다', () => {
  for (const [width, height] of [[1018, 679], [2000, 680], [3000, 680]]) {
    const stage = createBaseballStage(width, height)
    const projection = createBaseballProjection(stage)
    const shifted = createBaseballProjection({ ...stage, background: { ...stage.background, x: stage.background.x + 23, y: stage.background.y - 37 } })
    for (const z of [0, BASEBALL_RULES.plateMiddleZ, BASEBALL_RULES.plateEndZ, BASEBALL_RULES.releaseDistanceM]) {
      const before = projection.project({ x: -0.17, y: 0.8, z })
      const after = shifted.project({ x: -0.17, y: 0.8, z })
      close(after.x - before.x, 23)
      close(after.y - before.y, -37)
      close(after.ground - before.ground, -37)
      close(after.scale, before.scale)
    }
  }
})

test('좌우 카메라와 크기가 달라도 존 위의 표시 위치와 마우스 역투영은 일치한다', () => {
  for (const [width, height] of [[1018, 679], [364, 437], [279, 383], [2000, 680], [3000, 680]]) {
    for (const hand of ['right', 'left']) {
      const projection = createBaseballProjection(createBaseballStage(width, height, hand))
      for (const point of [{ x: -.2359, y: .48672 }, { x: .2359, y: 1.0035 }, { x: .013, y: .793 }]) {
        const screen = projection.project(point)
        const aim = projection.unproject(screen.x, screen.y)
        close(aim.x, point.x)
        close(aim.y, point.y)
      }
    }
  }
})

test('PC의 최대 2.8 화면비는 초광폭에서도 마운드의 투수와 타석 바닥을 함께 보존한다', () => {
  for (const [width, minimumHeight] of [[2156, 680], [3000, 680], [4700, 680], [513, 380], [2700, 380]]) {
    const height = Math.max(minimumHeight, width / 2.8)
    for (const hand of ['right', 'left']) {
      const stage = createBaseballStage(width, height, hand)
      const projection = createBaseballProjection(stage)
      const pitcher = createBaseballPitcherPlacement(projection)
      assert.ok(pitcher.y > 12)
      assert.ok(projection.project({ x: 0, y: BASEBALL_RULES.zone.top }).y >= 12)
      assert.ok(stage.box.every(point => point.y <= height - 12 + 1e-7))
      const batter = fitBaseballBatter(stage, BOUNDS[hand])
      assert.ok(batter.y + BOUNDS[hand].bottom * batter.scale <= height - 12 + 1e-7)
    }
  }
})

test('홈플레이트 앞면·끝면·마운드의 지면은 실제 사진 기준점에 일치한다', () => {
  for (const [width, height] of [[1672,941], [1018,679], [364,437], [294,385], [2000,715]]) {
    for (const hand of ['right','left']) {
      const stage = createBaseballStage(width,height,hand)
      const projection = createBaseballProjection(stage)
      for (const [name,z] of [['plateFront',0],['plateBack',BASEBALL_RULES.plateEndZ],['mound',BASEBALL_RULES.releaseDistanceM]]) {
        const actual = projection.project({x:0,y:0,z})
        close(actual.x,stage.landmarks[name].x)
        close(actual.y,stage.landmarks[name].y)
      }
      assert.ok(projection.depth > 3.19 && projection.depth < 3.20)
      const middle = projection.project({x:0,y:0,z:BASEBALL_RULES.plateMiddleZ})
      assert.ok(middle.y > stage.landmarks.plateFront.y && middle.y < stage.landmarks.plateBack.y)
    }
  }
})

test('17인치 앞변의 좌우 끝은 사진의 실제 흰색 플레이트 폭과 일치한다', () => {
  for (const [width,height] of [[1672,941],[364,437],[1018,679],[2000,715]]) {
    for (const hand of ['right','left']) {
      const stage = createBaseballStage(width,height,hand)
      const projection = createBaseballProjection(stage)
      const left = projection.project({x:-0.2159,y:0,z:0})
      const right = projection.project({x:0.2159,y:0,z:0})
      close(left.x,stage.landmarks.plateFrontLeft.x)
      close(right.x,stage.landmarks.plateFrontRight.x)
      close(left.y,stage.landmarks.plateFront.y)
      close(right.x-left.x,130*stage.sourceScale)
    }
  }
})

test('모바일 존만 임의로 확대하지 않고 공·배트와 같은 사진 배율을 사용한다', () => {
  const stage = createBaseballStage(364,437)
  const projection = createBaseballProjection(stage)
  const a = projection.project({x:BASEBALL_RULES.zone.left,y:BASEBALL_RULES.zone.top})
  const b = projection.project({x:BASEBALL_RULES.zone.right,y:BASEBALL_RULES.zone.bottom})
  close(b.x-a.x,BASEBALL_RULES.zone.right*2*130*stage.sourceScale/0.4318)
  assert.ok(b.x-a.x < 100)
  assert.ok(projection.nearScale < 260)
})

test('투수 손은 실제 공의 릴리스 XY와 일치하고 앞발 Y는 마운드에 닿는다', () => {
  for (const [width,height] of [[1672,941],[1018,679],[364,437],[294,385],[2000,715]]) {
    for (const hand of ['right','left']) {
      const projection = createBaseballProjection(createBaseballStage(width,height,hand))
      const pitch = createBaseballPitch({speedKmh:120,seed:71})
      const pitcher = createBaseballPitcherPlacement(projection,{release:pitch.release})
      const firstBall = projection.project(sampleBaseballPitch(pitch,0))
      close(pitcher.handPoint.x,firstBall.x)
      close(pitcher.handPoint.y,firstBall.y)
      close(pitcher.footPoint.y,pitcher.moundPoint.ground)
      close(pitcher.width/pitcher.source.cellWidth,pitcher.height/pitcher.source.cellHeight)
      close(pitcher.centerX-pitcher.width/2,pitcher.x)
      close(pitcher.floorY-pitcher.height*.985,pitcher.y)
      assert.ok(Math.abs(pitcher.footPoint.x-pitcher.moundPoint.x) < firstBall.scale*.1)
    }
  }
})

test('투수 셀의 원본 좌표와 사용자 입력은 배치 계산 중 변경하지 않는다', () => {
  const stage = createBaseballStage(364,437,'left')
  const beforeStage = structuredClone(stage)
  const geometry = {cellWidth:443.5,cellHeight:443.5,hand:{x:180,y:80},foot:{x:265,y:430},release:{x:-.34,y:1.8,z:16.5}}
  const beforeGeometry = structuredClone(geometry)
  createBaseballPitcherPlacement(createBaseballProjection(stage),geometry)
  assert.deepEqual(stage,beforeStage)
  assert.deepEqual(geometry,beforeGeometry)
  assert.equal(BASEBALL_PITCHER_RELEASE_SPRITE.frame,4)
  assert.ok(Object.isFrozen(BASEBALL_PITCHER_RELEASE_SPRITE.hand))
  assert.ok(Object.isFrozen(BASEBALL_BALLPARK_LANDMARKS.plateFront))
})

test('연속 투구의 도착 위치와 실제 타격 평면 조준 위치가 모든 구속에서 일치한다', () => {
  for (const hand of ['right','left']) {
    const projection = createBaseballProjection(createBaseballStage(364,437,hand))
    for (const speedKmh of [80,120,160]) {
      for (const seed of [1,77,143]) {
        const pitch = createBaseballPitch({speedKmh,seed})
        const arrival = projection.project(sampleBaseballPitch(pitch,pitch.flightTimeMs))
        const target = projection.project({...pitch.target,z:0})
        close(arrival.x,target.x)
        close(arrival.y,target.y)
        const aim = projection.unproject(arrival.x,arrival.y)
        close(aim.x,pitch.target.x)
        close(aim.y,pitch.target.y)
      }
    }
  }
})

test('지면은 플레이트 뒤에서도 연속이며 카메라 평면 가까이에서 무한대가 되지 않는다', () => {
  const projection = createBaseballProjection(createBaseballStage(1018,679))
  const distances = [16.5,1,0,-.2159,-.4318,-1.1,-1.4]
  const points = distances.map(z=>projection.project({x:.1,y:.5,z}))
  for (let i=1;i<points.length;i++) {
    assert.ok(points[i].ground>points[i-1].ground)
    assert.ok(points[i].scale>points[i-1].scale)
  }
  const nearCamera = projection.project({x:.1,y:.5,z:-projection.depth})
  assert.ok(Object.values(nearCamera).every(Number.isFinite))
})

test('프로젝션과 투수 좌표의 잘못된 입력을 거부한다', () => {
  assert.throws(()=>createBaseballProjection(null),TypeError)
  const projection = createBaseballProjection(createBaseballStage(364,437))
  for (const point of [{x:NaN,y:0},{x:0,y:Infinity},{x:0,y:0,z:NaN}]) assert.throws(()=>projection.project(point),TypeError)
  assert.throws(()=>projection.unproject(Infinity,0),TypeError)
  assert.throws(()=>createBaseballPitcherPlacement(null),TypeError)
  for (const options of [{cellWidth:0},{hand:{x:180,y:430}},{foot:{x:900,y:430}},{release:{x:0,y:0,z:16.5}}]) {
    assert.throws(()=>createBaseballPitcherPlacement(projection,options),RangeError)
  }
})

// Reviewed original alpha>=32 bounds and byte hashes. New candidates must not overwrite these originals.
const ORIGINAL_POSE_GEOMETRY = {
  "right": {
    "ready": {
      "src": "/images/playground/baseball/poses/20261123/batter-ready-right-angle-v4.png",
      "sha256": "b0836c9aa269abf05b08d5810ea0ba7e0c83a500e2101d55525383d94fa7235a",
      "bounds": {
        "left": 190,
        "right": 693,
        "top": 13,
        "bottom": 1525
      }
    },
    "load": {
      "src": "/images/playground/baseball/motion/20261123-v5/right-load-v5.png",
      "sha256": "c147b29ebb91bc3694021b7d3d7a44c8e65e690bd59bf6f64cd6f5c529fad680",
      "bounds": {
        "left": 123,
        "right": 703,
        "top": 35,
        "bottom": 1520
      }
    },
    "plant": {
      "src": "/images/playground/baseball/motion/20261123-v5/right-plant-v5.png",
      "sha256": "a9b311cfdb8bfafad108360718f9df8ee251fb9dad4f6aba5fc6bd025a4b3662",
      "bounds": {
        "left": 98,
        "right": 968,
        "top": 101,
        "bottom": 1489
      }
    },
    "precontact": {
      "src": "/images/playground/baseball/motion/20261123-v5/right-precontact-v5.png",
      "sha256": "97aa5c3f9c56570a4e39651a6680f5923140e7d32ece65a3bde95673f8fbf1d3",
      "bounds": {
        "left": 70,
        "right": 967,
        "top": 74,
        "bottom": 1504
      }
    },
    "contact": {
      "src": "/images/playground/baseball/motion/20261123-v5/right-contact-v5.png",
      "sha256": "43ac89171d0b66fe6cd5cfdb4004fcf68b6435e5e05c7069d5cf9a33e310d31b",
      "bounds": {
        "left": 31,
        "right": 1014,
        "top": 168,
        "bottom": 1477
      }
    },
    "follow": {
      "src": "/images/playground/baseball/poses/20261123/batter-follow-right-angle-v4.png",
      "sha256": "d4f6d26930cd901ba0268f524b3fd9baf75ce000242d85f4a4a8fcafb50a37d8",
      "bounds": {
        "left": 23,
        "right": 941,
        "top": 14,
        "bottom": 1518
      }
    },
    "recovery": {
      "src": "/images/playground/baseball/motion/20261123-v5/right-recovery-v5.png",
      "sha256": "8f55f6a8a4d131ff852bcef832f6a3f87a767a5c419aab0c7ec6424cc28c4ec3",
      "bounds": {
        "left": 160,
        "right": 747,
        "top": 79,
        "bottom": 1513
      }
    },
    "reset": {
      "src": "/images/playground/baseball/motion/20261123-v5/right-reset-v5.png",
      "sha256": "f3cbe1b40c3535e2d0301c4c3827fb13b926d5705fbf0e69bb521582f90f7834",
      "bounds": {
        "left": 146,
        "right": 694,
        "top": 73,
        "bottom": 1522
      }
    }
  },
  "left": {
    "ready": {
      "src": "/images/playground/baseball/poses/20261123/batter-ready-left-angle-v4.png",
      "sha256": "d4b1a334c6295e429866a1d2ec8199f4595ad53ef8c5c623171a5c0d7ab6493a",
      "bounds": {
        "left": 234,
        "right": 849,
        "top": 19,
        "bottom": 1521
      }
    },
    "load": {
      "src": "/images/playground/baseball/motion/20261123-v5/left-load-v5.png",
      "sha256": "f8e649eb626a6102baa55ac545b71edf7250ace85730f95a1cfc6a7ad76f583d",
      "bounds": {
        "left": 243,
        "right": 888,
        "top": 31,
        "bottom": 1520
      }
    },
    "plant": {
      "src": "/images/playground/baseball/motion/20261123-v5/left-plant-v5.png",
      "sha256": "4ab4c97823cc42090bb17b15808426e11d0cd9e975b65d1f8f58acb256b88306",
      "bounds": {
        "left": 56,
        "right": 943,
        "top": 111,
        "bottom": 1502
      }
    },
    "precontact": {
      "src": "/images/playground/baseball/motion/20261123-v5/left-precontact-v5.png",
      "sha256": "dba612e4636516e1f7968dc1e64ab730b5ddd9ec9e24392043ee8573406e5aae",
      "bounds": {
        "left": 40,
        "right": 963,
        "top": 111,
        "bottom": 1480
      }
    },
    "contact": {
      "src": "/images/playground/baseball/motion/20261123-v5/left-contact-v5.png",
      "sha256": "3d5265ae65782e4c9cb23c57da2f6a10fc395e93736521f0c78044d5088932bf",
      "bounds": {
        "left": 17,
        "right": 978,
        "top": 153,
        "bottom": 1467
      }
    },
    "follow": {
      "src": "/images/playground/baseball/poses/20261123/batter-follow-left-angle-v4.png",
      "sha256": "7f9fcf68c58f4577156b4e5ac6a235acd463f61ebed5362359b2d1da1bae838b",
      "bounds": {
        "left": 64,
        "right": 1001,
        "top": 15,
        "bottom": 1520
      }
    },
    "recovery": {
      "src": "/images/playground/baseball/motion/20261123-v5/left-recovery-v5.png",
      "sha256": "64cb391ba98fcc94fa1dbe39f46b1807b8386b5a0e318b0bc10f7079b6716d13",
      "bounds": {
        "left": 128,
        "right": 859,
        "top": 98,
        "bottom": 1513
      }
    },
    "reset": {
      "src": "/images/playground/baseball/motion/20261123-v5/left-reset-v5.png",
      "sha256": "d0078d648f8af4976f2d32b2f86e3bf2bf735f0f4878768b477f7b670ab6016b",
      "bounds": {
        "left": 189,
        "right": 890,
        "top": 63,
        "bottom": 1520
      }
    }
  }
}

// Decoded alpha>=32 snapshots of the six active lower-body edits.
// Byte hashes bind these geometry fixtures to their actual PNGs.
const ACTIVE_POSE_GEOMETRY = {
  right: { ...ORIGINAL_POSE_GEOMETRY.right, ...{
  "plant": {
    "src": "/images/playground/baseball/motion/20261123-v6-foot-candidates/right-plant-v6.png",
    "sha256": "9cf8b04dc7d639e3b37d00d96d0c3de3f88f16817fdb20a7aae564dbafd48976",
    "bounds": {
      "left": 101,
      "right": 791,
      "top": 100,
      "bottom": 1487
    }
  },
  "precontact": {
    "src": "/images/playground/baseball/motion/20261123-v6-foot-candidates/right-precontact-v6.png",
    "sha256": "a6202e1cf986377f3cad11e80480b2b659f9fcbc1ff6dd6dd81db35e0f7cdbbf",
    "bounds": {
      "left": 171,
      "right": 865,
      "top": 73,
      "bottom": 1504
    }
  },
  "follow": {
    "src": "/images/playground/baseball/motion/20261123-v6-foot-candidates/right-follow-v6.png",
    "sha256": "8e9ce946061e9b011c9ad3805469997b6056ab328189ed8554c6b6b21b0e31ab",
    "bounds": {
      "left": 22,
      "right": 783,
      "top": 15,
      "bottom": 1509
    }
  }
} },
  left: { ...ORIGINAL_POSE_GEOMETRY.left, ...{
  "plant": {
    "src": "/images/playground/baseball/motion/20261123-v6-foot-candidates/left-plant-v6.png",
    "sha256": "31ceaa09227fc67c776479d11a4409ef935ff96e0c0f3c1e74d84a2d245ddefb",
    "bounds": {
      "left": 164,
      "right": 933,
      "top": 111,
      "bottom": 1490
    }
  },
  "precontact": {
    "src": "/images/playground/baseball/motion/20261123-v6-foot-candidates/left-precontact-v6.png",
    "sha256": "87c39897e26f3d48fd153d79353179d205ae2515d830cbcca88cc9e91f2d746a",
    "bounds": {
      "left": 163,
      "right": 855,
      "top": 111,
      "bottom": 1464
    }
  },
  "follow": {
    "src": "/images/playground/baseball/motion/20261123-v6-foot-candidates/left-follow-v6.png",
    "sha256": "d99f98dd072d20b3535ba67d034b5ef0e301ca5c2373a722254d24a82cd902b9",
    "bounds": {
      "left": 151,
      "right": 1001,
      "top": 14,
      "bottom": 1512
    }
  }
} },
}

function supportRegisteredBounds(hand) {
  const union = { left:Infinity, right:-Infinity, top:Infinity, bottom:-Infinity }
  const frames = getBaseballBatterFrames(hand)
  for (const [name, original] of Object.entries(ACTIVE_POSE_GEOMETRY[hand])) {
    const anchor = frames[name].registrationAnchor
    union.left = Math.min(union.left, original.bounds.left - anchor.x)
    union.right = Math.max(union.right, original.bounds.right - anchor.x)
    union.top = Math.min(union.top, original.bounds.top - anchor.y)
    union.bottom = Math.max(union.bottom, original.bounds.bottom - anchor.y)
  }
  return union
}

test('양발 등록은 현재16자세의 실제 외곽에 하나의 배율과0.42 사진 상대 상한을 적용한다', () => {
  assert.ok(Object.isFrozen(BASEBALL_BATTER_FIT_OPTIONS))
  assert.ok(Object.isFrozen(BASEBALL_BATTER_FIT_OPTIONS.anchorOffset))
  for (const hand of ['right','left']) {
    const bounds = supportRegisteredBounds(hand)
    for (const [width,height] of [[1672,941],[864,408],[1280,720],[349,560],[349,437],[349,234],[287,258],[2000,715],[3000,1072]]) {
      const stage = createBaseballStage(width,height,hand)
      const before = structuredClone(stage)
      const plan = fitBaseballBatter(stage,bounds,BASEBALL_BATTER_FIT_OPTIONS)
      const margin = Math.min(12,width*.025)
      assert.ok(plan.scale > 0 && plan.scale <= stage.sourceScale*.42 + 1e-9)
      close(plan.x,stage.stance.x)
      close(plan.y,stage.stance.y)
      for (const [name,original] of Object.entries(ACTIVE_POSE_GEOMETRY[hand])) {
        const anchor = getBaseballBatterFrames(hand)[name].registrationAnchor
        assert.ok(plan.x + (original.bounds.left-anchor.x)*plan.scale >= margin-1e-7)
        assert.ok(plan.x + (original.bounds.right-anchor.x)*plan.scale <= width-margin+1e-7)
        assert.ok(plan.y + (original.bounds.top-anchor.y)*plan.scale >= margin-1e-7)
        assert.ok(plan.y + (original.bounds.bottom-anchor.y)*plan.scale <= height-margin+1e-7)
      }
      // Fitting the actor is presentation only: it cannot move the ball camera.
      assert.deepEqual(stage,before)
      assert.deepEqual(createBaseballProjection(stage).project({x:.13,y:.72,z:0}),createBaseballProjection(before).project({x:.13,y:.72,z:0}))
    }
  }
})

test('준비 양발 지지 중앙은 타석 중앙에 놓이고 이전 앞발 등록 비교도 유지된다', () => {
  const expected = { right:{x:441.5,y:1431.5}, left:{x:518.5,y:1430.5} }
  for (const hand of ['right','left']) {
    const frame = getBaseballBatterFrames(hand).ready
    assert.deepEqual(frame.registrationAnchor,expected[hand])
    for (const [w,h] of [[864,408],[349,560],[349,234]]) {
      const stage = createBaseballStage(w,h,hand)
      const plan = fitBaseballBatter(stage,supportRegisteredBounds(hand),BASEBALL_BATTER_FIT_OPTIONS)
      close(plan.x+(expected[hand].x-frame.registrationAnchor.x)*plan.scale,stage.stance.x)
      close(plan.y+(expected[hand].y-frame.registrationAnchor.y)*plan.scale,stage.stance.y)
      assert.deepEqual(fitBaseballBatter(stage,BOUNDS[hand]),fitBaseballBatter(stage,BOUNDS[hand],{}))
    }
  }
})

test('타석 내부 검수 영역은 원래 흰 선과 별도이며 사진 카메라를 그대로 따른다', () => {
  const edgeDistance = (a,b,p) => ((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))/Math.hypot(b.x-a.x,b.y-a.y)
  for (const hand of ['right','left']) for (const [w,h] of [[1672,941],[349,560],[864,408]]) {
    const stage = createBaseballStage(w,h,hand)
    const source = createBaseballStage(1672,941,hand)
    assert.equal(stage.boxInterior.length,4)
    stage.boxInterior.forEach((p,index) => {
      close(p.x,stage.background.x+source.boxInterior[index].x*stage.sourceScale)
      close(p.y,stage.background.y+source.boxInterior[index].y*stage.sourceScale)
      stage.box.forEach((a,e)=>assert.ok(edgeDistance(a,stage.box[(e+1)%4],p)>0))
    })
    // Interior membership of every shoe is deliberately not claimed here.
    // It is a separately measured visual audit, including raised-heel cases.
  }
})

test('발 배치 후보는 승인한16개 원본 PNG를 덮어쓰지 않는다', () => {
  for (const frames of Object.values(ORIGINAL_POSE_GEOMETRY)) for (const frame of Object.values(frames)) {
    const original = readFileSync(new URL(`../public${frame.src}`,import.meta.url))
    assert.equal(createHash('sha256').update(original).digest('hex'),frame.sha256)
  }
})

test('활성 자세의 외곽 스냅샷은 실제 적용한 PNG와 일치한다', () => {
  for (const hand of ['right','left']) {
    const frames = getBaseballBatterFrames(hand)
    for (const [name,frame] of Object.entries(ACTIVE_POSE_GEOMETRY[hand])) {
      assert.equal(frames[name].src,frame.src)
      const active = readFileSync(new URL(`../public${frame.src}`,import.meta.url))
      assert.equal(createHash('sha256').update(active).digest('hex'),frame.sha256)
    }
  }
})

test('배치 옵션은 유한 등록점과 양의 사진 배율만 허용하고 입력을 변경하지 않는다', () => {
  const stage = createBaseballStage(864,408)
  const bounds = supportRegisteredBounds('right')
  for (const options of [null,[],1,'x',{anchorOffset:null},{anchorOffset:{x:NaN,y:0}},{anchorOffset:{x:0,y:Infinity}}]) {
    assert.throws(()=>fitBaseballBatter(stage,bounds,options),TypeError)
  }
  for (const maxSourceScale of [0,-.1,NaN,Infinity,'0.42',null]) {
    assert.throws(()=>fitBaseballBatter(stage,bounds,{maxSourceScale}),RangeError)
  }
  for (const invalid of [null,{left:0,right:0,top:0,bottom:1},{left:NaN,right:1,top:0,bottom:1}]) {
    assert.throws(()=>fitBaseballBatter(stage,invalid),RangeError)
  }
  const options = {anchorOffset:{x:7,y:-3},maxSourceScale:.37}
  const before = structuredClone({stage,bounds,options})
  const plan = fitBaseballBatter(stage,bounds,options)
  close(plan.x+7*plan.scale,stage.stance.x)
  close(plan.y-3*plan.scale,stage.stance.y)
  assert.ok(plan.scale<=stage.sourceScale*.37+1e-9)
  assert.deepEqual({stage,bounds,options},before)
})
