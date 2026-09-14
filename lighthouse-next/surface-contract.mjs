import { createLighthouseLedgerBridge } from './runtime-ledger.mjs';

const root = document.querySelector('#demo-root');
const appShell = root?.querySelector('#app-shell');
const manualNav = root?.querySelector('[data-root-target="manual"]');
const manualHub = root?.querySelector('#manual-hub');
const manualDetail = root?.querySelector('#manual-detail');
const manualDetailContent = root?.querySelector('#manual-detail-content');
const ledgerBridge = createLighthouseLedgerBridge();

function operationId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function ensureVisibleRoot() {
  if (!appShell || appShell.hidden) return;
  const visible = [...appShell.querySelectorAll('.app-page')].some((page) => !page.hidden);
  if (!visible) manualNav?.click();
}

function makeRow(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  const left = document.createElement('span');
  left.textContent = label;
  const right = document.createElement('strong');
  right.textContent = value;
  row.append(left, right);
  return row;
}

function makeHero(title, intro) {
  const hero = document.createElement('div');
  hero.className = 'detail-hero';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = intro;
  hero.append(heading, copy);
  return hero;
}

function makeStatus() {
  const status = document.createElement('p');
  status.className = 'pin-status';
  status.dataset.manualStatus = '';
  status.setAttribute('aria-live', 'polite');
  return status;
}

