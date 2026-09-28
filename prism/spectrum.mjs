export const PRISM_SURFACES=Object.freeze(['COPILOT','PROJECTS','HANDOFF','MAP','LEDGER','MONITOR']);
const clean=v=>String(v??'').trim();

export function normalizeWork(item={}){
  return Object.freeze({
    workId:clean(item.workId)||'UNKNOWN',
    checkpointId:clean(item.checkpointId)||'',
    title:clean(item.title)||'งานไม่มีชื่อ',
    project:clean(item.project)||null,
    status:clean(item.status).toUpperCase()||'UNKNOWN',
    holder:clean(item.holder)||null,
    route:Array.isArray(item.route)?item.route.map(clean).filter(Boolean):[],
    decision:item.decision&&typeof item.decision==='object'?Object.freeze({
      kind:clean(item.decision.kind).toUpperCase()||'UNKNOWN',
      summary:clean(item.decision.summary),
      consequence:clean(item.decision.consequence),
      authorityRequired:clean(item.decision.authorityRequired)||null,
    }):null,
    evidence:Array.isArray(item.evidence)?item.evidence.filter(Boolean):[],
    updatedAt:clean(item.updatedAt)||null,
  });
}

export function buildPrismHome(snapshot={}){
  const works=Array.isArray(snapshot.works)?snapshot.works.map(normalizeWork):[];
  const decisions=works.filter(w=>w.decision&&w.decision.kind!=='NONE');
  const active=works.filter(w=>!['COMPLETE','CANCEL'].includes(w.status));
  return Object.freeze({decisions,active,monitorStatus:clean(snapshot.monitorStatus).toUpperCase()||'UNKNOWN',live:snapshot.live===true});
}

export function summarizeProjects(snapshot={}){
  const active=buildPrismHome(snapshot).active;
  return Object.freeze({
    active:active.length,
    waiting:active.filter(w=>w.status.includes('WAIT')).length,
    decision:active.filter(w=>w.decision&&w.decision.kind!=='NONE').length,
  });
}

export function buildHandoff({workId,checkpointId,destination,requestedResult,message,attachments=[]}={}){
  const envelope={schemaVersion:'prism-handoff-v2',workId:clean(workId),checkpointId:clean(checkpointId),destination:clean(destination).toUpperCase(),requestedResult:clean(requestedResult),message:clean(message),attachments:Array.isArray(attachments)?attachments.filter(Boolean):[]};
  const missing=Object.entries(envelope).filter(([k,v])=>['workId','checkpointId','destination','requestedResult'].includes(k)&&!v).map(([k])=>k);
  return Object.freeze({...envelope,contextMode:'WORK_REFERENCE_FIRST',ready:missing.length===0,missing:Object.freeze(missing)});
}

export function buildConferenceCall({workId,checkpointId,participants=['GO','LIGHT']}={}){
  const members=[...new Set((Array.isArray(participants)?participants:[]).map(v=>clean(v).toUpperCase()).filter(Boolean))];
  const ready=Boolean(clean(workId)&&clean(checkpointId)&&members.length>=2);
  return Object.freeze({schemaVersion:'prism-conference-v1',workId:clean(workId),checkpointId:clean(checkpointId),participants:Object.freeze(members),contextMode:'SHARED_WORK',ready});
}

export function resolveDispatchRoute(capabilities={},preferred=[]){
  const ordered=preferred.length?preferred:['COUNTER','DIRECT_API','DEVICE_BRIDGE'];
  for(const route of ordered){const key=String(route).toUpperCase();if(capabilities[key]===true)return Object.freeze({route:key,fallback:false});}
  return Object.freeze({route:'MANUAL',fallback:true});
}
export function decisionLabel(kind){const labels={MERGE_APPROVAL:'รออนุมัติ Merge',OWNER_DECISION:'ต้องตัดสินใจ',BLOCKER:'ติดปัญหา',VERIFY:'รอตรวจ'};return labels[String(kind||'').toUpperCase()]||'ต้องตรวจสอบ';}

export function decideReplay({actionIdentity,receipt,evidence=[]}={}){
  const identity=clean(actionIdentity);
  if(!identity)return Object.freeze({decision:'WAIT_VERIFY',dispatch:false,reason:'ACTION_IDENTITY_UNKNOWN'});
  const r=receipt&&typeof receipt==='object'?receipt:null;
  const receiptIdentity=clean(r?.actionIdentity);
  const status=clean(r?.status).toUpperCase();
  const evidenceList=Array.isArray(evidence)?evidence.filter(Boolean):[];
  const sameIdentity=receiptIdentity===identity;
  const done=status==='DONE'&&sameIdentity&&evidenceList.length>0;
  if(done)return Object.freeze({decision:'RETURN_EXISTING',dispatch:false,reason:'DONE_RECEIPT_VERIFIED',receipt:r});
  if(r||evidenceList.length)return Object.freeze({decision:'WAIT_VERIFY',dispatch:false,reason:'RECEIPT_OR_EVIDENCE_UNCLEAR'});
  return Object.freeze({decision:'DISPATCH',dispatch:true,reason:'NEW_ACTION'});
}
