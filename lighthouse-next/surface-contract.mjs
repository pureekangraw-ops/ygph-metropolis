import { createLighthouseLedgerBridge } from './runtime-ledger.mjs';
import { createLighthouseStoreBridge } from './runtime-store.mjs';
import { projectCalendarMonth, shiftCalendarMonth } from './calendar-month.mjs';
import { createStableMutationAttempt, mutationErrorNeedsVerification } from './mutation-retry.mjs';

const root = document.querySelector('#demo-root');
const appShell = root?.querySelector('#app-shell');
const manualNav = root?.querySelector('[data-root-target="manual"]');
const manualHub = root?.querySelector('#manual-hub');
const manualDetail = root?.querySelector('#manual-detail');
const manualDetailContent = root?.querySelector('#manual-detail-content');
const ledgerBridge = createLighthouseLedgerBridge();
const storeBridge = createLighthouseStoreBridge();

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

function syncDashboardFromPlanning(truth) {
  const expected = root.querySelector('#home-expected-value');
  const obligationTitle = root.querySelector('#home-obligation-title');
  const obligationDue = root.querySelector('#home-obligation-due');
  const obligationValue = root.querySelector('#home-obligation-value');
  const gap = root.querySelector('#home-gap-value');
  const target = root.querySelector('#home-target-value');

  if (expected) expected.textContent = formatSatang(truth.expectedIncomingSatang);
  if (truth.nextObligation) {
    if (obligationTitle) obligationTitle.textContent = truth.nextObligation.title;
    if (obligationDue) obligationDue.textContent = truth.nextObligation.dueDate;
    if (obligationValue) obligationValue.textContent = formatSatang(truth.nextObligation.amountSatang);
  } else {
    if (obligationTitle) obligationTitle.textContent = 'ยังไม่มีภาระค้าง';
    if (obligationDue) obligationDue.textContent = '—';
    if (obligationValue) obligationValue.textContent = '—';
  }
  if (target) target.textContent = truth.goalSatang == null ? 'ยังไม่มีเป้า' : formatSatang(truth.goalSatang);
  if (gap) gap.textContent = truth.goalGapSatang == null ? '—' : formatSatang(truth.goalGapSatang);
}

