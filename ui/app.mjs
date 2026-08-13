import { openGreenfieldRuntime } from '../greenfield/runtime.mjs';
import { parseBahtToSatang, formatSatang, makeId, paymentIntentForQueue, parseInstallments } from './ui-model.mjs';
import { recordsForDomain, dateKey, deriveTimeState, projectMakeMoney, projectStore, suggestDailyGoal, projectFinance, projectAttention, buildMonthGrid } from './product-model.mjs';
import { hydrateIcons } from './icons.mjs';

const $ = id => document.getElementById(id);
let runtime = null;
let state = null;
let activeArea = 'home';
let activeMoneyView = 'dashboard';
let selectedCalendarDate = dateKey(new Date());
let monthCursor = monthFromDate(selectedCalendarDate);

function status(message, error = false, gate = false) {
  const node = $(gate ? 'gateStatus' : 'appStatus');
  node.textContent = message || '';
  node.classList.toggle('error', error);
}

function passphrase() {
  const value = $('passphrase').value;
  if (value.length < 12) throw new Error('รหัสต้องมีอย่างน้อย 12 ตัวอักษร');
  return value;
}

async function jsonFile(input) {
  const file = input.files?.[0];
  if (!file) throw new Error('เลือกไฟล์ก่อน');
  return JSON.parse(await file.text());
}

async function ensureRuntime() {
  runtime?.close();
  runtime = await openGreenfieldRuntime({ passphrase:passphrase() });
  return runtime;
}

function monthFromDate(key) {
  const match = /^(\d{4})-(\d{2})/.exec(String(key || ''));
  const now = new Date();
  return match ? { year:Number(match[1]), monthIndex:Number(match[2]) - 1 } : { year:now.getFullYear(), monthIndex:now.getMonth() };
}

function shiftDate(key, days) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}

function todayKey() { return dateKey(new Date()); }

function dailyIncomeHistory(currentState, today, days = 7) {
  const result = [];
  for (let offset = days; offset >= 1; offset -= 1) {
    const date = shiftDate(today, -offset);
    result.push({ date, amountSatang:projectMakeMoney(currentState, date).combinedSatang });
  }
  return result;
}

function openObligationQueues(currentState) {
  return recordsForDomain(currentState, 'CALENDAR').filter(record => ['PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT'].includes(record.type) && !['COMPLETED','CANCELLED'].includes(record.status));
}

async function ensureTodayGoal() {
  const today = todayKey();
  const projection = runtime.project();
  const suggestion = suggestDailyGoal({
    dailyIncome:dailyIncomeHistory(state, today),
    balanceSatang:projection.ledgerBalanceSatang,
    nearObligations:openObligationQueues(state),
    today,
  });
  const result = await runtime.ensureDailyGoal({ date:today, suggestedSatang:suggestion.goalSatang });
  state = result.state;
  return result.goal;
}

async function openWorkspace() {
  if (!state) throw new Error('ยังไม่มีฐาน METROPOLIS');
  await ensureTodayGoal();
  $('gate').classList.add('hidden');
  $('workspace').classList.remove('hidden');
  $('runtimeBadge').textContent = 'READY';
  selectedCalendarDate ||= todayKey();
  monthCursor = monthFromDate(selectedCalendarDate);
  hydrateIcons();
  activateArea(activeArea);
  render();
}

async function refresh(message = '') {
  state = await runtime.readState();
  if (!state) throw new Error('ยังไม่มีฐาน METROPOLIS');
  render();
  if (message) status(message);
}

async function run(method, input, message = 'บันทึกและอ่านกลับแล้ว') {
  try {
    await runtime[method](input);
    await refresh(message);
  } catch (error) {
    status(error.message, true);
  }
}

function bindForm(id, handler) {
  $(id).addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await handler(new FormData(event.currentTarget), event.currentTarget);
    } catch (error) {
      status(error.message, true);
    }
  });
}

