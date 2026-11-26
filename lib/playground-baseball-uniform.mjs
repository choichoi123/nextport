import { BASEBALL_UNIFORM_REGIONS_RIGHT, BASEBALL_UNIFORM_PILOT_REGIONS_RIGHT, BASEBALL_UNIFORM_XP_REGIONS_RIGHT, BASEBALL_UNIFORM_CLUB_REGIONS_RIGHT, BASEBALL_UNDERSLEEVE_REGIONS_RIGHT } from './playground-baseball-uniform-regions-right.mjs'
import { BASEBALL_UNIFORM_REGIONS_LEFT, BASEBALL_UNIFORM_PILOT_REGIONS_LEFT, BASEBALL_UNIFORM_XP_REGIONS_LEFT, BASEBALL_UNIFORM_CLUB_REGIONS_LEFT, BASEBALL_UNDERSLEEVE_REGIONS_LEFT } from './playground-baseball-uniform-regions-left.mjs'

// Presentation only: source pixels, alpha, pose geometry and game rules stay separate.
export const BASEBALL_UNIFORM_VERSION = 'semantic-uniform-v5-sleeve-fit'
export const BASEBALL_UNIFORM_LABELS = Object.freeze({
  outside: 0, helmet: 1, jersey: 2, sleeve: 3, pants: 4,
  accent: 5, secondary: 6, piping: 7,
})

const L = BASEBALL_UNIFORM_LABELS
const TABLES = Object.freeze({ right: BASEBALL_UNIFORM_REGIONS_RIGHT, left: BASEBALL_UNIFORM_REGIONS_LEFT })
const PILOT_TABLES = Object.freeze({ right: BASEBALL_UNIFORM_PILOT_REGIONS_RIGHT, left: BASEBALL_UNIFORM_PILOT_REGIONS_LEFT })
const XP_TABLES = Object.freeze({ right: BASEBALL_UNIFORM_XP_REGIONS_RIGHT, left: BASEBALL_UNIFORM_XP_REGIONS_LEFT })
const CLUB_TABLES = Object.freeze({ right: BASEBALL_UNIFORM_CLUB_REGIONS_RIGHT, left: BASEBALL_UNIFORM_CLUB_REGIONS_LEFT })
const UNDERSLEEVE_TABLES = Object.freeze({ right: BASEBALL_UNDERSLEEVE_REGIONS_RIGHT, left: BASEBALL_UNDERSLEEVE_REGIONS_LEFT })
const MATERIAL_FIELDS = Object.freeze([
  'jersey', 'helmet', 'sleeve', 'pants', 'accent', 'secondary', 'stripe', 'pantsStripe',
  'pantsPiping', 'jerseyTrim', 'secondaryTrim', 'undersleeve', 'undersleeveFit', 'uniformProfile',
])
const COLOR = /^#[\da-f]{6}$/i
const PANEL_EDGES = ['left', 'right', 'top', 'bottom']
const PILOT_PROFILES = Object.freeze({
  'heroes-pilot-v1': Object.freeze({ clothGamma: 1, recoverPiping: false }),
  'twins-pilot-v1': Object.freeze({ clothGamma: 0.6, recoverPiping: true }),
  'dinos-pilot-v1': Object.freeze({ clothGamma: 1, jerseyGamma: 0.6, recoverPiping: false }),
  'lions-club-v1': Object.freeze({ club: true, clothGamma: 1, recoverPiping: false }),
  'landers-club-v1': Object.freeze({ club: true, clothGamma: 1, recoverPiping: false }),
  'wiz-club-v1': Object.freeze({ club: true, clothGamma: 1, recoverPiping: false }),
  'tigers-club-v1': Object.freeze({ club: true, clothGamma: 1, jerseyGamma: 0.6, sleeveGamma: 0.6, recoverPiping: false }),
  'bears-club-v1': Object.freeze({ club: true, clothGamma: 1, jerseyGamma: 0.6, sleeveGamma: 0.6, recoverPiping: false }),
  'eagles-club-v1': Object.freeze({ club: true, clothGamma: 1, recoverPiping: false }),
  'giants-club-v1': Object.freeze({ club: true, clothGamma: 1, recoverPiping: false }),
})
const getPilotProfile = name => Object.hasOwn(PILOT_PROFILES, name) ? PILOT_PROFILES[name] : null

export function getBaseballUniformMaterialKey(team = {}) {
  return JSON.stringify([BASEBALL_UNIFORM_VERSION, ...MATERIAL_FIELDS.map(field => team[field] ?? null)])
}

