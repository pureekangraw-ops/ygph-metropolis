import { createAppUpdater, capacitorUpdaterBridge, DEFAULT_UPDATE_METADATA_URL } from './app-update.mjs';

const $=id=>document.getElementById(id);
const LATEST_BACKUP_KEY='metro-settings-latest-backup';
let updateController=null;

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

function requestRealBackup(){
  const button=$('backupBtn');
  const appStatus=$('appStatus');
  if(!button||!appStatus||typeof MutationObserver==='undefined')return Promise.reject(new Error('UPDATE_BACKUP_UI_UNAVAILABLE'));
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);observer.disconnect();if(error)reject(error);else{recordLatestBackup();resolve({ok:true});}};
    const observer=new MutationObserver(()=>{
      const message=String(appStatus.textContent||'');
      if(message.includes('สร้าง Encrypted Backup แล้ว'))finish();
      else if(appStatus.classList.contains('error'))finish(new Error(message||'UPDATE_BACKUP_FAILED'));
    });
    observer.observe(appStatus,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
    const timer=setTimeout(()=>finish(new Error('UPDATE_BACKUP_TIMEOUT')),30000);
    button.click();
  });
}

function formatBytes(value){
  const bytes=Number(value||0);
  if(!Number.isFinite(bytes)||bytes<=0)return '—';
  if(bytes<1024*1024)return `${Math.max(1,Math.round(bytes/1024))} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

function friendlyUpdateError(error,fallback='ดำเนินการอัปเดตไม่สำเร็จ'){
  const code=String(error?.code||error?.message||error||'');
  const map={
    UPDATE_BACKUP_FAILED:'สำรองข้อมูลไม่สำเร็จ',
    UPDATE_BACKUP_TIMEOUT:'สำรองข้อมูลใช้เวลานานเกินไป',
    UPDATE_HASH_MISMATCH:'ไฟล์อัปเดตไม่ผ่านการตรวจสอบ',
    UPDATE_PACKAGE_MISMATCH:'ไฟล์อัปเดตไม่ใช่ LIGHTHOUSE ที่ถูกต้อง',
    UPDATE_VERSION_MISMATCH:'รุ่นของไฟล์อัปเดตไม่ตรงกัน',
    UPDATE_SIGNER_MISMATCH:'ลายเซ็นของแอปไม่ตรงกับรุ่นที่ติดตั้ง',
    UPDATE_VERSION_NOT_NEWER:'ตอนนี้เป็นรุ่นล่าสุดแล้ว',
    UPDATE_CANCELLED:'ยกเลิกการดาวน์โหลดแล้ว'
  };
  return map[code]||fallback;
}

function setUpdateStatus(message,error=false){
  const node=$('settingsApkUpdateStatus');
  if(!node)return;
  node.textContent=message||'';
  node.classList.toggle('error',error);
}

function renderUpdateInfo({installed,latest}={}){
  if(installed){
    if($('settingsInstalledVersion'))$('settingsInstalledVersion').textContent=`${installed.versionName||'—'} (${installed.versionCode||'—'})`;
  }
  if(latest){
    if($('settingsLatestVersion'))$('settingsLatestVersion').textContent=`${latest.versionName} (${latest.versionCode})`;
    if($('settingsUpdateSize'))$('settingsUpdateSize').textContent=formatBytes(latest.sizeBytes);
    if($('settingsReleaseNotes'))$('settingsReleaseNotes').textContent=latest.releaseNotes;
    $('settingsInstallUpdateBtn')?.classList.remove('hidden');
  }
}

async function wireAppUpdater(){
  const bridge=capacitorUpdaterBridge();
  const check=$('settingsApkCheckBtn');
  const install=$('settingsInstallUpdateBtn');
  const cancel=$('settingsCancelUpdateBtn');
  const permission=$('settingsUnknownSourcesBtn');
  if(!check||!install||!cancel||!permission)return;
  if(!bridge){
    setUpdateStatus('ระบบอัปเดต APK ใช้ได้เมื่อเปิดจากแอป LIGHTHOUSE บน Android');
    check.disabled=true;install.disabled=true;cancel.disabled=true;permission.disabled=true;
    return;
  }

  updateController=createAppUpdater({metadataUrl:DEFAULT_UPDATE_METADATA_URL,nativeBridge:bridge,requestBackup:requestRealBackup});
  let retryVerifiedArtifact=false;
  bridge.addProgressListener?.(({downloadedBytes,totalBytes}={})=>{
    const progress=$('settingsUpdateProgress');
    const downloaded=Number(downloadedBytes||0);
    const total=Number(totalBytes||0);
    if(progress){
      progress.max=100;
      if(Number.isFinite(total)&&total>0)progress.value=Math.max(0,Math.min(100,(Number(downloadedBytes)/Number(totalBytes))*100));
      else progress.removeAttribute('value');
    }
    const detail=$('settingsUpdateProgressText');
    if(detail)detail.textContent=total>0?`${formatBytes(downloaded)} / ${formatBytes(total)} · ${Math.round((downloaded/total)*100)}%`:formatBytes(downloaded);
  });

  check.addEventListener('click',async()=>{
    check.disabled=true;setUpdateStatus('กำลังตรวจหาอัปเดต…');
    try{
      retryVerifiedArtifact=false;
      retryVerifiedArtifact=false;
      retryVerifiedArtifact=false;
      retryVerifiedArtifact=false;
      retryVerifiedArtifact=false;
      retryVerifiedArtifact=false;
      retryVerifiedArtifact=false;
      const result=await updateController.check();renderUpdateInfo(result);setUpdateStatus(`พบรุ่น ${result.latest.versionName} พร้อมอัปเดต`);
    }catch(error){setUpdateStatus(friendlyUpdateError(error,'ตรวจหาอัปเดตไม่สำเร็จ'),true);}
    finally{check.disabled=false;}
  });

  install.addEventListener('click',async()=>{
    install.disabled=true;cancel.classList.remove('hidden');permission.classList.add('hidden');setUpdateStatus('กำลังดาวน์โหลดและตรวจ APK…');
    try{
      const result=retryVerifiedArtifact?await updateController.retryInstaller():await updateController.downloadAndInstall();
      if(result.status==='permission-required'){
        retryVerifiedArtifact=true;
        permission.classList.remove('hidden');setUpdateStatus('Android ต้องอนุญาตให้ LIGHTHOUSE ติดตั้งแอปจากแหล่งนี้ก่อน');
      }else if(result.status==='installed'){
        retryVerifiedArtifact=false;renderUpdateInfo(result);setUpdateStatus('ติดตั้งแล้ว · LIGHTHOUSE เป็นรุ่นล่าสุด');
      }else {
        retryVerifiedArtifact=true;setUpdateStatus('รอการยืนยันจาก Android');
      }
    }catch(error){setUpdateStatus(friendlyUpdateError(error,'อัปเดตไม่สำเร็จ'),true);}
    finally{install.disabled=false;cancel.classList.add('hidden');}
  });

  cancel.addEventListener('click',async()=>{try{await updateController.cancel();setUpdateStatus('ยกเลิกการดาวน์โหลดแล้ว');}catch(error){setUpdateStatus(friendlyUpdateError(error,'ยกเลิกการดาวน์โหลดไม่สำเร็จ'),true);}});
  permission.addEventListener('click',async()=>{try{await bridge.openUnknownSourcesSettings();setUpdateStatus('เปิดหน้าสิทธิ์ Android แล้ว กลับมาและกดดาวน์โหลดและติดตั้งอีกครั้ง');}catch(error){setUpdateStatus(friendlyUpdateError(error,'เปิดหน้าสิทธิ์ไม่สำเร็จ'),true);}});

  try{
    const resumed=await updateController.resume();
    renderUpdateInfo(resumed);
    if(resumed.status==='ready-to-install'){retryVerifiedArtifact=true;install.classList.remove('hidden');install.textContent='ติดตั้งอีกครั้ง';setUpdateStatus('ไฟล์ตรวจผ่านแล้ว · พร้อมส่งให้ Android อีกครั้ง');}
    else if(resumed.status==='installed'){retryVerifiedArtifact=false;install.classList.add('hidden');setUpdateStatus('ติดตั้งแล้ว · LIGHTHOUSE เป็นรุ่นล่าสุด');}
  }catch{setUpdateStatus('อ่านสถานะการอัปเดตไม่สำเร็จ',true);}
}

function buildUpdatePanel(){
  const update=makeSection('settingsUpdatePanel','การอัปเดตแอป','ดาวน์โหลด APK เต็ม ตรวจความถูกต้อง สำรองข้อมูล แล้วให้ Android เป็นผู้ยืนยันการติดตั้ง');
  const facts=document.createElement('div');facts.className='system-facts';
  facts.innerHTML='<div class="system-fact"><span>รุ่นปัจจุบัน</span><b id="settingsInstalledVersion">—</b></div><div class="system-fact"><span>รุ่นใหม่</span><b id="settingsLatestVersion">—</b></div><div class="system-fact"><span>ขนาด</span><b id="settingsUpdateSize">—</b></div>';
  const notes=document.createElement('p');notes.id='settingsReleaseNotes';notes.className='muted';notes.textContent='กดตรวจหาอัปเดตเพื่อดูรายการแก้ไข';
  const progress=document.createElement('progress');progress.id='settingsUpdateProgress';progress.max=100;progress.removeAttribute('value');
  const progressText=document.createElement('p');progressText.id='settingsUpdateProgressText';progressText.className='muted';
  const actions=document.createElement('div');actions.className='action-row';
  const check=document.createElement('button');check.id='settingsApkCheckBtn';check.type='button';check.textContent='ตรวจหาอัปเดต';
  const install=document.createElement('button');install.id='settingsInstallUpdateBtn';install.type='button';install.className='primary-action hidden';install.textContent='ดาวน์โหลดและติดตั้ง';
  const cancel=document.createElement('button');cancel.id='settingsCancelUpdateBtn';cancel.type='button';cancel.className='secondary hidden';cancel.textContent='ยกเลิก';
  const permission=document.createElement('button');permission.id='settingsUnknownSourcesBtn';permission.type='button';permission.className='secondary hidden';permission.textContent='เปิดสิทธิ์ติดตั้งแอป';
  const status=document.createElement('p');status.id='settingsApkUpdateStatus';status.className='status';status.setAttribute('aria-live','polite');
  actions.append(check,install,cancel,permission);update.append(facts,notes,progress,progressText,actions,status);
  return update;
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
    makeIndexRow('settingsData','ข้อมูลและการสำรอง','สำรองข้อมูล · นำเข้าข้อมูล · กู้คืน'),
    makeIndexRow('settingsSecurity','ความปลอดภัย','รหัสผ่านและการล็อกแอป'),
    makeIndexRow('settingsUpdatePanel','การอัปเดตแอป','ตรวจรุ่น · ดาวน์โหลด APK · ติดตั้งผ่าน Android'),
    makeIndexRow('settingsAbout','เกี่ยวกับแอป','เวอร์ชันและข้อมูลแอป'),
    makeIndexRow('settingsAdvanced','ขั้นสูง','กู้คืน · ข้อมูลทางเทคนิค · ล้างข้อมูล')
  );

  const usage=makeSection('settingsUsage','การใช้งาน','ยังไม่มีค่าการแสดงผลที่ผู้ใช้ปรับเองในรุ่นนี้ จึงไม่มีสวิตช์จำลอง');
  const permissions=makeSection('settingsPermissions','การแจ้งเตือนและสิทธิ์','สิทธิ์ที่ Android เป็นเจ้าของต้องอ่านสถานะจริงจาก Android ก่อนจึงจะแสดงหรือจัดการได้');
  const permissionState=document.createElement('p');
  permissionState.dataset.permissionOwnerUnavailable='true';
  permissionState.className='muted permission-owner-unavailable';
  permissionState.textContent='สิทธิ์ติดตั้ง APK จัดการจากหน้า “การอัปเดตแอป” เมื่อจำเป็น';
  permissions.append(permissionState);

  const data=makeSection('settingsData','ข้อมูลและการสำรอง','สำรองข้อมูล = สร้างสำเนาปัจจุบัน · นำเข้าข้อมูล = เพิ่มข้อมูลภายนอก · กู้คืน = คืนสถานะจากข้อมูลสำรอง');
  const latest=document.createElement('p');latest.id='settingsLatestBackup';latest.className='muted';data.append(latest,dataSection);
  dataSection.querySelector('h3')?.remove();
  const backup=$('backupBtn');if(backup)backup.textContent='สำรองข้อมูล';
  const restore=$('openRestoreRouteBtn');if(restore){restore.textContent='กู้คืนจากข้อมูลสำรอง';restore.classList.remove('hidden');restore.removeAttribute('aria-hidden');restore.tabIndex=0;}

  const security=makeSection('settingsSecurity','ความปลอดภัย','จัดการการเข้าถึงแอปของผู้ใช้');
  security.append(securitySection);securitySection.querySelector('h3')?.remove();

  const update=buildUpdatePanel();

  const about=makeSection('settingsAbout','เกี่ยวกับแอป','ข้อมูลรุ่นของตัวแอปและฐานเว็บภายใน');
  const facts=document.createElement('div');facts.className='system-facts';
  facts.innerHTML='<div class="system-fact"><span>Web release</span><b id="settingsAboutVersion">—</b></div>';
  about.append(facts);

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
  body.insertBefore(update,anchor);
  body.insertBefore(about,anchor);
  body.insertBefore(advanced,anchor);
  renderLatestBackup();
  observeRealBackupSuccess();
  $('settingsBtn')?.addEventListener('click',showIndex);
  $('settingsDialog')?.addEventListener('close',showIndex);
  showIndex();
  void wireAppUpdater();
}

installSettingsUtility();
