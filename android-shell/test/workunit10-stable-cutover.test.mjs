import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { createGreenfieldState } from '../../greenfield/core.mjs';
import { createMemoryVaultStore, commitEncryptedState } from '../../greenfield/persistence.mjs';
import { createCanonicalGreenfieldRuntime } from '../../greenfield/canonical-runtime-bridge.mjs';
import { buildOtherIncomeWorkflow } from '../../greenfield/business-workflows.mjs';
import { DB_NAME } from '../www/trusted/source/greenfield/browser-store.mjs';
import { deactivateRuntimeSession } from '../www/trusted/source/greenfield/runtime-session.mjs';
import { initializeTrustedFirstRun, openTrustedBrain } from '../www/trusted/bootstrap.mjs';

const PASSPHRASE = 'LH-cutover-runtime-passphrase';
const NOW = '2026-09-04T13:10:00.000Z';

async function fixture() {
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:NOW });
  await commitEncryptedState({ store, passphrase:PASSPHRASE, state, expectedDurableRevision:null });
  return { store, runtime:createCanonicalGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => NOW }) };
}

async function resetTrustedVault() {
  deactivateRuntimeSession();
  await new Promise((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('TEST_DB_DELETE_FAILED'));
    request.onblocked = () => reject(new Error('TEST_DB_DELETE_BLOCKED'));
  });
}

function externalOwners() {
  return {
    session:Object.freeze({ lock:async () => ({ status:'LOCKED' }) }),
    recovery:Object.freeze({ retry:async payload => ({ status:'VERIFIED', readback:structuredClone(payload) }) }),
    backup:Object.freeze({
      exportBackup:async () => ({ revision:1, exportedAt:NOW, artifactHash:'backup-hash' }),
      readback:async artifact => ({ status:'VERIFIED', revision:artifact.revision, exportedAt:artifact.exportedAt, artifactHash:artifact.artifactHash }),
    }),
    updates:Object.freeze({ snapshot:async () => ({ state:'IDLE' }) }),
    events:Object.freeze({ emit:async event => ({ status:'VERIFIED', readback:structuredClone(event) }) }),
    query:async payload => ({ status:'VERIFIED', readback:structuredClone(payload) }),
    provider:async payload => ({ status:'VERIFIED', readback:structuredClone(payload) }),
  };
}

async function loadComposition() {
  try {
    return await import('../app/public/app/stable-service-composition.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

test('stable cutover exposes canonical multi-group mutation through the existing encrypted runtime owner', async () => {
  const { runtime } = await fixture();
  assert.equal(typeof runtime.executeMultiGroupCommands, 'function');

  const workflow = buildOtherIncomeWorkflow({
    workflowId:'WF-CUTOVER-INCOME-1',
    ledgerTransactionId:'TX-CUTOVER-INCOME-1',
    amountSatang:12345,
    title:'canonical cutover witness',
  });
  const result = await runtime.executeMultiGroupCommands(workflow.commands);
  assert.ok(['COMMITTED','RECOVERED','VERIFIED'].includes(result.status));

  const durable = await runtime.readState();
  const record = durable.domains.LEDGER.records['TX-CUTOVER-INCOME-1']?.record;
  assert.equal(record?.amountSatang, 12345);
  assert.equal(record?.direction, 'IN');
});

test('canonical service metadata stays encrypted in the same durable vault across runtime reopen', async () => {
  const { store, runtime } = await fixture();
  assert.equal(typeof runtime.metadataStore, 'function');
  const metadata = runtime.metadataStore();
  const before = await runtime.readState();

  await metadata.put('module-registry', { revision:1, marker:'CANONICAL' });
  assert.deepEqual(await metadata.get('module-registry'), { revision:1, marker:'CANONICAL' });
  const after = await runtime.readState();
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.meta?.canonicalServices?.['module-registry']?.marker, 'CANONICAL');

  runtime.close();
  const reopened = createCanonicalGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => NOW });
  const reopenedMetadata = reopened.metadataStore();
  assert.deepEqual(await reopenedMetadata.get('module-registry'), { revision:1, marker:'CANONICAL' });

  await reopenedMetadata.delete('module-registry');
  assert.equal(await reopenedMetadata.get('module-registry'), null);
  assert.equal((await reopened.readState()).meta?.canonicalServices?.['module-registry'], undefined);
});

