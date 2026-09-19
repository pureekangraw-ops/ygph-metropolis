const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function manualMarkup(html) {
  const match = html.match(/<div id="page-manual"[\s\S]*?<div id="page-settings"/);
  assert.ok(match, 'MANUAL root must exist before Settings');
  return match[0];
}

test('LIGHTHOUSE root navigation is CHAT / MANUAL / GO / SETTINGS', () => {
  const html = read('lighthouse-next/index.html');
  const surface = read('lighthouse-next/surface-contract.mjs');

  assert.doesNotMatch(html, /data-root="home"/);
  assert.doesNotMatch(html, /data-root-target="home"/);
  assert.match(html, /data-root-target="chat"/);
  assert.match(html, /data-root-target="manual"/);
  assert.match(html, /data-root-target="go"/);
  assert.match(html, /data-root-target="settings"/);
  const styles = read('lighthouse-next/styles.css');
  assert.match(surface, /ensureVisibleRoot/);
  assert.match(surface, /manualNav\?\.click\(\)/);
  assert.match(styles, /\.bottom-nav\{[\s\S]*grid-template-columns:repeat\(4,1fr\)/);
  assert.doesNotMatch(styles, /\.bottom-nav\{[\s\S]*grid-template-columns:repeat\(3,1fr\)/);
});

test('MANUAL owns the Today dashboard and exposes only the four owner houses', () => {
  const html = read('lighthouse-next/index.html');
  const manual = manualMarkup(html);

  assert.match(manual, /data-manual-dashboard="today"/);
  assert.match(manual, /เงินจริง/);
  assert.match(manual, /เงินเข้า/);
  assert.match(manual, /เงินออก/);
  assert.match(manual, /สุทธิ/);

  for (const task of ['income', 'outcome', 'calendar', 'ledger']) {
    assert.match(manual, new RegExp(`data-task="${task}"`), `${task} must be a MANUAL owner house`);
  }

  assert.doesNotMatch(manual, /data-task="finance"/);
  assert.doesNotMatch(manual, /data-task="store"/);
  assert.doesNotMatch(manual, /data-task="ride"/);
});

test('MANUAL direct Income and Outcome mutate through owner bridges, never Chat parsing', () => {
  const surface = read('lighthouse-next/surface-contract.mjs');

  assert.match(surface, /id = 'manual-income-form'/);
  assert.match(surface, /id = 'manual-expense-form'/);
  assert.match(surface, /id = 'manual-obligation-form'/);
  assert.match(surface, /ledgerBridge\.recordOtherIncome\(/);
  assert.match(surface, /ledgerBridge\.recordExpense\(/);
  assert.match(surface, /ledgerBridge\.createObligation\(/);
  assert.match(surface, /ledgerBridge\.payObligation\(/);
  assert.match(surface, /ledgerBridge\.readLedgerTruth\(/);
  assert.doesNotMatch(surface, /submitChatText/);
});

test('MANUAL detail composition separates overview actions and real records', () => {
  const surface = read('lighthouse-next/surface-contract.mjs');
  const polish = read('lighthouse-next/owner-polish.css');

  assert.match(surface, /makeSectionHeading\('ภาพรวม'/);
  assert.match(surface, /makeSectionHeading\('ทำต่อ'/);
  assert.match(surface, /makeSectionHeading\('บันทึก'/);
  assert.match(surface, /makeSectionHeading\('รายการจริง'/);
  assert.match(surface, /manual-income-overview/);
  assert.match(surface, /manual-outcome-overview/);
  assert.match(surface, /manual-action-grid/);
  assert.match(polish, /\.manual-overview\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(polish, /\.task-card\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+60px/);
  assert.doesNotMatch(polish, /grid-template-columns:\s*64px\s+minmax\(0,\s*1fr\)\s+18px/);
});

test('Calendar surface routes reschedule/status through runtime bridge and does not close owner-controlled payments', () => {
  const surface = read('lighthouse-next/surface-contract.mjs');
  assert.match(surface, /ledgerBridge\.rescheduleCalendar\(/);
  assert.match(surface, /ledgerBridge\.setCalendarStatus\(/);
  assert.match(surface, /PAY_OBLIGATION/);
  assert.match(surface, /PAY_OBLIGATION_INSTALLMENT/);
  assert.match(surface, /RECEIVE_CUSTOMER_PAYMENT/);
  assert.match(surface, /จัดการที่ Owner ของรายการ/);
  assert.match(surface, /data\.calendarOwnerRoute|dataset\.calendarOwnerRoute/);
  assert.match(surface, /ไป Outcome/);
  assert.match(surface, /ไป Income/);
  assert.match(surface, /void renderOutcome\(\)/);
  assert.match(surface, /void renderIncome\(\)/);
});

test('unlock surface is presented as a PIN gate without narrowing the existing credential format', () => {
  const html = read('lighthouse-next/index.html');

  assert.match(html, /<label for="device-password">PIN<\/label>/);
  assert.match(html, /id="device-password"[^>]*minlength="6"/);
  assert.match(html, />ลืม PIN<\/button>/);
  assert.doesNotMatch(html, /inputmode="numeric"/);
  assert.doesNotMatch(html, /<label for="device-password">รหัสเข้าแอป<\/label>/);
});


test('Store Ride and Ledger descendants read fresh owner truth on every open', () => {
  const surface = read('lighthouse-next/surface-contract.mjs');

  assert.match(surface, /createLighthouseStoreBridge/);
  assert.match(surface, /async function renderStore\(\)[\s\S]*storeBridge\.readStoreTruth\(\)/);
  assert.match(surface, /async function renderRide\(\)[\s\S]*ledgerBridge\.readRideTruth\(\)/);
  assert.match(surface, /async function renderLedger\(\)[\s\S]*ledgerBridge\.readLedgerTruth\(\)/);
  assert.match(surface, /manual-ledger-reversal/);
  assert.match(surface, /ledgerBridge\.reverseLedgerTransaction\(/);
  assert.match(surface, /sourceRef \|\| ''\) === 'LEDGER\/MANUAL'/);
  assert.doesNotMatch(surface, /renderLedger\(\)[\s\S]*\bledgerTruth\b/);
});