function activateArea(area) {
  activeArea = area;
  document.querySelectorAll('.rail-btn[data-area]').forEach(button => {
    const active = button.dataset.area === area;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-area-page]').forEach(page => page.classList.toggle('active', page.dataset.areaPage === area));
  if (area === 'calendar') renderCalendar();
}

function activateMoneyView(view) {
  activeMoneyView = view;
  document.querySelectorAll('[data-money-view]').forEach(button => button.classList.toggle('active', button.dataset.moneyView === view));
  document.querySelectorAll('[data-money-page]').forEach(page => page.classList.toggle('active', page.dataset.moneyPage === view));
  $('moneyChildren').classList.add('hidden');
  $('moneyChildToggle').setAttribute('aria-expanded', 'false');
}

function routeTo(target = {}) {
  const map = { HOME:'home', MAKE_MONEY:'money', CALENDAR:'calendar', FINANCE:'finance', SYSTEM:'system' };
  const area = map[target.area] || String(target.area || '').toLowerCase();
  if (target.date) {
    selectedCalendarDate = target.date;
    monthCursor = monthFromDate(target.date);
  }
  if (area === 'money' && target.focus === 'ride') activateMoneyView('ride');
  if (area === 'money' && target.focus === 'store') activateMoneyView('store');
  activateArea(area || 'home');
  render();
}

function numberText(value) { return `${formatSatang(Number(value || 0))}`; }
function bahtText(value) { return `${numberText(value)} บาท`; }

function recordDateLabel(record) {
  const key = dateKey(record?.dueDate || record?.createdAt || record?.date || record?.updatedAt);
  if (!key) return '';
  return new Intl.DateTimeFormat('th-TH', { day:'numeric', month:'short', year:'numeric' }).format(new Date(`${key}T12:00:00+07:00`));
}

const TYPE_LABEL = Object.freeze({
  SALE:'ขายสินค้า', PURCHASE:'รับสินค้าเข้า', STOCK_WITHDRAWAL:'เบิกสินค้า', STOCK_ADJUSTMENT:'ปรับสต็อก',
  TRANSACTION:'เงินเข้า–ออก', OBLIGATION:'ภาระ', ROUND:'รอบวิ่ง', JOB:'งานวิ่ง', EXPENSE:'ค่าใช้จ่ายวิ่ง', CREDIT_WITHDRAWAL:'เบิกเครดิต',
  RECEIVE_CUSTOMER_PAYMENT:'รับเงินลูกค้า', PAY_OBLIGATION:'จ่ายภาระ', PAY_OBLIGATION_INSTALLMENT:'จ่ายงวด', PURCHASE_RETURN_WINDOW:'กำหนดคืนสินค้า',
});

function simpleItem(record, { amountField = 'amountSatang' } = {}) {
  const item = document.createElement('article');
  item.className = 'item';
  const head = document.createElement('div');
  head.className = 'item-head';
  const title = document.createElement('b');
  title.textContent = record.title || TYPE_LABEL[record.type] || 'รายการ';
  const statusNode = document.createElement('small');
  statusNode.textContent = record.status || '';
  head.append(title, statusNode);
  const meta = document.createElement('div');
  meta.className = 'muted';
  const amount = Number(record[amountField]);
  const pieces = [TYPE_LABEL[record.type] || record.type || ''];
  if (Number.isSafeInteger(amount) && amount !== 0) pieces.push(bahtText(amount));
  const date = recordDateLabel(record);
  if (date) pieces.push(date);
  meta.textContent = pieces.filter(Boolean).join(' · ');
  item.append(head, meta);
  return item;
}

function renderHome(context) {
  const node = $('attentionList');
  node.textContent = '';
  const attention = projectAttention({
    calendarRecords:context.calendarRecords,
    finance:context.finance,
    goal:{ goalSatang:context.goal.goalSatang, generatedSatang:context.money.combinedSatang },
    today:context.today,
  });
  $('homeQuiet').classList.toggle('hidden', attention.length !== 0);
  for (const entry of attention) {
    const button = document.createElement('button');
    button.className = 'attention-item';
    button.dataset.kind = entry.kind;
    const title = document.createElement('strong');
    title.textContent = entry.title;
    const amount = document.createElement('b');
    amount.textContent = Number(entry.amountSatang || 0) > 0 ? bahtText(entry.amountSatang) : entry.count ? `${entry.count} รายการ` : '';
    const meta = document.createElement('small');
    meta.textContent = entry.kind === 'OVERDUE' ? 'เลยกำหนดแล้ว' : entry.kind === 'TODAY' ? 'ต้องจัดการวันนี้' : 'แตะเพื่อไปยังรายการจริง';
    button.append(title, amount, meta);
    button.addEventListener('click', () => routeTo(entry.target));
    node.append(button);
  }
}

function renderMoney(context) {
  $('moneyGenerated').textContent = numberText(context.money.combinedSatang);
  $('moneyGoal').textContent = numberText(context.goal.goalSatang);
  const remaining = Math.max(0, context.goal.goalSatang - context.money.combinedSatang);
  $('moneyRemaining').textContent = numberText(remaining);
  const progress = context.goal.goalSatang > 0 ? Math.round((context.money.combinedSatang / context.goal.goalSatang) * 100) : (context.money.combinedSatang > 0 ? 100 : 0);
  $('moneyProgress').textContent = `${progress}%`;
  $('moneyStore').textContent = bahtText(context.money.storeSatang);
  $('moneyRide').textContent = bahtText(context.money.rideSatang);
  $('goalForm').elements.goal.value = formatSatang(context.goal.goalSatang);

  $('storeToday').textContent = bahtText(context.store.todaySalesSatang);
  $('storeStock').textContent = `${context.store.stockQuantity} ชิ้น`;
  $('storeReceivable').textContent = bahtText(context.store.receivableSatang);
  const storeList = $('storeList');
  storeList.textContent = '';
  const sortedStore = [...context.storeRecords].sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0,30);
  for (const record of sortedStore) storeList.append(simpleItem(record));
  if (!sortedStore.length) storeList.textContent = 'ยังไม่มีรายการร้านค้า';

  const rideProjection = context.projection.ride;
  $('rideGenerated').textContent = bahtText(context.money.rideSatang);
  $('ridePendingCredit').textContent = bahtText(rideProjection.pendingCreditSatang);
  $('rideRoundStatus').textContent = rideProjection.activeRound ? 'กำลังวิ่ง' : 'ยังไม่เริ่ม';
  $('rideStartBtn').disabled = Boolean(rideProjection.activeRound);
  $('rideEndBtn').disabled = !rideProjection.activeRound;
  const rideList = $('rideList');
  rideList.textContent = '';
  const sortedRide = [...context.rideRecords].filter(record => record.type !== 'ROUND').sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0,30);
  for (const record of sortedRide) rideList.append(simpleItem(record));
  if (!sortedRide.length) rideList.textContent = 'ยังไม่มีงานวิ่งที่บันทึกในฐานใหม่นี้';
  activateMoneyView(activeMoneyView);
}

