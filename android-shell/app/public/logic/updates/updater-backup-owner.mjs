import { exportVaultBackup, verifyVaultBackup } from '../storage/backup.mjs';

export function createUpdaterBackupOwner({
  store,
  recoveryCode,
  now = () => new Date().toISOString(),
} = {}) {
  if (!store || typeof store.get !== 'function') {
    throw new TypeError('UPDATER_BACKUP_STORE_REQUIRED');
  }
  const credential = String(recoveryCode ?? '');

  return Object.freeze({
    async exportBackup() {
      return exportVaultBackup({
        store,
        recoveryCode:credential,
        exportedAt:now(),
      });
    },

    async readback(artifact) {
      const verified = await verifyVaultBackup({
        backup:artifact,
        recoveryCode:credential,
      });
      return {
        status:verified.status,
        revision:verified.revision,
        exportedAt:artifact.exportedAt,
        artifactHash:artifact.artifactHash,
      };
    },
  });
}
