import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import BaseballAtBatGame from './baseball-at-bat-game'
import BaseballCareerRecovery from './baseball-career-recovery'
import BaseballCareerFinalReview from './baseball-career-final-review'
import BaseballCareerStory from './baseball-career-story'
import BaseballCareerWinter, { BaseballCareerWinterGoal } from './baseball-career-winter'
import { BASEBALL_CAREER_BRAND } from '@/lib/playground-baseball-brand.mjs'
import useBaseballFeedback from './use-baseball-feedback'
import useBaseballEntrance from './use-baseball-entrance'
import { BASEBALL_TEAMS, getBaseballTeam, validateBaseballPlayer } from '@/lib/playground-baseball-teams.mjs'
import { BASEBALL_AT_BAT_MIXED_EIGHT, BASEBALL_PRACTICE_PITCH_TYPES } from '@/lib/playground-baseball-practice-pitches.mjs'
import { matchesBaseballCareerV1Versions } from '@/lib/playground-baseball-pitch-version-compat.mjs'
import { getBaseballCareerV2ReplayVersions } from '@/lib/playground-baseball-career-versions.mjs'
import { getBaseballPlayerFeedback, revalidateBaseballPlayerField } from '@/lib/playground-baseball-input.mjs'
import { BASEBALL_CAREER_RULES } from '@/lib/playground-baseball-career.mjs'
import { BASEBALL_CAREER_RULES as BASEBALL_CAREER_V2_RULES, getBaseballCareerAppearancesPerGame } from '@/lib/playground-baseball-career-v2.mjs'
import { BASEBALL_ANNUAL_MAX_SEASONS, summarizeBaseballAnnualTotals } from '@/lib/playground-baseball-annual.mjs'
import { selectBaseballAnnualArchive } from '@/lib/playground-baseball-annual-client.mjs'
import { BASEBALL_REGULAR_SEASON_ID, getBaseballRegularSeasonSchedule, getBaseballRegularTrainingGain } from '@/lib/playground-baseball-career-schedule.mjs'
import { getBaseballCareerStory, getBaseballCareerStoryMatchup } from '@/lib/playground-baseball-career-story.mjs'
import { getBaseballCareerAdvancePlan, getBaseballCareerHighlight, getBaseballCareerNextHighlight } from '@/lib/playground-baseball-career-highlights.mjs'
import { createBaseballCareerView, reduceBaseballCareerView, getBaseballCareerResumeId, getBaseballCareerNextManualSlot, isBaseballCareerSessionCurrent, selectBaseballCareerCompletedAppearance } from '@/lib/playground-baseball-career-view.mjs'
import { getBaseballTrainingPreview, selectBaseballTrainingConfirmation } from '@/lib/playground-baseball-career-training-ui.mjs'
import styles from '@/styles/playground-baseball-career.module.css'

const annualCopy={
  ko:{guide:'경기와 훈련은 이 브라우저에 저장됩니다. 144경기를 마치면 시즌 결산을 서버에 저장할 수 있습니다.',local:'이 브라우저에 저장됨',settle:'시즌 결산 저장',settling:'시즌 결산 저장 중',settled:'시즌 결산 서버 저장 완료',unsettled:'144경기를 마쳤습니다. 결산을 저장하면 복구 코드로 다른 기기에서도 열 수 있습니다.',pending:'결산 저장을 확인하지 못했습니다. 기기 기록을 보관했으니 다시 시도해 주세요.',backup:'시즌 세이브 파일',export:'세이브 파일 내보내기',import:'세이브 파일 불러오기',imported:'세이브 파일을 불러왔습니다.',importError:'세이브 파일을 열지 못했습니다. 기존 기록과 파일 형식을 확인해 주세요.',exportError:'세이브 파일을 만들지 못했습니다. 다시 시도해 주세요.',serverList:'기존 서버 선수 보기'},
  en:{guide:'Games and training are saved in this browser. After 144 games, you can save the season review to the server.',local:'Saved in this browser',settle:'Save season review',settling:'Saving season review',settled:'Season review saved to the server',unsettled:'You completed 144 games. Save the season review to use a recovery code on another device.',pending:'The server save could not be confirmed. Your local record is still here. Try again.',backup:'Season save file',export:'Export save file',import:'Import save file',imported:'Save file loaded.',importError:'Could not load this save file. Check the existing save and the file format.',exportError:'Could not export this save file. Try again.',serverList:'Show existing server players'},
}

const multiSeasonCopy={
  ko:{year:n=>`${n}년차`,format:(n,count)=>`정규시즌 ${n}년차 · 경기당 ${count}타석`,finished:n=>`${n}년차 정규시즌을 마쳤습니다.`,next:n=>`${n}년차 시작`,prepareNext:'다음 시즌 준비',nextHint:'같은 선수로 능력치와 통산 기록을 이어갑니다.',nextError:'다음 시즌을 열지 못했습니다. 저장한 선수를 다시 선택해 주세요.',career:'통산 성적',seasons:'시즌별 성적',current:'진행 중',awaitingReview:'결산 저장 전',saved:'결산 저장 완료',book:'시즌별·통산 성적 보기'},
  en:{year:n=>`Year ${n}`,format:(n,count)=>`Year ${n} regular season · ${count} appearances per game`,finished:n=>`Your year ${n} regular season is complete.`,next:n=>`Start year ${n}`,prepareNext:'Prepare for next season',nextHint:'Continue with this batter’s abilities and career statistics.',nextError:'Could not open the next season. Select the saved batter again.',career:'Career statistics',seasons:'Season statistics',current:'In progress',awaitingReview:'Season review unsaved',saved:'Season review saved',book:'View season and career statistics'},
}

