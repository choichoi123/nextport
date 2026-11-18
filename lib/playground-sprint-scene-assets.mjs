import { loadSprintImage } from './playground-sprint-image-cache.mjs'
import { SPRINT_SPRITES, getSprintSpriteRect } from './playground-sprint-sprites.mjs'
import { SPRINT_RUN_SPRITES, getSprintRunRect } from './playground-sprint-motion.mjs'
import { getSprintBossAssets, getSprintBossSpriteRect } from './playground-sprint-boss-sprites.mjs'
import { getSprintReactionAssets, getSprintReactionRect } from './playground-sprint-reactions.mjs'
import { getSprintStartAssets, getSprintStartSpriteRect } from './playground-sprint-start-sprites.mjs'

export function getSprintSceneFamilyKey({ art, view, bossEnabled = false, defeat = false }) {
  return `${art}:${view}:${bossEnabled ? 'boss' : 'solo'}:${defeat ? 'defeat' : 'normal'}`
}

/** Validate complete sprite families before publishing them to a live renderer. */
export async function loadSprintSceneFamily(request, load = loadSprintImage) {
  const { art, view, bossEnabled = false, defeat = false } = request
  const failedSources = []
  async function asset(src, valid = () => true) {
    let state
    try {
      state = await load(src)
      if (state?.status === 'ready' && state.image && valid(state.image)) return state
    } catch { state = null }
    failedSources.push(src)
    return { src, status: 'error', image: null }
  }
  const base = SPRINT_SPRITES[art]?.[view]
  const run = SPRINT_RUN_SPRITES[art]
  const bossAssets = getSprintBossAssets(art)
  const reactionAsset = getSprintReactionAssets(art, view)
  const startAsset = getSprintStartAssets(art)
  const bossSheets = bossEnabled ? view === 'top' ? ['top'] : ['run', 'poses', 'start'] : []
  const [sprite, runSprite, background, bossStates, reaction, start] = await Promise.all([
    asset(base?.src, image => Boolean(getSprintSpriteRect(image.naturalWidth, image.naturalHeight, view, base.columns * base.rows - 1))),
    view === 'side' ? asset(run?.src, image => Boolean(getSprintRunRect(image.naturalWidth, image.naturalHeight, 15)))
      : { src: null, status: 'off', image: null },
    art === 'realistic' ? asset(`/images/playground/sprint/stadium-${view}-realistic.webp`)
      : { src: null, status: 'off', image: null },
    Promise.all(bossSheets.map(async sheet => {
      const descriptor = sheet === 'start' ? getSprintStartAssets(art, 'boss') : bossAssets[sheet]
      const state = await asset(descriptor.src, image => Boolean(sheet === 'start'
        ? getSprintStartSpriteRect(image.naturalWidth, image.naturalHeight, 7)
        : getSprintBossSpriteRect(image.naturalWidth, image.naturalHeight, sheet, descriptor.columns * descriptor.rows - 1)))
      return [sheet, state]
    })),
    defeat ? asset(reactionAsset.src, image => Boolean(getSprintReactionRect(
      image.naturalWidth, image.naturalHeight, 7, reactionAsset.frames[7].sourceRect)))
      : { src: reactionAsset.src, status: 'off', image: null },
    view === 'side' ? asset(startAsset.src, image => Boolean(getSprintStartSpriteRect(image.naturalWidth, image.naturalHeight, 7)))
      : { src: startAsset.src, status: 'off', image: null },
  ])
  return {
    key: getSprintSceneFamilyKey(request), art, view,
    status: failedSources.length ? 'error' : 'ready', failedSources,
    sprite, runSprite, background, start,
    boss: { art, view, status: !bossEnabled ? 'off' : bossStates.some(([, state]) => state.status === 'error') ? 'error' : 'ready',
      images: Object.fromEntries(bossStates.filter(([, state]) => state.status === 'ready').map(([sheet, state]) => [sheet, state.image])) },
    reaction: { ...reaction, art, view },
  }
}

/** Retain the current style until a replacement is complete; errors never masquerade as ready. */
export function selectSprintSceneFamily(previous, candidate) {
  if (!candidate || candidate.status === 'loading') return previous || null
  if (candidate.status === 'error' && previous?.status === 'ready'
    && (previous.art !== candidate.art || previous.view !== candidate.view)) return previous
  return candidate
}
