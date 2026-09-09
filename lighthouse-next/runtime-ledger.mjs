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

  return Object.freeze({ readLedgerTruth, recordOtherIncome });
}
