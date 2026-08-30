function element(root, selector) {
  return root?.querySelector?.(selector) ?? null;
}

function appendMessage(log, role, text, documentRef) {
  const node = documentRef.createElement('div');
  node.className = `message ${role === 'user' ? 'message-user' : 'message-lighthouse'}`;
  node.textContent = text;
  log.append(node);
  log.scrollTop = log.scrollHeight;
}

export function disconnectedReply() {
  return 'ตอนนี้หน้าแชทพร้อมแล้ว แต่ระบบตีความยังไม่เชื่อมในเวอร์ชันนี้ จึงยังไม่มีการบันทึกหรือดำเนินการใด ๆ';
}

export async function mount({ root, version }) {
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

  on(systemAlertClose, 'click', () => {
    if (systemAlert) systemAlert.hidden = true;
  });

  on(settingsOpen, 'click', () => {
    settingsPanel.hidden = false;
  });
  on(settingsClose, 'click', () => {
    settingsPanel.hidden = true;
  });

  on(form, 'submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (empty) empty.hidden = true;
    appendMessage(log, 'user', text, documentRef);
    input.value = '';
    appendMessage(log, 'lighthouse', disconnectedReply(), documentRef);
  });

  const foundationFileInput = documentRef.getElementById?.('patch-file');
  const foundationRollback = documentRef.getElementById?.('patch-rollback');
  const foundationStatus = documentRef.getElementById?.('patch-status');

  on(patchImport, 'click', () => {
    if (!foundationFileInput) {
      showSystemAlert('ไม่พบช่องนำเข้า Patch ของระบบฐาน');
      return;
    }
    foundationFileInput.click();
  });

  on(patchRollback, 'click', () => {
    if (!foundationRollback) {
      showSystemAlert('ไม่พบคำสั่ง Rollback ของระบบฐาน');
      return;
    }
    foundationRollback.click();
  });

  const mirrorFoundationStatus = () => {
    const message = foundationStatus?.textContent?.trim() ?? '';
    if (!message) return;
    if (/ถูกปฏิเสธ|ไม่สำเร็จ|เริ่มไม่สำเร็จ/u.test(message)) {
      showSystemAlert(message);
      return;
    }
    if (/ใช้งานแล้ว|ย้อนกลับเป็น/u.test(message)) showTransientNotice(message);
  };

  if (foundationStatus && typeof globalThis.MutationObserver === 'function') {
    const observer = new globalThis.MutationObserver(mirrorFoundationStatus);
    observer.observe(foundationStatus, { childList: true, characterData: true, subtree: true });
    cleanups.push(() => observer.disconnect());
  }

  return async () => {
    if (noticeTimer) clearTimeout(noticeTimer);
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  };
}
