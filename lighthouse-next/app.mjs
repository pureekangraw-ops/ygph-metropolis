import { parseGeneralIncome } from './general-income.mjs';

const STORAGE_KEY = 'lighthouse-next-demo-v1';
const AMBIGUITY_LOCK = 'BABA';

const DEFAULT_STATE = Object.freeze({
  sessionUnlocked: false,
  activeRoot: 'home',
  chatHistory: [],
  pendingFlow: null,
  manualView: null,
});

const root = document.querySelector('#demo-root');
const pinScreen = root.querySelector('#pin-screen');
const appShell = root.querySelector('#app-shell');
const pinDots = [...root.querySelectorAll('.pin-dots span')];
const pinStatus = root.querySelector('#pin-status');
const homeDate = root.querySelector('#home-date');
const pageKicker = root.querySelector('#page-kicker');
const chatThread = root.querySelector('#chat-thread');
const chatActions = root.querySelector('#chat-actions');
const chatForm = root.querySelector('#chat-form');
const chatInput = root.querySelector('#chat-input');
const manualHub = root.querySelector('#manual-hub');
const manualDetail = root.querySelector('#manual-detail');
const manualDetailContent = root.querySelector('#manual-detail-content');
const resetDialog = root.querySelector('#reset-dialog');

let pinBuffer = '';
let state = loadState();

function cloneDefaults() {
  return {
    sessionUnlocked: DEFAULT_STATE.sessionUnlocked,
    activeRoot: DEFAULT_STATE.activeRoot,
    chatHistory: [],
    pendingFlow: null,
    manualView: null,
  };
}

function normalizeStoredPending(pending) {
  if (!pending || typeof pending !== 'object') return null;
  if (pending.kind !== 'GENERAL_INCOME') return null;
  if (!Number.isFinite(Number(pending.amount)) || Number(pending.amount) <= 0) return null;

  const source = typeof pending.source === 'string' && pending.source.trim() ? pending.source.trim() : null;
  return {
    kind: 'GENERAL_INCOME',
    stage: source ? 'CONFIRM_GENERAL_INCOME' : 'GENERAL_INCOME_SOURCE',
    amount: Number(pending.amount),
    source,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaults(),
      ...parsed,
      chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory.slice(-80) : [],
      pendingFlow: normalizeStoredPending(parsed.pendingFlow),
    };
  } catch {
    return cloneDefaults();
  }
}

function saveState() {
  const snapshot = {
    sessionUnlocked: Boolean(state.sessionUnlocked),
    activeRoot: ['home', 'chat', 'manual', 'settings'].includes(state.activeRoot) ? state.activeRoot : 'home',
    chatHistory: state.chatHistory.slice(-80),
    pendingFlow: state.pendingFlow,
    manualView: state.manualView,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Demo remains usable in-memory when storage is unavailable.
  }
}

function resetDemoState() {
  state = cloneDefaults();
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  pinBuffer = '';
  renderPinDots();
  manualDetail.hidden = true;
  manualHub.hidden = false;
  showPin();
}

function formatThaiDate(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function showPin() {
  pinScreen.hidden = false;
  appShell.hidden = true;
  pinStatus.textContent = 'สนามทดสอบนี้ใช้ PIN 4 หลักใดก็ได้';
}

function showApp() {
  pinScreen.hidden = true;
  appShell.hidden = false;
  selectRoot(state.activeRoot || 'home');
  restorePending();
}

function unlockDemo() {
  state.sessionUnlocked = true;
  state.activeRoot = 'home';
  saveState();
  pinStatus.textContent = 'พร้อมแล้ว';
  window.setTimeout(showApp, 140);
}

function renderPinDots() {
  pinDots.forEach((dot, index) => dot.classList.toggle('filled', index < pinBuffer.length));
}

function pushPinDigit(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  renderPinDots();
  if (pinBuffer.length === 4) unlockDemo();
}

function popPinDigit() {
  pinBuffer = pinBuffer.slice(0, -1);
  renderPinDots();
}

function selectRoot(rootId) {
  const allowed = ['home', 'chat', 'manual', 'settings'];
  const next = allowed.includes(rootId) ? rootId : 'home';
  state.activeRoot = next;
  saveState();

  root.querySelectorAll('.app-page').forEach((page) => {
    const active = page.dataset.root === next;
    page.hidden = !active;
    page.classList.toggle('active', active);
  });
  root.querySelectorAll('.nav-item').forEach((button) => {
    const active = button.dataset.rootTarget === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });

  pageKicker.textContent = next === 'home' ? 'วันนี้' : next === 'chat' ? 'ภาษาคน' : next === 'manual' ? 'ทำงานตรง' : 'ดูแลแอป';
  if (next === 'chat') {
    ensureChatWelcome();
    renderChat();
    requestAnimationFrame(() => chatInput.focus({ preventScroll: true }));
  }
  if (next === 'manual' && !state.manualView) showManualHub();
}

function addMessage(role, text, kind = role) {
  state.chatHistory.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text, kind });
  state.chatHistory = state.chatHistory.slice(-80);
  saveState();
}