/** An annotation for a different source revision is never a usable fallback. */
export function getBaseballUniformRegions({ handedness, name, src, uniformProfile } = {}) {
  const profile = getPilotProfile(uniformProfile)
  const tables = uniformProfile === 'dinos-pilot-v1' ? XP_TABLES : profile?.club ? CLUB_TABLES : profile ? PILOT_TABLES : TABLES
  const table = tables[handedness]
  const regions = table && Object.hasOwn(table, name) ? table[name] : null
  if (!regions || typeof src !== 'string' || src !== regions.src) {
    throw new Error(`Missing or mismatched baseball uniform regions: ${handedness}/${name}`)
  }
  if (!profile?.club) return regions
  const active = entries => (entries || []).filter(entry => {
    if (entry.profiles !== undefined && (!Array.isArray(entry.profiles) || entry.profiles.some(value => typeof value !== 'string'))) throw new TypeError('Uniform material profiles must be string names')
    return !entry.profiles || entry.profiles.includes(uniformProfile)
  })
  return { ...regions, colorPanels: active(regions.colorPanels), trim: active(regions.trim), helmetTrim: active(regions.helmetTrim) }
}

export function getBaseballUndersleeveRegions({ handedness, name, src, team } = {}) {
  const table = UNDERSLEEVE_TABLES[handedness]
  const regions = table && Object.hasOwn(table, name) ? table[name] : null
  if (!regions || typeof src !== 'string' || src !== regions.src) throw new Error(`Missing or mismatched compression-sleeve regions: ${handedness}/${name}`)
  // The forward turn swaps the panel order in the two right-handed poses.
  const rightArm = handedness === 'right' && ['precontact', 'contact'].includes(name) ? 1 : 0
  return selectBaseballUndersleevePanels(regions, team, rightArm)
}

export function selectBaseballUndersleevePanels(regions, team, rightArm) {
  if (team?.undersleeveFit !== 'right-elbow') return regions
  const [upperArm, forearm] = regions.panels.slice(rightArm * 2, rightArm * 2 + 2)
  return { ...regions, panels: [upperArm, { ...forearm, visibleUntilV: 0.70 }] }
}

function checkPoint(point, width, height) {
  if (!Array.isArray(point) || point.length !== 2 ||
      !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
      point[0] < 0 || point[0] > width || point[1] < 0 || point[1] > height) {
    throw new TypeError('Uniform points must be finite source-pixel coordinates within the image')
  }
}

function checkPolygon(polygon, width, height) {
  if (!Array.isArray(polygon) || polygon.length < 3) throw new TypeError('Uniform polygon needs at least three points')
  polygon.forEach(point => checkPoint(point, width, height))
}

function validateRegions(regions, feet) {
  if (!regions || !Number.isInteger(regions.width) || !Number.isInteger(regions.height) ||
      regions.width <= 0 || regions.height <= 0) throw new TypeError('Uniform image dimensions must be positive integers')
  const { width, height } = regions
  for (const field of ['helmet', 'jersey', 'sleeves', 'pants', 'protect']) {
    if (!Array.isArray(regions[field])) throw new TypeError(`Missing uniform polygons: ${field}`)
    regions[field].forEach(polygon => checkPolygon(polygon, width, height))
  }
  for (const [field, entries] of [['trim', regions.trim || []], ['piping', regions.piping || []]]) {
    if (!Array.isArray(entries)) throw new TypeError(`Uniform ${field} must be an array`)
    for (const entry of entries) {
      if (!entry || !Array.isArray(entry.points) || entry.points.length < 2 ||
          !Number.isFinite(entry.width) || entry.width <= 0) throw new TypeError(`Invalid uniform ${field} stroke`)
      entry.points.forEach(point => checkPoint(point, width, height))
      if (field === 'trim' && !['accent', 'secondary', 'jersey'].includes(entry.material)) {
        throw new TypeError('Uniform trim material must be accent, secondary or jersey')
      }
    }
  }
  if (regions.helmetTrim && !Array.isArray(regions.helmetTrim)) throw new TypeError('Uniform helmetTrim must be an array')
  for (const entry of regions.helmetTrim || []) {
    if (!entry || !Array.isArray(entry.points) || entry.points.length < 2 || !Number.isFinite(entry.width) || entry.width <= 0 || !['accent', 'secondary', 'jersey'].includes(entry.material)) throw new TypeError('Invalid uniform helmet trim')
    entry.points.forEach(point => checkPoint(point, width, height))
  }
  if (regions.colorPanels && !Array.isArray(regions.colorPanels)) throw new TypeError('Uniform colorPanels must be an array')
  for (const panel of regions.colorPanels || []) {
    if (!['sleeve', 'accent', 'secondary', 'jersey'].includes(panel.material)) throw new TypeError('Uniform color panel material must be sleeve, accent, secondary or jersey')
    checkPolygon(panel.polygon, width, height)
  }
  if (regions.panels && !Array.isArray(regions.panels)) throw new TypeError('Uniform panels must be an array')
  for (const panel of regions.panels || []) {
    if (!['jersey', 'sleeve', 'pants'].includes(panel.region)) throw new TypeError('Uniform panel region must be jersey, sleeve or pants')
    checkPolygon(panel.polygon, width, height)
    for (const field of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) checkPoint(panel[field], width, height)
    if (panel.repeats !== undefined && (!Number.isFinite(panel.repeats) || panel.repeats <= 0 || panel.repeats > 128)) throw new TypeError('Uniform panel repeats must be in (0, 128]')
    if (panel.phase !== undefined && !Number.isFinite(panel.phase)) throw new TypeError('Uniform panel phase must be finite')
    if (panel.halfWidth !== undefined && (!Number.isFinite(panel.halfWidth) || panel.halfWidth <= 0 || panel.halfWidth > 0.25)) throw new TypeError('Uniform stripe halfWidth must be in (0, 0.25]')
    if (panel.fadeEdges !== undefined && (!Array.isArray(panel.fadeEdges) || panel.fadeEdges.some(edge => !PANEL_EDGES.includes(edge)))) throw new TypeError('Uniform panel fadeEdges must name quad edges')
  }
  for (const foot of Object.values(feet || {})) {
    if (foot?.outline) checkPolygon(foot.outline, width, height)
  }
}

