import { useEffect, useRef, useState } from 'react'
import { loadSprintImage, peekSprintImage } from '@/lib/playground-sprint-image-cache.mjs'
import {
  getSprintBossAssets,
  getSprintBossPortraitSample,
  getSprintBossPortraitScale,
  getSprintBossSpriteRect,
  drawSprintBossSprite,
  drawSprintBossFallback,
} from '@/lib/playground-sprint-boss-sprites.mjs'

/** Transparent, contained portrait shared by the entrance and winner cut-in. */
export default function BossCharacter({ art = 'realistic', phase = 'intro', elapsedMs = 0, durationMs = 2600, className, locale = 'ko' }) {
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const lastGoodRef = useRef(null)
  const loadRef = useRef({ src: null, status: 'loading' })
  const redrawRef = useRef(() => {})
  const currentRef = useRef({ art, phase, elapsedMs, durationMs, locale })
  const [load, setLoad] = useState({ src: null, status: 'loading' })
  const requestedSource = getSprintBossAssets(art).poses.src
  const status = load.src === requestedSource ? load.status : 'loading'

  useEffect(() => {
    currentRef.current = { art, phase, elapsedMs, durationMs, locale }
    redrawRef.current()
  }, [art, phase, elapsedMs, durationMs, locale])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let disposed = false
    const redraw = () => {
      if (disposed) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const latest = currentRef.current
      const target = getSprintBossAssets(latest.art).poses.src
      let loadStatus = loadRef.current.src === target ? loadRef.current.status : 'loading'
      ctx.setTransform(canvas.width / 360, 0, 0, canvas.height / 360, 0, 0)
      // Keep the last decoded atlas and its own geometry while a new art loads.
      // The pose clock continues to use the current intro/victory state.
      const paint = display => {
        ctx.clearRect(0, 0, 360, 360)
        if (!display?.image) return null
        const sample = getSprintBossPortraitSample(display.art, latest.phase, latest.elapsedMs, latest.durationMs)
        const scale = getSprintBossPortraitScale(display.art)
        const source = getSprintBossAssets(display.art).poses
        const ground = 18 + Math.max(...source.frames.map(frame => frame.anchorY * frame.displayHeight)) * scale
        return drawSprintBossSprite(ctx, 180, ground, display.image, sample, { scale }) ? sample : null
      }
      let display = imageRef.current
      let sample = paint(display)
      if (display && !sample) {
        loadStatus = 'error'
        if (loadRef.current.src !== target || loadRef.current.status !== 'error') {
          loadRef.current = { src: target, status: 'error' }
          setLoad(loadRef.current)
        }
        // A draw failure must not replace a previously working atlas either.
        display = lastGoodRef.current !== display ? lastGoodRef.current : null
        sample = paint(display)
        imageRef.current = sample ? display : null
      }
      const drawn = Boolean(sample)
      if (drawn) lastGoodRef.current = display
      else {
        sample = getSprintBossPortraitSample(latest.art, latest.phase, latest.elapsedMs, latest.durationMs)
        // Procedural recovery is for an actual first-load failure, never loading.
        if (loadStatus === 'error') drawSprintBossFallback(ctx, 180, 326, sample, 2)
      }
      if (loadStatus === 'error' || !drawn) {
        const english = latest.locale === 'en'
        ctx.fillStyle = 'rgba(12,34,26,.92)'
        ctx.fillRect(20, 314, 320, 30)
        ctx.fillStyle = loadStatus === 'error' ? '#ffd1b0' : '#e4d79f'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(loadStatus === 'error'
          ? english ? 'Boss image unavailable' : '보스 이미지 로드 실패'
          : english ? 'Preparing boss image…' : '보스 이미지 준비 중…', 180, 329, 302)
      }
      canvas.dataset.bossFrame = String(sample.index)
      canvas.dataset.bossRenderer = drawn ? 'sprite' : loadStatus === 'error' ? 'fallback' : 'loading'
      canvas.dataset.bossDisplayedArt = drawn ? display.art : ''
      canvas.dataset.bossState = loadStatus
    }
    redrawRef.current = redraw
    const resize = () => {
      const box = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round((box.width || 360) * ratio))
      canvas.height = Math.max(1, Math.round(canvas.width))
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
    }
  }, [])

  useEffect(() => {
    const asset = getSprintBossAssets(art).poses
    const displayArt = art === 'pixel' ? 'pixel' : 'realistic'
    let disposed = false
    const settle = result => {
      if (disposed) return
      const image = result?.status === 'ready' ? result.image : null
      const valid = image && getSprintBossSpriteRect(image.naturalWidth, image.naturalHeight, 'poses', 0)
        && getSprintBossSpriteRect(image.naturalWidth, image.naturalHeight, 'poses', 7)
      if (valid) imageRef.current = { src: asset.src, art: displayArt, image }
      loadRef.current = { src: asset.src, status: valid ? 'ready' : 'error' }
      setLoad(loadRef.current)
      redrawRef.current()
    }
    const cached = peekSprintImage(asset.src)
    if (cached && cached.status !== 'loading') settle(cached)
    else {
      loadRef.current = { src: asset.src, status: 'loading' }
      setLoad(loadRef.current)
      redrawRef.current()
      loadSprintImage(asset.src).then(settle)
    }
    return () => {
      disposed = true
    }
  }, [art])

  return <canvas ref={canvasRef} className={className} width={360} height={360}
    data-boss-art={art} data-boss-phase={phase} data-boss-state={status}
    style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', aspectRatio: '1' }}
    role="img" aria-busy={status === 'loading'} aria-label={locale === 'en'
      ? `Lusain Volt lightning celebration${status === 'error' ? ' · boss image unavailable' : status === 'loading' ? ' · image loading' : ''}`
      : `루사인 볼트 번개 세레머니${status === 'error' ? ' · 보스 이미지 로드 실패' : status === 'loading' ? ' · 이미지 준비 중' : ''}`} />
}
