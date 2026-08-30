import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';

import { DB_NAME } from '../www/trusted/source/greenfield/browser-store.mjs';
import {
  deactivateRuntimeSession,
} from '../www/trusted/source/greenfield/runtime-session.mjs';

const shellRoot = new URL('../', import.meta.url);
const read = (relative) => readFile(new URL(relative, shellRoot), 'utf8');

function expenseRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records ?? {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION' && record?.direction === 'OUT' && String(record?.detail ?? '').includes('EXPENSE'));
}

async function resetVault() {
  deactivateRuntimeSession();
  await new Promise((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('TEST_DB_DELETE_FAILED'));
    request.onblocked = () => reject(new Error('TEST_DB_DELETE_BLOCKED'));
  });
}

async function loadBootstrap() {
  try {
    return await import('../www/trusted/bootstrap.mjs');
  } catch (error) {
    assert.fail(`trusted bootstrap is required: ${error?.code ?? error?.message ?? error}`);
  }
}

test('trusted bootstrap reuses audited first-run/PIN runtime and exposes only gated Brain capability', async (t) => {
  await resetVault();
  t.after(resetVault);
  const { initializeTrustedFirstRun, openTrustedBrain } = await loadBootstrap();

  const firstRun = await initializeTrustedFirstRun({
    recoveryCode:'LH-bootstrap-recovery-code',
    pin:'445566',
    indexedDBImpl:fakeIndexedDB,
    now:() => '2026-08-31T00:30:00.000Z',
  });
  assert.equal(firstRun.status, 'CREATED_VERIFIED');

  let confirmations = 0;
  const session = await openTrustedBrain({
    pin:'445566',
    indexedDBImpl:fakeIndexedDB,
    lockManager:null,
    now:() => '2026-08-31T00:30:01.000Z',
    confirmImpl:() => {
      confirmations += 1;
      return true;
    },
  });
  t.after(() => session.close());

  assert.equal(session.brain.execute, undefined);
  assert.equal(typeof session.brain.send, 'function');
  assert.equal(typeof session.brain.requestExecution, 'function');

  const before = await session.runtime.readState();
  const ready = await session.brain.send('ข้าว 65');
  assert.equal(ready.status, 'READY');
  assert.equal(expenseRecords(await session.runtime.readState()).length, 0);
  assert.equal((await session.runtime.readState()).revision, before.revision);

  const success = await session.brain.requestExecution();
  assert.equal(confirmations, 1);
  assert.equal(success.status, 'SUCCESS');
  assert.equal(success.readback.amountSatang, 6500);
  assert.equal(expenseRecords(await session.runtime.readState()).length, 1);

  session.close();
  const reopened = await openTrustedBrain({
    pin:'445566',
    indexedDBImpl:fakeIndexedDB,
    lockManager:null,
    now:() => '2026-08-31T00:31:00.000Z',
    confirmImpl:() => false,
  });
  const records = expenseRecords(await reopened.runtime.readState());
  assert.equal(records.length, 1);
  assert.equal(records[0].amountSatang, 6500);
  reopened.close();
});

test('stable APK entry goes through trusted bootstrap before Patch runtime', async () => {
  const html = await read('www/index.html');
  const runtime = await read('www/patch/patch-runtime.mjs');

  assert.match(html, /src=["']\.\/trusted\/bootstrap\.mjs["']/);
  assert.doesNotMatch(html, /src=["']\.\/patch\/patch-runtime\.mjs["']/);
  assert.match(runtime, /__LIGHTHOUSE_TRUSTED_BOOTSTRAP__/);
});