function renderFinance(context) {
  const view = context.finance;
  $('financeBalance').textContent = numberText(view.spendableBalanceSatang);
  $('financeIn').textContent = bahtText(view.todayInSatang);
  $('financeOut').textContent = bahtText(view.todayOutSatang);
  $('financeMonthDue').textContent = bahtText(view.monthDueSatang);
  const openNext = $('financeOpenNextDue');
  if (!view.nextDue) {
    $('financePressureText').textContent = 'ไม่มีภาระที่รอจ่าย';
    $('financePressureMeta').textContent = '';
    openNext.classList.add('hidden');
  } else {
    if (view.shortfallSatang > 0) $('financePressureText').textContent = `ยังขาด ${bahtText(view.shortfallSatang)}`;
    else if (view.nextDue.canPayNow) $('financePressureText').textContent = 'เงินถึงยอดของรายการถัดไปแล้ว — พิจารณาจ่ายได้';
    else $('financePressureText').textContent = 'ภาระใกล้ถึงอยู่ในระยะเฝ้าดู';
    const days = view.nextDue.daysRemaining;
    $('financePressureMeta').textContent = `${days < 0 ? `เลยกำหนด ${Math.abs(days)} วัน` : days === 0 ? 'ครบกำหนดวันนี้' : `อีก ${days} วัน`} · ${bahtText(view.nextDue.amountSatang)}`;
    openNext.classList.remove('hidden');
    openNext.onclick = () => routeTo({ area:'CALENDAR', date:view.nextDue.dueDate, recordId:view.nextDue.recordId });
  }

  const obligationList = $('obligationList');
  obligationList.textContent = '';
  const obligations = context.ledgerRecords.filter(record => record.type === 'OBLIGATION').sort((a,b) => Number(b.remainingSatang ?? b.amountSatang ?? 0) - Number(a.remainingSatang ?? a.amountSatang ?? 0));
  for (const record of obligations) {
    const display = { ...record, amountSatang:Number(record.remainingSatang ?? record.amountSatang ?? 0), title:record.title || 'ภาระ' };
    obligationList.append(simpleItem(display));
  }
  if (!obligations.length) obligationList.textContent = 'ยังไม่มีภาระ';

  const ledgerList = $('ledgerList');
  ledgerList.textContent = '';
  const transactions = context.ledgerRecords.filter(record => record.type === 'TRANSACTION').sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0,50);
  for (const record of transactions) ledgerList.append(simpleItem(record));
  if (!transactions.length) ledgerList.textContent = 'ยังไม่มีประวัติเงินจริง';
}

