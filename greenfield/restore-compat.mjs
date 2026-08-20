export function prepareBackupForRestore(backup, legacyRecoveryCode = '') {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('INVALID_GREENFIELD_BACKUP');

  const embeddedRecoveryKey = String(backup.recoveryKey || '');
  if (embeddedRecoveryKey.length >= 12) {
    return {
      backup,
      recoveryKey:embeddedRecoveryKey,
      usedLegacyRecoveryCode:false,
    };
  }

  const recoveryKey = String(legacyRecoveryCode || '');
  if (recoveryKey.length < 12) throw new Error('GREENFIELD_BACKUP_RECOVERY_KEY_MISSING');

  return {
    backup:{ ...structuredClone(backup), recoveryKey },
    recoveryKey,
    usedLegacyRecoveryCode:true,
  };
}
