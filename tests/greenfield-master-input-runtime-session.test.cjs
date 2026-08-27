"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Master Input never persists the device PIN and refreshes the unlocked app after durable mutation', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');
  const app = fs.readFileSync('ui/app.mjs', 'utf8');

  assert.doesNotMatch(master, /sessionStorage/);
  assert.doesNotMatch(master, /metro-auto-unlock-pin/);
  assert.doesNotMatch(master, /pendingPassword/);
  assert.doesNotMatch(master, /location\.reload/);
  assert.match(master, /openGreenfieldRuntimeWithDevicePin/);
  assert.match(master, /devicePin/);
  assert.match(master, /ygph:daily-lifecycle/);
  assert.match(app, /ygph:daily-lifecycle/);
});