async function refreshDashboard() {
  if (!appShell || appShell.hidden) return;
  try { syncDashboardFromTruth(await ledgerBridge.readLedgerTruth()); } catch {}
  try { syncDashboardFromPlanning(await ledgerBridge.readPlanningTruth()); } catch {}
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

function createManualAttempt(prefixes) {
  return createStableMutationAttempt({ createId:operationId, prefixes });
}

function handleManualMutationFailure(attempt, error, status) {
  const code = String(error?.message || error || '');
  if (code === 'LIGHTHOUSE_MUTATION_RETRY_PAYLOAD_LOCKED') {
    if (status) status.textContent = 'รายการเดิมยังรอตรวจกลับ · กรุณาลองซ้ำด้วยข้อมูลเดิมก่อน';
    return;
  }
  if (mutationErrorNeedsVerification(error)) {
    try { attempt.markVerificationPending(); } catch {}
    if (status) status.textContent = 'รายการอาจบันทึกแล้วแต่ยังตรวจกลับไม่ได้ · ลองซ้ำด้วยข้อมูลเดิม';
    return;
  }
  attempt.clear();
  if (status) status.textContent = errorText(error);
}

async function renderIncome() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('Income', 'เงินเข้าทุกทางยังอยู่กับ Owner เดิม แต่รวมภาพคาดว่าจะเข้าและเป้าวันนี้ไว้ที่เดียว'));

  const routes = document.createElement('div');
  routes.className = 'task-grid income-route-grid';
  routes.dataset.incomeRoutes = '';
  routes.innerHTML = '<button type="button" class="task-card" data-income-target="store" data-task="store"><span class="task-copy"><strong>ร้านค้า</strong><small>ขาย · สต็อก · ค้างรับ · ประวัติ</small></span><span class="task-icon" aria-hidden="true">›</span></button><button type="button" class="task-card" data-income-target="ride" data-task="ride"><span class="task-copy"><strong>งานวิ่ง</strong><small>รายได้ · เครดิต · รอบงาน · ประวัติ</small></span><span class="task-icon" aria-hidden="true">›</span></button><button type="button" class="task-card" data-income-target="other-general"><span class="task-copy"><strong>รายรับอื่น</strong><small>บันทึกรายรับตรงพร้อมที่มา</small></span><span class="task-icon" aria-hidden="true">›</span></button>';
  manualDetailContent.append(routes);

  const goalForm = document.createElement('form');
  goalForm.className = 'auth-form manual-direct-form';
  goalForm.id = 'manual-daily-goal-form';
  goalForm.innerHTML = '<label>เป้ารายได้วันนี้ (บาท)</label><input name="goal" type="number" min="0" step="0.01" inputmode="decimal" required><button class="secondary-button" type="submit">บันทึกเป้าวันนี้</button>';
  const goalStatus = makeStatus();
  goalForm.append(goalStatus);
  manualDetailContent.append(goalForm);

  const summary = document.createElement('div');
  summary.className = 'detail-list';
  manualDetailContent.append(summary);

  async function refresh() {
    summary.replaceChildren();
    try {
      const [incomeTruth, rideTruth, planning] = await Promise.all([
        ledgerBridge.readIncomeTruth(),
        ledgerBridge.readRideTruth(),
        ledgerBridge.readPlanningTruth(),
      ]);
      syncDashboardFromTruth(incomeTruth);
      syncDashboardFromPlanning(planning);
      const goalInput = goalForm.elements.namedItem('goal');
      if (goalInput && document.activeElement !== goalInput) goalInput.value = planning.goalSatang == null ? '' : String(planning.goalSatang / 100);

      summary.append(
        makeRow('เงินจริง', formatSatang(incomeTruth.balanceSatang)),
        makeRow('เงินเข้าวันนี้', formatSatang(incomeTruth.todayInSatang)),
        makeRow('ลูกหนี้ร้าน', formatSatang(incomeTruth.outstandingReceivableSatang)),
        makeRow('เครดิตงานวิ่งค้าง', formatSatang(rideTruth.pendingCreditSatang)),
        makeRow('คาดว่าจะเข้า', formatSatang(planning.expectedIncomingSatang)),
        makeRow('เป้าที่สร้างได้วันนี้', formatSatang(planning.generatedTodaySatang)),
      );
      if (!incomeTruth.receivables.length) summary.append(makeRow('ลูกหนี้', 'ไม่มีรายการค้างรับ'));
      for (const item of incomeTruth.receivables.slice(0, 10)) {
        const outstandingSatang = Number(item.outstandingSatang);
        const amount = Number.isSafeInteger(outstandingSatang) ? formatSatang(outstandingSatang) : 'ต้องตรวจสอบ';
        const card = document.createElement('form');
        card.className = 'auth-form manual-direct-form manual-receivable-payment';
        card.append(makeRow(item.title || 'ลูกหนี้จากการขาย', amount));

        if (item.queueState === 'SCHEDULED' && item.queueId && Number.isSafeInteger(outstandingSatang) && outstandingSatang > 0) {
          card.innerHTML += `<input name="amount" type="number" min="0.01" max="${outstandingSatang / 100}" step="0.01" value="${outstandingSatang / 100}" inputmode="decimal" required><button class="primary-button" type="submit">รับชำระ</button>`;
          const payStatus = makeStatus();
          card.append(payStatus);
          const paymentAttempt = createManualAttempt({
            workflowId:'WF-LH-MANUAL-RECEIVABLE',
            ledgerTransactionId:'TX-LH-MANUAL-RECEIVABLE',
          });
          card.addEventListener('submit', async event => {
            event.preventDefault();
            const amountBaht = Number(new FormData(card).get('amount'));
            payStatus.textContent = 'กำลังรับชำระ…';
            try {
              const ids = paymentAttempt.acquire({ saleId:item.saleId, queueId:item.queueId, amountBaht });
              const result = await ledgerBridge.receiveReceivablePayment({
                ...ids,
                saleId:item.saleId,
                queueId:item.queueId,
                amountBaht,
              });
              paymentAttempt.clear();
              syncDashboardFromTruth(result.incomeTruth);
              payStatus.textContent = 'รับชำระแล้ว · Store, Ledger และ Calendar อ่านกลับตรงกัน';
              await refresh();
            } catch (error) {
              handleManualMutationFailure(paymentAttempt, error, payStatus);
            }
          });
        } else if (item.queueState === 'VERIFY_DUPLICATE') {
          card.append(makeRow('สถานะ', 'พบคิวรับชำระซ้ำ · ต้องตรวจ Calendar ก่อน'));
        } else {
          card.append(makeRow('สถานะ', 'ยังไม่มีคิวรับชำระที่ปลอดภัย'));
        }
        summary.append(card);
      }
    } catch {
      summary.append(makeRow('สถานะ', 'ยังอ่านข้อมูลจริงไม่ได้'));
    }
  }

  goalForm.addEventListener('submit', async event => {
    event.preventDefault();
    const goalBaht = Number(new FormData(goalForm).get('goal'));
    goalStatus.textContent = 'กำลังบันทึกเป้า…';
    try {
      await ledgerBridge.setDailyGoal({ goalBaht });
      goalStatus.textContent = 'บันทึกแล้ว · อ่านกลับจาก Runtime สำเร็จ';
      await refresh();
    } catch (error) {
      goalStatus.textContent = errorText(error);
    }
  });

  await refresh();
}

