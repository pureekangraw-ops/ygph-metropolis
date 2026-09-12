import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { projectFinancialTruth } from '../greenfield/calculation-authority.mjs';

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function bahtToSatang(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('LIGHTHOUSE_INCOME_AMOUNT_INVALID');
  const satang = Math.round(amount * 100);
  if (!Number.isSafeInteger(satang) || satang <= 0 || Math.abs((satang / 100) - amount) > 1e-9) {
    throw new Error('LIGHTHOUSE_INCOME_AMOUNT_INVALID');
  }
  return satang;
}

function ledgerRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records || {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION');
}

function duplicateCommand(error) {
  return String(error?.message || error || '').startsWith('DUPLICATE_COMMAND:');
}

function verifyOtherIncome(state, { ledgerTransactionId, source, amountSatang }) {
  const record = state?.domains?.LEDGER?.records?.[ledgerTransactionId]?.record;
  if (!record || record.type !== 'TRANSACTION' || record.direction !== 'IN' ||
      record.detail !== 'IN:OTHER_INCOME' || Number(record.amountSatang) !== amountSatang ||
      String(record.title || '') !== source || String(record.sourceRef || '') !== 'LEDGER/MANUAL') {
    throw new Error('LIGHTHOUSE_LEDGER_READBACK_MISMATCH');
  }
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
  if (!Number.isSafeInteger(todayInSatang) || !Number.isSafeInteger(todayOutSatang)) {
    throw new Error('LIGHTHOUSE_LEDGER_DAILY_TRUTH_INVALID');
  }
  const transactions = ledgerRecords(state)
    .map(record => structuredClone(record))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return Object.freeze({
    revision:state.revision ?? null,
    balanceSatang,
    todayInSatang,
    todayOutSatang,
    netSatang:todayInSatang - todayOutSatang,
    transactions:Object.freeze(transactions),
  });
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
  const records = Object.values(state?.domains?.RIDE?.records || {})
    .map(entry => entry?.record)
    .filter(Boolean);
  const todayRoundState = String(projection.todayRoundState || '');
  if (!['NOT_STARTED','ACTIVE','COMPLETED'].includes(todayRoundState)) throw new Error('LIGHTHOUSE_RIDE_PROJECTION_INVALID');
  return Object.freeze({
    revision:state.revision ?? null,
    recordCount:records.length,
    todayRoundState,
    generatedSatang:validNonNegativeSatang(projection.generatedSatang, 'LIGHTHOUSE_RIDE_PROJECTION_INVALID'),
    cashJobSatang:validNonNegativeSatang(projection.cashJobSatang, 'LIGHTHOUSE_RIDE_PROJECTION_INVALID'),
    creditJobSatang:validNonNegativeSatang(projection.creditJobSatang, 'LIGHTHOUSE_RIDE_PROJECTION_INVALID'),
    expenseSatang:validNonNegativeSatang(projection.expenseSatang, 'LIGHTHOUSE_RIDE_PROJECTION_INVALID'),
    pendingCreditSatang:validNonNegativeSatang(projection.pendingCreditSatang, 'LIGHTHOUSE_RIDE_PROJECTION_INVALID'),
  });
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
  const records = Object.values(state?.domains?.CALENDAR?.records || {})
    .map(entry => entry?.record)
    .filter(Boolean)
    .map(record => structuredClone(record))
    .sort((a, b) => {
      const due = String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
      return due || String(a.recordId || '').localeCompare(String(b.recordId || ''));
    });
  if (records.length !== total) throw new Error('LIGHTHOUSE_CALENDAR_READBACK_MISMATCH');
  return Object.freeze({
    revision:state.revision ?? null,
    total,
    byStatus:Object.freeze(byStatus),
    records:Object.freeze(records.map(record => Object.freeze(record))),
  });
}

export function createLighthouseLedgerBridge(deps = {}) {
  const withSession = deps.withSession ?? withRuntimeSession;
  const projectFinancial = deps.projectFinancial ?? projectFinancialTruth;
  const now = deps.now ?? (() => new Date());

  async function readLedgerTruth() {
    return withSession(async runtime => {
      const state = await runtime.readState();
      return buildTruth(runtime, state, projectFinancial, now);
    });
  }

  async function readRideTruth() {
    return withSession(async runtime => {
      const state = await runtime.readState();
      return buildRideTruth(runtime, state);
    });
  }

  async function readCalendarTruth() {
    return withSession(async runtime => {
      const state = await runtime.readState();
      return buildCalendarTruth(runtime, state);
    });
  }

  async function recordOtherIncome({ workflowId, ledgerTransactionId, source, amountBaht } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_WORKFLOW_ID_REQUIRED');
    const transaction = requiredText(ledgerTransactionId, 'LIGHTHOUSE_LEDGER_TRANSACTION_ID_REQUIRED');
    const title = requiredText(source, 'LIGHTHOUSE_INCOME_SOURCE_REQUIRED');
    const amountSatang = bahtToSatang(amountBaht);

    return withSession(async runtime => {
      let recovered = false;
      try {
        await runtime.otherIncome({
          workflowId:workflow,
          ledgerTransactionId:transaction,
          title,
          amountSatang,
        });
      } catch (error) {
        if (!duplicateCommand(error)) throw error;
        recovered = true;
      }
      const state = await runtime.readState();
      if (!state) throw new Error('LIGHTHOUSE_LEDGER_STATE_REQUIRED');
      const record = verifyOtherIncome(state, {
        ledgerTransactionId:transaction,
        source:title,
        amountSatang,
      });
      const truth = buildTruth(runtime, state, projectFinancial, now);
      return Object.freeze({ status:'VERIFIED', recovered, record:structuredClone(record), truth });
    });
  }

  return Object.freeze({ readLedgerTruth, readRideTruth, readCalendarTruth, recordOtherIncome });
}
