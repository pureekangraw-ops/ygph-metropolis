from pathlib import Path
import re


def read(path): return Path(path).read_text(encoding='utf-8')
def write(path, text): Path(path).write_text(text, encoding='utf-8')
def replace_once(text, old, new, label):
    if old not in text: raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)
def sub_once(text, pattern, repl, label):
    out, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1: raise SystemExit(f'expected 1 match for {label}, got {count}')
    return out

# Fix the centered-dialog typo from the low-level CSS commit if present.
css = read('styles.css').replace('margin:auto6;', 'margin:auto;')
write('styles.css', css)

# Replace the old System area with three dialogs: Calendar Edit, destructive confirm, flat Settings.
html = read('index.html')
html = sub_once(html, r'\n        <section class="area-page" data-area-page="system">[\s\S]*?\n        </section>(?=\n      </div>)', '', 'system area')
insert = r'''

      <dialog id="calendarEditDialog" class="modal-dialog" aria-labelledby="calendarEditTitle">
        <div class="dialog-body">
          <div class="dialog-head"><h2 id="calendarEditTitle">แก้ไขรายการ</h2><button id="calendarEditCloseBtn" type="button" class="secondary" aria-label="ปิด">ปิด</button></div>
          <p id="calendarEditLabel" class="muted"></p>
          <label>วันครบกำหนด <input id="calendarEditDueDate" type="date" required></label>
          <div class="dialog-actions"><button id="calendarCancelOpenBtn" type="button" class="danger-action">ยกเลิกรายการ</button><button id="calendarRescheduleBtn" type="button" class="primary-action">บันทึกวันใหม่</button></div>
        </div>
      </dialog>

      <dialog id="calendarCancelDialog" class="modal-dialog" aria-labelledby="calendarCancelTitle">
        <div class="dialog-body">
          <div class="dialog-head"><h2 id="calendarCancelTitle">ยกเลิกรายการ?</h2></div>
          <p id="calendarCancelCopy" class="confirm-copy">รายการจะถูกปิดในปฏิทิน โดยไม่สร้างหรือย้อนเงินจริง</p>
          <div class="dialog-actions"><button id="calendarCancelBackBtn" type="button" autofocus>กลับ</button><button id="calendarCancelConfirmBtn" type="button" class="danger-action">ยืนยันยกเลิก</button></div>
        </div>
      </dialog>

      <dialog id="settingsDialog" class="modal-dialog settings-dialog" aria-labelledby="settingsDialogTitle">
        <div class="dialog-body">
          <div class="dialog-head"><h2 id="settingsDialogTitle">ตั้งค่า</h2><button id="settingsCloseBtn" type="button" class="secondary" aria-label="ปิด">ปิด</button></div>
          <p id="settingsStatus" class="status" aria-live="polite"></p>
          <section class="settings-section">
            <h3>ความปลอดภัย</h3>
            <div class="action-row"><button id="changePasswordBtn" type="button">เปลี่ยนรหัสผ่าน</button><button id="systemLockBtn" type="button">ล็อกแอป</button></div>
            <div id="changePasswordPanel" class="settings-inline hidden"><label>รหัสผ่านปัจจุบัน <input id="changeCurrentPassword" type="password" minlength="6" autocomplete="current-password"></label><label>รหัสผ่านใหม่ <input id="changeNewPassword" type="password" minlength="6" autocomplete="new-password"></label><label>ยืนยันรหัสผ่าน <input id="changeConfirmPassword" type="password" minlength="6" autocomplete="new-password"></label><div class="action-row"><button id="submitChangePasswordBtn" class="primary-action" type="button">บันทึกรหัสผ่านใหม่</button><button id="cancelChangePasswordBtn" class="secondary" type="button">ยกเลิก</button></div></div>
          </section>
          <section class="settings-section">
            <h3>สำรองและกู้คืน</h3>
            <div class="action-row"><button id="backupBtn" type="button">Backup</button><button id="openRestoreRouteBtn" type="button">Restore</button></div>
          </section>
          <section class="settings-section">
            <h3>ระบบ</h3>
            <span id="runtimeBadge" class="badge">LOCKED</span>
            <div class="metrics three"><article><small>ฐาน</small><b id="systemDbState">พร้อมใช้</b></article><article><small>State revision</small><b id="systemRevision">—</b></article><article><small>Schema</small><b id="systemSchema">—</b></article></div>
            <div class="kv"><span>แอป</span><b id="systemVersion">Production Shell v2</b><span>ฐานข้อมูล</span><b id="systemDatabase">—</b><span>การประสานการเขียน</span><b id="systemCoordination">—</b></div>
            <pre id="diagnostics" class="diagnostics"></pre>
          </section>
        </div>
      </dialog>'''
