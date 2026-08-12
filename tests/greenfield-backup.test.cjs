"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

async function seededStore() {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-12T11:10:00.000Z' });
  state.domains.STORE.records.S1 = { record:{ recordId:'S1', source:'STORE', type:'SALE', title:'secret-sale', amountSatang:12345, quantity:1, status:'COMPLETED' }, provenance:{ origin:'LIVE_COMMAND' }, history:[] };
  await commitEncryptedState({ store, passphrase:'correct horse battery staple', state, expectedDurableRevision:null });
  return { store, state };
}

test('greenfield encrypted backup round-trips into an empty store with verified decrypt readback', async () => {
  const { createMemoryVaultStore, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { exportGreenfieldBackup, restoreGreenfieldBackup } = await import('../greenfield/backup.mjs');
  const { store, state } = await seededStore();
  const backup = await exportGreenfieldBackup({ store, exportedAt:'2026-08-12T11:11:00.000Z' });
  assert.equal(backup.backupFormat, 'ygph-metropolis-greenfield-backup');
  assert.equal(backup.backupVersion, 1);
  assert.equal(backup.state, undefined);
  assert.ok(backup.vault.ciphertext);
  assert.equal(JSON.stringify(backup).includes('secret-sale'), false);
  const target = createMemoryVaultStore();
  const result = await restoreGreenfieldBackup({ store:target, backup, passphrase:'correct horse battery staple' });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.revision, 1);
  assert.deepEqual(await readEncryptedState({ store:target, passphrase:'correct horse battery staple' }), state);
});

test('wrong passphrase or corrupt backup writes nothing to target store', async () => {
  const { createMemoryVaultStore, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { exportGreenfieldBackup, restoreGreenfieldBackup } = await import('../greenfield/backup.mjs');
  const { store } = await seededStore();
  const backup = await exportGreenfieldBackup({ store });
  const target1 = createMemoryVaultStore();
  await assert.rejects(restoreGreenfieldBackup({ store:target1, backup, passphrase:'wrong password here' }), /GREENFIELD_VAULT_DECRYPT_FAILED/);
  assert.equal(await readEncryptedState({ store:target1, passphrase:'correct horse battery staple' }), null);
  const corrupt = structuredClone(backup);
  corrupt.vault.ciphertext = corrupt.vault.ciphertext.slice(0, -4) + 'AAAA';
  const target2 = createMemoryVaultStore();
  await assert.rejects(restoreGreenfieldBackup({ store:target2, backup:corrupt, passphrase:'correct horse battery staple' }), /GREENFIELD_VAULT_DECRYPT_FAILED/);
  assert.equal(await readEncryptedState({ store:target2, passphrase:'correct horse battery staple' }), null);
});

test('restore refuses to overwrite an initialized Greenfield store', async () => {
  const { exportGreenfieldBackup, restoreGreenfieldBackup } = await import('../greenfield/backup.mjs');
  const source = await seededStore();
  const target = await seededStore();
  const backup = await exportGreenfieldBackup({ store:source.store });
  await assert.rejects(restoreGreenfieldBackup({ store:target.store, backup, passphrase:'correct horse battery staple' }), /GREENFIELD_STORE_NOT_EMPTY/);
});
