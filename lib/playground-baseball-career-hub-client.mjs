// Presentation-level routing only. The two rule versions keep independent
// clients, journals, retries and validators. Recovery codes never enter here.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const empty=()=>({entries:[],history:[],busy:false,code:null})
const failure=code=>Object.assign(new Error('The career client could not complete this action.'),{code})

export async function openBaseballCareerHubClient({onChange=()=>{},openLegacy,openCurrent}={}){
  const modules=await Promise.all([
    openLegacy?null:import('./playground-baseball-career-client.mjs'),
    openCurrent?null:import('./playground-baseball-career-v2-client.mjs'),
  ])
  const factories={1:openLegacy||modules[0].openBaseballCareerClient,2:openCurrent||modules[1].openBaseballCareerClient}
  const clients={},states={1:empty(),2:empty()},routes=new Map()
  let active=2,closed=false,collision=false
  function snapshot(){
    routes.clear();collision=false
    const entries=[],history=[]
    for(const version of [1,2]){
      for(const [key,target]of [['entries',entries],['history',history]])for(const row of states[version][key]){
        if(routes.has(row.id)&&routes.get(row.id)!==version)collision=true
        routes.set(row.id,version);target.push({...row,rulesVersion:version})
      }
    }
    return {entries:collision?[]:entries,history:collision?[]:history,busy:states[1].busy||states[2].busy,
      code:collision?'local_conflict':states[active].code,versionErrors:{1:states[1].code,2:states[2].code},activeVersion:active}
  }
  function publish(){if(!closed)onChange(snapshot())}
  function select(version){if(![1,2].includes(version))throw failure('invalid_command');active=version;publish();if(!clients[version])throw failure(states[version].code||'storage_unavailable');return clients[version]}
  function forId(id){snapshot();if(collision)throw failure('local_conflict');if(!UUID.test(id)||!routes.has(id))throw failure('not_found');return select(routes.get(id))}
  const hub={
    snapshot,
    selectNew:()=>select(2),
    refresh:async()=>{
      for(const version of [1,2])if(clients[version])try{await clients[version].refresh()}catch{/* The version's own client retains its error and pending journal. */}
      const value=snapshot();publish();if(value.code)throw failure(value.code);return value
    },
    create:(...args)=>select(2).create(...args),
    read:id=>forId(id).read(id),retry:id=>forId(id).retry(id),
    command:(id,command)=>forId(id).command(id,command),
    adoptLatest:id=>forId(id).adoptLatest(id),
    atBatAdapter:(id,...args)=>forId(id).atBatAdapter(id,...args),
    readRecovered:async(id,version)=>{if(!UUID.test(id)||![1,2].includes(version))throw failure('invalid_command');return select(version).read(id)},
    close:()=>{closed=true;for(const client of Object.values(clients))client.close()},
  }
  // Bootstrap sequentially so a fresh browser establishes one anonymous cookie
  // before the other rule version asks for its own list.
  for(const version of [1,2])try{
    const client=await factories[version]({onChange:value=>{states[version]=value;publish()}})
    if(closed){client.close();break}clients[version]=client
    try{await client.refresh()}catch{/* Keep the recoverable journal available. */}
  }catch(cause){states[version]={...states[version],busy:false,code:cause.code||'storage_unavailable'};publish()}
  return hub
}
