import test from 'node:test'
import assert from 'node:assert/strict'
import {getBaseballHomeRunPresentation} from '../lib/playground-baseball-home-run.mjs'

const event=extra=>({id:'confirmed-home-run:example',type:'result',outcome:'home-run',confirmed:true,atMs:100,...extra})

test('a confirmed home run defaults to the unchanged classic1200ms presentation',()=>{
  const value=getBaseballHomeRunPresentation({effect:event(),nowMs:100})
  assert.equal(value.id,'confirmed-home-run:example');assert.equal(value.variant,'classic');assert.equal(value.strength,'normal')
  assert.equal(value.durationMs,1200);assert.equal(value.remainingMs,1200);assert.equal(value.ageMs,0)
  assert.equal(value.animationDelayMs,-0);assert.equal(value.animated,true);assert.equal(Object.isFrozen(value),true)
})

test('contact, perfect contact, unconfirmed results and ground-rule doubles cannot become home-run effects',()=>{
  for(const extra of [
    {type:'contact',outcome:'perfect'},{outcome:'perfect'},{outcome:'double',reasonKey:'ground-rule-double'},
    {outcome:'single'},{outcome:'flyout'},{outcome:'foul'},{type:'call'},{confirmed:false},{confirmed:1},{confirmed:'true'},
  ])assert.equal(getBaseballHomeRunPresentation({effect:event(extra),nowMs:200}),null)
})

test('missing or malformed identity and display clocks fail closed',()=>{
  for(const id of ['', ' ', '\n', 'bad\u0000id','x'.repeat(1025),null,1])assert.equal(getBaseballHomeRunPresentation({effect:event({id}),nowMs:100}),null)
  for(const atMs of [undefined,null,'100',NaN,Infinity,-Infinity,-1])assert.equal(getBaseballHomeRunPresentation({effect:event({atMs}),nowMs:100}),null)
  for(const nowMs of [undefined,null,'100',NaN,Infinity,-Infinity,-1])assert.equal(getBaseballHomeRunPresentation({effect:event(),nowMs}),null)
  for(const effect of [undefined,null,[],{},true,'home-run'])assert.equal(getBaseballHomeRunPresentation({effect,nowMs:100}),null)
})

test('future and expired results remain absent at exact boundaries',()=>{
  assert.equal(getBaseballHomeRunPresentation({effect:event(),nowMs:99.999}),null)
  const last=getBaseballHomeRunPresentation({effect:event(),nowMs:1299.999})
  assert.ok(last.remainingMs>0&&last.remainingMs<.002);assert.ok(last.ageMs<1200)
  assert.equal(getBaseballHomeRunPresentation({effect:event(),nowMs:1300}),null)
  assert.equal(getBaseballHomeRunPresentation({effect:event(),nowMs:100000}),null)
  assert.ok(getBaseballHomeRunPresentation({effect:event({atMs:0}),nowMs:0}))
})

test('switching classic and arcade styles samples the same original result clock',()=>{
  const effect=event(),classic=getBaseballHomeRunPresentation({effect,nowMs:400}),arcade=getBaseballHomeRunPresentation({effect,nowMs:700,variant:'arcade'})
  assert.equal(classic.ageMs,300);assert.equal(classic.animationDelayMs,-300);assert.equal(classic.remainingMs,900)
  assert.equal(arcade.variant,'arcade');assert.equal(arcade.ageMs,600);assert.equal(arcade.animationDelayMs,-600);assert.equal(arcade.remainingMs,600)
  assert.equal(arcade.id,classic.id);assert.equal(arcade.durationMs,classic.durationMs)
  const copied=getBaseballHomeRunPresentation({effect:{...effect},nowMs:900,variant:'classic'})
  assert.equal(copied.ageMs,800);assert.equal(copied.remainingMs,400)
  assert.equal(getBaseballHomeRunPresentation({effect:{...effect},nowMs:1300,variant:'arcade'}),null)
})

test('subtle and reduced modes keep a stationary result without extending the lifetime',()=>{
  for(const strength of ['subtle','reduced'])for(const variant of ['classic','arcade']){
    const value=getBaseballHomeRunPresentation({effect:event(),nowMs:850,strength,variant})
    assert.equal(value.animated,false);assert.equal(value.strength,strength);assert.equal(value.ageMs,750)
    assert.equal(value.animationDelayMs,-750);assert.equal(value.remainingMs,450);assert.equal(value.durationMs,1200)
  }
})

test('off hides an effect and enabling it later cannot resurrect an expired result',()=>{
  const effect=event()
  assert.equal(getBaseballHomeRunPresentation({effect,nowMs:200,strength:'off'}),null)
  const resumed=getBaseballHomeRunPresentation({effect,nowMs:1000,strength:'normal',variant:'arcade'})
  assert.equal(resumed.ageMs,900);assert.equal(resumed.remainingMs,300);assert.equal(resumed.animationDelayMs,-900)
  assert.equal(getBaseballHomeRunPresentation({effect,nowMs:1400,strength:'normal',variant:'arcade'}),null)
})

test('unknown style falls back to classic and unknown strength falls back to static',()=>{
  for(const variant of ['accelerated','unknown',null,0,{}]){
    const value=getBaseballHomeRunPresentation({effect:event(),nowMs:300,variant})
    assert.equal(value.variant,'classic');assert.equal(value.ageMs,200)
  }
  const protectedValue=getBaseballHomeRunPresentation({effect:event(),nowMs:300,strength:'unknown',variant:'arcade'})
  assert.equal(protectedValue.strength,'subtle');assert.equal(protectedValue.animated,false)
})

test('sampling is immutable and deterministic without changing event facts or unrelated fields',()=>{
  const effect=Object.freeze(event({origin:'preview',mode:'at-bat',channel:'crowd',distanceM:135,exitSpeedKmh:165})),before=JSON.stringify(effect)
  const options={effect,nowMs:620,variant:'arcade',strength:'normal'}
  assert.deepEqual(getBaseballHomeRunPresentation(options),getBaseballHomeRunPresentation(options))
  assert.equal(JSON.stringify(effect),before);assert.equal(options.effect,effect)
  assert.deepEqual(Object.keys(getBaseballHomeRunPresentation(options)),['id','variant','strength','ageMs','durationMs','remainingMs','animationDelayMs','animated'])
})
