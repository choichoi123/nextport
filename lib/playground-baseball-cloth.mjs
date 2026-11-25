// A single small, shared material tile; it never owns per-team or per-pose images.
import { createBaseballImageLoader } from './playground-baseball-image-loader.mjs'
// The generated 1254px PNG remains archived beside this pre-sized lossless tile.
export const BASEBALL_COMPRESSION_TEXTURE = '/images/playground/baseball/materials/20261124/compression-knit-gray-256-lossless-v1.webp'
export function createBaseballClothLoader({ imageLoader = createBaseballImageLoader(), createCanvas = () => document.createElement('canvas') } = {}) {
  let texturePromise = null
  return function loadClothTexture() {
    if (texturePromise) return texturePromise
    texturePromise = imageLoader(BASEBALL_COMPRESSION_TEXTURE, { width:256, height:256 }).then(image => {
      let canvas
      try {
        canvas = createCanvas()
        canvas.width = 256
        canvas.height = 256
        const context = canvas.getContext('2d', { willReadFrequently:true })
        if (!context) throw new Error('Cloth canvas unavailable')
        context.drawImage(image, 0, 0, 256, 256)
        const texture = context.getImageData(0, 0, 256, 256)
        return texture
      } finally {
        if (canvas) { canvas.width = 1; canvas.height = 1 }
      }
    }).catch(error => { texturePromise = null; throw error })
    return texturePromise
  }
}

export const loadBaseballClothTexture = createBaseballClothLoader()
