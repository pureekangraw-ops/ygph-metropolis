import {
  DB_NAME, DB_VERSION, DB_STORE,
  VAULT_KEY, VAULT_FORMAT, VAULT_VERSION,
  createMemoryVaultStore, readEncryptedState,
} from './persistence.mjs';
import { canonicalStringify } from '../runtime/core.mjs';

export const BACKUP_FORMAT = 'lighthouse-vault-backup';
export const BACKUP_VERSION = 2;
export const BACKUP_STAGE_KEY = 'stage';
export const BACKUP_PREVIOUS_KEY = 'previous';

const encoder = new TextEncoder();

function recoveryCode(value) {
  const code = String(value || '');
  if (code.length < 12) throw new Error('GREENFIELD_BACKUP_RECOVERY_CODE_MISSING');
  return code;
}

function validateEnvelope(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('INVALID_GREENFIELD_BACKUP');
  if (backup.backupFormat !== BACKUP_FORMAT || Number(backup.backupVersion) !== BACKUP_VERSION) throw new Error('INVALID_GREENFIELD_BACKUP_FORMAT');
  if (backup.database?.name !== DB_NAME || Number(backup.database?.version) !== DB_VERSION || backup.database?.store !== DB_STORE || backup.database?.key !== VAULT_KEY) throw new Error('GREENFIELD_BACKUP_DATABASE_IDENTITY_MISMATCH');
  if (!backup.vault || backup.vault.format !== VAULT_FORMAT || Number(backup.vault.version) !== VAULT_VERSION) throw new Error('INVALID_GREENFIELD_BACKUP_VAULT');
  if (!Number.isSafeInteger(Number(backup.revision)) || Number(backup.revision) < 1) throw new Error('INVALID_GREENFIELD_BACKUP_REVISION');
  if (!String(backup.exportedAt || '').trim()) throw new Error('INVALID_GREENFIELD_BACKUP_EXPORTED_AT');
  if (!/^[a-f0-9]{64}$/.test(String(backup.artifactHash || ''))) throw new Error('INVALID_GREENFIELD_BACKUP_HASH');
  return backup;
}

function hashPayload(backup) {
  const { artifactHash, ...payload } = backup;
  return payload;
}

async function sha256Hex(value) {
  const bytes = encoder.encode(canonicalStringify(value));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyArtifactHash(backup) {
  const actual = await sha256Hex(hashPayload(backup));
  if (actual !== backup.artifactHash) throw new Error('GREENFIELD_BACKUP_HASH_MISMATCH');
}

async function verifyVaultInMemory(vault, code) {
  const scratch = createMemoryVaultStore();
  await scratch.put(VAULT_KEY, structuredClone(vault));
  const state = await readEncryptedState({ store:scratch, passphrase:code });
  if (!state) throw new Error('GREENFIELD_BACKUP_EMPTY');
  return state;
}

async function safeDelete(store, key) {
  if (typeof store.delete !== 'function') throw new Error('GREENFIELD_STORE_DELETE_REQUIRED');
  await store.delete(key);
}

export async function exportVaultBackup({ store, recoveryCode: suppliedCode, exportedAt = new Date().toISOString() } = {}) {
  const code = recoveryCode(suppliedCode);
  const vault = await store.get(VAULT_KEY);
  if (!vault) throw new Error('GREENFIELD_NOT_INITIALIZED');
  const state = await readEncryptedState({ store, passphrase:code });
  if (!state) throw new Error('GREENFIELD_NOT_INITIALIZED');
  const envelope = {
    backupFormat:BACKUP_FORMAT,
    backupVersion:BACKUP_VERSION,
    revision:state.revision,
    exportedAt,
    database:{ name:DB_NAME, version:DB_VERSION, store:DB_STORE, key:VAULT_KEY },
    vault:structuredClone(vault),
  };
  return { ...envelope, artifactHash:await sha256Hex(envelope) };
}

export async function verifyVaultBackup({ backup, recoveryCode: suppliedCode } = {}) {
  const code = recoveryCode(suppliedCode);
  validateEnvelope(backup);
  await verifyArtifactHash(backup);
  const state = await verifyVaultInMemory(backup.vault, code);
  if (state.revision !== Number(backup.revision)) throw new Error('GREENFIELD_BACKUP_REVISION_MISMATCH');
  return { status:'VERIFIED', revision:state.revision, state };
}

export async function restoreVaultBackup({ store, backup, recoveryCode: suppliedCode, allowOverwrite = false } = {}) {
  const code = recoveryCode(suppliedCode);
  const verified = await verifyVaultBackup({ backup, recoveryCode:code });
  const previousVault = await store.get(VAULT_KEY);
  if (previousVault && !allowOverwrite) throw new Error('GREENFIELD_RESTORE_CONFIRM_REQUIRED');

  try {
    await store.put(BACKUP_STAGE_KEY, structuredClone(backup.vault));
    const stagedVault = await store.get(BACKUP_STAGE_KEY);
    const stagedState = await verifyVaultInMemory(stagedVault, code);
    if (canonicalStringify(stagedState) !== canonicalStringify(verified.state)) throw new Error('GREENFIELD_BACKUP_STAGE_READBACK_MISMATCH');

    if (previousVault) await store.put(BACKUP_PREVIOUS_KEY, structuredClone(previousVault));
    else if (typeof store.delete === 'function') await store.delete(BACKUP_PREVIOUS_KEY);

    await store.put(VAULT_KEY, structuredClone(stagedVault));
    const durable = await readEncryptedState({ store, passphrase:code });
    if (!durable || canonicalStringify(durable) !== canonicalStringify(verified.state)) throw new Error('GREENFIELD_BACKUP_READBACK_MISMATCH');

    await safeDelete(store, BACKUP_STAGE_KEY);
    return {
      status:'VERIFIED',
      revision:durable.revision,
      state:durable,
      replacedExisting:Boolean(previousVault),
      artifactHash:backup.artifactHash,
      exportedAt:backup.exportedAt,
    };
  } catch (error) {
    try {
      if (previousVault) await store.put(VAULT_KEY, structuredClone(previousVault));
      else await safeDelete(store, VAULT_KEY);
      if (typeof store.delete === 'function') await store.delete(BACKUP_STAGE_KEY);

      const rollback = previousVault
        ? await store.get(VAULT_KEY)
        : await store.get(VAULT_KEY);
      if (previousVault && canonicalStringify(rollback) !== canonicalStringify(previousVault)) throw new Error('GREENFIELD_BACKUP_ROLLBACK_FAILED');
      if (!previousVault && rollback != null) throw new Error('GREENFIELD_BACKUP_EMPTY_CLEANUP_FAILED');
    } catch (rollbackError) {
      if (String(rollbackError?.message || '').startsWith('GREENFIELD_BACKUP_')) throw rollbackError;
      throw new Error('GREENFIELD_BACKUP_ROLLBACK_FAILED');
    }
    throw error;
  }
}
