import { DB_NAME, DB_VERSION, DB_STORE, VAULT_KEY, VAULT_FORMAT, VAULT_VERSION, createMemoryVaultStore, readEncryptedState } from './persistence.mjs';
import { canonicalStringify } from './core.mjs';

export const BACKUP_FORMAT = 'ygph-metropolis-greenfield-backup';
export const BACKUP_VERSION = 1;

function validateBackupEnvelope(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('INVALID_GREENFIELD_BACKUP');
  if (backup.backupFormat !== BACKUP_FORMAT || Number(backup.backupVersion) !== BACKUP_VERSION) throw new Error('INVALID_GREENFIELD_BACKUP_FORMAT');
  if (backup.database?.name !== DB_NAME || Number(backup.database?.version) !== DB_VERSION || backup.database?.store !== DB_STORE || backup.database?.key !== VAULT_KEY) throw new Error('GREENFIELD_BACKUP_DATABASE_IDENTITY_MISMATCH');
  if (!backup.vault || backup.vault.format !== VAULT_FORMAT || Number(backup.vault.version) !== VAULT_VERSION) throw new Error('INVALID_GREENFIELD_BACKUP_VAULT');
  return backup;
}

export async function exportGreenfieldBackup({ store, exportedAt = new Date().toISOString() }) {
  const vault = await store.get(VAULT_KEY);
  if (!vault) throw new Error('GREENFIELD_NOT_INITIALIZED');
  if (vault.format !== VAULT_FORMAT || Number(vault.version) !== VAULT_VERSION) throw new Error('INVALID_GREENFIELD_VAULT');
  return {
    backupFormat: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    exportedAt,
    database: { name: DB_NAME, version: DB_VERSION, store: DB_STORE, key: VAULT_KEY },
    vault: structuredClone(vault),
  };
}

export async function verifyGreenfieldBackup({ backup, passphrase }) {
  validateBackupEnvelope(backup);
  const scratch = createMemoryVaultStore();
  await scratch.put(VAULT_KEY, structuredClone(backup.vault));
  const state = await readEncryptedState({ store: scratch, passphrase });
  if (!state) throw new Error('GREENFIELD_BACKUP_EMPTY');
  return { status: 'VERIFIED', revision: state.revision, state };
}

export async function restoreGreenfieldBackup({ store, backup, passphrase }) {
  if (await store.get(VAULT_KEY)) throw new Error('GREENFIELD_STORE_NOT_EMPTY');
  const verified = await verifyGreenfieldBackup({ backup, passphrase });
  await store.put(VAULT_KEY, structuredClone(backup.vault));
  const durable = await readEncryptedState({ store, passphrase });
  if (!durable || canonicalStringify(durable) !== canonicalStringify(verified.state)) throw new Error('GREENFIELD_BACKUP_READBACK_MISMATCH');
  return { status: 'VERIFIED', revision: durable.revision, state: durable };
}
