import test from 'node:test'
import assert from 'node:assert/strict'
import {BASEBALL_CONTACT_BOOST_DURATION_MS,getBaseballContactBoostPresentation as sample} from '../lib/playground-baseball-contact-boost.mjs'

const contact=Object.freeze({id:'preview:contact:1',type:'contact',outcome:'contact',origin:'preview',atMs:1000})
test('all existing fair-contact qualities and both origins receive a contact accent',()=>{
  for(const outcome of ['contact','perfect'])for(const origin of ['live','preview'])for(const quality of [undefined,0,.95]){
    assert.equal(sample({effect:{...contact,outcome,origin,quality},nowMs:1000})?.durationMs,320)
  }
})
test('fouls, misses, sounds and final results never become a fair-contact accent',()=>{
  for(const patch of [{outcome:'foul'},{outcome:'miss'},{type:'swing'},{type:'result',outcome:'home-run',confirmed:true},{type:'call'}]){
    assert.equal(sample({effect:{...contact,...patch},nowMs:1000}),null)
  }
})
test('the320ms lifetime is measured from contact rather than the latest render',()=>{
  assert.equal(BASEBALL_CONTACT_BOOST_DURATION_MS,320)
  for(const age of [0,219,220,319.5]){
    const value=sample({effect:contact,nowMs:1000+age})
    assert.equal(value.ageMs,age);assert.equal(value.remainingMs,320-age);assert.equal(value.animationDelayMs,-age)
  }
  assert.equal(sample({effect:contact,nowMs:1320}),null)
  assert.equal(sample({effect:contact,nowMs:3000}),null)
})
test('future and nonfinite timestamps do not start or extend an accent',()=>{
  assert.equal(sample({effect:contact,nowMs:999}),null)
  for(const nowMs of [NaN,Infinity,-1,null])assert.equal(sample({effect:contact,nowMs}),null)
  for(const atMs of [NaN,Infinity,-1,null])assert.equal(sample({effect:{...contact,atMs},nowMs:1000}),null)
})
test('subtle, reduced and off retain the ordinary contact ring without the extra burst',()=>{
  for(const strength of ['subtle','reduced','off','unknown',null])assert.equal(sample({effect:contact,nowMs:1100,strength}),null)
})
test('invalid identifiers and unknown event origins are rejected',()=>{
  for(const id of [null,'','  ','bad\nvalue','x'.repeat(1025)])assert.equal(sample({effect:{...contact,id},nowMs:1000}),null)
  assert.equal(sample({effect:{...contact,origin:'restored'},nowMs:1000}),null)
  assert.equal(sample({effect:null,nowMs:1000}),null)
})
test('cloned contact objects retain the same clock and cannot restart an expired effect',()=>{
  const a=sample({effect:contact,nowMs:1240}),b=sample({effect:{...contact},nowMs:1240})
  assert.deepEqual(a,b);assert.equal(a.remainingMs,80);assert.equal(Object.isFrozen(a),true)
  assert.equal(sample({effect:{...contact},nowMs:1321}),null);assert.equal(contact.atMs,1000)
})
