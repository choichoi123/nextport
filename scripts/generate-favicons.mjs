import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import portfolioBrand from '../config/portfolio-brand.js'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const pngSizes = [96, 192]
const icoSizes = [16, 32, 48, 256]

function encodeIco(images) {
  const directory = Buffer.alloc(6 + images.length * 16)
  directory.writeUInt16LE(1, 2)
  directory.writeUInt16LE(images.length, 4)
  let offset = directory.length
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16
    directory[entry] = size === 256 ? 0 : size
    directory[entry + 1] = size === 256 ? 0 : size
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(data.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([directory, ...images.map(image => image.data)])
}

function publicFile(publicRoot, pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) {
    throw new Error('파비콘 경로는 public 내부의 절대 URL 경로여야 합니다.')
  }
  const filename = path.resolve(publicRoot, `.${pathname}`)
  if (!filename.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error('파비콘 경로가 public 디렉터리를 벗어났습니다.')
  }
  return filename
}

export async function generateFavicons({
  rootDir = repositoryRoot,
  brandConfig = portfolioBrand,
  sharpImplementation,
} = {}) {
  if (!Object.hasOwn(brandConfig.variants, brandConfig.activeBrand)) {
    throw new Error('지원하지 않는 activeBrand 설정입니다.')
  }
  let sharp = sharpImplementation
  if (!sharp) {
    try { sharp = require('sharp') }
    catch { throw new Error('Next.js 16 설치에 포함된 sharp가 필요합니다. 프로젝트 의존성 설치 상태를 확인하세요.') }
  }

  const publicRoot = path.resolve(rootDir, 'public')
  const outputDirectory = path.join(publicRoot, 'images', 'brand', 'generated')
  const assets = []
  const icons = new Map()
  for (const [key, variant] of Object.entries(brandConfig.variants)) {
    if (!/^[a-z0-9-]+$/u.test(key)) throw new Error('지원하지 않는 브랜드 식별자입니다.')
    const sourceFile = publicFile(publicRoot, variant.favicon.source)
    const primaryFile = publicFile(publicRoot, variant.favicon.src)
    if (variant.favicon.sizes !== '96x96' || primaryFile !== path.join(outputDirectory, `favicon-${key}-96.png`)) {
      throw new Error('브랜드 파비콘 설정과 생성 경로가 일치하지 않습니다.')
    }
    const source = await readFile(sourceFile)
    const images = new Map(await Promise.all([...icoSizes, ...pngSizes].map(async size => [
      size,
      await sharp(source)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer(),
    ])))
    for (const size of pngSizes) {
      assets.push({ filename: path.join(outputDirectory, `favicon-${key}-${size}.png`), data: images.get(size) })
    }
    const ico = encodeIco(icoSizes.map(size => ({ size, data: images.get(size) })))
    assets.push({ filename: path.join(outputDirectory, `favicon-${key}.ico`), data: ico })
    icons.set(key, ico)
  }

  // 모든 원본과 설정을 확인한 뒤에만 파생 자산과 기본 ICO를 갱신합니다.
  await mkdir(outputDirectory, { recursive: true })
  for (const asset of assets) await writeFile(asset.filename, asset.data)
  await writeFile(path.join(publicRoot, 'favicon.ico'), icons.get(brandConfig.activeBrand))
  return { activeBrand: brandConfig.activeBrand, assetCount: assets.length + 1, pngSizes, icoSizes }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateFavicons().then(result => {
    console.log(`파비콘 동기화 완료: ${result.activeBrand} (PNG ${result.pngSizes.join('·')}px / ICO ${result.icoSizes.join('·')}px)`)
  }).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
