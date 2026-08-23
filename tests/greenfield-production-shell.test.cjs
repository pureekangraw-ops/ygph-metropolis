"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('production navigation is icon command strip plus Home bubble', () => {
  const html = read('index.html');
  const nav = html.match(/<nav id="commandNav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.deepEqual([...nav.matchAll(/data-command-destination="([^"]+)"/g)].map(m => m[1]), ['store','ride','finance']);
  for (const label of ['ร้านค้า','วิ่งงาน','การเงิน','ตั้งค่า']) assert.match(nav, new RegExp(`aria-label="${label}"`));
  assert.match(html, /id="homeBubble"[^>]*aria-label="หน้าหลัก"/);
  assert.doesNotMatch(html, /id="bottomNav"|id="thumbRail"|class="rail-btn|data-area="money"/);
});

test('Home orders attention before summary before cash-flow chart and has no duplicate city doors', () => {
  const html = read('index.html');
  const home = html.match(/<section[^>]*data-area-page="home"[\s\S]*?<\/section>/)?.[0] || '';
  const attention = home.indexOf('id="attentionList"');
  const summary = home.indexOf('id="homeSummary"');
  const chart = home.indexOf('id="homeCashFlowChart"');
  assert.ok(attention >= 0 && summary > attention && chart > summary);
  for (const id of ['homeBalance','homeGenerated','homeStock','homeDue']) assert.match(home, new RegExp(`id="${id}"`));
  assert.doesNotMatch(home, /id="cityEntries"|data-city-entry=/);
  assert.doesNotMatch(home.slice(0, chart), /<form\b/);
});

test('Store Ride Finance are direct areas while Calendar is Finance-hosted and Settings is a dialog utility', () => {
  const html = read('index.html');
  for (const area of ['home','store','ride','finance']) assert.equal((html.match(new RegExp(`data-area-page="${area}"`, 'g')) || []).length, 1, area);
  assert.equal((html.match(/data-area-page="calendar"/g) || []).length, 0, 'calendar visible area');
  assert.equal((html.match(/data-area-page="system"/g) || []).length, 0, 'system page');
  assert.match(html, /id="financeSchedule"/);
  assert.match(html, /<dialog[^>]*id="settingsDialog"/);
  assert.doesNotMatch(html, /data-area-page="money"|data-money-page=|id="moneyChildToggle"|id="moneyChildren"/);
  assert.match(html, /id="settingsBtn"[^>]*aria-label="ตั้งค่า"/);
});

test('mobile CSS does not reserve a right-side or bottom navigation rail', () => {
  const css = read('styles.css');
  assert.match(css, /\.appbar\{[^}]*position:sticky[^}]*top:0/s);
  assert.match(css, /\.home-bubble\{[^}]*position:fixed/s);
  assert.doesNotMatch(css, /\.bottom-nav|\.thumb-rail/);
  assert.doesNotMatch(css, /padding-right\s*:\s*76px/);
});

test('release manifest names the production shell truth', () => {
  const manifest = JSON.parse(read('RELEASE_MANIFEST.json'));
  assert.deepEqual(manifest.functionalShell.areas, ['HOME','STORE','RIDE','FINANCE']);
  assert.equal(manifest.functionalShell.calendarSurface, 'FINANCE_SCHEDULE');
  assert.deepEqual(manifest.functionalShell.utilities, ['SYSTEM']);
  assert.equal(manifest.functionalShell.navigation, 'COMMAND_STRIP_HOME_BUBBLE_V1');
});