function ensureChatWelcome() {
  if (state.chatHistory.length) return;
  addMessage('app', 'พิมพ์สิ่งที่ต้องการได้เลย\nรายรับทั่วไปใช้แค่ “จำนวนเงิน + ที่มา” เช่น “ทิป 59” หรือ “ขายมือถือ 566”\nหรือถาม “วันนี้วันที่เท่าไร”');
}

function renderChat() {
  ensureChatWelcome();
  chatThread.replaceChildren();
  for (const message of state.chatHistory) {
    const bubble = document.createElement('div');
    bubble.className = `message ${message.kind === 'note' ? 'note' : message.role === 'user' ? 'user' : 'app'}`;
    bubble.textContent = message.text;
    chatThread.append(bubble);
  }
  renderChatActions();
  requestAnimationFrame(() => { chatThread.scrollTop = chatThread.scrollHeight; });
}

function setChatActions(labels = []) {
  chatActions.replaceChildren();
  for (const label of labels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-chip';
    button.textContent = label;
    button.addEventListener('click', () => submitChatText(label));
    chatActions.append(button);
  }
}

function renderChatActions() {
  const pending = state.pendingFlow;
  if (!pending) {
    setChatActions(['ทิป 59', 'ขายมือถือ 566', 'วันนี้วันที่เท่าไร']);
    return;
  }
  if (pending.stage === 'CONFIRM_GENERAL_INCOME') {
    setChatActions(['ยืนยัน', 'แก้ไข', 'ยกเลิก']);
    return;
  }
  setChatActions(['วันนี้วันที่เท่าไร', 'ยกเลิก']);
}

function answerLocalSideQuery(text) {
  const normalized = text.replace(/[?？]/g, '').trim();
  if (normalized !== 'วันนี้วันที่เท่าไร') return null;
  return `วันนี้ ${formatThaiDate(new Date())}`;
}

function pendingReminder(pending) {
  if (!pending) return '';
  if (pending.stage === 'GENERAL_INCOME_SOURCE') return `ยังรอที่มาของรายรับ ฿${pending.amount} อยู่`;
  if (pending.stage === 'CONFIRM_GENERAL_INCOME') return 'รายรับเดิมยังรอการยืนยันอยู่';
  return 'ยังมีรายการเดิมค้างอยู่';
}

function resumePendingPrompt({ afterSideQuery = false } = {}) {
  const pending = state.pendingFlow;
  if (!pending) return;
  if (afterSideQuery) addMessage('app', pendingReminder(pending), 'note');

  if (pending.stage === 'CONFIRM_GENERAL_INCOME' && pending.source) {
    addMessage('app', `ยืนยันรายรับ ฿${pending.amount} · ที่มา: ${pending.source}?`);
  } else {
    pending.stage = 'GENERAL_INCOME_SOURCE';
    addMessage('app', `ข้อมูลที่รับแล้ว: เงิน ฿${pending.amount} ✓ · ที่มา —\nรบกวนบอกเพิ่ม: ที่มาของรายรับ`);
  }
  saveState();
}

