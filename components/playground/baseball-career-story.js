import { useId, useState } from 'react'
import { BASEBALL_TEAMS } from '@/lib/playground-baseball-teams.mjs'
import styles from '@/styles/playground-baseball-career-story.module.css'

const plural = (count, unit) => count === 1 ? unit : `${unit}s`
const singularIfOne = (count, unit) => count === 1 ? unit.slice(0, -1) : unit
const extraBaseHits = stats => stats['2B'] + stats['3B'] + stats.HR

const copyByLocale = {
  ko: {
    year: year => `${year}년차`,
    coach: '한도윤 타격코치',
    titles: {
      1: '내 이름이 적힌 라인업', 2: '내 자리 만들기', 3: '나만의 타격 루틴', 4: '상대가 기억하는 타자',
      5: '중간 결산', 6: '다시 풀어가는 시즌', 7: '후배와 나누는 준비', 8: '팀과 나의 목표',
      9: '남기고 싶은 기록', 10: '마지막 장을 고르는 날',
    },
    dialogue: {
      'first-hit': ({ season }, { goal, number }) => goal.scope === 'next-season'
        ? `첫해 ${number(season.G)}경기를 치렀네. 다음 시즌에는 첫 안타부터 하나씩 쌓아 보자.`
        : `${number(season.G)}경기를 치렀네. 다음 타석엔 자신 있게 밀어 칠 수 있는 공을 기다려 보자. 첫 안타부터 시작하는 거야.`,
      'hits-recorded': ({ season }, { number }) => `올해 네가 만든 안타가 ${number(season.H)}개야. 공을 끝까지 보고 배트를 냈던 타석을 떠올려 봐. 그 감각을 가져가자.`,
      'first-extra-base-hit': ({ previous }, { number }) => `지난해 안타는 ${number(previous.H)}개였어. 올해는 네가 가장 잘 치는 코스를 골라 첫 장타에 도전해 보자.`,
      'first-extra-base-hit-recorded': ({ season }, { number }) => `올해 첫 장타를 기록하고 ${number(extraBaseHits(season))}개까지 쌓았어. 장타가 나온 타석에서 어떤 공을 골랐는지 돌아보자.`,
      'reduce-strikeouts': ({ previous }, { number }) => `지난해 ${number(previous.PA)}타석에서 삼진이 ${number(previous.SO)}개였어. 네 스윙을 낼 수 있는 공의 범위부터 정해 보자.`,
      'hold-hits': ({ previous }, { number }) => `지난해 ${number(previous.H)}안타를 만든 건 네가 정한 타석 루틴이 있었기 때문이야. 올해도 그 기준을 꾸준히 가져가 보자.`,
      'routine-recovery': ({ preparation, condition }, { number }) => preparation === 'rest'
        ? '경기 준비에서 회복을 골랐네. 몸 상태를 살피는 것도 타석 준비야. 몸이 가벼워지면 익숙한 코스부터 맞춰 보자.'
        : `컨디션이 ${number(condition)}이야. 회복부터 챙기고 타석에서 움직임을 가볍게 가져가 보자.`,
      'routine-discipline': ({ previous }, { number }) => `지난 시즌 ${number(previous.PA)}타석에서 볼넷 ${number(previous.BB)}개, 삼진 ${number(previous.SO)}개였어. 스윙할 공과 놓아둘 공의 기준을 정해 보자.`,
      'routine-power': ({ previous }, { number }) => `지난 시즌 장타가 ${number(extraBaseHits(previous))}개였어. 네가 강하게 보낼 수 있는 코스를 떠올리고 준비 동작을 맞춰 보자.`,
      'matchup-first': ({ complete, previous }, { opponent, number }) => opponent
        ? `${opponent}전이네. 이번 시즌 이 구단과 마친 경기의 기록이 아직 없어. 공의 속도부터 읽어 보자.`
        : `지난 시즌 ${number(previous.H)}안타를 쳤네. ${complete ? '다음 시즌' : '다가오는 시리즈'}에도 첫 타석부터 공의 속도를 읽어 보자.`,
      'matchup-opportunity': ({ matchup, complete }, { opponent, number }) => `${opponent}전에서 ${number(matchup.stats.PA)}타석을 치렀어. ${complete ? '다음 시즌 다시 만나면' : '이번 승부에서는'} 익숙한 코스부터 노려 첫 안타를 만들어 보자.`,
      'matchup-build': ({ matchup, complete }, { opponent, number }) => `${opponent}전에서 ${number(matchup.stats.H)}안타를 쳤네. ${complete ? '다음 시즌에도' : '오늘도'} 잘 맞았던 타석을 떠올리고 자신 있는 공을 기다려 보자.`,
      'average-up': () => '지난 시즌보다 타율이 올랐어. 스윙할 공을 고를 때 어떤 판단이 통했는지 떠올려 봐. 다음 시즌에도 그 루틴을 써 보자.',
      'average-down': () => '지난 시즌보다 타율이 내려갔어. 한 번에 만회하려고 힘을 주기보다는 익숙한 코스부터 다시 맞춰 보자.',
      'average-tied': () => '두 시즌의 타율이 같아. 그동안 잘한 준비를 다음 시즌에도 이어가 보자.',
      'average-unavailable': () => '다섯 시즌의 기록을 같이 보자. 타수가 쌓인 시즌부터 살피면 다음 시즌에 가져갈 강점이 보여.',
      'bounce-back': () => '최근 두 시즌을 보니 타율이 낮아졌어. 잘 맞혔던 코스부터 하나씩 되찾아서 이전 타율에 다시 닿아 보자.',
      'form-steady': () => '두 시즌의 타율이 같네. 타석 전에 어떤 준비가 도움이 됐는지 짚고 그 루틴을 이어가 보자.',
      'form-up': ({ reference }, { number }) => `최근 두 시즌 사이 타율이 올랐어. 개인 최고인 ${number(reference)}안타를 기준으로 다음 목표를 잡아 보자.`,
      'form-baseline': ({ previous }, { number }) => `지난 시즌에 ${number(previous.PA)}번 타석에 섰어. 편하게 스윙할 수 있는 공부터 골라 이번 기준을 만들어 보자.`,
      'mentor-discipline': ({ previous }, { number }) => `지난 시즌 볼넷이 ${number(previous.BB)}개였지. 후배에게 타석에 들어서기 전 어떤 공을 기다리는지부터 알려 줘 보자.`,
      'mentor-power': ({ previous }, { number }) => `지난 시즌 장타 ${number(extraBaseHits(previous))}개를 쳤네. 네가 자신 있는 코스와 그 공을 기다리는 준비를 후배에게 들려줘 봐.`,
      'mentor-work-in-progress': ({ previous }, { number }) => `지난 시즌 ${number(previous.PA)}타석을 치르면서 배운 게 있겠지. 후배와 각자 까다로웠던 공과 다음 준비를 이야기해 보자.`,
      'mentor-personal': ({ previous }, { number }) => `지난 시즌 안타가 ${number(previous.H)}개였어. 우선 네가 타석에서 지킬 기준을 정해 두고, 그다음에 후배와 이야기해도 좋아.`,
      'team-fundamentals': ({ previous }, { number }) => `지난 시즌 삼진이 ${number(previous.SO)}개였네. 윤태오와 경기 전에 각자 기다릴 코스를 이야기하고 공을 고르는 기준을 맞춰 보자.`,
      'team-contact': ({ previous }, { number }) => `지난 시즌 ${number(previous.H)}안타를 쳤지. 윤태오와 잘 맞힌 타석을 하나씩 짚고 경기 전 연습에 같이 써 보자.`,
      'personal-discipline': ({ previous }, { number }) => `지난 시즌 볼넷 ${number(previous.BB)}개부터 살펴보자. 타석마다 어느 코스까지 스윙할지 미리 정해 보자.`,
      'personal-power': ({ previous }, { number }) => `지난 시즌 장타가 ${number(extraBaseHits(previous))}개였어. 네가 밀어붙일 수 있는 코스에 집중해서 타석을 준비하자.`,
      'personal-contact': ({ previous }, { number }) => `지난 시즌 ${number(previous.H)}안타를 기록했어. 배트가 가장 편하게 나가는 코스부터 다시 익혀 보자.`,
      'milestone-ahead': ({ total }, { goal, metric, number }) => `지금까지 ${number(total.G)}경기를 치렀어. 통산 ${metric[goal.metric]} ${number(goal.target)}까지 남은 숫자를 보면서 한 타석씩 쌓아 보자.`,
      'milestone-reached': ({ total }, { goal, metric, number }) => `통산 ${metric[goal.metric]} ${number(goal.target)}에 닿았네. ${number(total.G)}경기 동안 한 타석씩 쌓아서 만든 기록이야.`,
      'home-runs-recorded': ({ total }, { number }) => `열 시즌 동안 ${number(total.H)}안타와 ${number(total.HR)}홈런을 쌓았어. 첫 장면과 가장 잘 풀렸던 해를 다시 살펴보자.`,
      'hits-only': ({ total }, { number }) => `열 시즌 동안 네가 만든 안타가 ${number(total.H)}개야. 출전 기회와 가장 안타가 많았던 해를 함께 돌아보자.`,
      'no-hits': ({ total }, { number }) => `열 시즌 동안 ${number(total.PA)}번 타석에 섰어. 그동안의 출장 기록과 네가 고른 준비를 돌아보자.`,
    },
    goalFor: { season: '시즌 목표 제안', career: '통산 목표', 'next-season': '다음 시즌 목표 제안', preparation: '경기 준비 목표', matchup: '상대 구단전 목표 제안' },
    metrics: { hits: '안타', extraBases: '장타', walks: '볼넷', strikeoutRate: '삼진율', battingAverage: '타율', recovery: '회복 선택' },
    recoveryGoal: count => `회복 ${count}회`,
    opponentFallback: '이 상대 구단',
    choiceGroup: '코치와 점검할 준비 방향',
    options: { 'share-routine': '후배에게 루틴 전하기', 'focus-self': '내 준비부터 점검하기', 'work-together': '윤태오와 함께 준비하기', 'personal-routine': '내 루틴부터 점검하기' },
    current: '현재',
    reached: '목표 달성',
    ceiling: '이하',
    twoYearAverage: '최근 두 시즌 타율',
    averageEvidence: (hits, atBats) => `${hits}안타 / ${atBats}타수`,
    matchupLabel: opponent => `${opponent}전 성적`,
    matchupEvidence: (games, appearances, hits, extraBases) => `${games}경기 · ${appearances}타석 · ${hits}안타 · 장타 ${extraBases}개`,
    firstHit: '첫 안타',
    firstHomeRun: '첫 홈런',
    bestHits: '최다 안타 시즌',
    bestExtraBases: '최다 장타 시즌',
    tied: '공동',
    reviewTitle: '통산 기록 되돌아보기',
    review: {
      'home-runs-recorded': '첫 홈런을 친 해와 장타가 가장 많았던 해를 확인하세요.',
      'hits-only': '첫 안타를 친 해와 안타가 가장 많았던 해를 확인하세요.',
      'no-hits': '통산 타석 수와 시즌별 출장 기록을 확인하세요.',
    },
  },
  en: {
    year: year => `Year ${year}`,
    coach: 'Han Do-yun, hitting coach',
    titles: {
      1: 'My name in the lineup', 2: 'Making a place for myself', 3: 'A batting routine of my own', 4: 'A batter they remember',
      5: 'The halfway review', 6: 'Finding my swing again', 7: 'Passing on what I learned', 8: 'My goals and the team',
      9: 'A mark worth leaving', 10: 'The final chapter',
    },
    dialogue: {
      'first-hit': ({ season }, { goal, number }) => goal.scope === 'next-season'
        ? `You played ${number(season.G)} games in your first year. Next season, let’s aim for your first hit.`
        : `You’ve played ${number(season.G)} games. In your next at-bat, wait for a pitch you can drive with confidence. One hit is a good place to start.`,
      'hits-recorded': ({ season }, { number }) => `You have ${number(season.H)} ${plural(season.H, 'hit')} this year. Think back to the at-bats where you saw the ball all the way in. Carry that feeling forward.`,
      'first-extra-base-hit': ({ previous }, { number }) => `You had ${number(previous.H)} ${plural(previous.H, 'hit')} last year. This year, look for a pitch in your best zone and go after that first extra-base hit.`,
      'first-extra-base-hit-recorded': ({ season }, { number }) => {
        const count = extraBaseHits(season)
        return `You’ve recorded ${number(count)} ${plural(count, 'extra-base hit')} this year. Think back to the pitch you drove for your first.`
      },
      'reduce-strikeouts': ({ previous }, { number }) => `You struck out ${number(previous.SO)} times in ${number(previous.PA)} plate appearances last year. Let’s pick the pitches you can put your best swing on.`,
      'hold-hits': ({ previous }, { number }) => `Your routine helped you collect ${number(previous.H)} ${plural(previous.H, 'hit')} last year. Let’s stick with what helped you put those at-bats together.`,
      'routine-recovery': ({ preparation, condition }, { number }) => preparation === 'rest'
        ? 'You chose to rest in your preparation. When you feel fresh, start with the pitches you handle best.'
        : `Your condition is at ${number(condition)}. Give yourself a chance to recover before you step into the box.`,
      'routine-discipline': ({ previous }, { number }) => `Last season you drew ${number(previous.BB)} ${plural(previous.BB, 'walk')} and struck out ${number(previous.SO)} times in ${number(previous.PA)} plate appearances. Decide which pitches you want to swing at before you step in.`,
      'routine-power': ({ previous }, { number }) => {
        const count = extraBaseHits(previous)
        return `You had ${number(count)} ${plural(count, 'extra-base hit')} last season. Think of a pitch you can drive and build your routine around being ready for it.`
      },
      'matchup-first': ({ complete, previous }, { opponent, number }) => opponent
        ? `You’re facing ${opponent}. We don’t have results from a completed game against them this season. Start by reading the pitch speed.`
        : `You collected ${number(previous.H)} ${plural(previous.H, 'hit')} last season. ${complete ? 'Next year' : 'In the upcoming series'}, start by reading the speed of the pitch.`,
      'matchup-opportunity': ({ matchup, complete }, { opponent, number }) => `You’ve had ${number(matchup.stats.PA)} plate appearances against ${opponent}. ${complete ? 'When you face them again' : 'In this matchup'}, look for a pitch in your best zone and work toward that first hit.`,
      'matchup-build': ({ matchup, complete }, { opponent, number }) => `You got ${number(matchup.stats.H)} ${plural(matchup.stats.H, 'hit')} against ${opponent}. ${complete ? 'Next time you see them' : 'Today'}, remember what you saw in those at-bats and wait for a pitch you can handle.`,
      'average-up': () => 'Your batting average went up. Think back to which pitch choices helped you make better contact and carry those into next season.',
      'average-down': () => 'Your batting average dipped. Start by getting comfortable in your best zone again, one at-bat at a time.',
      'average-tied': () => 'You posted the same average in both seasons. Keep the preparation that helped you stay consistent.',
      'average-unavailable': () => 'Let’s look back at five seasons together. Start with the years you had at-bats and see which strengths are worth carrying forward.',
      'bounce-back': () => 'Your average dipped across the last two seasons. Start with the pitches you handled best and work back toward that earlier mark.',
      'form-steady': () => 'Your average held steady across both seasons. Think about what helps you get ready before an at-bat and carry that routine forward.',
      'form-up': ({ reference }, { number }) => `Your average improved across the last two seasons. Let’s set the next goal using your personal best of ${number(reference)} ${plural(reference, 'hit')}.`,
      'form-baseline': ({ previous }, { number }) => `You took ${number(previous.PA)} plate appearances last season. Start with a pitch you can swing at comfortably and use that to build your next benchmark.`,
      'mentor-discipline': ({ previous }, { number }) => `You drew ${number(previous.BB)} ${plural(previous.BB, 'walk')} last season. Show a younger player how you decide which pitches to wait for.`,
      'mentor-power': ({ previous }, { number }) => {
        const count = extraBaseHits(previous)
        return `You hit for extra bases ${number(count)} ${plural(count, 'time')} last season. Share the zone you trust and how you get ready for a pitch you can drive.`
      },
      'mentor-work-in-progress': ({ previous }, { number }) => `You took ${number(previous.PA)} plate appearances last season. Compare a pitch you each found difficult and talk through how you would prepare for it next time.`,
      'mentor-personal': ({ previous }, { number }) => `You had ${number(previous.H)} ${plural(previous.H, 'hit')} last season. Set one clear cue for your own at-bats first. You can share it when you feel ready.`,
      'team-fundamentals': ({ previous }, { number }) => `You struck out ${number(previous.SO)} times last season. Compare the zones you and Yoon Tae-oh look for and agree on a drill before the game.`,
      'team-contact': ({ previous }, { number }) => `You collected ${number(previous.H)} ${plural(previous.H, 'hit')} last year. Pick one good at-bat each with Yoon Tae-oh and use what you learned in warmups.`,
      'personal-discipline': ({ previous }, { number }) => `Start with the ${number(previous.BB)} ${plural(previous.BB, 'walk')} you drew last season. Decide where you want the ball before each trip to the plate.`,
      'personal-power': ({ previous }, { number }) => {
        const count = extraBaseHits(previous)
        return `You had ${number(count)} ${plural(count, 'extra-base hit')} last year. Build your preparation around the pitch you know you can drive.`
      },
      'personal-contact': ({ previous }, { number }) => `You had ${number(previous.H)} ${plural(previous.H, 'hit')} last year. Start by getting comfortable in the zone where your swing feels easiest.`,
      'milestone-ahead': ({ total }, { goal, metric, number }) => `You’ve played ${number(total.G)} games. You’re working toward ${number(goal.target)} career ${singularIfOne(goal.target, metric[goal.metric])}. Let’s get there one at-bat at a time.`,
      'milestone-reached': ({ total }, { goal, metric, number }) => `You’ve reached ${number(goal.target)} career ${singularIfOne(goal.target, metric[goal.metric])}, built one at-bat at a time across ${number(total.G)} games.`,
      'home-runs-recorded': ({ total }, { number }) => `Ten seasons brought ${number(total.H)} ${plural(total.H, 'hit')} and ${number(total.HR)} ${plural(total.HR, 'home run')}. Let’s revisit how it started and the seasons that went best.`,
      'hits-only': ({ total }, { number }) => `You collected ${number(total.H)} ${plural(total.H, 'hit')} over ten seasons. Let’s look back at the chances you had and the year you hit the most.`,
      'no-hits': ({ total }, { number }) => `You stepped to the plate ${number(total.PA)} times over ten seasons. Let’s look back at those appearances and how you prepared.`,
    },
    goalFor: { season: 'Suggested season goal', career: 'Career milestone', 'next-season': 'Suggested goal for next season', preparation: 'Pregame goal', matchup: 'Suggested matchup goal' },
    metrics: { hits: 'hits', extraBases: 'extra-base hits', walks: 'walks', strikeoutRate: 'strikeout rate', battingAverage: 'batting average', recovery: 'recovery sessions' },
    recoveryGoal: count => `${count} ${plural(count, 'recovery session')}`,
    opponentFallback: 'that club',
    choiceGroup: 'Preparation to discuss with your coach',
    options: { 'share-routine': 'Share my routine', 'focus-self': 'Review my preparation first', 'work-together': 'Prepare with Yoon Tae-oh', 'personal-routine': 'Focus on my own routine' },
    current: 'Current',
    reached: 'Goal reached',
    ceiling: 'or less',
    twoYearAverage: 'Batting average in the last two seasons',
    averageEvidence: (hits, atBats) => `${hits} H / ${atBats} AB`,
    matchupLabel: opponent => `Results against ${opponent}`,
    matchupEvidence: (games, appearances, hits, extraBases) => `${games} G · ${appearances} PA · ${hits} H · ${extraBases} XBH`,
    firstHit: 'First hit',
    firstHomeRun: 'First home run',
    bestHits: 'Most hits in a season',
    bestExtraBases: 'Most extra-base hits in a season',
    tied: 'tie',
    reviewTitle: 'Revisit your career record',
    review: {
      'home-runs-recorded': 'Find your first home run season and the year with your most extra-base hits.',
      'hits-only': 'Find your first hit season and the year with your most hits.',
      'no-hits': 'Review your career plate appearances and games played by season.',
    },
  },
}

