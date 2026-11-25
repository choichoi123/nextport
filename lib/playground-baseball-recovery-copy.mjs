// A code is copied only from an explicit UI action. Nothing is persisted and
// clipboard access never reads unrelated content.
export async function copyBaseballRecoveryCode(code,{clipboard=globalThis.navigator?.clipboard,document=globalThis.document}={}){
  if(typeof code!=='string'||!code||code.length>128||/[\r\n\0]/.test(code))return false
  try{if(typeof clipboard?.writeText==='function'){await clipboard.writeText(code);return true}}catch{/* Insecure LAN pages and denied permission use the selection fallback. */}
  if(!document?.body||typeof document.execCommand!=='function')return false
  const previous=document.activeElement,field=document.createElement('textarea')
  field.value=code;field.readOnly=true;field.setAttribute('aria-hidden','true');field.style.cssText='position:fixed;left:-9999px;top:0;font-size:16px'
  try{document.body.appendChild(field);field.select();return document.execCommand('copy')===true}catch{return false}
  finally{field.remove();previous?.focus?.({preventScroll:true})}
}
