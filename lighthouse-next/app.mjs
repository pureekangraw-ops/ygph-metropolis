import { parseGeneralIncome } from './general-income.mjs';
import { parseStoreSale } from './store-sale.mjs';

const STORAGE_KEY = 'lighthouse-next-demo-v1';
const AMBIGUITY_LOCK = 'BABA';

const DEFAULT_PRODUCTS = Object.freeze([
  { id: 'phone', name: 'มือถือ', aliases: ['โทรศัพท์', 'โทสับ'], stock: 5 },
  { id: 'case', name: 'เคสมือถือ', aliases: ['เคส'], stock: 8 },
  { id: 'film', name: 'ฟิล์ม', aliases: ['ฟิล์มกันรอย'], stock: 12 },
]);

const DEFAULT_OBLIGATIONS = Object.freeze([
  {
    id: 'next-expense',
    title: 'ค่าใช้จ่ายก้อนถัดไป',
    amount: 3200,
    dueLabel: 'อีก 3 วัน',
    dailyTarget: 1100,
    status: 'OPEN',
  },
]);

const DEFAULT_STATE = Object.freeze({
  sessionUnlocked: false,
  activeRoot: 'home',
  chatHistory: [],
  pendingFlow: null,
  manualView: null,
  products: DEFAULT_PRODUCTS,
  obligations: DEFAULT_OBLIGATIONS,
  transactions: [],
  cash: 2450,
  expectedIncome: 700,
  todayIncome: 1250,
  todayExpense: 380,
});

const root = document.querySelector('#demo-root');
const pinScreen = root.querySelector('#pin-screen');
const appShell = root.querySelector('#app-shell');
const pinDots = [...root.querySelectorAll('.pin-dots span')];
const pinStatus = root.querySelector('#pin-status');
const homeDate = root.querySelector('#home-date');
const homeCashValue = root.querySelector('#home-cash-value');
const homeExpectedValue = root.querySelector('#home-expected-value');
const homeIncomeValue = root.querySelector('#home-income-value');
const homeExpenseValue = root.querySelector('#home-expense-value');
const homeNetValue = root.querySelector('#home-net-value');
const homeObligationTitle = root.querySelector('#home-obligation-title');
const homeObligationDue = root.querySelector('#home-obligation-due');
const homeObligationValue = root.querySelector('#home-obligation-value');
const homeGapValue = root.querySelector('#home-gap-value');
const homeTargetValue = root.querySelector('#home-target-value');
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
let pendingReversalSaleId = null;
let state = loadState();

function freshProducts() {
  return DEFAULT_PRODUCTS.map((product) => ({ ...product, aliases: [...product.aliases] }));
}

function freshObligations() {
  return DEFAULT_OBLIGATIONS.map((obligation) => ({ ...obligation }));
}

