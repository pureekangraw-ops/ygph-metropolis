import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { projectFinancialTruth, projectReceivableTruth, projectGeneratedIncome } from '../greenfield/calculation-authority.mjs';

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function bahtToSatang(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('LIGHTHOUSE_AMOUNT_INVALID');
  const satang = Math.round(amount * 100);
  if (!Number.isSafeInteger(satang) || satang <= 0 || Math.abs((satang / 100) - amount) > 1e-9) throw new Error('LIGHTHOUSE_AMOUNT_INVALID');
  return satang;
}

function ledgerRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records || {}).map(entry => entry?.record).filter(Boolean);
}

function duplicateCommand(error) {
  return String(error?.message || error || '').startsWith('DUPLICATE_COMMAND:');
}

function ledgerRecord(state, recordId) {
  return state?.domains?.LEDGER?.records?.[recordId]?.record || null;
}

function storeRecord(state, recordId) {
  return state?.domains?.STORE?.records?.[recordId]?.record || null;
}

function calendarRecord(state, recordId) {
  return state?.domains?.CALENDAR?.records?.[recordId]?.record || null;
}

function verifyTransaction(state, { ledgerTransactionId, direction, detail, title, amountSatang, sourceRef }) {
  const record = ledgerRecord(state, ledgerTransactionId);
  if (!record || record.type !== 'TRANSACTION' || record.direction !== direction || record.detail !== detail ||
      Number(record.amountSatang) !== amountSatang || String(record.title || '') !== title ||
      String(record.sourceRef || '') !== sourceRef) throw new Error('LIGHTHOUSE_LEDGER_READBACK_MISMATCH');
  return record;
}

function buildTruth(runtime, state, projectFinancial, now) {
  if (!state) throw new Error('LIGHTHOUSE_LEDGER_STATE_REQUIRED');
  const projection = runtime.project();
  const balanceSatang = Number(projection?.ledgerBalanceSatang);
  if (!Number.isSafeInteger(balanceSatang)) throw new Error('LIGHTHOUSE_LEDGER_BALANCE_INVALID');
  const finance = projectFinancial(state, balanceSatang, now());
  const todayInSatang = Number(finance?.todayInSatang);
  const todayOutSatang = Number(finance?.todayOutSatang);
  if (!Number.isSafeInteger(todayInSatang) || !Number.isSafeInteger(todayOutSatang)) throw new Error('LIGHTHOUSE_LEDGER_DAILY_TRUTH_INVALID');
  const all = ledgerRecords(state);
  const transactions = all.filter(record => record?.type === 'TRANSACTION').map(record => structuredClone(record)).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const obligations = all.filter(record => record?.type === 'OBLIGATION').map(record => structuredClone(record)).sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
  return Object.freeze({ revision:state.revision ?? null, balanceSatang, todayInSatang, todayOutSatang, netSatang:todayInSatang - todayOutSatang, transactions:Object.freeze(transactions), obligations:Object.freeze(obligations) });
}

function buildIncomeTruth(runtime, state, projectFinancial, now) {
  const cash = buildTruth(runtime, state, projectFinancial, now);
  const projection = projectReceivableTruth(state);
  const receivables = projection.items.map(item => {
    const sale = storeRecord(state, item.saleId);
    return Object.freeze({
      ...structuredClone(item),
      receivedSatang:Number.isSafeInteger(Number(sale?.receivedSatang)) ? Number(sale.receivedSatang) : 0,
      totalSatang:Number.isSafeInteger(Number(sale?.totalSatang ?? sale?.amountSatang)) ? Number(sale.totalSatang ?? sale.amountSatang) : null,
      status:sale?.status ?? null,
    });
  });
  return Object.freeze({ ...cash, outstandingReceivableSatang:Number(projection.totalOutstandingSatang || 0), receivables:Object.freeze(receivables) });
}

function bangkokDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('LIGHTHOUSE_DATE_INVALID');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function goalBahtToSatang(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('LIGHTHOUSE_DAILY_GOAL_INVALID');
  const satang = Math.round(amount * 100);
  if (!Number.isSafeInteger(satang) || satang < 0 || Math.abs((satang / 100) - amount) > 1e-9) {
    throw new Error('LIGHTHOUSE_DAILY_GOAL_INVALID');
  }
  return satang;
}