async function renderOtherIncome() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('รายรับอื่น', 'เพิ่มรายรับตรงพร้อมที่มา โดยเขียนผ่าน Runtime และอ่านกลับจาก Ledger ก่อนยืนยัน'));
  const form = document.createElement('form');
  form.className = 'auth-form manual-direct-form';
  form.id = 'manual-income-form';
  form.innerHTML = '<label>จำนวนเงิน (บาท)</label><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required><label>ที่มา</label><input name="source" type="text" maxlength="80" required><button class="primary-button" type="submit">บันทึกรายรับ</button>';
  const status = makeStatus();
  const incomeAttempt = createManualAttempt({
    workflowId:'WF-LH-MANUAL-INCOME',
    ledgerTransactionId:'TX-LH-MANUAL-INCOME',
  });
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
      const ids = incomeAttempt.acquire({ source, amountBaht });
      const result = await ledgerBridge.recordOtherIncome({ ...ids, source, amountBaht });
      incomeAttempt.clear();
      syncDashboardFromTruth(result.truth);
      form.reset();
      status.textContent = 'บันทึกแล้ว · อ่านกลับจาก Ledger สำเร็จ';
      await refresh();
    } catch (error) { handleManualMutationFailure(incomeAttempt, error, status); }
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
  const expenseAttempt = createManualAttempt({
    workflowId:'WF-LH-MANUAL-EXPENSE',
    ledgerTransactionId:'TX-LH-MANUAL-EXPENSE',
  });
  const obligationAttempt = createManualAttempt({
    workflowId:'WF-LH-MANUAL-OBLIGATION',
    obligationId:'OB-LH-MANUAL',
    queueId:'CAL-LH-MANUAL-OBLIGATION',
  });
  obligationForm.append(obligationStatus);
  manualDetailContent.append(expenseForm, obligationForm);

  const list = document.createElement('div');
  list.className = 'detail-list';
  manualDetailContent.append(list);

  async function refresh() {
    list.replaceChildren();
    try {
      const [truth, calendar, planning, ride] = await Promise.all([
        ledgerBridge.readLedgerTruth(),
        ledgerBridge.readCalendarTruth(),
        ledgerBridge.readPlanningTruth(),
        ledgerBridge.readRideTruth(),
      ]);
      syncDashboardFromTruth(truth);
      syncDashboardFromPlanning(planning);
      list.append(
        makeRow('เงินออกวันนี้', formatSatang(truth.todayOutSatang)),
        makeRow('ใช้ได้ตอนนี้', formatSatang(planning.spendableBalanceSatang)),
        makeRow('เพดานใช้จ่าย', planning.spendingCeilingStatus === 'OWNER_RULE_REQUIRED' ? 'ยังไม่ได้กำหนดกติกา' : planning.spendingCeilingSatang == null ? '—' : formatSatang(planning.spendingCeilingSatang)),
        makeRow('ค่าใช้จ่ายงานวิ่ง', formatSatang(ride.expenseSatang)),
      );
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
          const payAttempt = createManualAttempt({
            workflowId:'WF-LH-MANUAL-PAY',
            ledgerTransactionId:'TX-LH-MANUAL-PAY',
          });
          card.append(payStatus);
          card.addEventListener('submit', async event => {
            event.preventDefault();
            const amountBaht = Number(new FormData(card).get('amount'));
            payStatus.textContent = 'กำลังจ่าย…';
            try {
              const ids = payAttempt.acquire({ obligationId:obligation.recordId, queueId:queue.recordId, amountBaht });
              const result = await ledgerBridge.payObligation({ ...ids, obligationId:obligation.recordId, queueId:queue.recordId, amountBaht });
              payAttempt.clear();
              syncDashboardFromTruth(result.truth);
              payStatus.textContent = 'จ่ายแล้ว · Ledger และ Calendar ตรงกัน';
              await refresh();
            } catch (error) { handleManualMutationFailure(payAttempt, error, payStatus); }
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
      const ids = expenseAttempt.acquire({ title, amountBaht });
      const result = await ledgerBridge.recordExpense({ ...ids, title, amountBaht });
      expenseAttempt.clear();
      syncDashboardFromTruth(result.truth);
      expenseForm.reset();
      expenseStatus.textContent = 'บันทึกแล้ว · อ่านกลับจาก Ledger สำเร็จ';
      await refresh();
    } catch (error) { handleManualMutationFailure(expenseAttempt, error, expenseStatus); }
  });

  obligationForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(obligationForm);
    const title = String(data.get('title') || '').trim();
    const amountBaht = Number(data.get('amount'));
    const dueDate = String(data.get('dueDate') || '').trim();
    obligationStatus.textContent = 'กำลังเพิ่มภาระ…';
    try {
      const ids = obligationAttempt.acquire({ title, amountBaht, dueDate });
      const result = await ledgerBridge.createObligation({ ...ids, title, amountBaht, dueDate });
      obligationAttempt.clear();
      syncDashboardFromTruth(result.truth);
      obligationForm.reset();
      obligationStatus.textContent = 'เพิ่มแล้ว · Owner และ Calendar อ่านกลับตรงกัน';
      await refresh();
    } catch (error) { handleManualMutationFailure(obligationAttempt, error, obligationStatus); }
  });

  await refresh();
}


