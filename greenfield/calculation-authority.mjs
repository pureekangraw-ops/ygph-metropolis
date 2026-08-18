const DAY_MS = 86400000;
const CLOSED = new Set(['COMPLETED','CANCELLED']);
const OBLIGATION_QUEUE_TYPES = new Set(['PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT']);

function recordsFor(state, domain) {
  return Object.values(state?.domains?.[domain]?.records || {}).map(entry => entry?.record).filter(Boolean);
}

function dateKey(value, timeZone = 'Asia/Bangkok') {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function dateEpoch(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return NaN;
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function dayDistance(from, to) {
  return Math.round((dateEpoch(to) - dateEpoch(from)) / DAY_MS);
}

function activityDate(record) {
  return dateKey(record?.createdAt || record?.occurredAt || record?.date || record?.saleDate || record?.updatedAt);
}

function ledgerDirection(record) {
  if (record?.direction === 'IN' || record?.direction === 'OUT') return record.direction;
  const prefix = String(record?.detail || '').split(':', 1)[0];
  return prefix === 'IN' || prefix === 'OUT' ? prefix : null;
}

function isBalanceAdjustment(record) {
  return record?.subtype === 'BALANCE_ADJUSTMENT' || String(record?.detail || '').endsWith(':BALANCE_ADJUSTMENT');
}

function actionable(status) {
  return status === 'OPEN' || status === 'PARTIAL';
}

export function projectGeneratedIncome(state, today) {
  const day = dateKey(today);
  let storeSatang = 0;
  let rideSatang = 0;
  for (const record of recordsFor(state, 'STORE')) {
    if (record.type !== 'SALE' || record.status === 'CANCELLED' || activityDate(record) !== day) continue;
    const amount = Number(record.totalSatang ?? record.amountSatang ?? 0);
    if (Number.isSafeInteger(amount) && amount > 0) storeSatang += amount;
  }
  for (const record of recordsFor(state, 'RIDE')) {
    if (record.type !== 'JOB' || record.status === 'CANCELLED' || activityDate(record) !== day) continue;
    const amount = Number(record.amountSatang || 0);
    if (Number.isSafeInteger(amount) && amount > 0) rideSatang += amount;
  }
  return { storeSatang, rideSatang, combinedSatang:storeSatang + rideSatang };
}

export function projectReceivableTruth(state) {
  const sales = recordsFor(state, 'STORE').filter(record => record?.type === 'SALE' && record.status !== 'CANCELLED');
  const queues = recordsFor(state, 'CALENDAR').filter(record => record?.type === 'RECEIVE_CUSTOMER_PAYMENT');
  const items = [];
  for (const sale of sales) {
    const related = queues.filter(queue => String(queue.detail || '') === `STORE/${sale.recordId}`);
    const active = related.filter(queue => actionable(queue.status));
    const explicitOutstanding = sale.outstandingSatang;
    if (Number.isSafeInteger(explicitOutstanding)) {
      if (explicitOutstanding <= 0) continue;
      items.push({ saleId:sale.recordId, title:sale.title || 'ลูกหนี้จากการขาย', outstandingSatang:explicitOutstanding,
        queueState:active.length === 0 ? 'UNSCHEDULED' : active.length === 1 ? 'SCHEDULED' : 'VERIFY_DUPLICATE',
        queueId:active.length === 1 ? active[0].recordId : null, truthSource:'SALE' });
      continue;
    }
    if (related.length === 0) continue;
    if (related.length > 1) {
      items.push({ saleId:sale.recordId, title:sale.title || 'ลูกหนี้จากการขาย', outstandingSatang:null,
        queueState:'VERIFY_DUPLICATE', queueId:null, truthSource:'LEGACY_QUEUE_AMBIGUOUS' });
      continue;
    }
    const fallback = related[0];
    const amount = Number(fallback.amountSatang);
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    const isActive = actionable(fallback.status);
    items.push({ saleId:sale.recordId, title:sale.title || 'ลูกหนี้จากการขาย', outstandingSatang:amount,
      queueState:isActive ? 'SCHEDULED' : 'UNSCHEDULED', queueId:isActive ? fallback.recordId : null,
      truthSource:'LEGACY_QUEUE_FALLBACK' });
  }
  return { totalOutstandingSatang:items.reduce((sum,item)=>Number.isSafeInteger(item.outstandingSatang)&&item.outstandingSatang>0?sum+item.outstandingSatang:sum,0), items };
}

export function projectStockTruth(state) {
  let stockQuantity = 0;
  for (const record of recordsFor(state, 'STORE')) {
    if (record.status === 'CANCELLED') continue;
    const quantity = Number(record.quantity || 0);
    if (!Number.isSafeInteger(quantity)) continue;
    if (record.type === 'PURCHASE') stockQuantity += quantity;
    if (record.type === 'SALE' || record.type === 'STOCK_WITHDRAWAL') stockQuantity -= quantity;
    if (record.type === 'STOCK_ADJUSTMENT') stockQuantity += quantity;
  }
  return { stockQuantity };
}

export function projectFinancialTruth(state, ledgerBalanceSatang, today, nearDays = 7) {
  const current = dateKey(today);
  const month = current?.slice(0,7) || '';
  let todayInSatang = 0;
  let todayOutSatang = 0;
  let remainingObligationSatang = 0;
  for (const record of recordsFor(state, 'LEDGER')) {
    if (record.type === 'TRANSACTION' && activityDate(record) === current && !isBalanceAdjustment(record)) {
      const amount = Number(record.amountSatang || 0);
      if (Number.isSafeInteger(amount) && amount > 0) {
        const direction = ledgerDirection(record);
        if (direction === 'IN') todayInSatang += amount;
        if (direction === 'OUT') todayOutSatang += amount;
      }
    }
    if (record.type === 'OBLIGATION' && !CLOSED.has(record.status)) {
      const remaining = Number(record.remainingSatang ?? record.amountSatang ?? 0);
      if (Number.isSafeInteger(remaining) && remaining > 0) remainingObligationSatang += remaining;
    }
  }

  const openQueues = recordsFor(state, 'CALENDAR')
    .filter(record => OBLIGATION_QUEUE_TYPES.has(record.type) && !CLOSED.has(record.status))
    .map(record => ({...record,dueDate:dateKey(record.dueDate),amountSatang:Number(record.amountSatang || 0)}))
    .filter(record => record.dueDate && Number.isSafeInteger(record.amountSatang) && record.amountSatang >= 0)
    .sort((a,b)=>a.dueDate.localeCompare(b.dueDate));

  let monthDueSatang = 0;
  let nearTermDueSatang = 0;
  const byDate = new Map();
  for (const queue of openQueues) {
    if (queue.dueDate.startsWith(month)) monthDueSatang += queue.amountSatang;
    const days = dayDistance(current, queue.dueDate);
    if (Number.isFinite(days) && days <= nearDays) nearTermDueSatang += queue.amountSatang;
    const list = byDate.get(queue.dueDate) || [];
    list.push(queue); byDate.set(queue.dueDate,list);
  }
  const collisionDates = [...byDate.entries()].filter(([,items])=>items.length>1)
    .map(([date,items])=>({date,count:items.length,amountSatang:items.reduce((sum,item)=>sum+item.amountSatang,0)}));
  const cashBalanceSatang = Number.isSafeInteger(Number(ledgerBalanceSatang)) ? Number(ledgerBalanceSatang) : 0;
  const shortfallSatang = Math.max(0, nearTermDueSatang - cashBalanceSatang);
  const first = openQueues[0] || null;
  const nextDue = first ? { recordId:first.recordId, dueDate:first.dueDate, amountSatang:first.amountSatang,
    daysRemaining:dayDistance(current,first.dueDate), canPayNow:cashBalanceSatang >= first.amountSatang } : null;
  return { cashBalanceSatang, spendableBalanceSatang:cashBalanceSatang, todayInSatang, todayOutSatang,
    remainingObligationSatang, monthDueSatang, nearTermDueSatang, shortfallSatang, nextDue, collisionDates };
}

export function projectCalculationAuthority(state, { ledgerBalanceSatang = 0, today, nearDays = 7 } = {}) {
  const generated = projectGeneratedIncome(state,today);
  const receivables = projectReceivableTruth(state);
  const finance = projectFinancialTruth(state,ledgerBalanceSatang,today,nearDays);
  const semanticWarnings = recordsFor(state,'RIDE').length ? ['RIDE_OWNER_SCOPE_VERIFY'] : [];
  return {
    cash:{ balanceSatang:finance.cashBalanceSatang, todayInSatang:finance.todayInSatang, todayOutSatang:finance.todayOutSatang },
    generated:{ storeSatang:generated.storeSatang, rideSatang:generated.rideSatang, totalSatang:generated.combinedSatang },
    receivables:{ totalSatang:receivables.totalOutstandingSatang, items:receivables.items },
    obligations:{ remainingSatang:finance.remainingObligationSatang },
    calendar:{ nearTermDueSatang:finance.nearTermDueSatang, monthDueSatang:finance.monthDueSatang, shortfallSatang:finance.shortfallSatang, nextDue:finance.nextDue, collisionDates:finance.collisionDates },
    semanticWarnings,
  };
}
