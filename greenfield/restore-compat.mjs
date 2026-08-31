export function prepareBackupForRestore(backup, recoveryCode = '') {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('INVALID_GREENFIELD_BACKUP');

  // Compatibility only: historical portable backups embedded their usable
  // recovery secret in the envelope. Preserve those files as-is and mark the
  // compatibility path explicitly.
  const embeddedRecoveryKey = String(backup.recoveryKey || '');
  if (embeddedRecoveryKey.length >= 12) {
    return {
      backup,
      recoveryKey:embeddedRecoveryKey,
      usedLegacyRecoveryCode:true,
      recoverySource:'LEGACY_EMBEDDED_KEY',
    };
  }

  // Current backups intentionally carry no usable recovery secret. Recovery
  // material is supplied out-of-band and must never be injected into the
  // backup object merely to reuse the historical portable shape.
  const recoveryKey = String(recoveryCode || '');
  if (recoveryKey.length < 12) throw new Error('GREENFIELD_BACKUP_RECOVERY_KEY_MISSING');

  return {
    backup,
    recoveryKey,
    usedLegacyRecoveryCode:false,
    recoverySource:'SEPARATE_RECOVERY_MATERIAL',
  };
}