const numberByLocale = { ko: new Intl.NumberFormat('ko'), en: new Intl.NumberFormat('en') }
const percentByLocale = {
  ko: new Intl.NumberFormat('ko', { style: 'percent', maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }),
}
const battingAverage = value => value.toFixed(3).replace(/^0\./, '.')

function Goal({ goal, variant, copy, locale }) {
  if (!goal) return null
  if (goal.kind === 'review') {
    return <aside className={styles.goal} aria-label={copy.reviewTitle}>
      <strong>{copy.reviewTitle}</strong>
      <p>{copy.review[variant]}</p>
    </aside>
  }
  const format = goal.metric === 'battingAverage' ? battingAverage
    : goal.kind === 'rate' ? percentByLocale[locale].format : numberByLocale[locale].format
  const target = goal.metric === 'recovery'
    ? copy.recoveryGoal(format(goal.target)) : `${copy.metrics[goal.metric]} ${format(goal.target)}`
  const inProgress = Number.isFinite(goal.current) && goal.scope !== 'next-season'
  const reached = goal.metric === 'strikeoutRate' ? goal.current <= goal.target : goal.current >= goal.target
  return <aside className={styles.goal} aria-label={copy.goalFor[goal.scope]}>
    <span>{copy.goalFor[goal.scope]}</span>
    <strong>{target}{goal.metric === 'strikeoutRate' && ` ${copy.ceiling}`}</strong>
    {inProgress && <p>{copy.current} {format(goal.current)}{reached && ` · ${copy.reached}`}</p>}
  </aside>
}