// Scanline spans avoid testing every image pixel against every polygon.
function rasterPolygon(polygon, width, height, visitSpan) {
  let minY = height, maxY = 0
  for (const point of polygon) { minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]) }
  for (let y = Math.max(0, Math.ceil(minY - 0.5)); y < Math.min(height, Math.ceil(maxY - 0.5)); y++) {
    const lineY = y + 0.5
    const intersections = []
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j], b = polygon[i]
      if ((a[1] > lineY) !== (b[1] > lineY)) {
        intersections.push(a[0] + (lineY - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
      }
    }
    intersections.sort((a, b) => a - b)
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const start = Math.max(0, Math.ceil(intersections[i] - 0.5))
      const end = Math.min(width, Math.ceil(intersections[i + 1] - 0.5))
      if (end > start) visitSpan(y, start, end)
    }
  }
}

function rasterStroke(points, diameter, width, height, visitPixel) {
  const radius = diameter / 2, radius2 = radius * radius
  for (let s = 1; s < points.length; s++) {
    const a = points[s - 1], b = points[s]
    const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy
    const minX = Math.max(0, Math.ceil(Math.min(a[0], b[0]) - radius - 0.5))
    const maxX = Math.min(width - 1, Math.floor(Math.max(a[0], b[0]) + radius - 0.5))
    const minY = Math.max(0, Math.ceil(Math.min(a[1], b[1]) - radius - 0.5))
    const maxY = Math.min(height - 1, Math.floor(Math.max(a[1], b[1]) + radius - 0.5))
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - a[0], py = y + 0.5 - a[1]
        const t = length2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / length2)) : 0
        const ex = px - t * dx, ey = py - t * dy
        if (ex * ex + ey * ey <= radius2) visitPixel(y * width + x)
      }
    }
  }
}

/** Geometry mask only. Zero includes skin, gloves, shoes, belt and unclassified pixels. */
export function compileBaseballUniformMask(regions, { feet } = {}) {
  validateRegions(regions, feet)
  const { width, height } = regions
  const mask = new Uint8Array(width * height)
  const fill = (polygon, value) => rasterPolygon(polygon, width, height, (y, start, end) => mask.fill(value, y * width + start, y * width + end))
  for (const [field, label] of [['pants', L.pants], ['jersey', L.jersey], ['sleeves', L.sleeve], ['helmet', L.helmet]]) {
    for (const polygon of regions[field]) fill(polygon, label)
  }
  for (const panel of regions.colorPanels || []) {
    const label = L[panel.material]
    rasterPolygon(panel.polygon, width, height, (y, start, end) => {
      for (let x = start; x < end; x++) {
        const index = y * width + x
        // Each prior color panel was clipped to this same original cloth set.
        if ([L.jersey, L.sleeve, L.accent, L.secondary].includes(mask[index])) mask[index] = label
      }
    })
  }
  for (const path of regions.helmetTrim || []) {
    const label = L[path.material]
    rasterStroke(path.points, path.width, width, height, index => {
      if (mask[index] === L.helmet) mask[index] = label
    })
  }
  for (const path of regions.piping || []) {
    rasterStroke(path.points, path.width, width, height, index => {
      if (mask[index] === L.pants || mask[index] === L.piping) mask[index] = L.piping
    })
  }
  for (const path of regions.trim || []) {
    const value = L[path.material]
    rasterStroke(path.points, path.width, width, height, index => {
      if ([L.jersey, L.sleeve, L.accent, L.secondary].includes(mask[index])) mask[index] = value
    })
  }
  for (const polygon of regions.protect) fill(polygon, L.outside)
  for (const foot of Object.values(feet || {})) if (foot?.outline) fill(foot.outline, L.outside)
  return mask
}

function isBlue(r, g, b) { return b > r * 1.15 && b > g * 1.025 && b - r >= 12 && b >= 28 }
function isPilotBlue(r, g, b) { return b >= 8 && b > r * 1.15 && b > g * 1.025 && b - r >= 6 }
function isNeutral(r, g, b) {
  const high = Math.max(r, g, b), low = Math.min(r, g, b)
  return high >= 28 && high - low <= high * 0.34 + 9
}

