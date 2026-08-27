"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

test('B2 shell exposes AI and Manual operational surfaces', () => {
  const html = read('index.html');
  assert.match(html, /id="b2Workspace"/);
  assert.match(html, /data-b2-page="ai"/);
  assert.match(html, /data-b2-page="manual"/);
  assert.match(html, /id="b2AiForm"/);
  assert.match(html, /id="b2AppLanguage"/);
  assert.match(html, /id="b2SendToManual"/);
  assert.match(html, /id="b2ManualAreas"/);
  assert.match(html, /id="b2ManualResult"/);
  assert.match(html, /id="b2Audit"/);
  assert.match(html, /ui\/b2-foundation\.css/);
});

test('B2 UI borrows the active Runtime session and keeps both gates distinct', () => {
  const app = read('app.mjs');
  const ui = read('ui/b2-foundation.mjs');
  assert.match(app, /import ['"]\.\/ui\/b2-foundation\.mjs['"]/);
  assert.match(ui, /withRuntimeSession/);
  assert.match(ui, /translateIntentToAppLanguage/);
  assert.match(ui, /executeManualAppLanguage/);
  assert.match(ui, /FOUNDATION_MANUAL_AREAS/);
  assert.doesNotMatch(ui, /openGreenfieldRuntime|openGreenfieldRuntimeWithDevicePin/);
});

test('B2 UI waits for the unlocked workspace instead of owning authentication', () => {
  const ui = read('ui/b2-foundation.mjs');
  assert.match(ui, /MutationObserver/);
  assert.match(ui, /workspace/);
  assert.doesNotMatch(ui, /devicePin|recoveryPassphrase|unlockVault/);
});
