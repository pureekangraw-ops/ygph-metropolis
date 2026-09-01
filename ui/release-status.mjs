import './theme-shell.mjs';
import './settings-ui.mjs';
import './reset-all-ui.mjs';
import './obligation-import-ui.mjs';

export const APP_RELEASE='5.2.6';
export const UPDATE_LOG=Object.freeze([
  Object.freeze({
    timestamp:'24 ส.ค. 2026 · 08:15',
    items:Object.freeze([
      'นำเข้าไฟล์ — เลือกไฟล์ครั้งเดียว ระบบจะตรวจไฟล์และเลือกวิธีนำเข้าให้เอง',
      'ก่อนบันทึก ระบบจะแสดงผลกระทบเป็นภาษาคน และถามยืนยันเฉพาะกรณีที่จะแทนข้อมูลเดิม',
    ]),
  }),
]);

const $=id=>document.getElementById(id);
let serviceWorkerState='กำลังตรวจสอบ';
let serviceWorkerRegistration=null;

function applyDisplayIdentity(){
  document.title='LIGHTHOUSE';
  const brand=document.querySelector('.brand-lockup strong');
  if(brand)brand.textContent='LIGHTHOUSE';
}

function ensureServiceWorkerNode(){
  const technical=document.querySelector('[data-settings-technical]');
  if(!technical)return null;
  let node=$('systemServiceWorker');
  if(node)return node;
  const row=document.createElement('div');
  row.className='system-fact';
  const label=document.createElement('span');
  label.textContent='Web cache';
  node=document.createElement('b');
  node.id='systemServiceWorker';
  row.append(label,node);
  technical.append(row);
  return node;
}

function ensureUpdateLog(){
  const technical=document.querySelector('[data-settings-technical]');
  if(!technical)return null;
  let section=$('systemUpdateLog');
  if(section)return section;
  section=document.createElement('details');
  section.id='systemUpdateLog';
  section.className='settings-advanced-block update-log';
  const summary=document.createElement('summary');
  summary.className='update-log-summary';
  const title=document.createElement('strong');
  title.textContent='ประวัติ Web release';
  const latest=document.createElement('small');
  latest.textContent=UPDATE_LOG[0]?.timestamp || '';
  summary.append(title,latest);
  section.append(summary);
  const body=document.createElement('div');
  body.className='update-log-body';
  for(const entry of UPDATE_LOG){
    const list=document.createElement('ul');
    for(const item of entry.items){const row=document.createElement('li');row.textContent=item;list.append(row);}
    body.append(list);
  }
  section.append(body);
  technical.append(section);
  return section;
}

function renderReleaseStatus(){
  applyDisplayIdentity();
  const version=$('systemVersion');if(version)version.textContent=APP_RELEASE;
  const aboutVersion=$('settingsAboutVersion');if(aboutVersion)aboutVersion.textContent=APP_RELEASE;
  ensureUpdateLog();
  const worker=ensureServiceWorkerNode();if(worker)worker.textContent=serviceWorkerState;
}

function setServiceWorkerState(next){serviceWorkerState=next;renderReleaseStatus();}
function syncRegistration(registration){
  serviceWorkerRegistration=registration;
  if(registration.installing){setServiceWorkerState('กำลังเตรียม cache');return;}
  if(registration.active||navigator.serviceWorker.controller){setServiceWorkerState('พร้อมใช้');return;}
  setServiceWorkerState('กำลังเริ่ม');
}

async function observeServiceWorker(){
  renderReleaseStatus();
  if(!('serviceWorker' in navigator)){setServiceWorkerState('ไม่รองรับ');return;}
  try{
    const registration=await navigator.serviceWorker.register('./sw.js');
    serviceWorkerRegistration=registration;
    syncRegistration(registration);
    registration.addEventListener('updatefound',()=>{
      setServiceWorkerState('กำลังเตรียม cache');
      registration.installing?.addEventListener('statechange',()=>syncRegistration(registration));
    });
    navigator.serviceWorker.addEventListener('controllerchange',()=>setServiceWorkerState('พร้อมใช้'));
  }catch{setServiceWorkerState('ไม่พร้อม');}
}

renderReleaseStatus();
void observeServiceWorker();
