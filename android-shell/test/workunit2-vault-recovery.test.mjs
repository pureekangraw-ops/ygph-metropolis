import test from 'node:test';
import assert from 'node:assert/strict';
import { createGreenfieldState } from '../app/public/logic/runtime/core.mjs';
import { createMemoryVaultStore, commitEncryptedState, readEncryptedState, VAULT_KEY } from '../app/public/logic/storage/persistence.mjs';
import { exportVaultBackup, restoreVaultBackup, BACKUP_STAGE_KEY } from '../app/public/logic/storage/backup.mjs';

const RECOVERY_CODE = 'recovery-code-123456';

async function seededStore(revision = 1) {
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-09-03T00:00:00.000Z' });
  state.revision = revision;
  await commitEncryptedState({ store, passphrase:RECOVERY_CODE, state, expectedDurableRevision:null });
  return { store, state };
}

test('expected durable revision rejects stale writes', async () => {
  const { store, state } = await seededStore(2);
  const next = structuredClone(state);
  next.revision = 3;
  await assert.rejects(
    commitEncryptedState({ store, passphrase:RECOVERY_CODE, state:next, expectedDurableRevision:1 }),
    /STALE_DURABLE_STATE/,
  );
  assert.equal((await readEncryptedState({ store, passphrase:RECOVERY_CODE })).revision, 2);
});

test('backup carries revision exportedAt and artifactHash', async () => {
  const { store } = await seededStore(4);
  const backup = await exportVaultBackup({ store, recoveryCode:RECOVERY_CODE, exportedAt:'2026-09-03T12:00:00.000Z' });
  assert.equal(backup.revision, 4);
  assert.equal(backup.exportedAt, '2026-09-03T12:00:00.000Z');
  assert.match(backup.artifactHash, /^[a-f0-9]{64}$/);
});

test('wrong recovery code is rejected before durable replacement', async () => {
  const source = await seededStore(5);
  const backup = await exportVaultBackup({ store:source.store, recoveryCode:RECOVERY_CODE });
  const target = await seededStore(7);
  await assert.rejects(
    restoreVaultBackup({ store:target.store, backup, recoveryCode:'wrong-recovery-code', allowOverwrite:true }),
    /GREENFIELD_VAULT_DECRYPT_FAILED/,
  );
  assert.equal((await readEncryptedState({ store:target.store, passphrase:RECOVERY_CODE })).revision, 7);
});

test('failed empty-store restore cleans candidate and stage', async () => {
  const source = await seededStore(8);
  const backup = await exportVaultBackup({ store:source.store, recoveryCode:RECOVERY_CODE });
  const base = createMemoryVaultStore();
  let currentWrites = 0;
  const failingStore = {
    get:key => base.get(key),
    delete:key => base.delete(key),
    putMany:entries => base.putMany(entries),
    async put(key, value) {
      await base.put(key, value);
      if (key === VAULT_KEY && ++currentWrites === 1) throw new Error('SIMULATED_WRITE_FAILURE');
    },
  };
  await assert.rejects(
    restoreVaultBackup({ store:failingStore, backup, recoveryCode:RECOVERY_CODE, allowOverwrite:true }),
    /SIMULATED_WRITE_FAILURE/,
  );
  assert.equal(await base.get(VAULT_KEY), null);
  assert.equal(await base.get(BACKUP_STAGE_KEY), null);
});
