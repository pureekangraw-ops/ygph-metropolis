"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Master Input borrows the already-unlocked Runtime without persisting or rereading the device PIN', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');
  const runtime = fs.readFileSync('greenfield/runtime.mjs', 'utf8');

  assert.doesNotMatch(master, /sessionStorage/);
  assert.doesNotMatch(master, /metro-auto-unlock-pin/);
  assert.doesNotMatch(master, /pendingPassword/);
  assert.doesNotMatch(master, /location\.reload/);
  assert.doesNotMatch(master, /openGreenfieldRuntimeWithDevicePin/);
  assert.doesNotMatch(master, /\$\(['"]devicePin['"]\)/);
  assert.match(master, /borrowUnlockedGreenfieldRuntime/);
  assert.match(runtime, /export function borrowUnlockedGreenfieldRuntime/);
  assert.match(runtime, /activeDeviceRuntime/);
  assert.match(master, /ygph:daily-lifecycle/);
});

test('Master Input never closes the app-owned Runtime and Runtime close revokes the borrowed session', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');
  const runtime = fs.readFileSync('greenfield/runtime.mjs', 'utf8');
  assert.doesNotMatch(master, /runtime\?*\.close\s*\(/);
  assert.match(runtime, /activeDeviceRuntime\s*=\s*null/);
  assert.match(runtime, /onClose/);
});
