import './theme-shell.mjs';
import './reset-all-ui.mjs';
import './obligation-import-ui.mjs';

export const APP_RELEASE='5.2.6';
export const UPDATE_LOG=Object.freeze([
  Object.freeze({
    timestamp:'23 ส.ค. 2026 · 21:36',
    items:Object.freeze([
      'ร้านค้า — ต้นทุนร้านค้าที่จ่ายจริงจะถูกบันทึกเป็นเงินจริงออกใน Ledger ด้วย',
      'ช่องต้นทุนร้านค้าระบุชัดว่าเป็นค่าใช้จ่ายที่จ่ายจริง เช่น ค่าส่ง / Grab / น้ำมัน / แพ็กเกจ',
    ]),
  }),
]);

const $=id=>document.getElementById(id);
let serviceWorkerState='กำลังตรวจสอบ';

function ensureServiceWorkerNode(){
  const version=$('systemVersion');
  if(!version)return null;
  let node=$('systemServiceWorker');
  if(node)return node;
  const parent=version.parentElement;
  if(!parent)return null;
  const label=document.createElement('span');
  label.textContent='Service Worker';
  node=document.createElement('b');
  node.id='systemServiceWorker';
  parent.append(label,node);
  return node;
}

function ensureUpdateLog(){
  const systemSection=$('systemVersion')?.closest?.('.settings-section');
  if(!systemSection)return null;
  let section=$('systemUpdateLog');
  if(section)return section;
  section=document.createElement('section');
  section.id='systemUpdateLog';
  section.className='settings-section';
  const title=document.createElement('h3');
  title.textContent='มีอะไรใหม่';
  section.append(title);
  for(const entry of UPDATE_LOG){
    const timestamp=document.createElement('p');
    timestamp.className='muted';
    timestamp.textContent=entry.timestamp;
    const list=document.createElement('ul');
    for(const item of entry.items){
      const row=document.createElement('li');
      row.textContent=item;
      list.append(row);
    }
    section.append(timestamp,list);
  }
  systemSection.before(section);
  return section;
}

function renderReleaseStatus(){
  const version=$('systemVersion');
  if(version)version.textContent=APP_RELEASE;
  ensureUpdateLog();
  const worker=ensureServiceWorkerNode();
  if(worker)worker.textContent=serviceWorkerState;
}

function setServiceWorkerState(next){
  serviceWorkerState=next;
  renderReleaseStatus();
}

function syncRegistration(registration){
  if(registration.waiting){setServiceWorkerState('มีอัปเดตพร้อมใช้');return;}
  if(registration.installing){setServiceWorkerState('กำลังอัปเดต');return;}
  if(registration.active||navigator.serviceWorker.controller){setServiceWorkerState('พร้อมใช้');return;}
  setServiceWorkerState('กำลังเริ่มระบบ');
}

async function observeServiceWorker(){
  renderReleaseStatus();
  if(!('serviceWorker' in navigator)){setServiceWorkerState('ไม่รองรับ');return;}
  try{
    const registration=await navigator.serviceWorker.register('./sw.js');
    syncRegistration(registration);
    registration.addEventListener('updatefound',()=>{
      setServiceWorkerState('กำลังอัปเดต');
      registration.installing?.addEventListener('statechange',()=>syncRegistration(registration));
    });
    navigator.serviceWorker.addEventListener('controllerchange',()=>setServiceWorkerState('อัปเดตแล้ว'));
    try{await registration.update();syncRegistration(registration);}catch{syncRegistration(registration);}
  }catch{
    setServiceWorkerState('มีปัญหา');
  }
}

renderReleaseStatus();
void observeServiceWorker();