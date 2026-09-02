"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {join}=require('node:path');
const root=join(__dirname,'..');
const read=p=>readFile(join(root,p),'utf8');

test('LIGHTHOUSE user surfaces use human Thai instead of system/developer copy',async()=>{
  const [html,master,manual,settings]=await Promise.all([
    read('index.html'),read('ui/master-input.mjs'),read('ui/manual-finance-ui.mjs'),read('ui/settings-ui.mjs')
  ]);
  assert.doesNotMatch(html,/<small>FINANCE<\/small>/);
  for(const forbidden of [
    '<small>MASTER INPUT</small>', 'aria-label="Master Input"', 'aria-label="ข้อความ Master Input"',
    "open.textContent = 'เปิด Manual'", "open.textContent='เปิด Manual'",
    'MANUAL · ชีวิตของรายการ','Income · Outcome · Calendar · Ledger','มองสถานะ → แตะเข้าเรื่อง → ทำ Action → อ่าน Truth ใหม่',
    'Income — เงินเข้า','Outcome — เงินออกและภาระ','Ledger — คุมความจริง',
    "'Action'", "'Appointment'", "'Todo'", "'Debt Follow-up'", "'Open'", "'Partial'", "'Complete'", "'Cancelled'",
    'Runtime ของแอป','PATH ยังยืนยันผลจริงไม่ได้'
  ]) assert.equal(`${master}\n${manual}\n${settings}`.includes(forbidden),false,`forbidden user copy survived: ${forbidden}`);
  assert.match(master,/SUCCESS:'สำเร็จ'/);
  assert.match(master,/ERROR:'ไม่สำเร็จ'/);
  assert.match(master,/READY:'พร้อม'/);
  assert.match(master,/IDLE:'พร้อมพิมพ์'/);
  assert.match(manual,/จัดการเงินและรายการ/);
  assert.match(manual,/ประวัติเงินจริง/);
});

test('normal Settings copy does not expose raw updater error codes/messages directly',async()=>{
  const settings=await read('ui/settings-ui.mjs');
  assert.doesNotMatch(settings,/`ตรวจหาอัปเดตไม่สำเร็จ: \$\{error\?\.message\|\|error\}`/);
  assert.doesNotMatch(settings,/`อัปเดตไม่สำเร็จ: \$\{error\?\.message\|\|error\}`/);
  assert.doesNotMatch(settings,/setUpdateStatus\(error\?\.message\|\|String\(error\),true\)/);
  assert.match(settings,/friendlyUpdateError/);
});