function buildPlanningTruth(runtime, state, projectFinancial, now) {
  if (!state) throw new Error('LIGHTHOUSE_PLANNING_STATE_REQUIRED');
  const at = now();
  const date = bangkokDateKey(at);
  const projection = runtime.project();
  const balanceSatang = Number(projection?.ledgerBalanceSatang);
  if (!Number.isSafeInteger(balanceSatang)) throw new Error('LIGHTHOUSE_LEDGER_BALANCE_INVALID');

  const finance = projectFinancial(state, balanceSatang, at);
  const spendableBalanceSatang = Number(finance?.spendableBalanceSatang ?? finance?.cashBalanceSatang);
  if (!Number.isSafeInteger(spendableBalanceSatang) || spendableBalanceSatang < 0) {
    throw new Error('LIGHTHOUSE_SPENDABLE_BALANCE_INVALID');
  }

  const generated = projectGeneratedIncome(state, date);
  const generatedTodaySatang = Number(generated.combinedSatang || 0);
  if (!Number.isSafeInteger(generatedTodaySatang) || generatedTodaySatang < 0) {
    throw new Error('LIGHTHOUSE_GENERATED_INCOME_INVALID');
  }

  const receivables = projectReceivableTruth(state);
  const outstandingReceivableSatang = Number(receivables.totalOutstandingSatang || 0);
  if (!Number.isSafeInteger(outstandingReceivableSatang) || outstandingReceivableSatang < 0) {
    throw new Error('LIGHTHOUSE_RECEIVABLE_PROJECTION_INVALID');
  }

  const ride = buildRideTruth(runtime, state);
  const pendingRideCreditSatang = Number(ride.pendingCreditSatang || 0);
  const expectedIncomingSatang = outstandingReceivableSatang + pendingRideCreditSatang;
  if (!Number.isSafeInteger(expectedIncomingSatang)) throw new Error('LIGHTHOUSE_EXPECTED_INCOME_INVALID');

  const rawGoal = state?.meta?.dailyGoals?.[date]?.goalSatang;
  const goalSatang = rawGoal === undefined || rawGoal === null ? null : Number(rawGoal);
  if (goalSatang !== null && (!Number.isSafeInteger(goalSatang) || goalSatang < 0)) {
    throw new Error('LIGHTHOUSE_DAILY_GOAL_INVALID');
  }

  const queues = Object.values(state?.domains?.CALENDAR?.records || {})
    .map(entry => entry?.record)
    .filter(record => record && ['PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT'].includes(record.type) && ['OPEN','PARTIAL'].includes(record.status))
    .filter(record => /^\d{4}-\d{2}-\d{2}$/.test(String(record.dueDate || '')))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || String(a.recordId || '').localeCompare(String(b.recordId || '')));
  const queue = queues[0] || null;
  let nextObligation = null;
  if (queue) {
    const ownerId = String(queue.detail || '').startsWith('LEDGER/') ? String(queue.detail).slice('LEDGER/'.length) : null;
    const owner = ownerId ? ledgerRecord(state, ownerId) : null;
    const amountSatang = Number(queue.amountSatang || owner?.remainingSatang || 0);
    if (!Number.isSafeInteger(amountSatang) || amountSatang < 0) throw new Error('LIGHTHOUSE_OBLIGATION_PROJECTION_INVALID');
    nextObligation = Object.freeze({
      recordId:owner?.recordId ?? ownerId ?? null,
      queueId:queue.recordId,
      title:owner?.title || queue.title || 'ภาระ',
      dueDate:queue.dueDate,
      amountSatang,
      canPayNow:spendableBalanceSatang >= amountSatang,
    });
  }

  return Object.freeze({
    date,
    goalSatang,
    generatedTodaySatang,
    goalGapSatang:goalSatang === null ? null : Math.max(0, goalSatang - generatedTodaySatang),
    outstandingReceivableSatang,
    pendingRideCreditSatang,
    expectedIncomingSatang,
    spendableBalanceSatang,
    nextObligation,
  });
}

