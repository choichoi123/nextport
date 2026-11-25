import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {inflateSync} from 'node:zlib'
import {getBaseballPostplayFrames,getBaseballPostplayUniformRegions,getBaseballPostplayUndersleeveRegions} from '../lib/playground-baseball-postplay-art.mjs'
import {compileBaseballUniformMask,compileBaseballUndersleeveMask,paintBaseballUniform,paintBaseballUndersleeves} from '../lib/playground-baseball-uniform.mjs'
import {BASEBALL_TEAMS} from '../lib/playground-baseball-teams.mjs'
import {getBaseballBatterFrames} from '../lib/playground-baseball-animation.mjs'

const uniqueFrames=[getBaseballPostplayFrames().lower,getBaseballPostplayFrames('left').lower,...['run1','run2','run3'].map(key=>getBaseballPostplayFrames()[key])]
const root=new URL('../public/',import.meta.url),decoded=new Map()
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c}
async function rgba(frame){
  if(decoded.has(frame.src))return decoded.get(frame.src)
  const source=await readFile(new URL(`.${frame.originalSrc}`,root)),width=source.readUInt32BE(16),height=source.readUInt32BE(20)
  assert.equal(source.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(source[24],8);assert.equal(source[25],6);assert.equal(source[28],0)
  const blocks=[]
  for(let at=8;at+12<=source.length;){const size=source.readUInt32BE(at),type=source.toString('ascii',at+4,at+8);assert.ok(at+12+size<=source.length);if(type==='IDAT')blocks.push(source.subarray(at+8,at+8+size));at+=12+size}
  const raw=inflateSync(Buffer.concat(blocks)),stride=width*4,data=new Uint8ClampedArray(width*height*4)
  assert.equal(raw.length,(stride+1)*height)
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)];assert.ok(filter<=4)
    for(let x=0;x<stride;x++){
      const index=y*stride+x,a=x>=4?data[index-4]:0,b=y?data[index-stride]:0,c=y&&x>=4?data[index-stride-4]:0
      const prediction=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)
      data[index]=(raw[y*(stride+1)+1+x]+prediction)&255
    }
  }
  const result={width,height,data};decoded.set(frame.src,result);return result
}

test('optional postplay frames preserve the original sixteen poses and share first-base running after either turn',()=>{
  const before=JSON.stringify([getBaseballBatterFrames('right'),getBaseballBatterFrames('left')]),right=getBaseballPostplayFrames(),left=getBaseballPostplayFrames('left')
  assert.deepEqual(Object.keys(right),['lower','run1','run2','run3']);assert.notEqual(right.lower.src,left.lower.src)
  for(const key of ['run1','run2','run3'])assert.equal(right[key],left[key])
  assert.equal(uniqueFrames.length,5);assert.equal(new Set(uniqueFrames.map(frame=>frame.src)).size,5)
  for(const frame of uniqueFrames){
    assert.equal(frame.postplay,true);assert.equal(frame.width,1024);assert.equal(frame.height,1536);assert.match(frame.src,/\/postplay\/20261125\/[^/]+\.webp$/)
    assert.match(frame.originalSrc,/\.png$/);assert.equal(Object.isFrozen(frame),true);assert.equal(Object.keys(frame.feet).length,2)
    assert.ok(Object.values(frame.feet).some(foot=>foot.contact.length>0));assert.ok(frame.registrationAnchor.x>=0&&frame.registrationAnchor.x<=1024)
  }
  assert.equal(JSON.stringify([getBaseballBatterFrames('right'),getBaseballBatterFrames('left')]),before)
})

test('five whole-body RGBA sources retain safe empty edges and local WebP deliveries',async()=>{
  for(const frame of uniqueFrames){
    const image=await rgba(frame);assert.equal(image.width,frame.width);assert.equal(image.height,frame.height)
    const alphaAt=(x,y)=>image.data[(y*image.width+x)*4+3]
    // Some generated transparent borders contain alpha1 (1/255), never a
    // visible body edge or opaque halo. Re-encoding preserves those values.
    for(let x=0;x<image.width;x++){assert.ok(alphaAt(x,0)<=1);assert.ok(alphaAt(x,image.height-1)<=1)}
    for(let y=0;y<image.height;y++){assert.ok(alphaAt(0,y)<=1);assert.ok(alphaAt(image.width-1,y)<=1)}
    let visible=0,top=image.height,bottom=0
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(alphaAt(x,y)>=32){visible++;top=Math.min(top,y);bottom=Math.max(bottom,y)}
    assert.ok(visible>250000&&visible<800000);assert.ok(top<160&&bottom>1400)
    const webp=await readFile(new URL(`.${frame.src}`,root));assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.toString('ascii',8,12),'WEBP');assert.ok(webp.length<850000)
  }
})

test('postplay garment annotations reject mismatched source revisions and cover five distinct frames',()=>{
  for(const frame of uniqueFrames){
    const regions=getBaseballPostplayUniformRegions(frame,BASEBALL_TEAMS[0]),mask=compileBaseballUniformMask(regions,{feet:frame.feet})
    assert.equal(mask.length,1024*1536);assert.ok(mask.some(label=>label===1));assert.ok(mask.some(label=>label===2));assert.ok(mask.some(label=>label===4))
    const sleeve=getBaseballPostplayUndersleeveRegions(frame),sleeveMask=compileBaseballUndersleeveMask(sleeve,{feet:frame.feet})
    assert.equal(sleeveMask.length,mask.length);assert.ok(sleeveMask.some(Boolean));assert.equal(sleeve.panels.length,4)
    assert.throws(()=>getBaseballPostplayUniformRegions({...frame,src:frame.originalSrc}),/mismatched/)
    assert.throws(()=>getBaseballPostplayUndersleeveRegions({...frame,width:512}),/mismatched/)
  }
})

