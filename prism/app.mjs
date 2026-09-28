import {buildPrismHome,summarizeProjects,buildHandoff,buildConferenceCall,resolveDispatchRoute,buildActionIdentity,decideReplay} from './spectrum.mjs';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const safe=(v,f='—')=>String(v??'').trim()||f;
const state={snapshot:{works:[],live:false,monitor:{}},capabilities:{COUNTER:false,DIRECT_API:false,DEVICE_BRIDGE:false}};
const pinPlugin=()=>globalThis.Capacitor?.Plugins?.PrismPin;
const replayKey=id=>'prism:replay:'+id;
const readReplay=id=>{try{return JSON.parse(localStorage.getItem(replayKey(id))||'null');}catch{return null;}};
const writeReplay=(id,v)=>{try{localStorage.setItem(replayKey(id),JSON.stringify(v));}catch{}};

async function pinStatus(){const p=pinPlugin();if(!p)throw new Error('PIN_NATIVE_BRIDGE_UNAVAILABLE');return p.status();}
async function unlock(pin){const p=pinPlugin();if(!p)throw new Error('PIN_NATIVE_BRIDGE_UNAVAILABLE');const r=await p.verify({pin});if(r?.verified)document.body.classList.remove('locked');return Boolean(r?.verified);}
async function configurePin(pin,confirmation){if(pin!==confirmation)throw new Error('PIN_CONFIRM_MISMATCH');if(!/^\d{4,12}$/.test(pin))throw new Error('PIN_INVALID');const p=pinPlugin();if(!p)throw new Error('PIN_NATIVE_BRIDGE_UNAVAILABLE');await p.provision({pin});return unlock(pin);}

function nav(page){$$('.page').forEach(n=>n.classList.toggle('active',n.dataset.page===page));$$('.bottom-nav [data-nav]').forEach(n=>n.classList.toggle('active',n.dataset.nav===page));window.scrollTo({top:0});}
function title(w){return safe(w?.title,'งานนี้');}
function status(v){const s=String(v||'UNKNOWN').toUpperCase();return ({LIVE:'พร้อม',PASS:'ผ่าน',COMPLETE:'เสร็จแล้ว','ON PROCESS':'กำลังทำ',WAIT:'กำลังรอ','WAIT VERIFY':'รอตรวจ',UNKNOWN:'ยังไม่ทราบ'})[s]||safe(v);}
function addCopilot(text,who='app'){const t=$('#copilot-thread');const n=document.createElement('div');n.className='copilot-message '+who;n.textContent=text;t.append(n);t.scrollTop=t.scrollHeight;}
function workCard(w){return '<article class="work-card"><div class="work-top"><div><h3>'+title(w)+'</h3><div class="subtle">'+status(w.status)+(w.holder?' · อยู่กับ '+w.holder:'')+'</div></div></div><div class="card-actions"><button data-detail="'+safe(w.workId,'')+'">ดูรายละเอียด</button><button class="primary-action" data-call-work="'+safe(w.workId,'')+'">ส่งต่อ</button></div></article>';}
function prefill(w){if(!w)return;$('#handoff-work').value=safe(w.workId,'');$('#handoff-checkpoint').value=safe(w.checkpointId,'');}
function updateRoute(){const r=resolveDispatchRoute(state.capabilities);$('#route-preview').textContent=r.route==='MANUAL'?'ยังไม่มีเส้นส่งสดที่พิสูจน์แล้ว — PRISM จะเตรียม handoff ให้':'พร้อมส่งและรอ readback จากปลายทาง';}

