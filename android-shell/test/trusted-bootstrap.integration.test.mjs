import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { DB_NAME } from '../www/trusted/source/greenfield/browser-store.mjs';
import { deactivateRuntimeSession } from '../www/trusted/source/greenfield/runtime-session.mjs';
const shellRoot = new URL('../', import.meta.url);
const read = relative => readFile(new URL(relative, shellRoot), 'utf8');
function expenseRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records ?? {}).map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION' && record?.direction === 'OUT' && String(record?.detail ?? '').includes('EXPENSE'));
}
async function resetVault() {
  deactivateRuntimeSession();
  await new Promise((resolve, reject) => { const request = fakeIndexedDB.deleteDatabase(DB_NAME); request.onsuccess=()=>resolve(); request.onerror=()=>reject(request.error||new Error('TEST_DB_DELETE_FAILED')); request.onblocked=()=>reject(new Error('TEST_DB_DELETE_BLOCKED')); });
}
async function loadBootstrap() { try { return await import('../www/trusted/bootstrap.mjs'); } catch (error) { assert.fail(`trusted bootstrap is required: ${error?.code ?? error?.message ?? error}`); } }

test('trusted bootstrap exposes only chat-gated Brain capability and preserves durable readback', async (t) => {
  await resetVault(); t.after(resetVault);
  const { initializeTrustedFirstRun, openTrustedBrain } = await loadBootstrap();
  const firstRun = await initializeTrustedFirstRun({ recoveryCode:'LH-bootstrap-recovery-code', pin:'445566', indexedDBImpl:fakeIndexedDB, now:() => '2026-08-31T00:30:00.000Z' });
  assert.equal(firstRun.status,'CREATED_VERIFIED');
  const session = await openTrustedBrain({ pin:'445566', indexedDBImpl:fakeIndexedDB, lockManager:null, now:() => '2026-08-31T00:30:01.000Z' });
  t.after(() => session.close());
  assert.equal(session.brain.execute, undefined); assert.equal(session.brain.requestExecution, undefined); assert.equal(typeof session.brain.send,'function');
  const before = await session.runtime.readState();
  const pending = await session.brain.send('ข้าว 65');
  assert.equal(pending.status,'CONFIRMATION_REQUIRED'); assert.equal(expenseRecords(await session.runtime.readState()).length,0); assert.equal((await session.runtime.readState()).revision,before.revision);
  const success = await session.brain.send('ยืนยัน');
  assert.equal(success.status,'SUCCESS'); assert.equal(success.readback.amountSatang,6500); assert.equal(expenseRecords(await session.runtime.readState()).length,1);
  session.close();
  const reopened = await openTrustedBrain({ pin:'445566', indexedDBImpl:fakeIndexedDB, lockManager:null, now:() => '2026-08-31T00:31:00.000Z' });
  const records = expenseRecords(await reopened.runtime.readState()); assert.equal(records.length,1); assert.equal(records[0].amountSatang,6500); reopened.close();
});

test('reopen while confirmation is pending fails closed and cannot execute stale pending work', async (t) => {
  await resetVault(); t.after(resetVault);
  const { initializeTrustedFirstRun, openTrustedBrain } = await loadBootstrap();
  await initializeTrustedFirstRun({ recoveryCode:'LH-bootstrap-restart-code', pin:'445577', indexedDBImpl:fakeIndexedDB, now:() => '2026-08-31T00:40:00.000Z' });
  const first = await openTrustedBrain({ pin:'445577', indexedDBImpl:fakeIndexedDB, lockManager:null, now:() => '2026-08-31T00:40:01.000Z' });
  assert.equal((await first.brain.send('ข้าว 65')).status,'CONFIRMATION_REQUIRED'); assert.equal(expenseRecords(await first.runtime.readState()).length,0); first.close();
  const reopened = await openTrustedBrain({ pin:'445577', indexedDBImpl:fakeIndexedDB, lockManager:null, now:() => '2026-08-31T00:41:00.000Z' });
  const result = await reopened.brain.send('ยืนยัน');
  assert.notEqual(result.status,'SUCCESS'); assert.equal(expenseRecords(await reopened.runtime.readState()).length,0); reopened.close();
});

test('stable APK entry goes through trusted bootstrap before Patch runtime', async () => {
  const html = await read('www/index.html'); const runtime = await read('www/patch/patch-runtime.mjs');
  assert.match(html,/src=["']\.\/trusted\/bootstrap\.mjs["']/); assert.doesNotMatch(html,/src=["']\.\/patch\/patch-runtime\.mjs["']/); assert.match(runtime,/__LIGHTHOUSE_TRUSTED_BOOTSTRAP__/);
});
