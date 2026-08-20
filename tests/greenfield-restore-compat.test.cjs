"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

const RECOVERY_CODE = 'correct horse battery staple';

async function seededStore(title = 'legacy-backup-sale') {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-21T00:00:00.000Z' });
  state.domains.STORE.records.S1 = {
    record:{ recordId:'S1', source:'STORE', type:'SALE', title, amountSatang:12345, quantity:1, status:'COMPLETED' },
    provenance:{ origin:'LIVE_COMMAND' },
    history:[],
  };
  await commitEncryptedState({ store, passphrase:RECOVERY_CODE, state, expectedDurableRevision:null });
  return { store, state };
}

test('legacy backup without embedded recoveryKey can be prepared using the user-supplied recovery code', async () => {
  const { createMemoryVaultStore, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { exportGreenfieldBackup, restorePortableGreenfieldBackup } = await import('../greenfield/backup.mjs');
  const { prepareBackupForRestore } = await import('../greenfield/restore-compat.mjs');

  const source = await seededStore();
  const legacyBackup = await exportGreenfieldBackup({ store:source.store, exportedAt:'2026-08-21T00:01:00.000Z' });
  assert.equal(legacyBackup.recoveryKey, undefined);

  const prepared = prepareBackupForRestore(legacyBackup, RECOVERY_CODE);
  assert.equal(prepared.recoveryKey, RECOVERY_CODE);
  assert.equal(prepared.usedLegacyRecoveryCode, true);
  assert.equal(legacyBackup.recoveryKey, undefined, 'source file object must not be mutated');
  assert.equal(prepared.backup.recoveryKey, RECOVERY_CODE);

  const target = createMemoryVaultStore();
  const result = await restorePortableGreenfieldBackup({ store:target, backup:prepared.backup });
  assert.equal(result.status, 'VERIFIED');
  assert.deepEqual(await readEncryptedState({ store:target, passphrase:RECOVERY_CODE }), source.state);
});

test('current portable backup keeps its embedded recoveryKey and ignores an empty legacy field', async () => {
  const { exportGreenfieldBackup } = await import('../greenfield/backup.mjs');
  const { prepareBackupForRestore } = await import('../greenfield/restore-compat.mjs');
  const source = await seededStore('current-backup-sale');
  const backup = await exportGreenfieldBackup({ store:source.store, recoveryKey:RECOVERY_CODE });

  const prepared = prepareBackupForRestore(backup, '');
  assert.equal(prepared.backup, backup);
  assert.equal(prepared.recoveryKey, RECOVERY_CODE);
  assert.equal(prepared.usedLegacyRecoveryCode, false);
});

test('legacy backup without a valid user-supplied recovery code fails before restore', async () => {
  const { exportGreenfieldBackup } = await import('../greenfield/backup.mjs');
  const { prepareBackupForRestore } = await import('../greenfield/restore-compat.mjs');
  const source = await seededStore();
  const legacyBackup = await exportGreenfieldBackup({ store:source.store });

  assert.throws(() => prepareBackupForRestore(legacyBackup, ''), /GREENFIELD_BACKUP_RECOVERY_KEY_MISSING/);
  assert.throws(() => prepareBackupForRestore(legacyBackup, 'short'), /GREENFIELD_BACKUP_RECOVERY_KEY_MISSING/);
});