function isPilotCloth(r, g, b) {
  if (isBlue(r, g, b) || isPilotBlue(r, g, b)) return true
  const high = Math.max(r, g, b), low = Math.min(r, g, b)
  // Geometry and explicit protection provide the boundary. These gates only
  // recover dark, desaturated source cloth; warm exposed skin is not a color key.
  return high >= 8 && high - low <= high * 0.45 + 8 &&
    (high <= 105 || (b >= r * 0.93 && b >= g * 0.94))
}

function isPilotPants(r, g, b) {
  if (isNeutral(r, g, b)) return true
  const high = Math.max(r, g, b), low = Math.min(r, g, b)
  return high >= 12 && r >= g * 0.9 && g >= b * 0.8 && high - low <= high * 0.65 + 12
}

/** Shared source-color gate for painting and the diagnostic overlay; never reads modified RGB. */
export function classifyBaseballUniformPixel(label, r, g, b, alpha, uniformProfile) {
  return classifyUniformPixel(label, r, g, b, alpha, getPilotProfile(uniformProfile))
}

function classifyUniformPixel(label, r, g, b, alpha, profile) {
  if (alpha < 32) return L.outside
  if (profile) {
    if (label === L.helmet || label === L.jersey || label === L.sleeve) return isPilotCloth(r, g, b) ? label : L.outside
    if (label === L.pants) return isPilotPants(r, g, b) ? label : L.outside
    if (label === L.piping) return isPilotBlue(r, g, b) ? label : isPilotPants(r, g, b) ? L.pants : L.outside
    if (label === L.accent || label === L.secondary) return isPilotCloth(r, g, b) || isPilotPants(r, g, b) ? label : L.outside
    return L.outside
  }
  if (label === L.helmet || label === L.jersey || label === L.sleeve) return isBlue(r, g, b) ? label : L.outside
  if (label === L.pants) return isNeutral(r, g, b) ? label : L.outside
  // A wide piping annotation searches only inside pants. White cloth in that
  // search region remains pants material; it must not become a skipped band.
  if (label === L.piping) return isBlue(r, g, b) ? label : isNeutral(r, g, b) ? L.pants : L.outside
  if (label === L.accent || label === L.secondary) {
    return isBlue(r, g, b) || isNeutral(r, g, b) ? label : L.outside
  }
  return L.outside
}

function parseColor(value, fallback) {
  const input = typeof value === 'string' && COLOR.test(value) ? value : fallback
  return [Number.parseInt(input.slice(1, 3), 16), Number.parseInt(input.slice(3, 5), 16), Number.parseInt(input.slice(5, 7), 16)]
}

function getMaterials(team) {
  const jersey = parseColor(team.jersey, '#2054ad')
  const helmet = parseColor(team.helmet, '#154591')
  const accent = parseColor(team.jerseyTrim || team.accent, '#f8f8f3')
  return {
    [L.helmet]: helmet,
    [L.jersey]: jersey,
    [L.sleeve]: team.sleeve ? parseColor(team.sleeve, '#2054ad') : jersey,
    [L.pants]: parseColor(team.pants, '#f5f1e8'),
    [L.accent]: accent,
    [L.secondary]: team.secondaryTrim || team.secondary ? parseColor(team.secondaryTrim || team.secondary, '#f8f8f3') : accent,
    [L.piping]: team.pantsPiping ? parseColor(team.pantsPiping, '#154591') : helmet,
  }
}

function shadeChannel(target, value, reference) {
  if (value <= reference) return Math.round(target * value / reference)
  return Math.round(target + (255 - target) * (value - reference) / (255 - reference))
}

// Invert a bilinear source-pixel quad; this approximates perspective, not cloth simulation.
function createPanelSampler(panel, allowOutside = false) {
  const a = panel.topLeft
  const bx = panel.topRight[0] - a[0], by = panel.topRight[1] - a[1]
  const cx = panel.bottomLeft[0] - a[0], cy = panel.bottomLeft[1] - a[1]
  const dx = panel.bottomRight[0] - panel.topRight[0] - panel.bottomLeft[0] + a[0]
  const dy = panel.bottomRight[1] - panel.topRight[1] - panel.bottomLeft[1] + a[1]
  return (x, y, sample) => {
    let u = 0.5, v = 0.5
    for (let i = 0; i < 5; i++) {
      const ex = a[0] + u * bx + v * cx + u * v * dx - x
      const ey = a[1] + u * by + v * cy + u * v * dy - y
      if (Math.abs(ex) + Math.abs(ey) < 1e-5) break
      const ux = bx + v * dx, uy = by + v * dy, vx = cx + u * dx, vy = cy + u * dy
      const det = ux * vy - uy * vx
      if (Math.abs(det) < 1e-8) return false
      u -= (ex * vy - ey * vx) / det
      v -= (ux * ey - uy * ex) / det
    }
    if (!allowOutside && (u < 0 || u > 1 || v < 0 || v > 1)) return false
    const ux = bx + v * dx, uy = by + v * dy, vx = cx + u * dx, vy = cy + u * dy
    const determinant = ux * vy - uy * vx
    if (Math.abs(determinant) < 1e-8) return false
    sample.u = allowOutside ? Math.max(0, Math.min(1, u)) : u
    sample.v = allowOutside ? Math.max(0, Math.min(1, v)) : v
    sample.pixelWidth = Math.hypot(vx, vy) / Math.abs(determinant)
    return true
  }
}

