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
  const app = read('lighthouse-next/app.mjs');

  assert.doesNotMatch(html, /data-root="home"/);
  assert.doesNotMatch(html, /data-root-target="home"/);
  assert.match(html, /data-root-target="chat"/);
  assert.match(html, /data-root-target="manual"/);
  assert.match(html, /data-root-target="settings"/);
  assert.match(app, /const allowed = \['chat','manual','settings'\]/);
  assert.doesNotMatch(app, /\['home','chat','manual','settings'\]/);
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

test('MANUAL copy describes direct work instead of a read-only capability menu', () => {
  const html = read('lighthouse-next/index.html');
  const manual = manualMarkup(html);

  assert.match(manual, /จัดการด้วยมือ/);
  assert.doesNotMatch(manual, /เลือกสิ่งที่ต้องการจัดการ/);
  assert.match(manual, /<strong>Income<\/strong>/);
  assert.match(manual, /<strong>Outcome<\/strong>/);
  assert.match(manual, /<strong>Calendar<\/strong>/);
  assert.match(manual, /<strong>Ledger<\/strong>/);
});

test('unlock surface is presented as a PIN gate', () => {
  const html = read('lighthouse-next/index.html');

  assert.match(html, />PIN<\/label>/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, />ลืม PIN<\/button>/);
  assert.doesNotMatch(html, /<label for="device-password">รหัสเข้าแอป<\/label>/);
});
