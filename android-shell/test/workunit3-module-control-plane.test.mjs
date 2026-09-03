import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryVaultStore } from '../app/public/logic/storage/persistence.mjs';
import { createModuleControlPlane, BUNDLED_MODULES } from '../app/public/logic/modules/module-control-plane.mjs';

function clock(start = Date.parse('2026-09-03T12:00:00.000Z')) {
  let now = start;
  return { now:() => new Date(now).toISOString(), advance:ms => { now += ms; } };
}

test('bundled descriptors expose the four owner modules', () => {
  assert.deepEqual(BUNDLED_MODULES.map(item => item.moduleId), ['income','outcome','calendar','ledger']);
  for (const descriptor of BUNDLED_MODULES) {
    assert.ok(descriptor.name);
    assert.ok(descriptor.version);
    assert.ok(descriptor.dataOwner);
    assert.ok(Array.isArray(descriptor.capabilities));
  }
});

test('UI and GO actors use the same command owner and durable readback', async () => {
  const store = createMemoryVaultStore();
  const plane = createModuleControlPlane({ store });
  await plane.initialize();
  const ui = await plane.execute({ commandId:'c1', actor:'USER', source:'UI', moduleId:'income', capability:'DISABLE', input:{}, expectedRevision:1 });
  assert.equal(ui.status, 'VERIFIED');
  const afterUi = await plane.snapshot();
  const go = await plane.execute({ commandId:'c2', actor:'GO', source:'CHAT', moduleId:'income', capability:'ACTIVATE', input:{}, expectedRevision:afterUi.revision });
  assert.equal(go.status, 'VERIFIED');
  assert.equal((await plane.snapshot()).modules.income.state, 'ACTIVE');
  assert.ok(ui.eventId && go.eventId);
});

test('confirmation expires, rejects revision drift, and cannot be reused', async () => {
  const time = clock();
  const store = createMemoryVaultStore();
  const plane = createModuleControlPlane({ store, now:time.now, confirmationTtlMs:1000 });
  await plane.initialize();
  const issued = await plane.requestConfirmation({ commandId:'p1', actor:'USER', source:'UI', moduleId:'ledger', capability:'PURGE', input:{} });
  time.advance(1001);
  await assert.rejects(() => plane.execute({ commandId:'p1', actor:'USER', source:'UI', moduleId:'ledger', capability:'PURGE', input:{}, expectedRevision:1, confirmationToken:issued.token }), /CONFIRMATION_EXPIRED/);

  const fresh = await plane.requestConfirmation({ commandId:'p2', actor:'USER', source:'UI', moduleId:'ledger', capability:'PURGE', input:{} });
  await plane.execute({ commandId:'m1', actor:'USER', source:'UI', moduleId:'income', capability:'DISABLE', input:{}, expectedRevision:1 });
  await assert.rejects(() => plane.execute({ commandId:'p2', actor:'USER', source:'UI', moduleId:'ledger', capability:'PURGE', input:{}, expectedRevision:2, confirmationToken:fresh.token }), /CONFIRMATION_REVISION_CHANGED/);

  const reusable = await plane.requestConfirmation({ commandId:'p3', actor:'USER', source:'UI', moduleId:'ledger', capability:'PURGE', input:{} });
  const revision = (await plane.snapshot()).revision;
  await plane.execute({ commandId:'p3', actor:'USER', source:'UI', moduleId:'ledger', capability:'PURGE', input:{}, expectedRevision:revision, confirmationToken:reusable.token });
  await assert.rejects(() => plane.execute({ commandId:'p3', actor:'USER', source:'UI', moduleId:'ledger', capability:'PURGE', input:{}, expectedRevision:revision + 1, confirmationToken:reusable.token }), /CONFIRMATION_USED/);
});

test('disable and uninstall preserve module data; purge is separately confirmed', async () => {
  const store = createMemoryVaultStore();
  await store.put('module-data:income', { rows:[1,2,3] });
  const plane = createModuleControlPlane({ store });
  await plane.initialize();
  await plane.execute({ commandId:'d1', actor:'USER', source:'UI', moduleId:'income', capability:'DISABLE', input:{}, expectedRevision:1 });
  assert.deepEqual(await store.get('module-data:income'), { rows:[1,2,3] });
  await plane.execute({ commandId:'u1', actor:'USER', source:'UI', moduleId:'income', capability:'UNINSTALL', input:{}, expectedRevision:2 });
  assert.deepEqual(await store.get('module-data:income'), { rows:[1,2,3] });
  await assert.rejects(() => plane.execute({ commandId:'p1', actor:'USER', source:'UI', moduleId:'income', capability:'PURGE', input:{}, expectedRevision:3 }), /CONFIRMATION_REQUIRED/);
});