function cloneDefaults() {
  return {
    sessionUnlocked: DEFAULT_STATE.sessionUnlocked,
    activeRoot: DEFAULT_STATE.activeRoot,
    chatHistory: [],
    pendingFlow: null,
    manualView: null,
    products: freshProducts(),
    obligations: freshObligations(),
    transactions: [],
    cash: DEFAULT_STATE.cash,
    expectedIncome: DEFAULT_STATE.expectedIncome,
    todayIncome: DEFAULT_STATE.todayIncome,
    todayExpense: DEFAULT_STATE.todayExpense,
  };
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStoredProducts(products) {
  if (!Array.isArray(products)) return freshProducts();
  return freshProducts().map((baseline) => {
    const stored = products.find((product) => product?.id === baseline.id);
    const stock = Number(stored?.stock);
    return { ...baseline, stock: Number.isInteger(stock) && stock >= 0 ? stock : baseline.stock };
  });
}

function normalizeStoredObligations(obligations) {
  if (!Array.isArray(obligations)) return freshObligations();
  return freshObligations().map((baseline) => {
    const stored = obligations.find((obligation) => obligation?.id === baseline.id);
    if (!stored) return baseline;
    const amount = numberOr(stored.amount, baseline.amount);
    const dailyTarget = numberOr(stored.dailyTarget, baseline.dailyTarget);
    return {
      ...baseline,
      title: typeof stored.title === 'string' && stored.title.trim() ? stored.title.trim() : baseline.title,
      amount: amount >= 0 ? amount : baseline.amount,
      dueLabel: typeof stored.dueLabel === 'string' && stored.dueLabel.trim() ? stored.dueLabel.trim() : baseline.dueLabel,
      dailyTarget: dailyTarget >= 0 ? dailyTarget : baseline.dailyTarget,
      status: stored.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    };
  });
}

function normalizeStoredTransactions(transactions) {
  if (!Array.isArray(transactions)) return [];
  return transactions
    .filter((transaction) => transaction && transaction.id && transaction.type)
    .slice(-100)
    .map((transaction) => ({ ...transaction }));
}

function storeSaleStage(pending) {
  if (!Number.isFinite(Number(pending.value)) || Number(pending.value) <= 0) return 'STORE_SALE_VALUE';
  if (!Number.isInteger(Number(pending.quantity)) || Number(pending.quantity) <= 0) return 'STORE_SALE_QUANTITY';
  return 'CONFIRM_STORE_SALE';
}

function normalizeStoredPending(pending) {
  if (!pending || typeof pending !== 'object') return null;

  if (pending.kind === 'GENERAL_INCOME') {
    if (!Number.isFinite(Number(pending.amount)) || Number(pending.amount) <= 0) return null;
    const source = typeof pending.source === 'string' && pending.source.trim() ? pending.source.trim() : null;
    return {
      kind: 'GENERAL_INCOME',
      stage: source ? 'CONFIRM_GENERAL_INCOME' : 'GENERAL_INCOME_SOURCE',
      amount: Number(pending.amount),
      source,
    };
  }

  if (pending.kind === 'STORE_SALE' && pending.productId && pending.productName) {
    const normalized = {
      kind: 'STORE_SALE',
      stage: pending.stage,
      productId: String(pending.productId),
      productName: String(pending.productName),
      value: Number.isFinite(Number(pending.value)) && Number(pending.value) > 0 ? Number(pending.value) : null,
      quantity: Number.isInteger(Number(pending.quantity)) && Number(pending.quantity) > 0 ? Number(pending.quantity) : null,
    };
    normalized.stage = storeSaleStage(normalized);
    return normalized;
  }

  return null;
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
      products: normalizeStoredProducts(parsed.products),
      obligations: normalizeStoredObligations(parsed.obligations),
      transactions: normalizeStoredTransactions(parsed.transactions),
      cash: numberOr(parsed.cash, DEFAULT_STATE.cash),
      expectedIncome: numberOr(parsed.expectedIncome, DEFAULT_STATE.expectedIncome),
      todayIncome: numberOr(parsed.todayIncome, DEFAULT_STATE.todayIncome),
      todayExpense: numberOr(parsed.todayExpense, DEFAULT_STATE.todayExpense),
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
    products: state.products,
    obligations: state.obligations,
    transactions: state.transactions.slice(-100),
    cash: state.cash,
    expectedIncome: state.expectedIncome,
    todayIncome: state.todayIncome,
    todayExpense: state.todayExpense,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Demo remains usable in-memory when storage is unavailable.
  }
}

