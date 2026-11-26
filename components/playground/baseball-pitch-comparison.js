import { useId, useMemo, useState } from 'react'
import { BASEBALL_RULES, sampleBaseballPitch } from '@/lib/playground-baseball.mjs'
import { BASEBALL_PRACTICE_PITCH_TYPES, createBaseballPracticePitch, getBaseballPracticePitchType } from '@/lib/playground-baseball-practice-pitches.mjs'
import styles from '@/styles/playground-baseball-comparison.module.css'

const paths = {
  'four-seam': { color:'#d7b74d', dash:'' },
  slider: { color:'#67bfd0', dash:'7 3' },
  curveball: { color:'#dc8f9f', dash:'2 3' },
  changeup: { color:'#9fc974', dash:'9 3 2 3' },
  sweeper: { color:'#c5aff3', dash:'12 4' },
  splitter: { color:'#ffab72', dash:'5 3 1 3' },
  sinker: { color:'#78dbb4', dash:'10 3 2 3 2 3' },
  cutter: { color:'#98adff', dash:'4 4' },
}
// Node and browser transcendental math can differ in the last binary digits.
// Quantize presentation attributes only; the shared physical samples stay exact.
const coordinate = value => value.toFixed(2)
const copy = {
  ko: {
    title:'구종별 궤적 비교', note:'같은 중앙 코스 · 같은 투수 손 · 실제 게임 계산', side:'옆에서 본 높이', top:'위에서 본 좌우 움직임', release:'릴리스', plate:'홈플레이트', flight:'도착', seconds:'초',
    throwingHand:'궤적 비교용 투수 손', left:'좌투', right:'우투',
    model:'단순 게임 모델 · 구속 비율과 변화량은 비교용 설정입니다.', dots:'점은 각 공 비행의 25·50·75% 지점입니다. 같은 코스로 도착하도록 출발 방향은 달라집니다.',
    hints:{'four-seam':'빠른 도착 · 상대적으로 적은 낙차',slider:'글러브 쪽으로 휘어지는 공',curveball:'큰 높이 변화 · 느린 도착',changeup:'구속 차이 · 팔 쪽으로 흐르는 공',sweeper:'글러브 쪽으로 크게 휘는 공',splitter:'홈플레이트 앞에서 아래로 떨어지는 공',sinker:'빠른 구속 · 투구 팔 쪽으로 흐르며 가라앉는 공',cutter:'빠른 구속 · 글러브 쪽으로 살짝 휘는 공'},
  },
  en: {
    title:'Compare pitch paths', note:'Same center target · same throwing hand · actual game model', side:'Height from the side', top:'Lateral movement from above', release:'Release', plate:'Home plate', flight:'Arrival', seconds:'s',
    throwingHand:'Throwing hand for comparison', left:'Left-handed', right:'Right-handed',
    model:'Simplified game model. Speed ratios and movement are comparison settings.', dots:'Dots mark 25%, 50% and 75% of each pitch’s flight. Launch directions differ to reach the same target.',
    hints:{'four-seam':'Fast arrival · less drop',slider:'Glove-side movement',curveball:'Larger height change · slower arrival',changeup:'Slower speed · arm-side movement',sweeper:'Wide glove-side break',splitter:'Drops as it approaches the plate',sinker:'High speed · arm-side run and drop',cutter:'High speed · short glove-side break'},
  },
}