html = replace_once(html, '\n      <p id="appStatus"', insert + '\n      <p id="appStatus"', 'dialog insertion')
write('index.html', html)

# UI routing and Calendar interactions.
app = read('ui/app.mjs')
app = replace_once(app, "let monthCursor = monthFromDate(selectedCalendarDate);\n", "let monthCursor = monthFromDate(selectedCalendarDate);\nlet editingCalendarRecordId = null;\n", 'editing id')
app = replace_once(app, "const AREA_LABEL = Object.freeze({ home:'หน้าหลัก', store:'ร้านค้า', ride:'วิ่งงาน', finance:'การเงิน', calendar:'ปฏิทิน', system:'ตั้งค่า' });", "const AREA_LABEL = Object.freeze({ home:'หน้าหลัก', store:'ร้านค้า', ride:'วิ่งงาน', finance:'การเงิน', calendar:'ปฏิทิน' });", 'area labels')
app = sub_once(app, r'function routeTo\(target=\{\}\)\{[\s\S]*?\n\}\nfunction numberText', r'''function openSettings(){
  if(runtime&&state)renderSystem(buildContext());
  const dialog=$('settingsDialog');
  if(!dialog.open)dialog.showModal();
}
function routeTo(target={}){
  if(target.area==='SYSTEM'){openSettings();return;}
  let area;
  if(target.area==='MAKE_MONEY') area=target.focus==='ride'?'ride':target.focus==='store'?'store':'home';
  else area=({HOME:'home',STORE:'store',RIDE:'ride',CALENDAR:'calendar',FINANCE:'finance'})[target.area]||String(target.area||'').toLowerCase();
  if(target.date){selectedCalendarDate=target.date;monthCursor=monthFromDate(target.date);}
  activateArea(area||'home');render();
}
function numberText''', 'routeTo')
calendar_fn = r'''function calendarRecordById(recordId){return recordsForDomain(state,'CALENDAR').find(record=>record.recordId===recordId)||null;}
function openCalendarEdit(record){editingCalendarRecordId=record.recordId;$('calendarEditLabel').textContent=record.title||TYPE_LABEL[record.type]||'รายการ';$('calendarEditDueDate').value=dateKey(record.dueDate||record.date||record.scheduledDate);const dialog=$('calendarEditDialog');if(!dialog.open)dialog.showModal();}
function calendarActionItem(record){const item=simpleItem(record);const timeState=deriveTimeState(record,todayKey());const meta=document.createElement('small');meta.className='muted';meta.textContent=timeState==='OVERDUE'?'เลยกำหนด':timeState==='TODAY'?'วันนี้':timeState==='NEAR'?'ใกล้ถึง':'';if(meta.textContent)item.append(meta);if(!isCalendarActionableStatus(record.status))return item;const actions=document.createElement('div');actions.className='item-actions';if(['RECEIVE_CUSTOMER_PAYMENT','PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT'].includes(record.type)){const input=document.createElement('input');input.inputMode='decimal';input.value=formatSatang(Number(record.amountSatang||0));input.setAttribute('aria-label','จำนวนเงิน');const pay=document.createElement('button');pay.textContent=record.type==='RECEIVE_CUSTOMER_PAYMENT'?'รับเงิน':'ชำระ';pay.addEventListener('click',async()=>{try{const amountSatang=parseBahtToSatang(input.value);const intent=paymentIntentForQueue(record,amountSatang,{workflowId:makeId('WF-PAY'),transactionId:makeId('TX')});await runtime[intent.method](intent.input);await refresh('บันทึกเงินจริงและอัปเดตคิวแล้ว');}catch(error){status(error.message,true);}});actions.append(input,pay);}else{const complete=document.createElement('button');complete.textContent='เสร็จ';complete.addEventListener('click',()=>run('calendarStatus',{workflowId:makeId('WF-CAL'),queueId:record.recordId,status:'COMPLETED'},'อัปเดตสถานะแล้ว'));actions.append(complete);}const edit=document.createElement('button');edit.className='secondary';edit.textContent='แก้ไข';edit.addEventListener('click',()=>openCalendarEdit(record));actions.append(edit);item.append(actions);return item;}
function renderCalendar'''
app = sub_once(app, r'function calendarActionItem\(record\)\{[\s\S]*?\}\nfunction renderCalendar', calendar_fn, 'calendarActionItem')
listener_block = r'''$('settingsBtn').addEventListener('click',openSettings);
$('settingsCloseBtn').addEventListener('click',()=>{$('settingsDialog').close();});
$('calendarEditCloseBtn').addEventListener('click',()=>{$('calendarEditDialog').close();editingCalendarRecordId=null;});
$('calendarRescheduleBtn').addEventListener('click',async()=>{const record=calendarRecordById(editingCalendarRecordId);if(!record)return status('ไม่พบรายการปฏิทิน',true);try{const dueDate=$('calendarEditDueDate').value;await runtime.calendarReschedule({workflowId:makeId('WF-CAL-MOVE'),queueId:record.recordId,dueDate});selectedCalendarDate=dueDate;monthCursor=monthFromDate(dueDate);$('calendarEditDialog').close();editingCalendarRecordId=null;await refresh('เลื่อนวันครบกำหนดแล้ว');}catch(error){status(error.message,true);}});
$('calendarCancelOpenBtn').addEventListener('click',()=>{const record=calendarRecordById(editingCalendarRecordId);if(!record)return status('ไม่พบรายการปฏิทิน',true);$('calendarCancelCopy').textContent=`ยืนยันยกเลิก “${record.title||TYPE_LABEL[record.type]||'รายการ'}” โดยไม่สร้างหรือย้อนเงินจริง`;$('calendarEditDialog').close();$('calendarCancelDialog').showModal();$('calendarCancelBackBtn').focus();});
$('calendarCancelBackBtn').addEventListener('click',()=>{$('calendarCancelDialog').close();const record=calendarRecordById(editingCalendarRecordId);if(record&&isCalendarActionableStatus(record.status))openCalendarEdit(record);});
$('calendarCancelConfirmBtn').addEventListener('click',async()=>{const record=calendarRecordById(editingCalendarRecordId);if(!record)return status('ไม่พบรายการปฏิทิน',true);try{await runtime.calendarStatus({workflowId:makeId('WF-CAL-CANCEL'),queueId:record.recordId,status:'CANCELLED'});$('calendarCancelDialog').close();editingCalendarRecordId=null;await refresh('ยกเลิกรายการแล้ว');}catch(error){status(error.message,true);}});'''
app = replace_once(app, "$('settingsBtn').addEventListener('click',()=>activateArea('system'));", listener_block, 'settings listener')
app = replace_once(app, "$('backupBtn').addEventListener('click',async()=>{try{const backup=await runtime.exportBackup();const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`YGPH_METROPOLIS_BACKUP_${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('สร้าง Encrypted Backup แล้ว');}catch(error){status(error.message,true);}});", "$('backupBtn').addEventListener('click',async()=>{try{const backup=await runtime.exportBackup();const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`YGPH_METROPOLIS_BACKUP_${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('settingsDialog').close();status('สร้าง Encrypted Backup แล้ว');}catch(error){$('settingsStatus').textContent=error.message;$('settingsStatus').classList.add('error');}});", 'backup listener')
app = replace_once(app, "$('systemLockBtn').addEventListener('click',()=>{runtime?.close();runtime=null;state=null;$('workspace').classList.add('hidden');$('gate').classList.remove('hidden');$('runtimeBadge').textContent='LOCKED';$('devicePin').value='';$('recoveryPassphrase').value='';status('',false,true);});", "$('systemLockBtn').addEventListener('click',()=>{for(const id of ['settingsDialog','calendarEditDialog','calendarCancelDialog']){const dialog=$(id);if(dialog?.open)dialog.close();}editingCalendarRecordId=null;runtime?.close();runtime=null;state=null;$('workspace').classList.add('hidden');$('gate').classList.remove('hidden');$('runtimeBadge').textContent='LOCKED';$('devicePin').value='';$('recoveryPassphrase').value='';status('',false,true);});", 'lock listener')
write('ui/app.mjs', app)