function compileStripeMask(regions, mask, jerseyEnabled, pantsEnabled, recoverPiping) {
  const stripes = new Uint8Array(mask.length)
  const sample = { u: 0, v: 0, pixelWidth: 0 }
  for (const panel of regions.panels || []) {
    if (panel.region === 'pants' ? !pantsEnabled : !jerseyEnabled) continue
    const label = panel.region === 'pants' ? L.pants : panel.region === 'sleeve' ? L.sleeve : L.jersey
    const repeats = panel.repeats ?? (panel.region === 'pants' ? 5 : 9)
    const phaseOffset = panel.phase ?? 0
    const halfWidth = panel.halfWidth ?? 0.045
    const fadeEdges = panel.fadeEdges ?? PANEL_EDGES
    const samplePanelUV = createPanelSampler(panel)
    rasterPolygon(panel.polygon, regions.width, regions.height, (y, start, end) => {
      for (let x = start; x < end; x++) {
        const index = y * regions.width + x
        if (mask[index] !== label && !(label === L.pants && recoverPiping && mask[index] === L.piping)) continue
        if (!samplePanelUV(x + 0.5, y + 0.5, sample)) continue
        const phase = sample.u * repeats + phaseOffset
        const distance = Math.abs(phase - Math.round(phase))
        // Approximate the source-pixel footprint rather than binary on/off lines.
        const antialias = Math.max(0.01, Math.min(0.15, sample.pixelWidth * repeats * 0.5))
        const coverage = Math.max(0, Math.min(1, (halfWidth + antialias - distance) / (antialias * 2)))
        let edge = 1
        if (fadeEdges.includes('left')) edge = Math.min(edge, sample.u)
        if (fadeEdges.includes('right')) edge = Math.min(edge, 1 - sample.u)
        if (fadeEdges.includes('top')) edge = Math.min(edge, sample.v)
        if (fadeEdges.includes('bottom')) edge = Math.min(edge, 1 - sample.v)
        const t = Math.max(0, Math.min(1, edge / 0.025))
        const fade = t * t * (3 - 2 * t)
        stripes[index] = Math.max(stripes[index], Math.round(255 * 0.55 * coverage * fade))
      }
    })
  }
  return stripes
}

function samplePipingBrightness(data, mask, width, height) {
  const brightness = new Map()
  const offsets = [[-6, 0], [6, 0], [-10, 0], [10, 0], [0, -6], [0, 6], [0, -10], [0, 10], [-7, -7], [7, 7], [-7, 7], [7, -7]]
  // Read every neighbor before any RGB mutation. Samples stay within the same
  // garment geometry, including the final protection/alpha exclusions.
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] !== L.piping) continue
    const p = index * 4
    if (data[p + 3] < 32 || !isPilotBlue(data[p], data[p + 1], data[p + 2])) continue
    const x = index % width, y = Math.floor(index / width)
    let total = 0, count = 0
    for (const [dx, dy] of offsets) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const neighbor = ny * width + nx
      if (mask[neighbor] !== L.pants && mask[neighbor] !== L.piping) continue
      const q = neighbor * 4, r = data[q], g = data[q + 1], b = data[q + 2]
      if (data[q + 3] < 32 || isPilotBlue(r, g, b) || !isPilotPants(r, g, b)) continue
      total += Math.max(r, g, b)
      count++
    }
    // A missing sample is explicit; the caller uses a bounded shade fallback.
    if (count) brightness.set(index, Math.round(total / count))
  }
  return brightness
}

// Reuse the exact channel arithmetic for integer source brightness. A table is
// local to one paint, so changing teams never retains per-team image state.
function createUniformShadeLookup(palette, profile) {
  const tables = []
  for (const label of [L.helmet, L.jersey, L.sleeve, L.pants, L.accent, L.secondary, L.piping]) {
    const target = palette[label]
    const gamma = profile && label !== L.helmet && label !== L.pants && label !== L.piping
      ? (label === L.jersey ? profile.jerseyGamma ?? profile.clothGamma : label === L.sleeve ? profile.sleeveGamma ?? profile.clothGamma : profile.clothGamma) : 1
    tables[label] = {}
    for (const reference of [145, 173, 245]) {
      const values = new Uint8Array(256 * 3)
      for (let value = 0; value <= 255; value++) {
        const factor = gamma !== 1 && value <= reference ? Math.pow(value / reference, gamma) : null
        for (let channel = 0; channel < 3; channel++) {
          values[value * 3 + channel] = factor === null ? shadeChannel(target[channel], value, reference) : Math.round(target[channel] * factor)
        }
      }
      tables[label][reference] = values
    }
  }
  return tables
}

