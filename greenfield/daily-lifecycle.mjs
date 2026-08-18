import { projectGeneratedIncome, projectFinancialTruth } from './calculation-authority.mjs';

export const DAILY_TIME_ZONE = 'Asia/Bangkok';
const DAY_MS = 86400000;

export function bangkokDayKey(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function dayEpoch(dayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ''))) throw new Error(`INVALID_DAY_KEY:${dayKey}`);
  const [year, month, day] = dayKey.split('-').map(Number);
  const probe = Date.UTC(year, month - 1, day);
  const date = new Date(probe);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`INVALID_DAY_KEY:${dayKey}`);
  return probe;
}

function shiftDay(dayKey, amount) {
  const date = new Date(dayEpoch(dayKey) + (Number(amount) * DAY_MS));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function millisecondsUntilNextBangkokMidnight(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_DAILY_LIFECYCLE_NOW');
  const currentDay = bangkokDayKey(date);
  const nextDay = shiftDay(currentDay, 1);
  const nextMidnight = new Date(`${nextDay}T00:00:00+07:00`).getTime();
  return Math.max(0, nextMidnight - date.getTime());
}

function normalizeGoal(state, dayKey) {
  const amount = Number(state?.meta?.dailyGoals?.[dayKey]?.goalSatang ?? 0);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
}

export function projectDailySummary(state, dayKey, { closedAt = new Date().toISOString() } = {}) {
  dayEpoch(dayKey);
  const generated = projectGeneratedIncome(state, dayKey);
  const finance = projectFinancialTruth(state, 0, dayKey);
  const dailyGoalSatang = normalizeGoal(state, dayKey);
  const goalProgressSatang = generated.combinedSatang;
  const goalProgressPercent = dailyGoalSatang > 0
    ? Math.round((goalProgressSatang / dailyGoalSatang) * 100)
    : (goalProgressSatang > 0 ? 100 : 0);
  return Object.freeze({
    dayKey,
    timeZone: DAILY_TIME_ZONE,
    salesTodaySatang: generated.storeSatang,
    rideGeneratedTodaySatang: generated.rideSatang,
    incomeTodaySatang: finance.todayInSatang,
    expenseTodaySatang: finance.todayOutSatang,
    dailyGoalSatang,
    goalProgressSatang,
    goalAchieved: dailyGoalSatang > 0 ? goalProgressSatang >= dailyGoalSatang : false,
    goalProgressPercent,
    closedAt,
  });
}

export function applyDailyLifecycle(state, { now = new Date().toISOString() } = {}) {
  if (!state || typeof state !== 'object') throw new Error('INVALID_STATE');
  const currentDay = bangkokDayKey(now);
  if (!currentDay) throw new Error('INVALID_DAILY_LIFECYCLE_NOW');
  const currentMeta = state.meta && typeof state.meta === 'object' ? state.meta : {};
  const lifecycle = currentMeta.dailyLifecycle;

  if (!lifecycle) {
    const next = structuredClone(state);
    next.meta = next.meta && typeof next.meta === 'object' ? next.meta : {};
    next.meta.dailySummaries = next.meta.dailySummaries && typeof next.meta.dailySummaries === 'object' ? next.meta.dailySummaries : {};
    next.meta.dailyLifecycle = {
      timeZone: DAILY_TIME_ZONE,
      activeDay: currentDay,
      lastClosedDay: null,
      updatedAt: now,
    };
    return { changed: true, state: next, closedDays: [], activeDay: currentDay };
  }

  const activeDay = String(lifecycle.activeDay || '');
  dayEpoch(activeDay);
  if (dayEpoch(activeDay) > dayEpoch(currentDay)) throw new Error(`DAILY_LIFECYCLE_FUTURE_ACTIVE_DAY:${activeDay}/${currentDay}`);
  if (activeDay === currentDay) return { changed: false, state, closedDays: [], activeDay: currentDay };

  const next = structuredClone(state);
  next.meta = next.meta && typeof next.meta === 'object' ? next.meta : {};
  next.meta.dailySummaries = next.meta.dailySummaries && typeof next.meta.dailySummaries === 'object' ? next.meta.dailySummaries : {};
  const closedDays = [];
  let cursor = activeDay;
  while (dayEpoch(cursor) < dayEpoch(currentDay)) {
    if (!next.meta.dailySummaries[cursor]) {
      next.meta.dailySummaries[cursor] = projectDailySummary(next, cursor, { closedAt: now });
    }
    closedDays.push(cursor);
    cursor = shiftDay(cursor, 1);
  }
  const lastClosedDay = closedDays.length ? closedDays[closedDays.length - 1] : lifecycle.lastClosedDay ?? null;
  next.meta.dailyLifecycle = {
    timeZone: DAILY_TIME_ZONE,
    activeDay: currentDay,
    lastClosedDay,
    updatedAt: now,
  };
  return { changed: true, state: next, closedDays, activeDay: currentDay };
}