function render(){
  const home=buildPrismHome(state.snapshot),sum=summarizeProjects(state.snapshot);
  $('#decision-count').textContent=home.decisions.length;
  $('#decision-list').innerHTML=home.decisions.length?home.decisions.map(workCard).join(''):'ยังไม่มีเรื่องที่ต้องตัดสินใจ';
  $('#work-list').innerHTML=home.active.length?home.active.map(workCard).join(''):'ยังไม่มีโปรเจกต์ที่กำลังทำ';
  $('#project-active-count').textContent=sum.active;$('#project-wait-count').textContent=sum.waiting;$('#project-decision-count').textContent=sum.decision;
  $('#handoff-work-select').innerHTML='<option value="">เลือกงาน</option>'+home.active.map((w,i)=>'<option value="'+i+'">'+title(w)+'</option>').join('');
  const f=home.active[0],m=state.snapshot.monitor||{};
  $('#m-live').textContent=home.live?'พร้อม':'ยังไม่ทราบ';$('#m-work').textContent=f?title(f):'—';$('#m-route').textContent=f?.route?.length?f.route.join(' → '):'—';$('#m-ci').textContent=status(m.ci);$('#m-deploy').textContent=status(m.deploy);$('#m-provenance').textContent=status(m.provenance);$('#monitor-raw').textContent=JSON.stringify(state.snapshot,null,2);
  $$('[data-detail]').forEach(b=>b.onclick=()=>nav('MONITOR'));
  $$('[data-call-work]').forEach(b=>b.onclick=()=>{prefill(home.active.find(w=>w.workId===b.dataset.callWork));nav('HANDOFF');});
}

async function loadSnapshot(){const bridge=window.PRISM_BRIDGE;if(bridge?.getSnapshot){try{const x=await bridge.getSnapshot();if(x&&typeof x==='object')state.snapshot=x;if(bridge.getCapabilities)state.capabilities=await bridge.getCapabilities();}catch(e){state.snapshot={...state.snapshot,live:false,error:String(e?.message||e)};}}render();updateRoute();}
async function submitIntent(text){addCopilot(text,'user');const bridge=window.PRISM_BRIDGE;if(!bridge?.submitIntent){addCopilot('ยังไม่มี Copilot runtime ที่พิสูจน์แล้ว จึงไม่แกล้งว่าส่งสำเร็จ');return;}try{const r=await bridge.submitIntent(text);addCopilot(safe(r?.summary,'รับคำสั่งแล้ว'));await loadSnapshot();}catch(e){addCopilot('ยังทำให้ไม่ได้ตอนนี้: '+safe(e?.message,'ไม่ทราบสาเหตุ'));}}