function verifyReceivablePayment(state, before, { saleId, queueId, ledgerTransactionId, amountSatang, recovered }) {
  const sale = storeRecord(state, saleId);
  if (!sale || sale.type !== 'SALE') throw new Error('LIGHTHOUSE_RECEIVABLE_READBACK_MISMATCH');
  const record = ledgerRecord(state, ledgerTransactionId);
  if (!record || record.type !== 'TRANSACTION' || record.direction !== 'IN' || record.detail !== 'IN:SALE_RECEIPT' ||
      Number(record.amountSatang) !== amountSatang || String(record.sourceRef || '') !== `STORE/${saleId}`) {
    throw new Error('LIGHTHOUSE_LEDGER_READBACK_MISMATCH');
  }
  const queue = calendarRecord(state, queueId);
  if (!queue || queue.type !== 'RECEIVE_CUSTOMER_PAYMENT' || String(queue.detail || '') !== `STORE/${saleId}` ||
      !['PARTIAL','COMPLETED'].includes(String(queue.status || ''))) {
    throw new Error('LIGHTHOUSE_CALENDAR_READBACK_MISMATCH');
  }

  if (!recovered) {
    const beforeSale = storeRecord(before, saleId);
    const beforeQueue = calendarRecord(before, queueId);
    const beforeReceived = Number(beforeSale?.receivedSatang ?? 0);
    const beforeOutstanding = Number(beforeSale?.outstandingSatang ?? ((beforeSale?.totalSatang ?? beforeSale?.amountSatang ?? 0) - beforeReceived));
    const beforeQueueAmount = Number(beforeQueue?.amountSatang ?? 0);
    const beforeQueuePaid = Number(beforeQueue?.paidSatang ?? 0);
    if (!beforeSale || beforeSale.type !== 'SALE' || !beforeQueue || beforeQueue.type !== 'RECEIVE_CUSTOMER_PAYMENT' ||
        ![beforeReceived,beforeOutstanding,beforeQueueAmount,beforeQueuePaid].every(Number.isSafeInteger) ||
        Number(sale.receivedSatang) !== beforeReceived + amountSatang ||
        Number(sale.outstandingSatang) !== beforeOutstanding - amountSatang ||
        Number(queue.amountSatang) !== beforeQueueAmount - amountSatang ||
        Number(queue.paidSatang) !== beforeQueuePaid + amountSatang) {
      throw new Error('LIGHTHOUSE_RECEIVABLE_READBACK_MISMATCH');
    }
  } else {
    const received = Number(sale.receivedSatang);
    const outstanding = Number(sale.outstandingSatang);
    const paid = Number(queue.paidSatang ?? 0);
    const remaining = Number(queue.amountSatang ?? 0);
    if (![received,outstanding,paid,remaining].every(Number.isSafeInteger) || received < amountSatang || paid < amountSatang || outstanding < 0 || remaining < 0) {
      throw new Error('LIGHTHOUSE_RECEIVABLE_READBACK_MISMATCH');
    }
  }
  return { sale, record, queue };
}

function assertLedgerReversalAllowed(state, originalRecordId, reversalRecordId) {
  const original = ledgerRecord(state, originalRecordId);
  if (!original || original.type !== 'TRANSACTION' || original.reversalOf || String(original.sourceRef || '') !== 'LEDGER/MANUAL') {
    throw new Error('LIGHTHOUSE_LEDGER_REVERSAL_NOT_ALLOWED');
  }
  const reversals = ledgerRecords(state).filter(record => record?.reversalOf === originalRecordId);
  const conflicting = reversals.find(record => record.recordId !== reversalRecordId);
  if (conflicting) throw new Error('LIGHTHOUSE_LEDGER_REVERSAL_NOT_ALLOWED');
  const existing = ledgerRecord(state, reversalRecordId);
  if (existing && (existing.type !== 'TRANSACTION' || existing.reversalOf !== originalRecordId)) {
    throw new Error('LIGHTHOUSE_LEDGER_REVERSAL_NOT_ALLOWED');
  }
  return { original, existing };
}

