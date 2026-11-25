import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaseballImageLoader, loadBaseballImageBank } from '../lib/playground-baseball-image-loader.mjs'
import { createBaseballClothLoader, BASEBALL_COMPRESSION_TEXTURE } from '../lib/playground-baseball-cloth.mjs'

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return {promise,resolve,reject} }
const flush = async () => { for (let index=0; index<8; index++) await Promise.resolve() }
function harness() {
  const images=[], timers=new Map()
  let next=0
  const load=createBaseballImageLoader({
    createImage:() => {
      const image={naturalWidth:1024,naturalHeight:1536,decodeCalls:0,decode() { this.decodeCalls++; return Promise.resolve() }}
      images.push(image)
      return image
    },
    setTimer:(callback, delay) => { assert.equal(delay,20000); timers.set(++next,callback); return next },
    clearTimer:id => timers.delete(id),
  })
  return {load,images,timers,expire:() => [...timers.values()].forEach(callback=>callback())}
}

test('image loader shares only explicitly cached contracts and clears successful timers', async () => {
  const h=harness(), cache=new Map()
  const pending=h.load('/frame.webp',{cache,width:1024,height:1536})
  assert.equal(h.load('/frame.webp',{cache,width:1024,height:1536}),pending)
  assert.equal(h.images.length,1)
  h.images[0].onload()
  const image=await pending
  assert.equal(image,h.images[0]); assert.equal(image.decodeCalls,1)
  assert.equal(h.timers.size,0); assert.equal(image.onload,null); assert.equal(image.onerror,null)
  assert.equal(await h.load('/frame.webp',{cache,width:1024,height:1536}),image)
})

for (const failure of ['load','decode','dimensions','timeout']) {
  test(`image loader evicts ${failure} failure and retries the actual source`, async () => {
    const h=harness(), first=h.load('/frame.webp',{cache:true,minWidth:512,minHeight:256})
    const failed=assert.rejects(first,{code:failure})
    if(failure==='load')h.images[0].onerror()
    if(failure==='decode'){ h.images[0].decode=()=>Promise.reject(Error('bad decode')); h.images[0].onload() }
    if(failure==='dimensions'){ h.images[0].naturalWidth=0; h.images[0].onload() }
    if(failure==='timeout')h.expire()
    await failed
    const retry=h.load('/frame.webp',{cache:true,minWidth:512,minHeight:256})
    assert.notEqual(first,retry); assert.equal(h.images.length,2)
    h.images[1].onload(); assert.equal(await retry,h.images[1]); assert.equal(h.timers.size,0)
  })
}

test('decode timeout ignores stale completion without evicting a newer cached success', async () => {
  const h=harness(), decoding=deferred(), stale=h.load('/frame.webp',{cache:true})
  h.images[0].decode=()=>decoding.promise
  h.images[0].onload()
  const expired=assert.rejects(stale,{code:'timeout'}); h.expire(); await expired
  const fresh=h.load('/frame.webp',{cache:true}); h.images[1].onload(); await fresh
  decoding.resolve(); await flush()
  assert.equal(h.load('/frame.webp',{cache:true}),fresh)
  assert.equal(h.images.length,2); assert.equal(h.timers.size,0)
})

test('duplicate image load events never decode twice', async () => {
  const h=harness(), decoding=deferred(), pending=h.load('/frame.webp')
  h.images[0].decode=()=>{h.images[0].decodeCalls++; return decoding.promise}
  const handler=h.images[0].onload
  handler(); handler(); decoding.resolve(); await pending
  assert.equal(h.images[0].decodeCalls,1)
})

test('uncached frames and different dimension contracts are independent', async () => {
  const h=harness()
  const pending=[h.load('/frame.webp'),h.load('/frame.webp'),h.load('/frame.webp',{cache:true,width:1024}),h.load('/frame.webp',{cache:true,height:1536})]
  assert.equal(h.images.length,4)
  h.images.forEach(image=>image.onload()); await Promise.all(pending)
})

test('nonfinite and wrong exact dimensions fail after successful decode', async () => {
  for (const dims of [{naturalWidth:NaN,naturalHeight:1536},{naturalWidth:1024,naturalHeight:1535}]) {
    const h=harness(), pending=h.load('/frame.webp',{width:1024,height:1536})
    Object.assign(h.images[0],dims)
    const failed=assert.rejects(pending,{code:'dimensions'}); h.images[0].onload(); await failed
    assert.equal(h.timers.size,0)
  }
})

