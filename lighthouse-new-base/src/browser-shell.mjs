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

function renderManualHouse(house) {
  const labels = {
    income:'Income',
    outcome:'Outcome',
    calendar:'Calendar',
    ledger:'Ledger',
  };
  const label = labels[house];
  if (!label) return renderManualDashboard();
  return `<main data-surface="manual" data-manual-surface="${house}" class="surface manual-house">
    <header><h1>${label}</h1></header>
    <section data-house-body="${house}" aria-live="polite"></section>
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

export function renderBrowserShell({ route = { top:'chat', manualHouse:null }, chat = {}, manual = {}, settings = {} } = {}) {
  let body;
  if (route?.top === 'manual') {
    body = route.manualHouse ? renderManualHouse(route.manualHouse) : renderManualDashboard(manual);
  } else if (route?.top === 'settings') {
    body = renderSettings(settings);
  } else {
    body = renderChat(chat);
  }

  return `<div data-lighthouse-new-base class="lighthouse-app">${body}${renderTopNavigation(route)}</div>`;
}