function Records({ story: { year, evidence }, copy, number, opponent }) {
  function bestLine(best) {
    const label = best.years.map(copy.year).join(' · ')
    return `${number(best.count)} · ${label}${best.years.length > 1 ? ` (${copy.tied})` : ''}`
  }
  function averageLine(stats, season) {
    return `${copy.year(season)} ${battingAverage(stats.H / stats.AB)} (${copy.averageEvidence(number(stats.H), number(stats.AB))})`
  }
  const trend = year === 5 ? { earlier: evidence.previous, latest: evidence.season, earlierYear: year - 1, latestYear: year } : evidence.trend
  const matchupStats = evidence.matchup?.stats
  const entries = [
    ...(year === 10 ? [
      [copy.firstHit, evidence.firstHitYear && copy.year(evidence.firstHitYear)],
      [copy.firstHomeRun, evidence.firstHomeRunYear && copy.year(evidence.firstHomeRunYear)],
    ] : []),
    ...(trend?.earlier?.AB && trend.latest.AB ? [[
      copy.twoYearAverage,
      `${averageLine(trend.earlier, trend.earlierYear)} · ${averageLine(trend.latest, trend.latestYear)}`,
    ]] : []),
    ...(matchupStats && opponent ? [[
      copy.matchupLabel(opponent),
      copy.matchupEvidence(number(matchupStats.G), number(matchupStats.PA), number(matchupStats.H), number(extraBaseHits(matchupStats))),
    ]] : []),
    ...(year === 5 || year === 10 ? [
      [copy.bestHits, evidence.bestHits && bestLine(evidence.bestHits)],
      [copy.bestExtraBases, evidence.bestExtraBases && bestLine(evidence.bestExtraBases)],
    ] : []),
  ].filter(([, value]) => value)
  if (!entries.length) return null
  return <dl className={styles.records}>{entries.map(([label, value]) => (
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
  ))}</dl>
}