function restorePending() {
  if (!state.pendingFlow) return;
  const last = state.chatHistory[state.chatHistory.length - 1];
  const reminder = pendingReminder(state.pendingFlow);
  if (!last || (!last.text.includes(reminder) && !last.text.includes('รบกวนบอกเพิ่ม: ที่มาของรายรับ') && !last.text.includes('ยืนยันรายรับ'))) {
    addMessage('app', 'กลับมาแล้ว — รายการที่ค้างยังอยู่', 'note');
    resumePendingPrompt();
  }
  if (state.activeRoot === 'chat') renderChat();
}

function cancelPending() {
  state.pendingFlow = null;
  addMessage('app', 'ยกเลิกรายการที่ค้างแล้ว');
  saveState();
}

function confirmPending() {
  const pending = state.pendingFlow;
  if (!pending || pending.stage !== 'CONFIRM_GENERAL_INCOME' || !pending.source) {
    addMessage('app', 'รายการยังไม่พร้อมยืนยัน');
    return;
  }

  const summary = `เดโมบันทึก: รายรับ ฿${pending.amount} · ที่มา ${pending.source}`;
  state.pendingFlow = null;
  addMessage('app', `${summary}\nเป็นข้อมูลจำลองเท่านั้น ไม่มีข้อมูลจริงถูกเปลี่ยน`);
  saveState();
}

function editPending() {
  const pending = state.pendingFlow;
  if (!pending) return;
  pending.source = null;
  pending.stage = 'GENERAL_INCOME_SOURCE';
  saveState();
  resumePendingPrompt();
}

function normalizePendingSource(text) {
  const clean = String(text || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  return clean.replace(/^จาก\s*/u, '').trim();
}

function handlePendingInput(text) {
  const pending = state.pendingFlow;
  const clean = text.trim();

  if (clean === 'ยกเลิก') {
    cancelPending();
    return;
  }
  if (clean === 'ยืนยัน') {
    confirmPending();
    return;
  }
  if (clean === 'แก้ไข') {
    editPending();
    return;
  }

  if (pending.stage === 'GENERAL_INCOME_SOURCE') {
    const source = normalizePendingSource(clean);
    if (!source || source.length > 80) {
      addMessage('app', 'รบกวนบอกเพิ่ม: ที่มาของรายรับ');
      return;
    }
    pending.source = source;
    pending.stage = 'CONFIRM_GENERAL_INCOME';
    saveState();
    resumePendingPrompt();
    return;
  }

  addMessage('app', 'เลือก “ยืนยัน”, “แก้ไข” หรือ “ยกเลิก”');
}

function handleChatInput(text) {
  const clean = text.trim();
  if (!clean) return;

  const sideAnswer = answerLocalSideQuery(clean);
  if (sideAnswer) {
    addMessage('app', sideAnswer);
    if (state.pendingFlow) resumePendingPrompt({ afterSideQuery: true });
    return;
  }

  if (state.pendingFlow) {
    handlePendingInput(clean);
    return;
  }

  const parsed = parseGeneralIncome(clean);
  if (parsed) {
    state.pendingFlow = {
      kind: 'GENERAL_INCOME',
      stage: parsed.source ? 'CONFIRM_GENERAL_INCOME' : 'GENERAL_INCOME_SOURCE',
      amount: parsed.amount,
      source: parsed.source,
    };
    saveState();
    resumePendingPrompt();
    return;
  }

  addMessage('app', 'ตอนนี้สนามนี้รองรับรายรับทั่วไปแบบ “จำนวนเงิน + ที่มา” เช่น “ทิป 59” หรือ “ขายมือถือ 566” และคำถาม “วันนี้วันที่เท่าไร”');
}

function submitChatText(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  addMessage('user', clean);
  handleChatInput(clean);
  renderChat();
}

const manualContent = {
  finance: {
    title: 'การเงิน',
    intro: 'เห็นเงินจริงและการเคลื่อนไหววันนี้แบบไม่ปนเงินที่ยังไม่เกิดขึ้น',
    rows: [['เงินจริง', '฿2,450'], ['เงินเข้าวันนี้', '฿1,250'], ['เงินออกวันนี้', '฿380'], ['สุทธิวันนี้', '+฿870']],
  },
  obligations: {
    title: 'ภาระ',
    intro: 'เรียงสิ่งที่ต้องจัดการตามเวลาที่ใกล้และเงินที่ยังขาด',
    rows: [['ก้อนถัดไป', '฿3,200'], ['ครบกำหนด', 'อีก 3 วัน'], ['ยังขาด', '฿750']],
  },
  store: {
    title: 'ร้านค้า',
    intro: 'สรุปการขาย สต็อก และเงินค้างรับด้วยภาษางานจริง',
    rows: [['ขายวันนี้', '3 รายการ'], ['สต็อกที่ต้องดู', '2 รายการ'], ['เงินค้างรับ', '฿450']],
  },
  ride: {
    title: 'งานวิ่ง',
    intro: 'ดูรอบงาน รายได้ และค่าใช้จ่ายที่เกี่ยวกับการวิ่งโดยตรง',
    rows: [['สถานะวันนี้', 'ยังไม่เริ่มรอบ'], ['รายได้วันนี้', '฿0'], ['ค่าใช้จ่ายวันนี้', '฿0']],
  },
  calendar: {
    title: 'ปฏิทิน',
    intro: 'ดูสิ่งที่ต้องทำตามวัน โดยรายละเอียดอยู่ในบ้านเดียวกัน',
    rows: [['วันนี้', '1 รายการ'], ['อีก 3 วัน', 'ภาระ ฿3,200'], ['สัปดาห์นี้', '3 รายการ']],
  },
  ledger: {
    title: 'รายการทั้งหมด',
    intro: 'ย้อนดูหลักฐานเงินเข้าและเงินออกจากรายการเดียวกัน',
    rows: [['เงินเข้า', '+฿500'], ['ค่าเดินทาง', '-฿120'], ['อาหาร', '-฿80']],
  },
};

function showManualHub() {
  state.manualView = null;
  manualHub.hidden = false;
  manualDetail.hidden = true;
  saveState();
}

function openManualTask(taskId) {
  const data = manualContent[taskId];
  if (!data) return;
  state.manualView = taskId;
  saveState();
  manualHub.hidden = true;
  manualDetail.hidden = false;
  manualDetailContent.replaceChildren();

  const hero = document.createElement('div');
  hero.className = 'detail-hero';
  const title = document.createElement('h2');
  title.textContent = data.title;
  const intro = document.createElement('p');
  intro.textContent = data.intro;
  hero.append(title, intro);

  const list = document.createElement('div');
  list.className = 'detail-list';
  for (const [label, value] of data.rows) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    const left = document.createElement('span');
    left.textContent = label;
    const right = document.createElement('strong');
    right.textContent = value;
    row.append(left, right);
    list.append(row);
  }
  manualDetailContent.append(hero, list);
}