function formatBaht(value) {
  return `฿${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function financeSnapshot() {
  const nextObligation = state.obligations.find((obligation) => obligation.status === 'OPEN') || null;
  const net = state.todayIncome - state.todayExpense;
  return {
    cash: state.cash,
    expectedIncome: state.expectedIncome,
    todayIncome: state.todayIncome,
    todayExpense: state.todayExpense,
    net,
    nextObligation,
    gap: nextObligation ? Math.max(0, Number(nextObligation.amount || 0) - state.cash) : 0,
  };
}

function renderHomeTruth() {
  if (!homeCashValue || !homeIncomeValue || !homeExpenseValue || !homeNetValue) return;
  const snapshot = financeSnapshot();
  homeCashValue.textContent = formatBaht(snapshot.cash);
  if (homeExpectedValue) homeExpectedValue.textContent = formatBaht(snapshot.expectedIncome);
  homeIncomeValue.textContent = formatBaht(snapshot.todayIncome);
  homeExpenseValue.textContent = formatBaht(snapshot.todayExpense);
  homeNetValue.textContent = `${snapshot.net >= 0 ? '+' : '-'}${formatBaht(Math.abs(snapshot.net))}`;

  const obligation = snapshot.nextObligation;
  if (homeObligationTitle) homeObligationTitle.textContent = obligation?.title || 'ยังไม่มีภาระใกล้';
  if (homeObligationDue) homeObligationDue.textContent = obligation ? `ครบกำหนดใน${obligation.dueLabel}` : 'ยังไม่มีกำหนด';
  if (homeObligationValue) homeObligationValue.textContent = formatBaht(obligation?.amount || 0);
  if (homeGapValue) homeGapValue.textContent = formatBaht(snapshot.gap);
  if (homeTargetValue) homeTargetValue.textContent = obligation ? `หาเพิ่ม ${formatBaht(obligation.dailyTarget)}` : '—';
}

function resetDemoState() {
  state = cloneDefaults();
  pendingReversalSaleId = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  pinBuffer = '';
  renderPinDots();
  renderHomeTruth();
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
  renderHomeTruth();
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
  if (next === 'home') renderHomeTruth();
  if (next === 'chat') {
    ensureChatWelcome();
    renderChat();
    requestAnimationFrame(() => chatInput.focus({ preventScroll: true }));
  }
  if (next === 'manual') restoreManualView();
}

function addMessage(role, text, kind = role) {
  state.chatHistory.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text, kind });
  state.chatHistory = state.chatHistory.slice(-80);
  saveState();
}

function ensureChatWelcome() {
  if (state.chatHistory.length) return;
  addMessage('app', 'พิมพ์สิ่งที่ต้องการได้เลย\nรายรับทั่วไปใช้ “จำนวนเงิน + ที่มา” เช่น “ทิป 59”\nสินค้าที่รู้จักใช้ “สินค้า + มูลค่า + จำนวน” เช่น “ขายมือถือ 566 2”\nหรือถาม “วันนี้วันที่เท่าไร”');
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
  if (pending.stage === 'CONFIRM_GENERAL_INCOME' || pending.stage === 'CONFIRM_STORE_SALE') {
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
  if (pending.kind === 'GENERAL_INCOME') {
    if (pending.stage === 'GENERAL_INCOME_SOURCE') return `ยังรอที่มาของรายรับ ฿${pending.amount} อยู่`;
    return 'รายรับเดิมยังรอการยืนยันอยู่';
  }
  if (pending.kind === 'STORE_SALE') {
    if (pending.stage === 'STORE_SALE_VALUE') return `รายการ ${pending.productName} ยังรอมูลค่าอยู่`;
    if (pending.stage === 'STORE_SALE_QUANTITY') return `รายการ ${pending.productName} ยังรอจำนวนอยู่`;
    return `รายการขาย ${pending.productName} ยังรอการยืนยันอยู่`;
  }
  return 'ยังมีรายการเดิมค้างอยู่';
}

function resumeGeneralIncomePrompt(pending) {
  if (pending.stage === 'CONFIRM_GENERAL_INCOME' && pending.source) {
    addMessage('app', `${pending.amount} บาท จาก${pending.source} — บันทึกไหม?`);
  } else {
    pending.stage = 'GENERAL_INCOME_SOURCE';
    addMessage('app', `ข้อมูลที่รับแล้ว: เงิน ฿${pending.amount} ✓ · ที่มา —\nรบกวนบอกเพิ่ม: ที่มาของรายรับ`);
  }
}

function resumeStoreSalePrompt(pending) {
  pending.stage = storeSaleStage(pending);
  if (pending.stage === 'STORE_SALE_VALUE') {
    addMessage('app', `สินค้า ${pending.productName} ✓\nรบกวนบอกเพิ่ม: มูลค่าที่ขาย`);
    return;
  }
  if (pending.stage === 'STORE_SALE_QUANTITY') {
    addMessage('app', `${pending.productName} · ${pending.value} บาท ✓\nรบกวนบอกเพิ่ม: จำนวนสินค้า`);
    return;
  }
  addMessage('app', `${pending.productName} · ${pending.value} บาท · ${pending.quantity} ชิ้น — บันทึกไหม?`);
}

function resumePendingPrompt({ afterSideQuery = false } = {}) {
  const pending = state.pendingFlow;
  if (!pending) return;
  if (afterSideQuery) addMessage('app', pendingReminder(pending), 'note');

  if (pending.kind === 'STORE_SALE') resumeStoreSalePrompt(pending);
  else resumeGeneralIncomePrompt(pending);
  saveState();
}

function restorePending() {
  if (!state.pendingFlow) return;
  const last = state.chatHistory[state.chatHistory.length - 1];
  const reminder = pendingReminder(state.pendingFlow);
  const lastText = last?.text || '';
  const alreadyVisible = lastText.includes(reminder)
    || lastText.includes('รบกวนบอกเพิ่ม: ที่มาของรายรับ')
    || lastText.includes('รบกวนบอกเพิ่ม: มูลค่าที่ขาย')
    || lastText.includes('รบกวนบอกเพิ่ม: จำนวนสินค้า')
    || lastText.includes('— บันทึกไหม?');
  if (!alreadyVisible) {
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

function refreshTruthSurfaces() {
  renderHomeTruth();
  if (state.activeRoot === 'manual' && state.manualView) openManualTask(state.manualView);
}

function confirmGeneralIncome(pending) {
  state.pendingFlow = null;
  state.cash += pending.amount;
  state.todayIncome += pending.amount;
  state.transactions.push({
    id: `income-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'INCOME',
    status: 'ACTIVE',
    value: pending.amount,
    source: pending.source,
    createdAt: new Date().toISOString(),
  });
  addMessage('app', `บันทึกแล้ว ${pending.amount} บาท · ${pending.source}`);
  refreshTruthSurfaces();
}

