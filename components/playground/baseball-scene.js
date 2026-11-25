import { useEffect, useId, useRef, useState } from 'react'
import { BASEBALL_RULES, sampleBaseballPitch, sampleBaseballBattedBall } from '@/lib/playground-baseball.mjs'
import { BASEBALL_BATTER_FRAME_NAMES, getBaseballBatterFrames, sampleBaseballBatterAnimation } from '@/lib/playground-baseball-animation.mjs'
import { BASEBALL_BATTER_FIT_OPTIONS, createBaseballStage, createBaseballProjection, createBaseballPitcherPlacement, fitBaseballBatter } from '@/lib/playground-baseball-layout.mjs'
import { createBaseballFocusProjection } from '@/lib/playground-baseball-focus.mjs'
import { getBaseballPitcherSpriteGeometry, sampleBaseballPitcherMotion } from '@/lib/playground-baseball-pitcher.mjs'
import { createBaseballObservation } from '@/lib/playground-baseball-observation.mjs'
import { getBaseballPlateMarker, getBaseballBatPresentation } from '@/lib/playground-baseball-presentation.mjs'
import { BASEBALL_UNIFORM_VERSION, getBaseballUniformMaterialKey, getBaseballUniformRegions, paintBaseballUniform, getBaseballUndersleeveRegions, paintBaseballUndersleeves } from '@/lib/playground-baseball-uniform.mjs'
import { loadBaseballClothTexture } from '@/lib/playground-baseball-cloth.mjs'
import { getBaseballBatterDeliverySrc, getBaseballSharedDeliverySrc } from '@/lib/playground-baseball-delivery.mjs'
import { createBaseballImageLoader, loadBaseballImageBank } from '@/lib/playground-baseball-image-loader.mjs'
import { sampleBaseballFieldPresentation } from '@/lib/playground-baseball-field-presentation.mjs'
import { BASEBALL_FIELD_MODEL, getBaseballFieldFenceDistance } from '@/lib/playground-baseball-field.mjs'
import { sampleBaseballPostplayMotion } from '@/lib/playground-baseball-postplay.mjs'
import { getBaseballPostplayFrames, getBaseballPostplayUniformRegions, getBaseballPostplayUndersleeveRegions } from '@/lib/playground-baseball-postplay-art.mjs'
import styles from '@/styles/playground-baseball-scene.module.css'

const BACKDROP = '/images/playground/baseball/concepts/20261123/stadium-batting-view-v1.png'
const SPRITES = '/images/playground/baseball/sprites/20261123'
const sharedImageCache = new Map()
const browserImageLoader = createBaseballImageLoader()
const isNumber = n => typeof n === 'number' && Number.isFinite(n)