test('invalid sources and Image construction errors reject without a sticky cache', async () => {
  let attempts=0
  const load=createBaseballImageLoader({createImage:()=>{attempts++; throw Error('constructor')}})
  await assert.rejects(load(''),{code:'source'})
  await assert.rejects(load('/frame.webp',{cache:true}),{code:'load'})
  await assert.rejects(load('/frame.webp',{cache:true}),{code:'load'})
  assert.equal(attempts,2)
})

const descriptors=Object.fromEntries(['ready','load','stride','contact'].map(name=>[name,{name,src:`/${name}.png`,width:1024,height:1536}]))
test('real bank loader limits decoding to two frames and preserves descriptor order', async () => {
  const h=harness(), pending=loadBaseballImageBank(descriptors,{loadImage:h.load,isCurrent:()=>true,sourceFor:d=>d.src.replace('.png','.webp')})
  assert.equal(h.images.length,2)
  h.images[0].onload(); await flush(); assert.equal(h.images.length,2)
  h.images[1].onload(); await flush(); assert.equal(h.images.length,4)
  assert.equal(h.images[2].src,'/stride.webp')
  h.images[2].onload(); h.images[3].onload()
  assert.deepEqual([...(await pending).keys()],Object.keys(descriptors))
})

test('cancelled bank never publishes or starts its remaining frame decodes', async () => {
  const h=harness(); let current=true
  const pending=loadBaseballImageBank(descriptors,{loadImage:h.load,isCurrent:()=>current,sourceFor:d=>d.src})
  const rejected=assert.rejects(pending,/superseded/)
  current=false; h.images[0].onload(); h.images[1].onload(); await rejected
  assert.equal(h.images.length,2)
  const fresh=loadBaseballImageBank({ready:descriptors.ready},{loadImage:h.load,isCurrent:()=>true,sourceFor:d=>d.src})
  h.images[2].onload(); assert.equal((await fresh).size,1)
})

test('bank exact dimensions are validated and a failed bank can be loaded again', async () => {
  const h=harness(), options={loadImage:h.load,isCurrent:()=>true,sourceFor:d=>d.src}
  const pending=loadBaseballImageBank({ready:descriptors.ready},options)
  h.images[0].naturalHeight=1024
  const failed=assert.rejects(pending,{code:'dimensions'}); h.images[0].onload(); await failed
  const retry=loadBaseballImageBank({ready:descriptors.ready},options)
  h.images[1].onload(); assert.equal((await retry).size,1)
})

function clothHarness(failure) {
  const textures=[], canvases=[]; let calls=0
  const load=createBaseballClothLoader({
    imageLoader:async(src,options)=>{
      assert.equal(src,BASEBALL_COMPRESSION_TEXTURE); assert.deepEqual(options,{width:256,height:256}); calls++
      if(failure==='load'&&calls===1)throw Error('cloth image unavailable')
      return {id:calls}
    },
    createCanvas:()=>{
      const canvas={width:0,height:0,getContext:()=>{
        if(failure==='context'&&canvases.length===1)return null
        return {drawImage:()=>{},getImageData:()=>{
          if(failure==='readback'&&canvases.length===1)throw Error('readback failed')
          const texture={data:new Uint8ClampedArray(256*256*4),width:256,height:256}; textures.push(texture); return texture
        }}
      }}
      canvases.push(canvas); return canvas
    },
  })
  return {load,canvases,textures,calls:()=>calls}
}

test('cloth final pixel tile is shared while temporary canvas is released', async () => {
  const h=clothHarness(), first=h.load()
  assert.equal(h.load(),first)
  assert.equal(await first,h.textures[0]); assert.equal(await h.load(),h.textures[0])
  assert.equal(h.calls(),1); assert.deepEqual([h.canvases[0].width,h.canvases[0].height],[1,1])
})

for(const failure of ['load','context','readback']) {
  test(`cloth ${failure} failure releases temporary work and allows retry`,async()=>{
    const h=clothHarness(failure)
    await assert.rejects(h.load())
    for(const canvas of h.canvases)assert.deepEqual([canvas.width,canvas.height],[1,1])
    assert.equal((await h.load()).width,256)
    assert.equal(h.calls(),2)
    for(const canvas of h.canvases)assert.deepEqual([canvas.width,canvas.height],[1,1])
  })
}
