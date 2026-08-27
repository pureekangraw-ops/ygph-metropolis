"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Master Input borrows the already-unlocked app Runtime without persisting or rereading the device PIN', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');
  const app = fs.readFileSync('ui/app.mjs', 'utf8');

  assert.doesNotMatch(master, /sessionStorage/);
  assert.doesNotMatch(master, /metro-auto-unlock-pin/);
  assert.doesNotMatch(master, /pendingPassword/);
  assert.doesNotMatch(master, /location\.reload/);
  assert.doesNotMatch(master, /openGreenfieldRuntimeWithDevicePin/);
  assert.doesNotMatch(master, /\$\(['"]devicePin['"]\)/);
  assert.match(master, /ygph:runtime-session-request/);
  assert.match(app, /ygph:runtime-session-request/);
  assert.match(master, /ygph:daily-lifecycle/);
  assert.match(app, /ygph:daily-lifecycle/);
});

test('Master Input never closes the app-owned Runtime session', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');
  assert.doesNotMatch(master, /runtime\?*\.close\s*\(/);
});
