// Presentation only. The server's existing rule/ledger remains authoritative.
const abilities=['mit','power','discipline','stamina']
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:plain(value)?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value)
const number=value=>Number.isSafeInteger(value)&&value>=0
const clamp=(value,max)=>Math.max(0,Math.min(max,value))
const rowsFor=(keys,before,after)=>keys.map(key=>Object.freeze({key,before:before[key],after:after[key],delta:after[key]-before[key]}))

/** A capped estimate, never a save or confirmation. */
export function getBaseballTrainingPreview({growth,rules,choice}={}){
  if(!plain(growth)||!plain(rules)||!(choice==='rest'||abilities.includes(choice))||choice!=='rest'&&!number(growth[choice])
    ||!number(growth.condition)||!number(growth.xp)||!number(rules.abilityMaximum)||!number(rules.conditionMaximum)
    ||growth.condition>rules.conditionMaximum||choice!=='rest'&&growth[choice]>rules.abilityMaximum)return null
  const keys=choice==='rest'?['condition']:[choice,'xp','condition'],after={...growth}
  if(choice==='rest'){
    if(!Number.isSafeInteger(rules.recovery?.condition))return null
    after.condition=clamp(growth.condition+rules.recovery.condition,rules.conditionMaximum)
  }else{
    if(!['ability','xp','condition'].every(key=>Number.isSafeInteger(rules.training?.[key])))return null
    after[choice]=clamp(growth[choice]+rules.training.ability,rules.abilityMaximum)
    after.xp=growth.xp+rules.training.xp
    after.condition=clamp(growth.condition+rules.training.condition,rules.conditionMaximum)
  }
  if(keys.some(key=>!number(after[key])))return null
  return Object.freeze({choice,rows:Object.freeze(rowsFor(keys,growth,after))})
}

/** Only a newly confirmed preparation ledger entry may produce emphasis. */
export function selectBaseballTrainingConfirmation({before,after,choice,seenIds=[],origin}={}){
  if(origin!=='direct-command'||!plain(before)||!plain(after)||!Array.isArray(seenIds)||before.id!==after.id||before.schemaVersion!==after.schemaVersion
    ||![1,2].includes(before.schemaVersion)||!number(before.revision)||after.revision!==before.revision+1
    ||before.currentGameIndex!==after.currentGameIndex||!Number.isInteger(before.currentGameIndex)
    ||!Array.isArray(before.ledger)||!Array.isArray(after.ledger)||after.ledger.length!==before.ledger.length+1
    ||!plain(before.growth)||!plain(after.growth)||!Array.isArray(before.games)||!Array.isArray(after.games))return null
  const index=before.currentGameIndex,prior=before.games[index],next=after.games[index]
  if(!prior||!next||prior.id!==next.id||prior.preparation!==null||next.preparation?.choice!==choice)return null
  if(before.ledger.some((event,i)=>canonical(event)!==canonical(after.ledger[i])))return null
  const event=after.ledger.at(-1),keys=choice==='rest'?['condition']:[choice,'xp','condition']
  if(!plain(event)||event.id!==`${prior.id}:preparation`||event.kind!=='preparation'||event.choice!==choice||event.gameIndex!==index
    ||!plain(event.deltas)||!(choice==='rest'||abilities.includes(choice))||seenIds.includes(event.id))return null
  const growthKeys=Object.keys(before.growth)
  if(canonical([...growthKeys].sort())!==canonical(Object.keys(after.growth).sort())
    ||canonical([...growthKeys].sort())!==canonical(Object.keys(event.deltas).sort())
    ||keys.some(key=>!growthKeys.includes(key)))return null
  for(const key of growthKeys){
    if(!number(before.growth[key])||!number(after.growth[key])||!Number.isSafeInteger(event.deltas[key])
      ||after.growth[key]-before.growth[key]!==event.deltas[key]||!keys.includes(key)&&event.deltas[key]!==0)return null
  }
  const rows=rowsFor(keys,before.growth,after.growth)
  return Object.freeze({id:event.id,careerId:after.id,choice,rows:Object.freeze(rows),changed:rows.some(row=>row.delta!==0)})
}
