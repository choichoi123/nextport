import { useId, useMemo } from 'react'
import { BASEBALL_RULES, BASEBALL_PITCH_TYPES, createBaseballPitch, getBaseballPitchSpeed, sampleBaseballPitch } from '@/lib/playground-baseball.mjs'
import styles from '@/styles/playground-baseball-comparison.module.css'

const colors = ['#d7b74d','#67bfd0','#dc8f9f','#9fc974']
const dashes = ['', '7 3', '2 3', '9 3 2 3']
// Node and browser transcendental math can differ in the last binary digits.
// Quantize presentation attributes only; the shared physical samples stay exact.
const coordinate = value => value.toFixed(2)
const copy = {
  ko: { title:'구종별 궤적 비교', note:'같은 중앙 코스 · 같은 투수 손 · 실제 게임 계산', side:'옆에서 본 높이', top:'위에서 본 좌우 움직임', release:'릴리스', plate:'홈플레이트', flight:'도착', seconds:'초', left:'좌투 기준', right:'우투 기준', model:'단순 게임 모델 · 구속 비율과 변화량은 비교용 설정입니다.', dots:'점은 각 공 비행의 25·50·75% 지점입니다. 같은 코스로 도착하도록 출발 방향은 달라집니다.', hints:{'four-seam':'빠른 도착 · 상대적으로 적은 낙차',slider:'글러브 쪽으로 휘어지는 공',curveball:'큰 높이 변화 · 느린 도착',changeup:'구속 차이 · 팔 쪽으로 흐르는 공'} },
  en: { title:'Compare pitch paths', note:'Same center target · same throwing hand · actual game model', side:'Height from the side', top:'Lateral movement from above', release:'Release', plate:'Home plate', flight:'Arrival', seconds:'s', left:'Left-handed reference', right:'Right-handed reference', model:'Simplified game model. Speed ratios and movement are comparison settings.', dots:'Dots mark 25%, 50% and 75% of each pitch’s flight. Launch directions differ to reach the same target.', hints:{'four-seam':'Fast arrival · less drop',slider:'Glove-side movement',curveball:'Larger height change · slower arrival',changeup:'Slower speed · arm-side movement'} },
}

export default function BaseballPitchComparison({ baseSpeedKmh, pitcherHandedness = 'right', selectedType, names, locale = 'ko', onSelect }) {
  const text = copy[locale] || copy.ko
  const chartId = useId()
  const pitches = useMemo(() => BASEBALL_PITCH_TYPES.map((profile,index) => {
    const pitch = createBaseballPitch({ pitchType:profile.id, speedKmh:getBaseballPitchSpeed(baseSpeedKmh,profile.id),
      seed:1, pitcherHandedness, target:{x:0,y:(BASEBALL_RULES.zone.bottom+BASEBALL_RULES.zone.top)/2} })
    const samples = Array.from({length:65},(_,i)=>sampleBaseballPitch(pitch,pitch.flightTimeMs*i/64))
    return { ...pitch, color:colors[index], dash:dashes[index], samples }
  }), [baseSpeedKmh,pitcherHandedness])
  // Shared axes retain real metre proportions within each view; paths are not
  // separately stretched to make a particular pitch appear more dramatic.
  const maximumY = Math.max(2.2,...pitches.flatMap(p=>p.samples.map(s=>s.y)))+.12
  const maximumX = Math.max(.55,...pitches.flatMap(p=>p.samples.map(s=>Math.abs(s.x))))+.06
  const chartPoint = (point,view) => ({
    x:30+(1-point.z/BASEBALL_RULES.releaseDistanceM)*300,
    y:view==='side' ? 112-point.y/maximumY*86 : 66-point.x/maximumX*43,
  })
  const ordered = [...pitches].sort((a,b)=>Number(a.type===selectedType)-Number(b.type===selectedType))
  return <details className={styles.comparison} open data-baseball-comparison="true">
    <summary>{text.title}<span>{pitcherHandedness==='left'?text.left:text.right}</span></summary>
    <div className={styles.content}>
      <p>{text.note}</p>
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
        <span><i aria-hidden="true"/>{names[p.type]}</span><strong>{p.speedKmh}<small> km/h</small></strong>
        <small>{text.flight} {(p.flightTimeMs/1000).toFixed(2)}{text.seconds}</small><em>{text.hints[p.type]}</em>
      </button>)}</div>
      <small className={styles.note}>{text.dots}<br/>{text.model}</small>
    </div>
  </details>
}
