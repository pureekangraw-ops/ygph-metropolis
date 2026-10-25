import test from 'node:test';
import assert from 'node:assert/strict';
import Worker from '../worker.mjs';
import Engine from '../../android-browser/app/src/main/assets/goview-studio/engine.js';
import {envelope,proposalId} from '../transfer-contract.mjs';
const capture='synthetic-capture-0001';
const selected=()=>JSON.stringify({type:'FeatureCollection',schemaVersion:1,name:'GOVIEW',goview:{format:'goview.map-update',version:3},features:[{type:'Feature',id:'selected-one',geometry:{type:'Point',coordinates:[10,20]},properties:{name:'Synthetic',goviewRecord:{id:'selected-one',label:'Synthetic',point:{longitude:10,latitude:20},gridId:'',evidence:{coordinate:'UNKNOWN',source:'selected-owner-snapshot',observedAt:null,availableUntil:null},zoneId:null,note:null}}}],captureId:capture,capturedAtEpochMs:1,captureReceipt:{id:'synthetic-receipt-0001',operation:'SNAPSHOT',status:'CAPTURED_LOCAL',correlationId:capture,version:3},selection:'explicit-pins-only'});
const snapshot=()=>envelope('SNAPSHOT',selected(),{captureId:capture,baseVersion:3},capture);
const proposal=s=>envelope('PROPOSAL',JSON.stringify({contractVersion:1,operation:'propose-update',sourceCaptureId:capture,baseVersion:3,package:{type:'FeatureCollection',features:[{type:'Feature',id:'proposed-one',geometry:{type:'Point',coordinates:[11,21]},properties:{name:'New synthetic'}}]}}),{captureId:capture,baseVersion:3,snapshotSha256:s.sha256},proposalId(capture));
function setup(){
 const data=new Map();let writes=0;let failAfterWrite=false;
 const env={GO_WRITE_TOKEN:'G'.repeat(32),ANDROID_READ_TOKEN:'R'.repeat(32),ANDROID_UPLOAD_TOKEN:'U'.repeat(32),PACKAGES:{
  get:async k=>data.has(k)?{size:Buffer.byteLength(data.get(k)),text:async()=>data.get(k),httpEtag:'synthetic'}:null,
  put:async(k,v,o)=>{if(o?.onlyIf?.etagDoesNotMatch==='*'&&data.has(k))return null;data.set(k,String(v));writes++;if(failAfterWrite)throw Error('uncertain');return {};}
 }};
 const call=(id,role='go',method='GET',value)=>Worker.fetch(new Request('https://synthetic.test/v1/transfers/'+id,{method,headers:{authorization:'Bearer '+({go:env.GO_WRITE_TOKEN,read:env.ANDROID_READ_TOKEN,upload:env.ANDROID_UPLOAD_TOKEN}[role]??'wrong'),'content-type':'application/json'},...(value!==undefined?{body:JSON.stringify(value)}:{})}),env);
 return {env,call,data,writes:()=>writes,failAfterWrite:()=>{failAfterWrite=true;}};
}
test('selected Snapshot -> GO read -> bound proposal -> device read -> distinct Update receipt',async()=>{
 const {call}=setup(),s=snapshot(),p=proposal(s);
 assert.equal((await call(s.transferId,'upload','PUT',s)).status,201);
 assert.deepEqual(await (await call(capture,'go')).json(),s);
 assert.equal((await call(p.transferId,'go','PUT',p)).status,201);
 assert.deepEqual(await (await call(p.transferId,'read')).json(),p);
 assert.equal((await call(p.transferId+'/receipt','go')).status,404);
 const r={transferId:p.transferId,sha256:p.sha256,operation:'UPDATE',status:'SAVED',revision:4,readbackVerified:true};
 assert.equal((await call(p.transferId+'/receipt','read','POST',r)).status,201);
 assert.deepEqual(await (await call(p.transferId+'/receipt')).json(),r);
 assert.equal((await call(p.transferId+'/receipt','read','POST',r)).status,200);
});
test('role separation and absent optional upload config leave legacy route working',async()=>{
 const {call,env}=setup(),s=snapshot(),p=proposal(s);
 for(const role of ['go','read'])assert.equal((await call(capture,role,'PUT',s)).status,403);
 assert.equal((await call(capture,'upload','PUT',s)).status,201);
 assert.equal((await call(capture,'read')).status,403);
 assert.equal((await call(p.transferId,'upload','PUT',p)).status,403);
 assert.equal((await call(p.transferId,'go','PUT',p)).status,201);
 assert.equal((await call(p.transferId,'upload')).status,403);
 assert.equal((await call(capture,'bad')).status,401);
 delete env.ANDROID_UPLOAD_TOKEN;
 assert.equal((await call(capture)).status,503);
 assert.equal((await Worker.fetch(new Request('https://synthetic.test/health'),env)).status,200);
 env.ANDROID_UPLOAD_TOKEN=env.GO_WRITE_TOKEN;assert.equal((await call(capture)).status,503);
});
test('reject notes, GPS, wrong digest, wrong base, unbound proposal, unknown fields and overwrite',async()=>{
 const {call,data}=setup(),s=snapshot(),p=proposal(s);
 assert.equal((await call(p.transferId,'go','PUT',p)).status,409);
 for(const mutate of [p=>p.gps={lat:1},p=>p.features[0].properties.goviewRecord.note='private',p=>p.features[0].properties.goviewRecord.evidence.coordinate='VERIFIED']){
  const raw=JSON.parse(s.payload);mutate(raw);const e={...s,payload:JSON.stringify(raw)};e.sha256=Engine.hash(e.payload);
  assert.equal((await call(capture,'upload','PUT',e)).status,422);
 }
 assert.equal(data.size,0);
 assert.equal((await call(capture,'upload','PUT',{...s,sha256:'0'.repeat(64)})).status,422);
 assert.equal((await call(capture,'upload','PUT',{...s,extra:1})).status,422);
 assert.equal((await call(capture,'upload','PUT',s)).status,201);
 assert.equal((await call(capture,'upload','PUT',s)).status,200);
 assert.equal((await call(p.transferId,'go','PUT',{...p,identity:{...p.identity,snapshotSha256:'0'.repeat(64)}})).status,409);
 const other=JSON.parse(s.payload);other.features[0].properties.name='Other';other.features[0].properties.goviewRecord.label='Other';
 assert.equal((await call(capture,'upload','PUT',envelope('SNAPSHOT',JSON.stringify(other),s.identity,capture))).status,409);
 assert.deepEqual(await (await call(capture)).json(),s);
});
test('uncertain committed write is resolved by exact GET without repeating PUT',async()=>{
 const t=setup(),s=snapshot();t.failAfterWrite();
 assert.equal((await t.call(capture,'upload','PUT',s)).status,503);
 assert.deepEqual(await (await t.call(capture,'upload')).json(),s);assert.equal(t.writes(),1);
});
test('Studio adapter preserves bytes, existing immutable version policy and distinct receipt',async()=>{
 const {call}=setup();const map=Engine.demo();const raw=Engine.pack(map)+'\n';
 const e=envelope('STUDIO',raw,{mapId:map.mapId,version:map.version},'synthetic-studio-0001');
 assert.equal((await call(e.transferId,'go','PUT',e)).status,201);
 assert.equal((await (await call(e.transferId,'read')).json()).payload,raw);
 const changed={...map,title:'conflicting'};const conflict=envelope('STUDIO',Engine.pack(changed),e.identity,'synthetic-studio-0002');
 assert.equal((await call(conflict.transferId,'go','PUT',conflict)).status,409);
 assert.equal((await call(e.transferId+'/receipt','go')).status,404);
});
test('device receipt cannot fabricate readback or overwrite existing report',async()=>{
 const {call}=setup(),s=snapshot(),p=proposal(s);await call(capture,'upload','PUT',s);await call(p.transferId,'go','PUT',p);
 const r={transferId:p.transferId,sha256:p.sha256,operation:'UPDATE',status:'SAVED',revision:4,readbackVerified:false};
 assert.equal((await call(p.transferId+'/receipt','read','POST',r)).status,422);
 r.readbackVerified=true;
 assert.equal((await call(p.transferId+'/receipt','go','POST',r)).status,403);
 assert.equal((await call(p.transferId+'/receipt','read','POST',r)).status,201);
 assert.equal((await call(p.transferId+'/receipt','read','POST',{...r,revision:5})).status,409);
});