function verifyLedgerReversal(state, beforeOriginal, { originalRecordId, reversalRecordId, reason }) {
  const original = ledgerRecord(state, originalRecordId);
  const reversal = ledgerRecord(state, reversalRecordId);
  const expectedDirection = beforeOriginal.direction === 'IN' ? 'OUT' : 'IN';
  if (!original || JSON.stringify(original) !== JSON.stringify(beforeOriginal)) throw new Error('LIGHTHOUSE_LEDGER_READBACK_MISMATCH');
  if (!reversal || reversal.type !== 'TRANSACTION' || reversal.reversalOf !== originalRecordId ||
      reversal.direction !== expectedDirection || reversal.detail !== `${expectedDirection}:REVERSAL` ||
      Number(reversal.amountSatang) !== Number(beforeOriginal.amountSatang) || reversal.status !== 'COMPLETED' ||
      String(reversal.sourceRef || '') !== String(beforeOriginal.sourceRef || '') || String(reversal.reversalReason || '') !== reason) {
    throw new Error('LIGHTHOUSE_LEDGER_READBACK_MISMATCH');
  }
  const reversals = ledgerRecords(state).filter(record => record?.reversalOf === originalRecordId);
  if (reversals.length !== 1 || reversals[0].recordId !== reversalRecordId) throw new Error('LIGHTHOUSE_LEDGER_READBACK_MISMATCH');
  return { original, reversal };
}

function validNonNegativeSatang(value, code) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(code);
  return amount;
}

function buildRideTruth(runtime, state) {
  if (!state) throw new Error('LIGHTHOUSE_RIDE_STATE_REQUIRED');
  const projection = runtime.project()?.ride;
  if (!projection || typeof projection !== 'object') throw new Error('LIGHTHOUSE_RIDE_PROJECTION_INVALID');
  const records = Object.values(state?.domains?.RIDE?.records || {}).map(entry => entry?.record).filter(Boolean);
  const todayRoundState = String(projection.todayRoundState || '');
  if (!['NOT_STARTED','ACTIVE','COMPLETED'].includes(todayRoundState)) throw new Error('LIGHTHOUSE_RIDE_PROJECTION_INVALID');
  return Object.freeze({ revision:state.revision ?? null, recordCount:records.length, todayRoundState, generatedSatang:validNonNegativeSatang(projection.generatedSatang, 'LIGHTHOUSE_RIDE_PROJECTION_INVALID'), cashJobSatang:validNonNegativeSatang(projection.cashJobSatang, 'LIGHTHOUSE_RIDE_PROJECTION_INVALID'), creditJobSatang:validNonNegativeSatang(projection.creditJobSatang, 'LIGHTHOUSE_RIDE_PROJECTION_INVALID'), expenseSatang:validNonNegativeSatang(projection.expenseSatang, 'LIGHTHOUSE_RIDE_PROJECTION_INVALID'), pendingCreditSatang:validNonNegativeSatang(projection.pendingCreditSatang, 'LIGHTHOUSE_RIDE_PROJECTION_INVALID') });
}

function buildCalendarTruth(runtime, state) {
  if (!state) throw new Error('LIGHTHOUSE_CALENDAR_STATE_REQUIRED');
  const projection = runtime.project()?.calendar;
  if (!projection || typeof projection !== 'object') throw new Error('LIGHTHOUSE_CALENDAR_PROJECTION_INVALID');
  const total = Number(projection.total);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('LIGHTHOUSE_CALENDAR_PROJECTION_INVALID');
  const rawByStatus = projection.byStatus;
  if (!rawByStatus || typeof rawByStatus !== 'object' || Array.isArray(rawByStatus)) throw new Error('LIGHTHOUSE_CALENDAR_PROJECTION_INVALID');
  const byStatus = {};
  for (const [status, countValue] of Object.entries(rawByStatus)) {
    const count = Number(countValue);
    if (!status || !Number.isSafeInteger(count) || count < 0) throw new Error('LIGHTHOUSE_CALENDAR_PROJECTION_INVALID');
    byStatus[status] = count;
  }
  const records = Object.values(state?.domains?.CALENDAR?.records || {}).map(entry => entry?.record).filter(Boolean).map(record => structuredClone(record)).sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')) || String(a.recordId || '').localeCompare(String(b.recordId || '')));
  if (records.length !== total) throw new Error('LIGHTHOUSE_CALENDAR_READBACK_MISMATCH');
  return Object.freeze({ revision:state.revision ?? null, total, byStatus:Object.freeze(byStatus), records:Object.freeze(records.map(record => Object.freeze(record))) });
}

