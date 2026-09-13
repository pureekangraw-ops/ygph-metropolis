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

test('LIGHTHOUSE root navigation is CHAT / MANUAL / SETTINGS only', () => {
  const html = read('lighthouse-next/index.html');
  const surface = read('lighthouse-next/surface-contract.mjs');

  assert.doesNotMatch(html, /data-root="home"/);
  assert.doesNotMatch(html, /data-root-target="home"/);
  assert.match(html, /data-root-target="chat"/);
  assert.match(html, /data-root-target="manual"/);
  assert.match(html, /data-root-target="settings"/);
  assert.match(surface, /ensureVisibleRoot/);
  assert.match(surface, /manualNav\?\.click\(\)/);
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

test('MANUAL direct Income writes to Ledger and Outcome does not fake unsupported mutation', () => {
  const surface = read('lighthouse-next/surface-contract.mjs');

  assert.match(surface, /id = 'manual-income-form'/);
  assert.match(surface, /ledgerBridge\.recordOtherIncome\(/);
  assert.match(surface, /ledgerBridge\.readLedgerTruth\(/);
  assert.match(surface, /รอ Outcome write contract/);
  assert.doesNotMatch(surface, /submitChatText/);
});

test('unlock surface is presented as a PIN gate', () => {
  const html = read('lighthouse-next/index.html');

  assert.match(html, />PIN<\/label>/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, />ลืม PIN<\/button>/);
  assert.doesNotMatch(html, /<label for="device-password">รหัสเข้าแอป<\/label>/);
});
