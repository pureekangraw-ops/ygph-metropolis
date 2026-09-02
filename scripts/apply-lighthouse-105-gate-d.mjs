import { readFileSync, writeFileSync } from 'node:fs';

function patch(path,replacements){
  let source=readFileSync(path,'utf8');
  for(const [from,to] of replacements){
    if(!source.includes(from)) continue;
    source=source.split(from).join(to);
  }
  writeFileSync(path,source);
}

patch('index.html',[
  ['<small>FINANCE</small>','<small>การเงิน</small>'],
]);

patch('ui/master-input.mjs',[
  ["const STATE_LABELS = Object.freeze({ WAITING:'รอ' });","const STATE_LABELS = Object.freeze({ IDLE:'พร้อมพิมพ์', INTERPRETING:'กำลังอ่าน', READY:'พร้อม', ASK:'ต้องถามเพิ่ม', WAITING:'รอ', UNSUPPORTED:'ยังทำไม่ได้', SUCCESS:'สำเร็จ', ERROR:'ไม่สำเร็จ' });"],
  ["open.textContent = 'เปิด Manual';","open.textContent = 'เปิดรายการ';"],
  ["shell.setAttribute('aria-label', 'Master Input');","shell.setAttribute('aria-label', 'พิมพ์สิ่งที่ต้องการ');"],
  ['<div><small>MASTER INPUT</small><h2>พิมพ์ตามที่พูดจริงได้เลย</h2></div>','<div><small>พิมพ์สิ่งที่ต้องการ</small><h2>พิมพ์ตามที่พูดจริงได้เลย</h2></div>'],
  ['<button id="masterInputSubjectOpen" type="button">เปิด Manual</button>','<button id="masterInputSubjectOpen" type="button">เปิดรายการ</button>'],
  ['aria-label="ข้อความ Master Input"','aria-label="ข้อความที่ต้องการ"'],
  ["MASTER_INPUT_RUNTIME_LOCKED:'Runtime ของแอปยังไม่พร้อม กรุณาเข้าแอปใหม่'","MASTER_INPUT_RUNTIME_LOCKED:'แอปยังไม่พร้อม กรุณาเข้าแอปใหม่'"],
  ["MASTER_INPUT_PATH_NOT_PROVEN:'PATH ยังยืนยันผลจริงไม่ได้'","MASTER_INPUT_PATH_NOT_PROVEN:'ยังยืนยันผลจริงไม่ได้'"],
  ["return commands.map(command => `${command.rawText || command.groupId || 'คำสั่ง'} · ${command.status}`).join(' · ');","return commands.map(command => `${command.rawText || command.groupId || 'คำสั่ง'} · ${STATE_LABELS[command.status] ?? 'กำลังดำเนินการ'}`).join(' · ');"],
]);

patch('ui/manual-finance-ui.mjs',[
  ["'MANUAL · ชีวิตของรายการ'","'จัดการรายการ'"],
  ["'Income · Outcome · Calendar · Ledger'","'จัดการเงินและรายการ'"],
  ["'มองสถานะ → แตะเข้าเรื่อง → ทำ Action → อ่าน Truth ใหม่'","'ดูสถานะ เลือกรายการ แล้วจัดการต่อได้ตรงนี้'"],
  ["'Income — เงินเข้า'","'เงินเข้า'"],
  ["'Target'","'เป้ารายได้'"],
  ["'ตั้ง / แก้ Target'","'บันทึกเป้ารายได้'"],
  ["'ยังไม่มี Target'","'ยังไม่ได้ตั้งเป้ารายได้'"],
  ["'+ สร้าง Receivable'","'+ เพิ่มเงินที่ต้องรับ'"],
  ["'Outcome — เงินออกและภาระ'","'เงินออกและภาระ'"],
  ["'Ceiling'","'เพดานรายจ่าย'"],
  ["'ตั้ง / แก้ Ceiling'","'บันทึกเพดานรายจ่าย'"],
  ["'ยังไม่มี Ceiling'","'ยังไม่ได้ตั้งเพดานรายจ่าย'"],
  ["['APPOINTMENT','Appointment'],['TODO','Todo'],['DEBT_FOLLOW_UP','Debt Follow-up']","['APPOINTMENT','นัดหมาย'],['TODO','สิ่งที่ต้องทำ'],['DEBT_FOLLOW_UP','ติดตามหนี้']"],
  ["'Ledger — คุมความจริง'","'ประวัติเงินจริง'"],
  ["['TRANSACTION','Transaction'],['TARGET','เป้ารายได้'],['CEILING','เพดานรายจ่าย'],['RECEIVABLE','Receivable'],['OBLIGATION','Obligation']","['TRANSACTION','รายการเงินจริง'],['TARGET','เป้ารายได้'],['CEILING','เพดานรายจ่าย'],['RECEIVABLE','เงินที่ต้องรับ'],['OBLIGATION','ภาระ']"],
  ["['OPEN','Open'],['PARTIAL','Partial'],['COMPLETED','Complete'],['CANCELLED','Cancelled']","['OPEN','เปิดอยู่'],['PARTIAL','บางส่วน'],['COMPLETED','เสร็จแล้ว'],['CANCELLED','ยกเลิก']"],
  ["'Action'","'จัดการ'"],
]);