const copy={
  ko:{title:'나의 첫 세 경기.',kicker:'BATTING LAB · CAREER TRIAL',back:'한 타석 연습',intro:'한 선수를 저장하고, 준비부터 타석과 결산까지 이어갑니다. 실제 KBO 시즌과 구분한 가상 검수 일정입니다.',schedule:'3경기 · 1/4/7일 · 경기당 2타석',setup:'새 선수 만들기',name:'선수 이름',number:'등번호',numberHint:'0~99 · 07처럼 입력할 수 있어요.',hand:'타석',right:'우타',left:'좌타',team:'소속 구단',nameError:'이름을 16자 이내로 입력해 주세요.',numberError:'등번호는 0~99의 숫자로 입력해 주세요.',playerError:'선수 설정을 확인해 주세요.',speed:'포심 기준 구속',pitchMode:'투구 구성',pitchMixes:{mixed:'4구종 혼합',[BASEBALL_AT_BAT_MIXED_EIGHT]:'8구종 혼합'},create:'선수 저장하고 시작',development:'개발 검수용 선수로 분류',saved:'저장한 선수',empty:'저장된 선수가 없습니다.',resume:'이어하기',refresh:'목록 새로고침',loading:'기록 확인 중',ready:'개발 DB 연결됨',error:'저장을 확인하지 못했습니다. 기존 기록과 대기 요청을 유지합니다.',conflict:'다른 탭에서 진행한 기록과 충돌했습니다. 대기 요청을 보존한 뒤 서버 기록을 확인해 주세요.',unavailable:'개발 DB에 연결할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.',retry:'대기 요청 재전송',inspect:'서버 기록 확인',adopt:'최신 서버 기록으로 계속',adoptHint:'이전 대기 요청은 별도 로컬 충돌 이력에 보존합니다.',preparation:'오늘의 준비',preparationHint:'매 경기 전 한 번 선택합니다. 성장 지표와 컨디션을 기록하며 기본 공·배트 판정에는 보너스를 더하지 않습니다.',power:'파워 훈련',discipline:'선구 훈련',stamina:'체력 훈련',rest:'회복',play:'타석을 선택하세요',manual:'직접 타격',automatic:'다음 타석 자동 진행',manualResume:'진행 중 타석 이어하기',manualHint:'클릭·터치·키보드는 기존 한 타석과 같습니다. 자동 진행은 직접 조작 자료와 구분해 보관합니다.',season:'시즌 기록',growth:'성장과 컨디션',ledger:'성장 원장',feedback:'코칭 노트',games:'경기 일정과 결산',game:'경기',day:'일',home:'홈',away:'원정',scheduled:'예정',active:'진행 중',complete:'완료',final:'세 경기의 첫걸음을 마쳤습니다.',finalHint:'3경기 검수 시즌의 최종 성적을 확인하세요.',newPlayer:'다른 선수 보기',localNote:'개발용 선수 저장입니다. 같은 브라우저의 쿠키와 보관 자료를 유지해야 이어할 수 있습니다. 기존 10구·단독 타석·100m 기록과 별도이며 투구는 자동 시작하지 않습니다.',condition:'컨디션',trust:'코치 신뢰',xp:'경험치',source:'진행 출처',manualSource:'직접',automaticSource:'자동',developmentSource:'개발 검수',reconnect:'개발 코드가 갱신됐습니다. 페이지를 새로고침한 뒤 저장된 선수를 다시 선택해 주세요.',pitches:{'four-seam':'포심',slider:'슬라이더',curveball:'커브',changeup:'체인지업',sweeper:'스위퍼',splitter:'스플리터',sinker:'싱커',cutter:'커터'},outcomes:{walk:'볼넷','strikeout-looking':'루킹 삼진','strikeout-swinging':'헛스윙 삼진',single:'단타',double:'2루타',triple:'3루타','home-run':'홈런',flyout:'뜬공 아웃',lineout:'직선타 아웃',groundout:'땅볼 아웃'},feedbackKeys:{'next-opportunity':'오늘의 타석에서 다음 기회를 준비합니다.','first-hit':'첫 안타를 기록했습니다. 접촉과 결과를 함께 돌아보세요.','home-run-earned':'담장을 넘긴 타구를 기록했습니다. 같은 타이밍의 재현을 연습해 보세요.','walk-earned':'볼넷으로 출루했습니다. 스윙하지 않은 판단도 타석의 결과입니다.','strikeout-review':'삼진 기록이 있습니다. 조준점과 기준 타이밍을 복기해 보세요.','rest-advised':'컨디션이 낮습니다. 다음 경기 준비에서 회복을 고려해 보세요.','trial-complete':'세 경기 기록과 성장 원장을 바탕으로 다음 시즌을 설계할 수 있습니다.'},ledgerKinds:{preparation:'경기 준비',appearance:'타석 결과',game:'경기 결산',objective:'시즌 목표'}},
  en:{title:'My first three games.',kicker:'BATTING LAB · CAREER TRIAL',back:'At-bat practice',intro:'Save one batter and follow preparation, plate appearances and a season review. This fictional test schedule is separate from a real KBO season.',schedule:'3 games · days 1/4/7 · 2 appearances per game',setup:'Create a batter',name:'Player name',number:'Jersey number',numberHint:'0–99 · leading zero is supported.',hand:'Batting side',right:'Right',left:'Left',team:'Club',nameError:'Enter a name within 16 characters.',numberError:'Enter a jersey number from 0 to 99.',playerError:'Check the player settings.',speed:'Fastball reference speed',pitchMode:'Pitch selection',pitchMixes:{mixed:'Four-pitch mix',[BASEBALL_AT_BAT_MIXED_EIGHT]:'Eight-pitch mix'},create:'Save player and begin',development:'Classify as a development sample',saved:'Saved players',empty:'No saved players.',resume:'Resume',refresh:'Refresh list',loading:'Checking records',ready:'Development DB connected',error:'Storage could not be confirmed. Existing records and pending requests remain.',conflict:'Another tab advanced this save. Keep the pending request and inspect the server record.',unavailable:'The development DB cannot be reached. Check the connection and retry.',retry:'Retry pending request',inspect:'Inspect server record',adopt:'Continue with the server record',adoptHint:'The old pending request stays in a separate local conflict record.',preparation:'Prepare for today',preparationHint:'Choose once before each game. Training and condition are recorded without changing the basic ball or bat judgment.',power:'Power training',discipline:'Plate discipline',stamina:'Stamina training',rest:'Recovery',play:'Choose your appearance',manual:'Bat manually',automatic:'Simulate next appearance',manualResume:'Resume the active appearance',manualHint:'Click, touch and keyboard work as in at-bat practice. Automatic play is retained separately from direct input.',season:'Season statistics',growth:'Growth and condition',ledger:'Growth ledger',feedback:'Coaching notes',games:'Schedule and game reviews',game:'Game',day:'Day',home:'Home',away:'Away',scheduled:'Scheduled',active:'In progress',complete:'Complete',final:'Your first three games are complete.',finalHint:'Review your final results for the three-game test season.',newPlayer:'Choose another player',localNote:'Development saves require this same browser and its retained cookie/storage. They are separate from 10-pitch practice, standalone at-bats and 100m records. Pitches do not resume automatically.',condition:'Condition',trust:'Coach trust',xp:'Experience',source:'Play source',manualSource:'Manual',automaticSource:'Automatic',developmentSource:'Development',reconnect:'Development code changed. Refresh this page and choose the saved player again.',pitches:{'four-seam':'Four-seam',slider:'Slider',curveball:'Curveball',changeup:'Changeup',sweeper:'Sweeper',splitter:'Splitter',sinker:'Sinker',cutter:'Cutter'},outcomes:{walk:'Walk','strikeout-looking':'Called strikeout','strikeout-swinging':'Swinging strikeout',single:'Single',double:'Double',triple:'Triple','home-run':'Home run',flyout:'Flyout',lineout:'Lineout',groundout:'Groundout'},feedbackKeys:{'next-opportunity':'Build the next opportunity from this appearance.','first-hit':'Your first hit is recorded. Review both the contact and its result.','home-run-earned':'A ball cleared the fence. Practice reproducing that timing.','walk-earned':'A walk is recorded. Taking a pitch is a meaningful decision.','strikeout-review':'Review your aim and reference timing after a strikeout.','rest-advised':'Condition is low. Consider recovery before the next game.','trial-complete':'Use these three games and the growth ledger to plan the next season.'},ledgerKinds:{preparation:'Preparation',appearance:'Appearance',game:'Game review',objective:'Season objective'}},
}
const rate=value=>value===null?'—':value.toFixed(3).replace(/^0\./,'.')
const signed=value=>`${value>0?'+':''}${value}`
const seasonCopy={
  ko:{
    setup:'새 선수는 10개 구단의 가상 정규시즌 144경기를 치릅니다. 일반 경기는 자동으로 진행하고 주요 경기에서는 직접 타격을 선택할 수 있습니다.',
    format:'정규시즌 1년차 · 경기당 2타석',
    complete:'첫 정규시즌을 마쳤습니다.',
    completeHint:'144경기의 타격 성적과 성장 기록을 확인하세요.',
    autoGame:'경기 자동 진행',
    autoHint:'남은 타석을 자동으로 마치고 결산을 저장합니다.',
    trainingHint:'같은 훈련을 두 번 하면 해당 능력치가 1 오릅니다.',
    finishedNote:'첫 정규시즌의 성적과 훈련 기록이 저장되었습니다.',
    previousGame:'지난 경기 결산',
    current:'현재 경기',
    progress:'정규시즌 진행률',
    emptyLedger:'훈련과 타석을 마치면 성장 내역이 표시됩니다.',
    previous:'이전',
    next:'다음',
    range:(start,end,total)=>`${total}개 중 ${start}–${end}`,
    day:value=>`${value}일차`,
    game:value=>`${value}경기`,
  },
  en:{
    setup:'New batters start a fictional 144-game regular season with ten clubs. Simulate regular games and choose whether to bat in highlights.',
    format:'Year 1 regular season · two appearances per game',
    complete:'Your first regular season is complete.',
    completeHint:'Review your batting results and growth across all 144 games.',
    autoGame:'Simulate game',
    autoHint:'Simulate the remaining appearances and save the game review.',
    trainingHint:'Every second session of the same training raises that ability by one point.',
    finishedNote:'Your first regular-season statistics and training history are saved.',
    previousGame:'Previous game review',
    current:'Current game',
    progress:'Regular season progress',
    emptyLedger:'Training and completed appearances will appear here.',
    previous:'Previous',
    next:'Next',
    range:(start,end,total)=>`${start}–${end} of ${total}`,
    day:value=>`Day ${value}`,
    game:value=>`Game ${value}`,
  },
}
const preparationCopy={
  ko:{preview:'저장 전 예상 변화',previewNote:'상한과 하한을 적용한 예상값입니다. 준비 완료 후 서버의 실제 적용값을 확인합니다.',confirmed:'준비 저장 완료',actual:'서버에서 확인한 실제 변화',unchanged:'이번 준비에서 이 수치는 그대로입니다.',noChange:'이번 준비로 바뀐 수치는 없습니다.',cost:'컨디션 비용',recovery:'컨디션 회복',xp:'경험치'},
  en:{preview:'Preview before saving',previewNote:'Estimated values include caps. Confirm preparation to see the values actually applied by the server.',confirmed:'Preparation saved',actual:'Actual changes confirmed by the server',unchanged:'This preparation kept the value unchanged.',noChange:'This preparation changed no values.',cost:'Condition cost',recovery:'Condition recovery',xp:'XP'},
}

const highlightCopy={
  ko:{
    title:'자동 경기 진행',
    tag:'주요 경기',
    reasons:{opener:'개막전',midseason:'후반기 첫 경기',finale:'최종전',series:'시리즈 첫 경기'},
    scope:{series:'이번 시리즈 자동 진행',week:'이번 주 자동 진행',highlight:'다음 주요 경기까지'},
    gameCount:count=>`${count}경기`,
    next:(game,opponent)=>`다음 주요 경기 · ${game} · ${opponent}`,
    prep:'컨디션에 맞춰 훈련이나 회복을 선택합니다. 주요 경기 직전에 자동 진행을 멈춥니다.',
    ready:'직접 타격하려면 경기 준비를 마치세요. 이번 경기만 자동으로 진행할 수도 있습니다.',
    manual:'직접 타격',
    auto:'주요 경기 자동 진행',
    running:count=>`${count}경기 자동 진행 중`,
    done:count=>`${count}경기를 자동 진행했습니다.`,
    stopped:reason=>`주요 경기 · ${reason}에 도착했습니다.`,
    applied:'브라우저에 저장한 실제 변화',
    estimate:'상한과 하한을 반영했습니다. 준비 완료 후 실제 적용값을 확인합니다.',
    localConflict:'다른 탭에서 먼저 진행했습니다. 선수 화면에서 다시 열어 최신 기록을 확인해 주세요.',
  },
  en:{
    title:'Quick advance',
    tag:'Highlight game',
    reasons:{opener:'Opening day',midseason:'Second-half opener',finale:'Season finale',series:'Series opener'},
    scope:{series:'Simulate this series',week:'Simulate this week',highlight:'Advance to next highlight'},
    gameCount:count=>`${count} ${count===1?'game':'games'}`,
    next:(game,opponent)=>`Next highlight · ${game} · ${opponent}`,
    prep:'Training or recovery is chosen based on condition. Play stops before the next highlight.',
    ready:'Finish your preparation to bat manually, or simulate just this game.',
    manual:'Bat manually',
    auto:'Simulate this highlight',
    running:count=>`Simulating ${count} ${count===1?'game':'games'}`,
    done:count=>`Simulated ${count} ${count===1?'game':'games'}.`,
    stopped:reason=>`You have reached a highlight. ${reason}.`,
    applied:'Changes saved in this browser',
    estimate:'Estimates include caps. Confirm preparation to see the applied values.',
    localConflict:'Another tab advanced this season. Reopen the player to see the latest record.',
  },
}
const advanceScopes=['series','week','highlight']

function Statistics({value,rates,text,label=text.season}){return <div className={styles.statistics} aria-label={label}>{['G','PA','AB','H','2B','3B','HR','BB','SO'].map(key=><div key={key}><small>{key}</small><strong>{value[key]}</strong></div>)}{rates&&<><div><small>AVG</small><strong>{rate(rates.AVG)}</strong></div><div><small>SLG</small><strong>{rate(rates.SLG)}</strong></div></>}</div>}

function getSeasonStoryContext(year,career){
  if(!career)return {}
  const {games,currentGameIndex}=career
  if(year===3){
    const preparation=games[currentGameIndex]?.preparation
    return {preparation:preparation?.choice,condition:career.growth?.condition}
  }
  if(year===4){
    const opponent=games[currentGameIndex]||games.at(-1)
    return {matchup:getBaseballCareerStoryMatchup(games,opponent?.opponentId,currentGameIndex)}
  }
  return {}
}

