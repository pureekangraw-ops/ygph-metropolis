function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatBaht(satang) {
  const amount = Number(satang || 0) / 100;
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits:0, maximumFractionDigits:2 }).format(amount);
}

const THAI_MONTHS = Object.freeze([
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]);

function renderTopNavigation(route) {
  const items = [
    ['chat', 'CHAT'],
    ['manual', 'MANUAL'],
    ['settings', 'SETTINGS'],
  ];
  return `<nav class="bottom-nav" aria-label="เมนูหลัก">${items.map(([target, label]) => (
    `<button type="button" data-top-route="${target}" aria-current="${route?.top === target ? 'page' : 'false'}">${label}</button>`
  )).join('')}</nav>`;
}

function renderChat(chat = {}) {
  const messages = Array.isArray(chat.messages) ? chat.messages : [];
  const thread = messages.map(message => {
    const role = message?.role === 'user' ? 'user' : 'assistant';
    return `<p data-chat-message="${role}">${escapeHtml(message?.text || '')}</p>`;
  }).join('');

  return `<main data-surface="chat" class="surface chat-surface">
    <header><h1>CHAT</h1></header>
    <section data-chat-thread aria-live="polite">${thread}</section>
    <form data-chat-form class="chat-composer">
      <textarea data-chat-input aria-label="พิมพ์ข้อความ" rows="2" placeholder="พิมพ์คุยได้เลย"></textarea>
      <button type="submit" data-chat-send>ส่ง</button>
    </form>
  </main>`;
}

function renderManualDashboard(manual = {}) {
  const summary = manual.summary || {};
  const houses = [
    ['income', 'Income'],
    ['outcome', 'Outcome'],
    ['calendar', 'Calendar'],
    ['ledger', 'Ledger'],
  ];
  return `<main data-surface="manual" data-manual-dashboard class="surface manual-dashboard">
    <header><h1>วันนี้เป็นอย่างไร</h1></header>
    <section class="today-summary" aria-label="สรุปวันนี้">
      <article><span>เงินเข้า</span><strong>${formatBaht(summary.moneyInSatang)} บาท</strong></article>
      <article><span>เงินออก</span><strong>${formatBaht(summary.moneyOutSatang)} บาท</strong></article>
      <article><span>ถึงกำหนด</span><strong>${Number(summary.dueCount || 0)} รายการ</strong></article>
      <article><span>เหตุการณ์</span><strong>${Number(summary.eventCount || 0)} รายการ</strong></article>
    </section>
    <section class="house-grid" aria-label="บ้านใน Manual">${houses.map(([house, label]) => (
      `<button type="button" data-manual-house="${house}">${label}</button>`
    )).join('')}</section>
  </main>`;
}

function renderIncome(income = {}) {
  const recent = Array.isArray(income.recent) ? income.recent : [];
  const recentHtml = recent.length
    ? `<ul class="record-list">${recent.map(item => (
      `<li><span>${escapeHtml(item?.title || 'รายการเงินเข้า')}</span><strong>${formatBaht(item?.amountSatang)} บาท</strong></li>`
    )).join('')}</ul>`
    : '<p class="empty-state">ยังไม่มีรายการล่าสุด</p>';

  return `<section data-house-body="income" aria-live="polite">
    <div class="metric-grid">
      <article><span>เงินเข้าจริง</span><strong>${formatBaht(income.cashInSatang)} บาท</strong></article>
      <article><span>เครดิตวิ่งงานที่ยังไม่ถอน</span><strong>${formatBaht(income.pendingRideCreditSatang)} บาท</strong></article>
    </div>
    <h2>รายการล่าสุด</h2>
    ${recentHtml}
  </section>`;
}

function renderOutcome(outcome = {}) {
  const spent = `<article><span>ใช้ไป</span><strong>${formatBaht(outcome.spentSatang)} บาท</strong></article>`;
  if (outcome.allowanceSatang == null) {
    return `<section data-house-body="outcome" aria-live="polite">
      <p class="notice">ยังไม่ได้ตั้งวงเงินใช้จ่าย</p>
      <div class="metric-grid">${spent}</div>
    </section>`;
  }

  const balanceLabel = outcome.exceeded ? 'เกินวงเงิน' : 'เหลือ';
  const balanceSatang = outcome.exceeded ? outcome.overSatang : outcome.remainingSatang;
  return `<section data-house-body="outcome" aria-live="polite">
    <div class="metric-grid">
      <article><span>วงเงินใช้จ่าย</span><strong>${formatBaht(outcome.allowanceSatang)} บาท</strong></article>
      ${spent}
      <article><span>${balanceLabel}</span><strong>${formatBaht(balanceSatang)} บาท</strong></article>
    </div>
  </section>`;
}