async function renderStore() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('ร้านค้า', 'สต็อกอ่านใหม่จาก Store Owner ทุกครั้ง ไม่ใช้ snapshot ตอนเข้าสู่แอป'));
  const list = document.createElement('div');
  list.className = 'detail-list';
  manualDetailContent.append(list);
  try {
    const truth = await storeBridge.readStoreTruth();
    list.append(makeRow('สต็อกรวม', `${Number(truth.stockQuantity || 0)} ชิ้น`));
    if (Number(truth.legacyUnassignedQuantity || 0) > 0) {
      list.append(makeRow('สต็อกเดิมที่ยังไม่ผูกสินค้า', `${Number(truth.legacyUnassignedQuantity)} ชิ้น`));
    }
    if (!truth.products.length) list.append(makeRow('สินค้า', 'ยังไม่มีสินค้า'));
    for (const product of truth.products) {
      const identity = [product.name, product.model, product.color, ...(product.descriptors || [])].filter(Boolean).join(' · ');
      list.append(makeRow(identity || 'สินค้า', `เหลือ ${Number(product.quantity || 0)} ชิ้น`));
    }
  } catch {
    list.append(makeRow('สถานะ', 'ยังอ่าน Store Owner ไม่ได้'));
  }
}

async function renderRide() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('งานวิ่ง', 'รายได้ เครดิต และค่าใช้จ่ายอ่านใหม่จาก Ride Owner ทุกครั้ง'));
  const list = document.createElement('div');
  list.className = 'detail-list';
  manualDetailContent.append(list);
  try {
    const truth = await ledgerBridge.readRideTruth();
    const stateLabel = truth.todayRoundState === 'ACTIVE' ? 'กำลังวิ่ง' : truth.todayRoundState === 'COMPLETED' ? 'จบรอบแล้ว' : 'ยังไม่เริ่มรอบ';
    list.append(
      makeRow('รอบวันนี้', stateLabel),
      makeRow('รายได้วันนี้', formatSatang(truth.generatedSatang)),
      makeRow('เงินสด', formatSatang(truth.cashJobSatang)),
      makeRow('เครดิต', formatSatang(truth.creditJobSatang)),
      makeRow('ค่าใช้จ่าย', formatSatang(truth.expenseSatang)),
      makeRow('เครดิตค้างรับ', formatSatang(truth.pendingCreditSatang)),
    );
  } catch {
    list.append(makeRow('สถานะ', 'ยังอ่าน Ride Owner ไม่ได้'));
  }
}