/** Mutates RGB only. Counts are eligible region pixels; stripe is a subset, changed is actual RGB changes. */
export function paintBaseballUniform(image, team, regions, { feet } = {}) {
  const { data, width, height } = image || {}
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
      width !== regions?.width || height !== regions?.height || data.length !== width * height * 4) {
    throw new TypeError('Uniform source data must match the annotation dimensions and have RGBA channels')
  }
  const mask = compileBaseballUniformMask(regions, { feet })
  const profile = getPilotProfile(team?.uniformProfile)
  const palette = getMaterials(team || {})
  const shades = createUniformShadeLookup(palette, profile)
  const stripeColor = team?.stripe && COLOR.test(team.stripe) ? parseColor(team.stripe, '#30323a') : null
  const pantsStripeColor = team?.pantsStripe && COLOR.test(team.pantsStripe) ? parseColor(team.pantsStripe, '#30323a') : null
  const stripes = stripeColor || pantsStripeColor ? compileStripeMask(regions, mask, !!stripeColor, !!pantsStripeColor, profile?.recoverPiping) : null
  const pipingBrightness = profile?.recoverPiping ? samplePipingBrightness(data, mask, width, height) : null
  const labelCounts = new Uint32Array(8)
  let changed = 0, stripeCount = 0, painted = 0
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0, index = 0, offset = 0; y < height; y++) {
    for (let x = 0; x < width; x++, index++, offset += 4) {
      const alpha = data[offset + 3]
      if (alpha < 32) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (!mask[index]) continue
      const r = data[offset], g = data[offset + 1], b = data[offset + 2]
      const label = classifyUniformPixel(mask[index], r, g, b, alpha, profile)
      if (!label) continue
      labelCounts[label]++
      painted++
      const striped = stripes?.[index]
      const target = palette[label]
      const stripe = label === L.pants || label === L.piping ? pantsStripeColor : stripeColor
      const mix = striped ? striped / 255 : 0
      if (striped) stripeCount++
      // Reference brightness removes the blue dye while preserving folds and light.
      const upper = label === L.helmet || label === L.jersey || label === L.sleeve
      let reference = isBlue(r, g, b) || (profile && (upper || (label === L.piping && isPilotBlue(r, g, b)))) ? (label === L.helmet ? 145 : 173) : 245
      let value = Math.max(r, g, b)
      if (label === L.piping && pipingBrightness) {
        value = pipingBrightness.get(index) ?? Math.round(245 * Math.pow(Math.min(1, value / 173), 0.78))
        reference = 245
      }
      const lookup = !mix && Number.isInteger(value) && value >= 0 && value <= 255 ? shades[label][reference] : null
      let nr, ng, nb
      if (lookup) {
        const shadeOffset = value * 3
        nr = lookup[shadeOffset]; ng = lookup[shadeOffset + 1]; nb = lookup[shadeOffset + 2]
      } else {
        const gamma = profile && label !== L.helmet && label !== L.pants && label !== L.piping
          ? (label === L.jersey ? profile.jerseyGamma ?? profile.clothGamma : label === L.sleeve ? profile.sleeveGamma ?? profile.clothGamma : profile.clothGamma) : 1
        const factor = gamma !== 1 && value <= reference ? Math.pow(value / reference, gamma) : null
        const red = mix ? target[0] + (stripe[0] - target[0]) * mix : target[0]
        const green = mix ? target[1] + (stripe[1] - target[1]) * mix : target[1]
        const blue = mix ? target[2] + (stripe[2] - target[2]) * mix : target[2]
        nr = factor === null ? shadeChannel(red, value, reference) : Math.round(red * factor)
        ng = factor === null ? shadeChannel(green, value, reference) : Math.round(green * factor)
        nb = factor === null ? shadeChannel(blue, value, reference) : Math.round(blue * factor)
      }
      if (nr !== r || ng !== g || nb !== b) changed++
      data[offset] = nr; data[offset + 1] = ng; data[offset + 2] = nb
    }
  }
  if (maxX < 0) throw new Error('Empty baseball uniform source')
  labelCounts[0] = mask.length - painted
  const counts = Object.fromEntries(Object.entries(L).map(([name, value]) => [name, labelCounts[value]]))
  counts.changed = changed
  counts.stripe = stripeCount
  return { bounds: { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 }, counts }
}

