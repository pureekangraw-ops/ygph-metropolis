function element(root, selector) { return root?.querySelector?.(selector) ?? null; }
function appendMessage(log, role, text, documentRef) {
  const node = documentRef.createElement('div');
  node.className = `message ${role === 'user' ? 'message-user' : 'message-lighthouse'}`;
  node.textContent = text;
  log.append(node);
  log.scrollTop = log.scrollHeight;
  return node;
}
function baht(amountSatang) {
  const amount = Number(amountSatang);
  if (!Number.isSafeInteger(amount)) return '—';
  const value = amount / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
function successText(result) {
  const title = String(result?.readback?.title ?? 'รายการ').trim() || 'รายการ';
  return `บันทึกและอ่านผลกลับแล้ว · ${title} ${baht(result?.readback?.amountSatang)} บาท`;
}
function waitingText(result) { return String(result?.directive?.prompt ?? 'ต้องการข้อมูลเพิ่มก่อนทำรายการ'); }
function publicErrorText(result, fallbackCode = 500) {
  const message = String(result?.message ?? '').trim();
  if (message) return message;
  const code = Number(result?.publicCode);
  return `Sorry — error code ${Number.isSafeInteger(code) ? code : fallbackCode}`;
}

export async function mount({ root, version, brain = null, patchUpdater = null }) {
  const documentRef = root?.ownerDocument ?? globalThis.document;
  if (!root || !documentRef) throw new Error('LIGHTHOUSE front door requires a document');
  const versionNode = element(root, '[data-lighthouse-version]');
  if (versionNode) versionNode.textContent = version;
  const log = element(root, '[data-chat-log]');
  const empty = element(root, '[data-empty-state]');
  const form = element(root, '[data-chat-form]');
  const input = element(root, '[data-chat-input]');
  const settingsPanel = element(root, '[data-settings-panel]');
  const settingsOpen = element(root, '[data-settings-open]');
  const settingsClose = element(root, '[data-settings-close]');
  const patchUpdate = element(root, '[data-patch-update]');
  const patchImport = element(root, '[data-patch-import]');
  const patchRollback = element(root, '[data-patch-rollback]');
  const transientNotice = element(root, '[data-transient-notice]');
  const systemAlert = element(root, '[data-system-alert]');
  const systemAlertCopy = element(root, '[data-system-alert-copy]');
  const systemAlertClose = element(root, '[data-system-alert-close]');
  if (!log || !form || !input || !settingsPanel) throw new Error('LIGHTHOUSE front door controls are missing');

  const cleanups = [];
  let noticeTimer = null;
  let busy = false;
  const on = (node, type, listener) => { if (!node) return; node.addEventListener(type, listener); cleanups.push(() => node.removeEventListener(type, listener)); };
  const showTransientNotice = (message) => {
    if (!transientNotice) return;
    if (noticeTimer) clearTimeout(noticeTimer);
    transientNotice.textContent = message;
    transientNotice.hidden = false;
    noticeTimer = setTimeout(() => { transientNotice.hidden = true; transientNotice.textContent = ''; noticeTimer = null; }, 2400);
  };
  const showSystemAlert = (message) => { if (!systemAlert || !systemAlertCopy) return; systemAlertCopy.textContent = message; systemAlert.hidden = false; };

  const renderBrainResult = (result) => {
    if (result?.status === 'CONFIRMATION_REQUIRED') {
      appendMessage(log, 'lighthouse', String(result.question ?? 'พิมพ์ ยืนยัน หรือ ยกเลิก'), documentRef);
      return;
    }
    if (result?.status === 'SUCCESS') {
      appendMessage(log, 'lighthouse', successText(result), documentRef);
      showTransientNotice('บันทึกแล้ว');
      return;
    }
    if (result?.status === 'CANCELLED') {
      appendMessage(log, 'lighthouse', 'ยกเลิกการบันทึกแล้ว · ยังไม่มีการเขียนข้อมูล', documentRef);
      return;
    }
    if (result?.status === 'WAITING') { appendMessage(log, 'lighthouse', waitingText(result), documentRef); return; }
    if (result?.status === 'BLOCKED' && result?.question) { appendMessage(log, 'lighthouse', `${result.question} · กรุณาตอบ “ยืนยัน” หรือ “ยกเลิก”`, documentRef); return; }
    if (result?.status === 'ERROR') { appendMessage(log, 'lighthouse', publicErrorText(result), documentRef); return; }
    if (result?.status === 'LOCKED') { appendMessage(log, 'lighthouse', 'Sorry — error code 423', documentRef); return; }
    if (result?.status === 'VERIFY') { appendMessage(log, 'lighthouse', 'Sorry — error code 422', documentRef); return; }
    if (result?.status === 'BLOCKED') { appendMessage(log, 'lighthouse', 'Sorry — error code 409', documentRef); return; }
    appendMessage(log, 'lighthouse', 'Sorry — error code 500', documentRef);
  };

  on(systemAlertClose, 'click', () => { if (systemAlert) systemAlert.hidden = true; });
  on(settingsOpen, 'click', () => { settingsPanel.hidden = false; });
  on(settingsClose, 'click', () => { settingsPanel.hidden = true; });

  on(form, 'submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || busy) return;
    if (empty) empty.hidden = true;
    appendMessage(log, 'user', message, documentRef);
    input.value = '';
    if (!brain || typeof brain.send !== 'function') {
      appendMessage(log, 'lighthouse', 'ตอนนี้หน้าแชทพร้อมแล้ว แต่ระบบตีความยังไม่เชื่อมในเวอร์ชันนี้ จึงยังไม่มีการบันทึกหรือดำเนินการใด ๆ', documentRef);
      return;
    }
    busy = true;
    try { renderBrainResult(await brain.send(message, { appVersion:version })); }
    catch (error) { globalThis.console?.error?.('LIGHTHOUSE_FRONT_DOOR_FAILED', error); appendMessage(log, 'lighthouse', 'Sorry — error code 500', documentRef); }
    finally { busy = false; input.focus?.(); }
  });

  on(patchUpdate, 'click', async () => {
    if (!patchUpdater || typeof patchUpdater.updateLatest !== 'function') { showSystemAlert('ไม่พบ trusted updater ของระบบ'); return; }
    patchUpdate.disabled = true;
    try {
      const result = await patchUpdater.updateLatest();
      if (result?.status === 'LATEST') showTransientNotice('เป็นเวอร์ชันล่าสุดแล้ว');
      else if (result?.status === 'ACTIVATED') showTransientNotice(`Patch ${result.current?.version ?? ''} ใช้งานแล้ว`);
    } catch (error) { showSystemAlert(`Patch ถูกปฏิเสธ: ${error.message}`); }
    finally { patchUpdate.disabled = false; }
  });
  on(patchImport, 'click', () => {
    if (patchUpdater?.openManualPicker) { patchUpdater.openManualPicker(); return; }
    const foundationFileInput = documentRef.getElementById('patch-file');
    if (!foundationFileInput) { showSystemAlert('ไม่พบช่องนำเข้า Patch ของระบบ'); return; }
    foundationFileInput.click();
  });
  on(patchRollback, 'click', () => {
    const foundationRollback = documentRef.getElementById('patch-rollback');
    if (!foundationRollback) { showSystemAlert('ไม่พบคำสั่ง Rollback ของระบบ'); return; }
    foundationRollback.click();
  });

  return async () => { if (noticeTimer) clearTimeout(noticeTimer); while (cleanups.length) cleanups.pop()(); };
}