export default function BaseballPitchComparison({ baseSpeedKmh, pitcherHandedness = 'right', selectedType, names, locale = 'ko', onSelect }) {
  const text = copy[locale] || copy.ko
  const chartId = useId()
  const [comparisonHand, setComparisonHand] = useState(null)
  const referenceHand = comparisonHand ?? pitcherHandedness
  const pitches = useMemo(() => BASEBALL_PRACTICE_PITCH_TYPES.map(({ id }) => {
    const pitch = createBaseballPracticePitch({ pitchType:id, baseSpeedKmh, seed:1, pitcherHandedness:referenceHand,
      target:{x:0,y:(BASEBALL_RULES.zone.bottom+BASEBALL_RULES.zone.top)/2} })
    const samples = Array.from({length:65},(_,i)=>sampleBaseballPitch(pitch,pitch.flightTimeMs*i/64))
    const type = getBaseballPracticePitchType(pitch)
    return { type, speedKmh:pitch.speedKmh, flightTimeMs:pitch.flightTimeMs, ...paths[type], samples }
  }), [baseSpeedKmh,referenceHand])
  // Shared axes retain real metre proportions within each view; paths are not
  // separately stretched to make a particular pitch appear more dramatic.
  const maximumY = Math.max(2.2,...pitches.flatMap(p=>p.samples.map(s=>s.y)))+.12
  const maximumX = Math.max(.55,...pitches.flatMap(p=>p.samples.map(s=>Math.abs(s.x))))+.06
  const chartPoint = (point,view) => ({
    x:30+(1-point.z/BASEBALL_RULES.releaseDistanceM)*300,
    y:view==='side' ? 112-point.y/maximumY*86 : 66-point.x/maximumX*43,
  })
  const ordered = [...pitches].sort((a,b)=>Number(a.type===selectedType)-Number(b.type===selectedType))
  return <details className={styles.comparison} open data-baseball-comparison="true" data-comparison-handedness={referenceHand}>
    <summary>{text.title}<span>{text[referenceHand]}</span></summary>
    <div className={styles.content}>
      <p>{text.note}</p>
      <div className={styles.handOptions} role="group" aria-label={text.throwingHand}>
        {['right','left'].map(hand=><button key={hand} type="button" aria-pressed={hand===referenceHand}
          data-compare-hand={hand} onClick={()=>setComparisonHand(hand)}>{text[hand]}</button>)}
      </div>
      <div className={styles.charts}>
        {['side','top'].map(view=><svg key={view} viewBox="0 0 360 140" role="img" aria-labelledby={`${chartId}-${view}`}>
          <title id={`${chartId}-${view}`}>{view==='side'?text.side:text.top}</title>
          <text x="14" y="15" className={styles.chartTitle}>{view==='side'?text.side:text.top}</text>
          <path d={`M30 25V112H330V25${view==='top'?'M30 66H330':''}`} className={styles.axis}/>
          {view==='side' && [1,2].filter(y=>y<maximumY).map(y=><g key={y}><path d={`M30 ${coordinate(chartPoint({x:0,y,z:0},view).y)}H330`} className={styles.grid}/><text x="8" y={coordinate(chartPoint({x:0,y,z:0},view).y+3)}>{y}m</text></g>)}
          <text x="30" y="130">{text.release}</text><text x="330" y="130" textAnchor="end">{text.plate}</text>
          {ordered.map(p=>{
            const points=p.samples.map(s=>chartPoint(s,view))
            const selected=p.type===selectedType
            return <g key={p.type} data-pitch-path={p.type} opacity={selected?1:.63}>
              <path d={points.map((s,i)=>`${i?'L':'M'}${coordinate(s.x)} ${coordinate(s.y)}`).join(' ')} fill="none" stroke={p.color} strokeWidth={selected?3:1.8} strokeDasharray={p.dash}/>
              {[16,32,48].map(index=><circle key={index} cx={coordinate(points[index].x)} cy={coordinate(points[index].y)} r={selected?3.2:2.4} fill={p.color}/>)}
            </g>
          })}
        </svg>)}
      </div>
      <div className={styles.legend}>{pitches.map(p=><button key={p.type} type="button" aria-pressed={p.type===selectedType} onClick={()=>onSelect(p.type)} style={{'--pitch-color':p.color}} data-compare-pitch={p.type}>
        <span><svg viewBox="0 0 24 6" aria-hidden="true"><path d="M0 3H24" stroke="currentColor" strokeWidth="2" strokeDasharray={p.dash}/></svg>{names[p.type]}</span><strong>{p.speedKmh}<small> km/h</small></strong>
        <small>{text.flight} {(p.flightTimeMs/1000).toFixed(2)}{text.seconds}</small><em>{text.hints[p.type]}</em>
      </button>)}</div>
      <small className={styles.note}>{text.dots}<br/>{text.model}</small>
    </div>
  </details>
}
