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

test('current backup uses separate recovery material without becoming a legacy backup', async () => {
  const { createMemoryVaultStore, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { exportGreenfieldBackup, restorePortableGreenfieldBackup } = await import('../greenfield/backup.mjs');
  const { prepareBackupForRestore } = await import('../greenfield/restore-compat.mjs');

  const source = await seededStore();
  const backup = await exportGreenfieldBackup({ store:source.store, exportedAt:'2026-08-21T00:01:00.000Z' });
  assert.equal(backup.recoveryKey, undefined);

  const prepared = prepareBackupForRestore(backup, RECOVERY_CODE);
  assert.equal(prepared.backup, backup, 'current backup object stays unchanged');
  assert.equal(prepared.recoveryKey, RECOVERY_CODE);
  assert.equal(prepared.usedLegacyRecoveryCode, false);
  assert.equal(prepared.recoverySource, 'SEPARATE_RECOVERY_MATERIAL');
  assert.equal(prepared.backup.recoveryKey, undefined);

  const target = createMemoryVaultStore();
  const result = await restorePortableGreenfieldBackup({ store:target, backup:prepared.backup, recoveryKey:prepared.recoveryKey });
  assert.equal(result.status, 'VERIFIED');
  assert.deepEqual(await readEncryptedState({ store:target, passphrase:RECOVERY_CODE }), source.state);
});

test('historical portable backup with embedded recoveryKey is explicitly legacy and remains restorable', async () => {
  const { createMemoryVaultStore, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const { exportGreenfieldBackup, restorePortableGreenfieldBackup } = await import('../greenfield/backup.mjs');
  const { prepareBackupForRestore } = await import('../greenfield/restore-compat.mjs');
  const source = await seededStore('historical-portable-sale');
  const current = await exportGreenfieldBackup({ store:source.store });
  const historical = { ...structuredClone(current), recoveryKey:RECOVERY_CODE };

  const prepared = prepareBackupForRestore(historical, '');
  assert.equal(prepared.backup, historical);
  assert.equal(prepared.recoveryKey, RECOVERY_CODE);
  assert.equal(prepared.usedLegacyRecoveryCode, true);
  assert.equal(prepared.recoverySource, 'LEGACY_EMBEDDED_KEY');

  const target = createMemoryVaultStore();
  const result = await restorePortableGreenfieldBackup({ store:target, backup:prepared.backup });
  assert.equal(result.status, 'VERIFIED');
  assert.deepEqual(await readEncryptedState({ store:target, passphrase:RECOVERY_CODE }), source.state);
});

test('current backup without valid separately supplied recovery material fails before restore', async () => {
  const { exportGreenfieldBackup } = await import('../greenfield/backup.mjs');
  const { prepareBackupForRestore } = await import('../greenfield/restore-compat.mjs');
  const source = await seededStore();
  const backup = await exportGreenfieldBackup({ store:source.store });

  assert.throws(() => prepareBackupForRestore(backup, ''), /GREENFIELD_BACKUP_RECOVERY_KEY_MISSING/);
  assert.throws(() => prepareBackupForRestore(backup, 'short'), /GREENFIELD_BACKUP_RECOVERY_KEY_MISSING/);
});
