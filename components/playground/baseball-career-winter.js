import { useEffect, useId, useRef, useState } from 'react'
import { getBaseballTeam } from '@/lib/playground-baseball-teams.mjs'
import { getBaseballWinterGoal } from '@/lib/playground-baseball-winter.mjs'
import styles from '@/styles/playground-baseball-career-winter.module.css'

const winterCopy = {
  ko: {
    interview: '겨울 코치 면담',
    coach: '한도윤 타격코치',
    coachLine: (games, hits) => `첫해 ${games}경기를 끝냈고 안타는 ${hits}개였어. 내년 첫 경기 전에 어떤 준비부터 할지 정해 보자.`,
    focus: '준비 방향 선택',
    review: '개막 준비 보기',
    skip: '건너뛰고 균형 준비',
    back: '결산으로 돌아가기',
    adjust: '준비 방향 다시 고르기',
    opening: '2년차 개막 준비',
    opponent: '개막 상대',
    start: '2년차 시작',
    carryover: '이어받는 능력치',
    abilities: { mit: '미트', power: '파워', discipline: '선구', stamina: '체력', condition: '컨디션', xp: '경험치', trust: '코치 신뢰' },
    plans: {
      recovery: { title: '회복 중심', goal: '개막 후 첫 3경기까지 회복 훈련 1회', advice: '첫 경기 준비 메뉴에서 회복을 고려하세요.' },
      discipline: { title: '선구안 중점', goal: (previous, target) => `지난 시즌 볼넷 ${previous}개 · 목표 ${target}개`, advice: '경기 전 선구 훈련을 추천합니다.' },
      power: { title: '장타 중점', goal: (previous, target) => `지난 시즌 장타 ${previous}개 · 목표 ${target}개`, advice: '경기 전 파워 훈련을 추천합니다.' },
      balanced: { title: '균형 준비', goal: '개막전 컨디션에 맞춰 준비하기', advice: '타격 훈련과 회복 중 지금 필요한 준비를 골라 보세요.' },
    },
  },
  en: {
    interview: 'Winter meeting',
    coach: 'Hitting coach Han Do-yun',
    coachLine: (games, hits) => `You finished ${games} games and recorded ${hits} ${hits === 1 ? 'hit' : 'hits'} in your first year. What would you like to work on before opening day?`,
    focus: 'Choose a preparation focus',
    review: 'Preview opening day',
    skip: 'Skip to balanced preparation',
    back: 'Back to season review',
    adjust: 'Change preparation focus',
    opening: 'Year 2 opening day preview',
    opponent: 'Opening day opponent',
    start: 'Start year 2',
    carryover: 'Carried-over abilities',
    abilities: { mit: 'Contact', power: 'Power', discipline: 'Discipline', stamina: 'Stamina', condition: 'Condition', xp: 'Experience', trust: 'Coach trust' },
    plans: {
      recovery: { title: 'Recovery focus', goal: 'Choose recovery once by the end of your third game', advice: 'Consider recovery in the pregame preparation menu.' },
      discipline: { title: 'Plate discipline', goal: (previous, target) => `Last season: ${previous} walks · Goal: ${target}`, advice: 'Consider discipline training before the game.' },
      power: { title: 'Power focus', goal: (previous, target) => `Last season: ${previous} extra-base hits · Goal: ${target}`, advice: 'Consider power training before the game.' },
      balanced: { title: 'Balanced preparation', goal: 'Prepare for opening day based on your condition', advice: 'Choose the training or recovery you need most.' },
    },
  },
}

const directions = ['recovery', 'discipline', 'power']

function getPlan(copy, direction, stats) {
  const plan = copy.plans[direction]
  if (typeof plan.goal === 'string') return plan
  const goal = getBaseballWinterGoal({ version: 1, direction }, stats)
  return { ...plan, goal: goal ? plan.goal(goal.previous, goal.target) : null }
}

export function BaseballCareerWinterGoal({ locale, direction, stats }) {
  const copy = winterCopy[locale] || winterCopy.ko
  const plan = getPlan(copy, direction, stats)
  return <div className={styles.goal} data-winter-goal={direction}>
    <h3>{plan.title}</h3>
    {plan.goal && <p><strong>{plan.goal}</strong></p>}
    <p>{plan.advice}</p>
  </div>
}

export default function BaseballCareerWinter({ locale, profile, growth, stats, opener, selection, disabled, onBack, onSelect, onStart }) {
  const [preview, setPreview] = useState(Boolean(selection))
  const direction = selection?.direction
  const heading = useRef(null)
  const id = useId()
  const copy = winterCopy[locale] || winterCopy.ko
  const club = getBaseballTeam(profile.teamId)

  useEffect(() => { heading.current?.focus() }, [preview])

  return <section className={styles.winter} aria-labelledby={`${id}-title`} data-career-winter={preview ? 'opening' : 'interview'}>
    <header className={styles.banner}>
      <div>
        <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{preview ? copy.opening : copy.interview}</h2>
        <p>{profile.name} · {club.name}</p>
      </div>
      <strong className={styles.number} style={{ '--winter-team-color': club.helmet }}>#{profile.jerseyNumber}</strong>
    </header>
    {preview ? <>
      <div className={styles.opening}>
        <div className={styles.openingNotes}>
          <div className={styles.match}>
            <h3>{copy.opponent}</h3>
            <p>{opener}</p>
          </div>
          <BaseballCareerWinterGoal locale={locale} direction={direction} stats={stats} />
        </div>
        <div className={styles.abilities}>
          <h3>{copy.carryover}</h3>
          <dl>{Object.entries(copy.abilities).map(([key, label]) => <div key={key}>
            <dt>{label}</dt>
            <dd>{growth[key]}</dd>
          </div>)}</dl>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={disabled} onClick={() => setPreview(false)}>{copy.adjust}</button>
        <button type="button" className={styles.primary} disabled={disabled} onClick={onStart}>{copy.start}</button>
      </div>
    </> : <>
      <div className={styles.coach}>
        <p>{copy.coach}</p>
        <blockquote>{copy.coachLine(stats.G, stats.H)}</blockquote>
      </div>
      <fieldset className={styles.choices} disabled={disabled}>
        <legend>{copy.focus}</legend>
        <div className={styles.choiceGrid}>{directions.map(value => {
          const plan = getPlan(copy, value, stats)
          return <label key={value} className={styles.choice}>
            <input type="radio" name={`${id}-focus`} value={value} checked={direction === value}
              aria-labelledby={`${id}-${value}-title`} aria-describedby={`${id}-${value}-goal`}
              onChange={() => void onSelect(value)} />
            <span>
              <strong id={`${id}-${value}-title`}>{plan.title}</strong>
              <small id={`${id}-${value}-goal`}>{plan.goal || plan.advice}</small>
            </span>
          </label>
        })}</div>
      </fieldset>
      <div className={styles.actions}>
        <button type="button" disabled={disabled} onClick={onBack}>{copy.back}</button>
        <button type="button" disabled={disabled} onClick={async () => { if (await onSelect('balanced')) setPreview(true) }}>{copy.skip}</button>
        <button type="button" className={styles.primary} disabled={disabled || !direction} onClick={() => setPreview(true)}>{copy.review}</button>
      </div>
    </>}
  </section>
}
