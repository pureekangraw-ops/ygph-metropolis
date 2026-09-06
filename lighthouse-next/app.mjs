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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaults(),
      ...parsed,
      chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory.slice(-80) : [],
      pendingFlow: parsed.pendingFlow && typeof parsed.pendingFlow === 'object' ? parsed.pendingFlow : null,
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
  addMessage('app', 'พิมพ์สิ่งที่ต้องการได้เลย\nลองกรอกทีเดียว เช่น “วันนี้ได้ 500 จากร้าน ขายสบู่ 3 อัน” หรือถาม “วันนี้วันที่เท่าไร”');
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
    setChatActions(['วันนี้ได้ 500', 'วันนี้วันที่เท่าไร']);
    return;
  }
  if (pending.stage === 'SOURCE') setChatActions(['ร้าน', 'วิ่ง', 'อย่างอื่น']);
  else if (pending.stage === 'STORE_OP') setChatActions(['ขายสินค้า', 'เงินเข้าร้านอย่างอื่น']);
  else if (pending.stage === 'CONFIRM_SALE' || pending.stage === 'CONFIRM_STORE_INCOME' || pending.stage === 'CONFIRM_GENERIC_INCOME') setChatActions(['ยืนยัน', 'แก้ไข', 'ยกเลิก']);
  else setChatActions(['วันนี้วันที่เท่าไร', 'ยกเลิก']);
}

function answerLocalSideQuery(text) {
  const normalized = text.replace(/[?？]/g, '').trim();
  if (normalized !== 'วันนี้วันที่เท่าไร') return null;
  return `วันนี้ ${formatThaiDate(new Date())}`;
}

function pendingReminder(pending) {
  if (!pending) return '';
  if (pending.stage === 'SALE_QTY' && pending.product) return `ยังรอจำนวนของ ${pending.product} อยู่`;
  if (pending.stage === 'SALE_PRODUCT') return 'ยังรอชื่อสินค้าที่ขายอยู่';
  if (pending.stage === 'STORE_OP') return `รายการเงินเข้า ฿${pending.amount} ยังรอว่ามาจากการขายสินค้าหรืออย่างอื่น`;
  if (pending.stage === 'SOURCE') return `รายการเงินเข้า ฿${pending.amount} ยังรอที่มาอยู่`;
  if (pending.stage.startsWith('CONFIRM')) return 'รายการเดิมยังรอการยืนยันอยู่';
  return 'ยังมีรายการเดิมค้างอยู่';
}

function sourceLabel(pending) {
  if (pending.source === 'STORE') return 'ร้าน ✓';
  if (pending.source === 'RIDE') return 'วิ่ง ✓';
  if (pending.source === 'OTHER') return 'อย่างอื่น ✓';
  return '—';
}

function productLabel(pending) {
  if (pending.source && pending.source !== 'STORE') return 'ไม่ต้องกรอก';
  if (pending.operation === 'STORE_INCOME') return 'ไม่ต้องกรอก';
  return pending.product ? `${pending.product} ✓` : '—';
}

function quantityLabel(pending) {
  if (pending.source && pending.source !== 'STORE') return 'ไม่ต้องกรอก';
  if (pending.operation === 'STORE_INCOME') return 'ไม่ต้องกรอก';
  return pending.quantity ? `${pending.quantity} ✓` : '—';
}

function missingIncomeFields(pending) {
  if (!pending.source) return ['ได้เงินจากไหน', 'ถ้าจากร้าน: ขายอะไร', 'จำนวนกี่อัน'];
  if (pending.source !== 'STORE') return [];
  if (!pending.operation) return ['ขายสินค้าหรือเงินเข้าร้านอย่างอื่น', 'ถ้าขายสินค้า: ขายอะไร', 'จำนวนกี่อัน'];
  if (pending.operation === 'STORE_INCOME') return [];

  const fields = [];
  if (!pending.product) fields.push('ขายอะไร');
  if (!pending.quantity) fields.push('จำนวนกี่อัน');
  return fields;
}

