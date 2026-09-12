export const READ_STATE = Object.freeze({
  READY:'READY',
  EMPTY:'EMPTY',
  UNAVAILABLE:'UNAVAILABLE',
});

function unavailableFinance() {
  return Object.freeze({
    status:READ_STATE.UNAVAILABLE,
    cashSatang:null,
    todayIncomeSatang:null,
    todayExpenseSatang:null,
    netSatang:null,
  });
}

function safeInteger(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch {
    return null;
  }
}

export function projectFinanceView(ledgerTruth) {
  if (!ledgerTruth || typeof ledgerTruth !== 'object') return unavailableFinance();
  const cashSatang = safeInteger(ledgerTruth.balanceSatang);
  const todayIncomeSatang = safeInteger(ledgerTruth.todayInSatang);
  const todayExpenseSatang = safeInteger(ledgerTruth.todayOutSatang);
  const netSatang = safeInteger(ledgerTruth.netSatang);
  if ([cashSatang,todayIncomeSatang,todayExpenseSatang,netSatang].some(value => value === null)) {
    return unavailableFinance();
  }
  return Object.freeze({
    status:READ_STATE.READY,
    cashSatang,
    todayIncomeSatang,
    todayExpenseSatang,
    netSatang,
  });
}

export function projectStoreView(storeTruth) {
  const unavailable = () => Object.freeze({
    status:READ_STATE.UNAVAILABLE,
    products:Object.freeze([]),
    legacyUnassignedQuantity:null,
  });
  if (!storeTruth || typeof storeTruth !== 'object' || !Array.isArray(storeTruth.products)) return unavailable();
  const legacyUnassignedQuantity = safeInteger(storeTruth.legacyUnassignedQuantity);
  if (legacyUnassignedQuantity === null || legacyUnassignedQuantity < 0) return unavailable();
  for (const product of storeTruth.products) {
    if (!product || typeof product !== 'object') return unavailable();
    if (!Number.isSafeInteger(product.quantity) || product.quantity < 0) return unavailable();
    if (product.descriptors != null && !Array.isArray(product.descriptors)) return unavailable();
  }
  const products = clone(storeTruth.products);
  if (!products) return unavailable();
  const frozenProducts = Object.freeze(products.map(product => Object.freeze(product)));
  return Object.freeze({
    status:frozenProducts.length === 0 && legacyUnassignedQuantity === 0 ? READ_STATE.EMPTY : READ_STATE.READY,
    products:frozenProducts,
    legacyUnassignedQuantity,
  });
}

export function projectRideView(rideTruth) {
  const unavailable = () => Object.freeze({
    status:READ_STATE.UNAVAILABLE,
    recordCount:null,
    todayRoundState:null,
    generatedSatang:null,
    cashJobSatang:null,
    creditJobSatang:null,
    expenseSatang:null,
    pendingCreditSatang:null,
  });
  if (!rideTruth || typeof rideTruth !== 'object') return unavailable();
  const recordCount = safeInteger(rideTruth.recordCount);
  const generatedSatang = safeInteger(rideTruth.generatedSatang);
  const cashJobSatang = safeInteger(rideTruth.cashJobSatang);
  const creditJobSatang = safeInteger(rideTruth.creditJobSatang);
  const expenseSatang = safeInteger(rideTruth.expenseSatang);
  const pendingCreditSatang = safeInteger(rideTruth.pendingCreditSatang);
  const todayRoundState = String(rideTruth.todayRoundState || '');
  if (recordCount === null || recordCount < 0 || !['NOT_STARTED','ACTIVE','COMPLETED'].includes(todayRoundState)) return unavailable();
  if ([generatedSatang,cashJobSatang,creditJobSatang,expenseSatang,pendingCreditSatang].some(value => value === null || value < 0)) return unavailable();
  return Object.freeze({
    status:recordCount === 0 ? READ_STATE.EMPTY : READ_STATE.READY,
    recordCount,
    todayRoundState,
    generatedSatang,
    cashJobSatang,
    creditJobSatang,
    expenseSatang,
    pendingCreditSatang,
  });
}

export function projectCalendarView(calendarTruth) {
  const unavailable = () => Object.freeze({
    status:READ_STATE.UNAVAILABLE,
    total:null,
    byStatus:Object.freeze({}),
    records:Object.freeze([]),
  });
  if (!calendarTruth || typeof calendarTruth !== 'object' || !Array.isArray(calendarTruth.records)) return unavailable();
  const total = safeInteger(calendarTruth.total);
  if (total === null || total < 0 || total !== calendarTruth.records.length) return unavailable();
  const byStatus = clone(calendarTruth.byStatus);
  const records = clone(calendarTruth.records);
  if (!byStatus || typeof byStatus !== 'object' || Array.isArray(byStatus) || !records) return unavailable();
  for (const [status, count] of Object.entries(byStatus)) {
    if (!status || !Number.isSafeInteger(count) || count < 0) return unavailable();
  }
  for (const record of records) {
    if (!record || typeof record !== 'object' || !String(record.recordId || '').trim()) return unavailable();
  }
  return Object.freeze({
    status:total === 0 ? READ_STATE.EMPTY : READ_STATE.READY,
    total,
    byStatus:Object.freeze(byStatus),
    records:Object.freeze(records.map(record => Object.freeze(record))),
  });
}

export function projectLedgerHistoryView(ledgerTruth) {
  const unavailable = () => Object.freeze({
    status:READ_STATE.UNAVAILABLE,
    transactions:Object.freeze([]),
  });
  if (!ledgerTruth || typeof ledgerTruth !== 'object' || !Array.isArray(ledgerTruth.transactions)) return unavailable();
  const transactions = clone(ledgerTruth.transactions);
  if (!transactions) return unavailable();
  const frozenTransactions = Object.freeze(transactions.map(transaction => Object.freeze(transaction)));
  return Object.freeze({
    status:frozenTransactions.length === 0 ? READ_STATE.EMPTY : READ_STATE.READY,
    transactions:frozenTransactions,
  });
}

export function projectUnavailableView(message) {
  const text = String(message ?? '').trim() || 'ยังไม่เชื่อมข้อมูลจริง';
  return Object.freeze({ status:READ_STATE.UNAVAILABLE, message:text });
}
