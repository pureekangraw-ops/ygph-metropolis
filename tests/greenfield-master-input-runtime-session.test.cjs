"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Master Input captures the successful-login PIN only in page memory and never persists it', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');

  assert.doesNotMatch(master, /sessionStorage/);
  assert.doesNotMatch(master, /localStorage/);
  assert.doesNotMatch(master, /metro-auto-unlock-pin/);
  assert.doesNotMatch(master, /location\.reload/);
  assert.match(master, /let sessionPin\s*=\s*['"]["']/);
  assert.match(master, /unlockBtn/);
  assert.match(master, /devicePin/);
  assert.match(master, /capture:\s*true/);
  assert.match(master, /openGreenfieldRuntimeWithDevicePin\(\{\s*pin:\s*sessionPin\s*\}\)/);
});

test('Master Input clears its in-memory PIN when the app locks and still closes only its own temporary Runtime', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');

  assert.match(master, /systemLockBtn/);
  assert.match(master, /sessionPin\s*=\s*['"]["']/);
  assert.match(master, /runtime\?*\.close\s*\(/);
  assert.match(master, /ygph:daily-lifecycle/);
});