function calendarActionItem(record) {
  const item = simpleItem(record);
  const timeState = deriveTimeState(record, todayKey());
  const meta = document.createElement('small');
  meta.className = 'muted';
  meta.textContent = timeState === 'OVERDUE' ? 'เลยกำหนด' : timeState === 'TODAY' ? 'วันนี้' : timeState === 'NEAR' ? 'ใกล้ถึง' : '';
  if (meta.textContent) item.append(meta);
  if (record.status !== 'OPEN') return item;
  const actions = document.createElement('div');
  actions.className = 'item-actions';
  if (['RECEIVE_CUSTOMER_PAYMENT','PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT'].includes(record.type)) {
    const input = document.createElement('input');
    input.inputMode = 'decimal';
    input.value = formatSatang(Number(record.amountSatang || 0));
    input.setAttribute('aria-label', 'จำนวนเงิน');
    const pay = document.createElement('button');
    pay.textContent = record.type === 'RECEIVE_CUSTOMER_PAYMENT' ? 'รับเงิน' : 'ชำระ';
    pay.addEventListener('click', async () => {
      try {
        const amountSatang = parseBahtToSatang(input.value);
        const intent = paymentIntentForQueue(record, amountSatang, { workflowId:makeId('WF-PAY'), transactionId:makeId('TX') });
        await runtime[intent.method](intent.input);
        await refresh('บันทึกเงินจริงและอัปเดตคิวแล้ว');
      } catch (error) { status(error.message, true); }
    });
    actions.append(input, pay);
  } else {
    for (const target of ['COMPLETED','CANCELLED']) {
      const button = document.createElement('button');
      button.textContent = target === 'COMPLETED' ? 'เสร็จ' : 'ยกเลิก';
      button.addEventListener('click', () => run('calendarStatus', { workflowId:makeId('WF-CAL'), queueId:record.recordId, status:target }, 'อัปเดตสถานะแล้ว'));
      actions.append(button);
    }
  }
  item.append(actions);
  return item;
}

