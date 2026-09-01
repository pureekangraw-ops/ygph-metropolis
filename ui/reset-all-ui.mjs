import { openGreenfieldVaultStore } from '../greenfield/browser-store.mjs';

const $=id=>document.getElementById(id);

function installResetAllUi(){
  const danger=$('settingsDangerZone');
  if(!danger||$('resetAllBtn'))return;
  const section=document.createElement('section');
  section.className='settings-danger-action';
  section.innerHTML=`<h5>รีเซ็ตข้อมูลทั้งหมด</h5><p class="muted">ล้างข้อมูล METRO และการเข้าสู่ระบบบนเครื่องนี้ทั้งหมด แล้วกลับไปตั้งค่าเริ่มต้นใหม่ ไฟล์ Backup ที่ดาวน์โหลดไว้จะไม่ถูกลบ</p><p class="muted">ข้อมูลในเครื่องจะหายทั้งหมด และย้อนกลับไม่ได้หากไม่มี Backup</p><button id="resetAllBtn" type="button" class="danger-action">รีเซ็ตข้อมูลทั้งหมด</button>`;
  danger.append(section);
  $('resetAllBtn').addEventListener('click',async()=>{
    const first=confirm('รีเซ็ตข้อมูลทั้งหมด?\nข้อมูลใน METRO บนเครื่องนี้จะถูกลบทั้งหมด');
    if(!first)return;
    const second=confirm('ยืนยันอีกครั้ง: การดำเนินการนี้ย้อนกลับไม่ได้ หากไม่มีไฟล์ Backup');
    if(!second)return;
    const button=$('resetAllBtn');
    const status=$('settingsStatus');
    button.disabled=true;
    status.textContent='กำลังรีเซ็ตข้อมูล…';
    status.classList.remove('error');
    let store=null;
    try{
      store=await openGreenfieldVaultStore();
      await store.resetAll();
      sessionStorage.removeItem('metro-auto-unlock-pin');
      location.reload();
    }catch(error){
      status.textContent=String(error?.message||error||'รีเซ็ตข้อมูลไม่สำเร็จ');
      status.classList.add('error');
      button.disabled=false;
    }finally{store?.close();}
  });
}

installResetAllUi();
