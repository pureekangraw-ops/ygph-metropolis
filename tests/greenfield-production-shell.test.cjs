"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('production navigation is bottom Home Store Ride Finance Calendar', () => {
  const html = read('index.html');
  const nav = html.match(/<nav id="bottomNav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.deepEqual([...nav.matchAll(/data-destination="([^"]+)"/g)].map(m => m[1]), ['home','store','ride','finance','calendar']);
  assert.equal((nav.match(/class="bottom-nav-btn/g) || []).length, 5);
  for (const label of ['หน้าหลัก','ร้านค้า','วิ่งงาน','การเงิน','ปฏิทิน']) assert.match(nav, new RegExp(`aria-label="${label}"`));
  assert.doesNotMatch(html, /id="thumbRail"|class="rail-btn|data-area="money"/);
});

test('Home orders attention before summary before city doors', () => {
  const html = read('index.html');
  const home = html.match(/<section[^>]*data-area-page="home"[\s\S]*?<\/section>/)?.[0] || '';
  const attention = home.indexOf('id="attentionList"');
  const summary = home.indexOf('id="homeSummary"');
  const cities = home.indexOf('id="cityEntries"');
  assert.ok(attention >= 0 && summary > attention && cities > summary);
  for (const id of ['homeBalance','homeGenerated','homeStock','homeDue']) assert.match(home, new RegExp(`id="${id}"`));
  for (const city of ['store','ride','finance','calendar']) assert.match(home, new RegExp(`data-city-entry="${city}"`));
  assert.doesNotMatch(home.slice(0, cities), /<form\b/);
});

test('Store and Ride are direct areas while Settings is a dialog utility', () => {
  const html = read('index.html');
  for (const area of ['home','store','ride','finance','calendar']) assert.equal((html.match(new RegExp(`data-area-page="${area}"`, 'g')) || []).length, 1, area);
  assert.equal((html.match(/data-area-page="system"/g) || []).length, 0, 'system page');
  assert.match(html, /<dialog[^>]*id="settingsDialog"/);
  assert.doesNotMatch(html, /data-area-page="money"|data-money-page=|id="moneyChildToggle"|id="moneyChildren"/);
  assert.match(html, /id="settingsBtn"[^>]*aria-label="ตั้งค่า"/);
  const nav = html.match(/<nav id="bottomNav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.doesNotMatch(nav, /data-destination="system"|aria-label="ตั้งค่า"/);
});

test('mobile CSS does not reserve a right-side rail', () => {
  const css = read('styles.css');
  assert.match(css, /\.bottom-nav\s*\{[^}]*position\s*:\s*fixed[^}]*bottom\s*:/s);
  assert.match(css, /\.bottom-nav-btn\s*\{[^}]*min-height\s*:\s*(?:48|5[0-9])px/s);
  assert.doesNotMatch(css, /\.thumb-rail/);
  assert.doesNotMatch(css, /padding-right\s*:\s*76px/);
});

test('release manifest names the production shell truth', () => {
  const manifest = JSON.parse(read('RELEASE_MANIFEST.json'));
  assert.deepEqual(manifest.functionalShell.areas, ['HOME','STORE','RIDE','FINANCE','CALENDAR']);
  assert.deepEqual(manifest.functionalShell.utilities, ['SYSTEM']);
  assert.equal(manifest.functionalShell.navigation, 'BOTTOM_NAV');
});
