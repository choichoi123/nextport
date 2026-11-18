import BossCharacter from './boss-character'
import styles from '@/styles/playground-sprint-boss.module.css'

const copy = {
  ko: {
    title: '강적 등장',
    name: '루사인 볼트',
    ready: '잠시 후 출발합니다',
    line: '번개 같은 질주가 시작됩니다.',
    crossed: '루사인 볼트 결승 통과',
    first: '1위',
  },
  en: {
    title: 'CHALLENGER APPEARS',
    name: 'Lusain Volt',
    ready: 'Get ready for the start',
    line: 'Lightning on the starting line.',
    crossed: 'Lusain Volt crossed the line',
    first: '1ST',
  },
}

function Lightning({ className }) {
  return <svg className={className} viewBox="0 0 64 80" fill="none" aria-hidden="true"><path d="M37 1 6 43h23L23 79l35-49H35L37 1Z" fill="currentColor" /></svg>
}

/** Presentation only: the game owns the intro clock and the later countdown. */
export function SprintBossIntro({ art = 'realistic', locale = 'ko', elapsedMs = 0, durationMs = 2600 }) {
  const text = copy[locale === 'en' ? 'en' : 'ko']
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 2600
  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0
  const progress = Math.max(0, Math.min(1, elapsed / duration))

  return <section className={styles.intro} data-art={art} data-testid="sprint-boss-intro" role="status" aria-live="polite" aria-atomic="true" aria-label={text.title} style={{ '--intro-progress': `${progress * 100}%` }}>
    <div className={styles.lightSweep} aria-hidden="true" />
    <div className={styles.introContent}>
      <div className={styles.introCopy}>
        <span className={styles.kicker}><Lightning /> HIDDEN CHALLENGER</span>
        <h2>{text.title}</h2>
        <div className={styles.nameplate}><span>LUSAIN</span> <strong>VOLT</strong><Lightning /></div>
        <p className={styles.localName}>{text.name}</p>
        <p className={styles.introLine}>{text.line}</p>
      </div>
      <div className={styles.introPortrait} aria-hidden="true">
        <div className={styles.halo} />
        <Lightning className={styles.backBolt} />
        <BossCharacter art={art} phase="intro" elapsedMs={elapsed} durationMs={duration} className={styles.character} locale={locale} />
      </div>
    </div>
    <div className={styles.ready} aria-hidden="true"><span>{text.ready}</span><div className={styles.introProgress}><i /></div></div>
  </section>
}

/** A first-place cut-in never takes input or moves the player's race camera. */
export function SprintBossWinCue({ art = 'realistic', locale = 'ko', bossState }) {
  if (!bossState?.won || !bossState?.celebrating) return null
  const text = copy[locale === 'en' ? 'en' : 'ko']

  return <aside className={styles.winCue} data-art={art} data-testid="sprint-boss-win" role="status" aria-live="polite" aria-atomic="true">
    <div className={styles.winPortrait} aria-hidden="true"><BossCharacter art={art} phase="victory" elapsedMs={bossState.celebrationElapsedMs} durationMs={bossState.celebrationDurationMs || 2600} className={styles.character} locale={locale} /></div>
    <div className={styles.winCopy}><span><Lightning /> LUSAIN VOLT</span><p>{text.crossed}</p><strong>{text.first}</strong></div>
  </aside>
}