function restoreManualView() {
  if (state.manualView && manualContent[state.manualView]) openManualTask(state.manualView);
  else showManualHub();
}

root.querySelectorAll('[data-pin]').forEach((button) => {
  button.addEventListener('click', () => pushPinDigit(button.dataset.pin));
});
root.querySelector('#pin-backspace').addEventListener('click', popPinDigit);
root.querySelectorAll('[data-root-target]').forEach((button) => {
  button.addEventListener('click', () => selectRoot(button.dataset.rootTarget));
});
root.querySelectorAll('[data-task]').forEach((button) => {
  button.addEventListener('click', () => openManualTask(button.dataset.task));
});
root.querySelector('#manual-back').addEventListener('click', showManualHub);

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = chatInput.value;
  chatInput.value = '';
  submitChatText(value);
  chatInput.focus({ preventScroll: true });
});
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 118)}px`;
});
chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

root.querySelector('#reset-demo').addEventListener('click', () => {
  if (typeof resetDialog.showModal === 'function') resetDialog.showModal();
  else if (window.confirm('เริ่มสนามใหม่และล้างข้อมูลทดลอง?')) resetDemoState();
});
root.querySelector('#confirm-reset').addEventListener('click', () => {
  window.setTimeout(resetDemoState, 0);
});

homeDate.textContent = formatThaiDate(new Date());
restoreManualView();
renderPinDots();

if (state.sessionUnlocked) showApp();
else showPin();

// BABA = CHAT answers only supported local side queries, preserves deep pending,
// reminds the user that the original item is still waiting, and restores it after reload.
void AMBIGUITY_LOCK;