function drawContactImpact(ctx, layout, result, elapsed, strength) {
  if (strength === 'off' || elapsed < 0 || elapsed >= 180) return
  const contact = layout.project(result.contactPoint), progress = elapsed / 180
  const reduced = strength === 'reduced', subtle = strength === 'subtle' || reduced
  const perfect = result.outcome === 'perfect'
  ctx.save()
  ctx.globalAlpha = (1 - progress) * (subtle ? .65 : 1)
  ctx.strokeStyle = perfect ? '#ffe79e' : '#fff4c9'
  ctx.fillStyle = ctx.strokeStyle
  ctx.lineWidth = subtle ? 1.5 : 2.4
  ctx.beginPath()
  ctx.arc(contact.x, contact.y, reduced ? 12 : 8 + (subtle ? 16 : 24) * progress, 0, Math.PI * 2)
  ctx.stroke()
  if (!subtle) {
    const count = perfect ? 6 : 3
    for (let index = 0; index < count; index++) {
      const angle = index * Math.PI * 2 / count + .3
      const radius = 10 + 25 * progress
      ctx.beginPath()
      ctx.arc(contact.x + Math.cos(angle) * radius, contact.y + Math.sin(angle) * radius,
        perfect ? 1.8 : 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

// Browser objects are created only when the scene mounts, never during SSR.
function loadImage(src, cache = null) {
  return browserImageLoader(src, { cache, minWidth:512, minHeight:256 })
}

async function loadBatterFrames(descriptors, current, loader) {
  return loadBaseballImageBank(descriptors, { loadImage:loader, isCurrent:current, sourceFor:getBaseballBatterDeliverySrc })
}

function rgb(value, fallback) {
  const text = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : fallback
  return [0, 2, 4].map(i => parseInt(text.slice(i, i + 2), 16))
}

const materialKey = getBaseballUniformMaterialKey

function releaseUniforms(bank) {
  bank?.forEach(frame => { frame.image.width = 1; frame.image.height = 1 })
  bank?.clear()
}

/** Pose-specific clothing composition; source PNG and all pose geometry stay intact. */
function makeUniform(image, team, descriptor, handedness, texture) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const regions = descriptor.postplay?getBaseballPostplayUniformRegions(descriptor,team):getBaseballUniformRegions({ handedness, name:descriptor.name, src:descriptor.src, uniformProfile:team?.uniformProfile })
  const { bounds } = paintBaseballUniform(pixels, team, regions, { feet:descriptor.feet })
  if (team?.undersleeve) {
    const sleeves = descriptor.postplay?getBaseballPostplayUndersleeveRegions(descriptor):getBaseballUndersleeveRegions({ handedness, name:descriptor.name, src:descriptor.src })
    paintBaseballUndersleeves(pixels, team, sleeves, { texture, feet:descriptor.feet })
  }
  ctx.putImageData(pixels, 0, 0)

  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) throw new Error('Empty batter image')
  return { image:canvas, bounds }
}

function insidePolygon(x, y, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function fitBackNumber(ctx, descriptor, number) {
  const back = descriptor.backNumber
  if (!back?.polygon?.length || !back.transform) return null
  const transform = back.transform
  const rotation = (transform.rotationDeg || 0) * Math.PI / 180
  const skew = Math.tan((transform.skewDeg || 0) * Math.PI / 180)
  const scaleX = transform.scaleX ?? 1
  const a = Math.cos(rotation) * scaleX
  const b = Math.sin(rotation) * scaleX
  const c = Math.cos(rotation) * skew - Math.sin(rotation)
  const d = Math.sin(rotation) * skew + Math.cos(rotation)
  const mapped = (x, y) => [transform.x + a * x + c * y, transform.y + b * x + d * y]
  let font = back.fontPx || 144
  for (let attempt = 0; attempt < 30; attempt++) {
    ctx.font = `900 ${font}px Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const metrics = ctx.measureText(number)
    const left = metrics.actualBoundingBoxLeft ?? metrics.width / 2
    const right = metrics.actualBoundingBoxRight ?? metrics.width / 2
    const ascent = metrics.actualBoundingBoxAscent ?? font * 0.75
    const descent = metrics.actualBoundingBoxDescent ?? font * 0.05
    const baseline = (ascent - descent) / 2
    const padding = Math.max(4, font * 0.045) + 3
    const x0 = -left - padding
    const x1 = right + padding
    const y0 = baseline - ascent - padding
    const y1 = baseline + descent + padding
    const points = [[x0,y0],[x1,y0],[x1,y1],[x0,y1],[(x0+x1)/2,y0],[(x0+x1)/2,y1],[x0,(y0+y1)/2],[x1,(y0+y1)/2]]
    if (x1 - x0 <= (back.maxWidth || 220) && y1 - y0 <= (back.maxHeight || 190) && points.every(point => insidePolygon(...mapped(...point), back.polygon))) {
      return { font, baseline, lineWidth:Math.max(4, font * 0.045), a, b, c, d, x:transform.x, y:transform.y }
    }
    font *= 0.93
  }
  return null
}

function drawBackNumber(ctx, descriptor, number, plan, team) {
  if (!plan) return false
  const jersey = rgb(team?.jersey, '2054ad')
  const light = jersey[0] * 0.2126 + jersey[1] * 0.7152 + jersey[2] * 0.0722 > 150
  ctx.save()
  ctx.beginPath()
  descriptor.backNumber.polygon.forEach(([x,y], index) => index === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y))
  ctx.closePath()
  // The complete stroked glyph already fits inside this semantic back panel.
  // This safety clip never uses source blue pixels or a horizontal jersey band.
  ctx.clip()
  ctx.transform(plan.a, plan.b, plan.c, plan.d, plan.x, plan.y)
  ctx.font = `900 ${plan.font}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineWidth = plan.lineWidth
  ctx.fillStyle = light ? '#192e43' : '#f5f0df'
  ctx.strokeStyle = light ? '#eee9de' : '#20313b'
  ctx.strokeText(number, 0, plan.baseline)
  ctx.fillText(number, 0, plan.baseline)
  ctx.restore()
  return true
}

function batterPlacement(stage, descriptors, renderedFrames) {
  const all = Object.values(descriptors)
  const anchor = frame => frame.registrationAnchor || frame.footAnchor
  const left = Math.min(...all.map(frame => renderedFrames.get(frame.name).bounds.left - anchor(frame).x))
  const right = Math.max(...all.map(frame => renderedFrames.get(frame.name).bounds.right - anchor(frame).x))
  const top = Math.min(...all.map(frame => renderedFrames.get(frame.name).bounds.top - anchor(frame).y))
  const bottom = Math.max(...all.map(frame => renderedFrames.get(frame.name).bounds.bottom - anchor(frame).y))
  return fitBaseballBatter(stage, { left, right, top, bottom }, BASEBALL_BATTER_FIT_OPTIONS)
}

function drawBatter(ctx, image, descriptor, placement, number, numberPlan, team) {
  const { x, y, scale } = placement
  const anchor = descriptor.registrationAnchor || descriptor.footAnchor
  ctx.save()
  ctx.translate(x - anchor.x * scale, y - anchor.y * scale)
  ctx.scale(scale, scale)
  ctx.drawImage(image, 0, 0, descriptor.width, descriptor.height)
  const numberVisible = drawBackNumber(ctx, descriptor, number, numberPlan, team)
  ctx.restore()
  return numberVisible
}

function cover(ctx, image, stage) {
  const { x, y, width, height } = stage.background
  ctx.drawImage(image, x, y, width, height)
}

function drawPitcher(ctx, atlas, motion, placement, blendCanvas) {
  const sw = atlas.naturalWidth / 4
  const sh = atlas.naturalHeight / 2
  const blend = blendCanvas.getContext('2d')
  blend.clearRect(0, 0, blendCanvas.width, blendCanvas.height)
  // Add premultiplied layers off-screen, so the overlapping body stays opaque.
  for (const layer of motion.layers) {
    blend.globalCompositeOperation = 'lighter'
    blend.globalAlpha = layer.alpha
    blend.drawImage(atlas, (layer.frame % 4) * sw, Math.floor(layer.frame / 4) * sh, sw, sh, 0, 0, blendCanvas.width, blendCanvas.height)
  }
  blend.globalAlpha = 1
  blend.globalCompositeOperation = 'source-over'
  ctx.save()
  ctx.translate(placement.x + (motion.flipX ? placement.width : 0), placement.y)
  ctx.scale(motion.flipX ? -1 : 1, 1)
  ctx.drawImage(blendCanvas, 0, 0, placement.width, placement.height)
  ctx.restore()
}

function ellipse(ctx, x, y, rx, ry, color) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function drawBall(ctx, point, layout, alpha = 1, contrast = false) {
  if (!point || point.visible === false || ![point.x, point.y, point.z].every(isNumber)) return
  const p = layout.project(point)
  const radius = Math.max(p.scale * BASEBALL_RULES.ballRadiusM, 1.7)
  if (p.x < -radius || p.x > layout.width + radius || p.y < -radius || p.y > layout.height + radius) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.shadowBlur = 0
  ctx.setLineDash([])
  if (alpha === 1) ellipse(ctx, p.x, p.ground, radius * 1.15, radius * 0.24, 'rgba(22,34,25,.2)')
  // A thin contrast aid surrounds the physical body; it is not collision size.
  if (alpha === 1) {
    ctx.strokeStyle = contrast ? 'rgba(255,249,218,.65)' : 'rgba(255,249,218,.45)'
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.ellipse(p.x, p.y, radius + 0.35, radius + 0.35, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  const shine = ctx.createRadialGradient(p.x - radius * 0.35, p.y - radius * 0.35, 0, p.x, p.y, radius)
  shine.addColorStop(0, '#fffef6')
  shine.addColorStop(0.65, '#f8f5e9')
  shine.addColorStop(1, '#d8d2c2')
  ellipse(ctx, p.x, p.y, radius, radius, shine)
  // Keep the dark rim inside that body so bright skies do not erase its edge.
  const rimWidth = Math.max(0.6, Math.min(1.3, radius * 0.12))
  ctx.strokeStyle = '#203b31'
  ctx.lineWidth = rimWidth
  ctx.beginPath()
  ctx.ellipse(p.x, p.y, radius - rimWidth / 2, radius - rimWidth / 2, 0, 0, Math.PI * 2)
  ctx.stroke()
  if (radius > 4) {
    ctx.strokeStyle = '#b3453b'
    ctx.lineWidth = Math.max(0.7, radius * 0.09)
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(p.x + side * radius * 0.45, p.y - radius * 0.77)
      ctx.bezierCurveTo(p.x - side * radius * 0.1, p.y - radius * 0.25, p.x - side * radius * 0.1, p.y + radius * 0.25, p.x + side * radius * 0.45, p.y + radius * 0.77)
      ctx.stroke()
    }
  }
  ctx.restore()
  return { world:{x:point.x,y:point.y,z:point.z}, screen:{x:p.x,y:p.y,radius,scale:p.scale,ground:p.ground}, drawn:true }
}

function drawPitchBall(ctx, pitch, flightMs, layout, contrast) {
  // A short trail follows the analytic path; the core never lags behind physics.
  const span = Math.min(12, flightMs)
  const passed = sampleBaseballPitch(pitch, flightMs).z < 0
  let previous = null
  ctx.save()
  ctx.globalAlpha = passed ? 0.2 : 1
  ctx.lineCap = 'round'
  for (let index = 0; index <= 6; index++) {
    const sample = sampleBaseballPitch(pitch, flightMs - span + span * index / 6)
    const point = sample.visible ? layout.project(sample) : null
    if (previous && point) {
      ctx.strokeStyle = `rgba(255,245,207,${0.05 + 0.22 * index / 6})`
      ctx.lineWidth = Math.max(1, point.scale * BASEBALL_RULES.ballRadiusM * 1.4 * index / 6)
      ctx.beginPath()
      ctx.moveTo(previous.x, previous.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
    previous = point
  }
  ctx.restore()
  return drawBall(ctx, sampleBaseballPitch(pitch, flightMs), layout, passed ? 0.2 : 1, contrast)
}

function fixedAimRadius(center) {
  return Math.max(6, Math.min(10, center.scale * 0.035))
}

function drawPlateMarker(ctx, layout, marker, locale, fixedAim = null) {
  if (!marker) return null
  const point = layout.project(marker.point)
  const contact = marker.kind === 'contact'
  const label = locale === 'en' ? (contact ? 'CONTACT' : 'PLATE PASSAGE') : (contact ? '타격 접촉' : '존 앞면 통과')
  ctx.save()
  ctx.lineWidth = 2
  ctx.strokeStyle = contact ? '#ffe49b' : '#d4eddf'
  ctx.fillStyle = '#14392e'
  ctx.beginPath()
  if (contact) {
    ctx.moveTo(point.x, point.y - 7); ctx.lineTo(point.x + 7, point.y)
    ctx.lineTo(point.x, point.y + 7); ctx.lineTo(point.x - 7, point.y)
    ctx.closePath()
  } else {
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2)
  }
  ctx.fill(); ctx.stroke()
  ctx.font = '600 10px Arial, sans-serif'
  const labelWidth = ctx.measureText(label).width + 12
  const x = Math.max(4, Math.min(point.x - labelWidth / 2, ctx.canvas.width / (ctx.getTransform().a || 1) - labelWidth - 4))
  const viewHeight = ctx.canvas.height / (ctx.getTransform().d || 1)
  const aim = fixedAim ? layout.project({ x:fixedAim.x, y:fixedAim.y, z:0 }) : null
  // Keep both candidate labels inside the view and away from the fixed cross.
  const clearance = aim ? fixedAimRadius(aim) + 5 : 0
  const overlapsX = aim && x < aim.x + clearance && x + labelWidth > aim.x - clearance
  const below = overlapsX ? Math.max(point.y + 12, aim.y + clearance + 4) : point.y + 12
  const above = overlapsX ? Math.min(point.y - 30, aim.y - clearance - 22) : point.y - 30
  const candidates = [below, above].map(y => Math.max(4, Math.min(y, viewHeight - 22)))
  const overlap = y => overlapsX ? Math.max(0, Math.min(y + 18, aim.y + clearance) - Math.max(y, aim.y - clearance)) : 0
  const labelY = candidates.find(y => overlap(y) === 0) ?? candidates.reduce((best, y) => overlap(y) < overlap(best) ? y : best)
  ctx.fillStyle = 'rgba(12,39,31,.92)'
  ctx.fillRect(x, labelY, labelWidth, 18)
  ctx.fillStyle = contact ? '#ffe49b' : '#e3f4e9'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + 6, labelY + 9)
  ctx.restore()
  return {kind:marker.kind,timeMs:marker.timeMs,world:marker.point,screen:point}
}

function drawZone(ctx, layout, phase, contrast = false) {
  const zone = BASEBALL_RULES.zone
  const a = layout.project({ x: zone.left, y: zone.top, z: 0 })
  const b = layout.project({ x: zone.right, y: zone.bottom, z: 0 })
  const width = b.x - a.x
  const height = b.y - a.y
  ctx.save()
  ctx.fillStyle = contrast ? 'rgba(143,191,151,.14)' : 'rgba(18,50,41,.07)'
  ctx.fillRect(a.x, a.y, width, height)
  ctx.strokeStyle = phase === 'flight' ? 'rgba(255,246,201,.9)' : 'rgba(255,249,224,.66)'
  ctx.lineWidth = contrast ? 2.5 : 1.5
  ctx.strokeRect(a.x, a.y, width, height)
  ctx.setLineDash(contrast ? [] : [3, 6])
  ctx.strokeStyle = contrast ? 'rgba(255,249,224,.42)' : 'rgba(255,249,224,.3)'
  if (contrast) ctx.lineWidth = 1
  for (let i = 1; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(a.x + width * i / 3, a.y)
    ctx.lineTo(a.x + width * i / 3, b.y)
    ctx.moveTo(a.x, a.y + height * i / 3)
    ctx.lineTo(b.x, a.y + height * i / 3)
    ctx.stroke()
  }
  ctx.restore()
  return { left: a.x, top: a.y, right: b.x, bottom: b.y }
}

// 실제 배트와 같은 선분에 공 중심의 허용 범위만 덧그린다. 판정은 변경하지 않는다.
function drawGrowthContactGuide(ctx, layout, bat, radiusM, mode) {
  const baseRadius = BASEBALL_RULES.batRadiusM + BASEBALL_RULES.ballRadiusM
  if (!isNumber(radiusM) || radiusM < baseRadius - 1e-12 || radiusM > baseRadius * 1.12 + 1e-12 || !bat?.visible) return null
  const referencePreview = mode === 'preview' && Math.abs(bat.progress - BASEBALL_RULES.swingContactMs / BASEBALL_RULES.swingDurationMs) < 1e-12
  if (!bat.active && !referencePreview) return null
  const a = layout.project(bat.start), b = layout.project(bat.end)
  if (![a.x,a.y,a.scale,b.x,b.y,b.scale].every(isNumber) || a.scale <= 0 || b.scale <= 0) return null
  const width = radiusM * (a.scale + b.scale)
  ctx.save()
  ctx.globalAlpha = mode === 'review' ? .2 : .16
  ctx.strokeStyle = '#74d9a1'
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.setLineDash([])
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()
  ctx.restore()
  return { radiusM, width, start:{x:a.x,y:a.y}, end:{x:b.x,y:b.y} }
}

function drawBatGuide(ctx, layout, bat, mode, active, growthContactRadiusM = null) {
  if (!bat?.visible) return
  drawGrowthContactGuide(ctx,layout,bat,growthContactRadiusM,mode)
  const a = layout.project(bat.start)
  const b = layout.project(bat.end)
  const center = layout.project(bat.sweetSpot)
  ctx.save()
  // A translucent contact guide, rather than a second opaque bat over the approved art.
  // Both endpoints, its thickness and its motion come from the collision geometry.
  const live = mode === 'live'
  const review = mode === 'review'
  const alpha = review ? (bat.active ? 0.6 : 0.4) : live ? (bat.active ? 0.8 : 0.25) : (active ? 0.4 : 0.3)
  const lineWidth = Math.max(2, bat.radius * (a.scale + b.scale))
  ctx.globalAlpha = alpha
  ctx.lineCap = live ? 'round' : 'butt'
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = review ? '#e8a2d9' : live ? '#f3d68b' : '#89e8df'
  if (!live) ctx.setLineDash(review ? [4, 6] : [5, 5])
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.setLineDash([])
  if (live) {
    ctx.strokeStyle = '#fff9df'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  const radius = Math.max(4, center.scale * 0.025)
  if (live || review) {
    ctx.lineWidth = 1.7
    ctx.beginPath()
    if (review) ctx.rect(center.x - radius, center.y - radius, radius * 2, radius * 2)
    else ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.stroke()
    if (live) {
      ctx.fillStyle = '#f3d68b'
      ctx.beginPath()
      ctx.arc(center.x, center.y, Math.max(2, Math.min(4, radius * 0.55)), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
  return {batStart:a,batEnd:b,sweetSpot:center,batLineWidth:lineWidth,batAlpha:alpha,batDrawn:true}
}

function drawFixedAim(ctx, layout, aim) {
  if (!aim) return null
  const center = layout.project({ x:aim.x, y:aim.y, z:0 })
  const radius = fixedAimRadius(center)
  ctx.save()
  ctx.globalAlpha = 0.95
  ctx.lineWidth = 3.5
  ctx.strokeStyle = 'rgba(11,38,34,.85)'
  const mark = () => {
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.moveTo(center.x - radius - 3, center.y)
    ctx.lineTo(center.x + radius + 3, center.y)
    ctx.moveTo(center.x, center.y - radius - 3)
    ctx.lineTo(center.x, center.y + radius + 3)
    ctx.stroke()
  }
  mark()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#89e8df'
  mark()
  ctx.restore()
  return center
}

function drawFieldMiniMap(ctx,width,sample,locale){
  if(!sample?.started)return
  const size=width<420?100:132,pad=10,x=width-size-pad,y=pad,scale=size/260
  const p=point=>({x:130+point.x*1.5,y:218-point.z*1.5})
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale)
  ctx.fillStyle='rgba(12,39,31,.88)';ctx.fillRect(0,0,260,250)
  ctx.strokeStyle='rgba(224,226,189,.65)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(130,218)
  for(let i=0;i<=36;i++){
    const angle=(-45+i*2.5)*Math.PI/180,distance=getBaseballFieldFenceDistance(-45+i*2.5)
    const point=p({x:Math.sin(angle)*distance,z:Math.cos(angle)*distance});ctx.lineTo(point.x,point.y)
  }
  ctx.closePath();ctx.stroke()
  const edge=BASEBALL_FIELD_MODEL.baseDistanceM/Math.SQRT2*1.5
  ctx.strokeStyle='#839b87';ctx.beginPath();ctx.moveTo(130,218);ctx.lineTo(130+edge,218-edge);ctx.lineTo(130,218-edge*2);ctx.lineTo(130-edge,218-edge);ctx.closePath();ctx.stroke()
  ctx.strokeStyle='#f3d785';ctx.lineWidth=3;ctx.beginPath()
  sample.trace.forEach((point,index)=>{const q=p(point);if(index)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y)});ctx.stroke()
  const ball=p(sample.ball),runner=p(sample.runner.position)
  ctx.fillStyle='#fff9e8';ctx.beginPath();ctx.arc(ball.x,ball.y,4,0,Math.PI*2);ctx.fill()
  ctx.fillStyle='#85e1d5';ctx.beginPath();ctx.arc(runner.x,runner.y,5,0,Math.PI*2);ctx.fill()
  ctx.fillStyle='#e5dfba';ctx.font='22px sans-serif';ctx.textAlign='left';ctx.fillText(locale==='en'?'Ball · first-base leg':'타구 · 1루 구간',12,26)
  ctx.restore()
}

export default function BaseballScene({ mainClassName, focusEnabled = false, pitch, pitchStartAt = null, swingAt = null, swingAim = null, aim = { x: 0, y: 0.745 }, result = null, resultAt = null, phase = 'setup', handedness = 'right', team, jerseyNumber = '7', locale = 'ko', onAim, onSwing, onAssetsReady, fieldActions = null, keyboardFocus = false, imageLoader = null, feedbackOverlay = null, entranceOverlay = null, focusEntranceOverlay = null, feedbackStrength = 'normal',fieldTrajectory=null,postplayReaction=null,enablePostplay=false,presentationTime=null,observationEnabled=true,renderEnabled=true,comparisonPreview=false,growthContactRadiusM=null }) {
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const focusHostRef = useRef(null)
  const focusCanvasRef = useRef(null)
  const focusLayoutRef = useRef(null)
  const latest = useRef(null)
  const assetsRef = useRef(null)
  const sourceBankRef = useRef(null)
  const stagingRef = useRef(null)
  const postplayBankRef=useRef(null)
  const [postplayAssets,setPostplayAssets]=useState('idle')
  const [postplayRetry,setPostplayRetry]=useState(0)
  const postplayEpoch=useRef(0)
  const loadTimingRef = useRef(null)
  const assetPhaseRef = useRef('loading')
  const layoutRef = useRef(null)
  const [assetState, setAssetState] = useState('loading')
  const [hasPreview, setHasPreview] = useState(false)
  const [retry, setRetry] = useState(0)
  const hintId = useId()
  const focusHintId = useId()
  const observationRef = useRef(null)
  const observationStatusRef = useRef('idle:0:0')
  const observationInputRef = useRef(null)
  const inputModeRef = useRef(null)
  const [observationStatus, setObservationStatus] = useState({state:'idle',completed:0,aborted:0})
  const [observationData, setObservationData] = useState('[]')
  if (process.env.NODE_ENV === 'development' && observationEnabled && !observationRef.current) observationRef.current = createBaseballObservation()

  function publishObservation() {
    const observation = observationRef.current
    if (!observation) return
    const status = observation.status()
    const key = `${status.state}:${status.completed}:${status.aborted}`
    if (observationStatusRef.current === key) return
    observationStatusRef.current = key
    setObservationStatus(status)
    // Publish only finished pitches; no future course or predicted hit is exposed.
    setObservationData(JSON.stringify(observation.snapshot()))
  }
  function armObservation() {
    // Recreate on explicit re-arm: Fast Refresh can retain an older helper closure.
    observationRef.current = createBaseballObservation()
    observationRef.current.arm(performance.now())
    observationInputRef.current = null
    publishObservation()
  }
  function stopObservation() { observationRef.current?.stop(); publishObservation() }
  function recordObservationInput(input) {
    if (process.env.NODE_ENV !== 'development' || !['windup','flight'].includes(latest.current.phase) ||
        isNumber(latest.current.swingAt) || observationInputRef.current?.startAt === latest.current.pitchStartAt) return
    observationInputRef.current = {...input,startAt:latest.current.pitchStartAt}
  }
  function observeKeyboard(event) {
    if (!assetsMatchSelection() && ['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code)) inputModeRef.current = 'keyboard'
    if (event.code === 'Space' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent?.isComposing) {
      recordObservationInput({at:performance.now(),source:'keyboard',code:'Space',surface:event.currentTarget.dataset.baseballInput})
    }
  }
  const assetLoader = process.env.NODE_ENV === 'development' && typeof imageLoader === 'function' ? imageLoader : loadImage
  latest.current = { focusEnabled, pitch, pitchStartAt, swingAt, swingAim, aim, result, resultAt, phase, handedness, team, jerseyNumber, locale, onAim, onSwing, onAssetsReady, assetLoader,
    fieldTrajectory,postplayReaction,enablePostplay,postplayAssets,presentationTime,comparisonPreview,growthContactRadiusM,
    feedbackStrength: feedbackStrength === 'off' ? 'off' : reducedMotion ? 'reduced' : feedbackStrength }
  const uniformKey = materialKey(team)

  useEffect(()=>{
    const visibility=()=>{if(document.hidden)postplayEpoch.current++;else if(!postplayBankRef.current)setPostplayRetry(value=>value+1)}
    document.addEventListener('visibilitychange',visibility)
    return()=>document.removeEventListener('visibilitychange',visibility)
  },[])

  useEffect(()=>{
    const old=postplayBankRef.current
    postplayBankRef.current=null;releaseUniforms(old?.frames)
    if(!enablePostplay){setPostplayAssets('idle');return}
    let cancelled=false
    const epoch=postplayEpoch.current
    const hand=handedness==='left'?'left':'right',frames=new Map(),descriptors=getBaseballPostplayFrames(hand)
    setPostplayAssets('loading')
    const current=()=>!cancelled&&epoch===postplayEpoch.current&&!document.hidden&&latest.current.enablePostplay&&latest.current.handedness===hand&&materialKey(latest.current.team)===uniformKey
    void(async()=>{
      try{
        const texture=team?.undersleeve?await loadBaseballClothTexture():null
        // Optional frames never join the eight-pose input-ready barrier or all-team cache.
        for(const [name,descriptor]of Object.entries(descriptors)){
          const image=await assetLoader(descriptor.src)
          if(!current())return
          if(image.naturalWidth!==descriptor.width||image.naturalHeight!==descriptor.height)throw new Error('Postplay dimensions')
          await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)))
          if(!current())return
          frames.set(name,makeUniform(image,team,descriptor,hand,texture))
        }
        if(!current())return
        postplayBankRef.current={hand,material:uniformKey,descriptors,frames,readyAt:performance.now()};setPostplayAssets('ready')
      }catch{if(current())setPostplayAssets('error')}
      finally{if(!postplayBankRef.current||postplayBankRef.current.frames!==frames)releaseUniforms(frames)}
    })()
    return()=>{cancelled=true;if(postplayBankRef.current?.frames===frames)postplayBankRef.current=null;releaseUniforms(frames)}
  },[enablePostplay,handedness,uniformKey,assetLoader,retry,postplayRetry])

  function assetsMatchSelection() {
    const current = latest.current, assets = assetsRef.current
    return assetPhaseRef.current === 'ready' && assets?.presented === true && assets?.hand === (current.handedness === 'left' ? 'left' : 'right') && assets?.material === materialKey(current.team)
  }

  useEffect(() => {
    const hand = handedness === 'left' ? 'left' : 'right'
    stagingRef.current?.cancel()
    const previous = assetsRef.current
    const timing = process.env.NODE_ENV === 'development' ? {
      startedAt:performance.now(), sourceReadyMs:null, backgroundReadyMs:null, pitcherReadyMs:null, battersReadyMs:null,
      composeMs:0, composedFrames:0, bankReadyMs:null, inputReadyMs:null, finishedMs:null, status:'loading', reused:false,
    } : null
    if (process.env.NODE_ENV === 'development') loadTimingRef.current = timing
    // A rapid selection change may return to the still-visible completed bank.
    if (previous?.hand === hand && previous.material === uniformKey && previous.loader === assetLoader) {
      if (process.env.NODE_ENV === 'development' && timing) {
        Object.assign(timing, { sourceReadyMs:0, composeMs:0, composedFrames:8, bankReadyMs:0,
          inputReadyMs:previous.presented ? 0 : null, finishedMs:previous.presented ? 0 : null, status:previous.presented ? 'ready' : 'loading', reused:true })
        previous.loadTiming = timing
      }
      sourceBankRef.current = previous.sourceBank
      assetPhaseRef.current = 'ready'
      setHasPreview(!previous.presented)
      setAssetState(previous.presented ? 'ready' : 'loading')
      latest.current.onAssetsReady?.(previous.presented === true, '')
      return undefined
    }
    assetPhaseRef.current = 'loading'
    setHasPreview(Boolean(previous?.lastFrame))
    setAssetState('loading')
    latest.current.onAssetsReady?.(false, '')
    const request = { cancelled:false, batter:new Map(), cancel:null }
    request.cancel = () => {
      request.cancelled = true
      if (process.env.NODE_ENV === 'development' && timing?.status === 'loading') { timing.status = 'cancelled'; timing.finishedMs = performance.now() - timing.startedAt }
      releaseUniforms(request.batter)
      request.batter = null
      if (stagingRef.current === request) stagingRef.current = null
    }
    stagingRef.current = request
    const current = () => !request.cancelled && stagingRef.current === request &&
      (latest.current.handedness === 'left' ? 'left' : 'right') === hand && materialKey(latest.current.team) === uniformKey && latest.current.assetLoader === assetLoader
    const descriptors = getBaseballBatterFrames(hand)
    const sourceKey = Object.values(descriptors).map(frame => frame.src).join('|')
    if (!sourceBankRef.current || sourceBankRef.current.key !== sourceKey || sourceBankRef.current.loader !== assetLoader) {
      const bank = { hand, key:sourceKey, promise:null, loader:assetLoader }
      sourceBankRef.current = bank
      bank.promise = loadBatterFrames(descriptors, () => sourceBankRef.current === bank, assetLoader)
      bank.promise.catch(() => { if (sourceBankRef.current === bank) sourceBankRef.current = null })
    }
    const bank = sourceBankRef.current
    let sourcePromises = [assetLoader(getBaseballSharedDeliverySrc(BACKDROP), sharedImageCache), bank.promise, assetLoader(getBaseballSharedDeliverySrc(`${SPRITES}/pitcher-v2.png`), sharedImageCache), team?.undersleeve ? loadBaseballClothTexture() : null]
    if (process.env.NODE_ENV === 'development' && timing) {
      const keys = ['backgroundReadyMs', 'battersReadyMs', 'pitcherReadyMs']
      sourcePromises = sourcePromises.map((promise, index) => keys[index] ? promise.then(value => { timing[keys[index]] = performance.now() - timing.startedAt; return value }) : promise)
    }
    Promise.all(sourcePromises).then(async ([background, originals, pitcher, texture]) => {
      if (!current()) return
      if (process.env.NODE_ENV === 'development' && timing) timing.sourceReadyMs = performance.now() - timing.startedAt
      // Let quick setup selections settle before an expensive full-resolution pass.
      if (previous) await new Promise(resolve => setTimeout(resolve, 60))
      for (const [name, image] of originals) {
        if (!current()) return
        // Paint the loading notice between material passes, not eight CPU tasks in a row.
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
        if (!current()) return
        const paintStartedAt = timing ? performance.now() : 0
        request.batter.set(name, makeUniform(image, team, descriptors[name], hand, texture))
        if (process.env.NODE_ENV === 'development' && timing) { timing.composeMs += performance.now() - paintStartedAt; timing.composedFrames++ }
      }
      if (!current()) return
      const batter = request.batter
      request.batter = null
      if (process.env.NODE_ENV === 'development' && timing) timing.bankReadyMs = performance.now() - timing.startedAt
      assetsRef.current = { background, batter, pitcher, descriptors, hand, material:uniformKey, sourceBank:bank, loader:assetLoader, presented:false,
        lastFrame:{state:{...latest.current},now:performance.now()} }
      if (process.env.NODE_ENV === 'development') assetsRef.current.loadTiming = timing
      stagingRef.current = null
      assetPhaseRef.current = 'ready'
      // The next RAF confirms the new bank was actually painted before enabling input.
      // Only this atomic swap retires the old eight canvases.
      releaseUniforms(previous?.batter)
    }).catch(() => {
      releaseUniforms(request.batter)
      request.batter = null
      if (!current()) return
      if (process.env.NODE_ENV === 'development' && timing) { timing.status = 'error'; timing.finishedMs = performance.now() - timing.startedAt }
      stagingRef.current = null
      assetPhaseRef.current = 'error'
      setAssetState('error')
      latest.current.onAssetsReady?.(false, latest.current.locale === 'en' ? 'The baseball images could not be loaded. Use Reload images to try again.' : '야구 이미지를 불러오지 못했습니다. 이미지 다시 불러오기로 재시도해 주세요.')
    })
    return request.cancel
  }, [handedness, uniformKey, retry, assetLoader])

  useEffect(() => () => { stagingRef.current?.cancel(); releaseUniforms(assetsRef.current?.batter); assetsRef.current = null; sourceBankRef.current = null }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!renderEnabled || !canvas || !host) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const focusHost = focusHostRef.current
    const focusCanvas = focusCanvasRef.current
    const focusCtx = focusCanvas?.getContext('2d')
    let frame
    let width = 0
    let height = 0
    let ratio = 1
    let focusWidth = 0
    let focusHeight = 0
    let lastDrawn = null
    const pitcherBlend = document.createElement('canvas')
    pitcherBlend.width = 444
    pitcherBlend.height = 444
    const numberPlans = new Map()
    const touchOnly = window.matchMedia('(hover: none) and (pointer: coarse)').matches
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      ratio = Math.min(2, window.devicePixelRatio || 1)
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
      }
      layoutRef.current = createBaseballProjection(createBaseballStage(width, height, latest.current.handedness))
      const focusRect = focusCanvas?.getBoundingClientRect()
      focusWidth = focusRect?.width || 0
      focusHeight = focusRect?.height || 0
      if (focusCanvas) {
        if (focusCanvas.width !== Math.max(1, Math.round(focusWidth * ratio)) || focusCanvas.height !== Math.max(1, Math.round(focusHeight * ratio))) {
          focusCanvas.width = Math.max(1, Math.round(focusWidth * ratio))
          focusCanvas.height = Math.max(1, Math.round(focusHeight * ratio))
        }
      }
    }
    resize()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    observer?.observe(host)
    if (focusHost) observer?.observe(focusHost)
    if (!observer) window.addEventListener('resize', resize)
    const render = clockNow => {
      const requested = latest.current
      const assets = assetsRef.current
      const selected = assetPhaseRef.current === 'ready' && assets?.hand === (requested.handedness === 'left' ? 'left' : 'right') && assets?.material === materialKey(requested.team)
      const frozen = selected ? null : assets?.lastFrame
      const state = frozen?.state || requested
      const previewClock=process.env.NODE_ENV==='development'&&isNumber(state.presentationTime)&&
        (state.fieldTrajectory?.origin==='preview'||state.postplayReaction?.origin==='preview'||state.comparisonPreview===true)
      const now = frozen?.now ?? (previewClock?state.presentationTime:clockNow)
      const signature = `${width}:${height}:${ratio}:${focusWidth}:${focusHeight}:${Boolean(state.focusEnabled)}`
      canvas.dataset.previewFrozen = String(Boolean(frozen))
      canvas.dataset.requestedTeam = requested.team?.id || ''
      canvas.dataset.assetPhase = assetPhaseRef.current
      if (process.env.NODE_ENV === 'development') {
        canvas.dataset.retainedFrames = String(assets?.batter.size || 0)
        canvas.dataset.stagingFrames = String(stagingRef.current?.batter?.size || 0)
        const timing = loadTimingRef.current
        const milliseconds = value => value === null || value === undefined ? '' : String(Math.round(value * 100) / 100)
        canvas.dataset.loadElapsedMs = timing ? milliseconds(timing.finishedMs ?? clockNow - timing.startedAt) : ''
        for (const key of ['sourceReadyMs','backgroundReadyMs','pitcherReadyMs','battersReadyMs','composeMs','bankReadyMs','inputReadyMs']) canvas.dataset[key] = milliseconds(timing?.[key])
        canvas.dataset.composedFrames = String(timing?.composedFrames || 0)
        canvas.dataset.loadStatus = timing?.status || ''
        canvas.dataset.loadReused = String(Boolean(timing?.reused))
      }
      // An unchanged frozen view already owns the exact previous bitmap. Avoid
      // repainting it while the main thread is preparing the replacement bank.
      if (frozen && lastDrawn?.assets === assets && lastDrawn.signature === signature) {
        frame = requestAnimationFrame(render)
        return
      }
      const stage = createBaseballStage(width, height, state.handedness)
      const layout = createBaseballProjection(stage)
      layoutRef.current = layout
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#263f36'
      ctx.fillRect(0, 0, width, height)
      canvas.dataset.assetKey = ''
      canvas.dataset.jerseyVisible = 'false'
      canvas.dataset.motionElapsed = '-1'
      const focusLayout = state.focusEnabled && focusWidth > 32 && focusHeight > 32
        ? createBaseballFocusProjection(layout, { width:focusWidth, height:focusHeight }) : null
      focusLayoutRef.current = focusLayout
      if (focusCtx && focusLayout) {
        focusCtx.setTransform(ratio, 0, 0, ratio, 0, 0)
        focusCtx.clearRect(0, 0, focusWidth, focusHeight)
        focusCtx.fillStyle = '#102d25'
        focusCtx.fillRect(0, 0, focusWidth, focusHeight)
      }
      if (assets && layout && (selected || frozen)) {
        cover(ctx, assets.background, stage)
        const shade = ctx.createLinearGradient(0, 0, 0, height)
        shade.addColorStop(0, 'rgba(9,26,19,.03)')
        shade.addColorStop(1, 'rgba(9,26,19,.15)')
        ctx.fillStyle = shade
        ctx.fillRect(0, 0, width, height)
        const start = isNumber(state.pitchStartAt) ? state.pitchStartAt : null
        const elapsed = start === null ? -1 : now - start
        const flightMs = elapsed - BASEBALL_RULES.windupMs
        const moving = ['windup', 'flight', 'result', 'complete'].includes(state.phase)
        const pitcherHand = state.pitch?.pitcherHandedness || 'right'
        const pitcherMotion = sampleBaseballPitcherMotion(moving && start !== null ? elapsed : null, pitcherHand)
        const pitcherPlacement = createBaseballPitcherPlacement(layout, { ...getBaseballPitcherSpriteGeometry(pitcherHand), release:state.pitch?.release })
        ellipse(ctx, pitcherPlacement.footPoint.x, pitcherPlacement.footPoint.y, Math.max(4, pitcherPlacement.width * 0.13), Math.max(1, pitcherPlacement.height * 0.018), 'rgba(18,32,20,.18)')
        drawPitcher(ctx, assets.pitcher, pitcherMotion, pitcherPlacement, pitcherBlend)
        const zoneRect = drawZone(ctx, layout, state.phase)
        canvas.dataset.zoneLeft = String(zoneRect.left)
        canvas.dataset.zoneTop = String(zoneRect.top)
        canvas.dataset.zoneRight = String(zoneRect.right)
        canvas.dataset.zoneBottom = String(zoneRect.bottom)
        const swingElapsed = isNumber(state.swingAt) && start !== null ? flightMs - state.swingAt : null
        // Presentation may settle after 520ms; physics and the game deadline never use this tail.
        const motion = sampleBaseballBatterAnimation(moving ? swingElapsed : null, assets.hand, { visualTail:true })
        const placement = batterPlacement(stage, assets.descriptors, assets.batter)
        const number = /^[0-9]{1,2}$/.test(String(state.jerseyNumber)) ? String(state.jerseyNumber) : '7'
        const numberKey = `${assets.hand}:${motion.name}:${number}`
        if (!numberPlans.has(numberKey)) {
          numberPlans.set(numberKey, fitBackNumber(ctx, motion, number))
          while (numberPlans.size > 32) numberPlans.delete(numberPlans.keys().next().value)
        }
        const fieldSample=state.fieldTrajectory?sampleBaseballFieldPresentation(state.fieldTrajectory.presentation,now-state.fieldTrajectory.startAt):null
        const postMotion=sampleBaseballPostplayMotion({trajectory:state.fieldTrajectory,reaction:state.postplayReaction,nowMs:now,strength:state.feedbackStrength})
        const postBank=postplayBankRef.current
        const reactionPose=['strikeout','walk'].includes(postMotion?.kind)
        const displayStarts=reactionPose?state.postplayReaction?.startAt:state.fieldTrajectory?state.fieldTrajectory.startAt+state.fieldTrajectory.presentation.runner.startDelayMs:null
        const postFrame=postBank?.hand===assets.hand&&postBank.material===materialKey(state.team)&&postMotion&&isNumber(displayStarts)&&(previewClock||postBank.readyAt<=displayStarts)?postBank.frames.get(postMotion.frame):null
        let numberVisible=false
        if(postFrame&&postMotion){
          const descriptor=postBank.descriptors[postMotion.frame],key=`postplay:${assets.hand}:${descriptor.name}:${number}`
          if(!numberPlans.has(key)){numberPlans.set(key,fitBackNumber(ctx,descriptor,number));while(numberPlans.size>32)numberPlans.delete(numberPlans.keys().next().value)}
          if(postMotion.alpha<1&&['lower','strikeout','walk'].includes(postMotion.kind)){
            ctx.save();ctx.globalAlpha=1-postMotion.alpha
            drawBatter(ctx,assets.batter.get(motion.name).image,motion,placement,number,numberPlans.get(numberKey),state.team);ctx.restore()
          }
          const home=layout.project({x:0,y:0,z:0}),point=layout.project({...postMotion.position,y:0}),ratio=point.scale/home.scale
          const moved={...placement,x:placement.x+(point.x-home.x),y:placement.y+(point.ground-home.ground),scale:placement.scale*ratio}
          ctx.save();ctx.globalAlpha=postMotion.alpha
          if(postMotion.alpha>0){
            ellipse(ctx,moved.x,moved.y-2,Math.max(5,40*moved.scale),Math.max(1,7*moved.scale),'rgba(26,29,17,.22)')
            numberVisible=drawBatter(ctx,postFrame.image,descriptor,moved,number,numberPlans.get(key),state.team)
          }
          ctx.restore()
        }else{
          ellipse(ctx, placement.stance.x, placement.stance.y - 2, Math.min(56, motion.width * placement.scale * 0.23), Math.min(9, motion.height * placement.scale * 0.014), 'rgba(26,29,17,.25)')
          numberVisible=drawBatter(ctx,assets.batter.get(motion.name).image,motion,placement,number,numberPlans.get(numberKey),state.team)
        }
        let mainBall = null, mainGuide = null, focusBall = null, focusGuide = null, observedFocusZone = null
        let mainMarker = null, focusMarker = null, mainAim = null, focusAim = null, mainReview = null, focusReview = null
        const marker = getBaseballPlateMarker({pitch:state.pitch,flightMs,result:state.result,moving:moving && start !== null})
        const batted = state.result?.contacted === true && isNumber(state.resultAt) && now >= state.resultAt && (moving||Boolean(fieldSample?.started))
        // D/E fair balls must use the resolved path. Never replace a missing or
        // rejected snapshot with an arc that can continue through a catch/wall.
        const battedPoint=batted?(fieldSample?.ball||(!state.enablePostplay||state.result?.outcome==='foul'
          ?sampleBaseballBattedBall(state.result,Math.max(0,now-state.resultAt)):null)):null
        if (batted) {
          mainBall = drawBall(ctx, battedPoint, layout, 1, Boolean(focusLayout))
          drawContactImpact(ctx, layout, state.result, now - state.resultAt, state.feedbackStrength)
        } else if (state.pitch && flightMs >= 0 && moving) {
          mainBall = drawPitchBall(ctx, state.pitch, flightMs, layout, true)
        }
        const presentation = getBaseballBatPresentation({ phase:state.phase, pitch:state.pitch, flightMs,
          swingAt:state.swingAt, swingAim:state.swingAim, aim:state.aim, handedness:assets.hand, result:state.result, marker })
        const { hasSwing } = presentation
        // Current motion and an already-observed plate snapshot are separate layers.
        const guide = presentation.liveBat || presentation.previewBat
        const touchPreview = (inputModeRef.current || (touchOnly ? 'touch' : 'mouse')) === 'touch'
        const showGuide = presentation.showLive || (presentation.showPreview && !touchPreview)
        const showAim = presentation.showFixedAim && (hasSwing || !touchPreview)
        if (presentation.showReview) {
          mainReview = { ...drawBatGuide(ctx, layout, presentation.reviewBat, 'review', false, state.growthContactRadiusM),
            timeMs:presentation.reviewAtMs, kind:presentation.reviewKind }
        }
        if (showGuide) {
          mainGuide = drawBatGuide(ctx, layout, guide, hasSwing ? 'live' : 'preview', ['windup', 'flight'].includes(state.phase), state.growthContactRadiusM)
        }
        if (focusCtx && focusLayout) {
          const focusZone = drawZone(focusCtx, focusLayout, state.phase, true)
          observedFocusZone = focusZone
          if (batted) {
            focusBall = drawBall(focusCtx, battedPoint, focusLayout, 1, true)
            drawContactImpact(focusCtx, focusLayout, state.result, now - state.resultAt, state.feedbackStrength)
          } else if (state.pitch && flightMs >= 0 && moving) {
            focusBall = drawPitchBall(focusCtx, state.pitch, flightMs, focusLayout, true)
          }
          if (presentation.showReview) focusReview = { ...drawBatGuide(focusCtx, focusLayout, presentation.reviewBat, 'review', false, state.growthContactRadiusM),
            timeMs:presentation.reviewAtMs, kind:presentation.reviewKind }
          if (showGuide) focusGuide = drawBatGuide(focusCtx, focusLayout, guide, hasSwing ? 'live' : 'preview', ['windup', 'flight'].includes(state.phase), state.growthContactRadiusM)
          focusMarker = drawPlateMarker(focusCtx, focusLayout, marker, state.locale, showAim ? presentation.fixedAim : null)
          if (showAim) focusAim = drawFixedAim(focusCtx, focusLayout, presentation.fixedAim)
          focusCanvas.dataset.plateMarker = marker?.kind || ''
          focusCanvas.dataset.zoom = String(focusLayout.transform.zoom)
          focusCanvas.dataset.zoneLeft = String(focusZone.left)
          focusCanvas.dataset.zoneTop = String(focusZone.top)
          focusCanvas.dataset.zoneRight = String(focusZone.right)
          focusCanvas.dataset.zoneBottom = String(focusZone.bottom)
          focusCanvas.dataset.flightTime = String(Math.round(Math.max(0, flightMs)))
          focusCanvas.dataset.lockedAimX = hasSwing ? String((state.swingAim || state.aim).x) : ''
          focusCanvas.dataset.lockedAimY = hasSwing ? String((state.swingAim || state.aim).y) : ''
          focusCanvas.dataset.impactAt = batted ? String(state.result.contactAtMs) : ''
        }
        mainMarker = drawPlateMarker(ctx, layout, marker, state.locale, showAim ? presentation.fixedAim : null)
        if (showAim) mainAim = drawFixedAim(ctx, layout, presentation.fixedAim)
        if(fieldSample)drawFieldMiniMap(ctx,width,fieldSample,state.locale)
        canvas.dataset.fieldPath=fieldSample?'resolved-path':''
        canvas.dataset.fieldBallTime=fieldSample?String(fieldSample.ball?.timeMs??''):''
        canvas.dataset.postplayFrame=postFrame?postMotion.frame:''
        canvas.dataset.postplayKind=postFrame?postMotion.kind:''
        canvas.dataset.postplayAssets=state.postplayAssets
        canvas.dataset.plateMarker = marker?.kind || ''
        canvas.dataset.guideMode = hasSwing ? 'swing' : touchPreview ? 'tap-to-aim' : 'preview'
        canvas.dataset.reviewMode = presentation.showReview ? 'plate-review' : presentation.reviewKind ? presentation.noReviewReason || '' : ''
        for (const [key, value] of Object.entries({ fixedAim:mainAim, liveBatCenter:hasSwing ? mainGuide?.sweetSpot : null, reviewBatCenter:mainReview?.sweetSpot })) {
          canvas.dataset[`${key}X`] = value ? String(value.x) : ''
          canvas.dataset[`${key}Y`] = value ? String(value.y) : ''
        }
        canvas.dataset.batterFrame = String(BASEBALL_BATTER_FRAME_NAMES.indexOf(motion.name))
        canvas.dataset.assetKey = `${assets.hand}:${motion.name}`
        canvas.dataset.poseRevision = motion.poseRevision
        canvas.dataset.jerseyVisible = String(numberVisible)
        canvas.dataset.motionElapsed = String(isNumber(swingElapsed) ? Math.round(swingElapsed) : -1)
        canvas.dataset.batterScale = String(placement.scale)
        canvas.dataset.batterAnchorX = String(placement.x)
        canvas.dataset.batterAnchorY = String(placement.y)
        canvas.dataset.batterRegistration = 'two-foot-support'
        canvas.dataset.uniformVersion = BASEBALL_UNIFORM_VERSION
        canvas.dataset.uniformTeam = state.team?.id || ''
        canvas.dataset.uniformProfile = state.team?.uniformProfile || ''
        canvas.dataset.batterStanceX = String(placement.stance.x)
        canvas.dataset.batterStanceY = String(placement.stance.y)
        canvas.dataset.boxCenterX = String(stage.stance.x)
        canvas.dataset.boxCenterY = String(stage.stance.y)
        canvas.dataset.pitcherFrame = String(pitcherMotion.frame)
        canvas.dataset.pitcherHandedness = pitcherHand
        canvas.dataset.pitchType = state.pitch?.type || 'four-seam'
        canvas.dataset.pitchSpeed = String(state.pitch?.speedKmh || 120)
        canvas.dataset.pitcherLayers = pitcherMotion.layers.map(layer => `${layer.frame}:${layer.alpha.toFixed(3)}`).join(',')
        canvas.dataset.flightTime = String(Math.round(Math.max(0, flightMs)))
        canvas.dataset.pitchDuration = state.pitch ? String(state.pitch.flightTimeMs) : ''
        canvas.dataset.releaseX = String(pitcherPlacement.releasePoint.x)
        canvas.dataset.releaseY = String(pitcherPlacement.releasePoint.y)
        canvas.dataset.releaseHandX = String(pitcherPlacement.handPoint.x)
        canvas.dataset.releaseHandY = String(pitcherPlacement.handPoint.y)
        canvas.dataset.lockedAimX = hasSwing ? String((state.swingAim || state.aim).x) : ''
        canvas.dataset.lockedAimY = hasSwing ? String((state.swingAim || state.aim).y) : ''
        canvas.dataset.impactAt = batted ? String(state.result.contactAtMs) : ''
        if (selected) {
          assets.lastFrame = {state:{...requested},now}
          if (!assets.presented) {
            assets.presented = true
            if (process.env.NODE_ENV === 'development' && assets.loadTiming) {
              assets.loadTiming.inputReadyMs = performance.now() - assets.loadTiming.startedAt
              assets.loadTiming.finishedMs = assets.loadTiming.inputReadyMs
              assets.loadTiming.status = 'ready'
            }
            setHasPreview(false)
            setAssetState('ready')
            latest.current.onAssetsReady?.(true, '')
          }
        }
        lastDrawn = {assets,signature}
        if (process.env.NODE_ENV === 'development' && selected && observationRef.current) {
          observationRef.current.capture({now,startAt:start,phase:state.phase,pitch:state.pitch,handedness:assets.hand,
            swingAt:state.swingAt,aim:state.aim,swingAim:state.swingAim,input:observationInputRef.current,result:state.result,
            frame:{flightMs,swingElapsedMs:swingElapsed,batted,resultAt:state.resultAt,ball:mainBall?.world||null,bat:guide,reviewBat:presentation.reviewBat,
              main:{ball:mainBall||null,...mainGuide,marker:mainMarker,batDrawn:Boolean(mainGuide),zone:zoneRect,fixedAim:mainAim,review:mainReview},
              focus:focusLayout?{ball:focusBall||null,...focusGuide,marker:focusMarker,batDrawn:Boolean(focusGuide),zone:observedFocusZone,fixedAim:focusAim,review:focusReview}:null,
              motion:{name:motion.name,footAnchor:motion.footAnchor,registrationAnchor:motion.registrationAnchor},placement,width,height,ratio}})
          publishObservation()
        }
      }
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); if (!observer) window.removeEventListener('resize', resize) }
  }, [renderEnabled])

  function pointFor(event) {
    if(!renderEnabled)return null
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const layout = target === focusCanvasRef.current ? (latest.current.focusEnabled ? focusLayoutRef.current : null) : layoutRef.current
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (layout?.viewport && (x < layout.viewport.left || x > layout.viewport.right || y < layout.viewport.top || y > layout.viewport.bottom)) return null
    return layout?.unproject(x, y)
  }

  function pointerMove(event) {
    if (!event.isPrimary || !assetsMatchSelection()) return
    inputModeRef.current = event.pointerType === 'touch' ? 'touch' : 'mouse'
    // A touch has no hover target. Its first valid tap locks aim and swings.
    if (event.pointerType === 'touch') return
    const point = pointFor(event)
    if (point) latest.current.onAim?.(point)
  }

  function pointerDown(event) {
    if (!event.isPrimary || event.button !== 0 || !assetsMatchSelection() || !['windup', 'flight'].includes(latest.current.phase)) return
    const point = pointFor(event)
    if (!point) return
    inputModeRef.current = event.pointerType === 'touch' ? 'touch' : 'mouse'
    if (process.env.NODE_ENV === 'development') {
      const rect = event.currentTarget.getBoundingClientRect()
      recordObservationInput({at:performance.now(),source:'pointer',surface:event.currentTarget.dataset.baseballInput,
        pointerType:event.pointerType,x:event.clientX-rect.left,y:event.clientY-rect.top,point})
    }
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    latest.current.onAim?.(point)
    latest.current.onSwing?.(point, { source:'pointer', surface:event.currentTarget.dataset.baseballInput, pointerType:event.pointerType })
  }

  const english = locale === 'en'
  const reviewNotice = result && !isNumber(swingAt)
    ? (english ? 'No swing at the plate, so there is no bat to review.' : '스윙하지 않아 판정 순간의 배트는 없습니다.')
    : result && result.swingElapsedMs < 0
      ? (english ? 'The ball passed before the swing started; no bat review is shown.' : '공이 지난 뒤 스윙을 시작해 판정 순간의 배트는 없습니다.')
      : result && result.swingElapsedMs >= BASEBALL_RULES.swingDurationMs
        ? (english ? 'The swing had already ended when the ball passed.' : '공이 지날 때는 이미 스윙이 끝났습니다.')
        : (english ? '⊕ is the fixed bat center. The gold bar turns around it; 110ms after input is the reference timing.' : '⊕는 고정된 배트 중심입니다. 금색 막대는 그 자리에서 기울기만 바뀌며, 입력 후 110ms가 기준 타이밍입니다.')
  return (
    <>
    <div className={styles.stack} data-baseball-views="true" data-focus-enabled={focusEnabled} data-baseball-render-enabled={renderEnabled}>
    <div className={mainClassName}>
    <div ref={hostRef} className={styles.scene} data-phase={phase} data-assets={assetState} data-postplay-assets={postplayAssets} aria-busy={assetState === 'loading'}>
      <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} role="application"
        aria-label={english ? 'Baseball batting field' : '야구 타격 경기장'} aria-describedby={hintId}
        data-baseball-input="field" data-handedness={handedness} data-jersey-number={jerseyNumber} data-keyboard-focus={keyboardFocus} aria-disabled={assetState !== 'ready'}
        onPointerMove={pointerMove} onPointerDown={pointerDown} onKeyDownCapture={observeKeyboard} />
      {feedbackOverlay}
      {entranceOverlay}
      <p className={styles.srOnly} id={hintId}>{english ? 'Move the mouse to aim and click to swing. On touch screens, tap the position where the ball will reach the batting plane. The bat center stays at the cyan target after input. The gold bar turns around that center; the magenta dashed line and square show the bat at the plate.' : '마우스로 타격 위치를 조준하고 클릭해 스윙합니다. 터치 화면에서는 공이 타격 지점에 도착할 위치를 탭합니다. 입력 후 배트 중심은 청록 조준점에 고정됩니다. 금색 막대는 그 중심에서 기울기가 바뀌며, 자주색 점선과 네모는 판정 순간 복기입니다.'}</p>
      {assetState !== 'ready' && <div className={styles.assetNotice} role="status" aria-live="polite"
        style={hasPreview?{background:'linear-gradient(135deg,rgba(24,51,41,.68),rgba(13,37,30,.78))'}:undefined}>
        {assetState === 'loading' && <span className={styles.spinner} aria-hidden="true" />}
        <strong>{assetState === 'error' ? (english ? 'Images unavailable' : '이미지를 불러오지 못했습니다') : hasPreview ? (english ? 'Preparing your selected uniform' : '선택한 유니폼을 준비하고 있습니다') : (english ? 'Preparing the ballpark' : '경기장 이미지를 준비하고 있습니다')}</strong>
        {hasPreview && <span>{english ? 'The previous preview is paused. Play is available when the new images are ready.' : '이전 미리보기를 잠시 유지합니다. 새 이미지 준비 후 플레이할 수 있습니다.'}</span>}
        {assetState === 'error' && <span>{english ? 'Use the button below to retry.' : '아래 버튼으로 다시 시도해 주세요.'}</span>}
        {assetState === 'error' && <button type="button" className={styles.retry} onClick={() => setRetry(value => value + 1)}>{english ? 'Reload images' : '이미지 다시 불러오기'}</button>}
      </div>}
    </div>
    </div>
    <div id="baseball-batting-close-up" className={styles.focusPanel}>
      <div className={styles.focusHeading}><strong>{english ? 'Batting close-up' : '확대 타격'}</strong><span>{english ? 'Tap the contact point' : '맞힐 위치를 탭하세요'}</span></div>
      <div ref={focusHostRef} className={styles.focusSurface}>
        <canvas ref={focusCanvasRef} className={styles.canvas} tabIndex={0} role="application"
          data-baseball-input="focus" aria-label={english ? 'Enlarged batting zone' : '확대 타격 영역'} aria-describedby={focusHintId}
          aria-disabled={assetState !== 'ready'} onPointerMove={pointerMove} onPointerDown={pointerDown} onKeyDownCapture={observeKeyboard} />
        {focusEnabled && feedbackOverlay}
        {focusEnabled&&focusEntranceOverlay&&<div style={{position:'absolute',top:8,left:8,right:8,height:34,pointerEvents:'none',zIndex:4}}>{focusEntranceOverlay}</div>}
      </div>
      <p className={styles.srOnly} id={focusHintId}>{english ? 'The same pitch and bat, enlarged. Tap to aim and swing. Arrow keys and Space also work. The bat center stays at the cyan target after input. The gold bar turns around that center; the magenta dashed line and square show the bat at the plate.' : '같은 공과 배트를 확대해서 보여줍니다. 맞힐 위치를 탭해 조준하고 스윙하세요. 방향키와 Space로도 조작할 수 있습니다. 입력 후 배트 중심은 청록 조준점에 고정됩니다. 금색 막대는 그 중심에서 기울기가 바뀌며, 자주색 점선과 네모는 판정 순간 복기입니다.'}</p>
    </div>
    </div>
    {fieldActions}
    {enablePostplay&&postplayAssets==='error'&&<div className={styles.postplayNotice} role="status"><span>{english?'Extra motion is unavailable. Batting remains available.':'후속 동작을 준비하지 못했습니다. 기존 자세로 타격할 수 있습니다.'}</span><button type="button" className={styles.retry} onClick={()=>setPostplayRetry(value=>value+1)}>{english?'Retry extra motion':'후속 동작 다시 준비'}</button></div>}
    <p className={styles.guideLegend}>
      <span className={styles.aimKey}><i aria-hidden="true">⊕</i>{english ? 'Fixed aim · dashed preview' : '고정 조준점 · 점선 예시'}</span>
      <span className={styles.liveKey}><i aria-hidden="true">━ ●</i>{english ? 'Swinging bat' : '현재 배트'}</span>
      <span className={styles.reviewKey}><i aria-hidden="true">┄ □</i>{english ? 'Bat at the plate' : '판정 순간 배트'}</span>
      <span className={styles.eventKey}><i aria-hidden="true">○ / ◇</i>{english ? 'Passage / contact' : '통과 / 접촉'}</span>
    </p>
    <p className={styles.guideNote} role="status">{reviewNotice}</p>
    {process.env.NODE_ENV === 'development' && observationEnabled && <section className={styles.observation} aria-label="개발용 타격 관찰"
      data-baseball-observation={observationStatus.state} data-completed={observationStatus.completed} data-aborted={observationStatus.aborted}>
      <div><strong>개발용 타격 관찰 · {observationStatus.completed}/10구</strong>
        <span>{['armed','recording'].includes(observationStatus.state)?'관찰 중':observationStatus.state==='complete'?'10구 수집 완료':'관찰 대기'}</span></div>
      <p>공·판정 막대·입력 시각만 이 탭에 임시 보관합니다. 10구 완료 후 자동으로 멈춥니다.</p>
      <div className={styles.observationActions}>
        <button type="button" onClick={armObservation} disabled={['armed','recording'].includes(observationStatus.state)}>10구 관찰 시작</button>
        <button type="button" onClick={stopObservation} disabled={!['armed','recording'].includes(observationStatus.state)}>관찰 중지</button>
      </div>
      <details><summary>완료한 관찰 데이터</summary><pre data-baseball-observation-data>{observationData}</pre></details>
    </section>}
    </>
  )
}