function deriveIncomeStage(pending) {
  if (!pending.source) return 'SOURCE';
  if (pending.source !== 'STORE') return 'CONFIRM_GENERIC_INCOME';
  if (!pending.operation) return 'STORE_OP';
  if (pending.operation === 'STORE_INCOME') return 'CONFIRM_STORE_INCOME';
  if (!pending.product) return 'SALE_PRODUCT';
  if (!pending.quantity) return 'SALE_QTY';
  return 'CONFIRM_SALE';
}

function parseIncomeDetails(text) {
  const clean = String(text || '').replace(/[“”"]/g, '').trim();
  const details = { source: null, operation: null, product: null, quantity: null };

  if (/เงินเข้าร้านอย่างอื่น/.test(clean)) {
    details.source = 'STORE';
    details.operation = 'STORE_INCOME';
  } else if (/(?:จาก)?ร้าน|ขายสินค้า|ขาย/.test(clean)) {
    details.source = 'STORE';
  } else if (/(?:จาก)?วิ่ง|Lalamove|ลาล่า/i.test(clean)) {
    details.source = 'RIDE';
  } else if (/อย่างอื่น|อื่นๆ/.test(clean)) {
    details.source = 'OTHER';
  }

  if (details.source === 'STORE' && details.operation !== 'STORE_INCOME' && /ขาย/.test(clean)) {
    details.operation = 'SALE';
  }

  const quantityMatch = clean.match(/([0-9][0-9,]*)\s*(?:อัน|ชิ้น)/);
  if (quantityMatch) {
    const quantity = Number(quantityMatch[1].replaceAll(',', ''));
    if (Number.isInteger(quantity) && quantity > 0 && quantity <= 9999) details.quantity = quantity;
  }

  const productMatch = clean.match(/ขาย(?:สินค้า)?\s*([^0-9\n]+?)(?=\s+[0-9][0-9,]*\s*(?:อัน|ชิ้น)(?:\s|$)|$)/);
  if (productMatch) {
    const product = productMatch[1].trim().replace(/[,.]+$/g, '').trim();
    if (product && product.length <= 40 && product !== 'สินค้า') details.product = product;
  }

  return details;
}

function applyIncomeDetails(pending, details) {
  if (!pending || !details) return;

  if (details.source && details.source !== pending.source) {
    pending.source = details.source;
    if (details.source !== 'STORE') {
      pending.operation = null;
      pending.product = null;
      pending.quantity = null;
    }
  }
  if (details.operation) pending.operation = details.operation;
  if (details.product) pending.product = details.product;
  if (details.quantity) pending.quantity = details.quantity;

  pending.stage = deriveIncomeStage(pending);
  saveState();
}

function incomeProgressPrompt(pending) {
  const missing = missingIncomeFields(pending);
  const progress = `ข้อมูลที่รับแล้ว: เงิน ฿${pending.amount} ✓ · ที่มา ${sourceLabel(pending)} · สินค้า ${productLabel(pending)} · จำนวน ${quantityLabel(pending)}`;
  if (!missing.length) return progress;
  return `${progress}\nบอกเพิ่มได้เลย: ${missing.join(' · ')}\nพิมพ์รวมกันได้ เช่น “จากร้าน ขายสบู่ 3 อัน”`;
}

function resumePendingPrompt({ afterSideQuery = false } = {}) {
  const pending = state.pendingFlow;
  if (!pending) return;
  if (afterSideQuery) addMessage('app', pendingReminder(pending), 'note');

  pending.stage = deriveIncomeStage(pending);
  if (pending.stage === 'CONFIRM_SALE') addMessage('app', `ยืนยันขาย ${pending.product} × ${pending.quantity} รวมเงินเข้า ฿${pending.amount}?`);
  else if (pending.stage === 'CONFIRM_STORE_INCOME') addMessage('app', `ยืนยันเงินเข้าร้าน ฿${pending.amount}?`);
  else if (pending.stage === 'CONFIRM_GENERIC_INCOME') addMessage('app', `ยืนยันเงินเข้า ฿${pending.amount}?`);
  else addMessage('app', incomeProgressPrompt(pending));
  saveState();
}

function restorePending() {
  if (!state.pendingFlow) return;
  const last = state.chatHistory[state.chatHistory.length - 1];
  const reminder = pendingReminder(state.pendingFlow);
  if (!last || (!last.text.includes(reminder) && !last.text.includes('บอกเพิ่มได้เลย') && !last.text.includes('ข้อมูลที่รับแล้ว') && !last.text.includes('ยืนยัน'))) {
    addMessage('app', 'กลับมาแล้ว — รายการที่ค้างยังอยู่', 'note');
    resumePendingPrompt();
  }
  if (state.activeRoot === 'chat') renderChat();
}

function parseIncomeAmount(text) {
  const match = text.match(/(?:วันนี้ได้|ได้เงิน|เงินเข้า)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1].replaceAll(',', ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function cancelPending() {
  state.pendingFlow = null;
  addMessage('app', 'ยกเลิกรายการที่ค้างแล้ว');
  saveState();
}

function confirmPending() {
  const pending = state.pendingFlow;
  if (!pending) return;
  if (!pending.stage.startsWith('CONFIRM')) {
    addMessage('app', 'รายการยังไม่พร้อมยืนยัน');
    return;
  }
  const summary = pending.stage === 'CONFIRM_SALE'
    ? `เดโมบันทึก: ขาย ${pending.product} × ${pending.quantity} · เงินเข้า ฿${pending.amount}`
    : `เดโมบันทึก: เงินเข้า ฿${pending.amount}`;
  state.pendingFlow = null;
  addMessage('app', `${summary}\nเป็นข้อมูลจำลองเท่านั้น ไม่มีข้อมูลจริงถูกเปลี่ยน`);
  saveState();
}

function editPending() {
  const pending = state.pendingFlow;
  if (!pending) return;
  if (pending.stage === 'CONFIRM_SALE') {
    pending.quantity = null;
  } else {
    pending.source = null;
    pending.operation = null;
    pending.product = null;
    pending.quantity = null;
  }
  pending.stage = deriveIncomeStage(pending);
  saveState();
  resumePendingPrompt();
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

  const details = parseIncomeDetails(clean);
  if (details.source || details.operation || details.product || details.quantity) {
    applyIncomeDetails(pending, details);
    resumePendingPrompt();
    return;
  }

  if (pending.stage === 'SOURCE') {
    addMessage('app', incomeProgressPrompt(pending));
    return;
  }

  if (pending.stage === 'STORE_OP') {
    addMessage('app', incomeProgressPrompt(pending));
    return;
  }

  if (pending.stage === 'SALE_PRODUCT') {
    if (clean.length < 1 || clean.length > 40) {
      addMessage('app', 'พิมพ์ชื่อสินค้าแบบสั้น ๆ ได้เลย');
      return;
    }
    pending.product = clean;
    pending.stage = deriveIncomeStage(pending);
    saveState();
    resumePendingPrompt();
    return;
  }

  if (pending.stage === 'SALE_QTY') {
    const quantity = Number(clean.replaceAll(',', ''));
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 9999) {
      addMessage('app', 'จำนวนต้องเป็นเลขเต็มมากกว่า 0');
      return;
    }
    pending.quantity = quantity;
    pending.stage = deriveIncomeStage(pending);
    saveState();
    resumePendingPrompt();
    return;
  }

  if (pending.stage.startsWith('CONFIRM')) {
    addMessage('app', 'เลือก “ยืนยัน”, “แก้ไข” หรือ “ยกเลิก”');
  }
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

  const amount = parseIncomeAmount(clean);
  if (amount) {
    state.pendingFlow = {
      kind: 'INCOME',
      stage: 'SOURCE',
      amount,
      source: null,
      operation: null,
      product: null,
      quantity: null,
    };
    applyIncomeDetails(state.pendingFlow, parseIncomeDetails(clean));
    resumePendingPrompt();
    return;
  }

  addMessage('app', 'ตอนนี้สนามนี้รองรับการลอง “วันนี้ได้ 500 จากร้าน ขายสบู่ 3 อัน” และ “วันนี้วันที่เท่าไร” ก่อน เพื่อทดสอบ flow ที่ล็อกไว้');
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
