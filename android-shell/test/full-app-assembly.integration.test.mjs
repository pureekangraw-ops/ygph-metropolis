import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

async function json(path) { return JSON.parse(await read(path)); }

test('packaged APK boots the full LIGHTHOUSE shell instead of Foundation Proof', async () => {
  const index = await read('www/index.html');
  const version = await json('www/app/version.json');
  const ui = await read('www/app/ui.html');
  const logic = await read('www/app/logic.mjs');
  assert.equal(version.version, '0.0.7');
  assert.doesNotMatch(index, /Foundation Proof/i);
  assert.match(ui, /data-chat-log/);
  assert.match(ui, /data-manual-panel/);
  assert.match(ui, /data-settings-panel/);
  assert.match(logic, /host/);
  assert.match(logic, /patchUpdater/);
});

test('current Patch presents the same full shell and advances from 0.0.6', async () => {
  const contract = await json('release/current-patch.json');
  assert.deepEqual(contract, {
    version:'0.0.7',
    primaryBaseVersion:'0.0.6',
    bootstrapBaseVersion:'0.0.1',
    releaseDirectory:'release/front-door-0.0.7',
  });
  const ui = await read('release/front-door-0.0.7/ui.html');
  const logic = await read('release/front-door-0.0.7/logic.mjs');
  assert.match(ui, /data-manual-panel/);
  assert.match(ui, /data-permission-status/);
  assert.match(logic, /CHAT/);
  assert.match(logic, /MANUAL/);
  assert.match(logic, /SETTINGS/);
});

test('Android package version advances monotonically from 1.0.1 (1002)', async () => {
  const version = await json('version.json');
  assert.equal(version.versionCode, 1003);
  assert.equal(version.versionName, '1.0.2');
});

test('trusted host bridge reuses Runtime/Manual owner and fails permission state closed', async () => {
  const source = await read('www/trusted/app-bridge.mjs');
  assert.match(source, /createManualFourHouses/);
  assert.match(source, /resolveRecordReference/);
  assert.match(source, /status:'VERIFY'/);
  assert.doesNotMatch(source, /indexedDB|localStorage|sessionStorage|createGreenfieldRuntime|openGreenfieldRuntime/);
});

test('full shell preserves CHAT → MANUAL → SETTINGS → MANUAL → CHAT back flow', async () => {
  const logic = await read('release/front-door-0.0.7/logic.mjs');
  assert.match(logic, /openManual/);
  assert.match(logic, /openSettings/);
  assert.match(logic, /returnFromSettings/);
  assert.match(logic, /returnToChat/);
  assert.match(logic, /host\.resolve/);
  assert.match(logic, /host\.reverse/);
});
