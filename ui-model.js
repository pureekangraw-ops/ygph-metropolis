import { dateKey, ledgerBalanceSatang } from './core.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function recordDate(record) {
  return String(record?.date || record?.due || dateKey(record?.createdAt || new Date())).slice(0, 10);
}

export function buildDashboardModel(state, day = dateKey()) {
  const storeTodaySatang = (state.store.sales || [])
    .filter(item => item.status !== 'CANCELLED' && recordDate(item) === day)
    .reduce((sum, item) => sum + Number(item.totalSatang || 0), 0);
  const rideTodaySatang = (state.ride.jobs || [])
    .filter(item => item.status !== 'CANCELLED' && recordDate(item) === day)
    .reduce((sum, item) => sum + Number(item.amountSatang || 0), 0);
  const pendingCount = (state.calendar || []).filter(item => !['COMPLETED', 'CANCELLED'].includes(item.status)).length;
  return {
    storeTodaySatang,
    rideTodaySatang,
    ledgerBalanceSatang: ledgerBalanceSatang(state),
    pendingCount,
    stockQty: Number(state.store.stockQty || 0),
    creditBalanceSatang: Number(state.ride.creditBalanceSatang || 0),
  };
}

export function renderLauncher({ storeToday, rideToday, ledgerBalance, pendingCount }) {
  const cards = [
    ['store', 'STORE', 'ร้านค้า', 'ยอดขายวันนี้', storeToday, '🛍️'],
    ['ride', 'RIDE', 'วิ่งงาน', 'รายได้วันนี้', rideToday, '🛵'],
    ['ledger', 'LEDGER', 'การเงิน', 'เงินในกระเป๋า', ledgerBalance, '💼'],
    ['calendar', 'CALENDAR', 'ปฏิทิน', 'รายการรอดำเนินการ', String(pendingCount), '📅'],
  ];
  return `<section class="launcher-grid">${cards.map(([route, code, title, label, value, icon]) => `
    <button class="app-card app-card--${route}" data-route="${route}" type="button">
      <span class="app-card__icon" aria-hidden="true">${icon}</span>
      <span class="app-card__code">${code}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(label)}</small>
      <b>${escapeHtml(value)}</b>
    </button>`).join('')}</section>`;
}
