function element(root, selector) {
  return root?.querySelector?.(selector) ?? null;
}

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
  return Number.isSafeInteger(amount) ? (amount / 100).toFixed(2) : '—';
}

function readyText(result) {
  const title = String(result?.preview?.title ?? 'รายการ').trim() || 'รายการ';
  return `พร้อมบันทึก ${title} ${baht(result?.preview?.amountSatang)} บาท · ต้องยืนยันผ่านระบบที่เชื่อถือได้ก่อนบันทึก`;
}

function successText(result) {
  const title = String(result?.readback?.title ?? 'รายการ').trim() || 'รายการ';
  return `บันทึกและอ่านกลับแล้ว · ${title} ${baht(result?.readback?.amountSatang)} บาท`;
}

function waitingText(result) {
  return String(result?.directive?.prompt ?? 'ต้องการข้อมูลเพิ่มก่อนทำรายการ');
}

export async function mount({ root, version, brain = null }) {
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
  const patchImport = element(root, '[data-patch-import]');
  const patchRollback = element(root, '[data-patch-rollback]');
  const transientNotice = element(root, '[data-transient-notice]');
  const systemAlert = element(root, '[data-system-alert]');
  const systemAlertCopy = element(root, '[data-system-alert-copy]');
  const systemAlertClose = element(root, '[data-system-alert-close]');

  if (!log || !form || !input || !settingsPanel) throw new Error('LIGHTHOUSE front door controls are missing');

  const cleanups = [];
  let noticeTimer = null;
  let pendingConfirm = null;
  let busy = false;

  const on = (node, type, listener) => {
    if (!node) return;
    node.addEventListener(type, listener);
    cleanups.push(() => node.removeEventListener(type, listener));
  };

  const showTransientNotice = (message) => {
    if (!transientNotice) return;
    if (noticeTimer) clearTimeout(noticeTimer);
    transientNotice.textContent = message;
    transientNotice.hidden = false;
    noticeTimer = setTimeout(() => {
      transientNotice.hidden = true;
      transientNotice.textContent = '';
      noticeTimer = null;
    }, 2400);
  };

  const showSystemAlert = (message) => {
    if (!systemAlert || !systemAlertCopy) return;
    systemAlertCopy.textContent = message;
    systemAlert.hidden = false;
  };

  const clearPendingConfirm = () => {
    if (pendingConfirm) pendingConfirm.remove();
    pendingConfirm = null;
  };

  const appendReady = (result) => {
    clearPendingConfirm();
    const bubble = appendMessage(log, 'lighthouse', readyText(result), documentRef);
    const confirm = documentRef.createElement('button');
    confirm.type = 'button';
    confirm.className = 'primary-button';
    confirm.dataset.brainConfirm = '';
    confirm.textContent = 'เปิดการยืนยัน';
    bubble.append(documentRef.createElement('br'), confirm);
    pendingConfirm = confirm;

    on(confirm, 'click', async () => {
      if (busy || confirm.disabled) return;
      busy = true;
      confirm.disabled = true;
      try {
        const executed = await brain.requestExecution();
        if (executed?.status === 'SUCCESS') {
          clearPendingConfirm();
          appendMessage(log, 'lighthouse', successText(executed), documentRef);
          showTransientNotice('บันทึกแล้ว');
          return;
        }
        if (executed?.status === 'CANCELLED') {
          appendMessage(log, 'lighthouse', 'ยกเลิกการบันทึกแล้ว · ยังไม่มีการเขียนข้อมูล', documentRef);
          confirm.disabled = false;
          return;
        }
        if (executed?.status === 'VERIFY' || executed?.status === 'ERROR' || executed?.status === 'LOCKED') {
          showSystemAlert(executed?.reason || 'ยังยืนยันผลการบันทึกไม่ได้');
          confirm.disabled = false;
          return;
        }
        appendMessage(log, 'lighthouse', executed?.reason || 'ยังดำเนินการไม่ได้', documentRef);
        confirm.disabled = false;
      } catch (error) {
        showSystemAlert(String(error?.message || error || 'ไม่สามารถบันทึกได้'));
        confirm.disabled = false;
      } finally {
        busy = false;
      }
    });
  };

  const renderBrainResult = (result) => {
    if (result?.status === 'READY') {
      appendReady(result);
      return;
    }
    clearPendingConfirm();
    if (result?.status === 'WAITING') {
      appendMessage(log, 'lighthouse', waitingText(result), documentRef);
      return;
    }
    if (result?.status === 'LOCKED') {
      showSystemAlert('LIGHTHOUSE ยังไม่ได้ปลดล็อกข้อมูลบนเครื่องนี้');
      return;
    }
    if (result?.status === 'ERROR' || result?.status === 'VERIFY') {
      showSystemAlert(result?.reason || 'LIGHTHOUSE ยังยืนยันผลไม่ได้');
      return;
    }
    appendMessage(log, 'lighthouse', result?.reason || 'ยังทำคำสั่งนี้ไม่ได้', documentRef);
  };

  on(systemAlertClose, 'click', () => {
    if (systemAlert) systemAlert.hidden = true;
  });

  on(settingsOpen, 'click', () => {
    settingsPanel.hidden = false;
  });
  on(settingsClose, 'click', () => {
    settingsPanel.hidden = true;
  });

  on(form, 'submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || busy) return;
    if (empty) empty.hidden = true;
    clearPendingConfirm();
    appendMessage(log, 'user', message, documentRef);
    input.value = '';

    if (!brain || typeof brain.send !== 'function' || typeof brain.requestExecution !== 'function') {
      appendMessage(
        log,
        'lighthouse',
        'ตอนนี้หน้าแชทพร้อมแล้ว แต่ระบบตีความยังไม่เชื่อมในเวอร์ชันนี้ จึงยังไม่มีการบันทึกหรือดำเนินการใด ๆ',
        documentRef,
      );
      return;
    }

    busy = true;
    try {
      const result = await brain.send(message);
      renderBrainResult(result);
    } catch (error) {
      showSystemAlert(String(error?.message || error || 'LIGHTHOUSE ทำงานไม่สำเร็จ'));
    } finally {
      busy = false;
    }
  });

  on(patchImport, 'click', () => {
    const foundationFileInput = documentRef.getElementById('patch-file');
    if (!foundationFileInput) {
      showSystemAlert('ไม่พบช่องนำเข้า Patch ของระบบ');
      return;
    }
    foundationFileInput.click();
  });

  on(patchRollback, 'click', () => {
    const foundationRollback = documentRef.getElementById('patch-rollback');
    if (!foundationRollback) {
      showSystemAlert('ไม่พบคำสั่ง Rollback ของระบบ');
      return;
    }
    foundationRollback.click();
  });

  return async () => {
    if (noticeTimer) clearTimeout(noticeTimer);
    clearPendingConfirm();
    while (cleanups.length) cleanups.pop()();
  };
}
