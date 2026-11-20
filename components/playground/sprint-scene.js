import { useEffect, useRef } from 'react'
import { getSprintPose } from '@/lib/playground-sprint-pose.mjs'
import { getSprintSpriteFrame, getSprintSpriteRect, SPRINT_SPRITES } from '@/lib/playground-sprint-sprites.mjs'
import { getSprintRunSample, getSprintRunRect, SPRINT_RUN_SPRITES } from '@/lib/playground-sprint-motion.mjs'
import { getSprintTrackFrame, getSprintTrackMarkers, SPRINT_TRACK } from '@/lib/playground-sprint-track.mjs'
import { getSprintRivals, getSprintRivalLane } from '@/lib/playground-sprint-rivals.mjs'
import { getSprintBossState, withSprintBossPresentation } from '@/lib/playground-sprint-boss.mjs'
import { getSprintBossSample, drawSprintBossSprite, drawSprintBossFallback, SPRINT_BOSS_CHARACTER_SIZE } from '@/lib/playground-sprint-boss-sprites.mjs'
import { getSprintReactionSample, drawSprintReactionSprite, drawSprintDefeatFallback, splitSprintRivalLayers, getSprintRivalOpacity } from '@/lib/playground-sprint-reactions.mjs'
import { getSprintFinishReaction } from '@/lib/playground-sprint-finish-reaction.mjs'
import { getSprintSceneFamilyKey, loadSprintSceneFamily, selectSprintSceneFamily } from '@/lib/playground-sprint-scene-assets.mjs'
import { getSprintStartSpriteSample, drawSprintStartSprite } from '@/lib/playground-sprint-start-sprites.mjs'
import { getSprintViewportCamera } from '@/lib/playground-sprint-viewport.mjs'

const WIDTH = SPRINT_TRACK.WIDTH
const HEIGHT = SPRINT_TRACK.HEIGHT
const palette = ['#ead6b6', '#7eabb6', '#dae5dd', '#486676', '#d79a71', '#c8cf9e']

function rect(ctx, x, y, width, height, color) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, width, height)
}