function confirmStoreSale(pending) {
  const product = state.products.find((item) => item.id === pending.productId);
  if (!product) {
    state.pendingFlow = null;
    addMessage('app', 'ไม่พบสินค้านี้แล้ว — ยังไม่มีข้อมูลถูกเปลี่ยน');
    return;
  }
  if (pending.quantity > product.stock) {
    pending.quantity = null;
    pending.stage = 'STORE_SALE_QUANTITY';
    saveState();
    addMessage('app', `สินค้าไม่พอ — ${product.name} เหลือ ${product.stock} ชิ้น`);
    resumeStoreSalePrompt(pending);
    return;
  }

  product.stock -= pending.quantity;
  state.cash += pending.value;
  state.todayIncome += pending.value;
  state.transactions.push({
    id: `sale-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'SALE',
    status: 'ACTIVE',
    productId: product.id,
    productName: product.name,
    quantity: pending.quantity,
    value: pending.value,
    createdAt: new Date().toISOString(),
  });
  state.pendingFlow = null;
  addMessage('app', `บันทึกแล้ว ${product.name} · ${pending.value} บาท · ${pending.quantity} ชิ้น`);
  refreshTruthSurfaces();
}

function confirmPending() {
  const pending = state.pendingFlow;
  if (!pending) {
    addMessage('app', 'รายการยังไม่พร้อมยืนยัน');
    return;
  }
  if (pending.kind === 'GENERAL_INCOME' && pending.stage === 'CONFIRM_GENERAL_INCOME' && pending.source) {
    confirmGeneralIncome(pending);
    return;
  }
  if (pending.kind === 'STORE_SALE' && pending.stage === 'CONFIRM_STORE_SALE' && pending.value && pending.quantity) {
    confirmStoreSale(pending);
    return;
  }
  addMessage('app', 'รายการยังไม่พร้อมยืนยัน');
}

function editPending() {
  const pending = state.pendingFlow;
  if (!pending) return;
  if (pending.kind === 'STORE_SALE') {
    pending.value = null;
    pending.quantity = null;
    pending.stage = 'STORE_SALE_VALUE';
  } else {
    pending.source = null;
    pending.stage = 'GENERAL_INCOME_SOURCE';
  }
  saveState();
  resumePendingPrompt();
}

function normalizePendingSource(text) {
  const clean = String(text || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  return clean.replace(/^จาก\s*/u, '').trim();
}

function parsePositiveMoney(text) {
  const match = String(text || '').match(/(?:฿\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?:\s*บาท)?/u);
  if (!match) return null;
  const value = Number(match[1].replaceAll(',', ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parsePositiveQuantity(text) {
  const match = String(text || '').match(/([0-9][0-9,]*)/u);
  if (!match) return null;
  const value = Number(match[1].replaceAll(',', ''));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function handleStorePendingInput(pending, clean) {
  if (pending.stage === 'STORE_SALE_VALUE') {
    const value = parsePositiveMoney(clean);
    if (!value) {
      addMessage('app', 'รบกวนบอกเพิ่ม: มูลค่าที่ขาย');
      return;
    }
    pending.value = value;
    pending.stage = 'STORE_SALE_QUANTITY';
    saveState();
    resumeStoreSalePrompt(pending);
    return;
  }

  if (pending.stage === 'STORE_SALE_QUANTITY') {
    const quantity = parsePositiveQuantity(clean);
    if (!quantity) {
      addMessage('app', 'รบกวนบอกเพิ่ม: จำนวนสินค้า');
      return;
    }
    pending.quantity = quantity;
    pending.stage = 'CONFIRM_STORE_SALE';
    saveState();
    resumeStoreSalePrompt(pending);
    return;
  }

  addMessage('app', 'เลือก “ยืนยัน”, “แก้ไข” หรือ “ยกเลิก”');
}

function handleGeneralIncomePendingInput(pending, clean) {
  if (pending.stage === 'GENERAL_INCOME_SOURCE') {
    const source = normalizePendingSource(clean);
    if (!source || source.length > 80) {
      addMessage('app', 'รบกวนบอกเพิ่ม: ที่มาของรายรับ');
      return;
    }
    pending.source = source;
    pending.stage = 'CONFIRM_GENERAL_INCOME';
    saveState();
    resumeGeneralIncomePrompt(pending);
    return;
  }
  addMessage('app', 'เลือก “ยืนยัน”, “แก้ไข” หรือ “ยกเลิก”');
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

  if (pending.kind === 'STORE_SALE') handleStorePendingInput(pending, clean);
  else handleGeneralIncomePendingInput(pending, clean);
}

function beginStoreSale(parsed) {
  if (parsed.ambiguous) {
    const names = parsed.candidates.map((candidate) => candidate.productName).join(' / ');
    addMessage('app', `เจอสินค้าที่เป็นไปได้มากกว่าหนึ่งรายการ: ${names}\nรบกวนพิมพ์ชื่อสินค้าให้ชัดขึ้น`);
    return true;
  }

  state.pendingFlow = {
    kind: 'STORE_SALE',
    stage: 'STORE_SALE_VALUE',
    productId: parsed.productId,
    productName: parsed.productName,
    value: parsed.value,
    quantity: parsed.quantity,
  };
  state.pendingFlow.stage = storeSaleStage(state.pendingFlow);
  saveState();
  resumePendingPrompt();
  return true;
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

  const storeSale = parseStoreSale(clean, state.products);
  if (storeSale) {
    beginStoreSale(storeSale);
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

  addMessage('app', 'ตอนนี้สนามนี้รองรับรายรับทั่วไปแบบ “จำนวนเงิน + ที่มา”, การขายสินค้าที่รู้จักแบบ “สินค้า + มูลค่า + จำนวน” และคำถาม “วันนี้วันที่เท่าไร”');
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
    intro: 'เห็นเงินจริง การเคลื่อนไหว ภาระ และเป้าหมายในภาพเดียวกัน',
    rows: [],
  },
  store: {
    title: 'ร้านค้า',
    intro: 'สรุปการขายและสต็อกจากข้อมูลก้อนเดียวกับแชต',
    rows: [],
  },
  ride: {
    title: 'งานวิ่ง',
    intro: 'ดูรอบงาน รายได้ และค่าใช้จ่ายที่เกี่ยวกับการวิ่งโดยตรง',
    rows: [['สถานะวันนี้', 'ยังไม่เริ่มรอบ'], ['รายได้วันนี้', '฿0'], ['ค่าใช้จ่ายวันนี้', '฿0']],
  },
  calendar: {
    title: 'ปฏิทิน',
    intro: 'ดูสิ่งที่ต้องทำตามวัน โดยรายละเอียดอยู่ในบ้านเดียวกัน',
    rows: [],
  },
  ledger: {
    title: 'รายการทั้งหมด',
    intro: 'ย้อนดูรายการเดิมพร้อมหลักฐานการยกเลิก โดยไม่ลบทิ้ง',
    rows: [],
  },
};

function showManualHub() {
  state.manualView = null;
  manualHub.hidden = false;
  manualDetail.hidden = true;
  saveState();
}

function makeDetailHero(data) {
  const hero = document.createElement('div');
  hero.className = 'detail-hero';
  const title = document.createElement('h2');
  title.textContent = data.title;
  const intro = document.createElement('p');
  intro.textContent = data.intro;
  hero.append(title, intro);
  return hero;
}

function makeDetailRow(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  const left = document.createElement('span');
  left.textContent = label;
  const right = document.createElement('strong');
  right.textContent = value;
  row.append(left, right);
  return row;
}

function renderStaticDetail(data, rows = data.rows) {
  const list = document.createElement('div');
  list.className = 'detail-list';
  for (const [label, value] of rows) list.append(makeDetailRow(label, value));
  manualDetailContent.append(makeDetailHero(data), list);
}

function renderFinanceDetail() {
  const data = manualContent.finance;
  const snapshot = financeSnapshot();
  const obligation = snapshot.nextObligation;
  const rows = [
    ['เงินจริง', formatBaht(snapshot.cash)],
    ['คาดว่าจะเข้า', formatBaht(snapshot.expectedIncome)],
    ['เงินเข้าวันนี้', formatBaht(snapshot.todayIncome)],
    ['เงินออกวันนี้', formatBaht(snapshot.todayExpense)],
    ['สุทธิวันนี้', `${snapshot.net >= 0 ? '+' : '-'}${formatBaht(Math.abs(snapshot.net))}`],
  ];
  if (obligation) {
    rows.push(
      ['ภาระใกล้สุด', `${obligation.title} · ${formatBaht(obligation.amount)}`],
      ['ครบกำหนด', obligation.dueLabel],
      ['ยังขาด', formatBaht(snapshot.gap)],
      ['เป้าวันนี้', `หาเพิ่ม ${formatBaht(obligation.dailyTarget)}`],
    );
  } else {
    rows.push(['ภาระใกล้สุด', 'ยังไม่มีรายการ']);
  }
  renderStaticDetail(data, rows);
}

function renderStoreDetail() {
  const data = manualContent.store;
  const list = document.createElement('div');
  list.className = 'detail-list';
  const activeSales = state.transactions.filter((transaction) => transaction.type === 'SALE' && transaction.status === 'ACTIVE');
  const salesValue = activeSales.reduce((total, transaction) => total + Number(transaction.value || 0), 0);
  list.append(makeDetailRow('ยอดขายที่บันทึก', `${activeSales.length} รายการ · ${formatBaht(salesValue)}`));
  for (const product of state.products) {
    list.append(makeDetailRow(product.name, `เหลือ ${product.stock} ชิ้น`));
  }
  manualDetailContent.append(makeDetailHero(data), list);
}

function renderCalendarDetail() {
  const data = manualContent.calendar;
  const openObligations = state.obligations.filter((obligation) => obligation.status === 'OPEN');
  const rows = openObligations.length
    ? [
        ['ภาระที่กำลังมา', `${openObligations.length} รายการ`],
        ...openObligations.map((obligation) => [obligation.dueLabel, `${obligation.title} · ${formatBaht(obligation.amount)}`]),
      ]
    : [['กำหนดใกล้', 'ยังไม่มีรายการ']];
  renderStaticDetail(data, rows);
}

function transactionLabel(transaction) {
  if (transaction.type === 'SALE') return transaction.productName || 'ขายสินค้า';
  if (transaction.type === 'INCOME') return transaction.source || 'รายรับ';
  if (transaction.type === 'REVERSAL') return `ย้อนรายการ · ${transaction.productName || 'สินค้า'}`;
  return 'รายการ';
}

function transactionValue(transaction) {
  const raw = Number(transaction.value || 0);
  if (transaction.type === 'REVERSAL') return `-${formatBaht(Math.abs(raw))}`;
  return `+${formatBaht(Math.abs(raw))}`;
}

function renderHistoryDetail() {
  const data = manualContent.ledger;
  const list = document.createElement('div');
  list.className = 'detail-list history-list';
  const transactions = [...state.transactions].reverse();

  if (!transactions.length) {
    list.append(makeDetailRow('ประวัติ', 'ยังไม่มีรายการ'));
  }

  for (const transaction of transactions) {
    const row = document.createElement('div');
    row.className = 'detail-row history-row';
    const copy = document.createElement('span');
    copy.className = 'history-copy';
    const title = document.createElement('strong');
    title.textContent = transactionLabel(transaction);
    const detail = document.createElement('small');
    if (transaction.type === 'SALE') {
      detail.textContent = `${transaction.quantity} ชิ้น · ${transaction.status === 'CANCELLED' ? 'ยกเลิกแล้ว' : 'บันทึกแล้ว'}`;
    } else if (transaction.type === 'REVERSAL') {
      detail.textContent = 'คืนสต็อกและยอดเงินแล้ว';
    } else {
      detail.textContent = 'รายรับทั่วไป';
    }
    copy.append(title, detail);

    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const value = document.createElement('strong');
    value.textContent = transactionValue(transaction);
    actions.append(value);

    if (transaction.type === 'SALE' && transaction.status === 'ACTIVE') {
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'history-cancel';
      cancelButton.textContent = 'ยกเลิกรายการ';
      cancelButton.addEventListener('click', () => requestSaleReversal(transaction.id));
      actions.append(cancelButton);
    }

    row.append(copy, actions);
    list.append(row);
  }

  manualDetailContent.append(makeDetailHero(data), list);
}

function openManualTask(taskId) {
  const data = manualContent[taskId];
  if (!data) return;
  state.manualView = taskId;
  saveState();
  manualHub.hidden = true;
  manualDetail.hidden = false;
  manualDetailContent.replaceChildren();

  if (taskId === 'finance') {
    renderFinanceDetail();
    return;
  }
  if (taskId === 'store') {
    renderStoreDetail();
    return;
  }
  if (taskId === 'calendar') {
    renderCalendarDetail();
    return;
  }
  if (taskId === 'ledger') {
    renderHistoryDetail();
    return;
  }
  renderStaticDetail(data);
}

function restoreManualView() {
  if (state.manualView && manualContent[state.manualView]) openManualTask(state.manualView);
  else showManualHub();
}

function confirmSaleReversal(saleId) {
  const sale = state.transactions.find((transaction) => transaction.id === saleId && transaction.type === 'SALE');
  if (!sale || sale.status !== 'ACTIVE') return false;
  const alreadyReversed = state.transactions.some((transaction) => transaction.type === 'REVERSAL' && transaction.reversalOf === sale.id);
  if (alreadyReversed) return false;

  const product = state.products.find((item) => item.id === sale.productId);
  if (product) product.stock += Number(sale.quantity || 0);
  state.cash -= Number(sale.value || 0);
  state.todayIncome -= Number(sale.value || 0);
  sale.status = 'CANCELLED';
  sale.cancelledAt = new Date().toISOString();
  state.transactions.push({
    id: `reversal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'REVERSAL',
    status: 'ACTIVE',
    reversalOf: sale.id,
    productId: sale.productId,
    productName: sale.productName,
    quantity: sale.quantity,
    value: -Number(sale.value || 0),
    createdAt: new Date().toISOString(),
  });
  saveState();
  refreshTruthSurfaces();
  return true;
}

