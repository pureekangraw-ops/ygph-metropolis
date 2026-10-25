import {validateTransfer,MAX_ENVELOPE,idValid} from './transfer-contract.mjs';
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const key=id=>'goview/typed-transfers/'+id+'.json';
const receiptKey=id=>'goview/typed-receipts/'+id+'.json';
const sameRecord=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
const same=(a,b)=>a.schema===b.schema&&a.transferId===b.transferId&&a.operation===b.operation&&a.payloadType===b.payloadType&&a.sha256===b.sha256&&a.payload===b.payload&&sameRecord(a.identity,b.identity);
const validReceipt=(r,id,sha)=>r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).sort().join(',')==='operation,readbackVerified,revision,sha256,status,transferId'&&r.transferId===id&&r.sha256===sha&&r.operation==='UPDATE'&&['SAVED','DUPLICATE','COMMITTED_READBACK_UNAVAILABLE'].includes(r.status)&&Number.isSafeInteger(r.revision)&&r.revision>=0&&typeof r.readbackVerified==='boolean'&&r.readbackVerified===(r.status!=='COMMITTED_READBACK_UNAVAILABLE');
async function read(bucket,id){const item=await bucket.get(key(id));if(!item)return null;if(item.size>MAX_ENVELOPE)throw Error('oversize');return validateTransfer(JSON.parse(await item.text()));}
async function bounded(req){
 const reader=req.body?.getReader();if(!reader)throw Error('empty');const chunks=[];let size=0;
 for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_ENVELOPE){await reader.cancel();throw Error('oversize');}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function role(req,env){
 const value=req.headers.get('authorization');
 if(!value?.startsWith('Bearer '))return null;
 const token=value.slice(7);if(token.length>512)return null;
 // Constant-work byte comparison; role configuration must be distinct.
 const equal=(a,b)=>{let d=a.length^b.length;for(let n=0;n<Math.max(a.length,b.length);n++)d|=(a.charCodeAt(n)||0)^(b.charCodeAt(n)||0);return d===0;};
 return [['go',env.GO_WRITE_TOKEN],['read',env.ANDROID_READ_TOKEN],['upload',env.ANDROID_UPLOAD_TOKEN]].find(([,v])=>equal(token,v))?.[0]??null;
}
export async function typedTransferRouter(req,env,studioRequest){
 const secrets=[env?.GO_WRITE_TOKEN,env?.ANDROID_READ_TOKEN,env?.ANDROID_UPLOAD_TOKEN];
 if(!env?.PACKAGES||secrets.some(x=>typeof x!=='string'||x.length<20||x.length>512)||new Set(secrets).size!==3)return json(503,{error:'TRANSFER_NOT_CONFIGURED'});
 const url=new URL(req.url);if(url.protocol!=='https:')return json(400,{error:'HTTPS_REQUIRED'});
 const who=role(req,env);if(!who)return json(401,{error:'UNAUTHORIZED'});
 const parts=url.pathname.split('/').filter(Boolean),id=parts[2];
 if(parts[0]!=='v1'||parts[1]!=='transfers'||!idValid(id)||parts.length>4)return json(404,{error:'NOT_FOUND'});
 try{
  if(parts.length===4){
   if(parts[3]!=='receipt')return json(404,{error:'NOT_FOUND'});
   if(req.method==='GET'){
    if(who!=='go'&&who!=='read')return json(403,{error:'ROLE_REQUIRED'});
    const saved=await env.PACKAGES.get(receiptKey(id));if(!saved)return json(404,{error:'RECEIPT_NOT_FOUND'});
    const transfer=await read(env.PACKAGES,id),r=JSON.parse(await saved.text());
    if(!transfer||!validReceipt(r,id,transfer.sha256))return json(503,{error:'RECEIPT_CORRUPTION'});
    return json(200,r);
   }
   if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
   if(who!=='read')return json(403,{error:'DEVICE_READ_ROLE_REQUIRED'});
   const transfer=await read(env.PACKAGES,id);if(!transfer||transfer.operation==='SNAPSHOT')return json(404,{error:'PROPOSAL_NOT_FOUND'});
   const r=await bounded(req);
   if(!validReceipt(r,id,transfer.sha256))return json(422,{error:'INVALID_DEVICE_RECEIPT'});
   const old=await env.PACKAGES.get(receiptKey(id));
   if(old){const prior=JSON.parse(await old.text());return sameRecord(prior,r)?json(200,prior):json(409,{error:'RECEIPT_CONFLICT'});}
   await env.PACKAGES.put(receiptKey(id),JSON.stringify(r),{onlyIf:{etagDoesNotMatch:'*'}});
   const saved=await env.PACKAGES.get(receiptKey(id));if(!saved)return json(503,{error:'RECEIPT_UNCERTAIN'});
   return sameRecord(JSON.parse(await saved.text()),r)?json(201,r):json(409,{error:'RECEIPT_CONFLICT'});
  }
  if(req.method==='GET'){
   const e=await read(env.PACKAGES,id);if(!e)return json(404,{error:'TRANSFER_NOT_FOUND'});
   if((e.operation==='SNAPSHOT'&&who==='read')||(e.operation!=='SNAPSHOT'&&who==='upload'))return json(403,{error:'ROLE_REQUIRED'});
   return json(200,e);
  }
  if(req.method!=='PUT')return json(405,{error:'METHOD_NOT_ALLOWED'});
  if(who==='read')return json(403,{error:'UPLOAD_ROLE_REQUIRED'});
  let e;try{e=validateTransfer(await bounded(req));}catch{return json(422,{error:'INVALID_TRANSFER'});}
  if(e.transferId!==id)return json(422,{error:'IDENTITY_MISMATCH'});
  if((e.operation==='SNAPSHOT')!==(who==='upload'))return json(403,{error:'ROLE_REQUIRED'});
  if(e.operation==='PROPOSAL'){
   const source=await read(env.PACKAGES,e.identity.captureId);
   if(!source||source.operation!=='SNAPSHOT'||source.sha256!==e.identity.snapshotSha256||source.identity.baseVersion!==e.identity.baseVersion)return json(409,{error:'SNAPSHOT_BASE_MISMATCH'});
  }
  const prior=await read(env.PACKAGES,id);if(prior)return same(prior,e)?json(200,prior):json(409,{error:'TRANSFER_CONFLICT'});
  if(e.operation==='STUDIO'){
   if(!studioRequest)return json(503,{error:'STUDIO_ADAPTER_NOT_CONFIGURED'});
   const result=await studioRequest(new Request(`https://goview.internal/v1/maps/${e.identity.mapId}/packages/${e.identity.version}`,{method:'PUT',headers:{authorization:'Bearer '+env.GO_WRITE_TOKEN,'content-type':'application/json','x-goview-transfer-id':e.transferId},body:e.payload}));
   if(!result.ok)return result;
   if((await result.json()).sha256!==e.sha256)return json(503,{error:'STUDIO_READBACK_UNCERTAIN'});
  }
  await env.PACKAGES.put(key(id),JSON.stringify(e),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
  const saved=await read(env.PACKAGES,id);if(!saved)return json(503,{error:'TRANSFER_UNCERTAIN'});
  return same(saved,e)?json(201,saved):json(409,{error:'TRANSFER_CONFLICT'});
 }catch{return json(503,{error:'TRANSFER_STORAGE_UNCERTAIN'});}
}