function renderCalendar() {
  if (!state || !runtime) return;
  const records = recordsForDomain(state, 'CALENDAR');
  const today = todayKey();
  const statuses = records.map(record => deriveTimeState(record, today));
  $('calOverdue').textContent = statuses.filter(value => value === 'OVERDUE').length;
  $('calNear').textContent = statuses.filter(value => value === 'TODAY' || value === 'NEAR').length;
  const finance = projectFinance(state, runtime.project().ledgerBalanceSatang, today);
  $('calCollision').textContent = finance.collisionDates.length;

  const grid = buildMonthGrid({ year:monthCursor.year, monthIndex:monthCursor.monthIndex, calendarRecords:records, today });
  const labelDate = new Date(Date.UTC(monthCursor.year, monthCursor.monthIndex, 15));
  $('monthLabel').textContent = new Intl.DateTimeFormat('th-TH', { month:'long', year:'numeric', timeZone:'UTC' }).format(labelDate);
  const node = $('monthGrid');
  node.textContent = '';
  for (const cell of grid.cells) {
    const button = document.createElement('button');
    button.className = 'day-cell';
    if (!cell.inMonth) button.classList.add('outside');
    if (cell.isToday) button.classList.add('today');
    if (cell.date === selectedCalendarDate) button.classList.add('selected');
    if (cell.state) button.classList.add(`state-${cell.state.toLowerCase()}`);
    if (cell.collision) button.classList.add('collision');
    button.setAttribute('aria-label', cell.date);
    const day = document.createElement('span');
    day.textContent = cell.day;
    button.append(day);
    if (cell.count) {
      const count = document.createElement('span');
      count.className = 'day-count';
      count.textContent = cell.count;
      button.append(count);
    }
    button.addEventListener('click', () => { selectedCalendarDate = cell.date; renderCalendar(); });
    node.append(button);
  }

  const selected = selectedCalendarDate || today;
  $('selectedDayTitle').textContent = new Intl.DateTimeFormat('th-TH', { weekday:'short', day:'numeric', month:'long', year:'numeric' }).format(new Date(`${selected}T12:00:00+07:00`));
  const filter = $('calendarFilter').value;
  let selectedRecords = records.filter(record => dateKey(record.dueDate || record.date || record.scheduledDate) === selected);
  if (filter === 'ACTIVE') selectedRecords = selectedRecords.filter(record => !['COMPLETED','CANCELLED'].includes(record.status));
  if (filter === 'COMPLETED') selectedRecords = selectedRecords.filter(record => record.status === 'COMPLETED');
  if (filter === 'CANCELLED') selectedRecords = selectedRecords.filter(record => record.status === 'CANCELLED');
  const list = $('calendarList');
  list.textContent = '';
  selectedRecords.sort((a,b) => String(a.title || '').localeCompare(String(b.title || ''), 'th'));
  for (const record of selectedRecords) list.append(calendarActionItem(record));
  if (!selectedRecords.length) list.textContent = 'ไม่มีรายการในวันที่เลือก';
}

function renderSystem(context) {
  const diagnostics = runtime.diagnostics();
  $('systemRevision').textContent = state.revision;
  $('systemSchema').textContent = diagnostics.schema;
  $('systemDatabase').textContent = diagnostics.database;
  $('systemCoordination').textContent = diagnostics.coordination.mode === 'WEB_LOCKS' ? 'ล็อกข้ามบริบท' : 'คิวภายในหน้า';
  $('diagnostics').textContent = JSON.stringify(diagnostics, null, 2);
  $('systemDbState').textContent = context.finance ? 'พร้อมใช้' : 'ตรวจสอบ';
}

function buildContext() {
  const today = todayKey();
  const projection = runtime.project();
  const storeRecords = recordsForDomain(state, 'STORE');
  const ledgerRecords = recordsForDomain(state, 'LEDGER');
  const calendarRecords = recordsForDomain(state, 'CALENDAR');
  const rideRecords = recordsForDomain(state, 'RIDE');
  const money = projectMakeMoney(state, today);
  const store = projectStore(state, today);
  const finance = projectFinance(state, projection.ledgerBalanceSatang, today);
  const goal = state.meta?.dailyGoals?.[today] || { date:today, goalSatang:0, source:'AUTO' };
  return { today, projection, storeRecords, ledgerRecords, calendarRecords, rideRecords, money, store, finance, goal };
}

function render() {
  if (!runtime || !state) return;
  const context = buildContext();
  renderHome(context);
  renderMoney(context);
  renderFinance(context);
  renderCalendar();
  renderSystem(context);
}

$('unlockBtn').addEventListener('click', async () => {
  try {
    await ensureRuntime();
    state = await runtime.readState();
    if (!state) throw new Error('ยังไม่พบฐาน — ใช้ Evidence หรือ Backup ในส่วนเริ่มต้น/กู้คืน');
    await openWorkspace();
  } catch (error) { status(error.message, true, true); }
});