# Keep password-change feedback visible inside the modal; successful change closes it and reports globally.
root = read('app.mjs')
root = replace_once(root, "  const status = $('appStatus');\n  const button = $('submitChangePasswordBtn');", "  const status = $('settingsStatus');\n  const button = $('submitChangePasswordBtn');", 'password status target')
root = replace_once(root, "    closeChangePasswordPanel();\n    status.textContent = 'เปลี่ยนรหัสผ่านแล้ว';", "    closeChangePasswordPanel();\n    $('settingsDialog').close();\n    $('appStatus').textContent = 'เปลี่ยนรหัสผ่านแล้ว';", 'password success')
write('app.mjs', root)

# Update old tests whose semantics were intentionally superseded by the approved flat utility dialog.
functional = read('tests/greenfield-functional-shell.test.cjs')
functional = sub_once(functional, r"test\('each working area exists once and Calendar/System keep focused responsibilities',[\s\S]*?\n\}\);", """test('each working area exists once and Calendar keeps focused responsibilities while Settings is a utility dialog', () => {
  const html = text('index.html');
  for (const area of ['home','store','ride','finance','calendar']) assert.equal((html.match(new RegExp(`data-area-page=\\"${area}\\"`, 'g')) || []).length, 1, area);
  assert.doesNotMatch(html, /data-area-page=\\"system\\"/);
  for (const id of ['monthGrid','prevMonth','todayMonth','nextMonth','settingsDialog','diagnostics']) assert.match(html, new RegExp(`id=\\"${id}\\"`));
  const settings = html.match(/<dialog[^>]*id=\\"settingsDialog\\"[\\s\\S]*?<\\/dialog>/)?.[0] || '';
  assert.doesNotMatch(settings, /<details\\b/);
});""", 'functional system test')
write('tests/greenfield-functional-shell.test.cjs', functional)

