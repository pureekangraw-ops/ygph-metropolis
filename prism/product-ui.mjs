import { createPrismProductRuntime } from './product-runtime.mjs';

export function mountPrismProductUI({document=globalThis.document,runtime=createPrismProductRuntime(),storage=globalThis.localStorage,download=downloadBackup}={}){
  const $=selector=>document.querySelector(selector),money=satang=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(satang/100);
  const pendingKey='prism:ledger-pending-id';
  let busy=false,opened=false,generation=0;
  const message=error=>({LEDGER_LOCKED:'กรุณาปลดล็อกคลังการเงิน',LOCAL_MAP_NOT_INSTALLED:'กรุณานำเข้าไฟล์แผนที่ก่อน',GEOGRAPHY_INVALID:'ตรวจละติจูดและลองจิจูดอีกครั้ง',FIRST_RUN_ALREADY_ENROLLED:'คลังนี้ตั้งค่าแล้ว กรุณาใช้รหัสผ่านเดิมเปิดคลัง',DEVICE_PIN_INVALID:'รหัสผ่านคลังไม่ถูกต้อง',DEVICE_UNLOCK_NOT_ENROLLED:'คลังยังไม่ได้ตั้งค่า เปิดส่วนตั้งค่าคลังด้านล่าง',LOCAL_MAP_IMPORT_CANCELLED:'ยกเลิกการนำเข้าแล้ว'})[error?.message]||String(error?.message||error);
  function setOpened(value){opened=value;$('#ledger-unlock-form').hidden=value;$('#ledger-content').hidden=!value;}
  function lock(){generation++;runtime.lockLedger();setOpened(false);for(const n of document.querySelectorAll('#ledger-summary strong'))n.textContent='—';$('#ledger-transactions').replaceChildren();for(const id of ['ledger-title','ledger-amount','ledger-password','ledger-recovery','ledger-backup-file'])$('#'+id).value='';$('#ledger-status').textContent='คลังการเงินล็อกอยู่';}
  async function refreshLedger(){
    const epoch=generation,truth=await runtime.readLedger();let plan=null;try{plan=await runtime.readPlanning();}catch{}
    if(epoch!==generation||!opened)return truth;
    const values=[money(truth.balanceSatang),money(truth.todayInSatang),money(truth.todayOutSatang),plan?.nextObligation?plan.nextObligation.title+' · '+money(plan.nextObligation.amountSatang):plan?'ไม่มีภาระที่บันทึกไว้':'ยังอ่านภาระไม่ได้'];
    document.querySelectorAll('#ledger-summary strong').forEach((node,i)=>node.textContent=values[i]);
    const list=$('#ledger-transactions');list.replaceChildren();
    for(const item of truth.transactions){const row=document.createElement('p');row.textContent=(item.direction==='IN'?'+ ':'− ')+money(item.amountSatang)+' · '+item.title;list.append(row);}
    if(!truth.transactions.length)list.textContent='ยังไม่มีรายการในคลังนี้';
    const pending=storage.getItem(pendingKey),verified=truth.transactions.find(t=>t.recordId===pending+'-TX');
    if(pending&&verified){
      if($('#ledger-title').value.trim()===verified.title&&$('#ledger-direction').value===verified.direction&&Math.round(Number($('#ledger-amount').value)*100)===verified.amountSatang){$('#ledger-title').value='';$('#ledger-amount').value='';}
      storage.removeItem(pendingKey);
    }
    $('#ledger-status').textContent='อ่านยอดจากคลังในเครื่องแล้ว · รายการ '+truth.transactions.length+' รายการ';return truth;
  }
  async function ledgerAction(operation){if(busy)return;const epoch=generation;busy=true;$('#ledger-save').disabled=true;try{await operation(epoch);}catch(error){if(epoch===generation)$('#ledger-status').textContent=message(error);}finally{busy=false;$('#ledger-save').disabled=false;}}
  async function unlockLedger(password){const epoch=generation,truth=await runtime.unlockLedger(password);if(epoch!==generation){runtime.lockLedger();return truth;}setOpened(true);await refreshLedger();return truth;}
  $('#ledger-unlock-form').addEventListener('submit',event=>{event.preventDefault();void ledgerAction(async()=>{const field=$('#ledger-password');try{await unlockLedger(field.value);}finally{field.value='';}});});
  $('#ledger-initialize').addEventListener('click',()=>void ledgerAction(async epoch=>{
    const password=$('#ledger-password'),recovery=$('#ledger-recovery');
    try{await runtime.initializeLedger({password:password.value,recoveryCode:recovery.value});if(epoch!==generation){runtime.lockLedger();return;}setOpened(true);await refreshLedger();}finally{password.value='';recovery.value='';}
  }));
  $('#ledger-recover').addEventListener('click',()=>void ledgerAction(async epoch=>{
    const password=$('#ledger-password'),recovery=$('#ledger-recovery');
    try{await runtime.recoverLedger({password:password.value,recoveryCode:recovery.value});if(epoch!==generation){runtime.lockLedger();return;}setOpened(true);await refreshLedger();}finally{password.value='';recovery.value='';}
  }));
  $('#ledger-restore').addEventListener('click',()=>void ledgerAction(async epoch=>{
    const password=$('#ledger-password'),recovery=$('#ledger-recovery'),file=$('#ledger-backup-file').files?.[0];
    if(!file)throw new Error('เลือกไฟล์สำรองข้อมูลก่อน');
    try{const backup=JSON.parse(await file.text());if(epoch!==generation)return;await runtime.restoreLedgerBackup({backup,password:password.value,recoveryCode:recovery.value});if(epoch!==generation){runtime.lockLedger();return;}setOpened(true);await refreshLedger();}finally{password.value='';recovery.value='';$('#ledger-backup-file').value='';}
  }));
  $('#ledger-entry-form').addEventListener('submit',event=>{event.preventDefault();void ledgerAction(async epoch=>{
    let id=storage.getItem(pendingKey);if(!id){id='PRISM-'+crypto.randomUUID();storage.setItem(pendingKey,id);}
    const result=await runtime.recordMoney({id,direction:$('#ledger-direction').value,title:$('#ledger-title').value,amountBaht:$('#ledger-amount').value});
    if(result.status!=='VERIFIED')throw new Error('ยังตรวจผลบันทึกไม่ได้ กรุณาอัปเดตยอดก่อน');
    if(epoch!==generation)return;
    storage.removeItem(pendingKey);$('#ledger-title').value='';$('#ledger-amount').value='';await refreshLedger();if(epoch===generation)$('#ledger-status').textContent='บันทึกและตรวจยอดแล้ว';
  });});
  $('#ledger-refresh').addEventListener('click',()=>void ledgerAction(refreshLedger));$('#ledger-lock').addEventListener('click',lock);
  $('#ledger-backup').addEventListener('click',()=>void ledgerAction(async epoch=>{const backup=await runtime.exportLedgerBackup();if(epoch!==generation)return;await download(backup);if(epoch===generation)$('#ledger-status').textContent='บันทึกไฟล์สำรองข้อมูลแล้ว เก็บไฟล์และรหัสกู้คืนไว้เพื่อย้ายเครื่อง';}));
  async function refreshMap(){const status=await runtime.mapStatus();$('#map-status').textContent=status.packageState==='ACTIVE'?'พร้อมเปิด · '+(status.region||status.fileName):status.available?'ยังไม่มีแผนที่ที่พร้อมใช้ · นำเข้าไฟล์ .pmtiles':'แผนที่ native ใช้งานได้ในแอป Android';$('#map-open').disabled=status.packageState!=='ACTIVE';return status;}
  async function mapAction(operation){try{await operation();}catch(error){$('#map-result').textContent=message(error);}}
  $('#map-import').addEventListener('click',()=>void mapAction(async()=>{await runtime.importMap();await refreshMap();$('#map-result').textContent='นำเข้าและตรวจไฟล์แผนที่แล้ว';}));
  $('#map-open').addEventListener('click',()=>void mapAction(()=>runtime.openMap()));
  const destination=()=>({lat:$('#map-lat').value,lng:$('#map-lng').value,label:$('#map-label').value});
  $('#map-destination-form').addEventListener('submit',event=>{event.preventDefault();void mapAction(()=>runtime.openMap(destination()));});
  $('#map-navigate').addEventListener('click',()=>void mapAction(()=>runtime.navigate(destination())));
  void mapAction(refreshMap);
  return Object.freeze({unlockLedger,lock,refreshMap,async financeSummary(){
    if(!opened)return 'เปิดคลังการเงินในหน้า Ledger ก่อน แล้วผมจะอ่านยอดให้';
    const epoch=generation,t=await refreshLedger();if(epoch!==generation||!opened)return 'คลังการเงินล็อกอยู่';return 'เงินในคลัง '+money(t.balanceSatang)+' · เงินเข้าวันนี้ '+money(t.todayInSatang)+' · เงินออกวันนี้ '+money(t.todayOutSatang)+' · '+t.transactions.length+' รายการ';
  }});
}
async function downloadBackup(backup){
  const capacitor=globalThis.Capacitor;
  if(capacitor?.isNativePlatform?.()){
    const plugin=capacitor.Plugins?.PrismFiles??capacitor.registerPlugin?.('PrismFiles');
    if(!plugin?.saveBackup)throw new Error('ยังเปิดระบบบันทึกไฟล์ไม่ได้');
    const receipt=await plugin.saveBackup({content:JSON.stringify(backup,null,2),fileName:'prism-ledger-backup-'+new Date().toISOString().slice(0,10)+'.json'});
    if(receipt?.status!=='SAVED_VERIFIED')throw new Error('ยังตรวจไฟล์สำรองที่บันทึกไม่ได้');return receipt;
  }
  const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='prism-ledger-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
