function requireManual(manual) {
  if (!manual || typeof manual !== 'object') throw new TypeError('BUNDLED_MODULE_MANUAL_REQUIRED');
  return manual;
}

function call(manual, method, ...args) {
  if (typeof manual[method] !== 'function') throw new Error(`BUNDLED_MODULE_HANDLER_MISSING:${method}`);
  return manual[method](...args);
}

export function createBundledModuleServices({ manual } = {}) {
  manual = requireManual(manual);

  const INCOME = Object.freeze({
    add: input => call(manual, 'addIncome', input),
    list: () => call(manual, 'viewIncome'),
    summary: () => call(manual, 'incomeSummary'),
  });

  const OUTCOME = Object.freeze({
    add: input => call(manual, 'addExpense', input),
    list: () => call(manual, 'viewExpense'),
    summary: () => call(manual, 'outcomeSummary'),
  });

  const CALENDAR = Object.freeze({
    add: input => call(manual, 'createCalendarItem', input),
    async snapshot() {
      const [today, upcoming, overdue] = await Promise.all([
        call(manual, 'calendarToday'),
        call(manual, 'calendarUpcoming'),
        call(manual, 'calendarOverdue'),
      ]);
      return { today, upcoming, overdue };
    },
  });

  const LEDGER = Object.freeze({
    search: input => call(manual, 'searchLedger', input),
    summary: () => call(manual, 'ledgerSummary'),
    dashboard: () => call(manual, 'dashboard'),
    related: (domain, recordId) => call(manual, 'related', domain, recordId),
  });

  return Object.freeze({ INCOME, OUTCOME, CALENDAR, LEDGER });
}