login = read('tests/greenfield-login-ux.test.cjs')
login = sub_once(login, r"test\('system routes security access tools under Settings utility then advanced',[\s\S]*?\n", """test('Settings utility exposes flat security backup and system sections',()=>{const settings=between(html,'<dialog id=\\"settingsDialog\\"','</dialog>');assert.match(html,/id=\\"settingsBtn\\"[^>]*aria-label=\\"ตั้งค่า\\"/);const primaryNav=between(html,'<nav id=\\"bottomNav\\"','</nav>');assert.doesNotMatch(primaryNav,/data-destination=\\"system\\"|aria-label=\\"ตั้งค่า\\"/);for(const label of ['ความปลอดภัย','สำรองและกู้คืน','ระบบ'])assert.match(settings,new RegExp(label));assert.doesNotMatch(settings,/<details\\b/);for(const id of ['changePasswordBtn','backupBtn','openRestoreRouteBtn','runtimeBadge','diagnostics'])assert.match(settings,new RegExp(`id=\\"${id}\\"`));});
""", 'login settings test')
login = sub_once(login, r"test\('authenticated password change stays inside settings and never asks for Recovery Code',[\s\S]*?\n", """test('authenticated password change stays inside settings and never asks for Recovery Code',()=>{const settings=between(html,'<dialog id=\\"settingsDialog\\"','</dialog>');const changePanel=between(settings,'<div id=\\"changePasswordPanel\\"','</section>');for(const pattern of [/class=\\"[^\\"]*hidden/,/<label>รหัสผ่านปัจจุบัน\\s*<input id=\\"changeCurrentPassword\\"/,/<label>รหัสผ่านใหม่\\s*<input id=\\"changeNewPassword\\"/,/<label>ยืนยันรหัสผ่าน\\s*<input id=\\"changeConfirmPassword\\"/,/id=\\"submitChangePasswordBtn\\"/,/id=\\"cancelChangePasswordBtn\\"/])assert.match(changePanel,pattern);assert.doesNotMatch(changePanel,/รหัสกู้คืน|recoveryPassphrase|Evidence|Backup/);assert.match(entry,/openGreenfieldRuntimeWithDevicePin/);assert.match(entry,/changeDevicePassword/);assert.match(entry,/\\$\\('changePasswordBtn'\\)\\.addEventListener\\('click'/);assert.match(entry,/\\$\\('submitChangePasswordBtn'\\)\\.addEventListener\\('click'/);});
""", 'login password test')
write('tests/greenfield-login-ux.test.cjs', login)
