"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function text(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }

test('production shell exposes icon work destinations while Settings stays a utility and the brand M owns Home/Back', () => {
  const html = text('index.html');
  const nav = html.match(/<nav id="commandNav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.deepEqual([...nav.matchAll(/data-command-destination="([^"]+)"/g)].map(match => match[1]), ['store','ride','finance']);
  assert.equal((nav.match(/class="command-nav-btn/g) || []).length, 4);
  assert.match(nav, /id="settingsBtn"[^>]*aria-label="ตั้งค่า"/);
  assert.match(html, /id="brandHomeControl"[^>]*data-command-destination="home"/);
  assert.match(html, /id="brandHomeControl"[\s\S]{0,500}?id="brandHomeMark"[\s\S]{0,500}?id="brandBackIcon"/);
  assert.doesNotMatch(html, /id="homeBubble"|id="bottomNav"|id="thumbRail"|class="rail-btn|data-area-page="money"|data-money-page=/);
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

test('Home is attention first then owner summaries then actual-cash chart without duplicate city doors', () => {
  const html = text('index.html');
  const home = html.match(/<section[^>]*data-area-page="home"[\s\S]*?<\/section>/)?.[0] || '';
  const attention = home.indexOf('id="attentionList"');
  const summary = home.indexOf('id="homeSummary"');
  const chart = home.indexOf('id="homeCashFlowChart"');
  assert.ok(attention >= 0 && summary > attention && chart > summary);
  for (const id of ['homeBalance','homeGenerated','homeStock','homeDue']) assert.match(home, new RegExp(`id="${id}"`));
  for (const key of ['balance','generated','stock','due']) assert.match(home, new RegExp(`data-home-summary="${key}"`));
  assert.doesNotMatch(home, /id="cityEntries"|data-city-entry=/);
  assert.doesNotMatch(home.slice(0, chart), /<form\b/);
});

test('four visible work areas exist once while Calendar schedule is Finance-hosted and Settings remains a utility dialog', () => {
  const html = text('index.html');
  for (const area of ['home','store','ride','finance']) assert.equal((html.match(new RegExp(`data-area-page=\"${area}\"`, 'g')) || []).length, 1, area);
  assert.equal((html.match(/data-area-page=\"calendar\"/g) || []).length, 0, 'calendar visible area');
  assert.doesNotMatch(html, /data-area-page=\"system\"/);
  const financeStart = html.indexOf('data-area-page="finance"');
  const schedule = html.indexOf('id="financeSchedule"');
  assert.ok(financeStart >= 0 && schedule > financeStart);
  for (const id of ['monthGrid','prevMonth','todayMonth','nextMonth','settingsDialog','diagnostics']) assert.match(html, new RegExp(`id=\"${id}\"`));
  const settings = html.match(/<dialog[^>]*id=\"settingsDialog\"[\s\S]*?<\/dialog>/)?.[0] || '';
  assert.doesNotMatch(settings, /<details\b/);
});

test('mobile shell preserves content width and command/brand Home touch targets', () => {
  const css = text('styles.css');
  assert.match(css, /\.appbar\{[^}]*position:sticky[^}]*top:0/s);
  assert.match(css, /\.command-nav-btn\{[^}]*min-height:46px/s);
  assert.match(css, /\.brand-home-control\{[^}]*min-height:44px/s);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.command-nav-btn\{[^}]*min-height:44px/s);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.brand-home-control\{[^}]*min-height:42px/s);
  assert.doesNotMatch(css, /\.home-bubble|\.thumb-rail/);
  assert.doesNotMatch(css, /padding-right\s*:\s*76px/);
});

test('every static UI id referenced by production UI modules exists in index exactly once', () => {
  const html = text('index.html');
  const uiSource = ['ui/app.mjs','ui/home-ui.mjs','ui/store-ui.mjs','ui/finance-ui.mjs','ui/ride-ui.mjs']
    .map(text).join('\n');
  const ids = [...new Set([
    ...uiSource.matchAll(/\$\('([^']+)'\)/g),
    ...uiSource.matchAll(/getById\('([^']+)'\)/g),
  ].map(match => match[1]))];
  assert.ok(ids.length > 30, 'expected broad shell wiring coverage');
  for (const id of ids) {
    const matches = html.match(new RegExp(`id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || [];
    assert.equal(matches.length, 1, `UI id ${id} must exist exactly once`);
  }
});

test('Store screen uses the shared Store projection instead of duplicating stock and receivable logic', () => {
  const app = text('ui/app.mjs');
  const storeUi = text('ui/store-ui.mjs');
  assert.match(app, /projectStore/);
  assert.match(app, /const store=projectStore\(state,today\)/);
  assert.match(app, /storeUi\.renderStore\(context\)/);
  assert.match(storeUi, /context\.store\.stockQuantity/);
  assert.match(storeUi, /context\.store\.receivableSatang/);
  assert.doesNotMatch(`${app}\n${storeUi}`, /function calculateStock\(/);
});
