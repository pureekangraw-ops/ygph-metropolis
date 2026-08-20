import './theme-shell.mjs';
import './reset-all-ui.mjs';
import './obligation-import-ui.mjs';

export const APP_RELEASE='5.2.6';

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

function renderReleaseStatus(){
  const version=$('systemVersion');
  if(version)version.textContent=APP_RELEASE;
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