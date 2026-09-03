const TOP_ROUTES = new Set(['chat', 'manual', 'settings']);
const MANUAL_HOUSES = new Set(['income', 'outcome', 'calendar', 'ledger']);

function freezeState(top, manualHouse = null) {
  return Object.freeze({ top, manualHouse });
}

export function createNavigationState() {
  return freezeState('chat');
}

export function navigateTop(state, target) {
  if (!TOP_ROUTES.has(target)) return state;
  return freezeState(target);
}

export function openManualHouse(state, house) {
  if (state?.top !== 'manual' || !MANUAL_HOUSES.has(house)) return state;
  return freezeState('manual', house);
}
