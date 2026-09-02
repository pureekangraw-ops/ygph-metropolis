const HOUSES = Object.freeze([
  Object.freeze({ id: 'income', label: 'Income', route: 'income' }),
  Object.freeze({ id: 'outcome', label: 'Outcome', route: 'outcome' }),
  Object.freeze({ id: 'calendar', label: 'Calendar', route: 'calendar' }),
  Object.freeze({ id: 'ledger', label: 'Ledger', route: 'ledger' }),
]);

function snapshotToday(today = {}) {
  return Object.freeze({
    income: today.income ?? 0,
    outcome: today.outcome ?? 0,
    dueToday: today.dueToday ?? 0,
    events: Object.freeze([...(today.events ?? [])]),
  });
}

export function createManualDashboard(today) {
  return Object.freeze({
    heading: 'วันนี้เป็นอย่างไร',
    today: snapshotToday(today),
    houses: HOUSES,
  });
}
