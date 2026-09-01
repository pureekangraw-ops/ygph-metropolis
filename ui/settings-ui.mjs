const $=id=>document.getElementById(id);
const LATEST_BACKUP_KEY='metro-settings-latest-backup';

function makeSection(id,title,description=''){
  const section=document.createElement('section');
  section.id=id;
  section.className='settings-utility-panel hidden';
  section.dataset.settingsPanel=id;
  const back=document.createElement('button');
  back.type='button';
  back.className='secondary settings-back-btn';
  back.textContent='‹ ตั้งค่า';
  back.addEventListener('click',showIndex);
  const heading=document.createElement('h3');
  heading.textContent=title;
  section.append(back,heading);
  if(description){const p=document.createElement('p');p.className='muted';p.textContent=description;section.append(p);}
  return section;
}

function makeIndexRow(target,title,summary=''){
  const button=document.createElement('button');
  button.type='button';
  button.className='settings-index-row';
  button.dataset.settingsTarget=target;
  const copy=document.createElement('span');
  const strong=document.createElement('strong');strong.textContent=title;
  const small=document.createElement('small');small.textContent=summary;
  copy.append(strong,small);
  const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent='›';
  button.append(copy,arrow);
  button.addEventListener('click',()=>showPanel(target));
  return button;
}

function showIndex(){
  $('settingsUtilityIndex')?.classList.remove('hidden');
  document.querySelectorAll('[data-settings-panel]').forEach(node=>node.classList.add('hidden'));
}

function showPanel(id){
  $('settingsUtilityIndex')?.classList.add('hidden');
  document.querySelectorAll('[data-settings-panel]').forEach(node=>node.classList.toggle('hidden',node.id!==id));
}

function latestBackup(){
  try{return JSON.parse(localStorage.getItem(LATEST_BACKUP_KEY)||'null');}catch{return null;}
}

function renderLatestBackup(){
  const node=$('settingsLatestBackup');
  if(!node)return;
  const latest=latestBackup();
  node.textContent=latest?.createdAt?`สำรองล่าสุด ${new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(latest.createdAt))}`:'ยังไม่มีประวัติการสำรองบนเครื่องนี้';
}

export function recordLatestBackup(createdAt=new Date().toISOString()){
  localStorage.setItem(LATEST_BACKUP_KEY,JSON.stringify({createdAt}));
  renderLatestBackup();
}

