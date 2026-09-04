import test from 'node:test';
import assert from 'node:assert/strict';
import { createGreenfieldState } from '../app/public/logic/runtime/core.mjs';
import { createMemoryVaultStore, commitEncryptedState } from '../app/public/logic/storage/persistence.mjs';
import { createUpdaterBackupOwner } from '../app/public/logic/updates/updater-backup-owner.mjs';

const RECOVERY_CODE = 'owner-recovery-code-123456';
const EXPORTED_AT = '2026-09-04T12:30:00.000Z';

async function seededStore(revision = 9) {
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-09-04T12:00:00.000Z' });
  state.revision = revision;
  await commitEncryptedState({
    store,
    passphrase:RECOVERY_CODE,
    state,
    expectedDurableRevision:null,
  });
  return store;
}

test('updater backup owner exports canonical v2 encrypted backup without exposing recovery credential', async () => {
  const store = await seededStore(9);
  const owner = createUpdaterBackupOwner({
    store,
    recoveryCode:RECOVERY_CODE,
    now:() => EXPORTED_AT,
  });

  const artifact = await owner.exportBackup();

  assert.equal(artifact.backupFormat, 'lighthouse-vault-backup');
  assert.equal(artifact.backupVersion, 2);
  assert.equal(artifact.revision, 9);
  assert.equal(artifact.exportedAt, EXPORTED_AT);
  assert.match(artifact.artifactHash, /^[a-f0-9]{64}$/);
  assert.equal('recoveryCode' in artifact, false);
  assert.equal('recoveryKey' in artifact, false);
  assert.equal('recoveryCode' in owner, false);
  assert.equal('recoveryKey' in owner, false);
});

test('updater backup readback cryptographically verifies artifact and returns installer metadata only', async () => {
  const store = await seededStore(12);
  const owner = createUpdaterBackupOwner({
    store,
    recoveryCode:RECOVERY_CODE,
    now:() => EXPORTED_AT,
  });
  const artifact = await owner.exportBackup();

  const readback = await owner.readback(artifact);

  assert.deepEqual(readback, {
    status:'VERIFIED',
    revision:12,
    exportedAt:EXPORTED_AT,
    artifactHash:artifact.artifactHash,
  });
});

test('updater backup owner rejects a tampered backup instead of producing trusted readback metadata', async () => {
  const store = await seededStore(15);
  const owner = createUpdaterBackupOwner({
    store,
    recoveryCode:RECOVERY_CODE,
    now:() => EXPORTED_AT,
  });
  const artifact = await owner.exportBackup();
  const tampered = structuredClone(artifact);
  tampered.revision = 16;

  await assert.rejects(
    () => owner.readback(tampered),
    /GREENFIELD_BACKUP_HASH_MISMATCH|GREENFIELD_BACKUP_REVISION_MISMATCH/,
  );
});
