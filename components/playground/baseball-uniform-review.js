import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BASEBALL_BATTER_FRAME_NAMES, getBaseballBatterFrames } from '@/lib/playground-baseball-animation.mjs'
import { BASEBALL_TEAMS, getBaseballTeam } from '@/lib/playground-baseball-teams.mjs'
import { BASEBALL_UNIFORM_LABELS, getBaseballUniformRegions, compileBaseballUniformMask, classifyBaseballUniformPixel, paintBaseballUniform, getBaseballUndersleeveRegions, compileBaseballUndersleeveMask, paintBaseballUndersleeves } from '@/lib/playground-baseball-uniform.mjs'
import { getBaseballBatterDeliverySrc } from '@/lib/playground-baseball-delivery.mjs'
import { loadBaseballClothTexture } from '@/lib/playground-baseball-cloth.mjs'
import styles from '@/styles/playground-baseball-uniform-review.module.css'

const COLORS = {
  helmet:[112,173,255], jersey:[237,119,173], sleeve:[255,183,88], pants:[138,216,153],
  accent:[255,237,112], secondary:[172,132,237], piping:[77,222,219],
}
const PILOT_TEXT = {
  ko:{title:'10구단 의상 비교',heroes:'피움 · 버건디 상의와 헬멧, 아이보리 테두리와 바지, 가는 버건디 옆선.',twins:'GG · 검정 헬멧, 붉은 테두리, 상의·소매·바지의 가는 핀스트라이프.',dinos:'XP · 네이비 어깨·소매, 골드 칼라·앞여밈, 민트 소맷단과 흰 원단, 네이비 바지 옆선.',reference:'확정 컨셉 보기 ↗',lions:'함성 · 로열블루 상의·헬멧, 흰 테두리와 바지.',landers:'MSG · 스칼렛 상의·헬멧, 아이보리 테두리와 흰 바지.',wiz:'PT · 검정 상의·헬멧, 붉은 테두리와 긴 이너소매.',tigers:'기세 · 흰 상의, 붉은 헬멧·테두리·긴 이너소매와 바지 옆선.',bears:'두근 · 아이보리 상하의, 네이비 테두리·헬멧·긴 이너소매와 작은 붉은 포인트.',eagles:'한방 · 오렌지 몸통, 네이비 어깨·소매, 아이보리 테두리.',giants:'로켓 · 네이비 상의, 붉은 테두리·헬멧 디테일과 흰 옆판.',sleeves:'긴 이너소매는 자세별 독립 원단 레이어입니다. 팔 모양과 손·장갑·배트는 유지합니다.'},
  en:{title:'Ten-club uniform comparison',heroes:'Heroes · burgundy jersey and helmet, ivory trim and pants, and a fine burgundy side seam.',twins:'GG · black helmet, red trim, and fine pinstripes across the jersey, sleeves and pants.',dinos:'XP · navy shoulder and sleeve panels, gold collar and placket, mint cuffs, white cloth, and navy pants piping.',reference:'View the approved concept ↗',lions:'Lions · royal-blue jersey and helmet, white trim and pants.',landers:'MSG · scarlet jersey and helmet, ivory trim and white pants.',wiz:'PT · black jersey and helmet, red trim and long compression sleeves.',tigers:'Tigers · white jersey, scarlet helmet, red trim, long compression sleeves and pants piping.',bears:'Bears · ivory uniform, navy trim, helmet and compression sleeves, with a small red detail.',eagles:'Eagles · orange body, navy shoulders and sleeves, ivory trim.',giants:'Giants · navy jersey, red trim and helmet detail, and white side panels.',sleeves:'Long sleeves use separate, pose-specific cloth layers. Arm shape, hands, gloves and bat remain unchanged.'},
}
const TEXT = {
  ko:{title:'같은 선수, 구분된 의상 영역.',intro:'활성 16개 자세의 원본·합성 영역·색상 결과를 비교합니다. 10구단의 배색·테두리·이너소매를 확정 컨셉과 대조합니다.',back:'실제 타격장',hand:'타석',right:'우타',left:'좌타',pose:'자세',team:'색상 확인 구단',previous:'이전 자세',next:'다음 자세',original:'활성 전송 원본',mask:'의상 영역',painted:'색상 합성',loading:'현재 자세를 준비하고 있습니다.',failed:'이미지 또는 의상 영역을 불러오지 못했습니다.',retry:'다시 불러오기',ready:'합성 완료',protected:'이너소매가 덮는 팔을 제외한 피부·장갑·배트·신발과 의상 밖 영역은 활성 전송 원본을 유지합니다.',note:'색상 띠와 파이핑은 자세별 영역 안에서 처리합니다. 팀별 소매 배색·줄무늬 간격·장식의 최종 조정은 다음 시범 구단 단계에서 진행합니다.',alpha:'알파 변경',outside:'의상 밖 RGB 변경',changed:'의상 RGB 변경',regions:'영역별 적용 픽셀',checks:'같은 크기·자세·배치를 유지한 메모리 합성입니다. 경기·기록·DB를 변경하지 않습니다.',labels:{helmet:'헬멧',jersey:'상의 몸통',sleeve:'소매',pants:'바지',accent:'주 장식',secondary:'보조 장식',piping:'바지 파이핑'},poses:['준비','체중 싣기','디딤','접촉 직전','접촉 자세','마무리','복귀','준비로 연결']},
  en:{title:'Same batter. Separate clothing regions.',intro:'Compare source, clothing regions and recoloring across the 16 active poses. Review all ten club palettes, trim and undersleeves against the approved concepts.',back:'Batting practice',hand:'Batting side',right:'Right',left:'Left',pose:'Pose',team:'Club color preview',previous:'Previous pose',next:'Next pose',original:'Active transport source',mask:'Clothing regions',painted:'Recolored',loading:'Preparing the selected pose.',failed:'The image or clothing regions could not be loaded.',retry:'Retry',ready:'Composition ready',protected:'Except where compression cloth covers the arms, skin, gloves, bat, shoes and pixels outside clothing keep their active transport source.',note:'Bands and piping stay within pose-specific regions. Club-specific sleeve colors, stripe spacing and trim will be refined in the pilot stage.',alpha:'Alpha changes',outside:'RGB changes outside regions',changed:'Clothing RGB changes',regions:'Pixels applied per region',checks:'In-memory composition preserves image size, pose and placement. It does not change gameplay, records or the database.',labels:{helmet:'Helmet',jersey:'Jersey body',sleeve:'Sleeves',pants:'Pants',accent:'Primary trim',secondary:'Secondary trim',piping:'Pants piping'},poses:['Ready','Load','Plant','Pre-contact','Contact','Follow-through','Recovery','Reset']},
}