test('publish readback rejects identity substitution even with unchanged proposal bytes and hash',async()=>{
 const {invokeTransfer}=await import('../go-transfer-adapter.mjs');
 const original=proposal(snapshot());
 const substitute=structuredClone(original);substitute.identity.snapshotSha256='0'.repeat(64);
 const fake={fetch:async req=>new Response(JSON.stringify(req.method==='PUT'?original:substitute),{status:200,headers:{'content-type':'application/json'}})};
 const result=await invokeTransfer({GO_WRITE_TOKEN:'G'.repeat(32)},'goview_transfer_publish',{envelope:original},fake);
 assert.equal(result.ok,false);assert.equal(result.status,'TRANSFER_READBACK_MISMATCH');
});

test('cross-type losing Studio race cannot write canonical map or latest pointer',{timeout:3000},async()=>{
 const t=setup(),s=snapshot(),map=Engine.demo();
 const studio=envelope('STUDIO',Engine.pack(map),{mapId:map.mapId,version:map.version},capture);
 let release,entered;const paused=new Promise(r=>entered=r),resume=new Promise(r=>release=r);
 const get=t.env.PACKAGES.get;let first=true;
 t.env.PACKAGES.get=async key=>{
  if(key===`goview/typed-transfers/${capture}.json`&&first){first=false;const value=await get(key);entered();await resume;return value;}
  return get(key);
 };
 const losing=t.call(capture,'go','PUT',studio);
 try {
  await paused;
  assert.equal((await t.call(capture,'upload','PUT',s)).status,201);
 }finally{release();}
 const lost=await losing;assert.equal(lost.status,409);assert.equal((await lost.json()).error,'TRANSFER_CONFLICT');
 assert.deepEqual(await (await t.call(capture,'go')).json(),s);
 assert.equal([...t.data.keys()].some(k=>k.startsWith(`goview/${map.mapId}/`)),false);
 assert.equal(t.data.has(`goview/transfers/${capture}.json`),false);
});

