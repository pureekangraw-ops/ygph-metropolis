import { buildPrismHome, buildHandoff, resolveDispatchRoute, decisionLabel } from './spectrum.mjs';

const state={snapshot:{works:[],live:false,monitorStatus:'UNKNOWN',monitor:{},labResults:[]},capabilities:{COUNTER:false,DIRECT_API:false,DEVICE_BRIDGE:false}};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const safe=(v,f='—')=>String(v??'').trim()||f;

function humanStatus(value){
  const s=String(value||'').toUpperCase();
  const map={LIVE:'พร้อม',PASS:'ผ่าน',COMPLETE:'เสร็จแล้ว',MERGED:'รวมแล้ว','WAIT VERIFY':'รอตรวจ',WAIT:'กำลังรอ',ON_PROCESS:'กำลังทำ','ON PROCESS':'กำลังทำ',OPEN:'เปิดอยู่',UNKNOWN:'ยังไม่ทราบ',FAIL:'ไม่ผ่าน'};
  return map[s]||safe(value,'ยังไม่ทราบ');
}
function statusClass(v){const s=String(v||'').toUpperCase();return ['LIVE','PASS','COMPLETE','MERGED'].includes(s)?'ok':s.includes('WAIT')||s==='UNKNOWN'?'wait':'info';}
function nav(page){$$('.page').forEach(n=>n.classList.toggle('active',n.dataset.page===page));$$('.bottom-nav [data-nav]').forEach(n=>n.classList.toggle('active',n.dataset.nav===page));window.scrollTo({top:0,behavior:'instant'});}
function titleFor(work){return safe(work.title,'งานนี้');}

function workCard(work){
  const decision=work.decision;
  const label=decision?decisionLabel(decision.kind):humanStatus(work.status);
  return `<article class="work-card">
    <div class="work-top"><div><h3>${titleFor(work)}</h3><div class="subtle">${humanStatus(work.status)}${work.holder?' · อยู่กับ '+work.holder:''}</div></div><span class="status ${statusClass(decision?.kind||work.status)}">${safe(label)}</span></div>
    ${decision?.summary?`<div class="decision-summary">${decision.summary}</div>`:''}
    ${decision?.consequence?`<div class="impact">ถ้าดำเนินการ: ${decision.consequence}</div>`:''}
    <div class="card-actions"><button data-detail="${work.workId}">ดูรายละเอียด</button><button class="primary-action" data-act="${work.workId}" data-kind="${decision?.kind||''}">${decision?'จัดการ':'ส่งต่อ'}</button></div>
  </article>`;
}

function fillWorkSelect(works){
  const select=$('#handoff-work-select'); const current=select.value;
  select.innerHTML='<option value="">เลือกงาน</option>'+works.map((w,i)=>`<option value="${i}">${titleFor(w)}</option>`).join('');
  if(current && select.options[Number(current)+1]) select.value=current;
}
function renderLab(){
  const list=Array.isArray(state.snapshot.labResults)?state.snapshot.labResults:[];
  const node=$('#lab-results');
  node.className='stack'+(list.length?'':' empty-card');
  node.innerHTML=list.length?list.map(item=>`<article class="work-card"><div class="work-top"><h3>${safe(item.title,'ผลจาก PIXIE')}</h3><span class="status info">${humanStatus(item.status||'OPEN')}</span></div><div class="decision-summary">${safe(item.summary,'มีผลการทดลองกลับมาแล้ว')}</div><div class="card-actions"><button data-nav="WORK">พักไว้</button><button class="primary-action" data-lab-use>เอาไปต่อ</button></div></article>`).join(''):'ยังไม่มีผลจาก PIXIE';
}

function render(){
  const home=buildPrismHome(state.snapshot);
  $('#decision-count').textContent=String(home.decisions.length);
  for(const [id,items,empty] of [['decision-list',home.decisions,'ยังไม่มีเรื่องที่ต้องตัดสินใจ'],['active-list',home.active.slice(0,3),'ยังไม่มีงานที่กำลังทำ'],['work-list',home.active,'ยังไม่มีงานที่กำลังทำ']]){
    const n=$('#'+id); n.className='stack'+(items.length?'':' empty-card'); n.innerHTML=items.length?items.map(workCard).join(''):empty;
  }
  fillWorkSelect(home.active); renderLab();
  $('#monitor-peek-status').textContent=home.live?'พร้อมเชื่อมต่อ':humanStatus(home.monitorStatus);
  $('#m-live').textContent=home.live?'พร้อม':'ยังไม่ทราบ';
  const focus=home.active[0];
  $('#m-work').textContent=focus?titleFor(focus):'—';
  $('#m-route').textContent=focus?.route?.length?focus.route.join(' → '):'—';
  $('#m-ci').textContent=humanStatus(state.snapshot.monitor?.ci);
  $('#m-deploy').textContent=humanStatus(state.snapshot.monitor?.deploy);
  $('#m-provenance').textContent=humanStatus(state.snapshot.monitor?.provenance);
  $('#monitor-raw').textContent=JSON.stringify(state.snapshot,null,2);
  $$('[data-detail]').forEach(b=>b.onclick=()=>nav('MONITOR'));
  $$('[data-act]').forEach(b=>b.onclick=()=>{const w=home.active.find(x=>x.workId===b.dataset.act);prefillHandoff(w);nav(b.dataset.kind==='MERGE_APPROVAL'?'MONITOR':'HANDOFF');});
  $$('[data-nav]').forEach(b=>{if(!b.dataset.bound){b.dataset.bound='1';b.addEventListener('click',()=>nav(b.dataset.nav));}});
}

