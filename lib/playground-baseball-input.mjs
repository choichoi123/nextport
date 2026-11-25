import { BASEBALL_RULES } from './playground-baseball.mjs'
import { validateBaseballPlayer } from './playground-baseball-teams.mjs'

const errorMap = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const offsets = Object.freeze({ ArrowLeft:[-.025,0], ArrowRight:[.025,0], ArrowUp:[0,.025], ArrowDown:[0,-.025] })

/** Recheck only an already-reported field; editing it must not hide other errors. */
export function revalidateBaseballPlayerField(previous, draft, field) {
  const errors = errorMap(previous)
  if (!errors[field]) return errors
  const next = { ...errors }, checked = validateBaseballPlayer(draft).errors
  if (checked[field]) next[field] = checked[field]
  else delete next[field]
  return next
}

/** Keep validation codes in state and derive text/accessible relations per locale. */
export function getBaseballPlayerFeedback(value, text) {
  const errors = errorMap(value)
  const nameError = 'baseball-player-name-error', numberError = 'baseball-player-number-error'
  const settingsError = 'baseball-player-settings-error', numberHint = 'baseball-player-number-hint'
  return {
    name:{ invalid:Boolean(errors.name), describedBy:errors.name ? nameError : undefined },
    jerseyNumber:{ invalid:Boolean(errors.jerseyNumber), describedBy:errors.jerseyNumber ? `${numberHint} ${numberError}` : numberHint },
    handedness:{ invalid:Boolean(errors.handedness), describedBy:errors.handedness ? settingsError : undefined },
    teamId:{ invalid:Boolean(errors.teamId), describedBy:errors.teamId ? settingsError : undefined },
    numberHint,
    messages:[
      ...(errors.name ? [{ id:nameError, text:text.nameError }] : []),
      ...(errors.jerseyNumber ? [{ id:numberError, text:text.numberError }] : []),
      ...(errors.handedness || errors.teamId ? [{ id:settingsError, text:text.playerError }] : []),
    ],
  }
}

/** Ignore repeated actions while still consuming a canvas game key's default scroll. */
export function handleBaseballCanvasKeyDown(event, { aim, onAim, onSwing, onPause }) {
  if (event.target?.tagName !== 'CANVAS') return
  if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') event.preventDefault()
    onPause(event.key === 'Escape' ? 'escape' : 'tab')
    return
  }
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.nativeEvent?.isComposing) return
  const offset = offsets[event.key], isSwing = event.code === 'Space'
  if (!offset && !isSwing) return
  event.preventDefault()
  if (event.repeat) return
  if (isSwing) onSwing(aim, { source:'keyboard', surface:event.target?.dataset?.baseballInput === 'focus' ? 'focus' : 'field', code:'Space' })
  else {
    const [x,y] = offset, bounds = BASEBALL_RULES.aimBounds
    onAim({ x:Math.max(bounds.left,Math.min(bounds.right,aim.x+x)), y:Math.max(bounds.bottom,Math.min(bounds.top,aim.y+y)) })
  }
}