test('reserved Studio ID blocks other types and reports pending until canonical readback completes',async()=>{
 const t=setup(),s=snapshot(),map=Engine.demo();
 const studio=envelope('STUDIO',Engine.pack(map),{mapId:map.mapId,version:map.version},capture);
 const put=t.env.PACKAGES.put;let failed=false;
 t.env.PACKAGES.put=async(key,value,options)=>{
  if(key.startsWith(`goview/${map.mapId}/versions/`)&&!failed){failed=true;throw Error('synthetic stop before canonical write');}
  return put(key,value,options);
 };
 assert.equal((await t.call(capture,'go','PUT',studio)).status,503);
 assert.equal((await t.call(capture,'upload')).status,403);
 const pending=await t.call(capture,'read');assert.equal(pending.status,503);assert.equal((await pending.json()).error,'TRANSFER_RESERVED_READBACK_REQUIRED');
 assert.equal((await t.call(capture,'upload','PUT',s)).status,409);
 assert.equal([...t.data.keys()].some(k=>k.startsWith(`goview/${map.mapId}/`)),false);
 // Explicit identical retry resumes the immutable reservation; GET never dispatches PUT.
 assert.equal((await t.call(capture,'go','PUT',studio)).status,200);
 assert.deepEqual(await (await t.call(capture,'read')).json(),studio);
});

test('Studio canonical commit followed by lost response recovers through GET without mutation replay',async()=>{
 const t=setup(),map=Engine.demo();const e=envelope('STUDIO',Engine.pack(map),{mapId:map.mapId,version:map.version},'synthetic-lost-response');
 const put=t.env.PACKAGES.put;let fail=true;
 t.env.PACKAGES.put=async(k,v,o)=>{const value=await put(k,v,o);if(k===`goview/${map.mapId}/latest.json`&&fail){fail=false;throw Error('synthetic response lost after canonical commit');}return value;};
 const response=await t.call(e.transferId,'go','PUT',e);
 // Router can reconcile the legacy adapter's 503 from canonical bytes/index/binding.
 assert.equal(response.status,200);
 const writes=t.writes();assert.deepEqual(await (await t.call(e.transferId,'read')).json(),e);assert.equal(t.writes(),writes);
});

test('Studio typed boundary matches canonical six-digit route before reserving identity',async()=>{
 const t=setup(),map={...Engine.demo(),version:999999};
 const last=envelope('STUDIO',Engine.pack(map),{mapId:map.mapId,version:999999},'synthetic-max-version');
 assert.equal((await t.call(last.transferId,'go','PUT',last)).status,201);
 assert.equal((await (await t.call(last.transferId,'read')).json()).identity.version,999999);
 const beyond={...map,version:1000000},raw=Engine.pack(beyond);
 const invalid={...last,transferId:'synthetic-invalid-version',identity:{mapId:map.mapId,version:1000000},payload:raw,sha256:Engine.hash(raw)};
 const writes=t.writes();
 assert.equal((await t.call(invalid.transferId,'go','PUT',invalid)).status,422);
 assert.equal(t.writes(),writes);
 assert.equal(t.data.has(`goview/typed-transfers/${invalid.transferId}.json`),false);
 assert.equal(t.data.has(`goview/${map.mapId}/versions/1000000.json`),false);
 assert.throws(()=>envelope('STUDIO',raw,invalid.identity,invalid.transferId));
});
