import { assertGreenfieldState } from './core.mjs';

function ledgerRecords(state) {
  assertGreenfieldState(state);
  return Object.values(state.domains.LEDGER.records).map(entry => entry?.record).filter(Boolean);
}

function transactionDirection(record) {
  if (record.direction === 'IN' || record.direction === 'OUT') return record.direction;
  const prefix = String(record.detail || '').split(':', 1)[0];
  if (prefix === 'IN' || prefix === 'OUT') return prefix;
  throw new Error(`LEDGER_DIRECTION_UNKNOWN:${record.recordId || record.id || '?'}`);
}

export function projectLedgerBalance(state) {
  const records = ledgerRecords(state);
  const snapshot = records.find(record => record.type === 'CURRENT_BALANCE');
  let balance = Number(snapshot?.calculation?.openingBalanceSatang || 0);
  if (!Number.isSafeInteger(balance)) throw new Error('INVALID_LEDGER_OPENING_BALANCE');
  for (const record of records) {
    if (record.type !== 'TRANSACTION' || record.status === 'CANCELLED') continue;
    const amount = Number(record.amountSatang);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`INVALID_LEDGER_AMOUNT:${record.recordId || record.id || '?'}`);
    balance += transactionDirection(record) === 'IN' ? amount : -amount;
  }
  return balance;
}

export function checkLedgerSnapshot(state) {
  const records = ledgerRecords(state);
  const snapshot = records.find(record => record.type === 'CURRENT_BALANCE');
  if (!snapshot) throw new Error('LEDGER_CURRENT_SNAPSHOT_MISSING');
  const snapshotBalanceSatang = Number(snapshot.amountSatang);
  if (!Number.isSafeInteger(snapshotBalanceSatang)) throw new Error('INVALID_LEDGER_SNAPSHOT_BALANCE');
  const calculatedBalanceSatang = projectLedgerBalance(state);
  return {
    status: calculatedBalanceSatang === snapshotBalanceSatang ? 'PASS' : 'MISMATCH',
    calculatedBalanceSatang,
    snapshotBalanceSatang,
  };
}

export function projectCalendarSummary(state) {
  assertGreenfieldState(state);
  const records = Object.values(state.domains.CALENDAR.records).map(entry => entry?.record).filter(Boolean);
  const byStatus = {};
  for (const record of records) {
    const status = String(record.status || 'UNKNOWN');
    byStatus[status] = Number(byStatus[status] || 0) + 1;
  }
  return { total: records.length, byStatus };
}
