import {
  RELEASE_VERSION,
  createDefaultState,
  dateKey,
  formatSatang,
  ledgerBalanceSatang,
  parseBahtToSatang,
} from './core.js';
import { createAppController } from './controller.js';
import {
  exportLocalBackup,
  hasLegacyVault,
  importLocalBackup,
  loadLocalState,
  migrateLegacyVault,
  openVaultStore,
  saveNewLocalState,
} from './vault.js';
import { buildDashboardModel, escapeHtml, renderLauncher } from './ui-model.js';

const $ = selector => document.querySelector(selector);
const gate = $('#gate');
const app = $('#app');
const toast = $('#toast');
const setupScreen = $('#setupScreen');
const migrationScreen = $('#migrationScreen');
const restoreScreen = $('#restoreScreen');

let store;
let controller;
let route = 'home';
let restoreReturn = 'setup';
let toastTimer;
let appEventsBound = false;

function showOnly(screen) {
  for (const node of [setupScreen, migrationScreen, restoreScreen]) node.classList.toggle('hidden', node !== screen);
  gate.classList.remove('hidden');
  app.classList.add('hidden');
}

function notify(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

function money(value) {
  return `${formatSatang(Number(value || 0))} บาท`;
}

function newest(items) {
  return [...items].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function actionForm(command, fields, submitLabel) {
  return `<form class="form-grid" data-command-form="${command}">${fields}<button class="primary wide" type="submit">${submitLabel}</button></form>`;
}

function field(label, name, type = 'text', attrs = '', required = true) {
  return `<label>${label}<input name="${name}" type="${type}" ${attrs} ${required ? 'required' : ''}></label>`;
}

function selectField(label, name, options) {
  return `<label>${label}<select name="${name}">${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select></label>`;
}

function empty(text = 'ยังไม่มีรายการ') {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function shell() {
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand__logo">Y</div>
        <div><strong>YGPH METROPOLIS</strong><small id="routeLabel">Four Apps. One Flow.</small></div>
      </div>
      <div class="top-actions">
        <button class="icon-btn" id="themeBtn" type="button" aria-label="เปลี่ยนธีม">◐</button>
      </div>
    </header>
    <main class="content" id="content"></main>
    <nav class="bottom-nav" aria-label="เมนูหลัก">
      <button class="nav-btn" data-route="home"><span>⌂</span>หน้ารวม</button>
      <button class="nav-btn" data-route="reports"><span>▥</span>รายงาน</button>
      <button class="nav-btn" data-route="calendar"><span>◫</span>ปฏิทิน</button>
      <button class="nav-btn" data-route="settings"><span>⚙</span>ตั้งค่า</button>
    </nav>`;
}

function renderHome(state) {
  const model = buildDashboardModel(state);
  return `
    <section class="hero">
      <p class="eyebrow" style="color:white">YGPH METROPOLIS</p>
      <h1>วันนี้จะจัดการอะไร</h1>
      <p>แยกเป็นแอป เชื่อมเป็นระบบ</p>
      <div class="status-row"><span class="pill"><span class="dot"></span><span id="networkText">พร้อมใช้งาน</span></span><span class="pill">Schema ${state.schema}</span><span class="pill">Revision ${state.revision}</span></div>
    </section>
    ${renderLauncher({
      storeToday: money(model.storeTodaySatang),
      rideToday: money(model.rideTodaySatang),
      ledgerBalance: money(model.ledgerBalanceSatang),
      pendingCount: model.pendingCount,
    })}`;
}

function renderStore(state) {
  const recent = newest([...state.store.sales.map(x => ({ ...x, kind: 'ขาย' })), ...state.store.purchases.map(x => ({ ...x, kind: 'ซื้อ' })), ...state.store.withdrawals.map(x => ({ ...x, kind: 'เบิก' }))]).slice(0, 8);
  return `
    <div class="page-head"><div><h1>STORE · ร้านค้า</h1><p class="muted">ยอดขาย สินค้าเข้า และสต็อก</p></div><button class="secondary small" data-route="home">กลับหน้ารวม</button></div>
    <section class="stats"><div class="stat"><small>สินค้าในสต็อก</small><strong>${state.store.stockQty}</strong></div><div class="stat"><small>มูลค่าสต็อก</small><strong>${money(state.store.stockValueSatang)}</strong></div><div class="stat"><small>ยอดขายทั้งหมด</small><strong>${money(state.store.sales.reduce((s,x)=>s+Number(x.totalSatang||0),0))}</strong></div></section>
    <div class="panel-grid">
      <section class="panel"><h2>รับสินค้าเข้า</h2>${actionForm('STORE_PURCHASE', field('ชื่อรายการ','name') + field('จำนวน','qty','number','min="1" step="1"') + field('ยอดซื้อ (บาท)','amount','text','inputmode="decimal"'), 'บันทึกสินค้าเข้า')}</section>
      <section class="panel"><h2>ขายสินค้า</h2>${actionForm('STORE_SALE', field('ชื่อรายการ','name') + field('จำนวน','qty','number','min="1" step="1"') + field('ยอดขาย (บาท)','amount','text','inputmode="decimal"') + selectField('การรับเงิน','paymentMode',[['CASH','เงินสด'],['CREDIT','เครดิต']]) + field('วันติดตามเครดิต','due','date','', false), 'บันทึกการขาย')}</section>
      <section class="panel"><h2>เบิกสินค้า</h2>${actionForm('STORE_WITHDRAW', field('จำนวน','qty','number','min="1" step="1"') + field('หมายเหตุ','note'), 'บันทึกการเบิก')}</section>
      <section class="panel"><h2>รายการล่าสุด</h2><div class="list">${recent.length ? recent.map(item => `<div class="list-item"><div class="list-item__main"><strong>${escapeHtml(item.kind)} · ${escapeHtml(item.name || item.note || '-')}</strong><small>${escapeHtml(item.date || dateKey(item.createdAt))}</small></div><span class="badge">${item.qty || ''}</span></div>`).join('') : empty()}</div></section>
    </div>`;
}

function renderRide(state) {
  const jobs = newest(state.ride.jobs).slice(0, 8);
  return `
    <div class="page-head"><div><h1>RIDE · วิ่งงาน</h1><p class="muted">บันทึกงาน เงินสด เครดิต และค่าใช้จ่าย</p></div><button class="secondary small" data-route="home">กลับหน้ารวม</button></div>
    <section class="stats"><div class="stat"><small>รอบปัจจุบัน</small><strong>${state.ride.currentRound ? 'กำลังวิ่ง' : 'ยังไม่เปิด'}</strong></div><div class="stat"><small>เครดิตรอเบิก</small><strong>${money(state.ride.creditBalanceSatang)}</strong></div><div class="stat"><small>จำนวนงาน</small><strong>${state.ride.jobs.length}</strong></div></section>
    <section class="panel"><h2>ควบคุมรอบ</h2><div class="actions">${state.ride.currentRound ? '<button class="danger" data-command="RIDE_ROUND_CLOSE">ปิดรอบงาน</button>' : '<button class="primary" data-command="RIDE_ROUND_START">เริ่มรอบงาน</button>'}</div></section>
    <div class="panel-grid">
      <section class="panel"><h2>เพิ่มงานวิ่ง</h2>${actionForm('RIDE_JOB_ADD', field('ต้นทาง','origin') + field('ปลายทาง','destination') + field('รายได้ (บาท)','amount','text','inputmode="decimal"') + selectField('การรับเงิน','paymentMode',[['CASH','เงินสด'],['CREDIT','เครดิต']]), 'บันทึกงาน')}</section>
      <section class="panel"><h2>เพิ่มค่าใช้จ่าย</h2>${actionForm('RIDE_EXPENSE_ADD', field('รายการ','label') + field('จำนวนเงิน (บาท)','amount','text','inputmode="decimal"'), 'บันทึกค่าใช้จ่าย')}</section>
      <section class="panel"><h2>ขอเบิกเครดิต</h2>${actionForm('RIDE_CREDIT_WITHDRAW_REQUEST', field('ยอดเบิก (บาท)','amount','text','inputmode="decimal"') + field('วันที่คาดว่าเงินเข้า','due','date'), 'สร้างคิวยืนยันเงินเข้า')}</section>
      <section class="panel"><h2>งานล่าสุด</h2><div class="list">${jobs.length ? jobs.map(job => `<div class="list-item"><div class="list-item__main"><strong>${escapeHtml(job.origin)} → ${escapeHtml(job.destination)}</strong><small>${job.paymentMode === 'CASH' ? 'เงินสด' : 'เครดิต'} · ${escapeHtml(job.date)}</small></div><b>${money(job.amountSatang)}</b></div>`).join('') : empty()}</div></section>
    </div>`;
}

function renderLedger(state) {
  const txs = newest(state.ledger.transactions).slice(0, 20);
  const obligations = state.ledger.obligations.filter(x => x.status === 'OPEN');
  return `
    <div class="page-head"><div><h1>LEDGER · การเงิน</h1><p class="muted">เงินจริงและธุรกรรมเข้าออก</p></div><button class="secondary small" data-route="home">กลับหน้ารวม</button></div>
    <section class="stats"><div class="stat"><small>เงินในกระเป๋า</small><strong>${money(ledgerBalanceSatang(state))}</strong></div><div class="stat"><small>ธุรกรรม</small><strong>${state.ledger.transactions.length}</strong></div><div class="stat"><small>ยอดค้างชำระ</small><strong>${obligations.length}</strong></div></section>
    <section class="panel"><h2>เพิ่มยอดค้างชำระ</h2>${actionForm('LEDGER_OBLIGATION_ADD', field('ชื่อรายการ','name') + field('จำนวนเงิน (บาท)','amount','text','inputmode="decimal"') + field('วันครบกำหนด','due','date'), 'เพิ่มเข้าปฏิทิน')}</section>
    <section class="panel"><h2>ประวัติเงินจริง</h2><div class="list">${txs.length ? txs.map(tx => `<div class="list-item"><div class="list-item__main"><strong>${escapeHtml(tx.label)}</strong><small>${escapeHtml(tx.source)} · ${new Date(tx.createdAt).toLocaleString('th-TH')}</small></div><div><b class="${tx.direction === 'IN' ? 'amount-in' : 'amount-out'}">${tx.direction === 'IN' ? '+' : '-'}${money(tx.amountSatang)}</b>${tx.reversedBy ? '<small class="badge">กลับรายการแล้ว</small>' : `<button class="ghost small" data-reverse="${escapeHtml(tx.id)}">กลับรายการ</button>`}</div></div>`).join('') : empty()}</div></section>`;
}

function renderCalendar(state) {
  const items = [...state.calendar].sort((a,b)=>String(a.due).localeCompare(String(b.due)));
  return `
    <div class="page-head"><div><h1>CALENDAR · ปฏิทิน</h1><p class="muted">คิวที่รับมาจากทุกแอป</p></div><button class="secondary small" data-route="home">กลับหน้ารวม</button></div>
    <section class="panel"><div class="list">${items.length ? items.map(item => `<div class="list-item"><div class="list-item__main"><strong>${escapeHtml(item.title || item.actionType)}</strong><small>${escapeHtml(item.due)} · ${escapeHtml(item.source)} · ${escapeHtml(item.status)}</small></div>${['COMPLETED','CANCELLED'].includes(item.status) ? `<span class="badge">${escapeHtml(item.status)}</span>` : `<div class="actions"><button class="primary small" data-complete="${escapeHtml(item.id)}">เสร็จ</button><button class="danger small" data-cancel="${escapeHtml(item.id)}">ยกเลิก</button></div>`}</div>`).join('') : empty('ไม่มีคิวค้าง')}</div></section>`;
}

function renderReports(state) {
  const model = buildDashboardModel(state);
  const cashIn = state.ledger.transactions.filter(x=>x.direction==='IN').reduce((s,x)=>s+x.amountSatang,0);
  const cashOut = state.ledger.transactions.filter(x=>x.direction==='OUT').reduce((s,x)=>s+x.amountSatang,0);
  return `
    <div class="page-head"><div><h1>รายงานภาพรวม</h1><p class="muted">สรุปจากข้อมูลที่บันทึกในเครื่อง</p></div><button class="secondary small" data-route="home">กลับหน้ารวม</button></div>
    <section class="stats"><div class="stat"><small>ยอดขายวันนี้</small><strong>${money(model.storeTodaySatang)}</strong></div><div class="stat"><small>รายได้วิ่งวันนี้</small><strong>${money(model.rideTodaySatang)}</strong></div><div class="stat"><small>เงินคงเหลือ</small><strong>${money(model.ledgerBalanceSatang)}</strong></div></section>
    <div class="panel-grid"><section class="panel"><h2>เงินจริงสะสม</h2><div class="list"><div class="list-item"><strong>เงินเข้า</strong><b class="amount-in">${money(cashIn)}</b></div><div class="list-item"><strong>เงินออก</strong><b class="amount-out">${money(cashOut)}</b></div></div></section><section class="panel"><h2>ปริมาณงาน</h2><div class="list"><div class="list-item"><strong>ขายสินค้า</strong><b>${state.store.sales.length}</b></div><div class="list-item"><strong>งานวิ่ง</strong><b>${state.ride.jobs.length}</b></div><div class="list-item"><strong>คิวค้าง</strong><b>${model.pendingCount}</b></div></div></section></div>`;
}

function renderSettings(state) {
  return `
    <div class="page-head"><div><h1>ตั้งค่าและข้อมูลสำรอง</h1><p class="muted">งานสำคัญต้องตรวจผลก่อนถือว่าสำเร็จ</p></div><button class="secondary small" data-route="home">กลับหน้ารวม</button></div>
    <section class="panel"><h2>ไฟล์สำรอง</h2><div class="actions"><button class="primary" id="exportBtn">ส่งออก Backup</button><label class="secondary" style="display:inline-flex;align-items:center">นำเข้า Backup<input id="importFile" type="file" accept="application/json,.json" hidden></label></div><form id="importForm" class="form-grid hidden" style="margin-top:12px"><button class="primary wide" type="submit">ตรวจและนำเข้า</button></form></section>
    <section class="panel"><h2>สถานะระบบ</h2><div class="list"><div class="list-item"><strong>Release</strong><b>${RELEASE_VERSION}</b></div><div class="list-item"><strong>State schema</strong><b>${state.schema}</b></div><div class="list-item"><strong>Revision</strong><b>${state.revision}</b></div><div class="list-item"><strong>ที่เก็บข้อมูล</strong><b>IndexedDB · เปิดตรงโดยไม่ใช้รหัส</b></div></div></section>`;
}

function render() {
  if (!controller) return;
  const state = controller.getState();
  const content = $('#content');
  const views = { home: renderHome, store: renderStore, ride: renderRide, ledger: renderLedger, calendar: renderCalendar, reports: renderReports, settings: renderSettings };
  content.innerHTML = (views[route] || renderHome)(state);
  $('#routeLabel').textContent = route === 'home' ? 'Four Apps. One Flow.' : route.toUpperCase();
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.route === route));
  updateNetwork();
  bindRouteSpecific();
}

function formCommand(form) {
  const data = new FormData(form);
  const type = form.dataset.commandForm;
  const baht = name => parseBahtToSatang(data.get(name), { allowZero: false });
  const payloads = {
    STORE_PURCHASE: { name: data.get('name'), qty: Number(data.get('qty')), totalSatang: baht('amount') },
    STORE_SALE: { name: data.get('name'), qty: Number(data.get('qty')), totalSatang: baht('amount'), paymentMode: data.get('paymentMode'), due: data.get('due') },
    STORE_WITHDRAW: { qty: Number(data.get('qty')), note: data.get('note') },
    RIDE_JOB_ADD: { origin: data.get('origin'), destination: data.get('destination'), amountSatang: baht('amount'), paymentMode: data.get('paymentMode') },
    RIDE_EXPENSE_ADD: { label: data.get('label'), amountSatang: baht('amount') },
    RIDE_CREDIT_WITHDRAW_REQUEST: { amountSatang: baht('amount'), due: data.get('due') },
    LEDGER_OBLIGATION_ADD: { name: data.get('name'), amountSatang: baht('amount'), due: data.get('due') },
  };
  return { type, payload: payloads[type] };
}

async function dispatch(command) {
  try {
    await controller.dispatch(command);
    notify('บันทึกและตรวจข้อมูลหลังเขียนแล้ว');
    render();
  } catch (error) {
    notify(error.message || 'ทำรายการไม่สำเร็จ', true);
  }
}

function bindRouteSpecific() {
  $('#exportBtn')?.addEventListener('click', exportBackup);
  const importFile = $('#importFile');
  importFile?.addEventListener('change', () => $('#importForm').classList.toggle('hidden', !importFile.files?.length));
  $('#importForm')?.addEventListener('submit', importBackupFromSettings);
}

async function exportBackup() {
  try {
    const backup = await exportLocalBackup(store, RELEASE_VERSION);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `YGPH_BACKUP_${dateKey()}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('สร้างไฟล์สำรองแล้ว');
  } catch (error) { notify(error.message, true); }
}

async function importBackupFromSettings(event) {
  event.preventDefault();
  const file = $('#importFile').files?.[0];
  if (!file) return;
  await importFile(file);
}

async function importFile(file) {
  try {
    const backup = JSON.parse(await file.text());
    const state = await importLocalBackup(store, backup);
    enterApp(state);
    notify('นำเข้าและตรวจข้อมูลหลังเขียนแล้ว');
  } catch (error) { notify(error.message || 'นำเข้าไม่สำเร็จ', true); }
}

function enterApp(state) {
  controller = createAppController({ store, state, onChange: () => {} });
  route = 'home';
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  app.innerHTML = shell();
  if (!appEventsBound) {
    app.addEventListener('click', onAppClick);
    app.addEventListener('submit', onAppSubmit);
    appEventsBound = true;
  }
  $('#themeBtn').addEventListener('click', toggleTheme);
  render();
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('ygph-theme', next);
}

function onAppClick(event) {
  const routeButton = event.target.closest('[data-route]');
  if (routeButton) { route = routeButton.dataset.route; render(); return; }
  const commandButton = event.target.closest('[data-command]');
  if (commandButton) { dispatch({ type: commandButton.dataset.command, payload: {} }); return; }
  const complete = event.target.closest('[data-complete]');
  if (complete) { dispatch({ type: 'CALENDAR_COMPLETE', payload: { id: complete.dataset.complete } }); return; }
  const cancel = event.target.closest('[data-cancel]');
  if (cancel && confirm('ยืนยันยกเลิกรายการนี้')) { dispatch({ type: 'CALENDAR_CANCEL', payload: { id: cancel.dataset.cancel } }); return; }
  const reverse = event.target.closest('[data-reverse]');
  if (reverse) {
    const reason = prompt('เหตุผลที่กลับรายการ');
    if (reason) dispatch({ type: 'TRANSACTION_REVERSE', payload: { id: reverse.dataset.reverse, reason } });
  }
}

function onAppSubmit(event) {
  const form = event.target.closest('[data-command-form]');
  if (!form) return;
  event.preventDefault();
  try { dispatch(formCommand(form)); } catch (error) { notify(error.message, true); }
}

function updateNetwork() {
  const node = $('#networkText');
  if (node) node.textContent = navigator.onLine ? 'ออนไลน์ · พร้อมซิงก์แคช' : 'ออฟไลน์ · ใช้ข้อมูลในเครื่อง';
}

async function init() {
  const savedTheme = localStorage.getItem('ygph-theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  store = await openVaultStore();
  const state = await loadLocalState(store);
  if (state) enterApp(state);
  else if (await hasLegacyVault(store)) showOnly(migrationScreen);
  else showOnly(setupScreen);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('online', updateNetwork);
  window.addEventListener('offline', updateNetwork);
}

$('#setupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    const state = createDefaultState({ openingBalanceSatang: parseBahtToSatang(data.get('openingBalance')) });
    const durable = await saveNewLocalState(store, state);
    enterApp(durable);
    notify('เริ่มใช้งานและตรวจข้อมูลหลังเขียนแล้ว');
  } catch (error) { notify(error.message, true); }
});

$('#migrationForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    const state = await migrateLegacyVault(store, data.get('password'));
    enterApp(state);
    notify('ย้ายข้อมูลเดิมแล้ว จากนี้เปิดได้โดยไม่ใช้รหัส');
  } catch (error) { notify(error.message || 'ย้ายข้อมูลเดิมไม่สำเร็จ', true); }
});

for (const [selector, back] of [['#showRestoreFromSetup','setup'],['#showRestoreFromMigration','migration']]) {
  $(selector).addEventListener('click', () => { restoreReturn = back; showOnly(restoreScreen); });
}
$('#cancelRestore').addEventListener('click', () => showOnly(restoreReturn === 'migration' ? migrationScreen : setupScreen));
$('#restoreForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  await importFile(data.get('backup'));
});

init().catch(error => notify(error.message || 'เริ่มระบบไม่สำเร็จ', true));