function ledgerTransactionValue(transaction) {
  const amount = formatSatang(transaction.amountSatang);
  return transaction.direction === 'OUT' ? `-${amount}` : `+${amount}`;
}

async function renderLedger() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('Ledger', 'เงินจริงและประวัติอ่านใหม่จาก Ledger Owner การย้อนรายการใช้ Runtime + readback เท่านั้น'));
  const list = document.createElement('div');
  list.className = 'detail-list';
  manualDetailContent.append(list);

  async function refresh() {
    list.replaceChildren();
    try {
      const truth = await ledgerBridge.readLedgerTruth();
      syncDashboardFromTruth(truth);
      list.append(
        makeRow('เงินจริง', formatSatang(truth.balanceSatang)),
        makeRow('เงินเข้าวันนี้', formatSatang(truth.todayInSatang)),
        makeRow('เงินออกวันนี้', formatSatang(truth.todayOutSatang)),
      );
      if (!truth.transactions.length) {
        list.append(makeRow('ประวัติ', 'ยังไม่มีรายการ'));
        return;
      }

      const reversedIds = new Set(truth.transactions.map(item => item?.reversalOf).filter(Boolean));
      for (const transaction of truth.transactions.slice(0, 30)) {
        const card = document.createElement('div');
        card.className = 'auth-form manual-direct-form manual-ledger-record';
        card.append(makeRow(transaction.title || 'รายการเงิน', ledgerTransactionValue(transaction)));

        const reversible = String(transaction.sourceRef || '') === 'LEDGER/MANUAL' &&
          !transaction.reversalOf && !reversedIds.has(transaction.recordId);
        if (reversible) {
          const form = document.createElement('form');
          form.className = 'manual-ledger-reversal';
          form.innerHTML = '<label>เหตุผลการย้อนรายการ</label><input name="reason" type="text" maxlength="120" required><button class="secondary-button" type="submit">ย้อนรายการ</button>';
          const status = makeStatus();
          const attempt = createManualAttempt({
            workflowId:'WF-LH-MANUAL-REVERSAL',
            reversalRecordId:'TX-LH-MANUAL-REVERSAL',
          });
          form.append(status);
          form.addEventListener('submit', async event => {
            event.preventDefault();
            const reason = String(new FormData(form).get('reason') || '').trim();
            status.textContent = 'กำลังย้อนรายการ…';
            try {
              const ids = attempt.acquire({ originalRecordId:transaction.recordId, reason });
              const result = await ledgerBridge.reverseLedgerTransaction({
                ...ids,
                originalRecordId:transaction.recordId,
                reason,
              });
              attempt.clear();
              syncDashboardFromTruth(result.truth);
              status.textContent = 'ย้อนรายการแล้ว · Ledger readback ตรงกัน';
              await refresh();
            } catch (error) {
              handleManualMutationFailure(attempt, error, status);
            }
          });
          card.append(form);
        } else if (reversedIds.has(transaction.recordId)) {
          card.append(makeRow('สถานะ', 'ถูกย้อนรายการแล้ว'));
        }
        list.append(card);
      }
    } catch {
      list.append(makeRow('สถานะ', 'ยังอ่าน Ledger Owner ไม่ได้'));
    }
  }

  await refresh();
}

