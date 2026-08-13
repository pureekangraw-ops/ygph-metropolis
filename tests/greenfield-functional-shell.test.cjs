"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function text(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }

test('production shell exposes five bottom destinations while Settings stays a utility', () => {
  const html = text('index.html');
  const nav = html.match(/<nav id="bottomNav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.deepEqual([...nav.matchAll(/data-destination="([^"]+)"/g)].map(match => match[1]), ['home','store','ride','finance','calendar']);
  assert.equal((nav.match(/class="bottom-nav-btn/g) || []).length, 5);
  assert.match(html, /id="settingsBtn"[^>]*aria-label="ตั้งค่า"/);
  assert.doesNotMatch(nav, /data-destination="system"|aria-label="ตั้งค่า"/);
  assert.doesNotMatch(html, /id="thumbRail"|class="rail-btn|data-area-page="money"|data-money-page=/);
});

test('locked gate stays user-facing while recovery and technician tools remain deeper', () => {
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

test('Home is attention first then useful summary then city doors', () => {
  const html = text('index.html');
  const home = html.match(/<section[^>]*data-area-page="home"[\s\S]*?<\/section>/)?.[0] || '';
  const attention = home.indexOf('id="attentionList"');
  const summary = home.indexOf('id="homeSummary"');
  const cities = home.indexOf('id="cityEntries"');
  assert.ok(attention >= 0 && summary > attention && cities > summary);
  for (const id of ['homeBalance','homeGenerated','homeStock','homeDue']) assert.match(home, new RegExp(`id="${id}"`));
  for (const city of ['store','ride','finance','calendar']) assert.match(home, new RegExp(`data-city-entry="${city}"`));
  assert.doesNotMatch(home.slice(0, cities), /<form\b/);
});

test('each working area exists once and Calendar/System keep focused responsibilities', () => {
  const html = text('index.html');
  for (const area of ['home','store','ride','finance','calendar','system']) assert.equal((html.match(new RegExp(`data-area-page="${area}"`, 'g')) || []).length, 1, area);
  assert.match(html, /id="monthGrid"/);
  assert.match(html, /id="prevMonth"/);
  assert.match(html, /id="todayMonth"/);
  assert.match(html, /id="nextMonth"/);
  const home = html.match(/<section[^>]*data-area-page="home"[\s\S]*?<\/section>/)?.[0] || '';
  assert.doesNotMatch(home, /id="diagnostics"/);
  assert.match(html, /<details[^>]*id="advancedDiagnostics"/);
  assert.match(html, /id="diagnostics"/);
});

test('mobile shell preserves content width and bottom navigation touch targets', () => {
  const css = text('styles.css');
  assert.match(css, /\.bottom-nav\s*\{[^}]*position\s*:\s*fixed[^}]*bottom\s*:/s);
  assert.match(css, /\.bottom-nav-btn\s*\{[^}]*min-height\s*:\s*(?:48|5[0-9])px/s);
  assert.doesNotMatch(css, /\.thumb-rail/);
  assert.doesNotMatch(css, /padding-right\s*:\s*76px/);
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
  assert.match(app, /const store=projectStore\(state,today\)/);
  assert.match(app, /context\.store\.stockQuantity/);
  assert.match(app, /context\.store\.receivableSatang/);
  assert.doesNotMatch(app, /function calculateStock\(/);
});
