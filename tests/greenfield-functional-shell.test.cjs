"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function text(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }

test('app shell exposes five icon-only right-thumb destinations and removes flat engineering tabs', () => {
  const html = text('index.html');
  assert.match(html, /id="thumbRail"/);
  for (const area of ['home','money','calendar','finance','system']) assert.match(html, new RegExp(`data-area="${area}"`));
  assert.equal((html.match(/class="rail-btn/g) || []).length, 5);
  assert.doesNotMatch(html, /data-tab="store"/);
  assert.doesNotMatch(html, /data-tab="ledger"/);
  assert.doesNotMatch(html, /data-tab="recovery"/);
  for (const label of ['หน้าหลัก','สร้างเงิน','ปฏิทิน','การเงิน','ตั้งค่า']) assert.match(html, new RegExp(`aria-label="${label}"`));
  for (const icon of ['house-simple','trend-up','calendar-dots','wallet','gear-six']) assert.match(html, new RegExp(`data-icon="${icon}"`));
});

test('locked gate is user-facing while recovery and technician tools are deeper', () => {
  const html = text('index.html');
  const gate = html.match(/<section id="gate"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(gate, /<label>รหัสผ่าน\s*<input id="devicePin"[^>]*minlength="6"/);
  assert.match(gate, /id="unlockBtn"[^>]*class="primary-action"[^>]*>เข้าสู่ระบบ<\/button>/);
  assert.match(gate, /id="forgotPasswordBtn"[^>]*>ลืมรหัสผ่าน\?<\/button>/);
  assert.equal((gate.match(/<input\b/g) || []).length, 1);
  assert.equal((gate.match(/<button\b/g) || []).length, 2);
  assert.doesNotMatch(gate, /Vault|Device PIN|Evidence|Backup|Recovery|crypto|<details/);

  const recovery = html.match(/<section id="recoveryPanel"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(recovery, /id="recoveryPassphrase"[^>]*minlength="12"/);
  assert.match(recovery, /id="recoveryNewPassword"[^>]*minlength="6"/);
  assert.match(recovery, /id="lockedAdvancedRecovery"/);
  assert.match(recovery, /id="evidenceFile"/);
  assert.match(recovery, /id="restoreFile"/);
});

test('right-thumb rail puts frequent work lower and System furthest from the sweet spot', () => {
  const html = text('index.html');
  const rail = html.match(/<nav id="thumbRail"[\s\S]*?<\/nav>/)?.[0] || '';
  const order = [...rail.matchAll(/data-area="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(order, ['system','home','finance','calendar','money']);
});

test('each main area exists once and Make Money uses collapsed child navigation', () => {
  const html = text('index.html');
  for (const area of ['home','money','calendar','finance','system']) assert.equal((html.match(new RegExp(`data-area-page="${area}"`, 'g')) || []).length, 1);
  for (const view of ['dashboard','store','ride']) assert.match(html, new RegExp(`data-money-view="${view}"`));
  assert.match(html, /id="moneyChildren"/);
  assert.match(html, /id="moneyChildToggle"/);
});

test('Calendar has a month grid and System owns collapsed raw diagnostics', () => {
  const html = text('index.html');
  assert.match(html, /id="monthGrid"/);
  assert.match(html, /id="prevMonth"/);
  assert.match(html, /id="todayMonth"/);
  assert.match(html, /id="nextMonth"/);
  const home = html.match(/<section[^>]*data-area-page="home"[\s\S]*?<\/section>/)?.[0] || '';
  assert.doesNotMatch(home, /id="diagnostics"/);
  assert.match(html, /<details[^>]*id="advancedDiagnostics"/);
  assert.match(html, /id="diagnostics"/);
});

test('compact navigation is fixed on the right and content reserves rail space', () => {
  const css = text('styles.css');
  assert.match(css, /\.thumb-rail\s*\{[^}]*position\s*:\s*fixed[^}]*right\s*:/s);
  assert.match(css, /\.rail-btn\s*\{[^}]*min-width\s*:\s*48px[^}]*min-height\s*:\s*48px/s);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*padding-right/s);
});

test('every static UI id referenced by app code exists in index exactly once', () => {
  const html = text('index.html');
  const app = text('ui/app.mjs');
  const ids = [...new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]))];
  assert.ok(ids.length > 30, 'expected broad shell wiring coverage');
  for (const id of ids) {
    const matches = html.match(new RegExp(`id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || [];
    assert.equal(matches.length, 1, `UI id ${id} must exist exactly once`);
  }
});

test('Store screen uses the shared Store projection instead of duplicating stock and receivable logic', () => {
  const app = text('ui/app.mjs');
  assert.match(app, /projectStore/);
  assert.match(app, /const store = projectStore\(state, today\)/);
  assert.match(app, /context\.store\.stockQuantity/);
  assert.match(app, /context\.store\.receivableSatang/);
  assert.doesNotMatch(app, /function calculateStock\(/);
  assert.doesNotMatch(app, /outstandingSatang \|\| 0/);
});