function validateUndersleeveRegions(regions, feet) {
  if (!regions || !Number.isInteger(regions.width) || !Number.isInteger(regions.height) || regions.width <= 0 || regions.height <= 0 || !Array.isArray(regions.panels) || !Array.isArray(regions.protect)) throw new TypeError('Invalid compression-sleeve regions')
  const { width, height } = regions
  for (const panel of regions.panels) {
    checkPolygon(panel.polygon, width, height)
    for (const field of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) checkPoint(panel[field], width, height)
    const quad = [panel.topLeft, panel.topRight, panel.bottomRight, panel.bottomLeft]
    const area = quad.reduce((sum, point, i) => {
      const next = quad[(i + 1) % 4]
      return sum + point[0] * next[1] - point[1] * next[0]
    }, 0)
    if (Math.abs(area) < 2) throw new TypeError('Compression sleeve quad must have positive area')
    for (const field of ['vStart', 'vEnd', 'creaseV']) if (panel[field] !== undefined && (!Number.isFinite(panel[field]) || panel[field] < 0 || panel[field] > 1)) throw new TypeError('Compression sleeve longitudinal coordinates must be in [0, 1]')
    if ((panel.vEnd ?? 1) <= (panel.vStart ?? 0)) throw new TypeError('Compression sleeve vEnd must exceed vStart')
    if (panel.visibleUntilV !== undefined &&
        (!Number.isFinite(panel.visibleUntilV) || panel.visibleUntilV <= (panel.vStart ?? 0) || panel.visibleUntilV > (panel.vEnd ?? 1))) {
      throw new TypeError('Compression sleeve cuff must be within the panel')
    }
    for (const field of ['repeatU', 'repeatV']) if (panel[field] !== undefined && (!Number.isFinite(panel[field]) || panel[field] <= 0 || panel[field] > 64)) throw new TypeError('Compression sleeve texture repeat must be in (0, 64]')
    if (panel.creaseStrength !== undefined && (!Number.isFinite(panel.creaseStrength) || panel.creaseStrength < 0 || panel.creaseStrength > 0.25)) throw new TypeError('Compression sleeve crease strength must be in [0, 0.25]')
  }
  regions.protect.forEach(polygon => checkPolygon(polygon, width, height))
  for (const foot of Object.values(feet || {})) if (foot?.outline) checkPolygon(foot.outline, width, height)
}

/** The separate cloth layer may cover only the explicitly reviewed visible arm. */
export function compileBaseballUndersleeveMask(regions, { feet } = {}) {
  validateUndersleeveRegions(regions, feet)
  const { width, height } = regions
  const mask = new Uint8Array(width * height)
  const fill = (polygon, value) => rasterPolygon(polygon, width, height, (y, start, end) => mask.fill(value, y * width + start, y * width + end))
  for (const panel of regions.panels) {
    if (panel.visibleUntilV === undefined) {
      fill(panel.polygon, 1)
      continue
    }
    const uv = createPanelSampler(panel, true), sample = { u: 0, v: 0, pixelWidth: 0 }
    const startV = panel.vStart ?? 0, endV = panel.vEnd ?? 1
    const cutoff = (panel.visibleUntilV - startV) / (endV - startV)
    rasterPolygon(panel.polygon, width, height, (y, start, end) => {
      for (let x = start; x < end; x++) {
        if (uv(x + 0.5, y + 0.5, sample) && sample.v <= cutoff) mask[y * width + x] = 1
      }
    })
  }
  for (const polygon of regions.protect) fill(polygon, 0)
  for (const foot of Object.values(feet || {})) if (foot?.outline) fill(foot.outline, 0)
  return mask
}

function inspectClothTexture(texture) {
  if (!texture || !(texture.data instanceof Uint8Array || texture.data instanceof Uint8ClampedArray) || !Number.isInteger(texture.width) || !Number.isInteger(texture.height) || texture.width <= 0 || texture.height <= 0 || texture.data.length !== texture.width * texture.height * 4) throw new TypeError('A decoded RGBA compression-cloth texture is required')
  let total = 0, count = 0
  for (let p = 0; p < texture.data.length; p += 4) {
    if (texture.data[p + 3] < 32) continue
    total += (texture.data[p] + texture.data[p + 1] + texture.data[p + 2]) / 3
    count++
  }
  if (!count || total / count < 1) throw new TypeError('Compression-cloth texture must contain visible neutral fabric')
  return total / count
}

function sampleClothTexture(texture, u, v, mean) {
  const x = ((u % 1 + 1) % 1) * texture.width
  const y = ((v % 1 + 1) % 1) * texture.height
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  const x1 = (x0 + 1) % texture.width, y1 = (y0 + 1) % texture.height
  const gray = (sx, sy) => {
    const p = (sy * texture.width + sx) * 4
    return texture.data[p + 3] < 32 ? mean : (texture.data[p] + texture.data[p + 1] + texture.data[p + 2]) / 3
  }
  const top = gray(x0, y0) * (1 - fx) + gray(x1, y0) * fx
  const bottom = gray(x0, y1) * (1 - fx) + gray(x1, y1) * fx
  return top * (1 - fy) + bottom * fy
}

