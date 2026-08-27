"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Master Input owns no device credential or persisted unlock state', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');

  assert.doesNotMatch(master, /sessionStorage/);
  assert.doesNotMatch(master, /localStorage/);
  assert.doesNotMatch(master, /metro-auto-unlock-pin/);
  assert.doesNotMatch(master, /location\.reload/);
  assert.doesNotMatch(master, /openGreenfieldRuntimeWithDevicePin/);
  assert.doesNotMatch(master, /devicePin|sessionPin|captureDevicePin|installCredentialTracking/);
  assert.match(master, /withRuntimeSession/);
});

test('Master Input borrows the app-owned Runtime and never closes that shared session', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');
  const app = fs.readFileSync('ui/app.mjs', 'utf8');

  assert.match(master, /withMasterRuntime/);
  assert.doesNotMatch(master, /runtime\?*\.close\s*\(/);
  assert.match(master, /ygph:daily-lifecycle/);
  assert.match(app, /activateRuntimeSession/);
  assert.match(app, /deactivateRuntimeSession/);
  assert.match(app, /releaseRuntime/);
});
