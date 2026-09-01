"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('CHAT → MANUAL → SETTINGS is one continuous shell flow without a new truth owner', () => {
  const app = read('ui/app.mjs');
  const manual = read('ui/manual-finance-ui.mjs');
  const master = read('ui/master-input.mjs');
  const settings = read('ui/settings-ui.mjs');
  const html = read('index.html');

  assert.match(app, /configureMasterInputBridge\(\{peek:reference=>manualUi\.peekReference\(reference\),open:reference=>openManualFromChat\(reference\),back:\(\)=>returnToManual\(\)\}\)/);
  assert.match(app, /async function openManualFromChat\(reference\).*manualUi\.openReference\(reference\)/s);
  assert.match(app, /async function askFromManual\(payload\).*setMasterInputSubject\(payload\)/s);
  assert.match(app, /function returnToChat\(\).*restoreMasterInputContext\(bridgeReturnToChat\)/s);

  assert.match(app, /function openSettings\(\).*settingsDialog.*showModal\(\)/s);
  assert.match(html, /id="settingsBtn"[^>]*aria-label="ตั้งค่า"/);
  assert.match(html, /id="settingsDialog"/);
  assert.doesNotMatch(html, /data-area-page="settings"/);

  assert.match(manual, /openReference/);
  assert.match(master, /captureMasterInputContext/);
  assert.match(master, /restoreMasterInputContext/);
  assert.match(settings, /settingsUtilityIndex/);

  assert.doesNotMatch(app, /bridge(Store|Storage|Database)/);
  assert.doesNotMatch(manual, /bridge(Store|Storage|Database)/);
});

test('Settings remains utility-only and does not become business Truth', () => {
  const settings = read('ui/settings-ui.mjs');
  const app = read('ui/app.mjs');

  assert.match(settings, /การใช้งาน/);
  assert.match(settings, /ข้อมูลและการสำรอง/);
  assert.match(settings, /ความปลอดภัย/);
  assert.match(settings, /เกี่ยวกับแอป/);
  assert.match(settings, /ขั้นสูง/);
  assert.match(settings, /permission-owner-unavailable/);

  assert.doesNotMatch(settings, /createGreenfieldRuntime|createManualFourHouses|ledgerTransaction|recordId\s*:/);
  assert.match(app, /createManualFourHouses\(runtime/);
});