function compileSleeveLighting(image, mask) {
  const { data, width, height } = image
  const luma = p => data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722
  let left = width, right = -1, top = height, bottom = -1, sum = 0, total = 0
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index] || data[index * 4 + 3] < 32) continue
    const x = index % width, y = Math.floor(index / width)
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
    sum += luma(index * 4)
    total++
  }
  if (!total) return { mean: 1, at: () => 1 }
  const mean = Math.max(1, sum / total)
  const roiWidth = right - left + 1, roiHeight = bottom - top + 1, stride = roiWidth + 1
  // Integral images are restricted to the two arms' bounding box. Their valid
  // counts prevent hands, other clothing and background bleeding into the blur.
  const integral = new Float64Array(stride * (roiHeight + 1))
  const valid = new Uint32Array(integral.length)
  for (let y = 0; y < roiHeight; y++) {
    let rowSum = 0, rowCount = 0
    for (let x = 0; x < roiWidth; x++) {
      const source = (top + y) * width + left + x, p = source * 4
      if (mask[source] && data[p + 3] >= 32) { rowSum += luma(p); rowCount++ }
      const cell = (y + 1) * stride + x + 1
      integral[cell] = integral[cell - stride] + rowSum
      valid[cell] = valid[cell - stride] + rowCount
    }
  }
  return { mean, at: (x, y) => {
    const x0 = Math.max(0, x - left - 7), x1 = Math.min(roiWidth, x - left + 8)
    const y0 = Math.max(0, y - top - 7), y1 = Math.min(roiHeight, y - top + 8)
    const a = y0 * stride + x0, b = y0 * stride + x1, c = y1 * stride + x0, d = y1 * stride + x1
    const count = valid[d] - valid[b] - valid[c] + valid[a]
    return count ? (integral[d] - integral[b] - integral[c] + integral[a]) / count : mean
  } }
}

/** Adds cloth using neutral fabric and blurred lighting, never skin hue/detail. */
export function paintBaseballUndersleeves(image, team, regions, { texture, feet } = {}) {
  const counts = { painted: 0, changed: 0, protected: 0, transparent: 0 }
  if (team?.undersleeve === undefined || team?.undersleeve === null) return { counts, changed: 0 }
  if (typeof team.undersleeve !== 'string' || !COLOR.test(team.undersleeve)) throw new TypeError('Invalid compression-sleeve color')
  const { data, width, height } = image || {}
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || width !== regions?.width || height !== regions?.height || data.length !== width * height * 4) throw new TypeError('Compression sleeve source RGBA must match its annotation')
  const mask = compileBaseballUndersleeveMask(regions, { feet })
  const mean = inspectClothTexture(texture)
  const lighting = compileSleeveLighting(image, mask)
  const target = parseColor(team.undersleeve, '#181c22')
  const sample = { u: 0, v: 0, pixelWidth: 0 }
  const painted = new Uint8Array(mask.length)
  for (const panel of regions.panels) {
    const uv = createPanelSampler(panel, true)
    const startV = panel.vStart ?? 0, endV = panel.vEnd ?? 1
    const repeatU = panel.repeatU ?? 1, repeatV = panel.repeatV ?? 2
    const creaseV = panel.creaseV ?? 0.5, creaseStrength = panel.creaseStrength ?? 0.05
    rasterPolygon(panel.polygon, width, height, (y, start, end) => {
      for (let x = start; x < end; x++) {
        const index = y * width + x, p = index * 4
        if (!mask[index] || painted[index] || !uv(x + 0.5, y + 0.5, sample)) continue
        if (data[p + 3] < 32) { if (!painted[index]) counts.transparent++; painted[index] = 1; continue }
        const v = startV + sample.v * (endV - startV)
        const thread = sampleClothTexture(texture, sample.u * repeatU, v * repeatV, mean)
        const weave = Math.max(-0.18, Math.min(0.18, (thread / mean - 1) * 0.35))
        const cross = 2 * sample.u - 1
        const cylinder = 0.76 + 0.24 * Math.sqrt(Math.max(0, 1 - cross * cross))
        const broadLight = Math.max(0.45, Math.min(1.08, 0.9 * Math.pow(Math.max(0, lighting.at(x, y) / lighting.mean), 0.75)))
        const elbow = (v - creaseV) / 0.045
        const crease = 1 - creaseStrength * Math.exp(-elbow * elbow)
        const wrist = (v - ((panel.visibleUntilV ?? 1) - 0.015)) / 0.015
        const cuff = 1 - 0.04 * Math.exp(-wrist * wrist)
        const shade = Math.max(0.2, Math.min(1.06, (0.9 * broadLight + 0.1 * cylinder) * crease * cuff * (1 + weave)))
        const channel = value => shade <= 1 ? Math.round(value * shade) : Math.round(value + (255 - value) * (shade - 1) * 0.5)
        const r = channel(target[0]), g = channel(target[1]), b = channel(target[2])
        if (!painted[index]) {
          counts.painted++
          if (r !== data[p] || g !== data[p + 1] || b !== data[p + 2]) counts.changed++
        }
        data[p] = r; data[p + 1] = g; data[p + 2] = b
        painted[index] = 1
      }
    })
  }
  counts.protected = mask.length - mask.reduce((sum, value) => sum + value, 0)
  return { counts, changed: counts.changed }
}
