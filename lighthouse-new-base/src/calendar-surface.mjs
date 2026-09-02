function pad2(value) {
  return String(value).padStart(2, '0');
}

function isoDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function calendarOwner(record) {
  if (record?.type === 'PAY_OBLIGATION_INSTALLMENT') return 'outcome';
  return null;
}

function calendarRecords(state) {
  return Object.values(state?.domains?.CALENDAR?.records || {})
    .map(entry => entry?.record)
    .filter(Boolean);
}

function requireMonth(year, month) {
  if (!Number.isInteger(year) || year < 1) throw new Error('CALENDAR_INVALID_YEAR');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('CALENDAR_INVALID_MONTH');
}

export function projectCalendarMonth(state = {}, { year, month } = {}) {
  requireMonth(year, month);

  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = firstDay.getUTCDay();
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - startOffset));
  const byDate = new Map();

  for (const record of calendarRecords(state)) {
    const date = String(record?.dueDate || record?.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(Object.freeze({
      recordId: record.recordId,
      type: record.type || null,
      title: record.title || '',
      status: record.status || null,
      owner: calendarOwner(record),
      sourceRecord: record,
    }));
  }

  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);
    current.setUTCDate(gridStart.getUTCDate() + index);
    const cellYear = current.getUTCFullYear();
    const cellMonth = current.getUTCMonth() + 1;
    const cellDay = current.getUTCDate();
    const date = isoDate(cellYear, cellMonth, cellDay);
    cells.push(Object.freeze({
      date,
      inMonth: cellYear === year && cellMonth === month,
      items: Object.freeze([...(byDate.get(date) || [])]),
    }));
  }

  return Object.freeze({
    year,
    month,
    cells: Object.freeze(cells),
  });
}

export function createCalendarSurface({ outcomeOwner } = {}) {
  if (!outcomeOwner || typeof outcomeOwner.payObligation !== 'function') {
    throw new Error('CALENDAR_OUTCOME_OWNER_REQUIRED');
  }

  return Object.freeze({
    async pay({ item, amountSatang } = {}) {
      if (!item || item.owner !== 'outcome' || item.type !== 'PAY_OBLIGATION_INSTALLMENT') {
        throw new Error('CALENDAR_SOURCE_OWNER_UNPROVEN');
      }
      return outcomeOwner.payObligation({ queueId:item.recordId, amountSatang });
    },
  });
}
