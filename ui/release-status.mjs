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

function ensureServiceWorkerNode(){
  const technical=document.querySelector('[data-settings-technical]');
  if(!technical)return null;
  let node=$('systemServiceWorker');
  if(node)return node;
  const row=document.createElement('div');
  row.className='system-fact';
  const label=document.createElement('span');
  label.textContent='Service Worker';
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
  title.textContent='มีอะไรใหม่';
  const latest=document.createElement('small');
  latest.textContent=UPDATE_LOG[0]?.timestamp || '';
  summary.append(title,latest);
  section.append(summary);

  const body=document.createElement('div');
  body.className='update-log-body';
  for(const entry of UPDATE_LOG){
    const list=document.createElement('ul');
    for(const item of entry.items){
      const row=document.createElement('li');
      row.textContent=item;
      list.append(row);
    }
    body.append(list);
  }
  section.append(body);
  technical.append(section);
  return section;
}

function renderReleaseStatus(){
  const version=$('systemVersion');if(version)version.textContent=APP_RELEASE;
  const aboutVersion=$('settingsAboutVersion');if(aboutVersion)aboutVersion.textContent=APP_RELEASE;
  const updateStatus=$('settingsUpdateStatus');if(updateStatus)updateStatus.textContent=serviceWorkerState;
  ensureUpdateLog();
  const worker=ensureServiceWorkerNode();if(worker)worker.textContent=serviceWorkerState;
}

function setServiceWorkerState(next){serviceWorkerState=next;renderReleaseStatus();}

function syncRegistration(registration){
  serviceWorkerRegistration=registration;
  if(registration.waiting){setServiceWorkerState('มีอัปเดตพร้อมใช้');return;}
  if(registration.installing){setServiceWorkerState('กำลังอัปเดต');return;}
  if(registration.active||navigator.serviceWorker.controller){setServiceWorkerState('พร้อมใช้');return;}
  setServiceWorkerState('กำลังเริ่มระบบ');
}

async function checkForUpdate(){
  if(!('serviceWorker' in navigator)){setServiceWorkerState('ไม่รองรับ');return;}
  try{
    setServiceWorkerState('กำลังตรวจสอบ');
    const registration=serviceWorkerRegistration||await navigator.serviceWorker.getRegistration();
    if(!registration){setServiceWorkerState('กำลังเริ่มระบบ');return;}
    await registration.update();
    syncRegistration(registration);
  }catch{setServiceWorkerState('ตรวจหาอัปเดตไม่สำเร็จ');}
}

async function observeServiceWorker(){
  renderReleaseStatus();
  if(!('serviceWorker' in navigator)){setServiceWorkerState('ไม่รองรับ');return;}
  try{
    const registration=await navigator.serviceWorker.register('./sw.js');
    serviceWorkerRegistration=registration;
    syncRegistration(registration);
    registration.addEventListener('updatefound',()=>{
      setServiceWorkerState('กำลังอัปเดต');
      registration.installing?.addEventListener('statechange',()=>syncRegistration(registration));
    });
    navigator.serviceWorker.addEventListener('controllerchange',()=>setServiceWorkerState('อัปเดตแล้ว'));
    try{await registration.update();syncRegistration(registration);}catch{syncRegistration(registration);}
  }catch{setServiceWorkerState('มีปัญหา');}
}

$('settingsCheckUpdateBtn')?.addEventListener('click',()=>void checkForUpdate());
renderReleaseStatus();
void observeServiceWorker();