function ensureSaleReversalDialog() {
  let dialog = root.querySelector('#sale-reversal-dialog');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'sale-reversal-dialog';
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `
    <form method="dialog">
      <div class="dialog-beacon" aria-hidden="true">✦</div>
      <h2>ยกเลิกรายการ?</h2>
      <p>ยอดเงินและจำนวนสินค้าจะถูกย้อนกลับ และประวัติเดิมจะยังอยู่</p>
      <div class="dialog-actions">
        <button value="cancel" class="secondary-button">ยังไม่ยกเลิก</button>
        <button value="confirm" class="danger-button" data-confirm-sale-reversal>ยืนยันยกเลิกรายการ</button>
      </div>
    </form>`;

  dialog.querySelector('[data-confirm-sale-reversal]').addEventListener('click', () => {
    if (pendingReversalSaleId) confirmSaleReversal(pendingReversalSaleId);
    pendingReversalSaleId = null;
  });
  dialog.addEventListener('close', () => { pendingReversalSaleId = null; });
  root.append(dialog);
  return dialog;
}

function requestSaleReversal(saleId) {
  const sale = state.transactions.find((transaction) => transaction.id === saleId && transaction.type === 'SALE' && transaction.status === 'ACTIVE');
  if (!sale) return;
  pendingReversalSaleId = saleId;
  const dialog = ensureSaleReversalDialog();
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else if (window.confirm(`ยกเลิกรายการ ${sale.productName}?`)) {
    confirmSaleReversal(saleId);
    pendingReversalSaleId = null;
  }
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
renderHomeTruth();
restoreManualView();
renderPinDots();

if (state.sessionUnlocked) showApp();
else showPin();

// BABA = CHAT answers only supported local side queries, preserves deep pending,
// reminds the user that the original item is still waiting, and restores it after reload.
void AMBIGUITY_LOCK;