function StoryCard({ story, locale, compact }) {
  const headingId = useId()
  const [optionId, selectOption] = useState(null)

  const language = locale === 'en' ? 'en' : 'ko'
  const copy = copyByLocale[language]
  const number = value => numberByLocale[language].format(value)
  const { year, evidence, options } = story
  const option = options?.find(item => item.id === optionId) ?? options?.[0]
  const { variant, goal } = option ?? story
  const opponent = BASEBALL_TEAMS.find(team => team.id === evidence.matchup?.opponentId)?.name
  const Heading = compact ? 'h3' : 'h2'
  const dialogue = copy.dialogue[variant](evidence, {
    goal, number, metric: copy.metrics, opponent: opponent ?? (evidence.matchup?.stats ? copy.opponentFallback : null),
  })
  return <section className={`${styles.story}${compact ? ` ${styles.compact}` : ''}`} aria-labelledby={headingId}
    data-career-story-year={year} data-career-story-variant={variant}>
    <header className={styles.heading}>
      <span>{copy.year(year)}</span>
      <Heading id={headingId}>{copy.titles[year]}</Heading>
    </header>
    {options && <div className={styles.options} role="group" aria-label={copy.choiceGroup}>
      {options.map(item => <button key={item.id} type="button" aria-pressed={item.id === option.id}
        data-career-story-option={item.id} onClick={() => selectOption(item.id)}>{copy.options[item.id]}</button>)}
    </div>}
    <div className={styles.scene} aria-live={options ? 'polite' : undefined}>
      <figure className={styles.coach}>
        <figcaption>{copy.coach}</figcaption>
        <blockquote>{dialogue}</blockquote>
      </figure>
      <Goal goal={goal} variant={variant} copy={copy} locale={language} />
    </div>
    <Records story={story} copy={copy} number={number} opponent={opponent} />
  </section>
}

export default function BaseballCareerStory({ story, locale, compact = false }) {
  return story ? <StoryCard key={story.year} story={story} locale={locale} compact={compact} /> : null
}
