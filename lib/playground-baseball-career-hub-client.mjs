// Route the same career UI to independent local and server journals.
import { BASEBALL_REGULAR_SEASON_ID } from './playground-baseball-career-schedule.mjs'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const empty=()=>({entries:[],history:[],busy:false,code:null})
const failure=code=>Object.assign(new Error('The career client could not complete this action.'),{code})

export async function openBaseballCareerHubClient({onChange=()=>{},openLegacy,openCurrent,annualVersions,priorAnnualVersions,openAnnual}={}){
  const annualEnabled=Boolean(annualVersions||openAnnual)
  const modules=await Promise.all([
    openLegacy?null:import('./playground-baseball-career-client.mjs'),
    openCurrent?null:import('./playground-baseball-career-v2-client.mjs'),
    !annualEnabled||openAnnual?null:import('./playground-baseball-annual-client.mjs'),
  ])
  const factories={1:openLegacy||modules[0].openBaseballCareerClient,2:openCurrent||modules[1].openBaseballCareerClient}
  if(annualEnabled)factories.annual=openAnnual||modules[2].openBaseballAnnualClient
  const versions=annualEnabled?[1,2,'annual']:[1,2],first=annualEnabled?'annual':2
  const clients={},states=Object.fromEntries(versions.map(version=>[version,empty()])),routes=new Map()
  let active=first,closed=false,collision=false
  function snapshot(){
    routes.clear();collision=false
    const entries=[],history=[]
    for(const version of versions){
      for(const [key,target]of [['entries',entries],['history',history]])for(const row of states[version][key]){
        const existing=routes.get(row.id)
        if(existing!==undefined&&existing!==version&&!(version==='annual'&&existing===2))collision=true
        routes.set(row.id,version);target.push({...row,rulesVersion:version==='annual'?2:version})
      }
    }
    const visibleEntries=annualEnabled?entries.filter(row=>routes.get(row.id)!=='annual'||row.annual):entries
    return {entries:collision?[]:visibleEntries,history:collision?[]:history,busy:versions.some(version=>states[version].busy),
      code:collision?'local_conflict':states[active].code,versionErrors:{1:states[1].code,2:states[2].code},activeVersion:active,
      confirmedHistories:states.annual?.confirmedHistories||{}}
  }
  function publish(){if(!closed)onChange(snapshot())}
  function select(version){if(!versions.includes(version))throw failure('invalid_command');active=version;publish();if(!clients[version])throw failure(states[version].code||'storage_unavailable');return clients[version]}
  function forId(id){snapshot();if(collision)throw failure('local_conflict');if(!UUID.test(id)||!routes.has(id))throw failure('not_found');return select(routes.get(id))}
  const hub={
    snapshot,
    selectNew:()=>select(first),
    refresh:async()=>{
      for(const version of [1,2])if(clients[version])try{await clients[version].refresh()}catch{/* The version's own client retains its error and pending journal. */}
      const value=snapshot();publish();if(value.code)throw failure(value.code);return value
    },
    create:(...args)=>select(first).create(...args),
    read:id=>forId(id).read(id),retry:id=>forId(id).retry(id),
    command:(id,command)=>forId(id).command(id,command),
    advance:(id,scope)=>{
      const client=forId(id)
      if(!client.advance)throw failure('invalid_command')
      return client.advance(id,scope)
    },
    adoptLatest:id=>forId(id).adoptLatest(id),
    atBatAdapter:(id,...args)=>forId(id).atBatAdapter(id,...args),
    settle:(id,finish)=>select('annual').settle(id,finish),
    loadAnnualHistory:id=>select('annual').loadHistory(id),
    readWinterDraft:id=>select('annual').readWinterDraft(id),
    saveWinterDraft:(id,plan)=>select('annual').saveWinterDraft(id,plan),
    startNextSeason:(id,plan)=>select('annual').startNextSeason(id,plan),
    exportSave:id=>select('annual').exportSave(id),
    async importSave(file){
      const client=select('annual')
      const career=await client.importSave(file)
      return (await client.read(career.id)).career
    },
    async readRecovered(id,version){
      if(!UUID.test(id)||![1,2].includes(version))throw failure('invalid_command')
      const result=await select(version).read(id)
      if(annualEnabled&&version===2&&result.career.scheduleId===BASEBALL_REGULAR_SEASON_ID&&result.career.status==='complete'){
        await select('annual').loadHistory(id)
      }
      return result
    },
    close:()=>{closed=true;for(const client of Object.values(clients))client.close()},
  }
  // An annual season can open and resume without contacting a career endpoint.
  // Legacy clients bootstrap their shared cookie when their lists are requested.
  for(const version of versions)try{
    const client=await factories[version]({versions:annualVersions,priorAnnualVersions,onChange:value=>{states[version]=value;publish()}})
    if(closed){client.close();break}clients[version]=client
    if(!annualEnabled)try{await client.refresh()}catch{/* Keep the recoverable journal available. */}
  }catch(cause){states[version]={...states[version],busy:false,code:cause.code||'storage_unavailable'};publish()}
  return hub
}