function renderLedger(ledger = {}) {
  const history = Array.isArray(ledger.history) ? ledger.history : [];
  const historyHtml = history.length
    ? `<ul class="record-list">${history.map(item => {
      const movement = item?.direction === 'IN' ? 'เข้า' : item?.direction === 'OUT' ? 'ออก' : '';
      return `<li data-ledger-record="${escapeHtml(item?.recordId || '')}"><span>${escapeHtml(item?.title || 'รายการ')}</span><span>${movement} ${formatBaht(item?.amountSatang)} บาท</span></li>`;
    }).join('')}</ul>`
    : '<p class="empty-state">ยังไม่มีประวัติรายการ</p>';

  return `<section data-house-body="ledger" aria-live="polite">
    <article class="balance-card"><span>ยอดเงินจริง</span><strong>${formatBaht(ledger.balanceSatang)} บาท</strong></article>
    <h2>ประวัติรายการ</h2>
    ${historyHtml}
  </section>`;
}

function renderCalendar(calendar = {}) {
  const year = Number(calendar.year || 0);
  const month = Number(calendar.month || 0);
  const monthName = THAI_MONTHS[month - 1] || '';
  const cells = Array.isArray(calendar.cells) ? calendar.cells : [];
  const cellsHtml = cells.map(cell => {
    const items = Array.isArray(cell?.items) ? cell.items : [];
    const itemsHtml = items.map(item => (
      `<div data-calendar-item="${escapeHtml(item?.recordId || '')}"><span>${escapeHtml(item?.title || 'รายการ')}</span></div>`
    )).join('');
    return `<article data-calendar-date="${escapeHtml(cell?.date || '')}" data-in-month="${cell?.inMonth === true ? 'true' : 'false'}">
      <time datetime="${escapeHtml(cell?.date || '')}">${escapeHtml(cell?.date || '')}</time>
      ${itemsHtml}
    </article>`;
  }).join('');

  return `<section data-house-body="calendar" aria-live="polite">
    <h2>${escapeHtml(monthName)} ${year || ''}</h2>
    <div class="calendar-grid">${cellsHtml}</div>
  </section>`;
}

function renderManualHouse(house, data = {}) {
  const labels = {
    income:'Income',
    outcome:'Outcome',
    calendar:'Calendar',
    ledger:'Ledger',
  };
  const label = labels[house];
  if (!label) return renderManualDashboard();
  const body = house === 'income'
    ? renderIncome(data)
    : house === 'outcome'
      ? renderOutcome(data)
      : house === 'calendar'
        ? renderCalendar(data)
        : renderLedger(data);
  return `<main data-surface="manual" data-manual-surface="${house}" class="surface manual-house">
    <header><h1>${label}</h1></header>
    ${body}
  </main>`;
}

function renderSettings(settings = {}) {
  const version = escapeHtml(settings.version || 'ไม่ทราบรุ่น');
  const rollback = settings.rollbackSupported === true
    ? '<button type="button" data-settings-action="rollback">ย้อนกลับรุ่นก่อน</button>'
    : '';
  return `<main data-surface="settings" class="surface settings-surface">
    <header><h1>SETTINGS</h1><p>เวอร์ชัน ${version}</p></header>
    <section class="settings-actions">
      <button type="button" data-settings-action="check-update">ตรวจอัปเดต</button>
      ${rollback}
      <button type="button" data-settings-action="backup">สำรองข้อมูล</button>
      <button type="button" data-settings-action="restore">กู้คืนข้อมูล</button>
      <button type="button" data-settings-action="reset">ล้างข้อมูล</button>
    </section>
  </main>`;
}

export function renderBrowserShell({
  route = { top:'chat', manualHouse:null },
  chat = {},
  manual = {},
  income = {},
  outcome = {},
  calendar = {},
  ledger = {},
  settings = {},
} = {}) {
  let body;
  if (route?.top === 'manual') {
    const houseData = route.manualHouse === 'income'
      ? income
      : route.manualHouse === 'outcome'
        ? outcome
        : route.manualHouse === 'calendar'
          ? calendar
          : route.manualHouse === 'ledger'
            ? ledger
            : {};
    body = route.manualHouse ? renderManualHouse(route.manualHouse, houseData) : renderManualDashboard(manual);
  } else if (route?.top === 'settings') {
    body = renderSettings(settings);
  } else {
    body = renderChat(chat);
  }

  return `<div data-lighthouse-new-base class="lighthouse-app">${body}${renderTopNavigation(route)}</div>`;
}