$$('[data-nav]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.nav)));
$$('[data-prompt]').forEach(b=>b.addEventListener('click',()=>submitIntent(b.dataset.prompt)));
$('#refresh').addEventListener('click',loadSnapshot);
$('#command-form').addEventListener('submit',e=>{e.preventDefault();const i=$('#command-input'),t=i.value.trim();if(t){i.value='';submitIntent(t);}});
$('#handoff-work-select').addEventListener('change',e=>prefill(buildPrismHome(state.snapshot).active[Number(e.target.value)]));
$('#handoff-form').addEventListener('input',updateRoute);
$('#handoff-form').addEventListener('submit',async e=>{
  e.preventDefault();const box=$('#handoff-readback');
  const env=buildHandoff({workId:$('#handoff-work').value,checkpointId:$('#handoff-checkpoint').value,destination:$('#handoff-destination').value,requestedResult:$('#handoff-result').value,message:$('#handoff-message').value});
  box.hidden=false;if(!env.ready){box.innerHTML='<strong>ยังส่งไม่ได้</strong><span>เลือกงานและผลที่ต้องการให้ครบก่อน</span>';return;}
  const route=resolveDispatchRoute(state.capabilities),bridge=window.PRISM_BRIDGE;if(route.route==='MANUAL'||!bridge?.dispatch){box.innerHTML='<strong>เตรียม Handoff แล้ว</strong><span>ยังไม่มีเส้นส่งสดที่พิสูจน์แล้ว จึงไม่ถือว่าส่งสำเร็จ</span>';return;}
  const id=buildActionIdentity(env),prior=readReplay(id),replay=decideReplay({actionIdentity:id,receipt:prior?.receipt,evidence:prior?.evidence});
  if(replay.decision==='RETURN_EXISTING'){box.innerHTML='<strong>งานนี้ส่งสำเร็จไปแล้ว</strong><span>ใช้ผลเดิมที่ยืนยันแล้ว — ไม่ส่งซ้ำ</span>';return;}
  if(replay.decision==='WAIT_VERIFY'){box.innerHTML='<strong>รอตรวจผลเดิมก่อน</strong><span>ยังไม่ส่งซ้ำจนกว่า receipt/evidence จะชัด</span>';return;}
  writeReplay(id,{receipt:{actionIdentity:id,status:'UNKNOWN'},evidence:[]});
  try{const r=await bridge.dispatch({...env,route:route.route,actionIdentity:id});const evidence=Array.isArray(r?.evidence)?r.evidence.filter(Boolean):[],s=String(r?.status||'UNKNOWN').toUpperCase();writeReplay(id,{receipt:{actionIdentity:id,status:s,summary:safe(r?.summary,'')},evidence});box.innerHTML='<strong>ส่งแล้ว รอตรวจ</strong><span>'+safe(r?.summary,'รอ readback')+'</span>';await loadSnapshot();}catch(err){box.innerHTML='<strong>ส่งไม่สำเร็จ</strong><span>'+safe(err?.message,'ไม่ทราบสาเหตุ')+'</span>';}
});
$('#conference-go-light').addEventListener('click',async()=>{const box=$('#handoff-readback'),call=buildConferenceCall({workId:$('#handoff-work').value,checkpointId:$('#handoff-checkpoint').value,participants:['GO','LIGHT']});box.hidden=false;if(!call.ready){box.innerHTML='<strong>ยังเรียกไม่ได้</strong><span>เลือก Work ก่อน</span>';return;}const bridge=window.PRISM_BRIDGE;if(!bridge?.conference){box.innerHTML='<strong>เตรียมห้องคุยแล้ว</strong><span>live conference bridge ยังไม่ถูกพิสูจน์</span>';return;}try{const r=await bridge.conference(call);box.innerHTML='<strong>เรียกแล้ว</strong><span>'+safe(r?.summary,'GO และ LIGHT เข้ารอบ Work เดียวกัน')+'</span>';}catch(e){box.innerHTML='<strong>เรียกไม่สำเร็จ</strong><span>'+safe(e?.message,'ไม่ทราบสาเหตุ')+'</span>';}});
$('#open-ride-mode').addEventListener('click',()=>{$('#ride-mode').hidden=false;});
$('[data-finance-prompt]').addEventListener('click',()=>{nav('COPILOT');$('#command-input').value='สรุปการเงินจาก Ledger ให้ผม';$('#command-input').focus();});
$$('[data-capability]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.capability==='PROJECTS'?'PROJECTS':'HANDOFF')));

let pinMode='VERIFY';
async function initPinGate(){const msg=$('#pin-status'),confirmation=$('#pin-confirm'),heading=$('#pin-title'),button=$('#pin-submit');try{const s=await pinStatus();pinMode=s?.configured?'VERIFY':'SETUP';confirmation.hidden=pinMode!=='SETUP';heading.textContent=pinMode==='SETUP'?'ตั้ง PIN ของคุณ':'ยืนยันว่าเป็นคุณ';button.textContent=pinMode==='SETUP'?'ตั้ง PIN และเข้า PRISM':'เข้า PRISM';msg.textContent=pinMode==='SETUP'?'ตั้ง PIN 4–12 หลัก รหัสจะอยู่ในเครื่องนี้เท่านั้น':'ใส่ PIN เพื่อเปิด Copilot';}catch(e){msg.textContent='ยังตรวจระบบ PIN ไม่ได้: '+safe(e?.message,'UNKNOWN');}}
$('#pin-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('#pin-input'),confirmation=$('#pin-confirm'),msg=$('#pin-status');try{msg.textContent='กำลังตรวจ…';const ok=pinMode==='SETUP'?await configurePin(input.value,confirmation.value):await unlock(input.value);if(ok){input.value='';confirmation.value='';msg.textContent='';await loadSnapshot();}else{input.value='';msg.textContent='PIN ไม่ถูกต้อง';input.focus();}}catch(err){msg.textContent=err?.message==='PIN_CONFIRM_MISMATCH'?'PIN สองช่องไม่ตรงกัน':'ยังเปิด PRISM ไม่ได้: '+safe(err?.message,'UNKNOWN');}});
initPinGate();$('#pin-input').focus();
