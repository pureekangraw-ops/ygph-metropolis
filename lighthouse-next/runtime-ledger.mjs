import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { projectFinancialTruth } from '../greenfield/calculation-authority.mjs';

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
  async function readRideTruth() { return withSession(async runtime => buildRideTruth(runtime, await runtime.readState())); }
  async function readCalendarTruth() { return withSession(async runtime => buildCalendarTruth(runtime, await runtime.readState())); }

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

  return Object.freeze({ readLedgerTruth, readRideTruth, readCalendarTruth, recordOtherIncome, recordExpense, createObligation, payObligation, rescheduleCalendar, setCalendarStatus });
}
