export class BaseballImageLoadError extends Error {
  constructor(code, cause) {
    const messages = { source:'Invalid image source', load:'Image unavailable', decode:'Image decoding failed', timeout:'Image timeout', dimensions:'Invalid image dimensions' }
    super(messages[code] || 'Image unavailable', cause ? { cause } : undefined)
    this.name = 'BaseballImageLoadError'
    this.code = code
  }
}

/** Browser defaults are lazy; tests can supply Image and a deterministic clock. */
export function createBaseballImageLoader({
  createImage = () => new Image(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = timer => clearTimeout(timer),
  timeoutMs = 20000,
} = {}) {
  const cache = new Map()
  return function loadBaseballImage(src, options = {}) {
    if (typeof src !== 'string' || !src) return Promise.reject(new BaseballImageLoadError('source'))
    const { width, height, minWidth = 0, minHeight = 0 } = options
    const store = options.cache === true ? cache : options.cache && typeof options.cache.get === 'function' ? options.cache : null
    const key = JSON.stringify([src, width ?? null, height ?? null, minWidth, minHeight])
    if (store?.has(key)) return store.get(key)
    const promise = new Promise((resolve, reject) => {
      let image, timer, settled = false, decoding = false
      const finish = error => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimer(timer)
        if (image) { image.onload = null; image.onerror = null }
        if (error) reject(error)
        else resolve(image)
      }
      try {
        image = createImage()
        timer = setTimer(() => finish(new BaseballImageLoadError('timeout')), timeoutMs)
        image.onload = async () => {
          if (settled || decoding) return
          decoding = true
          try {
            await image.decode()
          } catch (cause) {
            finish(new BaseballImageLoadError('decode', cause))
            return
          }
          if (settled) return
          if (!Number.isFinite(image.naturalWidth) || !Number.isFinite(image.naturalHeight) ||
              image.naturalWidth <= 0 || image.naturalHeight <= 0 || image.naturalWidth < minWidth || image.naturalHeight < minHeight ||
              (width !== undefined && image.naturalWidth !== width) || (height !== undefined && image.naturalHeight !== height)) {
            finish(new BaseballImageLoadError('dimensions'))
            return
          }
          finish()
        }
        image.onerror = event => finish(new BaseballImageLoadError('load', event instanceof Error ? event : undefined))
        image.decoding = 'async'
        image.src = src
      } catch (cause) {
        finish(new BaseballImageLoadError('load', cause))
      }
    }).catch(error => {
      // An obsolete failure must never evict a later successful request.
      if (store?.get(key) === promise) store.delete(key)
      throw error
    })
    store?.set(key, promise)
    return promise
  }
}

/** Selected-hand source frames, decoded in pairs; superseded banks never publish. */
export async function loadBaseballImageBank(descriptors, { loadImage, isCurrent, sourceFor }) {
  const entries = Object.entries(descriptors)
  const frames = new Map()
  for (let index = 0; index < entries.length; index += 2) {
    if (!isCurrent()) throw new Error('Batter request superseded')
    const batch = await Promise.all(entries.slice(index, index + 2).map(async ([name, descriptor]) => {
      const image = await loadImage(sourceFor(descriptor))
      if (image.naturalWidth !== descriptor.width || image.naturalHeight !== descriptor.height) throw new BaseballImageLoadError('dimensions')
      return [name, image]
    }))
    if (!isCurrent()) throw new Error('Batter request superseded')
    batch.forEach(([name, image]) => frames.set(name, image))
  }
  return frames
}