async function loadPose(src) {
  const image = new Image()
  image.decoding = 'async'
  await new Promise((resolve,reject) => {
    const timeout = setTimeout(() => { image.onload=null; image.onerror=null; reject(new Error('Image timeout')) },20000)
    image.onload = () => { clearTimeout(timeout); resolve() }
    image.onerror = () => { clearTimeout(timeout); reject(new Error('Image unavailable')) }
    image.src = src
  })
  await image.decode()
  return image
}

export default function BaseballUniformReview({locale = 'ko'}) {
  const text = TEXT[locale] || TEXT.ko
  const [hand,setHand] = useState('right')
  const [pose,setPose] = useState('ready')
  const [teamId,setTeamId] = useState('heroes')
  const [retry,setRetry] = useState(0)
  const [status,setStatus] = useState('loading')
  const [report,setReport] = useState(null)
  const originalRef = useRef(null)
  const maskRef = useRef(null)
  const paintedRef = useRef(null)
  const frame = getBaseballBatterFrames(hand)[pose]
  const team = getBaseballTeam(teamId)
  const pilotText = PILOT_TEXT[locale] || PILOT_TEXT.ko
  const materialLabels = team.uniformProfile==='dinos-pilot-v1' ? {...text.labels,sleeve:locale==='en'?'Sleeves / shoulders':'소매·어깨 패널'} : text.labels

  useEffect(() => {
    let cancelled = false
    setStatus('loading'); setReport(null)
    Promise.all([loadPose(frame.src), loadPose(getBaseballBatterDeliverySrc(frame)), team.undersleeve ? loadBaseballClothTexture() : null]).then(([image,delivery,texture]) => {
      if (cancelled) return
      if (image.naturalWidth !== frame.width || image.naturalHeight !== frame.height) throw new Error('Invalid dimensions')
      const canvases = [originalRef.current,maskRef.current,paintedRef.current]
      if (canvases.some(canvas => !canvas)) return
      const contexts = canvases.map(canvas => {
        canvas.width=frame.width; canvas.height=frame.height
        const ctx=canvas.getContext('2d',{willReadFrequently:true})
        if (!ctx) throw new Error('Canvas unavailable')
        return ctx
      })
      contexts[0].drawImage(image,0,0)
      const original=contexts[0].getImageData(0,0,frame.width,frame.height)
      if(delivery.naturalWidth!==frame.width || delivery.naturalHeight!==frame.height) throw new Error('Invalid delivery dimensions')
      const transport=document.createElement('canvas')
      transport.width=frame.width;transport.height=frame.height
      const transportContext=transport.getContext('2d',{willReadFrequently:true})
      if(!transportContext) throw new Error('Transport canvas unavailable')
      transportContext.drawImage(delivery,0,0)
      const delivered=transportContext.getImageData(0,0,frame.width,frame.height)
      transport.width=1;transport.height=1
      let deliveryChanges=0,deliveryMaxDelta=0,deliveryAlphaChanges=0,deliveryOpaqueChanges=0,deliveryPremultipliedMax=0
      const deliveryHistogram={}
      for(let i=0;i<original.data.length;i+=4) {
        let delta=0
        for(let c=0;c<3;c++) {
          delta=Math.max(delta,Math.abs(original.data[i+c]-delivered.data[i+c]))
          deliveryPremultipliedMax=Math.max(deliveryPremultipliedMax,Math.abs(Math.round(original.data[i+c]*original.data[i+3]/255)-Math.round(delivered.data[i+c]*delivered.data[i+3]/255)))
        }
        const alphaDelta=Math.abs(original.data[i+3]-delivered.data[i+3])
        if(alphaDelta)deliveryAlphaChanges++
        if(delta||alphaDelta)deliveryChanges++
        if(delta&&original.data[i+3]===255)deliveryOpaqueChanges++
        deliveryMaxDelta=Math.max(deliveryMaxDelta,delta)
        if(delta)deliveryHistogram[delta]=(deliveryHistogram[delta]||0)+1
      }
      const source=delivered
      contexts[0].putImageData(source,0,0)
      const regions=getBaseballUniformRegions({handedness:hand,name:pose,src:frame.src,uniformProfile:team.uniformProfile})
      const mask=compileBaseballUniformMask(regions,{feet:frame.feet})
      const colored=new ImageData(new Uint8ClampedArray(delivered.data),frame.width,frame.height)
      const result=paintBaseballUniform(colored,team,regions,{feet:frame.feet})
      const sleeveRegions=team.undersleeve ? getBaseballUndersleeveRegions({handedness:hand,name:pose,src:frame.src}) : null
      const sleeveMask=sleeveRegions ? compileBaseballUndersleeveMask(sleeveRegions,{feet:frame.feet}) : null
      if(sleeveRegions) result.counts.undersleeve=paintBaseballUndersleeves(colored,team,sleeveRegions,{texture,feet:frame.feet}).counts.painted
      const overlay=new ImageData(new Uint8ClampedArray(source.data),frame.width,frame.height)
      const palette=Object.fromEntries(Object.entries(COLORS).map(([key,value])=>[BASEBALL_UNIFORM_LABELS[key],value]))
      let alphaChanges=0,outsideChanges=0,changed=0
      for(let pixel=0;pixel<mask.length;pixel++) {
        const index=pixel*4
        const eligible=classifyBaseballUniformPixel(mask[pixel],source.data[index],source.data[index+1],source.data[index+2],source.data[index+3],team.uniformProfile)
        const sleeveEligible=sleeveMask?.[pixel] && source.data[index+3]>=32
        const color=sleeveEligible ? [185,137,84] : palette[eligible]
        if(color && source.data[index+3]>0) for(let channel=0;channel<3;channel++) overlay.data[index+channel]=Math.round(source.data[index+channel]*.25+color[channel]*.75)
        if(source.data[index+3]!==colored.data[index+3]) alphaChanges++
        if(source.data[index]!==colored.data[index]||source.data[index+1]!==colored.data[index+1]||source.data[index+2]!==colored.data[index+2]) {
          changed++
          if(!eligible && !sleeveEligible) outsideChanges++
        }
      }
      contexts[1].putImageData(overlay,0,0); contexts[2].putImageData(colored,0,0)
      setReport({alphaChanges,outsideChanges,changed,deliveryChanges,deliveryMaxDelta,deliveryAlphaChanges,deliveryOpaqueChanges,deliveryPremultipliedMax,deliveryHistogram,counts:result.counts})
      setStatus('ready')
    }).catch(() => { if(!cancelled) setStatus('error') })
    return () => { cancelled=true }
  },[frame,hand,pose,team,retry])

  useEffect(() => {
    const canvases=[originalRef.current,maskRef.current,paintedRef.current]
    return () => { for(const canvas of canvases) if(canvas) {canvas.width=1;canvas.height=1} }
  },[])

  function step(direction) {
    const index=BASEBALL_BATTER_FRAME_NAMES.indexOf(pose)
    setPose(BASEBALL_BATTER_FRAME_NAMES[(index+direction+BASEBALL_BATTER_FRAME_NAMES.length)%BASEBALL_BATTER_FRAME_NAMES.length])
  }

  return <section className={styles.review} data-uniform-review={status} data-hand={hand} data-pose={pose} data-team={teamId}>
    <p className={styles.kicker}>BASEBALL · UNIFORM REGIONS</p>
    <h1>{text.title}</h1><p className={styles.intro}>{text.intro}</p>
    <Link href="/playground/baseball" className={styles.back}>← {text.back}</Link>
    <div className={styles.controls}>
      <label>{text.hand}<select value={hand} onChange={event=>setHand(event.target.value)}><option value="right">{text.right}</option><option value="left">{text.left}</option></select></label>
      <label>{text.pose}<select value={pose} onChange={event=>setPose(event.target.value)}>{BASEBALL_BATTER_FRAME_NAMES.map((name,index)=><option key={name} value={name}>{String(index+1).padStart(2,'0')} · {text.poses[index]}</option>)}</select></label>
      <label>{text.team}<select value={teamId} onChange={event=>setTeamId(event.target.value)}>{BASEBALL_TEAMS.map(club=><option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
      <button type="button" onClick={()=>step(-1)}>← {text.previous}</button><button type="button" onClick={()=>step(1)}>{text.next} →</button>
    </div>
    {team.uniformProfile&&<aside className={styles.pilot} data-uniform-pilot={team.uniformProfile}>
      <strong>{pilotText.title}</strong><p>{pilotText[teamId]}</p>
      {team.undersleeve&&<p>{pilotText.sleeves}</p>}
      <a href="/images/playground/baseball/concepts/20261123/index.html#teams">{pilotText.reference}</a>
    </aside>}
    <ul className={styles.legend}>{Object.entries(COLORS).map(([key,color])=><li key={key}><i style={{background:`rgb(${color.join(',')})`}} />{materialLabels[key]}</li>)}{team.undersleeve&&<li><i style={{background:'rgb(185,137,84)'}} />{locale==='en'?'Compression cloth':'긴 이너 원단'}</li>}</ul>
    <p role="status" className={styles.status}>{status==='ready'?text.ready:status==='error'?text.failed:text.loading}</p>
    {status==='error'&&<button className={styles.retry} type="button" onClick={()=>setRetry(value=>value+1)}>{text.retry}</button>}
    <div className={styles.canvases} aria-busy={status==='loading'}>
      {[['original',originalRef,text.original],['mask',maskRef,text.mask],['painted',paintedRef,text.painted]].map(([key,ref,label])=><figure key={key}><figcaption>{label}</figcaption><canvas ref={ref} role="img" aria-label={label} data-uniform-canvas={key} /></figure>)}
    </div>
    {report&&<div className={styles.report} data-uniform-report data-delivery-changes={report.deliveryChanges} data-delivery-max-delta={report.deliveryMaxDelta} data-delivery-alpha-changes={report.deliveryAlphaChanges} data-delivery-opaque-changes={report.deliveryOpaqueChanges} data-delivery-premultiplied-max={report.deliveryPremultipliedMax} data-delivery-histogram={JSON.stringify(report.deliveryHistogram)} data-alpha-changes={report.alphaChanges} data-outside-changes={report.outsideChanges} data-changed={report.changed} data-undersleeve-pixels={report.counts.undersleeve||0}>
      <dl>{[[locale==='en'?'Decode rounding / 255':'디코딩 반올림 / 255',report.deliveryPremultipliedMax],[text.alpha,report.alphaChanges],[text.outside,report.outsideChanges],[text.changed,report.changed]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value?.toLocaleString(locale==='en'?'en-US':'ko-KR') ?? '—'}</dd></div>)}</dl>
      <details><summary>{text.regions}</summary><pre>{JSON.stringify(report.counts,null,2)}</pre></details>
    </div>}
    <p className={styles.note}>{text.protected}<br/>{team.uniformProfile?(locale==='en'?'Clothing panels follow each pose. Source lighting and folds remain visible.':'자세별 의복 패널을 따르며 원본의 조명과 주름을 유지합니다.'):text.note}<br/>{text.checks}</p>
  </section>
}
