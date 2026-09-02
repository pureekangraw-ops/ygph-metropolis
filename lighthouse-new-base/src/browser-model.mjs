import { projectIncomeView } from './income-view.mjs';
import { projectOutcomeView } from './outcome-view.mjs';
import { projectCalendarMonth } from './calendar-surface.mjs';
import { projectLedgerView } from './ledger-control.mjs';

function recordsOf(domain) {
  return Object.values(domain?.records || {})
    .map(entry => entry?.record)
    .filter(Boolean);
}

function bangkokDate(isoTimestamp) {
  const timestamp = Date.parse(isoTimestamp || '');
  if (!Number.isFinite(timestamp)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Bangkok',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function transactionSubtype(record) {
  const explicit = String(record?.subtype || '').trim();
  if (explicit) return explicit;
  const detail = String(record?.detail || '');
  const separator = detail.indexOf(':');
  return separator >= 0 ? detail.slice(separator + 1) : '';
}

function isRealCashTransaction(record, direction, date) {
  if (record?.type !== 'TRANSACTION' || record?.direction !== direction) return false;
  if (transactionSubtype(record) === 'BALANCE_ADJUSTMENT') return false;
  return bangkokDate(record?.createdAt) === date;
}

function isOpenCalendar(record) {
  return !['COMPLETED', 'CANCELLED'].includes(String(record?.status || '').toUpperCase());
}

function todaySummary(state, date) {
  const ledger = recordsOf(state?.domains?.LEDGER);
  const calendar = recordsOf(state?.domains?.CALENDAR);
  const moneyInSatang = ledger
    .filter(record => isRealCashTransaction(record, 'IN', date))
    .reduce((sum, record) => sum + Number(record.amountSatang || 0), 0);
  const moneyOutSatang = ledger
    .filter(record => isRealCashTransaction(record, 'OUT', date))
    .reduce((sum, record) => sum + Number(record.amountSatang || 0), 0);
  const dated = calendar.filter(record => String(record?.dueDate || record?.date || '').slice(0, 10) === date && isOpenCalendar(record));
  const dueCount = dated.filter(record => record?.type === 'PAY_OBLIGATION_INSTALLMENT').length;
  const eventCount = dated.length - dueCount;
  return Object.freeze({ moneyInSatang, moneyOutSatang, dueCount, eventCount });
}

export function createBrowserModel({ runtimeProvider, dailyControls } = {}) {
  if (typeof runtimeProvider !== 'function') throw new Error('BROWSER_MODEL_RUNTIME_PROVIDER_REQUIRED');
  if (!dailyControls || typeof dailyControls.getSpendingAllowance !== 'function') {
    throw new Error('BROWSER_MODEL_DAILY_CONTROLS_REQUIRED');
  }

  return Object.freeze({
    async read({ date, year, month } = {}) {
      try {
        return await runtimeProvider(async runtime => {
          if (!runtime || typeof runtime.readState !== 'function') throw new Error('BROWSER_MODEL_RUNTIME_INVALID');
          const state = await runtime.readState();
          const spendingAllowance = await dailyControls.getSpendingAllowance(date);
          const income = projectIncomeView(state);
          const outcome = projectOutcomeView(state, { date, spendingAllowance });
          const calendar = projectCalendarMonth(state, { year, month });
          const ledger = projectLedgerView(state);
          return Object.freeze({
            available:true,
            manual:Object.freeze({ summary:todaySummary(state, date) }),
            income,
            outcome,
            calendar,
            ledger,
          });
        });
      } catch (error) {
        if (error?.message === 'RUNTIME_SESSION_LOCKED') {
          return Object.freeze({ available:false, reason:'locked' });
        }
        throw error;
      }
    },
  });
}