test('stable composition creates all eight canonical owners and Manual writes into the existing encrypted ledger', async () => {
  const composition = await loadComposition();
  assert.equal(typeof composition?.createStableAppServices, 'function');
  const { runtime } = await fixture();
  const services = await composition.createStableAppServices({ runtime, ...externalOwners(), now:() => NOW });

  assert.deepEqual(Object.keys(services).sort(), ['backup','chat','events','manual','modules','recovery','session','updates']);
  assert.deepEqual((await services.modules.list()).map(item => item.moduleId), ['income','outcome','calendar','ledger']);

  const result = await services.manual.addIncome({
    workflowId:'WF-CUTOVER-MANUAL-1',
    recordId:'TX-CUTOVER-MANUAL-1',
    title:'manual canonical witness',
    amountSatang:6789,
  });
  assert.equal(result.status, 'VERIFIED');
  assert.equal((await runtime.readState()).domains.LEDGER.records['TX-CUTOVER-MANUAL-1']?.record?.amountSatang, 6789);
});

test('canonical CHAT multi-group route commits through the same encrypted runtime and returns durable readback', async () => {
  const composition = await loadComposition();
  assert.equal(typeof composition?.createStableAppServices, 'function');
  const { runtime } = await fixture();
  const services = await composition.createStableAppServices({ runtime, ...externalOwners(), now:() => NOW });
  const workflow = buildOtherIncomeWorkflow({
    workflowId:'WF-CUTOVER-CHAT-1',
    ledgerTransactionId:'TX-CUTOVER-CHAT-1',
    amountSatang:4321,
    title:'chat canonical witness',
  });

  const response = await services.chat.dispatch({
    requestId:'REQ-CUTOVER-CHAT-1',
    route:'LOCAL_MULTI_GROUP',
    payload:{ commands:workflow.commands },
  });
  assert.equal(response.status, 'SUCCESS');
  assert.equal(response.result.readback.domains.LEDGER.records['TX-CUTOVER-CHAT-1']?.record?.amountSatang, 4321);
  assert.equal((await runtime.readState()).domains.LEDGER.records['TX-CUTOVER-CHAT-1']?.record?.amountSatang, 4321);
});

test('canonical Manual accepts its revision-bound command envelope for calendar mutations', async () => {
  const composition = await loadComposition();
  const { runtime } = await fixture();
  const services = await composition.createStableAppServices({ runtime, ...externalOwners(), now:() => NOW });

  const result = await services.manual.createCalendarItem({
    workflowId:'WF-CUTOVER-CALENDAR-1',
    recordId:'CAL-CUTOVER-1',
    type:'VERIFY',
    title:'calendar canonical witness',
    dueDate:'2026-09-05',
  });
  assert.equal(result.status, 'VERIFIED');
  assert.equal((await runtime.readState()).domains.CALENDAR.records['CAL-CUTOVER-1']?.record?.status, 'OPEN');
});

test('stable bootstrap opens the canonical runtime bridge after device PIN unlock while preserving the legacy brain safety net', async () => {
  const source = await readFile(new URL('../www/trusted/bootstrap.mjs', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/source\/greenfield\/canonical-runtime-bridge\.mjs'/);
  assert.match(source, /openCanonicalGreenfieldRuntimeWithDevicePin\s*\(/);
  assert.doesNotMatch(source, /openGreenfieldRuntimeWithDevicePin\s*\(/);
  assert.match(source, /createTrustedBrainAdapter/);
  assert.match(source, /createTrustedBrainGate/);
});

test('stable bootstrap composes packaged canonical services and exposes them on the trusted session', async (t) => {
  const source = await readFile(new URL('../www/trusted/bootstrap.mjs', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/source\/app\/app\/stable-service-composition\.mjs'/);
  assert.match(source, /createStableAppServices\s*\(/);
  assert.match(source, /\bservices\b/);

  await resetTrustedVault();
  let session = null;
  t.after(async () => {
    session?.close();
    await resetTrustedVault();
  });
  await initializeTrustedFirstRun({
    recoveryCode:'LH-cutover-session-recovery',
    pin:'778899',
    indexedDBImpl:fakeIndexedDB,
    now:() => NOW,
  });
  session = await openTrustedBrain({
    pin:'778899',
    indexedDBImpl:fakeIndexedDB,
    lockManager:null,
    now:() => '2026-09-04T13:10:01.000Z',
    documentRef:null,
  });

  assert.deepEqual(Object.keys(session.services || {}).sort(), ['backup','chat','events','manual','modules','recovery','session','updates']);
  assert.deepEqual((await session.services.modules.list()).map(item => item.moduleId), ['income','outcome','calendar','ledger']);
});