export function createLighthouseLedgerBridge(deps = {}) {
  const withSession = deps.withSession ?? withRuntimeSession;
  const projectFinancial = deps.projectFinancial ?? projectFinancialTruth;
  const now = deps.now ?? (() => new Date());

  async function readLedgerTruth() { return withSession(async runtime => buildTruth(runtime, await runtime.readState(), projectFinancial, now)); }
  async function readIncomeTruth() { return withSession(async runtime => buildIncomeTruth(runtime, await runtime.readState(), projectFinancial, now)); }
  async function readRideTruth() { return withSession(async runtime => buildRideTruth(runtime, await runtime.readState())); }
  async function readCalendarTruth() { return withSession(async runtime => buildCalendarTruth(runtime, await runtime.readState())); }

  async function readPlanningTruth() {
    return withSession(async runtime => buildPlanningTruth(runtime, await runtime.readState(), projectFinancial, now));
  }

  async function setDailyGoal({ goalBaht } = {}) {
    const goalSatang = goalBahtToSatang(goalBaht);
    return withSession(async runtime => {
      const date = bangkokDateKey(now());
      const before = await runtime.readState();
      if (!before) throw new Error('LIGHTHOUSE_PLANNING_STATE_REQUIRED');
      const existing = before?.meta?.dailyGoals?.[date];
      if (existing) await runtime.overrideDailyGoal({ date, goalSatang });
      else await runtime.ensureDailyGoal({ date, suggestedSatang:goalSatang });
      const state = await runtime.readState();
      const readback = Number(state?.meta?.dailyGoals?.[date]?.goalSatang);
      if (!Number.isSafeInteger(readback) || readback !== goalSatang) {
        throw new Error('LIGHTHOUSE_DAILY_GOAL_READBACK_MISMATCH');
      }
      return Object.freeze({
        status:'VERIFIED',
        date,
        goalSatang:readback,
        source:String(state?.meta?.dailyGoals?.[date]?.source || ''),
      });
    });
  }

  async function recordOtherIncome({ workflowId, ledgerTransactionId, source, amountBaht } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_WORKFLOW_ID_REQUIRED');
    const transaction = requiredText(ledgerTransactionId, 'LIGHTHOUSE_LEDGER_TRANSACTION_ID_REQUIRED');
    const title = requiredText(source, 'LIGHTHOUSE_INCOME_SOURCE_REQUIRED');
    const amountSatang = bahtToSatang(amountBaht);
    return withSession(async runtime => {
      let recovered = false;
      try { await runtime.otherIncome({ workflowId:workflow, ledgerTransactionId:transaction, title, amountSatang }); } catch (error) { if (!duplicateCommand(error)) throw error; recovered = true; }
      const state = await runtime.readState();
      const record = verifyTransaction(state, { ledgerTransactionId:transaction, direction:'IN', detail:'IN:OTHER_INCOME', title, amountSatang, sourceRef:'LEDGER/MANUAL' });
      return Object.freeze({ status:'VERIFIED', recovered, record:structuredClone(record), truth:buildTruth(runtime, state, projectFinancial, now) });
    });
  }

  async function receiveReceivablePayment({ workflowId, saleId, queueId, ledgerTransactionId, amountBaht } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_WORKFLOW_ID_REQUIRED');
    const sale = requiredText(saleId, 'LIGHTHOUSE_SALE_ID_REQUIRED');
    const queue = requiredText(queueId, 'LIGHTHOUSE_QUEUE_ID_REQUIRED');
    const transaction = requiredText(ledgerTransactionId, 'LIGHTHOUSE_LEDGER_TRANSACTION_ID_REQUIRED');
    const amountSatang = bahtToSatang(amountBaht);
    return withSession(async runtime => {
      const before = await runtime.readState();
      const existing = ledgerRecord(before, transaction);
      let recovered = Boolean(existing);
      if (!existing) {
        try {
          await runtime.receiveCustomerPayment({ workflowId:workflow, saleId:sale, queueId:queue, ledgerTransactionId:transaction, amountSatang });
        } catch (error) {
          if (!duplicateCommand(error)) throw error;
          recovered = true;
        }
      }
      const state = await runtime.readState();
      const verified = verifyReceivablePayment(state, before, { saleId:sale, queueId:queue, ledgerTransactionId:transaction, amountSatang, recovered });
      return Object.freeze({
        status:'VERIFIED', recovered,
        sale:structuredClone(verified.sale),
        record:structuredClone(verified.record),
        queue:structuredClone(verified.queue),
        incomeTruth:buildIncomeTruth(runtime, state, projectFinancial, now),
      });
    });
  }

  async function recordExpense({ workflowId, ledgerTransactionId, title, amountBaht } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_WORKFLOW_ID_REQUIRED');
    const transaction = requiredText(ledgerTransactionId, 'LIGHTHOUSE_LEDGER_TRANSACTION_ID_REQUIRED');
    const expenseTitle = requiredText(title, 'LIGHTHOUSE_EXPENSE_TITLE_REQUIRED');
    const amountSatang = bahtToSatang(amountBaht);
    return withSession(async runtime => {
      let recovered = false;
      try { await runtime.expense({ workflowId:workflow, ledgerTransactionId:transaction, title:expenseTitle, amountSatang }); } catch (error) { if (!duplicateCommand(error)) throw error; recovered = true; }
      const state = await runtime.readState();
      const record = verifyTransaction(state, { ledgerTransactionId:transaction, direction:'OUT', detail:'OUT:EXPENSE', title:expenseTitle, amountSatang, sourceRef:'LEDGER/MANUAL' });
      return Object.freeze({ status:'VERIFIED', recovered, record:structuredClone(record), truth:buildTruth(runtime, state, projectFinancial, now) });
    });
  }

  async function reverseLedgerTransaction({ workflowId, originalRecordId, reversalRecordId, reason } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_WORKFLOW_ID_REQUIRED');
    const originalId = requiredText(originalRecordId, 'LIGHTHOUSE_ORIGINAL_RECORD_ID_REQUIRED');
    const reversalId = requiredText(reversalRecordId, 'LIGHTHOUSE_REVERSAL_RECORD_ID_REQUIRED');
    const reversalReason = requiredText(reason, 'LIGHTHOUSE_REVERSAL_REASON_REQUIRED');
    return withSession(async runtime => {
      const before = await runtime.readState();
      const allowed = assertLedgerReversalAllowed(before, originalId, reversalId);
      let recovered = Boolean(allowed.existing);
      if (!allowed.existing) {
        try {
          await runtime.reverseLedgerTransaction({ workflowId:workflow, originalRecordId:originalId, reversalRecordId:reversalId, reason:reversalReason });
        } catch (error) {
          if (!duplicateCommand(error)) throw error;
          recovered = true;
        }
      }
      const state = await runtime.readState();
      const verified = verifyLedgerReversal(state, allowed.original, { originalRecordId:originalId, reversalRecordId:reversalId, reason:reversalReason });
      return Object.freeze({
        status:'VERIFIED', recovered,
        original:structuredClone(verified.original),
        reversal:structuredClone(verified.reversal),
        truth:buildTruth(runtime, state, projectFinancial, now),
      });
    });
  }

  async function createObligation({ workflowId, obligationId, queueId, title, amountBaht, dueDate, detail = '' } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_WORKFLOW_ID_REQUIRED');
    const obligation = requiredText(obligationId, 'LIGHTHOUSE_OBLIGATION_ID_REQUIRED');
    const queue = requiredText(queueId, 'LIGHTHOUSE_QUEUE_ID_REQUIRED');
    const obligationTitle = requiredText(title, 'LIGHTHOUSE_OBLIGATION_TITLE_REQUIRED');
    const due = requiredText(dueDate, 'LIGHTHOUSE_DUE_DATE_REQUIRED');
    const totalSatang = bahtToSatang(amountBaht);
    return withSession(async runtime => {
      let recovered = false;
      try { await runtime.obligation({ workflowId:workflow, obligationId:obligation, title:obligationTitle, totalSatang, installments:[{ queueId:queue, amountSatang:totalSatang, dueDate:due }], detail:String(detail || '') }); } catch (error) { if (!duplicateCommand(error)) throw error; recovered = true; }
      const state = await runtime.readState();
      const owner = ledgerRecord(state, obligation);
      const calendar = calendarRecord(state, queue);
      if (!owner || owner.type !== 'OBLIGATION' || owner.title !== obligationTitle || Number(owner.originalSatang) !== totalSatang || Number(owner.remainingSatang) !== totalSatang || owner.status !== 'OPEN') throw new Error('LIGHTHOUSE_OBLIGATION_READBACK_MISMATCH');
      if (!calendar || !['PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT'].includes(calendar.type) || String(calendar.detail || '') !== `LEDGER/${obligation}` || Number(calendar.amountSatang) !== totalSatang || calendar.dueDate !== due || calendar.status !== 'OPEN') throw new Error('LIGHTHOUSE_CALENDAR_READBACK_MISMATCH');
      return Object.freeze({ status:'VERIFIED', recovered, obligation:structuredClone(owner), queue:structuredClone(calendar), truth:buildTruth(runtime, state, projectFinancial, now), calendarTruth:buildCalendarTruth(runtime, state) });
    });
  }

  async function payObligation({ workflowId, obligationId, queueId, ledgerTransactionId, amountBaht } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_WORKFLOW_ID_REQUIRED');
    const obligation = requiredText(obligationId, 'LIGHTHOUSE_OBLIGATION_ID_REQUIRED');
    const queue = requiredText(queueId, 'LIGHTHOUSE_QUEUE_ID_REQUIRED');
    const transaction = requiredText(ledgerTransactionId, 'LIGHTHOUSE_LEDGER_TRANSACTION_ID_REQUIRED');
    const amountSatang = bahtToSatang(amountBaht);
    return withSession(async runtime => {
      await runtime.payObligation({ workflowId:workflow, obligationId:obligation, queueId:queue, ledgerTransactionId:transaction, amountSatang });
      const state = await runtime.readState();
      const owner = ledgerRecord(state, obligation);
      const calendar = calendarRecord(state, queue);
      const tx = ledgerRecord(state, transaction);
      if (!owner || owner.type !== 'OBLIGATION' || Number(owner.paidSatang) < amountSatang || Number(owner.remainingSatang) < 0 || !['PARTIAL','COMPLETED'].includes(owner.status)) throw new Error('LIGHTHOUSE_OBLIGATION_READBACK_MISMATCH');
      if (!calendar || !['PARTIAL','COMPLETED'].includes(calendar.status)) throw new Error('LIGHTHOUSE_CALENDAR_READBACK_MISMATCH');
      if (!tx || tx.type !== 'TRANSACTION' || tx.direction !== 'OUT' || tx.detail !== 'OUT:OBLIGATION_PAYMENT' || Number(tx.amountSatang) !== amountSatang || String(tx.sourceRef || '') !== `LEDGER/${obligation}`) throw new Error('LIGHTHOUSE_LEDGER_READBACK_MISMATCH');
      return Object.freeze({ status:'VERIFIED', obligation:structuredClone(owner), queue:structuredClone(calendar), record:structuredClone(tx), truth:buildTruth(runtime, state, projectFinancial, now), calendarTruth:buildCalendarTruth(runtime, state) });
    });
  }

  async function rescheduleCalendar({ workflowId, queueId, dueDate } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_WORKFLOW_ID_REQUIRED');
    const queue = requiredText(queueId, 'LIGHTHOUSE_QUEUE_ID_REQUIRED');
    const due = requiredText(dueDate, 'LIGHTHOUSE_DUE_DATE_REQUIRED');
    return withSession(async runtime => {
      await runtime.calendarReschedule({ workflowId:workflow, queueId:queue, dueDate:due });
      const state = await runtime.readState();
      const record = calendarRecord(state, queue);
      if (!record || record.dueDate !== due) throw new Error('LIGHTHOUSE_CALENDAR_READBACK_MISMATCH');
      return Object.freeze({ status:'VERIFIED', record:structuredClone(record), calendarTruth:buildCalendarTruth(runtime, state) });
    });
  }

  async function setCalendarStatus({ workflowId, queueId, status } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_WORKFLOW_ID_REQUIRED');
    const queue = requiredText(queueId, 'LIGHTHOUSE_QUEUE_ID_REQUIRED');
    const nextStatus = requiredText(status, 'LIGHTHOUSE_CALENDAR_STATUS_REQUIRED');
    return withSession(async runtime => {
      await runtime.calendarStatus({ workflowId:workflow, queueId:queue, status:nextStatus });
      const state = await runtime.readState();
      const record = calendarRecord(state, queue);
      if (!record || record.status !== nextStatus) throw new Error('LIGHTHOUSE_CALENDAR_READBACK_MISMATCH');
      return Object.freeze({ status:'VERIFIED', record:structuredClone(record), calendarTruth:buildCalendarTruth(runtime, state) });
    });
  }

  return Object.freeze({ readLedgerTruth, readIncomeTruth, readRideTruth, readCalendarTruth, readPlanningTruth, setDailyGoal, recordOtherIncome, receiveReceivablePayment, recordExpense, reverseLedgerTransaction, createObligation, payObligation, rescheduleCalendar, setCalendarStatus });
}
