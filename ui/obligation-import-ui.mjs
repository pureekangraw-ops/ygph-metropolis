import { openGreenfieldRuntimeWithDevicePin } from '../greenfield/runtime.mjs';
import { parseObligationImportFile, verifyObligationImportReadback } from '../greenfield/obligation-import.mjs';

const launcher = document.querySelector('[data-city-action-open="finance-actions"]');
const cityDialog = document.getElementById('cityActionDialog');
const workspace = document.getElementById('workspace');

function importErrorText(error) {
  const message = String(error?.message || error || '');
  if (message === 'INVALID_OBLIGATION_IMPORT_FORMAT' || message === 'INVALID_OBLIGATION_IMPORT_VERSION' || message === 'INVALID_OBLIGATION_IMPORT_ENTRY_POINT') return 'ไฟล์นี้ไม่ใช่ไฟล์นำเข้าภาระของ METRO';
  if (message === 'OBLIGATION_IMPORT_NOT_UI_UPLOADABLE') return 'ไฟล์นี้ยังไม่ได้เปิดสิทธิ์ให้นำเข้าผ่านแอป';
  if (message.includes('OBLIGATION_IMPORT_TOTAL') || message.includes('INSTALLMENT')) return 'ยอดรวมกับยอดแบ่งงวดในไฟล์ไม่ตรงกัน';
  if (message.includes('DUPLICATE') || message.includes('ALREADY')) return 'รายการนี้มีอยู่ในระบบแล้ว';
  if (message === 'OBLIGATION_IMPORT_READBACK_MISMATCH') return 'บันทึกแล้วแต่ตรวจผลหลังนำเข้าไม่ผ่าน';
  if (message === 'DEVICE_PIN_INVALID') return 'รหัสผ่านหมดอายุ กรุณาเข้าสู่ระบบใหม่';
  return 'นำเข้าไฟล์ไม่สำเร็จ กรุณาตรวจสอบไฟล์';
}

if (launcher && cityDialog && workspace) {
  const dialog = document.createElement('dialog');
  dialog.id = 'obligationImportDialog';
  dialog.className = 'modal-dialog action-dialog';
  dialog.innerHTML = `
    <div class="dialog-body">
      <div class="dialog-head"><h2>นำเข้าภาระจากไฟล์</h2><button id="obligationImportClose" type="button" class="secondary">ปิด</button></div>
      <p class="muted">รองรับไฟล์ YGPH_METROPOLIS_RUNTIME_PAYLOAD สำหรับ runtime.obligation เท่านั้น</p>
      <input id="obligationImportFile" type="file" accept="application/json,.json">
      <button id="obligationImportSubmit" type="button" class="primary-action">นำเข้า</button>
      <p id="obligationImportStatus" class="status" aria-live="polite"></p>
    </div>`;
  workspace.append(dialog);

  const close = () => { if (dialog.open) dialog.close(); };
  document.getElementById('obligationImportClose').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });

  function openImporter() {
    document.getElementById('obligationImportStatus').textContent = '';
    document.getElementById('obligationImportStatus').classList.remove('error');
    document.getElementById('obligationImportFile').value = '';
    if (!dialog.open) dialog.showModal();
    document.getElementById('obligationImportFile').focus();
  }

  launcher.addEventListener('click', () => {
    queueMicrotask(() => {
      const choices = cityDialog.querySelector('.city-action-choices');
      if (!choices || choices.querySelector('[data-obligation-import-open]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.obligationImportOpen = 'true';
      button.textContent = 'นำเข้าภาระจากไฟล์';
      button.addEventListener('click', () => {
        if (cityDialog.open) cityDialog.close();
        openImporter();
      });
      choices.append(button);
    });
  });

  document.getElementById('obligationImportSubmit').addEventListener('click', async () => {
    const input = document.getElementById('obligationImportFile');
    const status = document.getElementById('obligationImportStatus');
    const submit = document.getElementById('obligationImportSubmit');
    let runtime = null;
    status.textContent = '';
    status.classList.remove('error');
    submit.disabled = true;
    try {
      const file = input.files?.[0];
      if (!file) throw new Error('NO_OBLIGATION_IMPORT_FILE');
      let documentPayload;
      try { documentPayload = JSON.parse(await file.text()); }
      catch { throw new Error('INVALID_OBLIGATION_IMPORT_JSON'); }
      const payload = parseObligationImportFile(documentPayload);
      const pin = sessionStorage.getItem('metro-auto-unlock-pin') || '';
      if (pin.length < 6) throw new Error('DEVICE_PIN_INVALID');
      runtime = await openGreenfieldRuntimeWithDevicePin({ pin });
      const before = await runtime.readState();
      if (before?.domains?.LEDGER?.records?.[payload.obligationId]) throw new Error('OBLIGATION_ALREADY_EXISTS');
      for (const installment of payload.installments) {
        if (before?.domains?.CALENDAR?.records?.[installment.queueId]) throw new Error('OBLIGATION_IMPORT_QUEUE_ALREADY_EXISTS');
      }
      await runtime.obligation(payload);
      const after = await runtime.readState();
      verifyObligationImportReadback(after, payload);
      status.textContent = 'นำเข้าสำเร็จ';
      sessionStorage.setItem('metro-auto-unlock-pin', pin);
      setTimeout(() => location.reload(), 250);
    } catch (error) {
      status.textContent = importErrorText(error);
      status.classList.add('error');
    } finally {
      runtime?.close();
      submit.disabled = false;
    }
  });
}