$('importEvidenceBtn').addEventListener('click', async () => {
  try {
    const evidence = await jsonFile($('evidenceFile'));
    await ensureRuntime();
    const result = await runtime.initializeFromEvidence(evidence, { expectedPackageId:'FLOW-1786527289637', expectedRevision:28 });
    state = result.state;
    await openWorkspace();
    status(`นำเข้า Evidence ผ่าน · revision ${state.revision}`);
  } catch (error) { status(error.message, true, true); }
});

$('restoreBtn').addEventListener('click', async () => {
  try {
    const backup = await jsonFile($('restoreFile'));
    await ensureRuntime();
    const result = await runtime.restoreBackup(backup);
    state = result.state;
    await openWorkspace();
    status('กู้คืน Backup และตรวจอ่านกลับแล้ว');
  } catch (error) { status(error.message, true, true); }
});

document.querySelectorAll('.rail-btn[data-area]').forEach(button => button.addEventListener('click', () => activateArea(button.dataset.area)));
$('moneyChildToggle').addEventListener('click', () => {
  const hidden = $('moneyChildren').classList.toggle('hidden');
  $('moneyChildToggle').setAttribute('aria-expanded', String(!hidden));
});
document.querySelectorAll('[data-money-view]').forEach(button => button.addEventListener('click', () => activateMoneyView(button.dataset.moneyView)));
document.querySelectorAll('.back-to-money').forEach(button => button.addEventListener('click', () => activateMoneyView('dashboard')));
$('openStoreSource').addEventListener('click', () => { activateArea('money'); activateMoneyView('store'); });
$('openRideSource').addEventListener('click', () => { activateArea('money'); activateMoneyView('ride'); });

bindForm('goalForm', async data => {
  const result = await runtime.overrideDailyGoal({ date:todayKey(), goalSatang:parseBahtToSatang(data.get('goal')) });
  state = result.state;
  render();
  status('ปรับเป้าวันนี้แล้ว');
});

bindForm('saleForm', data => {
  const amount = parseBahtToSatang(data.get('amount'));
  const received = parseBahtToSatang(data.get('received') || '0');
  const dueDate = data.get('dueDate') || undefined;
  if (received < amount && !dueDate) throw new Error('ยอดยังรับไม่ครบ — ใส่วันครบกำหนดเพื่อสร้างคิวรับเงิน');
  return run('sale', { workflowId:makeId('WF-SALE'), saleId:makeId('SALE'), ledgerTransactionId:received>0?makeId('TX'):undefined, calendarQueueId:received<amount?makeId('Q'):undefined, title:data.get('title'), amountSatang:amount, quantity:Number(data.get('quantity')), receivedSatang:received, dueDate });
});

bindForm('purchaseForm', data => {
  const due = data.get('returnDueDate') || null;
  return run('purchase', { workflowId:makeId('WF-BUY'), purchaseId:makeId('BUY'), ledgerTransactionId:makeId('TX'), returnQueueId:due?makeId('Q'):null, title:data.get('title'), amountSatang:parseBahtToSatang(data.get('amount')), quantity:Number(data.get('quantity')), returnDueDate:due });
});
bindForm('withdrawForm', data => run('stockWithdrawal',{workflowId:makeId('WF-WD'),recordId:makeId('WD'),title:data.get('title'),quantity:Number(data.get('quantity'))}));
bindForm('adjustForm', data => run('stockAdjustment',{workflowId:makeId('WF-ADJ'),recordId:makeId('ADJ'),title:data.get('title'),deltaQuantity:Number(data.get('delta')),reason:data.get('reason')}));

