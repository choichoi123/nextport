/** Share decoded image objects across canvas renderers without touching Image at import time. */
export function createSprintImageCache(createImage = () => new Image()) {
  const entries = new Map()
  function peek(src) {
    return entries.get(src)?.state || null
  }
  function load(src) {
    if (entries.has(src)) return entries.get(src).promise
    const entry = { state: { src, status: 'loading', image: null }, promise: null }
    // Store before starting any browser work, including synchronous cache hits.
    entries.set(src, entry)
    entry.promise = new Promise(resolve => {
      let image
      let settled = false
      const finish = status => {
        if (settled) return
        settled = true
        if (image) { image.onload = null; image.onerror = null }
        entry.state = { src, status, image: status === 'ready' ? image : null }
        resolve(entry.state)
      }
      try {
        if (typeof src !== 'string' || !src) { finish('error'); return }
        image = createImage()
        image.onload = async () => {
          try {
            if (typeof image.decode === 'function') await image.decode()
            finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? 'ready' : 'error')
          } catch { finish('error') }
        }
        image.onerror = () => finish('error')
        image.src = src
      } catch { finish('error') }
    })
    return entry.promise
  }
  return { load, peek }
}

const cache = createSprintImageCache()
export const loadSprintImage = cache.load
export const peekSprintImage = cache.peek
