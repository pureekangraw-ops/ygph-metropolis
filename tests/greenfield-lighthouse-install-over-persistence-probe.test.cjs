const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function loadModule() {
  return import(pathToFileURL(path.resolve(__dirname, '../android-shell/tools/create-install-over-persistence-probe.mjs')).href);
}

function backup(exportedAt, vaultOverrides = {}) {
  return {
    backupFormat: 'ygph-metropolis-greenfield-backup',
    backupVersion: 1,
    exportedAt,
    database: { name: 'ygph-metropolis-greenfield', version: 1, store: 'vault', key: 'greenfield-state' },
    vault: {
      format: 'ygph-metropolis-vault',
      version: 1,
      iv: 'same-iv',
      ciphertext: 'same-ciphertext',
      ...vaultOverrides,
    },
    recoveryKey: 'do-not-hash-export-only-metadata',
  };
}

test('persistence probe ignores export timestamp and recoveryKey while hashing durable vault truth', async () => {
  const { createPersistenceProbe } = await loadModule();
  const before = backup('2026-09-18T00:00:00.000Z');
  const after = { ...backup('2026-09-18T00:10:00.000Z'), recoveryKey: 'different-export-metadata' };
  const probe = createPersistenceProbe({ beforeBackup: before, afterBackup: after });

  assert.equal(probe.key, 'GREENFIELD_DATABASE_VAULT_SHA256');
  assert.equal(probe.before, probe.after);
  assert.match(probe.before, /^sha256:[0-9a-f]{64}$/);
});

test('persistence probe changes when durable vault bytes change', async () => {
  const { createPersistenceProbe } = await loadModule();
  const probe = createPersistenceProbe({
    beforeBackup: backup('2026-09-18T00:00:00.000Z'),
    afterBackup: backup('2026-09-18T00:10:00.000Z', { ciphertext: 'changed' }),
  });
  assert.notEqual(probe.before, probe.after);
});

test('invalid backup envelopes are rejected instead of producing evidence', async () => {
  const { createPersistenceProbe } = await loadModule();
  assert.throws(() => createPersistenceProbe({
    beforeBackup: { backupFormat: 'wrong' },
    afterBackup: backup('2026-09-18T00:10:00.000Z'),
  }), /INSTALL_OVER_BACKUP_INVALID/);
});
