import Engine from '../android-browser/app/src/main/assets/goview-studio/engine.js';
export const MAX_PAYLOAD=1048576;
export const MAX_ENVELOPE=2*MAX_PAYLOAD+8192;
export const idValid=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(x);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const ensure=(x)=>{if(!x)throw Error('INVALID_TRANSFER');};
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const bounded=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n;
export const proposalId=captureId=>captureId+'-proposal';
function points(document,selected=false){
 ensure(object(document)&&document.type==='FeatureCollection'&&Array.isArray(document.features)&&document.features.length>0&&document.features.length<=1000);
 const ids=new Set();
 for(const f of document.features){
  ensure(object(f)&&f.type==='Feature'&&bounded(String(f.id??''),256)&&!ids.has(String(f.id)));ids.add(String(f.id));
  ensure(object(f.geometry)&&f.geometry.type==='Point'&&Array.isArray(f.geometry.coordinates)&&f.geometry.coordinates.length===2);
  const [lng,lat]=f.geometry.coordinates;ensure(Number.isFinite(lng)&&Math.abs(lng)<=180&&Number.isFinite(lat)&&Math.abs(lat)<=90);
  ensure(object(f.properties));
  if(selected){
   ensure(exact(f,['type','id','geometry','properties'])&&exact(f.geometry,['type','coordinates']));
   ensure(exact(f.properties,['name','goviewRecord']));
   const p=f.properties.goviewRecord;
   ensure(exact(p,['id','label','point','gridId','evidence','zoneId','note']));
   ensure(p.id===f.id&&bounded(p.label,256)&&p.label===f.properties.name&&p.gridId===''&&p.zoneId===null&&p.note===null);
   ensure(exact(p.point,['longitude','latitude'])&&p.point.longitude===lng&&p.point.latitude===lat);
   ensure(exact(p.evidence,['coordinate','source','observedAt','availableUntil'])&&p.evidence.coordinate==='UNKNOWN'&&p.evidence.source==='selected-owner-snapshot'&&p.evidence.observedAt===null&&p.evidence.availableUntil===null);
  }
 }
}
export function validateTransfer(e){
 ensure(exact(e,['schema','transferId','operation','payloadType','identity','sha256','payload']));
 ensure(e.schema==='goview.transfer.v1'&&idValid(e.transferId)&&typeof e.payload==='string'&&new TextEncoder().encode(e.payload).length<=MAX_PAYLOAD);
 ensure(typeof e.sha256==='string'&&/^[a-f0-9]{64}$/.test(e.sha256)&&Engine.hash(e.payload)===e.sha256);
 const p=JSON.parse(e.payload),i=e.identity;
 if(e.payloadType==='goview.map.package.v1'){
  ensure(e.operation==='STUDIO'&&exact(i,['mapId','version'])&&Number.isInteger(i.version)&&i.version>=1&&i.version<=999999);
  const map=Engine.unpack(e.payload);ensure(map.mapId===i.mapId&&map.version===i.version);
 }else{
  ensure(e.payloadType==='goview.map-update');
  if(e.operation==='SNAPSHOT'){
   ensure(exact(i,['captureId','baseVersion'])&&idValid(i.captureId)&&i.captureId.length<=71&&e.transferId===i.captureId&&integer(i.baseVersion));
   ensure(exact(p,['type','schemaVersion','name','goview','features','captureId','capturedAtEpochMs','captureReceipt','selection']));
   ensure(p.schemaVersion===1&&p.name==='GOVIEW'&&p.selection==='explicit-pins-only'&&p.captureId===i.captureId&&integer(p.capturedAtEpochMs));
   ensure(exact(p.goview,['format','version'])&&p.goview.format==='goview.map-update'&&p.goview.version===i.baseVersion);
   ensure(exact(p.captureReceipt,['id','operation','status','correlationId','version'])&&idValid(p.captureReceipt.id)&&p.captureReceipt.operation==='SNAPSHOT'&&p.captureReceipt.status==='CAPTURED_LOCAL'&&p.captureReceipt.correlationId===i.captureId&&p.captureReceipt.version===i.baseVersion);
   points(p,true);
  }else{
   ensure(e.operation==='PROPOSAL'&&exact(i,['captureId','baseVersion','snapshotSha256'])&&idValid(i.captureId)&&integer(i.baseVersion)&&typeof i.snapshotSha256==='string'&&/^[a-f0-9]{64}$/.test(i.snapshotSha256));
   ensure(e.transferId===proposalId(i.captureId));
   ensure(exact(p,['contractVersion','operation','sourceCaptureId','baseVersion','package'])&&p.contractVersion===1&&p.operation==='propose-update'&&p.sourceCaptureId===i.captureId&&p.baseVersion===i.baseVersion);
   points(p.package);
  }
 }
 return e;
}
export function envelope(operation,payload,identity,transferId){
 return validateTransfer({schema:'goview.transfer.v1',transferId,operation,payloadType:operation==='STUDIO'?'goview.map.package.v1':'goview.map-update',identity,sha256:Engine.hash(payload),payload});
}

/** Exact immutable envelope equality, independent of JSON member ordering. */
export function sameTransfer(a,b){
 return a.schema===b.schema&&a.transferId===b.transferId&&a.operation===b.operation&&a.payloadType===b.payloadType&&a.sha256===b.sha256&&a.payload===b.payload&&Object.keys(a.identity).length===Object.keys(b.identity).length&&Object.keys(a.identity).every(k=>a.identity[k]===b.identity[k]);
}
