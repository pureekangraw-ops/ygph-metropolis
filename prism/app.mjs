import { buildPrismHome, buildHandoff, resolveDispatchRoute, decisionLabel } from './spectrum.mjs';

const state = {
  snapshot:{ works:[], live:false, monitorStatus:'UNKNOWN', monitor:{} },
  capabilities:{ COUNTER:false, DIRECT_API:false, DEVICE_BRIDGE:false },
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function safe(value, fallback='—'){ const text=String(value ?? '').trim(); return text || fallback; }
function statusClass(value){ const s=String(value||'').toUpperCase(); return ['PASS','COMPLETE','LIVE','MERGED'].includes(s)?'ok':s.includes('WAIT')||s==='UNKNOWN'?'wait':'info'; }

function navigate(page){
  $$('.page').forEach(node => node.classList.toggle('active', node.dataset.page===page));
  $$('[data-nav]').forEach(node => node.classList.toggle('active', node.dataset.nav===page && node.closest('.bottom-nav')));
  window.scrollTo({top:0,behavior:'instant'});
}

function cardForWork(work){
  const decision = work.decision;
  const label = decision ? decisionLabel(decision.kind) : work.status;
  return `<article class="card">
    <div class="card-head"><div><h3>${safe(work.title)}</h3><div class="muted">${safe(work.workId)} · ${safe(work.holder,'ยังไม่มี holder')}</div></div><span class="status ${statusClass(label)}">${safe(label)}</span></div>
    ${decision?.summary ? `<div>${decision.summary}</div>` : ''}
    ${decision?.consequence ? `<div class="muted">ถ้าทำ: ${decision.consequence}</div>` : ''}
    <div class="card-actions"><button data-open-monitor>ดูความจริง</button><button class="approve" data-decision-kind="${decision?.kind||''}">${decision ? 'เปิดการตัดสินใจ' : 'ดูงาน'}</button></div>
  </article>`;
}

function render(){
  const home=buildPrismHome(state.snapshot);
  $('#decision-count').textContent=String(home.decisions.length);
  const decisions=$('#decision-list');
  decisions.className='stack'+(home.decisions.length?'':' empty-card');
  decisions.innerHTML=home.decisions.length ? home.decisions.map(cardForWork).join('') : 'ยังไม่มีรายการที่ต้องตัดสินใจ';

  for (const id of ['active-list','work-list']) {
    const node=$('#'+id);
    node.className='stack'+(home.active.length?'':' empty-card');
    node.innerHTML=home.active.length ? home.active.map(cardForWork).join('') : 'ยังไม่มี Work สด';
  }

  $('#monitor-peek-status').textContent=home.monitorStatus;
  $('#m-live').textContent=home.live?'LIVE':'UNKNOWN';
  const focus=home.active[0];
  $('#m-work').textContent=focus?safe(focus.workId):'—';
  $('#m-route').textContent=focus?.route?.length?focus.route.join(' → '):'—';
  $('#m-ci').textContent=safe(state.snapshot.monitor?.ci,'UNKNOWN');
  $('#m-deploy').textContent=safe(state.snapshot.monitor?.deploy,'UNKNOWN');
  $('#m-provenance').textContent=safe(state.snapshot.monitor?.provenance,'UNKNOWN');
  $('#monitor-raw').textContent=JSON.stringify(state.snapshot,null,2);

  $$('#decision-list [data-open-monitor], #active-list [data-open-monitor], #work-list [data-open-monitor]').forEach(b=>b.onclick=()=>navigate('MONITOR'));
  $$('[data-decision-kind]').forEach(b=>b.onclick=()=>navigate(b.dataset.decisionKind==='MERGE_APPROVAL'?'MONITOR':'WORK'));
}

async function loadSnapshot(){
  const bridge=window.PRISM_BRIDGE;
  if (bridge?.getSnapshot) {
    try {
      const next=await bridge.getSnapshot();
      state.snapshot=next&&typeof next==='object'?next:state.snapshot;
      if (bridge.getCapabilities) state.capabilities=await bridge.getCapabilities();
    } catch (error) {
      state.snapshot={...state.snapshot,live:false,monitorStatus:'UNKNOWN',error:String(error?.message||error)};
    }
  }
  render();
}

$$('[data-nav]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.nav)));
$('#refresh').addEventListener('click',loadSnapshot);

$('#command-form').addEventListener('submit', async event=>{
  event.preventDefault();
  const input=$('#command-input');
  const text=input.value.trim();
  if(!text)return;
  const bridge=window.PRISM_BRIDGE;
  if(!bridge?.submitIntent){
    $('#command-status').textContent='ยังไม่มี runtime bridge — เก็บคำสั่งไว้ใน UI แต่จะไม่แกล้งว่าส่งแล้ว';
    return;
  }
  $('#command-status').textContent='กำลังส่ง Intent…';
  try{
    const result=await bridge.submitIntent(text);
    $('#command-status').textContent=safe(result?.summary,'รับ Intent แล้ว');
    input.value='';
    await loadSnapshot();
  }catch(error){ $('#command-status').textContent='ส่งไม่สำเร็จ: '+safe(error?.message,'UNKNOWN'); }
});

$('#handoff-form').addEventListener('input',()=>{
  const route=resolveDispatchRoute(state.capabilities);
  $('#route-preview').textContent='Route: '+route.route+(route.fallback?' (ต้องใช้มือ)':'');
});

$('#handoff-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const envelope=buildHandoff({
    workId:$('#handoff-work').value,
    checkpointId:$('#handoff-checkpoint').value,
    destination:$('#handoff-destination').value,
    requestedResult:$('#handoff-result').value,
    message:$('#handoff-message').value,
  });
  const readback=$('#handoff-readback');
  readback.hidden=false;
  if(!envelope.ready){ readback.textContent='ยังส่งไม่ได้: ขาด '+envelope.missing.join(', '); return; }
  const route=resolveDispatchRoute(state.capabilities);
  const bridge=window.PRISM_BRIDGE;
  if(route.route==='MANUAL'||!bridge?.dispatch){
    readback.textContent='เตรียม Handoff แล้ว แต่ยังไม่มีเส้นส่งจริง\n'+JSON.stringify({route,...envelope},null,2);
    return;
  }
  readback.textContent='กำลังส่งผ่าน '+route.route+'…';
  try{
    const result=await bridge.dispatch({...envelope,route:route.route});
    readback.textContent='ส่งแล้วและได้ readback\n'+JSON.stringify(result,null,2);
    await loadSnapshot();
  }catch(error){ readback.textContent='ส่งไม่สำเร็จ: '+safe(error?.message,'UNKNOWN'); }
});

loadSnapshot();
