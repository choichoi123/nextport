export const BASEBALL_ENTRANCE=Object.freeze({id:'baseball-entrance-v1',durationMs:2000,maximumAudioDelayMs:500})
const finite=value=>typeof value==='number'&&Number.isFinite(value)
function playerValue(value){
  const checked=validateBaseballPlayer(value)
  return checked.valid?Object.freeze({...checked.player}):null
}

/** One explicit successful entry, without identities from the database or game RNG. */
export function createBaseballEntranceController({idPrefix='entrance',prepareAudio=()=>false,playAudio=()=>false,stopAudio=()=>{},onIntro=()=>{},
  isAllowed=()=>true,now=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
  let sequence=0,current=null,closed=false
  function clear(ticket){if(ticket?.expiry!==undefined)clearTimer(ticket.expiry);if(ticket?.deadline!==undefined)clearTimer(ticket.deadline)}
  function cancel(){
    const ticket=current;current=null;clear(ticket)
    if(ticket?.entered)onIntro(null)
    try{stopAudio()}catch{/* Optional sound cleanup must not block entry. */}
  }
  function silence(){
    if(current)current.consumed=true
    try{stopAudio()}catch{/* Muting the sound keeps the visual introduction. */}
  }
  function tryPlay(ticket){
    if(closed||current!==ticket||!ticket.entered||ticket.consumed)return
    const at=now(),age=at-ticket.startAt
    if(!finite(at)||age<0||age>BASEBALL_ENTRANCE.maximumAudioDelayMs||!isAllowed()||ticket.ready===false){ticket.consumed=true;return}
    if(ticket.ready!==true)return
    ticket.consumed=true
    try{playAudio(Object.freeze({id:ticket.token.id,type:'entrance',origin:ticket.token.origin,confirmed:true,atMs:ticket.startAt}))}catch{/* Optional sound never blocks entry. */}
  }
  function prepare({origin='live'}={}){
    if(closed||!['live','preview'].includes(origin))return null
    cancel()
    const ticket={token:Object.freeze({id:`${idPrefix}:${++sequence}`,origin}),entered:false,consumed:false,ready:null}
    current=ticket
    // Invoke before Promise wrapping: AudioContext.resume must retain this gesture.
    let pending
    try{pending=prepareAudio()}catch{pending=false}
    Promise.resolve(pending).then(ready=>{ticket.ready=ready===true;tryPlay(ticket)},()=>{ticket.ready=false;tryPlay(ticket)})
    return ticket.token
  }
  function enter(token,player){
    const ticket=current
    if(closed||!ticket||ticket.token!==token||ticket.entered)return false
    const value=playerValue(player),at=now()
    if(!value||!finite(at)){cancel();return false}
    ticket.entered=true;ticket.startAt=at
    onIntro(Object.freeze({id:token.id,origin:token.origin,player:value,startAt:at,durationMs:BASEBALL_ENTRANCE.durationMs}))
    ticket.deadline=setTimer(()=>{if(current===ticket)ticket.consumed=true},BASEBALL_ENTRANCE.maximumAudioDelayMs)
    ticket.expiry=setTimer(()=>{if(current!==ticket)return;clear(ticket);current=null;ticket.consumed=true;onIntro(null)},BASEBALL_ENTRANCE.durationMs)
    tryPlay(ticket)
    return true
  }
  function dispose(){if(closed)return;cancel();closed=true}
  return Object.freeze({prepare,enter,cancel,silence,dispose})
}
import {validateBaseballPlayer} from './playground-baseball-teams.mjs'