let settings=readFileSync('ui/settings-ui.mjs','utf8');
if(!settings.includes('function friendlyUpdateError(')){
  const marker="function setUpdateStatus(message,error=false){";
  const helper=`function friendlyUpdateError(error,fallback='ดำเนินการอัปเดตไม่สำเร็จ'){\n  const code=String(error?.code||error?.message||error||'');\n  const map={\n    UPDATE_BACKUP_FAILED:'สำรองข้อมูลไม่สำเร็จ',\n    UPDATE_BACKUP_TIMEOUT:'สำรองข้อมูลใช้เวลานานเกินไป',\n    UPDATE_HASH_MISMATCH:'ไฟล์อัปเดตไม่ผ่านการตรวจสอบ',\n    UPDATE_PACKAGE_MISMATCH:'ไฟล์อัปเดตไม่ใช่ LIGHTHOUSE ที่ถูกต้อง',\n    UPDATE_VERSION_MISMATCH:'รุ่นของไฟล์อัปเดตไม่ตรงกัน',\n    UPDATE_SIGNER_MISMATCH:'ลายเซ็นของแอปไม่ตรงกับรุ่นที่ติดตั้ง',\n    UPDATE_VERSION_NOT_NEWER:'ตอนนี้เป็นรุ่นล่าสุดแล้ว',\n    UPDATE_CANCELLED:'ยกเลิกการดาวน์โหลดแล้ว'\n  };\n  return map[code]||fallback;\n}\n\n`;
  if(!settings.includes(marker)) throw new Error('Gate D: settings status marker not found');
  settings=settings.replace(marker,helper+marker);
}
settings=settings
  .replace("}catch(error){setUpdateStatus(error?.message==='UPDATE_VERSION_NOT_NEWER'?'ตอนนี้เป็นรุ่นล่าสุดแล้ว':`ตรวจหาอัปเดตไม่สำเร็จ: ${error?.message||error}`,true);}","}catch(error){setUpdateStatus(friendlyUpdateError(error,'ตรวจหาอัปเดตไม่สำเร็จ'),true);}")
  .replace("}catch(error){setUpdateStatus(`อัปเดตไม่สำเร็จ: ${error?.message||error}`,true);}","}catch(error){setUpdateStatus(friendlyUpdateError(error,'อัปเดตไม่สำเร็จ'),true);}")
  .replace("cancel.addEventListener('click',async()=>{try{await updateController.cancel();setUpdateStatus('ยกเลิกการดาวน์โหลดแล้ว');}catch(error){setUpdateStatus(error?.message||String(error),true);}});","cancel.addEventListener('click',async()=>{try{await updateController.cancel();setUpdateStatus('ยกเลิกการดาวน์โหลดแล้ว');}catch(error){setUpdateStatus(friendlyUpdateError(error,'ยกเลิกการดาวน์โหลดไม่สำเร็จ'),true);}});")
  .replace("permission.addEventListener('click',async()=>{try{await bridge.openUnknownSourcesSettings();setUpdateStatus('เปิดหน้าสิทธิ์ Android แล้ว กลับมาและกดดาวน์โหลดและติดตั้งอีกครั้ง');}catch(error){setUpdateStatus(error?.message||String(error),true);}});","permission.addEventListener('click',async()=>{try{await bridge.openUnknownSourcesSettings();setUpdateStatus('เปิดหน้าสิทธิ์ Android แล้ว กลับมาและกดดาวน์โหลดและติดตั้งอีกครั้ง');}catch(error){setUpdateStatus(friendlyUpdateError(error,'เปิดหน้าสิทธิ์ไม่สำเร็จ'),true);}});")
  .replace("makeIndexRow('settingsData','ข้อมูลและการสำรอง','Backup · นำเข้าข้อมูล · Restore')","makeIndexRow('settingsData','ข้อมูลและการสำรอง','สำรองข้อมูล · นำเข้าข้อมูล · กู้คืน')")
  .replace("makeIndexRow('settingsAdvanced','ขั้นสูง','Recovery · Technical · Danger Zone')","makeIndexRow('settingsAdvanced','ขั้นสูง','กู้คืน · ข้อมูลทางเทคนิค · ล้างข้อมูล')")
  .replace("const data=makeSection('settingsData','ข้อมูลและการสำรอง','Backup = สร้างสำเนาปัจจุบัน · นำเข้าข้อมูล = เพิ่มข้อมูลภายนอก · Restore = คืนสถานะจาก Backup');","const data=makeSection('settingsData','ข้อมูลและการสำรอง','สำรองข้อมูล = สร้างสำเนาปัจจุบัน · นำเข้าข้อมูล = เพิ่มข้อมูลภายนอก · กู้คืน = คืนสถานะจากข้อมูลสำรอง');")
  .replace("restore.textContent='กู้คืนจาก Backup'","restore.textContent='กู้คืนจากข้อมูลสำรอง'");
writeFileSync('ui/settings-ui.mjs',settings);
