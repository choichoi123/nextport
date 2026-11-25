import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'

const ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE=/^BCR1[0-9A-HJKMNP-TV-Z]{32}$/
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const fail=()=>new Error('Career recovery unavailable')
const context=(careerId,version)=>{
  if(!UUID.test(careerId)||![1,2].includes(version))throw fail()
  return Buffer.from(`baseball-career-recovery:v1:${version}:${careerId}`)
}
function secretKey(secret){
  if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw fail()
  return Buffer.from(hkdfSync('sha256',secret,'nextport-baseball-career-recovery','encrypted-code:v1',32))
}

/** 160 random bits. Formatting adds no user or player information. */
export function createBaseballCareerRecoveryCode({bytes=randomBytes(20)}={}){
  if(!Buffer.isBuffer(bytes)||bytes.length!==20)throw fail()
  let bits=0,value=0,encoded=''
  for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){encoded+=ALPHABET[(value>>>(bits-5))&31];bits-=5}}
  return `BCR1-${encoded.match(/.{4}/g).join('-')}`
}
export function normalizeBaseballCareerRecoveryCode(value){
  if(typeof value!=='string'||value.length>128)return null
  const normalized=value.toUpperCase().replace(/[\s-]/g,'')
  return CODE.test(normalized)?normalized:null
}
export function hashBaseballCareerRecoveryCode(value,secret){
  const code=normalizeBaseballCareerRecoveryCode(value)
  if(!code||typeof secret!=='string'||Buffer.byteLength(secret)<32)throw fail()
  return createHmac('sha256',secret).update(`baseball-career-recovery-lookup:v1:${code}`).digest('hex')
}
export function encryptBaseballCareerRecoveryCode(value,secret,{careerId,version,iv=randomBytes(12)}={}){
  const normalized=normalizeBaseballCareerRecoveryCode(value)
  if(!normalized||!Buffer.isBuffer(iv)||iv.length!==12)throw fail()
  const cipher=createCipheriv('aes-256-gcm',secretKey(secret),iv)
  cipher.setAAD(context(careerId,version))
  const ciphertext=Buffer.concat([cipher.update(normalized,'utf8'),cipher.final()])
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.')
}
export function decryptBaseballCareerRecoveryCode(value,secret,{careerId,version}={}){
  if(typeof value!=='string'||value.length>512)throw fail()
  const parts=value.split('.')
  if(parts.length!==4||parts[0]!=='v1'||parts.slice(1).some(part=>!/^[-_A-Za-z0-9]+$/.test(part)))throw fail()
  const iv=Buffer.from(parts[1],'base64url'),tag=Buffer.from(parts[2],'base64url'),encrypted=Buffer.from(parts[3],'base64url')
  if(iv.length!==12||tag.length!==16||encrypted.length!==36)throw fail()
  const decipher=createDecipheriv('aes-256-gcm',secretKey(secret),iv)
  decipher.setAAD(context(careerId,version));decipher.setAuthTag(tag)
  let normalized
  try{normalized=Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8')}catch{throw fail()}
  if(!CODE.test(normalized))throw fail()
  return `BCR1-${normalized.slice(4).match(/.{4}/g).join('-')}`
}