function observeRealBackupSuccess(){
  const button=$('backupBtn');
  const appStatus=$('appStatus');
  if(!button||!appStatus||typeof MutationObserver==='undefined')return;
  let pending=false;
  button.addEventListener('click',()=>{pending=true;});
  const observer=new MutationObserver(()=>{
    if(!pending)return;
    const message=String(appStatus.textContent||'');
    if(message.includes('สร้าง Encrypted Backup แล้ว')){recordLatestBackup();pending=false;return;}
    if(appStatus.classList.contains('error'))pending=false;
  });
  observer.observe(appStatus,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
}

function installSettingsUtility(){
  const body=$('settingsDialog')?.querySelector('.dialog-body');
  if(!body||$('settingsUtilityIndex'))return;
  const status=$('settingsStatus');
  const securitySection=$('changePasswordBtn')?.closest('.settings-section');
  const dataSection=$('backupBtn')?.closest('.settings-section');
  const systemSection=$('systemVersion')?.closest('.settings-section');
  if(!securitySection||!dataSection||!systemSection)return;

  const index=document.createElement('nav');
  index.id='settingsUtilityIndex';
  index.className='settings-utility-index';
  index.setAttribute('aria-label','หมวดการตั้งค่า');
  index.append(
    makeIndexRow('settingsUsage','การใช้งาน','ค่าที่ผู้ใช้เลือกเอง'),
    makeIndexRow('settingsPermissions','การแจ้งเตือนและสิทธิ์','สถานะจากเจ้าของระบบ'),
    makeIndexRow('settingsData','ข้อมูลและการสำรอง','Backup · Import · Restore'),
    makeIndexRow('settingsSecurity','ความปลอดภัย','รหัสผ่านและการล็อกแอป'),
    makeIndexRow('settingsAbout','เกี่ยวกับแอป','เวอร์ชันและสถานะอัปเดต'),
    makeIndexRow('settingsAdvanced','ขั้นสูง','Recovery · Technical · Danger Zone')
  );

  const usage=makeSection('settingsUsage','การใช้งาน','ยังไม่มีค่าการแสดงผลที่ผู้ใช้ปรับเองในรุ่นนี้ จึงไม่มีสวิตช์จำลอง');
  const permissions=makeSection('settingsPermissions','การแจ้งเตือนและสิทธิ์','สิทธิ์ที่ Android เป็นเจ้าของต้องอ่านสถานะจริงจาก Android ก่อนจึงจะแสดงหรือจัดการได้');
  const permissionState=document.createElement('p');
  permissionState.dataset.permissionOwnerUnavailable='true';
  permissionState.className='muted permission-owner-unavailable';
  permissionState.textContent='ยังไม่มี Android permission bridge ที่แอปใช้งานจริงในรุ่นนี้';
  permissions.append(permissionState);

  const data=makeSection('settingsData','ข้อมูลและการสำรอง','Backup = สร้างสำเนาปัจจุบัน · Import = เพิ่มข้อมูลภายนอก · Restore = คืนสถานะจาก Backup');
  const latest=document.createElement('p');latest.id='settingsLatestBackup';latest.className='muted';data.append(latest,dataSection);
  dataSection.querySelector('h3')?.remove();
  const backup=$('backupBtn');if(backup)backup.textContent='สำรองข้อมูล';
  const restore=$('openRestoreRouteBtn');if(restore){restore.textContent='กู้คืนจาก Backup';restore.classList.remove('hidden');restore.removeAttribute('aria-hidden');restore.tabIndex=0;}

  const security=makeSection('settingsSecurity','ความปลอดภัย','จัดการการเข้าถึงแอปของผู้ใช้');
  security.append(securitySection);securitySection.querySelector('h3')?.remove();

  const about=makeSection('settingsAbout','เกี่ยวกับแอป','ข้อมูลที่ใช้บ่อยโดยไม่เปิดรายละเอียดระบบ');
  const facts=document.createElement('div');facts.className='system-facts';
  facts.innerHTML='<div class="system-fact"><span>เวอร์ชัน</span><b id="settingsAboutVersion">—</b></div><div class="system-fact"><span>สถานะอัปเดต</span><b id="settingsUpdateStatus">กำลังตรวจสอบ</b></div>';
  const checkUpdate=document.createElement('button');checkUpdate.id='settingsCheckUpdateBtn';checkUpdate.type='button';checkUpdate.className='secondary';checkUpdate.textContent='ตรวจหาอัปเดต';
  about.append(facts,checkUpdate);

  const advanced=makeSection('settingsAdvanced','ขั้นสูง','ห้องเครื่องสำหรับ Recovery, ประวัติอัปเดต และข้อมูลทางเทคนิค');
  const technical=document.createElement('section');technical.id='settingsTechnicalInfo';technical.dataset.settingsTechnical='true';technical.className='settings-advanced-block';
  const technicalTitle=document.createElement('h4');technicalTitle.textContent='ข้อมูลทางเทคนิค';technical.append(technicalTitle,systemSection);
  systemSection.querySelector('h3')?.remove();
  const danger=document.createElement('section');danger.id='settingsDangerZone';danger.className='settings-danger-zone';
  const dangerTitle=document.createElement('h4');dangerTitle.textContent='Danger Zone';danger.append(dangerTitle);
  advanced.append(technical,danger);

  const anchor=status?.nextSibling || body.firstChild;
  body.insertBefore(index,anchor);
  body.insertBefore(usage,anchor);
  body.insertBefore(permissions,anchor);
  body.insertBefore(data,anchor);
  body.insertBefore(security,anchor);
  body.insertBefore(about,anchor);
  body.insertBefore(advanced,anchor);
  renderLatestBackup();
  observeRealBackupSuccess();
  $('settingsBtn')?.addEventListener('click',showIndex);
  $('settingsDialog')?.addEventListener('close',showIndex);
  showIndex();
}

installSettingsUtility();
