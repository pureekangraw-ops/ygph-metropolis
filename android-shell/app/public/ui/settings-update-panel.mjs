const STATE_VIEW = Object.freeze({
  CHECKING:{ message:'กำลังตรวจหาอัปเดต', actions:[] },
  AVAILABLE:{ message:'พบรุ่นใหม่', actions:[['download','ดาวน์โหลดและติดตั้ง']] },
  DOWNLOADING:{ message:'กำลังดาวน์โหลด', actions:[['pause','หยุดชั่วคราว'],['cancel','ยกเลิก']] },
  PAUSED:{ message:'หยุดชั่วคราว', actions:[['resume','ดาวน์โหลดต่อ'],['cancel','ยกเลิก']] },
  RETRYING:{ message:'การเชื่อมต่อขาด กำลังลองใหม่', actions:[['cancel','ยกเลิก']] },
  VERIFYING:{ message:'กำลังตรวจความถูกต้อง', actions:[['cancel','ยกเลิก']] },
  READY_TO_INSTALL:{ message:'APK พร้อมติดตั้ง', actions:[['install','เปิดหน้าติดตั้ง']] },
  PERMISSION_REQUIRED:{ message:'ต้องอนุญาตการติดตั้งจาก LIGHTHOUSE', actions:[['permission','เปิดสิทธิ์']] },
  WAITING_ANDROID_CONFIRMATION:{ message:'รอการยืนยันจาก Android', actions:[] },
  READBACK:{ message:'กำลังตรวจรุ่นที่ติดตั้ง', actions:[] },
  DONE:{ message:'อัปเดตเรียบร้อย', actions:[['close','ปิด']] },
  FAILED:{ message:'อัปเดตไม่สำเร็จ', actions:[['retry','ลองใหม่'],['cancel','ยกเลิก']] },
});

function viewFor(state) {
  const value = STATE_VIEW[String(state || '').toUpperCase()];
  if (!value) throw new Error(`UPDATE_PANEL_UNKNOWN_STATE:${state}`);
  return value;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function decimal(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    minimumFractionDigits:0,
    useGrouping:false,
  }).format(value);
}

function megabytes(bytes) {
  const value = finiteNumber(bytes);
  return value == null || value < 0 ? null : `${decimal(value / 1_000_000)} MB`;
}

function transferDetail(snapshot) {
  const downloaded = megabytes(snapshot.bytesDownloaded) || '0 MB';
  const total = megabytes(snapshot.totalBytes);
  const speedValue = finiteNumber(snapshot.speedBps);
  const speed = speedValue != null && speedValue >= 0 ? `${decimal(speedValue / 1_000_000)} MB/s` : null;
  const percentValue = finiteNumber(snapshot.percent);
  const percent = total && percentValue != null ? `${decimal(percentValue)}%` : null;
  const parts = [];
  if (total) parts.push(`${downloaded} / ${total}`);
  else parts.push(`ดาวน์โหลดแล้ว ${downloaded}`);
  if (speed) parts.push(speed);
  if (percent) parts.push(percent);
  return { text:parts.join(' · '), percentValue:percent ? percentValue : null };
}

export function createSettingsUpdatePanel({ document, onAction = () => {} } = {}) {
  if (!document?.createElement) throw new TypeError('UPDATE_PANEL_DOCUMENT_REQUIRED');
  if (typeof onAction !== 'function') throw new TypeError('UPDATE_PANEL_ACTION_HANDLER_REQUIRED');

  const element = document.createElement('section');
  element.className = 'settings-update-panel';
  element.setAttribute('aria-live', 'polite');

  const status = document.createElement('h3');
  status.dataset.role = 'update-status';
  const progress = document.createElement('progress');
  progress.dataset.role = 'update-progress';
  progress.max = 100;
  progress.hidden = true;
  const detail = document.createElement('p');
  detail.dataset.role = 'update-detail';
  const actions = document.createElement('div');
  actions.dataset.role = 'update-actions';
  element.append(status, progress, detail, actions);

  function render(snapshot = {}) {
    const state = String(snapshot.state || '').toUpperCase();
    const view = viewFor(state);
    element.dataset.state = state;
    status.textContent = view.message;

    progress.hidden = state !== 'DOWNLOADING';
    progress.removeAttribute('value');
    progress.removeAttribute('aria-valuetext');
    if (state === 'DOWNLOADING') {
      const transfer = transferDetail(snapshot);
      detail.textContent = transfer.text;
      progress.setAttribute('aria-valuetext', transfer.text);
      if (transfer.percentValue != null) {
        const boundedPercent = Math.min(100, Math.max(0, transfer.percentValue));
        progress.value = boundedPercent;
      }
    } else {
      detail.textContent = state === 'FAILED' && snapshot.error ? String(snapshot.error) : '';
    }

    actions.replaceChildren();
    for (const [action, label] of view.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = action;
      button.textContent = label;
      button.addEventListener('click', () => onAction(action, snapshot));
      actions.append(button);
    }
    return element;
  }

  return Object.freeze({ element, render });
}
