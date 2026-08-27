"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Master Input reuses the already-unlocked Runtime without storing or capturing the device PIN', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');
  const app = fs.readFileSync('ui/app.mjs', 'utf8');

  assert.doesNotMatch(master, /sessionStorage/);
  assert.doesNotMatch(master, /metro-auto-unlock-pin/);
  assert.doesNotMatch(master, /openGreenfieldRuntimeWithDevicePin/);
  assert.doesNotMatch(master, /location\.reload/);
  assert.match(master, /ygph:master-runtime-request/);
  assert.match(master, /ygph:master-runtime-committed/);
  assert.match(app, /ygph:master-runtime-request/);
  assert.match(app, /ygph:master-runtime-committed/);
});