function activeRideRound() { return runtime.project().ride.activeRound; }
$('rideStartBtn').addEventListener('click', () => run('rideStartRound', { workflowId:makeId('WF-RIDE-START'), roundId:makeId('ROUND') }, 'เริ่มรอบวิ่งแล้ว'));
$('rideEndBtn').addEventListener('click', () => {
  const round = activeRideRound();
  if (!round) return status('ยังไม่มีรอบที่กำลังวิ่ง', true);
  run('rideEndRound', { workflowId:makeId('WF-RIDE-END'), roundId:round.recordId }, 'จบรอบวิ่งแล้ว');
});
bindForm('rideJobForm', data => {
  const round = activeRideRound();
  if (!round) throw new Error('เริ่มรอบก่อนบันทึกงาน');
  const paymentMode = data.get('paymentMode');
  return run('rideJob', { workflowId:makeId('WF-RIDE-JOB'), roundId:round.recordId, jobId:makeId('RIDE-JOB'), ledgerTransactionId:paymentMode==='CASH'?makeId('TX'):undefined, amountSatang:parseBahtToSatang(data.get('amount')), paymentMode, note:data.get('note') || '' }, 'บันทึกงานวิ่งแล้ว');
});
bindForm('rideExpenseForm', data => {
  const round = activeRideRound();
  if (!round) throw new Error('เริ่มรอบก่อนบันทึกค่าใช้จ่าย');
  return run('rideExpense', { workflowId:makeId('WF-RIDE-EXP'), roundId:round.recordId, expenseId:makeId('RIDE-EXP'), ledgerTransactionId:makeId('TX'), title:data.get('title'), amountSatang:parseBahtToSatang(data.get('amount')) }, 'บันทึกค่าใช้จ่ายรอบแล้ว');
});
bindForm('rideWithdrawForm', data => run('rideWithdrawCredit', { workflowId:makeId('WF-RIDE-WD'), withdrawalId:makeId('RIDE-WD'), ledgerTransactionId:makeId('TX'), amountSatang:parseBahtToSatang(data.get('amount')) }, 'บันทึกการเบิกเครดิตแล้ว'));

bindForm('incomeForm', data => run('otherIncome',{workflowId:makeId('WF-IN'),ledgerTransactionId:makeId('TX'),title:data.get('title'),amountSatang:parseBahtToSatang(data.get('amount'))}));
bindForm('expenseForm', data => run('expense',{workflowId:makeId('WF-OUT'),ledgerTransactionId:makeId('TX'),title:data.get('title'),amountSatang:parseBahtToSatang(data.get('amount'))}));
bindForm('obligationForm', data => {
  const installments = parseInstallments(data.get('installments')).map(item => ({ ...item, queueId:makeId('Q') }));
  return run('obligation', { workflowId:makeId('WF-OBL'), obligationId:makeId('OBL'), title:data.get('title'), totalSatang:parseBahtToSatang(data.get('total')), installments });
});

$('prevMonth').addEventListener('click', () => { const date=new Date(Date.UTC(monthCursor.year,monthCursor.monthIndex-1,1)); monthCursor={year:date.getUTCFullYear(),monthIndex:date.getUTCMonth()}; selectedCalendarDate=`${monthCursor.year}-${String(monthCursor.monthIndex+1).padStart(2,'0')}-01`; renderCalendar(); });
$('nextMonth').addEventListener('click', () => { const date=new Date(Date.UTC(monthCursor.year,monthCursor.monthIndex+1,1)); monthCursor={year:date.getUTCFullYear(),monthIndex:date.getUTCMonth()}; selectedCalendarDate=`${monthCursor.year}-${String(monthCursor.monthIndex+1).padStart(2,'0')}-01`; renderCalendar(); });
$('todayMonth').addEventListener('click', () => { selectedCalendarDate=todayKey(); monthCursor=monthFromDate(selectedCalendarDate); renderCalendar(); });
$('calendarFilter').addEventListener('change', renderCalendar);

$('backupBtn').addEventListener('click', async () => {
  try {
    const backup = await runtime.exportBackup();
    const blob = new Blob([JSON.stringify(backup,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `YGPH_METROPOLIS_BACKUP_${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('สร้าง Encrypted Backup แล้ว');
  } catch (error) { status(error.message, true); }
});

$('systemLockBtn').addEventListener('click', () => {
  runtime?.close();
  runtime = null;
  state = null;
  $('workspace').classList.add('hidden');
  $('gate').classList.remove('hidden');
  $('runtimeBadge').textContent = 'LOCKED';
  $('passphrase').value = '';
  status('', false, true);
});

hydrateIcons();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