function prefillHandoff(work){
  if(!work)return;
  $('#handoff-work').value=safe(work.workId,'');
  $('#handoff-checkpoint').value=safe(work.checkpointId,'');
  const all=buildPrismHome(state.snapshot).active; const idx=all.findIndex(x=>x.workId===work.workId); if(idx>=0)$('#handoff-work-select').value=String(idx);
}
async function loadSnapshot(){
  const bridge=window.PRISM_BRIDGE;
  if(bridge?.getSnapshot){
    try{const next=await bridge.getSnapshot(); if(next&&typeof next==='object')state.snapshot=next; if(bridge.getCapabilities)state.capabilities=await bridge.getCapabilities();}
    catch(error){state.snapshot={...state.snapshot,live:false,monitorStatus:'UNKNOWN',error:String(error?.message||error)};}
  }
  render(); updateRoutePreview();
}
function updateRoutePreview(){
  const route=resolveDispatchRoute(state.capabilities);
  $('#route-preview').textContent=route.route==='MANUAL'?'ตอนนี้ PRISM ยังส่งแทนไม่ได้ — จะเตรียมข้อความให้คุณส่งเอง':'พร้อมส่งจาก PRISM';
}
$('#refresh').addEventListener('click',loadSnapshot);
$('#command-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('#command-input'),text=input.value.trim();if(!text)return;const bridge=window.PRISM_BRIDGE;if(!bridge?.submitIntent){$('#command-status').textContent='รับไว้แล้ว แต่ตอนนี้ยังเชื่อมตัวสั่งงานจริงไม่ได้';return;}$('#command-status').textContent='กำลังจัดการ…';try{const r=await bridge.submitIntent(text);$('#command-status').textContent=safe(r?.summary,'รับคำสั่งแล้ว');input.value='';await loadSnapshot();}catch(err){$('#command-status').textContent='ยังทำให้ไม่ได้ตอนนี้: '+safe(err?.message,'ไม่ทราบสาเหตุ');}});
$('#handoff-work-select').addEventListener('change',e=>{const works=buildPrismHome(state.snapshot).active;prefillHandoff(works[Number(e.target.value)]);});
$('#handoff-form').addEventListener('input',updateRoutePreview);
$('#handoff-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const envelope=buildHandoff({workId:$('#handoff-work').value,checkpointId:$('#handoff-checkpoint').value,destination:$('#handoff-destination').value,requestedResult:$('#handoff-result').value,message:$('#handoff-message').value});
  const box=$('#handoff-readback');box.hidden=false;
  if(!envelope.ready){box.innerHTML='<strong>ยังส่งไม่ได้</strong><span>เลือกงานหรือเติมรายละเอียดงานให้ครบก่อน</span>';return;}
  const route=resolveDispatchRoute(state.capabilities),bridge=window.PRISM_BRIDGE;
  if(route.route==='MANUAL'||!bridge?.dispatch){box.innerHTML='<strong>เตรียมให้แล้ว</strong><span>ตอนนี้ PRISM ยังส่งแทนไม่ได้ คุณสามารถคัดลอกข้อความนี้ไปส่งเองได้</span><details><summary>ดูข้อความที่เตรียมไว้</summary><pre>'+safe(envelope.message,envelope.requestedResult)+'</pre></details>';return;}
  box.innerHTML='<strong>กำลังส่ง…</strong><span>รอการยืนยันจากปลายทาง</span>';
  try{const result=await bridge.dispatch({...envelope,route:route.route});box.innerHTML='<strong>ส่งแล้ว</strong><span>'+safe(result?.summary,'ปลายทางรับงานแล้ว')+'</span>';await loadSnapshot();}catch(err){box.innerHTML='<strong>ส่งไม่สำเร็จ</strong><span>'+safe(err?.message,'ไม่ทราบสาเหตุ')+'</span>';}
});
$('#send-to-pixie').addEventListener('click',()=>{nav('HANDOFF');$('#handoff-destination').value='PIXIE_LAB';updateRoutePreview();});
loadSnapshot();