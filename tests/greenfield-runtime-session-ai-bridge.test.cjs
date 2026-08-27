'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('shared Runtime session is in-memory capability only and owns no credential', async () => {
  const sessionPath = path.resolve('greenfield/runtime-session.mjs');
  const source = fs.readFileSync(sessionPath, 'utf8');

  assert.doesNotMatch(source, /pin|password|passphrase|sessionStorage|localStorage/i);
  assert.match(source, /activateRuntimeSession/);
  assert.match(source, /deactivateRuntimeSession/);
  assert.match(source, /withRuntimeSession/);

  const url = pathToFileURL(sessionPath);
  url.searchParams.set('test', String(Date.now()));
  const session = await import(url.href);
  const fakeRuntime = { readState() {}, project() {} };

  await assert.rejects(() => session.withRuntimeSession(async () => true), /RUNTIME_SESSION_LOCKED/);
  session.activateRuntimeSession(fakeRuntime);
  assert.equal(await session.withRuntimeSession(async runtime => runtime), fakeRuntime);
  session.deactivateRuntimeSession(fakeRuntime);
  await assert.rejects(() => session.withRuntimeSession(async () => true), /RUNTIME_SESSION_LOCKED/);
});

test('Master Input borrows the app Runtime session and never reopens with a device credential', () => {
  const master = fs.readFileSync('ui/master-input.mjs', 'utf8');

  assert.match(master, /withRuntimeSession/);
  assert.doesNotMatch(master, /openGreenfieldRuntimeWithDevicePin/);
  assert.doesNotMatch(master, /devicePin|sessionPin|captureDevicePin|installCredentialTracking/);
  assert.doesNotMatch(master, /runtime\?*\.close\s*\(/);
});

test('primary UI publishes and clears the same Runtime session lifecycle', () => {
  const app = fs.readFileSync('ui/app.mjs', 'utf8');

  assert.match(app, /activateRuntimeSession/);
  assert.match(app, /deactivateRuntimeSession/);
  assert.match(app, /releaseRuntime/);
  assert.match(app, /adoptRuntime/);
  assert.match(app, /systemLockBtn/);
});

test('PWA code assets do not remain cache-first after this refit', () => {
  const sw = fs.readFileSync('sw.js', 'utf8');

  assert.match(sw, /codeNetworkFirst/);
  assert.match(sw, /request\.destination===['"]script['"]/);
  assert.match(sw, /request\.destination===['"]style['"]/);
});