function line(ctx, points, color, width = 1) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  points.slice(1).forEach(point => ctx.lineTo(point[0], point[1]))
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function ellipse(ctx, x, y, rx, ry, color) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function label(ctx, text, x, y, size, color, align = 'left', font = 'sans-serif') {
  ctx.font = `600 ${size}px ${font}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(text, x, y)
}

function assetNotice(ctx, canvas, fit, text, centered = false) {
  const box = canvas.getBoundingClientRect()
  const scale = Math.max(box.width / WIDTH, fit === 'cover' ? box.height / HEIGHT : 0) || 1
  const visibleWidth = Math.min(WIDTH, box.width / scale || WIDTH)
  const visibleHeight = Math.min(HEIGHT, box.height / scale || HEIGHT)
  const available = Math.max(100, visibleWidth - 24 / scale)
  const font = Math.min((centered ? 18 : 14) / scale, available / (text.length * .57))
  const width = Math.min(available, text.length * font * .57 + 24 / scale)
  const storedCropTop = Number(canvas.dataset.viewportCropTop)
  const cropTop = canvas.dataset.viewportCropTop !== undefined && Number.isFinite(storedCropTop) ? storedCropTop : (HEIGHT - visibleHeight) / 2
  const y = centered ? cropTop + visibleHeight / 2 : cropTop + visibleHeight - 26 / scale
  if (!centered) rect(ctx, (WIDTH - width) / 2, y - 16 / scale, width, 32 / scale, 'rgba(10,30,25,.9)')
  label(ctx, text, WIDTH / 2, y + font * .33, font, '#f5f4e9', 'center')
}

function coverImage(ctx, image) {
  if (!image?.naturalWidth) return
  const scale = Math.max(WIDTH / image.naturalWidth, HEIGHT / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  ctx.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height)
}

function stadiumBackdrop(ctx, top) {
  const sky = ctx.createLinearGradient(0, 0, 0, 250)
  sky.addColorStop(0, '#8eb5be')
  sky.addColorStop(1, '#e9e8db')
  rect(ctx, 0, 0, WIDTH, HEIGHT, sky)
  if (top) {
    rect(ctx, 0, 0, WIDTH, HEIGHT, '#486e53')
    for (let i = 0; i < 19; i += 1) rect(ctx, i * 56, 0, 28, HEIGHT, '#527a58')
  }
  const standY = top ? 14 : 100
  rect(ctx, 0, standY - 9, WIDTH, 121, '#3a5155')
  for (let row = 0; row < 8; row += 1) {
    rect(ctx, 0, standY + row * 12, WIDTH, 2, '#93a5a0')
    for (let col = 0; col < 91; col += 1) {
      const x = col * 11 + (row % 2) * 4
      const tone = palette[(col * 7 + row * 11) % palette.length]
      ellipse(ctx, x, standY + row * 12 + 6, 2.2, 2.8, tone)
    }
  }
  line(ctx, [[0, standY - 12], [WIDTH, standY - 12]], '#cdd5cb', 9)
  line(ctx, [[0, standY - 19], [WIDTH, standY - 19]], '#293f45', 4)
  if (!top) {
    for (const x of [67, 895]) {
      line(ctx, [[x, 141], [x, 36]], '#53656a', 5)
      rect(ctx, x - 19, 23, 38, 21, '#c1ccca')
      for (let i = 0; i < 4; i += 1) ellipse(ctx, x - 13 + i * 9, 33, 3, 4, '#fff8dd')
    }
    rect(ctx, 0, 215, WIDTH, 30, '#436949')
    rect(ctx, 0, 240, WIDTH, 5, '#b5bca3')
  } else {
    rect(ctx, 0, 436, WIDTH, 64, '#446b4f')
    for (let i = 0; i < 24; i += 1) rect(ctx, i * 44, 436, 22, 64, '#4b7455')
    line(ctx, [[0, 453], [WIDTH, 453]], '#c8d0a0', 2)
  }
}

function realisticTrack(ctx, top, image) {
  if (image?.naturalWidth) coverImage(ctx, image)
  else stadiumBackdrop(ctx, top)
  const { top: y, laneHeight, lanes, activeLane, runnerY } = getSprintTrackFrame(0, top ? 'top' : 'side')
  const gradient = ctx.createLinearGradient(0, y, 0, HEIGHT)
  gradient.addColorStop(0, '#a06450')
  gradient.addColorStop(1, '#89503e')
  rect(ctx, 0, y, WIDTH, lanes * laneHeight, gradient)
  if (!top) rect(ctx, 0, y + lanes * laneHeight, WIDTH, HEIGHT - y - lanes * laneHeight, '#774a39')
  rect(ctx, 0, y + activeLane * laneHeight, WIDTH, laneHeight, 'rgba(255,222,166,.075)')
  for (let lane = 0; lane <= lanes; lane += 1) {
    line(ctx, [[0, y + lane * laneHeight], [WIDTH, y + lane * laneHeight]], 'rgba(255,247,222,.85)', 1.8)
  }
  return runnerY
}

// Moving distance marks and rubber grains share the world camera. The stadium
// stays behind them, while foot placement uses the same lane center in both arts.
function trackMarks(ctx, frame, distance, view, pixel, texture) {
  const scale = pixel ? .25 : 1
  const y = frame.top * scale
  const laneHeight = frame.laneHeight * scale
  const height = frame.lanes * laneHeight
  const start = frame.startX * scale
  const finish = frame.finishX * scale
  const width = WIDTH * scale
  ctx.save()
  if (texture) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, y + 1, width, height - 2)
    ctx.clip()
    const offset = -(frame.cameraX * scale % texture.width)
    for (let x = offset; x < width; x += texture.width) ctx.drawImage(texture, x, y)
    ctx.restore()
  }
  const paint = pixel ? '#ead6ac' : 'rgba(255,247,222,.88)'
  for (let lane = 0; lane < frame.lanes; lane += 1) {
    if (start > -10 && start < width + 50) label(ctx, String(lane + 1), start - 55 * scale, y + (lane + .7) * laneHeight, pixel ? 5 : 17, paint, 'center', pixel ? 'monospace' : 'sans-serif')
  }
  if (start >= -5 && start <= width + 5) rect(ctx, start - scale, y, Math.max(1, 2 * scale), height, paint)
  if (finish >= -30 && finish <= width + 5) {
    rect(ctx, finish - 2 * scale, y, Math.max(1, 4 * scale), height, pixel ? '#fff1ce' : '#fff6df')
    const square = pixel ? 2 : 7
    for (let row = 0; row < Math.ceil(height / square); row += 1) {
      for (let col = 0; col < 2; col += 1) rect(ctx, finish + 12 * scale + col * square, y + row * square, square, Math.min(square, height - row * square), (row + col) % 2 ? '#34443a' : '#f3e5bc')
    }
  }
  for (const marker of getSprintTrackMarkers(distance, view)) {
    const x = marker.x * scale
    rect(ctx, x, y - (marker.major ? 8 : 4) * scale, Math.max(scale, pixel ? 1 : 1.3), (marker.major ? 7 : 3) * scale, paint)
    if (marker.major) label(ctx, `${marker.meter}m`, x, y - 14 * scale, pixel ? 4 : 11, paint, 'center', pixel ? 'monospace' : 'sans-serif')
  }
  ctx.restore()
}

function trackTexture(pixel, height) {
  const surface = document.createElement('canvas')
  surface.width = pixel ? 64 : 256
  surface.height = height
  const ctx = surface.getContext('2d')
  if (!ctx) return null
  for (let i = 0; i < (pixel ? 90 : 650); i += 1) {
    const x = (i * 73 + 19) % surface.width
    const y = (i * 31 + 7) % height
    rect(ctx, x, y, pixel ? 1 : 1.5, pixel ? 1 : .7, i % 3 ? 'rgba(251,220,194,.13)' : 'rgba(64,30,23,.16)')
  }
  return surface
}

function capsule(ctx, from, to, width, color) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  line(ctx, [from, to], color, width)
}

function muscle(ctx, from, to, startWidth, endWidth, far = false) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy) || 1
  const nx = dy / length
  const ny = -dx / length
  const gradient = ctx.createLinearGradient(from[0] - nx * startWidth / 2, from[1] - ny * startWidth / 2, from[0] + nx * startWidth / 2, from[1] + ny * startWidth / 2)
  gradient.addColorStop(0, far ? '#77513e' : '#976449')
  gradient.addColorStop(.42, far ? '#ad7956' : '#d7a279')
  gradient.addColorStop(1, far ? '#996347' : '#b7825c')
  ctx.beginPath()
  ctx.moveTo(from[0] - nx * startWidth / 2, from[1] - ny * startWidth / 2)
  ctx.quadraticCurveTo((from[0] + to[0]) / 2 - nx * startWidth / 2, (from[1] + to[1]) / 2 - ny * startWidth / 2, to[0] - nx * endWidth / 2, to[1] - ny * endWidth / 2)
  ctx.quadraticCurveTo(to[0] + dx / length * endWidth / 2, to[1] + dy / length * endWidth / 2, to[0] + nx * endWidth / 2, to[1] + ny * endWidth / 2)
  ctx.quadraticCurveTo((from[0] + to[0]) / 2 + nx * startWidth / 2, (from[1] + to[1]) / 2 + ny * startWidth / 2, from[0] + nx * startWidth / 2, from[1] + ny * startWidth / 2)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()
  ellipse(ctx, from[0], from[1], startWidth / 2, startWidth / 2, gradient)
}

function shoe(ctx, leg, far) {
  ctx.save()
  ctx.translate(...leg.ankle)
  ctx.rotate(leg.footAngle)
  ctx.beginPath()
  ctx.moveTo(-5, -3)
  ctx.quadraticCurveTo(-1, -5, 4, -1)
  ctx.lineTo(10, 0)
  ctx.quadraticCurveTo(12, 1, 11, 3)
  ctx.lineTo(-5, 3)
  ctx.closePath()
  ctx.fillStyle = far ? '#b1b898' : '#e3e9c6'
  ctx.fill()
  line(ctx, [[-5, 3], [11, 3]], far ? '#466052' : '#f6f6dc', 1.8)
  line(ctx, [[0, -2], [4, -1], [1, 1]], '#557b68', 1)
  ctx.restore()
}

function humanLeg(ctx, leg, far) {
  muscle(ctx, leg.hip, leg.knee, 12, 8, far)
  muscle(ctx, leg.knee, leg.ankle, 8, 4.5, far)
  ellipse(ctx, leg.knee[0], leg.knee[1], 3.7, 3.5, far ? '#a37252' : '#c28c64')
  capsule(ctx, [leg.ankle[0], leg.ankle[1] - 5], leg.ankle, 5, far ? '#c0c9ad' : '#e7ead0')
  shoe(ctx, leg, far)
}

function humanArm(ctx, arm, far) {
  muscle(ctx, arm.shoulder, arm.elbow, 8, 5.5, far)
  muscle(ctx, arm.elbow, arm.wrist, 5.5, 3.5, far)
  ellipse(ctx, arm.wrist[0] + 1, arm.wrist[1] + .5, 3.3, 4, far ? '#aa7753' : '#cd9971')
}

function sideRunner(ctx, x, y, race, celebration) {
  const pose = getSprintPose(race, celebration)
  const b = pose.bob
  ctx.save()
  ctx.translate(x, y)
  ellipse(ctx, -1, 5, 28, 4, 'rgba(27,31,23,.22)')
  ctx.translate(0, -pose.jump)
  humanArm(ctx, pose.arms.far, true)
  humanLeg(ctx, pose.legs.far, true)
  humanLeg(ctx, pose.legs.near, false)
  const shorts = ctx.createLinearGradient(-12, -50, 13, -38)
  shorts.addColorStop(0, '#172c29')
  shorts.addColorStop(.6, '#304f43')
  shorts.addColorStop(1, '#162f2b')
  ctx.beginPath()
  ctx.moveTo(-11, -54 + b)
  ctx.lineTo(9, -53 + b)
  ctx.lineTo(11, -40 + b)
  ctx.lineTo(3, -38 + b)
  ctx.lineTo(-2, -43 + b)
  ctx.lineTo(-7, -38 + b)
  ctx.lineTo(-15, -42 + b)
  ctx.closePath()
  ctx.fillStyle = shorts
  ctx.fill()
  line(ctx, [[-12, -43 + b], [-7, -40 + b]], '#9fb18c', 1)
  const shirt = ctx.createLinearGradient(-14, -75, 15, -59)
  shirt.addColorStop(0, '#28574a')
  shirt.addColorStop(.4, '#78a889')
  shirt.addColorStop(.75, '#54896f')
  shirt.addColorStop(1, '#2b6150')
  ctx.beginPath()
  ctx.moveTo(0, -82 + b)
  ctx.quadraticCurveTo(8, -85 + b, 14, -76 + b)
  ctx.quadraticCurveTo(15, -66 + b, 9, -53 + b)
  ctx.quadraticCurveTo(-2, -49 + b, -12, -54 + b)
  ctx.lineTo(-9, -67 + b)
  ctx.closePath()
  ctx.fillStyle = shirt
  ctx.fill()
  line(ctx, [[-2, -81 + b], [4, -79 + b], [9, -82 + b]], '#d7ddbb', 1.7)
  line(ctx, [[-10, -63 + b], [-7, -55 + b]], 'rgba(26,70,54,.35)', 2)
  rect(ctx, 1, -69 + b, 11, 12, '#ede9d2')
  label(ctx, '01', 6.5, -60 + b, 7, '#31564c', 'center')
  muscle(ctx, [5, -82 + b], [8, -88 + b], 7, 7, false)
  // Profile: ear, brow, nose, chin, and a separate hairline keep the head human.
  const face = ctx.createLinearGradient(1, -99, 15, -88)
  face.addColorStop(0, '#b67d54')
  face.addColorStop(.65, '#d8a47a')
  face.addColorStop(1, '#b9845e')
  ctx.beginPath()
  ctx.moveTo(0, -96 + b)
  ctx.bezierCurveTo(1, -105 + b, 12, -105 + b, 15, -97 + b)
  ctx.lineTo(15, -93 + b)
  ctx.lineTo(18, -90 + b)
  ctx.lineTo(15, -89 + b)
  ctx.quadraticCurveTo(16, -83 + b, 10, -83 + b)
  ctx.lineTo(2, -87 + b)
  ctx.closePath()
  ctx.fillStyle = face
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-1, -93 + b)
  ctx.bezierCurveTo(-4, -107 + b, 11, -109 + b, 15, -100 + b)
  ctx.lineTo(12, -97 + b)
  ctx.lineTo(7, -99 + b)
  ctx.lineTo(3, -95 + b)
  ctx.lineTo(2, -89 + b)
  ctx.closePath()
  ctx.fillStyle = '#26332b'
  ctx.fill()
  ellipse(ctx, 2, -92 + b, 2.1, 3, '#bd885f')
  line(ctx, [[12, -94 + b], [14, -94 + b]], '#514333', 1)
  line(ctx, [[12, -86 + b], [14, -86 + b]], '#906248', .7)
  humanArm(ctx, pose.arms.near, false)
  ctx.restore()
}

function topRunner(ctx, x, y, race, celebration) {
  const pose = getSprintPose(race, celebration)
  const swing = pose.moving ? Math.sin(pose.phase * Math.PI * 2) : .18
  ctx.save()
  ctx.translate(x, y)
  ellipse(ctx, -1, 5, 32, 13, 'rgba(24,34,26,.23)')
  ctx.translate(0, -pose.jump * .4)
  capsule(ctx, [-8, -5], [-22 + swing * 12, -10], 7, '#916346')
  capsule(ctx, [-8, 5], [-22 - swing * 12, 10], 7, '#b78761')
  capsule(ctx, [-22 + swing * 12, -10], [-32 + swing * 19, -11], 5, '#bb8b63')
  capsule(ctx, [-22 - swing * 12, 10], [-32 - swing * 19, 11], 5, '#cc9a71')
  capsule(ctx, [-32 + swing * 19, -11], [-27 + swing * 19, -11], 6, '#ebebca')
  capsule(ctx, [-32 - swing * 19, 11], [-27 - swing * 19, 11], 6, '#ebebca')
  ellipse(ctx, -7, 0, 11, 11, '#203d38')
  const torso = ctx.createLinearGradient(0, -13, 0, 13)
  torso.addColorStop(0, '#70a494')
  torso.addColorStop(.5, '#3a7769')
  torso.addColorStop(1, '#26594f')
  ellipse(ctx, 8, 0, 17, 12, torso)
  if (pose.celebrating) {
    const reach = pose.celebrationProgress
    capsule(ctx, [12, -11], [15 + reach * 8, -20 - reach * 3], 7, '#ba865e')
    capsule(ctx, [15 + reach * 8, -20 - reach * 3], [22 + reach * 12, -19 - reach * 10], 5, '#ca966c')
    capsule(ctx, [12, 11], [15 + reach * 8, 20 + reach * 3], 7, '#a87452')
    capsule(ctx, [15 + reach * 8, 20 + reach * 3], [22 + reach * 12, 19 + reach * 10], 5, '#be8b64')
  } else {
    capsule(ctx, [12, -11], [9 - swing * 10, -21], 7, '#ba865e')
    capsule(ctx, [9 - swing * 10, -21], [21 - swing * 17, -17], 5, '#ca966c')
    capsule(ctx, [12, 11], [9 + swing * 10, 21], 7, '#a87452')
    capsule(ctx, [9 + swing * 10, 21], [21 + swing * 17, 17], 5, '#be8b64')
  }
  ellipse(ctx, 25, 0, 8, 8.5, '#c4926a')
  ellipse(ctx, 25, 0, 6.5, 7.5, '#2c342b')
  ellipse(ctx, 31, 0, 2, 3, '#c4926a')
  rect(ctx, 6, -5, 10, 10, '#eee9d5')
  label(ctx, '1', 11, 2.5, 7, '#31564c', 'center')
  ctx.restore()
}

function pixelBackdrop(ctx, top) {
  rect(ctx, 0, 0, 240, 125, top ? '#65906a' : '#97babb')
  if (!top) {
    rect(ctx, 0, 18, 240, 3, '#b8d2cb')
    rect(ctx, 13, 12, 22, 3, '#d7e2cd')
    rect(ctx, 167, 7, 33, 3, '#d7e2cd')
    rect(ctx, 161, 10, 48, 3, '#d7e2cd')
  }
  const standsY = top ? 3 : 24
  rect(ctx, 0, standsY, 240, 29, '#344c4c')
  for (let row = 0; row < 6; row += 1) {
    rect(ctx, 0, standsY + row * 4, 240, 1, '#718b7c')
    for (let col = 0; col < 60; col += 1) {
      rect(ctx, col * 4 + row % 2, standsY + row * 4 + 1, 2, 2, palette[(col * 5 + row * 3) % palette.length])
    }
  }
  rect(ctx, 0, standsY - 2, 240, 2, '#d5d6b9')
  if (!top) {
    for (const x of [16, 224]) {
      rect(ctx, x, 13, 1, 26, '#52635b')
      rect(ctx, x - 4, 9, 9, 5, '#d7d9b9')
      for (let n = 0; n < 3; n += 1) rect(ctx, x - 3 + n * 3, 10, 2, 2, '#fff3c9')
    }
    rect(ctx, 0, 54, 240, 18, '#6e8d60')
    rect(ctx, 0, 70, 240, 2, '#c6c9a2')
  } else {
    rect(ctx, 0, 108, 240, 17, '#62845d')
    for (let i = 0; i < 15; i += 1) rect(ctx, i * 18, 108, 9, 17, '#6c9062')
    rect(ctx, 0, 113, 240, 1, '#bdc799')
  }
}

function pixelTrack(ctx, top) {
  const layout = getSprintTrackFrame(0, top ? 'top' : 'side')
  const y = layout.top / 4
  const laneHeight = layout.laneHeight / 4
  const lanes = layout.lanes
  rect(ctx, 0, y, 240, lanes * laneHeight, '#ad6b4d')
  if (!top) rect(ctx, 0, y + lanes * laneHeight, 240, 125 - y - lanes * laneHeight, '#80583e')
  const activeLane = layout.activeLane
  rect(ctx, 0, y + activeLane * laneHeight, 240, laneHeight, '#ba7856')
  for (let lane = 0; lane <= lanes; lane += 1) {
    rect(ctx, 0, y + lane * laneHeight, 240, 1, '#ead6ac')
  }
  return layout.runnerY / 4
}

function pixelLimb(ctx, points, color, width) {
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'
  line(ctx, points.map(point => point.map(Math.round)), color, width)
}

function pixelRunner(ctx, x, y, race, top, celebration) {
  const pose = getSprintPose(race, celebration)
  const swing = pose.moving ? Math.round(Math.sin(pose.phase * Math.PI * 2) * 4) : 1
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  rect(ctx, -8, 1, 17, top ? 4 : 2, '#85563f')
  ctx.translate(0, Math.round(-pose.jump / 4))
  if (top) {
    pixelLimb(ctx, [[-2, -2], [-6 + swing, -3], [-9 + swing, -3]], '#b78256', 2)
    pixelLimb(ctx, [[-2, 2], [-6 - swing, 3], [-9 - swing, 3]], '#d19c65', 2)
    rect(ctx, -10 + swing, -4, 3, 2, '#f1e6b0')
    rect(ctx, -10 - swing, 2, 3, 2, '#f1e6b0')
    rect(ctx, -3, -3, 5, 6, '#233f36')
    rect(ctx, 0, -4, 7, 8, '#3f8070')
    rect(ctx, 1, -4, 5, 2, '#74b197')
    if (pose.celebrating) {
      const reach = Math.round(pose.celebrationProgress * 3)
      pixelLimb(ctx, [[4, -4], [5 + reach, -6], [7 + reach, -6 - reach]], '#c78f5b', 2)
      pixelLimb(ctx, [[4, 4], [5 + reach, 6], [7 + reach, 6 + reach]], '#b78052', 2)
    } else {
      pixelLimb(ctx, [[4, -4], [2 - swing, -7], [7 - swing, -5]], '#c78f5b', 2)
      pixelLimb(ctx, [[4, 4], [2 + swing, 7], [7 + swing, 5]], '#b78052', 2)
    }
    rect(ctx, 7, -3, 5, 6, '#d19e6b')
    rect(ctx, 7, -3, 4, 5, '#29362c')
    rect(ctx, 2, -1, 3, 3, '#eee3b9')
  } else {
    const scale = point => point.map(value => value / 4)
    const drawArm = (arm, far) => {
      pixelLimb(ctx, [scale(arm.shoulder), scale(arm.elbow), scale(arm.wrist)], far ? '#a4714d' : '#ce9760', 2)
    }
    const drawLeg = (leg, far) => {
      pixelLimb(ctx, [scale(leg.hip), scale(leg.knee)], far ? '#aa7650' : '#d09c68', 3)
      pixelLimb(ctx, [scale(leg.knee), scale(leg.ankle)], far ? '#a06d48' : '#bf8b5c', 2)
      const ankle = scale(leg.ankle)
      rect(ctx, Math.round(ankle[0]) - 1, Math.round(ankle[1]), 4, 2, far ? '#c6c9a1' : '#eee5bb')
    }
    drawArm(pose.arms.far, true)
    drawLeg(pose.legs.far, true)
    drawLeg(pose.legs.near, false)
    const b = Math.round(pose.bob / 4)
    rect(ctx, -3, -14 + b, 6, 4, '#203c32')
    rect(ctx, -2, -20 + b, 6, 7, '#3d7c67')
    rect(ctx, -2, -20 + b, 2, 6, '#78b194')
    rect(ctx, 0, -18 + b, 3, 3, '#eee2b8')
    rect(ctx, 1, -22 + b, 2, 3, '#b98356')
    rect(ctx, 0, -26 + b, 4, 5, '#d19b62')
    rect(ctx, -1, -27 + b, 5, 2, '#29382c')
    rect(ctx, -1, -26 + b, 2, 3, '#29382c')
    rect(ctx, 4, -24 + b, 1, 1, '#d19b62')
    rect(ctx, 3, -25 + b, 1, 1, '#514333')
    drawArm(pose.arms.near, false)
  }
  if (pose.moving && race.speed > 6) {
    rect(ctx, -15, 0, 3, 1, '#ddaa71')
    rect(ctx, -20, -2, 2, 1, '#cf915f')
  }
  ctx.restore()
}

function spriteRunner(ctx, x, y, image, asset, frame, view, runSample = null) {
  const source = runSample
    ? getSprintRunRect(image.naturalWidth, image.naturalHeight, runSample.index)
    : getSprintSpriteRect(image.naturalWidth, image.naturalHeight, view, frame.index)
  if (!source) return false
  const top = view === 'top'
  const height = runSample ? runSample.displayHeight : top ? asset.displayWidth * source.height / source.width : asset.displayHeight
  const width = top ? asset.displayWidth : height * source.width / source.height
  const anchorX = runSample ? runSample.anchorX : asset.anchorX
  const anchorY = runSample ? runSample.anchorY : !top && frame.index < 8 ? asset.runAnchorY : asset.anchorY
  ctx.save()
  try {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    // The shadow stays on the track while the selected pose rises above it.
    ellipse(ctx, x - 1, y + (top ? 4 : 3), top ? 27 : 23, top ? 10 : 3.5, 'rgba(24,31,24,.24)')
    ctx.drawImage(
      image,
      source.x, source.y, source.width, source.height,
      x - width * anchorX, y - height * anchorY - frame.jump,
      width, height,
    )
    return true
  } catch {
    return false
  } finally {
    ctx.restore()
  }
}

function drawRivals(ctx, rivals, track, view, art, sprite, runSprite, bossImages, bossState, startSprite, startRace, layer = 'back') {
  const asset = SPRINT_SPRITES[art]?.[view]
  // Virtual runners leave on the gun independently of a player's first input.
  // Only this presentation sample is adapted; rival pace and race data stay intact.
  const virtualStartRace = startRace.status === 'running'
    ? { ...startRace, firstStrideAt: startRace.startedAt, steps: 1 } : startRace
  const positions = []
  for (const rival of rivals) {
    // All runners share the PLAYER's camera, including replay seeks.
    const x = track.startX + rival.distance * track.metersToPixels
    const lane = getSprintRivalLane(rival.lane, view)
    if (lane === null) continue
    const y = track.top + (lane + .5) * track.laneHeight
    const opacity = getSprintRivalOpacity(rival, bossState)
    const position = { id: rival.id, lane, distance: rival.distance, x, y, opacity, layer }
    if (rival.isBoss) position.isBoss = true
    positions.push(position)
    if (x < -180 || x > WIDTH + 180) continue
    const start = getSprintStartSpriteSample(virtualStartRace, art, rival.isBoss ? 'boss' : 'runner', view)
    if (rival.isBoss) {
      const sample = start || getSprintBossSample(rival, view, art, bossState)
      const image = bossImages.art === art && bossImages.view === view ? bossImages.images?.[sample.sheet] : null
      ctx.save()
      ctx.globalAlpha = opacity
      const drawn = image && (start
        ? drawSprintStartSprite(ctx, x, y, image, sample, { scale: SPRINT_BOSS_CHARACTER_SIZE })
        : drawSprintBossSprite(ctx, x, y, image, sample, { scale: SPRINT_BOSS_CHARACTER_SIZE }))
      if (!drawn && bossImages.status === 'error') drawSprintBossFallback(ctx, x, y, start ? { ...sample, phase: 0 } : sample, SPRINT_BOSS_CHARACTER_SIZE)
      ctx.restore()
      position.renderer = drawn ? 'sprite' : bossImages.status === 'error' ? 'fallback' : 'loading'
      position.frame = sample.index
      position.sheet = sample.sheet
      position.startPhase = start?.phase || 'off'
      position.won = Boolean(bossState?.won)
      continue
    }
    if (start) {
      const image = startSprite.status === 'ready' && startSprite.src === start.src ? startSprite.image : null
      ctx.save()
      ctx.globalAlpha = opacity
      const drawn = image && drawSprintStartSprite(ctx, x, y, image, start)
      ctx.restore()
      if (drawn || startSprite.status !== 'error') {
        position.renderer = drawn ? 'sprite' : 'loading'
        position.frame = start.index
        position.sheet = 'start'
        position.startPhase = start.phase
        continue
      }
    }
    const frame = getSprintSpriteFrame(rival, view)
    const motion = view === 'side' ? getSprintRunSample(rival, art) : null
    const useRun = Boolean(motion)
    const state = useRun ? runSprite : sprite
    const expectedSource = useRun ? SPRINT_RUN_SPRITES[art]?.src : asset?.src
    const runnerImage = state.status === 'ready' && state.src === expectedSource ? state.image : null
    ctx.save()
    ctx.globalAlpha = opacity
    const drawn = runnerImage && spriteRunner(ctx, x, y, runnerImage, asset, frame, view, useRun ? motion : null)
    if (!drawn && state.status === 'error') {
      if (art === 'pixel') {
        ctx.scale(4, 4)
        pixelRunner(ctx, x / 4, y / 4, rival, view === 'top')
      } else if (view === 'top') topRunner(ctx, x, y, rival)
      else sideRunner(ctx, x, y, rival)
    }
    ctx.restore()
  }
  return positions
}

function drawScene(canvas, offscreen, race, view, art, image, sprite, runSprite, background, celebration, raceMode, rivalSeed, bossEncounter, bossImages, bossVictoryExtraMs, reactionImage, startImage) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const top = view === 'top'
  const distance = Number.isFinite(race.distance) ? Math.max(0, Math.min(100, race.distance)) : 0
  const track = getSprintTrackFrame(distance, view)
  const rivals = getSprintRivals(race, raceMode, rivalSeed, bossEncounter)
  const bossState = withSprintBossPresentation(getSprintBossState(race, raceMode, rivalSeed, bossEncounter), bossVictoryExtraMs)
  const rivalLayers = splitSprintRivalLayers(rivals, bossState)
  let rivalPositions = []
  const x = track.runnerX
  const asset = SPRINT_SPRITES[art]?.[view]
  const reaction = getSprintReactionSample(celebration, view, art)
  const start = getSprintStartSpriteSample(race, art, 'runner', view)
  const frame = getSprintSpriteFrame(race, view, reaction ? null : celebration)
  const motion = top ? null : getSprintRunSample(race, art)
  const useRun = Boolean(motion)
  const runnerImage = useRun ? runSprite.image : sprite.image
  const runningPose = useRun ? motion : null
  let spriteState = useRun
    ? runSprite.src === SPRINT_RUN_SPRITES[art]?.src ? runSprite.status : 'loading'
    : sprite.src === asset?.src ? sprite.status : 'loading'
  const useSprite = spriteState === 'ready' && Boolean(runnerImage)
  let renderedSprite = false
  let renderedStart = false
  let startError = false
  let renderedReaction = false
  let reactionFallback = false
  if (background.view !== view || background.art !== art || background.image !== image) {
    const surface = document.createElement('canvas')
    surface.width = art === 'pixel' ? 240 : WIDTH
    surface.height = art === 'pixel' ? 125 : HEIGHT
    const surfaceCtx = surface.getContext('2d')
    if (!surfaceCtx) return
    if (art === 'pixel') {
      pixelBackdrop(surfaceCtx, top)
      background.runnerY = pixelTrack(surfaceCtx, top)
    } else background.runnerY = realisticTrack(surfaceCtx, top, image)
    background.canvas = surface
    background.view = view
    background.art = art
    background.image = image
    background.texture = trackTexture(art === 'pixel', track.lanes * track.laneHeight * (art === 'pixel' ? .25 : 1))
  }
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0)
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  if (art === 'pixel') {
    const pixel = offscreen.getContext('2d')
    if (!pixel) return
    pixel.clearRect(0, 0, offscreen.width, offscreen.height)
    pixel.drawImage(background.canvas, 0, 0)
    trackMarks(pixel, track, distance, view, true, background.texture)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(offscreen, 0, 0, WIDTH, HEIGHT)
  } else {
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(background.canvas, 0, 0)
    trackMarks(ctx, track, distance, view, false, background.texture)
  }
  rivalPositions = drawRivals(ctx, rivalLayers.back, track, view, art, sprite, runSprite, bossImages, bossState, startImage, race)
  // All player variants share this layer. The winning boss is composited only
  // after it, keeping the winner visible even when the finish positions overlap.
  if (reaction) {
    const loaded = reactionImage.art === art && reactionImage.view === view
      && reactionImage.src === reaction.src && reactionImage.status === 'ready' ? reactionImage.image : null
    renderedReaction = Boolean(loaded && drawSprintReactionSprite(ctx, x, track.runnerY, loaded, reaction))
    if (!renderedReaction && reactionImage.status === 'error') {
      drawSprintDefeatFallback(ctx, x, track.runnerY, reaction)
      reactionFallback = true
    }
  }
  if (start && !renderedReaction && !reactionFallback) {
    const loaded = startImage.status === 'ready' && startImage.src === start.src ? startImage.image : null
    renderedStart = Boolean(loaded && drawSprintStartSprite(ctx, x, track.runnerY, loaded, start))
    startError = startImage.status === 'error' || Boolean(loaded && !renderedStart)
  }
  if (!renderedReaction && !reactionFallback && !renderedStart && (!start || startError)) {
    if (useSprite) {
      // Only the stadium is upscaled from 240px. Both atlases are composited
      // onto the final canvas at their full source resolution.
      renderedSprite = spriteRunner(ctx, x, track.runnerY, runnerImage, asset, frame, view, runningPose)
      if (!renderedSprite) spriteState = 'error'
    }
    if (!renderedSprite && spriteState === 'error') {
      if (art === 'pixel') {
        ctx.save()
        ctx.scale(4, 4)
        pixelRunner(ctx, x / 4, track.runnerY / 4, race, top, celebration)
        ctx.restore()
      } else if (top) topRunner(ctx, x, track.runnerY, race, celebration)
      else sideRunner(ctx, x, track.runnerY, race, celebration)
    }
  }
  if (art !== 'pixel') {
    const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * .35, WIDTH / 2, HEIGHT / 2, WIDTH * .65)
    vignette.addColorStop(0, 'rgba(15,32,28,0)')
    vignette.addColorStop(1, 'rgba(15,32,28,.2)')
    rect(ctx, 0, 0, WIDTH, HEIGHT, vignette)
  }
  rivalPositions.push(...drawRivals(ctx, rivalLayers.front, track, view, art, sprite, runSprite, bossImages, bossState, startImage, race, 'front'))
  canvas.dataset.runnerRenderer = renderedReaction ? 'reaction' : reactionFallback ? 'procedural' : renderedStart || renderedSprite ? 'sprite' : spriteState === 'error' ? 'procedural' : 'loading'
  canvas.dataset.runnerState = renderedReaction || reactionFallback ? reactionImage.status : start ? startError ? 'error' : startImage.status : spriteState
  canvas.dataset.runnerFrame = String(renderedReaction || reactionFallback ? reaction.index : renderedStart ? start.index : useRun ? motion.index : frame.index)
  canvas.dataset.runnerMotion = renderedReaction ? 'defeat-8' : reactionFallback ? 'defeat-fallback' : renderedStart ? 'start-8' : renderedSprite && useRun ? 'calibrated-16' : 'poses'
  canvas.dataset.runnerAsset = renderedStart ? start.src : useRun ? runSprite.src : sprite.src
  canvas.dataset.startPhase = start?.phase || 'off'
  canvas.dataset.startFrame = start ? String(start.index) : ''
  canvas.dataset.runnerGrounded = !reaction && renderedSprite && useRun ? String(motion.grounded) : 'rest'
  canvas.dataset.reactionKind = reaction ? 'defeat' : 'none'
  canvas.dataset.reactionState = reaction ? reactionImage.status === 'off' ? 'loading' : reactionImage.status : 'off'
  canvas.dataset.runnerY = String(track.runnerY)
  canvas.dataset.runnerX = String(track.runnerX)
  canvas.dataset.trackCamera = String(track.cameraX)
  canvas.dataset.rivalCount = String(rivals.length)
  canvas.dataset.rivalOpacity = rivals.length ? '.4' : '0'
  canvas.dataset.rivalPositions = JSON.stringify(rivalPositions)
  canvas.dataset.rivalSeed = String(rivalSeed)
  canvas.dataset.bossEncounter = String(Boolean(bossEncounter && raceMode === 'competition'))
  canvas.dataset.bossAssetsState = bossImages.status
  canvas.dataset.bossWon = String(Boolean(bossState?.won))
  const bossPosition = rivalPositions.find(position => position.isBoss)
  canvas.dataset.bossRenderer = bossPosition?.renderer || (bossPosition ? 'offscreen' : 'none')
  canvas.dataset.bossFrame = bossPosition?.frame === undefined ? '' : String(bossPosition.frame)
  canvas.dataset.bossLayer = bossPosition?.layer || 'none'
  canvas.dataset.bossOpacity = bossPosition ? String(bossPosition.opacity) : '0'
  return startError ? 'error' : spriteState
}

/** Four renderers share one race; drawing never mutates distance or timing. */
export default function SprintScene({ race, view, art, locale = 'ko', className, celebration = null, fit = 'natural', raceMode = 'solo', rivalSeed = 0, bossEncounter = false, bossVictoryExtraMs = 0, onAssetsStateChange }) {
  const canvasRef = useRef(null)
  const familyRef = useRef(null)
  const loadStateRef = useRef({ status: 'loading', failedSources: [] })
  const callbackRef = useRef(onAssetsStateChange)
  const emittedStateRef = useRef(null)
  const offscreenRef = useRef(null)
  const currentRef = useRef({ race, view, art, locale, celebration, raceMode, rivalSeed, bossEncounter, bossVictoryExtraMs })
  const redrawRef = useRef(() => {})
  callbackRef.current = onAssetsStateChange
  const reactionKind = celebration?.kind
  const shouldLoadDefeat = reactionKind === 'defeat' || (race.status === 'finished'
    && getSprintFinishReaction(race, raceMode, rivalSeed, bossEncounter) === 'defeat')
  const english = locale === 'en'
  const descriptionBase = english
    ? `${view === 'top' ? 'Top-down' : 'Side-view'} ${art === 'pixel' ? 'pixel art' : 'realistic-style'} 100-metre sprint preview`
    : `${view === 'top' ? '탑뷰' : '사이드뷰'} · ${art === 'pixel' ? '도트' : '실사풍'} 100m 달리기 시안`
  const description = raceMode === 'competition'
    ? `${descriptionBase}${bossEncounter ? english ? ' · Lusain Volt and four virtual rivals' : ' · 루사인 볼트와 가상 선수 4명' : english ? ' · five translucent virtual rivals' : ' · 반투명 가상 선수 5명'}`
    : descriptionBase

  useEffect(() => {
    currentRef.current = { race, view, art, locale, celebration, raceMode, rivalSeed, bossEncounter, bossVictoryExtraMs }
    redrawRef.current()
  }, [race, view, art, locale, celebration, raceMode, rivalSeed, bossEncounter, bossVictoryExtraMs])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const offscreen = document.createElement('canvas')
    offscreen.width = 240
    offscreen.height = 125
    offscreenRef.current = offscreen
    const background = {}
    let viewportBox = { width: 0, height: 0 }
    let disposed = false
    const redraw = () => {
      if (disposed) return
      const latest = currentRef.current
      const family = familyRef.current
      if (fit === 'cover') {
        const renderedView = family?.view || latest.view
        const track = getSprintTrackFrame(latest.race.distance, renderedView)
        const boss = getSprintBossState(latest.race, latest.raceMode, latest.rivalSeed, latest.bossEncounter)
        const bossX = boss ? track.startX + boss.distance * track.metersToPixels : -1
        const bossLane = boss?.won && bossX >= 0 && bossX <= WIDTH ? getSprintRivalLane(boss.lane, renderedView) : null
        const focusY = bossLane === null ? track.runnerY : track.top + (bossLane + .5) * track.laneHeight
        const camera = getSprintViewportCamera({ ...viewportBox, view: renderedView, focusY })
        const position = `${camera.objectPositionY}%`
        if (canvas.style.getPropertyValue('--sprint-camera-y') !== position) canvas.style.setProperty('--sprint-camera-y', position)
        canvas.dataset.viewportCropTop = String(camera.cropTop)
        canvas.dataset.viewportVisibleHeight = String(camera.visibleHeight)
      }
      if (family) {
        const status = drawScene(canvas, offscreen, latest.race, family.view, family.art,
          family.background.image, family.sprite, family.runSprite, background, latest.celebration,
          latest.raceMode, latest.rivalSeed, latest.bossEncounter, family.boss, latest.bossVictoryExtraMs, family.reaction, family.start)
        if (status === 'error' && loadStateRef.current.status === 'ready') {
          loadStateRef.current = { status: 'error', failedSources: [canvas.dataset.runnerAsset || family.sprite.src] }
        }
      } else {
        // Loading is a distinct state, never a temporary procedural athlete.
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0)
          rect(ctx, 0, 0, WIDTH, HEIGHT, '#142f29')
          assetNotice(ctx, canvas, fit, latest.locale === 'en' ? 'Loading runner images…' : '선수 이미지를 불러오는 중…', true)
        }
        canvas.dataset.runnerRenderer = 'loading'
        canvas.dataset.runnerState = 'loading'
        canvas.dataset.runnerMotion = 'loading'
      }
      const state = { ...loadStateRef.current, requestedArt: latest.art, requestedView: latest.view,
        renderedArt: family?.art || null, renderedView: family?.view || null }
      canvas.dataset.sceneAssetsState = state.status
      canvas.dataset.requestedArt = latest.art
      canvas.dataset.requestedView = latest.view
      canvas.dataset.renderedArt = state.renderedArt || ''
      canvas.dataset.renderedView = state.renderedView || ''
      canvas.dataset.sceneAssetsKey = family?.key || ''
      const english = latest.locale === 'en'
      const message = state.status === 'error'
        ? family?.status === 'ready'
          ? english ? 'Image load failed · keeping the current style' : '이미지 로딩 실패 · 현재 그림체 유지'
          : english ? 'Image load failed · fallback display' : '이미지 로딩 실패 · 대체 표시'
        : state.status === 'loading' && family
          ? english ? 'Preparing images · play continues' : '이미지 준비 중 · 경기는 계속 진행'
          : ''
      canvas.setAttribute('aria-description', message)
      if (message) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          assetNotice(ctx, canvas, fit, message)
        }
      }
      const signature = JSON.stringify(state)
      if (signature !== emittedStateRef.current) {
        emittedStateRef.current = signature
        callbackRef.current?.(state)
      }
    }
    redrawRef.current = redraw
    const resize = () => {
      const box = canvas.getBoundingClientRect()
      viewportBox = { width: box.width, height: box.height }
      const width = fit === 'cover' ? Math.max(box.width, box.height * WIDTH / HEIGHT) || WIDTH : box.width || WIDTH
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.min(3840, Math.round(width * ratio)))
      canvas.height = Math.max(1, Math.round(canvas.width * HEIGHT / WIDTH))
      redraw()
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(canvas)
    window.addEventListener('resize', resize)
    resize()
    return () => {
      disposed = true
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      redrawRef.current = () => {}
      offscreenRef.current = null
    }
  }, [fit])

  useEffect(() => {
    let disposed = false
    const request = { art, view, bossEnabled: bossEncounter && raceMode === 'competition', defeat: shouldLoadDefeat }
    const requestedKey = getSprintSceneFamilyKey(request)
    loadStateRef.current = { status: 'loading', failedSources: [] }
    redrawRef.current()
    void loadSprintSceneFamily(request).then(async candidate => {
      if (disposed) return
      if (candidate.key !== requestedKey) return
      familyRef.current = selectSprintSceneFamily(familyRef.current, candidate)
      loadStateRef.current = { status: candidate.status, failedSources: candidate.failedSources }
      redrawRef.current()
      const retained = familyRef.current
      if (retained !== candidate && ((request.bossEnabled && retained.boss.status === 'off')
        || (request.defeat && retained.reaction.status === 'off'))) {
        // A failed replacement style must not leave a new boss/reaction hidden
        // forever. Complete that feature in the retained, approved style instead.
        const complete = await loadSprintSceneFamily({ ...request, art: retained.art, view: retained.view })
        if (disposed) return
        familyRef.current = complete
        loadStateRef.current = { status: 'error', failedSources: [...candidate.failedSources, ...complete.failedSources] }
        redrawRef.current()
      }
    })
    // Warm only the ordinary athlete/background family. Boss and defeat sheets
    // are requested when needed and share the same decoded cache thereafter.
    void loadSprintSceneFamily({ art: art === 'pixel' ? 'realistic' : 'pixel', view })
    return () => { disposed = true }
  }, [view, art, bossEncounter, raceMode, shouldLoadDefeat])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={WIDTH}
      height={HEIGHT}
      data-runner-renderer="loading"
      data-runner-state="loading"
      style={fit === 'cover'
        ? { display: 'block', width: '100%', height: '100%', objectFit: 'cover' }
        : { display: 'block', width: '100%', height: 'auto', aspectRatio: '48 / 25' }}
      role="img"
      aria-label={description}
    >
      {description}
    </canvas>
  )
}