function SeasonRecordBook({history,current,text,labels,winterPlan,locale,entries}){
  const total=summarizeBaseballAnnualTotals(history,current?.stats)
  const rows=current?[...history,current]:history
  return <>
    <section className={styles.panel} data-career-totals>
      <h2>{labels.career}</h2>
      <Statistics value={total.stats} rates={total.rates} text={text} label={labels.career}/>
    </section>
    <section className={styles.panel} data-career-season-history>
      <h2>{labels.seasons}</h2>
      <div className={styles.seasonBook}>{rows.map((row,index)=>{
        const isCurrent=row.seasonId===current?.seasonId
        const status=!isCurrent||current.saved?labels.saved:current.complete?labels.awaitingReview:labels.current
        const stats=summarizeBaseballAnnualTotals([],row.stats)
        const contextEntry=entries.find(entry=>entry.annual&&entry.seasonId===row.seasonId&&(isCurrent||entry.receipt)
          &&Object.keys(row.stats).every(key=>entry.checkpoint?.stats?.[key]===row.stats[key]))
        const story=getBaseballCareerStory({
          year:row.seasonNumber,stats:row.stats,history:rows.slice(0,index),complete:!isCurrent||current.complete,winterPlan,
          ...getSeasonStoryContext(row.seasonNumber,contextEntry?.checkpoint),
        })
        return <details key={row.seasonId} open={row.seasonId===rows.at(-1)?.seasonId}>
          <summary><strong>{labels.year(row.seasonNumber)}</strong><span>{status} · {row.stats.G} G · {row.stats.PA} PA</span></summary>
          <Statistics value={stats.stats} rates={stats.rates} text={text} label={labels.year(row.seasonNumber)}/>
          {row.seasonNumber===2&&winterPlan&&<BaseballCareerWinterGoal locale={locale} direction={winterPlan.direction} stats={rows[0].stats}/>}
          {story&&<BaseballCareerStory story={story} locale={locale} compact/>}
        </details>
      }).reverse()}</div>
    </section>
  </>
}

const pageSize=12

function CareerPager({page,total,onPage,labels}){
  if(total<=pageSize)return null
  return <div className={styles.recordPager}>
    <button type='button' disabled={page===0} onClick={()=>onPage(page-1)}>{labels.previous}</button>
    <span role='status'>{labels.range(page*pageSize+1,Math.min((page+1)*pageSize,total),total)}</span>
    <button type='button' disabled={(page+1)*pageSize>=total} onClick={()=>onPage(page+1)}>{labels.next}</button>
  </div>
}

function CareerAppearances({game,text,locale}){
  return <ol className={styles.appearanceResults}>{game.appearances.map(row=><li key={row.id}>
    <strong>{text.outcomes[row.outcome]||row.outcome}</strong>
    <small>{text[`${row.source}Source`]} · {row.pitchCount}{locale==='en'?' pitches':'구'}</small>
  </li>)}</ol>
}

function CareerSchedule({career,text,season,locale,highlights}){
  const [selectedPage,setSelectedPage]=useState(null)
  const currentIndex=Math.min(career.currentGameIndex,career.games.length-1)
  const page=selectedPage??Math.floor(currentIndex/pageSize)
  const start=page*pageSize
  return <section className={styles.panel}>
    <h2>{text.games}</h2>
    <CareerPager page={page} total={career.games.length} onPage={setSelectedPage} labels={season}/>
    <ol className={styles.scheduleList}>
      {career.games.slice(start,start+pageSize).map((game,index)=>{
        const gameIndex=start+index
        const current=career.status==='active'&&gameIndex===currentIndex
        const venue=game.home?text.home:text.away
        const highlight=highlights&&getBaseballCareerHighlight(career.games,gameIndex)
        const gameLabel=<><span className={styles.scheduleMatch}>
          <small>{season.game(game.ordinal)} · {season.day(game.day)}</small>
          <strong>{getBaseballTeam(game.opponentId).name}</strong>
          {highlight&&<small className={styles.scheduleHighlight}>{highlights.tag} · {highlights.reasons[highlight]}</small>}
        </span><span className={styles.scheduleStatus}>{venue} · {current?season.current:text[game.status]}</span></>
        return <li key={game.id} className={styles.scheduleEntry} data-highlight={highlight||undefined} aria-current={current?'step':undefined}>
          {game.appearances.length>0? <details>
            <summary>{gameLabel}</summary>
            <Statistics value={game.stats} text={text}/>
            <CareerAppearances game={game} text={text} locale={locale}/>
          </details>: <div className={styles.scheduleUpcoming}>{gameLabel}</div>}
        </li>
      })}
    </ol>
  </section>
}

function CareerQuickAdvance({career,season,labels,blocked,onAdvance}){
  const next=getBaseballCareerNextHighlight(career.games,career.currentGameIndex+1)
  return <section className={styles.taskCard}>
    <h2>{labels.title}</h2>
    {next&&<p>{labels.next(season.game(next.game.ordinal),getBaseballTeam(next.game.opponentId).name)}</p>}
    <p>{labels.prep}</p>
    <div className={styles.advanceActions}>
      {advanceScopes.map(scope=>{
        const {count}=getBaseballCareerAdvancePlan(career,scope)
        return <CareerButton key={scope} kind={`advance-${scope}`} className={scope==='highlight'?styles.primary:undefined} disabled={blocked||count===0} onAction={()=>void onAdvance(scope)}>
          <strong>{labels.scope[scope]}</strong>
          <small>{labels.gameCount(count)}</small>
        </CareerButton>
      })}
    </div>
  </section>
}

function CareerRecords({career,text,season,locale,showSeason=true}){
  const [page,setPage]=useState(0)
  const [showData,setShowData]=useState(false)
  const end=career.ledger.length-page*pageSize
  const events=career.ledger.slice(Math.max(0,end-pageSize),end).reverse()
  return <>
    {showSeason&&<section className={styles.panel}>
      <h2>{text.season}</h2>
      <Statistics value={career.stats} rates={career.rates} text={text}/>
    </section>}
    <section className={styles.panel}>
      <h2>{text.source}</h2>
      <div className={styles.sources}>{['manual','automatic','development'].map(source=><div key={source}>
        <h3>{text[`${source}Source`]}</h3>
        <Statistics value={career.statsBySource[source]} text={text}/>
      </div>)}</div>
    </section>
    <section className={styles.panel}>
      <h2>{text.ledger}</h2>
      {!events.length&&<p>{season.emptyLedger}</p>}
      <CareerPager page={page} total={career.ledger.length} onPage={setPage} labels={season}/>
      <ol className={styles.ledger}>{events.map(event=><li key={event.id}>
        <div><strong>{text.ledgerKinds[event.kind]||event.kind}</strong><span>{season.game(event.gameIndex+1)}{event.choice?` · ${text[event.choice]}`:''}</span></div>
        <div>{Object.entries(event.deltas).filter(([,delta])=>delta!==0).map(([key,delta])=><span key={key}>{text[key]} {signed(delta)}</span>)}</div>
      </li>)}</ol>
    </section>
    <details className={styles.data} onToggle={event=>setShowData(event.currentTarget.open)}>
      <summary>{locale==='en'?'Inspect confirmed career records':'확정된 육성 기록 확인'}</summary>
      {showData&&<pre data-baseball-career-records>{JSON.stringify(career,null,2)}</pre>}
    </details>
  </>
}

function previewTraining(career,rules,choice){
  let trainingRules=rules
  if(career.scheduleId===BASEBALL_REGULAR_SEASON_ID&&choice!=='rest'){
    const times=career.ledger.filter(event=>event.kind==='preparation'&&event.choice===choice).length
    trainingRules={...rules,training:{...rules.training,ability:getBaseballRegularTrainingGain(times)}}
  }
  return getBaseballTrainingPreview({growth:career.growth,rules:trainingRules,choice})
}


const focusCopy={
  ko:{home:'육성',schedule:'일정',records:'기록',player:'선수',title:'타자 육성',today:'오늘의 준비',choose:'훈련 또는 회복을 골라 주세요.',confirm:'준비 완료',enter:'타석 입장',nextAppearance:'다음 타석',appearanceError:'타석을 열지 못했습니다. 저장 상태를 확인한 뒤 다시 시도해 주세요.',resume:'이 타석 이어하기',return:'육성으로',ready:'저장 준비됨',saving:'저장 확인 중',prepared:'오늘의 준비를 마쳤습니다.',autoNote:'자동 진행은 다음 한 타석만 확정합니다.',profileNote:'진행 중 선수 설정은 유지됩니다. 다른 선수는 저장 목록에서 선택할 수 있습니다.',review:'타석 결산',growthEarned:'이번 타석의 성장',none:'새 성장 변화가 없습니다.',choosePlayer:'선수 선택',restore:'이전 타석이 남아 있습니다.',resultReady:'확정 결과를 확인했습니다.',connection:'저장 상태',training:'훈련',more:'상세 기록',trial:'3경기 육성 · 경기당 2타석',allDone:'첫 세 경기를 마쳤습니다.',trainingPreview:'선택한 준비의 변화',power:'파워',discipline:'선구',stamina:'체력'},
  en:{home:'Career',schedule:'Schedule',records:'Records',player:'Player',title:'Batter career',today:'Prepare for today',choose:'Choose training or recovery.',confirm:'Confirm preparation',enter:'Enter the box',nextAppearance:'Next appearance',appearanceError:'Could not open the appearance. Check the save status and try again.',resume:'Resume this appearance',return:'Back to career',ready:'Storage ready',saving:'Checking storage',prepared:'Today’s preparation is complete.',autoNote:'Simulation confirms only the next appearance.',profileNote:'The active player’s settings stay fixed. Choose another player from the save list.',review:'Appearance review',growthEarned:'Growth from this appearance',none:'No new growth changes.',choosePlayer:'Choose player',restore:'An unfinished appearance is waiting.',resultReady:'The final result is confirmed.',connection:'Save status',training:'Training',more:'Detailed records',trial:'Three-game career · two appearances per game',allDone:'Your first three games are complete.',trainingPreview:'Preparation preview',power:'Power',discipline:'Discipline',stamina:'Stamina'},
}

