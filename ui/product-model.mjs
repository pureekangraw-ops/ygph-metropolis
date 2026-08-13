const DAY_MS = 86400000;
const MONEY_QUEUE_TYPES = new Set(['PAY_OBLIGATION', 'PAY_OBLIGATION_INSTALLMENT', 'RECEIVE_CUSTOMER_PAYMENT']);

export function recordsForDomain(state, domain) {
  return Object.values(state?.domains?.[domain]?.records || {}).map(entry => entry?.record).filter(Boolean);
}

export function dateKey(value, timeZone = 'Asia/Bangkok') {
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

function lifecycleClosed(status) {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

export function deriveTimeState(record, today, nearDays = 7) {
  if (record?.status === 'COMPLETED') return 'COMPLETED';
  if (record?.status === 'CANCELLED') return 'CANCELLED';
  const due = dateKey(record?.dueDate || record?.date || record?.scheduledDate);
  const current = dateKey(today);
  if (!due || !current) return 'FUTURE';
  const days = dayDistance(current, due);
  if (days < 0) return 'OVERDUE';
  if (days === 0) return 'TODAY';
  if (days <= nearDays) return 'NEAR';
  return 'FUTURE';
}

function activityDate(record) {
  return dateKey(record?.createdAt || record?.occurredAt || record?.date || record?.saleDate || record?.updatedAt);
}

export function projectMakeMoney(state, today) {
  const day = dateKey(today);
  let storeSatang = 0;
  let rideSatang = 0;
  for (const record of recordsForDomain(state, 'STORE')) {
    if (record.type !== 'SALE' || activityDate(record) !== day) continue;
    const amount = Number(record.totalSatang ?? record.amountSatang ?? 0);
    if (Number.isSafeInteger(amount) && amount > 0) storeSatang += amount;
  }
  for (const record of recordsForDomain(state, 'RIDE')) {
    if (record.type !== 'JOB' || activityDate(record) !== day) continue;
    const amount = Number(record.amountSatang || 0);
    if (Number.isSafeInteger(amount) && amount > 0) rideSatang += amount;
  }
  return { storeSatang, rideSatang, combinedSatang:storeSatang + rideSatang };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function roundGoal(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 1000) * 1000;
}

export function suggestDailyGoal({ dailyIncome = [], balanceSatang = 0, nearObligations = [], today } = {}) {
  const current = dateKey(today);
  const recentValues = dailyIncome.slice(-7).map(item => Number(item?.amountSatang ?? item ?? 0)).filter(Number.isSafeInteger).map(value => Math.max(0, value));
  const baselineSatang = roundGoal(median(recentValues));
  const open = nearObligations
    .filter(item => !lifecycleClosed(item?.status))
    .map(item => ({ ...item, due:dateKey(item?.dueDate), amount:Number(item?.amountSatang || 0) }))
    .filter(item => item.due && Number.isSafeInteger(item.amount) && item.amount > 0)
    .sort((a,b) => a.due.localeCompare(b.due));
  let cumulative = 0;
  let pressureSatang = 0;
  const available = Math.max(0, Number.isSafeInteger(Number(balanceSatang)) ? Number(balanceSatang) : 0);
  for (const item of open) {
    const days = dayDistance(current, item.due);
    if (!Number.isFinite(days) || days > 7) continue;
    cumulative += item.amount;
    const uncovered = Math.max(0, cumulative - available);
    const dailyNeed = uncovered === 0 ? 0 : Math.ceil(uncovered / Math.max(1, days));
    pressureSatang = Math.max(pressureSatang, roundGoal(dailyNeed));
  }
  return { goalSatang:Math.max(baselineSatang, pressureSatang), baselineSatang, pressureSatang };
}

function ledgerDirection(record) {
  if (record?.direction === 'IN' || record?.direction === 'OUT') return record.direction;
  const prefix = String(record?.detail || '').split(':', 1)[0];
  return prefix === 'IN' || prefix === 'OUT' ? prefix : null;
}

function isObligationQueue(record) {
  return record?.type === 'PAY_OBLIGATION' || record?.type === 'PAY_OBLIGATION_INSTALLMENT';
}

export function projectFinance(state, ledgerBalanceSatang, today, nearDays = 7) {
  const current = dateKey(today);
  const month = current?.slice(0, 7) || '';
  let todayInSatang = 0;
  let todayOutSatang = 0;
  let remainingObligationSatang = 0;
  for (const record of recordsForDomain(state, 'LEDGER')) {
    if (record.type === 'TRANSACTION' && activityDate(record) === current) {
      const amount = Number(record.amountSatang || 0);
      if (Number.isSafeInteger(amount) && amount > 0) {
        const direction = ledgerDirection(record);
        if (direction === 'IN') todayInSatang += amount;
        if (direction === 'OUT') todayOutSatang += amount;
      }
    }
    if (record.type === 'OBLIGATION' && record.status !== 'COMPLETED' && record.status !== 'CANCELLED') {
      const remaining = Number(record.remainingSatang ?? record.amountSatang ?? 0);
      if (Number.isSafeInteger(remaining) && remaining > 0) remainingObligationSatang += remaining;
    }
  }

  const openQueues = recordsForDomain(state, 'CALENDAR')
    .filter(record => isObligationQueue(record) && !lifecycleClosed(record.status))
    .map(record => ({ ...record, dueDate:dateKey(record.dueDate), amountSatang:Number(record.amountSatang || 0) }))
    .filter(record => record.dueDate && Number.isSafeInteger(record.amountSatang) && record.amountSatang >= 0)
    .sort((a,b) => a.dueDate.localeCompare(b.dueDate));

  let monthDueSatang = 0;
  let nearTermDueSatang = 0;
  const byDate = new Map();
  for (const queue of openQueues) {
    if (queue.dueDate.startsWith(month)) monthDueSatang += queue.amountSatang;
    const days = dayDistance(current, queue.dueDate);
    if (days <= nearDays) nearTermDueSatang += queue.amountSatang;
    const list = byDate.get(queue.dueDate) || [];
    list.push(queue);
    byDate.set(queue.dueDate, list);
  }
  const collisionDates = [...byDate.entries()].filter(([,items]) => items.length > 1).map(([date,items]) => ({ date, count:items.length, amountSatang:items.reduce((sum,item)=>sum+item.amountSatang,0) }));
  const balance = Number.isSafeInteger(Number(ledgerBalanceSatang)) ? Number(ledgerBalanceSatang) : 0;
  const shortfallSatang = Math.max(0, nearTermDueSatang - balance);
  const first = openQueues[0] || null;
  const nextDue = first ? { recordId:first.recordId, dueDate:first.dueDate, amountSatang:first.amountSatang, daysRemaining:dayDistance(current, first.dueDate), canPayNow:balance >= first.amountSatang } : null;
  return {
    spendableBalanceSatang:balance,
    todayInSatang,
    todayOutSatang,
    remainingObligationSatang,
    monthDueSatang,
    nearTermDueSatang,
    shortfallSatang,
    nextDue,
    collisionDates,
  };
}

const ATTENTION_RANK = Object.freeze({ OVERDUE:100, TODAY:90, INSUFFICIENT_FUNDS:80, COLLISION:70, VERIFY:65, NEAR:60, GOAL_RISK:40 });

export function projectAttention({ calendarRecords = [], finance = {}, goal = null, today, limit = 3 } = {}) {
  const candidates = [];
  const current = dateKey(today);
  const openByDate = new Map();
  for (const record of calendarRecords) {
    const state = deriveTimeState(record, current);
    const due = dateKey(record.dueDate);
    if (state === 'OVERDUE' || state === 'TODAY' || state === 'NEAR') {
      candidates.push({ kind:state, rank:ATTENTION_RANK[state], title:record.title || (state === 'OVERDUE' ? 'มีรายการเลยกำหนด' : 'มีรายการใกล้ถึง'), recordId:record.recordId, amountSatang:Number(record.amountSatang || 0), target:{area:'CALENDAR', date:due, recordId:record.recordId} });
    }
    if (!lifecycleClosed(record.status) && due) {
      const list = openByDate.get(due) || [];
      list.push(record);
      openByDate.set(due, list);
    }
  }
  if (Number(finance.shortfallSatang || 0) > 0) {
    candidates.push({ kind:'INSUFFICIENT_FUNDS', rank:ATTENTION_RANK.INSUFFICIENT_FUNDS, title:'เงินอาจไม่พอกับภาระใกล้ถึง', amountSatang:Number(finance.shortfallSatang), target:{area:'FINANCE', focus:'near-term-pressure'} });
  }
  for (const [date, items] of openByDate.entries()) {
    if (items.filter(item => MONEY_QUEUE_TYPES.has(item.type)).length > 1) candidates.push({ kind:'COLLISION', rank:ATTENTION_RANK.COLLISION, title:'มีหลายภาระชนวันเดียวกัน', count:items.length, target:{area:'CALENDAR', date} });
  }
  if (goal && Number(goal.goalSatang || 0) > 0 && Number(goal.generatedSatang || 0) < Number(goal.goalSatang) * 0.25) {
    candidates.push({ kind:'GOAL_RISK', rank:ATTENTION_RANK.GOAL_RISK, title:'เป้ารายได้วันนี้ยังห่าง', target:{area:'MAKE_MONEY', focus:'dashboard'} });
  }
  return candidates.sort((a,b) => b.rank-a.rank || String(a.target?.date || '').localeCompare(String(b.target?.date || ''))).slice(0, Math.max(0, limit));
}

function keyFromUTCDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}

function strongestState(items, today) {
  const priority = { OVERDUE:6, TODAY:5, NEAR:4, FUTURE:3, COMPLETED:2, CANCELLED:1 };
  let best = null;
  for (const item of items) {
    const state = deriveTimeState(item, today);
    if (!best || priority[state] > priority[best]) best = state;
  }
  return best;
}

export function buildMonthGrid({ year, monthIndex, calendarRecords = [], today } = {}) {
  const first = new Date(Date.UTC(Number(year), Number(monthIndex), 1));
  if (Number.isNaN(first.getTime())) throw new Error('INVALID_MONTH');
  const start = new Date(first.getTime() - first.getUTCDay() * DAY_MS);
  const grouped = new Map();
  for (const record of calendarRecords) {
    const key = dateKey(record.dueDate || record.date || record.scheduledDate);
    if (!key) continue;
    const list = grouped.get(key) || [];
    list.push(record);
    grouped.set(key, list);
  }
  const current = dateKey(today);
  const cells = [];
  for (let index=0; index<42; index += 1) {
    const date = new Date(start.getTime() + index * DAY_MS);
    const key = keyFromUTCDate(date);
    const items = grouped.get(key) || [];
    const openMoney = items.filter(item => !lifecycleClosed(item.status) && MONEY_QUEUE_TYPES.has(item.type));
    cells.push({
      date:key,
      day:date.getUTCDate(),
      inMonth:date.getUTCMonth() === Number(monthIndex),
      isToday:key === current,
      count:items.length,
      collision:openMoney.length > 1,
      state:items.length ? strongestState(items, current) : null,
      recordIds:items.map(item => item.recordId),
    });
  }
  return { year:Number(year), monthIndex:Number(monthIndex), cells };
}