function formatSatang(value) {
  return `฿${(Number(value || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function syncDashboardFromTruth(truth) {
  const cash = root.querySelector('#home-cash-value');
  const income = root.querySelector('#home-income-value');
  const expense = root.querySelector('#home-expense-value');
  const net = root.querySelector('#home-net-value');
  if (cash) cash.textContent = formatSatang(truth.balanceSatang);
  if (income) income.textContent = formatSatang(truth.todayInSatang);
  if (expense) expense.textContent = formatSatang(truth.todayOutSatang);
  if (net) net.textContent = `${truth.netSatang >= 0 ? '+' : '-'}${formatSatang(Math.abs(truth.netSatang))}`;
}

async function refreshDashboard() {
  if (!appShell || appShell.hidden) return;
  try { syncDashboardFromTruth(await ledgerBridge.readLedgerTruth()); } catch {}
}

function openSurfaceDetail() {
  manualHub.hidden = true;
  manualDetail.hidden = false;
  manualDetailContent.replaceChildren();
}

function errorText(error) {
  const code = String(error?.message || error || '');
  if (code.includes('RUNTIME_SESSION_LOCKED')) return 'แอปถูกล็อก กรุณาเข้าใหม่';
  if (code.includes('PAYMENT_OVER_REMAINING')) return 'จำนวนที่จ่ายเกินยอดคงเหลือ';
  return 'ยังบันทึกไม่สำเร็จ · ไม่มีข้อมูลถูกเปลี่ยน';
}

async function renderIncome() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('Income', 'เลือกว่าเงินก้อนนี้มาจากโลกไหน แล้วเข้า workflow ของมันโดยตรง'));

  const routes = document.createElement('div');
  routes.className = 'task-grid income-route-grid';
  routes.dataset.incomeRoutes = '';
  routes.innerHTML = '<button type="button" class="task-card" data-income-target="store" data-task="store"><span class="task-copy"><strong>ร้านค้า</strong><small>ขาย · สต็อก · ค้างรับ · ประวัติ</small></span><span class="task-icon" aria-hidden="true">›</span></button><button type="button" class="task-card" data-income-target="ride" data-task="ride"><span class="task-copy"><strong>งานวิ่ง</strong><small>รายได้ · เครดิต · รอบงาน · ประวัติ</small></span><span class="task-icon" aria-hidden="true">›</span></button><button type="button" class="task-card" data-income-target="other-general"><span class="task-copy"><strong>รายรับอื่น</strong><small>บันทึกรายรับตรงพร้อมที่มา</small></span><span class="task-icon" aria-hidden="true">›</span></button>';
  manualDetailContent.append(routes);

  const summary = document.createElement('div');
  summary.className = 'detail-list';
  manualDetailContent.append(summary);
  try {
    const truth = await ledgerBridge.readLedgerTruth();
    syncDashboardFromTruth(truth);
    summary.append(makeRow('เงินจริง', formatSatang(truth.balanceSatang)), makeRow('เงินเข้าวันนี้', formatSatang(truth.todayInSatang)));
  } catch { summary.append(makeRow('สถานะ', 'ยังอ่านข้อมูลจริงไม่ได้')); }
}

async function renderOtherIncome() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('รายรับอื่น', 'เพิ่มรายรับตรงพร้อมที่มา โดยเขียนผ่าน Runtime และอ่านกลับจาก Ledger ก่อนยืนยัน'));
  const form = document.createElement('form');
  form.className = 'auth-form manual-direct-form';
  form.id = 'manual-income-form';
  form.innerHTML = '<label>จำนวนเงิน (บาท)</label><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required><label>ที่มา</label><input name="source" type="text" maxlength="80" required><button class="primary-button" type="submit">บันทึกรายรับ</button>';
  const status = makeStatus();
  form.append(status);
  manualDetailContent.append(form);
  const list = document.createElement('div');
  list.className = 'detail-list';
  manualDetailContent.append(list);

  async function refresh() {
    list.replaceChildren();
    try {
      const truth = await ledgerBridge.readLedgerTruth();
      syncDashboardFromTruth(truth);
      list.append(makeRow('เงินจริง', formatSatang(truth.balanceSatang)), makeRow('เงินเข้าวันนี้', formatSatang(truth.todayInSatang)));
      const incomes = truth.transactions.filter(item => item.direction === 'IN').slice(0, 20);
      if (!incomes.length) list.append(makeRow('รายการล่าสุด', 'ยังไม่มีรายรับ'));
      for (const item of incomes) list.append(makeRow(item.title || 'รายรับ', formatSatang(item.amountSatang)));
    } catch { list.append(makeRow('สถานะ', 'ยังอ่านข้อมูลจริงไม่ได้')); }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const amountBaht = Number(data.get('amount'));
    const source = String(data.get('source') || '').trim();
    if (!Number.isFinite(amountBaht) || amountBaht <= 0 || !source) return void (status.textContent = 'กรอกจำนวนเงินและที่มาให้ครบ');
    status.textContent = 'กำลังบันทึก…';
    try {
      const result = await ledgerBridge.recordOtherIncome({ workflowId:operationId('WF-LH-MANUAL-INCOME'), ledgerTransactionId:operationId('TX-LH-MANUAL-INCOME'), source, amountBaht });
      syncDashboardFromTruth(result.truth);
      form.reset();
      status.textContent = 'บันทึกแล้ว · อ่านกลับจาก Ledger สำเร็จ';
      await refresh();
    } catch (error) { status.textContent = errorText(error); }
  });
  await refresh();
}

async function renderOutcome() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('Outcome', 'รายจ่ายและภาระเป็นเจ้าของที่นี่ ทุกการเขียนผ่าน Runtime แล้วอ่านกลับก่อนแสดงผล'));

  const expenseForm = document.createElement('form');
  expenseForm.className = 'auth-form manual-direct-form';
  expenseForm.id = 'manual-expense-form';
  expenseForm.innerHTML = '<label>รายจ่าย</label><input name="title" type="text" maxlength="80" placeholder="เช่น ค่าน้ำมัน" required><label>จำนวนเงิน (บาท)</label><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required><button class="primary-button" type="submit">บันทึกรายจ่าย</button>';
  const expenseStatus = makeStatus();
  expenseForm.append(expenseStatus);

  const obligationForm = document.createElement('form');
  obligationForm.className = 'auth-form manual-direct-form';
  obligationForm.id = 'manual-obligation-form';
  obligationForm.innerHTML = '<label>ภาระ</label><input name="title" type="text" maxlength="80" placeholder="เช่น ค่าเช่ารถ" required><label>ยอดทั้งหมด (บาท)</label><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required><label>ครบกำหนด</label><input name="dueDate" type="date" required><button class="primary-button" type="submit">เพิ่มภาระ</button>';
  const obligationStatus = makeStatus();
  obligationForm.append(obligationStatus);
  manualDetailContent.append(expenseForm, obligationForm);

  const list = document.createElement('div');
  list.className = 'detail-list';
  manualDetailContent.append(list);

  async function refresh() {
    list.replaceChildren();
    try {
      const [truth, calendar] = await Promise.all([ledgerBridge.readLedgerTruth(), ledgerBridge.readCalendarTruth()]);
      syncDashboardFromTruth(truth);
      list.append(makeRow('เงินออกวันนี้', formatSatang(truth.todayOutSatang)));
      const outcomes = truth.transactions.filter(item => item.direction === 'OUT').slice(0, 10);
      for (const item of outcomes) list.append(makeRow(item.title || 'รายจ่าย', `-${formatSatang(item.amountSatang)}`));
      if (!outcomes.length) list.append(makeRow('รายการรายจ่าย', 'ยังไม่มีรายจ่าย'));
      for (const obligation of truth.obligations || []) {
        const card = document.createElement('form');
        card.className = 'auth-form manual-direct-form manual-obligation-payment';
        const queue = calendar.records.find(record => String(record.detail || '') === `LEDGER/${obligation.recordId}` && ['OPEN','PARTIAL'].includes(record.status));
        const due = obligation.dueDate ? ` · ${obligation.dueDate}` : '';
        card.append(makeRow(obligation.title || 'ภาระ', `${formatSatang(obligation.remainingSatang)}${due}`));
        if (queue && Number(obligation.remainingSatang) > 0) {
          card.innerHTML += `<input name="amount" type="number" min="0.01" max="${Number(obligation.remainingSatang) / 100}" step="0.01" value="${Number(obligation.remainingSatang) / 100}" inputmode="decimal" required><button class="primary-button" type="submit">จ่ายภาระ</button>`;
          const payStatus = makeStatus();
          card.append(payStatus);
          card.addEventListener('submit', async event => {
            event.preventDefault();
            const amountBaht = Number(new FormData(card).get('amount'));
            payStatus.textContent = 'กำลังจ่าย…';
            try {
              const result = await ledgerBridge.payObligation({ workflowId:operationId('WF-LH-MANUAL-PAY'), obligationId:obligation.recordId, queueId:queue.recordId, ledgerTransactionId:operationId('TX-LH-MANUAL-PAY'), amountBaht });
              syncDashboardFromTruth(result.truth);
              payStatus.textContent = 'จ่ายแล้ว · Ledger และ Calendar ตรงกัน';
              await refresh();
            } catch (error) { payStatus.textContent = errorText(error); }
          });
        } else if (obligation.status === 'COMPLETED') card.append(makeRow('สถานะ', 'จ่ายครบแล้ว'));
        list.append(card);
      }
      if (!(truth.obligations || []).length) list.append(makeRow('ภาระ', 'ยังไม่มีภาระ'));
    } catch { list.append(makeRow('สถานะ', 'ยังอ่านข้อมูลจริงไม่ได้')); }
  }

  expenseForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(expenseForm);
    const title = String(data.get('title') || '').trim();
    const amountBaht = Number(data.get('amount'));
    expenseStatus.textContent = 'กำลังบันทึก…';
    try {
      const result = await ledgerBridge.recordExpense({ workflowId:operationId('WF-LH-MANUAL-EXPENSE'), ledgerTransactionId:operationId('TX-LH-MANUAL-EXPENSE'), title, amountBaht });
      syncDashboardFromTruth(result.truth);
      expenseForm.reset();
      expenseStatus.textContent = 'บันทึกแล้ว · อ่านกลับจาก Ledger สำเร็จ';
      await refresh();
    } catch (error) { expenseStatus.textContent = errorText(error); }
  });

  obligationForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(obligationForm);
    const title = String(data.get('title') || '').trim();
    const amountBaht = Number(data.get('amount'));
    const dueDate = String(data.get('dueDate') || '').trim();
    obligationStatus.textContent = 'กำลังเพิ่มภาระ…';
    try {
      const id = operationId('OB-LH-MANUAL');
      const result = await ledgerBridge.createObligation({ workflowId:operationId('WF-LH-MANUAL-OBLIGATION'), obligationId:id, queueId:operationId('CAL-LH-MANUAL-OBLIGATION'), title, amountBaht, dueDate });
      syncDashboardFromTruth(result.truth);
      obligationForm.reset();
      obligationStatus.textContent = 'เพิ่มแล้ว · Owner และ Calendar อ่านกลับตรงกัน';
      await refresh();
    } catch (error) { obligationStatus.textContent = errorText(error); }
  });

  await refresh();
}

async function renderCalendar() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('Calendar', 'มุมมองตามเวลา อ่านรายการจาก Owner จริง และส่งการเปลี่ยนกลับไปที่ Runtime'));
  const list = document.createElement('div');
  list.className = 'detail-list';
  manualDetailContent.append(list);
  try {
    const calendar = await ledgerBridge.readCalendarTruth();
    if (!calendar.records.length) return void list.append(makeRow('ปฏิทิน', 'ยังไม่มีรายการ'));
    for (const record of calendar.records) {
      const card = document.createElement('form');
      card.className = 'auth-form manual-direct-form manual-calendar-record';
      card.append(makeRow(record.title || record.type || 'รายการ', `${record.dueDate || '—'} · ${record.status || '—'}`));
      const date = document.createElement('input');
      date.name = 'dueDate';
      date.type = 'date';
      date.value = record.dueDate || '';
      const reschedule = document.createElement('button');
      reschedule.type = 'submit';
      reschedule.className = 'secondary-button';
      reschedule.textContent = 'เลื่อนวัน';
      const status = makeStatus();
      card.append(date, reschedule);
      const ownerControlled = ['PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT','RECEIVE_CUSTOMER_PAYMENT'].includes(record.type);
      if (!ownerControlled && ['OPEN','PARTIAL'].includes(record.status)) {
        const complete = document.createElement('button');
        complete.type = 'button';
        complete.className = 'primary-button';
        complete.textContent = 'เสร็จแล้ว';
        complete.addEventListener('click', async () => {
          status.textContent = 'กำลังอัปเดต…';
          try { await ledgerBridge.setCalendarStatus({ workflowId:operationId('WF-LH-CALENDAR-STATUS'), queueId:record.recordId, status:'COMPLETED' }); status.textContent = 'อัปเดตแล้ว'; await renderCalendar(); } catch (error) { status.textContent = errorText(error); }
        });
        card.append(complete);
      } else if (ownerControlled) card.append(makeRow('การจ่าย/รับเงิน', 'จัดการที่ Owner ของรายการ'));
      card.append(status);
      card.addEventListener('submit', async event => {
        event.preventDefault();
        const dueDate = String(new FormData(card).get('dueDate') || '');
        status.textContent = 'กำลังเลื่อนวัน…';
        try { await ledgerBridge.rescheduleCalendar({ workflowId:operationId('WF-LH-CALENDAR-RESCHEDULE'), queueId:record.recordId, dueDate }); status.textContent = 'เลื่อนวันแล้ว'; await renderCalendar(); } catch (error) { status.textContent = errorText(error); }
      });
      list.append(card);
    }
  } catch { list.append(makeRow('สถานะ', 'ยังอ่านข้อมูลจริงไม่ได้')); }
}

root?.addEventListener('click', event => {
  const incomeTarget = event.target.closest?.('[data-income-target]')?.dataset.incomeTarget;
  if (incomeTarget === 'other-general') {
    event.preventDefault();
    event.stopImmediatePropagation();
    void renderOtherIncome();
    return;
  }

  const task = event.target.closest?.('[data-task]')?.dataset.task;
  if (!['income','outcome','calendar'].includes(task)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (task === 'income') void renderIncome();
  else if (task === 'outcome') void renderOutcome();
  else void renderCalendar();
}, true);

let shellWasVisible = false;
const observer = new MutationObserver(() => {
  queueMicrotask(() => {
    ensureVisibleRoot();
    const visible = Boolean(appShell && !appShell.hidden);
    if (visible && !shellWasVisible) void refreshDashboard();
    shellWasVisible = visible;
  });
});
if (appShell) observer.observe(appShell, { subtree:true, attributes:true, attributeFilter:['hidden'] });
ensureVisibleRoot();
