import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify } from '../../greenfield/core.mjs';

function assertBackupEnvelope(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('INSTALL_OVER_BACKUP_INVALID');
  if (backup.backupFormat !== 'ygph-metropolis-greenfield-backup' || Number(backup.backupVersion) !== 1) {
    throw new Error('INSTALL_OVER_BACKUP_INVALID');
  }
  if (!backup.database || typeof backup.database !== 'object' || !backup.vault || typeof backup.vault !== 'object') {
    throw new Error('INSTALL_OVER_BACKUP_INVALID');
  }
  return backup;
}

function durableSnapshot(backup) {
  const value = assertBackupEnvelope(backup);
  return {
    database: value.database,
    vault: value.vault,
  };
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalStringify(value)).digest('hex')}`;
}

export function createPersistenceProbe({ beforeBackup, afterBackup } = {}) {
  return Object.freeze({
    key: 'GREENFIELD_DATABASE_VAULT_SHA256',
    before: digest(durableSnapshot(beforeBackup)),
    after: digest(durableSnapshot(afterBackup)),
  });
}

export async function createPersistenceProbeFromFiles(beforePath, afterPath) {
  if (!beforePath || !afterPath) throw new Error('INSTALL_OVER_BACKUP_PATHS_REQUIRED');
  const [beforeBackup, afterBackup] = await Promise.all([
    readFile(resolve(beforePath), 'utf8').then(JSON.parse),
    readFile(resolve(afterPath), 'utf8').then(JSON.parse),
  ]);
  return createPersistenceProbe({ beforeBackup, afterBackup });
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const result = await createPersistenceProbeFromFiles(process.argv[2], process.argv[3]);
  console.log(JSON.stringify(result, null, 2));
  if (result.before !== result.after) process.exitCode = 1;
}