function CareerButton({kind,onAction,children,disabled=false,className,...attributes}){
  const intent=useRef(null)
  return <button type='button' className={className} disabled={disabled} {...attributes}
    onPointerDown={()=>{intent.current=kind}} onPointerCancel={()=>{intent.current=null}}
    onKeyDown={event=>{if(event.repeat||event.nativeEvent.isComposing)event.preventDefault()}}
    onClick={event=>{if(event.detail!==0&&intent.current!==kind)return;intent.current=null;onAction()}}>{children}</button>
}

export default function BaseballCareerGame({locale='ko',dataVersions=null,storageVersions=null,careerVersions=null,v2StorageVersions=null,v2CareerVersions=null,enabled=false,preview=false,production=false}){
  const localDevelopment=process.env.NODE_ENV==='development'
  const previewMode=!localDevelopment&&enabled===true&&preview===true
  const productionMode=!localDevelopment&&enabled===true&&production===true
  const careerEnabled=localDevelopment||previewMode||productionMode
  const annualVersionSignature=JSON.stringify(v2CareerVersions)
  const prefix=useId(),router=useRouter()
  const sharedFeedback=useBaseballFeedback({locale})
  const {intro:entranceIntro,prepare:prepareEntrance,enter:showEntrance,cancel:cancelEntrance}=useBaseballEntrance({feedback:sharedFeedback,locale})
  const clearCareerPresentation=useCallback(()=>{cancelEntrance();sharedFeedback.stop()},[cancelEntrance,sharedFeedback.stop])
  const [draft,setDraft]=useState({name:'',jerseyNumber:'7',teamId:'heroes',handedness:'right'})
  const [settings,setSettings]=useState({baseSpeedKmh:120,pitchMode:BASEBALL_AT_BAT_MIXED_EIGHT})
  const [errors,setErrors]=useState({}),[development,setDevelopment]=useState(false)
  const [store,setStore]=useState({entries:[],history:[],busy:false,code:null}),[opening,setOpening]=useState(true)
  const [career,setCareer]=useState(null),[manual,setManual]=useState(null),[review,setReview]=useState(null)
  const [fileMessage,setFileMessage]=useState(null),[settleState,setSettleState]=useState(null)
  const [advanceNote,setAdvanceNote]=useState(null)
  const [winterReview,setWinterReview]=useState(null)
  const annual=annualCopy[locale]||annualCopy.ko
  const multi=multiSeasonCopy[locale]||multiSeasonCopy.ko
  const selectedEntry=store.entries.find(entry=>entry.id===career?.id)
  const archive=selectBaseballAnnualArchive(selectedEntry,career?.id,store.confirmedHistories)
  const localDraft=selectedEntry?.annual===true
  const archiveCollision=Boolean(archive&&localDraft)
  const awaitingArchive=Boolean(selectedEntry?.archiveCheckRequired&&!archive)
  const annualCareer=localDraft&&!archive&&!awaitingArchive, annualReceipt=annualCareer?selectedEntry.receipt:null
  const visibleProfile=archive?.latest.profile||career?.profile
  const visibleSettings=archive?.latest.settings||career?.settings
  const year=selectedEntry?.seasonNumber||1
  const latestYear=archive?.latest?.seasonNumber||year
  const canStartNext=Boolean((annualReceipt||archive)&&latestYear<BASEBALL_ANNUAL_MAX_SEASONS)
  const canReviewWinter=canStartNext&&latestYear===1
  const modern=career?.schemaVersion!==1,rules=modern?BASEBALL_CAREER_V2_RULES:BASEBALL_CAREER_RULES
  const regular=career?.scheduleId===BASEBALL_REGULAR_SEASON_ID
  const season=seasonCopy[locale]||seasonCopy.ko
  const highlightText=highlightCopy[locale]||highlightCopy.ko
  const previewCopy=previewMode?{unavailable:locale==='en'?'Preview storage is unavailable. Existing records and pending requests remain.':'Preview 저장소에 연결하지 못했습니다. 기존 기록과 대기 요청은 유지합니다.',reconnect:locale==='en'?'The Preview version changed. Refresh this page and choose the saved player again.':'Preview 버전이 변경되었습니다. 새로고침한 뒤 저장된 선수를 다시 선택해 주세요.'}:{}
  const productionCopy=productionMode?{unavailable:locale==='en'?'Player storage is unavailable. Existing records and pending requests remain.':'선수 저장소에 연결하지 못했습니다. 기존 기록과 대기 요청은 유지합니다.',reconnect:locale==='en'?'The game version changed. Refresh this page and choose the saved player again.':'게임 버전이 변경되었습니다. 새로고침한 뒤 저장된 선수를 다시 선택해 주세요.'}:{}
  const text={...(copy[locale]||copy.ko),mit:locale==='en'?'Contact training':'미트 훈련',localNote:locale==='en'?'Records stay on the server. Keep a recovery code to continue this player in another browser. Pitches never resume automatically.':'기록은 서버에 저장됩니다. 복구 코드를 보관하면 다른 브라우저에서도 선수를 이어갑니다. 투구는 자동 재개하지 않습니다.',...previewCopy,...productionCopy}
  const pitchMode=visibleSettings?.pitchMode
  const pitchModeLabel=text.pitchMixes[pitchMode]??text.pitches[pitchMode]
  const f={...(focusCopy[locale]||focusCopy.ko),title:BASEBALL_CAREER_BRAND[locale==='en'?'en':'ko'].name,mit:locale==='en'?'Contact':'미트'}
  const [view,setView]=useState(createBaseballCareerView),[trainingChoice,setTrainingChoice]=useState(null),[trainingFeedback,setTrainingFeedback]=useState(null)
  const winterOpen=canReviewWinter&&winterReview?.id===career?.id&&view.view==='manage'&&view.tab==='home'
  const activeWinterPlan=selectedEntry?.winter
  const trainingEpoch=useRef(0),seenTrainingEvents=useRef(new Set())
  const clearTrainingFeedback=useCallback(()=>{trainingEpoch.current++;setTrainingFeedback(null)},[])
  const preparationText=preparationCopy[locale]||preparationCopy.ko
  const [reconnectNotice,setReconnectNotice]=useState(false),[operationPending,setOperationPending]=useState(false)
  const [appearanceError,setAppearanceError]=useState(false)
  const clientRef=useRef(null),alive=useRef(true),careerRef=useRef(null),manualRef=useRef(null),viewRef=useRef(view)
  const controlsRef=useRef(null),operationRef=useRef(false),selectionEpoch=useRef(0),contentRef=useRef(null),gameHeadingRef=useRef(null)
  const winterButtonRef=useRef(null),returnFocusRef=useRef(false),openingFocusRef=useRef(null)
  careerRef.current=career;manualRef.current=manual;viewRef.current=view
  const transition=useCallback(action=>{const next=reduceBaseballCareerView(viewRef.current,action);viewRef.current=next;setView(next);return next},[])
  const retainCareer=useCallback(value=>{careerRef.current=value;setCareer(value)},[])
  const goManage=useCallback((tab='home')=>{controlsRef.current?.pause();clearTrainingFeedback();clearCareerPresentation();setWinterReview(null);setAppearanceError(false);transition({type:'manage',tab})},[clearTrainingFeedback,clearCareerPresentation,transition])
  useEffect(()=>{
    const leave=()=>{controlsRef.current?.pause();clearTrainingFeedback();clearCareerPresentation();transition({type:'cancel'})}
    router.events.on('routeChangeStart',leave)
    return()=>router.events.off('routeChangeStart',leave)
  },[router.events,clearTrainingFeedback,clearCareerPresentation,transition])
  useEffect(()=>{
    let cancelled=false
    alive.current=true;setOpening(true);clearTrainingFeedback()
    if(careerRef.current){setCareer(null);setManual(null);setReview(null);setReconnectNotice(true);transition({type:'select-career',careerId:null})}
    if(careerEnabled)void(async()=>{try{
      const storage=await import('@/lib/playground-baseball-career-hub-client.mjs')
      const client=await storage.openBaseballCareerHubClient({annualVersions:JSON.parse(annualVersionSignature),onChange:value=>{if(!cancelled&&alive.current)setStore(value)}})
      if(cancelled||!alive.current){client.close();return}clientRef.current=client
    }catch(cause){if(!cancelled&&alive.current)setStore(old=>({...old,code:cause.code||'storage_unavailable',busy:false}))}finally{if(!cancelled&&alive.current)setOpening(false)}})()
    else setOpening(false)
    return()=>{cancelled=true;alive.current=false;selectionEpoch.current++;trainingEpoch.current++;clientRef.current?.close();clientRef.current=null}
  },[careerEnabled,clearTrainingFeedback,transition,annualVersionSignature])
  useEffect(()=>{if(contentRef.current)contentRef.current.scrollTop=0},[view.view,view.tab,career?.id,winterOpen])
  useEffect(()=>{
    if(!winterOpen&&returnFocusRef.current){returnFocusRef.current=false;winterButtonRef.current?.focus()}
  },[winterOpen])
  useEffect(()=>{
    if(career?.id&&openingFocusRef.current===career.id){openingFocusRef.current=null;gameHeadingRef.current?.focus()}
  },[career?.id])
  useEffect(()=>{
    if(advanceNote&&!advanceNote.running&&viewRef.current.view==='manage'&&viewRef.current.tab==='home')gameHeadingRef.current?.focus()
  },[advanceNote])
  const onManualSession=useCallback(session=>{
    const owner=manualRef.current,currentCareer=careerRef.current
    if(!alive.current||!owner||session.id!==owner.session.id)return
    const checkpoint=clientRef.current?.snapshot().entries.find(entry=>entry.id===currentCareer?.id)?.checkpoint
    if(!checkpoint||checkpoint.revision<currentCareer.revision||!isBaseballCareerSessionCurrent({career:checkpoint,atBatId:owner.session.id,currentSession:owner.latestSession,nextSession:session}))return
    retainCareer(checkpoint)
    const reviewLedger=owner.reviewLedger||(session.state.status==='complete'?checkpoint.ledger.filter(event=>!owner.ledgerIds.has(event.id)):null)
    const next={...owner,latestSession:session,reviewLedger};manualRef.current=next;setManual(next)
  },[retainCareer])
  const onControlReady=useCallback((id,controls)=>{if(manualRef.current?.session.id===id)controlsRef.current=controls},[])
  const onEntranceReady=useCallback(token=>{
    const owner=manualRef.current
    return Boolean(token&&alive.current&&viewRef.current.view==='batting'&&owner?.entryToken===token&&showEntrance(token,owner.player))
  },[showEntrance])
  const appearanceLimit=getBaseballCareerAppearancesPerGame(career)
  const appearanceSlot=manual?.slot
  const completed=selectBaseballCareerCompletedAppearance({career,atBatId:manual?.session.id,session:manual?.latestSession})
  const nextSlot=getBaseballCareerNextManualSlot(career,completed,appearanceLimit)
  const earned=completed?manual.reviewLedger||[]:[]
  const summary=completed?<section className={styles.panel} data-baseball-career-appearance-review>
    <h2>{f.review}</h2><p>{text.outcomes[completed.outcome]} · {completed.pitchCount}{locale==='en'?' pitches':'구'}</p>
    <Statistics value={{G:0,...completed.stats}} text={text}/><h3>{f.growthEarned}</h3>
    {!earned.length?<p>{f.none}</p>:<ul className={styles.notes}>{earned.map(event=><li key={event.id}>{text.ledgerKinds[event.kind]} · {Object.entries(event.deltas).filter(([,amount])=>amount!==0).map(([key,amount])=>`${text[key]} ${amount>0?'+':''}${amount}`).join(' / ')}</li>)}</ul>}
  </section>:null
  const embedded=useMemo(()=>manual?{player:manual.player,session:manual.session,latestSession:manual.latestSession,client:manual.client,onSession:onManualSession,
    feedback:sharedFeedback,entranceIntro,entryToken:manual.entryToken,onEntranceReady,onEntranceCancel:cancelEntrance,
    active:view.view==='batting',focused:true,onControlReady,summary,local:annualCareer,appearanceSlot,appearanceLimit}:null,
    [manual,onManualSession,sharedFeedback,entranceIntro,onEntranceReady,cancelEntrance,view.view,onControlReady,summary,annualCareer,appearanceSlot,appearanceLimit])
  const feedback=getBaseballPlayerFeedback(errors,text),busy=opening||store.busy||operationPending
  const pending=archive?null:selectedEntry?.pending
  const replayVersions=modern&&career&&v2CareerVersions?getBaseballCareerV2ReplayVersions(career,v2CareerVersions):null
  const selectedStorageVersions=modern
    ? (replayVersions&&v2StorageVersions?Object.fromEntries(Object.keys(v2StorageVersions).map(key=>[key,replayVersions[key]])):v2StorageVersions)
    : storageVersions
  const versionMismatch=Boolean(!archive&&career&&(modern
    ? v2CareerVersions&&!replayVersions
    : careerVersions&&!matchesBaseballCareerV1Versions(career.versions,careerVersions,career.settings.pitchMode)))
  const blocked=busy||Boolean(archive||pending)||awaitingArchive||versionMismatch
  const current=archive||awaitingArchive?null:career?.games[career.currentGameIndex]
  const resumeId=archive||awaitingArchive?null:getBaseballCareerResumeId(career)
  const highlight=annualCareer&&current?getBaseballCareerHighlight(career.games,career.currentGameIndex):null
  const quickAdvance=Boolean(annualCareer&&current&&!highlight&&!resumeId)
  const currentAdvanceNote=advanceNote?.id===career?.id&&advanceNote?.index===career?.currentGameIndex?advanceNote:null
  const previousGame=regular&&career.currentGameIndex>0?career.games[career.currentGameIndex-1]:null
  const format=annualCareer?multi.format(year,appearanceLimit):regular?season.format:f.trial
  const team=getBaseballTeam(visibleProfile?.teamId||draft.teamId)
  const annualHeads=new Map()
  for(const entry of store.entries.filter(value=>value.annual)){
    const id=entry.careerId||entry.id
    if((entry.seasonNumber||1)>(annualHeads.get(id)?.seasonNumber||0))annualHeads.set(id,entry)
  }
  const rows=[...new Map([...store.history.map(row=>[row.id,row]),...store.entries.map(entry=>{
    const remote=store.history.find(row=>row.id===entry.id)
    return[entry.id,{...(!entry.annual&&remote?.revision>(entry.checkpoint?.revision||0)?remote:entry.checkpoint),id:entry.id,entry,rulesVersion:entry.rulesVersion}]
  })]).values()].filter(row=>!row.entry?.annual
    ? !annualHeads.has(row.id)
    : annualHeads.get(row.entry.careerId||row.id)?.id===row.id)
    .sort((a,b)=>Number(Boolean(b.entry?.pending))-Number(Boolean(a.entry?.pending))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,40)
  const errorText=store.code==='local_conflict'&&annualCareer?highlightText.localConflict:['revision_conflict','command_conflict','local_conflict'].includes(store.code)?text.conflict:store.code==='client_reconnect_required'?text.reconnect:['not_configured','database_unavailable','owner_required'].includes(store.code)?text.unavailable
    :['storage_capacity','local_capacity'].includes(store.code)?(locale==='en'?'Storage capacity was reached. Existing records and pending requests remain.':'저장 한도에 도달했습니다. 기존 기록과 대기 요청을 유지합니다.')
      :store.code==='not_found'?(locale==='en'?'Access to this batter could not be confirmed. Refresh the list and reconnect using the original browser or a valid recovery code. Existing records and pending requests remain.':'선수 연결을 확인하지 못했습니다. 목록을 새로고침하고 원래 브라우저 또는 유효한 복구 코드로 다시 연결해 주세요. 기존 기록과 대기 요청은 유지합니다.'):text.error
  async function showCareer(value){
    if(!alive.current)return
    controlsRef.current?.pause();clearTrainingFeedback();clearCareerPresentation();manualRef.current?.client.close();controlsRef.current=null
    retainCareer(value);manualRef.current=null;setManual(null);setReview(null);setTrainingChoice(null);setReconnectNotice(false);setSettleState(null);setFileMessage(null);setAdvanceNote(null)
    setWinterReview(null);setAppearanceError(false)
    transition({type:'select-career',careerId:value.id})
  }
  async function refresh(){try{await clientRef.current?.refresh()}catch{/* Existing journal publishes the error. */}}
  async function loadConfirmedHistory(value){
    if(value?.schemaVersion!==2||value.scheduleId!==BASEBALL_REGULAR_SEASON_ID||value.status!=='complete'
      ||clientRef.current.snapshot().entries.some(entry=>entry.id===value.id&&entry.annual))return
    try{await clientRef.current.loadAnnualHistory(value.id)}catch{/* An ordinary server save can have no annual archive. */}
  }
  async function recoverCareer(id,version){
    if(operationRef.current)throw new Error('The current operation is still pending.')
    operationRef.current=true;setOperationPending(true)
    const ticket=++selectionEpoch.current
    try{
      const value=await clientRef.current.readRecovered(id,version)
      if(alive.current&&ticket===selectionEpoch.current){await showCareer(value.career);if(value.pending)setReview({id,career:value.career})}
    }
    finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function readCareer(id,retry=false){
    if(operationRef.current)return
    const ticket=++selectionEpoch.current;operationRef.current=true;setOperationPending(true)
    try{
      controlsRef.current?.pause();clearCareerPresentation()
      if(retry){const value=await clientRef.current.retry(id);if(alive.current&&ticket===selectionEpoch.current)await showCareer(value);return}
      const value=await clientRef.current.read(id)
      await loadConfirmedHistory(value.career)
      if(!alive.current||ticket!==selectionEpoch.current)return
      await showCareer(value.career);if(value.pending)setReview({id,career:value.career})
    }catch{/* Preserve the selected player and pending requests. */}finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function adopt(){if(!review||operationRef.current)return;operationRef.current=true;setOperationPending(true);try{await showCareer(await clientRef.current.adoptLatest(review.id))}catch{/* Conflict archive stays intact. */}finally{operationRef.current=false;if(alive.current)setOperationPending(false)}}
  function update(field,value){setDraft(old=>({...old,[field]:value}));setErrors(old=>revalidateBaseballPlayerField(old,{...draft,[field]:value},field))}
  async function create(event){
    event.preventDefault();const checked=validateBaseballPlayer(draft)
    if(!checked.valid){setErrors(checked.errors);return}
    if(!clientRef.current||busy||operationRef.current)return
    operationRef.current=true;setOperationPending(true)
    try{await showCareer(await clientRef.current.create(checked.player,settings,{source:development?'development':'manual'}));setErrors({})}catch{/* Retry retains the same create request. */}finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function importSeason(event){
    const file=event.target.files?.[0]
    event.target.value=''
    if(!file||!clientRef.current||operationRef.current)return
    operationRef.current=true;setOperationPending(true);setFileMessage(null)
    try{
      await showCareer(await clientRef.current.importSave(file))
      if(alive.current)setFileMessage({text:annual.imported})
    }catch{if(alive.current)setFileMessage({text:annual.importError,error:true})}
    finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function exportSeason(){
    if(!career||!clientRef.current||operationRef.current)return
    operationRef.current=true;setOperationPending(true);setFileMessage(null)
    try{
      const backup=await clientRef.current.exportSave(career.id)
      if(!alive.current)return
      const url=URL.createObjectURL(new Blob([backup],{type:'application/json'}))
      const download=document.createElement('a')
      download.href=url;download.download=`batter-journey-${career.currentGameIndex}.json`
      document.body.appendChild(download);download.click();download.remove()
      window.setTimeout(()=>URL.revokeObjectURL(url),30000)
    }catch{if(alive.current)setFileMessage({text:annual.exportError,error:true})}
    finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function settleSeason(finish){
    if(!annualCareer||career.status!=='complete'||annualReceipt||operationRef.current)return
    operationRef.current=true;setOperationPending(true);setSettleState('saving')
    try{
      const {career:confirmed,receipt}=await clientRef.current.settle(career.id,finish)
      if(alive.current){
        retainCareer(confirmed);setSettleState(null)
        if(receipt?.finish==='active')goManage('records')
      }
    }catch{if(alive.current)setSettleState('retry')}
    finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function openWinterReview(){
    if(!canReviewWinter||busy||operationRef.current)return
    const id=career.id
    operationRef.current=true;setOperationPending(true);setFileMessage(null)
    try{
      const plan=await clientRef.current.readWinterDraft(id)
      if(alive.current&&careerRef.current?.id===id&&viewRef.current.tab==='home')setWinterReview({id,plan})
    }catch{if(alive.current)setFileMessage({text:locale==='en'?'Could not open the saved winter preparation. Try again.':'저장한 겨울 준비를 열지 못했습니다. 다시 시도해 주세요.',error:true})}
    finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function selectWinterDirection(direction){
    if(!winterOpen||busy||operationRef.current)return false
    const id=career.id,plan={version:1,direction}
    operationRef.current=true;setOperationPending(true);setFileMessage(null)
    try{
      await clientRef.current.saveWinterDraft(id,plan)
      if(!alive.current||careerRef.current?.id!==id||viewRef.current.tab!=='home')return false
      setWinterReview(value=>value?.id===id?{id,plan}:value)
      return true
    }catch{
      if(alive.current)setFileMessage({text:locale==='en'?'Could not save this winter preparation in your browser. Try again.':'겨울 준비를 브라우저에 저장하지 못했습니다. 다시 시도해 주세요.',error:true})
      return false
    }finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  function backToSeasonReview(){
    returnFocusRef.current=true
    setFileMessage(null)
    setWinterReview(null)
  }
  async function startNextSeason(){
    if(!canStartNext||!career||busy||operationRef.current||(canReviewWinter&&(!winterOpen||!winterReview.plan)))return
    operationRef.current=true;setOperationPending(true);setFileMessage(null)
    try{
      const next=await clientRef.current.startNextSeason(career.id,canReviewWinter?winterReview.plan:undefined)
      openingFocusRef.current=next.id
      await showCareer(next)
    }
    catch{if(alive.current)setFileMessage({text:multi.nextError,error:true})}
    finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function command(value){
    if(!career||blocked||operationRef.current)return
    operationRef.current=true;setOperationPending(true);clearTrainingFeedback();clearCareerPresentation()
    const before=career,owner=career.id,ticket=trainingEpoch.current,selection=selectionEpoch.current
    try{const next=await clientRef.current.command(owner,value);if(alive.current&&careerRef.current?.id===owner){retainCareer(next);setReview(null);if(value.type==='prepare'){
      setTrainingChoice(null)
      const confirmed=selectBaseballTrainingConfirmation({before,after:next,choice:value.choice,seenIds:[...seenTrainingEvents.current],origin:'direct-command'})
      if(confirmed&&trainingEpoch.current===ticket&&selectionEpoch.current===selection&&viewRef.current.view==='manage'&&viewRef.current.tab==='home'){
        seenTrainingEvents.current.add(confirmed.id);setTrainingFeedback(confirmed)
      }
    }}}catch{/* Do not mint another command to retry. */}finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function advanceSchedule(scope){
    if(!annualCareer||!current||blocked||operationRef.current)return
    const plan=getBaseballCareerAdvancePlan(career,scope)
    if(!plan.count)return
    const id=career.id
    const stillSelected=()=>alive.current&&careerRef.current?.id===id
    operationRef.current=true;setOperationPending(true);clearTrainingFeedback();clearCareerPresentation()
    setAdvanceNote({id,index:plan.startIndex,count:plan.count,running:true})
    try{
      const next=await clientRef.current.advance(id,scope)
      if(!stillSelected())return
      retainCareer(next);setTrainingChoice(null);setReview(null)
      setAdvanceNote({id,index:next.currentGameIndex,count:next.currentGameIndex-plan.startIndex,highlight:getBaseballCareerHighlight(next.games,next.currentGameIndex)})
    }catch{
      if(stillSelected())setAdvanceNote(null)
    }finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  async function enterManual({next=false}={}){
    if(!career||blocked||operationRef.current||career.status==='complete'||!current?.preparation)return
    if(next&&!nextSlot)return
    const nextView=transition(next?{type:'request-next-manual',completedAtBatId:completed.id}:{type:'request-manual',atBatId:resumeId}),intent=nextView.intent
    if(!intent)return
    operationRef.current=true;setOperationPending(true)
    clearTrainingFeedback();clearCareerPresentation();setAppearanceError(false)
    const entryToken=resumeId?null:prepareEntrance(),ledgerIds=new Set(career.ledger.map(event=>event.id))
    const intended=()=>alive.current&&viewRef.current.intent?.epoch===intent.epoch&&viewRef.current.careerId===intent.careerId
    try{
      const value=resumeId?career:await clientRef.current.command(career.id,{type:'start-manual'})
      if(alive.current&&careerRef.current?.id===value.id)retainCareer(value)
      if(!intended()){cancelEntrance();return}
      const id=value.activeAtBat?.id;if(!id)throw new Error('Missing appearance')
      if(manualRef.current?.session.id===id){transition({type:'manual-ready',...intent,atBatId:id});return}
      const adapter=await clientRef.current.atBatAdapter(value.id,id,value.profile)
      if(!intended()){adapter.client.close();cancelEntrance();return}
      manualRef.current?.client.close();controlsRef.current=null
      const owner={...adapter,player:value.profile,entryToken,latestSession:adapter.session,slot:value.activeAtBat.slot,ledgerIds,reviewLedger:null}
      manualRef.current=owner;setManual(owner);setReview(null)
      transition({type:'manual-ready',...intent,atBatId:id})
    }catch{
      cancelEntrance()
      if(intended()){setAppearanceError(true);transition({type:'manual-failed',...intent})}
    }finally{operationRef.current=false;if(alive.current)setOperationPending(false)}
  }
  function chooseAnother(){try{clientRef.current?.selectNew()}catch{/* The current version status remains visible. */}selectionEpoch.current++;controlsRef.current?.pause();clearTrainingFeedback();clearCareerPresentation();manualRef.current?.client.close();manualRef.current=null;controlsRef.current=null;setManual(null);retainCareer(null);setReview(null);setTrainingChoice(null);setFileMessage(null);setSettleState(null);transition({type:'select-career',careerId:null})}
  const trainingPreview=career&&trainingChoice?previewTraining(career,rules,trainingChoice):null
  const seasonHistory=annualCareer?selectedEntry.history||[]:archive?.history||[]
  const winterRecord=annualCareer?store.entries.find(entry=>entry.careerId===selectedEntry.careerId&&entry.seasonNumber===2)?.winter
    :archive?.winter?.[2]
  const seasonRow=annualCareer?{seasonId:career.id,seasonNumber:year,stats:career.stats,saved:Boolean(annualReceipt),complete:career.status==='complete'}:null
  const archivedStats=archive?summarizeBaseballAnnualTotals([],seasonHistory.at(-1).stats):null
  const finalSeasonReady=latestYear===BASEBALL_ANNUAL_MAX_SEASONS&&Boolean(archive||seasonRow?.complete)
  const finalFinish=finalSeasonReady?(annualReceipt?.finish||archive?.finish):undefined
  const finishStatus=finalFinish&&({
    active:locale==='en'?'Active player · Review saved':'현역 · 결산 저장 완료',
    retired:locale==='en'?'Retired · Review saved':'은퇴 · 결산 저장 완료',
  })[finalFinish]
  const openingOrMidseason=highlight==='opener'||highlight==='midseason'
  const showHomeStory=(annualCareer||archive)&&(!current
    ||latestYear===1&&career.currentGameIndex===1
    ||latestYear===2&&highlight==='opener'
    ||latestYear===4&&Boolean(highlight)
    ||[3,6,7,8,9].includes(latestYear)&&openingOrMidseason)
  const homeStory=showHomeStory?getBaseballCareerStory({
    year:latestYear,stats:archivedStats?.stats||career.stats,history:archive?seasonHistory.slice(0,-1):seasonHistory,complete:!current,winterPlan:winterRecord,
    ...getSeasonStoryContext(latestYear,annualCareer?career:null),
  }):null
  const visibleGrowth=archive?.latest?.growth||career?.growth
  const winterProfile=visibleProfile
  const winterOpener=winterOpen?getBaseballRegularSeasonSchedule(winterProfile.teamId)?.[0]:null
  if(!careerEnabled)return <p>{locale==='en'?'Career play is in preparation.':'선수 육성은 준비 중입니다.'}</p>
  const filePicker=<label htmlFor={`${prefix}-season-file`}>{annual.import}<input id={`${prefix}-season-file`} type='file' accept='application/json,.json' disabled={busy} onChange={importSeason}/></label>
  const setupView=(<div className={styles.setupGrid}>
      <form className={styles.panel} onSubmit={create} noValidate><h2>{text.setup}</h2><p>{season.setup}</p><p>{annual.guide}</p>
        <div className={styles.nameGrid}><label htmlFor={`${prefix}-name`}>{text.name}<input id={`${prefix}-name`} value={draft.name} autoComplete="off" maxLength={32} aria-invalid={feedback.name.invalid} aria-describedby={feedback.name.describedBy} onChange={event=>update('name',event.target.value)} /></label><label htmlFor={`${prefix}-number`}>{text.number}<input id={`${prefix}-number`} value={draft.jerseyNumber} inputMode="numeric" maxLength={2} aria-invalid={feedback.jerseyNumber.invalid} aria-describedby={feedback.jerseyNumber.describedBy} onChange={event=>update('jerseyNumber',event.target.value)} /></label></div>
        <p className={styles.hint} id={feedback.numberHint}>{text.numberHint}</p><fieldset><legend>{text.hand}</legend><div className={styles.segments}><button type="button" aria-pressed={draft.handedness==='right'} onClick={()=>update('handedness','right')}>{text.right}</button><button type="button" aria-pressed={draft.handedness==='left'} onClick={()=>update('handedness','left')}>{text.left}</button></div></fieldset>
        <label htmlFor={`${prefix}-team`}>{text.team}<select id={`${prefix}-team`} value={draft.teamId} onChange={event=>update('teamId',event.target.value)}>{BASEBALL_TEAMS.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label htmlFor={`${prefix}-speed`}>{text.speed}<select id={`${prefix}-speed`} value={settings.baseSpeedKmh} onChange={event=>setSettings(old=>({...old,baseSpeedKmh:Number(event.target.value)}))}>{[80,100,120,140,160].map(value=><option key={value} value={value}>{value} km/h</option>)}</select></label>
        <label htmlFor={`${prefix}-mode`}>{text.pitchMode}<select id={`${prefix}-mode`} value={settings.pitchMode} onChange={event=>setSettings(old=>({...old,pitchMode:event.target.value}))}><option value={BASEBALL_AT_BAT_MIXED_EIGHT}>{text.pitchMixes[BASEBALL_AT_BAT_MIXED_EIGHT]}</option>{BASEBALL_PRACTICE_PITCH_TYPES.map(({id})=><option key={id} value={id}>{text.pitches[id]}</option>)}</select></label>
        {localDevelopment&&<label className={styles.checkbox}><input type="checkbox" checked={development} onChange={event=>setDevelopment(event.target.checked)} />{text.development}</label>}
        {feedback.messages.map(message=><p key={message.id} id={message.id} className={styles.error} role="alert">{message.text}</p>)}
        <button className={styles.primary} type="submit" disabled={busy||!clientRef.current}>{text.create} →</button>
      </form>
      <div><section className={styles.panel}><h2>{text.saved}</h2>{!rows.length&&!busy&&!store.code&&<p>{text.empty}</p>}<ul className={styles.saved}>{rows.map((row,index)=><li key={row.id}><div><strong>{row.profile?.name||row.entry?.pending?.body.profile?.name||(locale==='en'?`Player ${index+1}`:`선수 ${index+1}`)}</strong><small>{row.entry?.annual&&<>{multi.year(row.entry.seasonNumber||1)} · </>}{row.status==='complete'?text.complete:text.active} · {row.completedGames??row.currentGameIndex??0}/{row.totalGames??row.games?.length??3} · v{row.rulesVersion||row.schemaVersion||1}</small></div><div className={styles.actions}>{row.entry?.pending?<><button type="button" disabled={busy} onClick={()=>void readCareer(row.id,true)}>{text.retry}</button><button type="button" disabled={busy} onClick={()=>void readCareer(row.id)}>{text.inspect}</button></>:<button type="button" disabled={busy} onClick={()=>void readCareer(row.id)}>{text.resume}</button>}</div></li>)}</ul></section><BaseballCareerRecovery locale={locale} onRecovered={recoverCareer} disabled={busy}/>
        <section className={styles.panel}><h2>{annual.backup}</h2>{filePicker}<button type='button' disabled={busy} onClick={()=>void refresh()}>{annual.serverList}</button></section>
      </div>
    </div>)
  return <section className={`${styles.game} ${styles.focusGame}`} data-baseball-career data-career-rule-version={career?.schemaVersion||2} data-career-schedule={career?.scheduleId} data-career-screen={view.view} data-career-player={Boolean(career)} data-career-finish={finalFinish} onKeyDownCapture={event=>{
    if(event.target.closest('button')&&['Enter','Space'].includes(event.code)&&(event.repeat||event.nativeEvent.isComposing))event.preventDefault()
    if(event.key==='Enter'&&event.nativeEvent.isComposing)event.preventDefault()
  }}>
    <header className={styles.focusHeader}><div><p className={styles.kicker}>BATTING LAB · {previewMode?'PREVIEW':'CAREER'} · v{career?.schemaVersion||2}</p><h1>{visibleProfile?.name||f.title}</h1></div>
      <span className={styles.hint} role='status' aria-label={f.connection}>{settleState==='saving'?annual.settling:busy&&!annualCareer?f.saving:awaitingArchive?(locale==='en'?'Server confirmation needed':'서버 기록 확인 필요'):finishStatus||(annualReceipt||archive?annual.settled:store.code?f.connection:annualCareer?annual.local:f.ready)}</span>
        {!career&&<Link href='/playground/baseball/at-bat' prefetch={false}>← {text.back}</Link>}
    </header>
    {career&&view.view==='manage'&&<nav className={styles.focusNav} aria-label={f.title}>{['home','schedule','records','player'].map(tab=><button type='button' key={tab} aria-current={view.tab===tab?'page':undefined} data-active={view.tab===tab} onClick={()=>goManage(tab)}>{f[tab]}</button>)}</nav>}
    <div ref={contentRef} className={styles.focusContent} hidden={view.view==='batting'} id={`${prefix}-career-content`}>
      {previewMode&&!career&&<p className={styles.compactNotice} data-baseball-career-preview>{locale==='en'?'Preview test · Test records are stored separately from the public service.':'Preview 검수 · 기록은 공개 서비스와 분리해 저장합니다.'}</p>}
      {archiveCollision&&<p className={styles.compactNotice} role='status' data-baseball-career-archive-collision>{locale==='en'?'Showing the confirmed server record. Your local save file is still available in Player.':'서버에서 확정한 기록을 표시합니다. 브라우저에 보관된 세이브 파일은 선수 화면에서 내보낼 수 있습니다.'}</p>}
      {store.code&&<p className={styles.compactNotice} role='alert'>{errorText}</p>}
      {appearanceError&&!store.code&&<p className={styles.compactNotice} role='alert'>{f.appearanceError}</p>}
      {fileMessage&&<p className={styles.compactNotice} role={fileMessage.error?'alert':'status'}>{fileMessage.text}</p>}
      {Object.entries(store.versionErrors||{}).filter(([version,code])=>code&&Number(version)!==store.activeVersion).map(([version])=><p className={styles.error} role='alert' key={version}>{locale==='en'?`The v${version} player list could not be loaded. Its existing records remain unchanged.`:`v${version} 선수 목록을 확인하지 못했습니다. 해당 버전의 기존 기록은 유지됩니다.`}</p>)}
      {reconnectNotice&&<p className={styles.hint}>{text.reconnect}</p>}
      {versionMismatch&&<p className={styles.error} role='alert'>{locale==='en'?'This save uses different rules. Existing records remain unchanged.':'다른 규칙 버전의 선수입니다. 기존 기록은 그대로 보존합니다.'}</p>}
      {pending&&<div className={styles.notice}><p>{busy?f.saving:text.error}</p><div className={styles.actions}><button type='button' disabled={busy} onClick={()=>void readCareer(career.id,true)}>{text.retry}</button><button type='button' disabled={busy} onClick={()=>void readCareer(career.id)}>{text.inspect}</button></div></div>}
      {review&&<div className={styles.notice}><p>{text.conflict}</p><p>{text.adoptHint}</p><button type='button' disabled={busy||review.career.revision<=(store.entries.find(entry=>entry.id===review.id)?.pending?.body.expectedRevision||0)} onClick={()=>void adopt()}>{text.adopt}</button></div>}
      {!career?setupView:awaitingArchive&&view.tab!=='player'?<section className={styles.panel} data-baseball-career-archive-unavailable>
        <h2>{locale==='en'?'Confirm the latest server record':'최신 서버 기록 확인'}</h2>
        <p>{locale==='en'?'This browser save is older than a confirmed server season. Connect to verify the newer record, or export this save in Player.':'이 브라우저 세이브 뒤에 서버에서 확정한 시즌이 있습니다. 연결을 확인한 뒤 다시 시도하거나 선수 화면에서 세이브를 내보낼 수 있습니다.'}</p>
        <button type='button' disabled={busy} onClick={()=>void readCareer(career.id)}>{locale==='en'?'Check the server again':'서버 기록 다시 확인'}</button>
        <button type='button' onClick={()=>goManage('player')}>{annual.export}</button>
      </section>:winterOpen?<BaseballCareerWinter
        key={career.id}
        locale={locale}
        profile={winterProfile}
        growth={visibleGrowth}
        stats={annualReceipt?.stats||archivedStats?.stats}
        opener={winterOpener?`${getBaseballTeam(winterOpener.opponentId).name} · ${winterOpener.home?text.home:text.away}`:null}
        selection={winterReview.plan}
        disabled={busy}
        onBack={backToSeasonReview}
        onSelect={selectWinterDirection}
        onStart={startNextSeason}
      />:view.tab==='home'?<>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>{archive?multi.format(latestYear,archivedStats.stats.PA/archivedStats.stats.G):format}</p>
            {highlight&&<span className={styles.heroHighlight}>{highlightText.tag} · {highlightText.reasons[highlight]}</span>}
            <h2 ref={gameHeadingRef} tabIndex={annualCareer?-1:undefined} className={styles.heroTitle}>{current?`${season.game(current.ordinal)} · ${season.day(current.day)}`:(annualCareer||archive)?multi.finished(latestYear):regular?season.complete:f.allDone}</h2>
            <p>{current?`${getBaseballTeam(current.opponentId).name} · ${current.home?text.home:text.away}`:regular?season.completeHint:text.finalHint}</p>
            <div className={styles.heroMeta}>
              <span>{team.name}</span>
              <span>{visibleProfile.handedness==='left'?text.left:text.right}</span>
              <span>{archivedStats?.stats.G??career.currentGameIndex}/{career.games.length} {text.complete}</span>
            </div>
            {regular&&<progress className={styles.seasonProgress} value={archivedStats?.stats.G??career.currentGameIndex} max={career.games.length} aria-label={season.progress}/>}
          </div>
          <div className={styles.heroBadge} style={{'--team-color':team.helmet}}>#{visibleProfile.jerseyNumber}</div>
        </section>
        {activeWinterPlan&&current&&<BaseballCareerWinterGoal locale={locale} direction={activeWinterPlan.direction} stats={seasonHistory[0].stats}/>}
        {homeStory&&<BaseballCareerStory story={homeStory} locale={locale}/>}
        {annualCareer&&<div className={styles.advanceStatus} role='status' aria-live='polite'>{currentAdvanceNote&&(currentAdvanceNote.running
          ?highlightText.running(currentAdvanceNote.count)
          :`${highlightText.done(currentAdvanceNote.count)}${currentAdvanceNote.highlight?` ${highlightText.stopped(highlightText.reasons[currentAdvanceNote.highlight])}`:''}`)}</div>}
        {quickAdvance&&<CareerQuickAdvance career={career} season={season} labels={highlightText} blocked={blocked} onAdvance={advanceSchedule}/>}
        <div className={styles.metricGrid}>{['condition','xp','trust'].map(key=><div className={styles.metric} key={key}><span>{text[key]}</span><strong>{visibleGrowth[key]}</strong></div>)}</div>
        {current&&!quickAdvance&&<section className={styles.taskCard}>
          <h2>{current.preparation?f.prepared:f.today}</h2>
          {highlight&&!resumeId&&<p>{highlightText.ready}</p>}
          {!current.preparation?<><p>{f.choose}</p>{regular&&<p>{season.trainingHint}</p>}
            <div className={styles.trainingChoices}>{(modern?['mit','power','discipline','stamina','rest']:['power','discipline','stamina','rest']).map(choice=>{
              const preview=previewTraining(career,rules,choice)
              if(!preview)return null
              const [main,...costs]=preview.rows
              return <button type='button' key={choice} aria-pressed={trainingChoice===choice} disabled={blocked} onClick={()=>setTrainingChoice(choice)}>
                <strong>{text[choice]}</strong><small className={styles.trainingChoiceValue}>{main.before} → {main.after} ({signed(main.delta)})</small>
                {costs.map(row=><small key={row.key}>{row.key==='condition'?preparationText.cost:preparationText.xp} {row.before} → {row.after} ({signed(row.delta)})</small>)}
              </button>
            })}</div>
            {trainingPreview&&<div className={styles.trainingPreview} role='status'><strong>{preparationText.preview}</strong>
              <dl className={styles.trainingChanges}>{trainingPreview.rows.map(row=><div key={row.key}><dt>{f[row.key]||text[row.key]}</dt><dd>{row.before} → {row.after} <span>({signed(row.delta)})</span></dd></div>)}</dl>
              <p>{annualCareer?highlightText.estimate:preparationText.previewNote}</p>
            </div>}
          </>:<>
            <p>{text[current.preparation.choice]} · {current.appearances.length}/{appearanceLimit} PA</p>
            <p>{resumeId?f.restore:text.manualHint}</p>
            {regular&&!annualCareer&&!resumeId&&<>
              <p>{season.autoHint}</p>
              <CareerButton kind='simulate-appearance' disabled={blocked} onAction={()=>void command({type:'simulate-at-bat'})}>{text.automatic}</CareerButton>
            </>}
            {regular&&current.appearances.length>0&&<CareerAppearances game={current} text={text} locale={locale}/>}
          </>}
          {trainingFeedback&&<div key={trainingFeedback.id} className={styles.trainingConfirmed} data-baseball-training-confirmed data-growth-changed={trainingFeedback.changed} role='status' aria-live='polite' aria-atomic='true'>
            <strong>{preparationText.confirmed}</strong><p>{annualCareer?highlightText.applied:preparationText.actual}</p>
            <dl className={styles.trainingChanges}>{trainingFeedback.rows.map(row=><div key={row.key} data-changed={row.delta!==0}><dt>{f[row.key]||text[row.key]}</dt><dd>{row.before} → {row.after} <span>({signed(row.delta)})</span>{row.delta===0&&<small>{preparationText.unchanged}</small>}</dd></div>)}</dl>
            {!trainingFeedback.changed&&<p>{preparationText.noChange}</p>}
          </div>}
        </section>}
        {finalSeasonReady&&<BaseballCareerFinalReview key={archive?.latest?.seasonId||career.id} locale={locale} profile={archive?.latest?.profile||career.profile}
          rows={seasonRow?[...seasonHistory,seasonRow]:seasonHistory} saved={Boolean(annualReceipt||archive)} finish={finalFinish}
          pendingFinish={selectedEntry?.finish} saving={settleState==='saving'} failed={settleState==='retry'} disabled={busy}
          onSettle={settleSeason} onRecords={()=>goManage('records')}/>}
        {regular&&!current&&!finalSeasonReady&&<section className={styles.panel}>
          <h2>{text.season}</h2>
          <Statistics value={archivedStats?.stats||career.stats} rates={archivedStats?.rates||career.rates} text={text}/>
          {annualCareer&&<p>{annualReceipt?annual.settled:annual.unsettled}</p>}
          {annualCareer&&!annualReceipt&&<button type='button' className={styles.primary} disabled={busy} onClick={()=>void settleSeason()}>{settleState==='saving'?annual.settling:annual.settle}</button>}
          {settleState==='retry'&&<p role='alert'>{annual.pending}</p>}
          {canStartNext&&<><p>{multi.nextHint}</p>{canReviewWinter
            ?<button ref={winterButtonRef} type='button' className={styles.primary} disabled={busy} onClick={()=>void openWinterReview()}>{multi.prepareNext} →</button>
            :<button type='button' className={styles.primary} disabled={busy} onClick={()=>void startNextSeason()}>{multi.next(latestYear+1)} →</button>}</>}
          <button type='button' onClick={()=>goManage('records')}>{annualCareer||archive?multi.book:f.more}</button>
        </section>}
        {previousGame&&current&&<section className={styles.panel}>
          <h2>{season.previousGame}</h2>
          <p>{season.game(previousGame.ordinal)} · {getBaseballTeam(previousGame.opponentId).name}</p>
          <CareerAppearances game={previousGame} text={text} locale={locale}/>
        </section>}
        <div className={styles.summaryGrid}><section className={styles.panel}><h2>{text.growth}</h2><div className={styles.growth}>{(modern?['mit','power','discipline','stamina']:['power','discipline','stamina']).map(key=><div key={key}><small>{f[key]}</small><strong>{visibleGrowth[key]}</strong></div>)}</div><p>{f.trainingNote}</p><button type='button' onClick={()=>goManage('player')}>{annualCareer&&!annualReceipt?annual.backup:locale==='en'?'Manage recovery code':'복구 코드 관리'}</button>{localDevelopment&&<p><Link href='/playground/baseball/growth' prefetch={false}>{locale==='en'?'Compare growth candidates':'성장 후보 비교하기'} →</Link></p>}</section><section className={styles.panel}><h2>{text.feedback}</h2><ul className={styles.notes}>{career.feedback.map(key=><li key={key}>{key==='regular-season-complete'?annualCareer||archive?multi.finished(latestYear):season.finishedNote:text.feedbackKeys[key]||key}</li>)}</ul></section></div>
      </>:view.tab==='schedule'?archiveCollision?<section className={styles.panel}>
        <p>{locale==='en'?'The confirmed archive includes season statistics.':'확정 기록에서 시즌별 성적을 확인할 수 있습니다.'}</p>
        <button type='button' onClick={()=>goManage('records')}>{multi.book}</button>
      </section>:<CareerSchedule key={career.id} career={career} text={text} season={season} locale={locale} highlights={annualCareer?highlightText:null}/>:view.tab==='records'?<>
        {(annualCareer||archive)&&<SeasonRecordBook history={seasonHistory} current={seasonRow} labels={multi} text={text} winterPlan={winterRecord} locale={locale} entries={store.entries}/>}
        {!archive&&<CareerRecords key={career.id} career={career} text={text} season={season} locale={locale} showSeason={!annualCareer}/>}
      </>:<section className={styles.panel}>
        <h2>{visibleProfile.name} · #{visibleProfile.jerseyNumber}</h2>
        <p>{team.name} · {visibleProfile.handedness==='left'?text.left:text.right}</p>
        <p>{visibleSettings.baseSpeedKmh} km/h · {pitchModeLabel}</p>
        <p>{f.profileNote}</p><p>{annualCareer?annual.guide:text.localNote}</p>
        <button type='button' disabled={busy} onClick={chooseAnother}>{f.choosePlayer}</button>
        {localDraft?<><button type='button' disabled={busy} onClick={()=>void exportSeason()}>{annual.export}</button>{filePicker}</>:<button type='button' disabled={busy} onClick={()=>void refresh()}>{text.refresh}</button>}
        {(!annualCareer||annualReceipt||year>1)&&<BaseballCareerRecovery key={`${selectedEntry?.careerId||career.id}:${career.schemaVersion}`} careerId={selectedEntry?.careerId||career.id} version={career.schemaVersion} locale={locale} onRecovered={recoverCareer} disabled={busy}/>}
      </section>}
    </div>
    {embedded&&<div className={styles.focusStage} hidden={view.view!=='batting'}><BaseballAtBatGame key={career.id} locale={locale} dataVersions={dataVersions} storageVersions={selectedStorageVersions} embeddedCareer={embedded}/></div>}
    {career&&!winterOpen&&!(quickAdvance&&view.view==='manage'&&view.tab==='home')&&<footer className={styles.focusActions}>
      {view.view==='batting'?<>
        <span className={styles.hint} role={appearanceError||store.code?'alert':undefined}>{store.code?errorText:appearanceError?f.appearanceError:completed?f.resultReady:format}</span>
        <CareerButton kind='return-career' onAction={()=>goManage('home')}>{f.return} ↗</CareerButton>
        {nextSlot&&<CareerButton data-career-next-appearance kind={`next-manual:${completed.id}`} className={styles.primary} disabled={blocked} onAction={()=>void enterManual({next:true})}>{f.nextAppearance} · {nextSlot}/{appearanceLimit} →</CareerButton>}
      </>:view.tab==='home'&&highlight?<>
        {!resumeId&&<CareerButton kind='simulate-highlight' disabled={blocked} onAction={()=>void advanceSchedule('current')}>{highlightText.auto}</CareerButton>}
        {current.preparation?<CareerButton kind={resumeId?'resume-manual':'enter-manual'} data-career-enter-appearance className={styles.primary} disabled={blocked} onAction={()=>void enterManual()}>{resumeId?f.resume:highlightText.manual} →</CareerButton>
          :<CareerButton kind={`prepare:${trainingChoice||'none'}`} className={styles.primary} disabled={blocked||!trainingChoice} onAction={()=>void command({type:'prepare',choice:trainingChoice})}>{f.confirm} →</CareerButton>}
      </>:view.tab==='home'&&current?current.preparation?<>
        {!resumeId&&<CareerButton kind={regular?'simulate-game':'simulate-appearance'} disabled={blocked} onAction={()=>void command({type:regular?'simulate-game':'simulate-at-bat'})}>{regular?season.autoGame:text.automatic}</CareerButton>}
        <CareerButton kind={resumeId?'resume-manual':'enter-manual'} data-career-enter-appearance className={styles.primary} disabled={blocked} onAction={()=>void enterManual()}>{resumeId?f.resume:f.enter} →</CareerButton>
      </>:<CareerButton kind={`prepare:${trainingChoice||'none'}`} className={styles.primary} disabled={blocked||!trainingChoice} onAction={()=>void command({type:'prepare',choice:trainingChoice})}>{f.confirm} →</CareerButton>
      :view.tab!=='home'&&<CareerButton kind='return-home' onAction={()=>goManage('home')}>{f.home}</CareerButton>}
    </footer>}
  </section>
}
