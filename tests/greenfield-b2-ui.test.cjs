"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

test('B2 module creates AI and Manual operational surfaces without rewriting the legacy shell', () => {
  const ui = read('ui/b2-foundation.mjs');
  for (const required of [
    'b2Workspace','data-b2-page="ai"','data-b2-page="manual"','b2AiForm','b2AppLanguage',
    'b2SendToManual','b2ManualAreas','b2ManualResult','b2Audit','b2ManualForm',
  ]) assert.match(ui, new RegExp(required));
  assert.match(ui, /b2-foundation\.css/);
});

test('B2 UI borrows the active Runtime session and keeps both gates distinct', () => {
  const release = read('ui/release-status.mjs');
  const ui = read('ui/b2-foundation.mjs');
  assert.match(release, /import ['"]\.\/b2-foundation\.mjs['"]/);
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