test('all ten team materials recolor a real runner without changing alpha, skin, gloves or cleats',async()=>{
  const frame=getBaseballPostplayFrames().run1,source=await rgba(frame)
  for(const team of BASEBALL_TEAMS){
    const regions=getBaseballPostplayUniformRegions(frame,team),mask=compileBaseballUniformMask(regions,{feet:frame.feet}),image={...source,data:new Uint8ClampedArray(source.data)}
    const result=paintBaseballUniform(image,team,regions,{feet:frame.feet})
    assert.ok(result.counts.helmet>1000);assert.ok(result.counts.jersey>20000);assert.ok(result.counts.pants>40000);assert.ok(result.counts.changed>10000)
    for(let pixel=0;pixel<mask.length;pixel++){
      const index=pixel*4;assert.equal(image.data[index+3],source.data[index+3])
      if(!mask[pixel])for(let channel=0;channel<3;channel++)assert.equal(image.data[index+channel],source.data[index+channel])
    }
    // These source pixels are visible exposed skin, a glove and the supporting cleat.
    for(const [x,y]of [[222,466],[853,476],[250,1490]]){
      const at=(y*source.width+x)*4;assert.deepEqual([...image.data.subarray(at,at+4)],[...source.data.subarray(at,at+4)])
    }
  }
})

test('reviewed collar, shoulder and flank cloth is covered on all five new frames',async()=>{
  const points={
    'post-lower-right':[[580,340],[680,410]],
    'post-lower-left':[[540,300],[670,360],[350,670]],
    'post-run1':[[560,275],[710,370]],
    'post-run2':[[760,410]],
    'post-run3':[[650,240],[730,280],[780,330],[680,550],[650,620]],
  }
  const team=BASEBALL_TEAMS.find(value=>value.id==='heroes')
  for(const frame of uniqueFrames){
    const source=await rgba(frame),image={...source,data:new Uint8ClampedArray(source.data)},regions=getBaseballPostplayUniformRegions(frame,team)
    paintBaseballUniform(image,team,regions,{feet:frame.feet})
    for(const [x,y]of points[frame.name]){
      const index=(y*source.width+x)*4,original=source.data.subarray(index,index+4),painted=image.data.subarray(index,index+4)
      assert.ok(original[3]>200&&original[2]>original[0]+12,`${frame.name} reviewed source cloth ${x},${y}`)
      assert.ok(painted[0]>painted[2],`${frame.name} retained blue cloth ${x},${y}`)
      assert.equal(painted[3],original[3])
    }
  }
})

test('the four long-sleeve teams use an explicit separate cloth mask and retain source geometry',async()=>{
  const frame=getBaseballPostplayFrames().run1,source=await rgba(frame),regions=getBaseballPostplayUndersleeveRegions(frame)
  const texture={width:4,height:4,data:new Uint8ClampedArray(Array.from({length:16},(_,i)=>[130+i%3*15,130+i%3*15,130+i%3*15,255]).flat())}
  for(const team of BASEBALL_TEAMS.filter(team=>team.undersleeve)){
    const image={...source,data:new Uint8ClampedArray(source.data)},mask=compileBaseballUndersleeveMask(regions,{feet:frame.feet})
    const result=paintBaseballUndersleeves(image,team,regions,{feet:frame.feet,texture});assert.ok(result.changed>1000)
    for(let pixel=0;pixel<mask.length;pixel++){
      const index=pixel*4;assert.equal(image.data[index+3],source.data[index+3])
      if(!mask[pixel])for(let channel=0;channel<3;channel++)assert.equal(image.data[index+channel],source.data[index+channel])
    }
  }
})

test('running frames expose a bounded blank back-number panel while lowering never paints a front number',()=>{
  const frames=getBaseballPostplayFrames()
  assert.equal(frames.lower.backNumber,null);assert.equal(getBaseballPostplayFrames('left').lower.backNumber,null)
  for(const key of ['run1','run2','run3']){
    const panel=frames[key].backNumber;assert.ok(panel.polygon.length>=4);assert.ok(panel.fontPx>=120);assert.ok(panel.maxWidth<=220)
    for(const [x,y]of panel.polygon){assert.ok(x>300&&x<750);assert.ok(y>200&&y<700)}
    assert.ok(panel.transform.x>350&&panel.transform.x<650);assert.ok(panel.transform.y>300&&panel.transform.y<600)
  }
})

test('stride registration follows the pelvis rather than alternating supporting feet',()=>{
  const frames=getBaseballPostplayFrames(),offsets=['run1','run2','run3'].map(key=>{
    const frame=frames[key];assert.equal(frame.registrationAnchor.y,1490)
    assert.notEqual(frame.footAnchor.x,frame.registrationAnchor.x)
    return frame.backNumber.transform.x-frame.registrationAnchor.x
  })
  assert.ok(Math.max(...offsets)-Math.min(...offsets)<20)
})