function calendarMonthLabel(year, month) {
  return new Intl.DateTimeFormat('th-TH', { month:'long', year:'numeric', timeZone:'Asia/Bangkok' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

async function renderCalendar() {
  openSurfaceDetail();
  manualDetailContent.append(makeHero('Calendar', 'ปฏิทินรายเดือนอ่านจาก Owner จริง การจ่ายเงินยังกลับไปจัดการที่ Owner ของรายการ'));

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let cursor = { year:now.getFullYear(), month:now.getMonth() + 1 };
  let selectedDate = todayIso;

  const controls = document.createElement('div');
  controls.className = 'calendar-month-controls';
  controls.innerHTML = '<button type="button" class="secondary-button" data-calendar-prev aria-label="เดือนก่อน">‹</button><strong data-calendar-label></strong><button type="button" class="secondary-button" data-calendar-today>วันนี้</button><button type="button" class="secondary-button" data-calendar-next aria-label="เดือนถัดไป">›</button>';
  const grid = document.createElement('div');
  grid.className = 'calendar-month-grid';
  grid.setAttribute('role', 'grid');
  const list = document.createElement('div');
  list.className = 'detail-list calendar-day-detail';
  manualDetailContent.append(controls, grid, list);

  function renderRecordCard(record) {
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
    const rescheduleAttempt = createManualAttempt({ workflowId:'WF-LH-CALENDAR-RESCHEDULE' });
    const statusAttempt = createManualAttempt({ workflowId:'WF-LH-CALENDAR-STATUS' });
    card.append(date, reschedule);
    const ownerControlled = ['PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT','RECEIVE_CUSTOMER_PAYMENT'].includes(record.type);
    if (!ownerControlled && ['OPEN','PARTIAL'].includes(record.status)) {
      const complete = document.createElement('button');
      complete.type = 'button';
      complete.className = 'primary-button';
      complete.textContent = 'เสร็จแล้ว';
      complete.addEventListener('click', async () => {
        status.textContent = 'กำลังอัปเดต…';
        try {
          const ids = statusAttempt.acquire({ queueId:record.recordId, status:'COMPLETED' });
          await ledgerBridge.setCalendarStatus({ ...ids, queueId:record.recordId, status:'COMPLETED' });
          statusAttempt.clear();
          status.textContent = 'อัปเดตแล้ว';
          await draw();
        } catch (error) { handleManualMutationFailure(statusAttempt, error, status); }
      });
      card.append(complete);
    } else if (ownerControlled) {
      const obligationOwner = ['PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT'].includes(record.type);
      const ownerButton = document.createElement('button');
      ownerButton.type = 'button';
      ownerButton.className = 'secondary-button';
      ownerButton.dataset.calendarOwnerRoute = obligationOwner ? 'outcome' : 'income';
      ownerButton.textContent = obligationOwner ? 'ไป Outcome' : 'ไป Income';
      ownerButton.addEventListener('click', () => {
        if (obligationOwner) void renderOutcome();
        else void renderIncome();
      });
      card.append(makeRow('การจ่าย/รับเงิน', 'จัดการที่ Owner ของรายการ'), ownerButton);
    }
    card.append(status);
    card.addEventListener('submit', async event => {
      event.preventDefault();
      const dueDate = String(new FormData(card).get('dueDate') || '');
      status.textContent = 'กำลังเลื่อนวัน…';
      try {
        const ids = rescheduleAttempt.acquire({ queueId:record.recordId, dueDate });
        await ledgerBridge.rescheduleCalendar({ ...ids, queueId:record.recordId, dueDate });
        rescheduleAttempt.clear();
        selectedDate = dueDate || selectedDate;
        status.textContent = 'เลื่อนวันแล้ว';
        await draw();
      } catch (error) { handleManualMutationFailure(rescheduleAttempt, error, status); }
    });
    return card;
  }

  async function draw() {
    grid.replaceChildren();
    list.replaceChildren();
    const label = controls.querySelector('[data-calendar-label]');
    if (label) label.textContent = calendarMonthLabel(cursor.year, cursor.month);
    try {
      const calendar = await ledgerBridge.readCalendarTruth();
      const month = projectCalendarMonth(calendar.records, cursor);
      const weekdays = ['อา','จ','อ','พ','พฤ','ศ','ส'];
      for (const day of weekdays) {
        const head = document.createElement('span');
        head.className = 'calendar-weekday';
        head.textContent = day;
        grid.append(head);
      }
      for (const cell of month.cells) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'calendar-day';
        if (!cell.inMonth) button.classList.add('is-outside-month');
        if (cell.date === selectedDate) button.classList.add('is-selected');
        button.dataset.calendarDate = cell.date;
        button.setAttribute('role', 'gridcell');
        button.innerHTML = `<strong>${Number(cell.date.slice(-2))}</strong>${cell.items.length ? `<small>${cell.items.length} รายการ</small>` : '<small>—</small>'}`;
        button.addEventListener('click', () => { selectedDate = cell.date; void draw(); });
        grid.append(button);
      }
      const selected = month.cells.find(cell => cell.date === selectedDate);
      const records = selected?.items.map(item => item.sourceRecord) || [];
      list.append(makeRow(selectedDate, records.length ? `${records.length} รายการ` : 'ไม่มีรายการ'));
      for (const record of records) list.append(renderRecordCard(record));
    } catch {
      list.append(makeRow('สถานะ', 'ยังอ่านข้อมูลจริงไม่ได้'));
    }
  }

  controls.querySelector('[data-calendar-prev]')?.addEventListener('click', () => {
    cursor = shiftCalendarMonth(cursor, -1);
    selectedDate = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-01`;
    void draw();
  });
  controls.querySelector('[data-calendar-next]')?.addEventListener('click', () => {
    cursor = shiftCalendarMonth(cursor, 1);
    selectedDate = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-01`;
    void draw();
  });
  controls.querySelector('[data-calendar-today]')?.addEventListener('click', () => {
    const today = new Date();
    cursor = { year:today.getFullYear(), month:today.getMonth() + 1 };
    selectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    void draw();
  });

  await draw();
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
  if (!['income','outcome','calendar','ledger','store','ride'].includes(task)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (task === 'income') void renderIncome();
  else if (task === 'outcome') void renderOutcome();
  else if (task === 'calendar') void renderCalendar();
  else if (task === 'ledger') void renderLedger();
  else if (task === 'store') void renderStore();
  else void renderRide();
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