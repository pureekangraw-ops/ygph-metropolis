function requireVersion(value) {
  const version = String(value || '').trim();
  if (!version) throw new Error('SETTINGS_VERSION_REQUIRED');
  return version;
}

export function createSettingsControl({ version, runtime, updater = null, rollback = null, reset = null } = {}) {
  const productVersion = requireVersion(version);
  if (!runtime || typeof runtime.readState !== 'function') {
    throw new Error('SETTINGS_RUNTIME_REQUIRED');
  }

  return Object.freeze({
    status() {
      return Object.freeze({
        version: productVersion,
        updateCheckSupported: typeof updater?.check === 'function',
        rollbackSupported: typeof rollback?.execute === 'function',
        backupSupported: typeof runtime.exportBackup === 'function',
        restoreSupported: typeof runtime.restoreBackup === 'function',
        resetSupported: typeof reset?.execute === 'function',
      });
    },

    async checkUpdate() {
      if (typeof updater?.check !== 'function') throw new Error('SETTINGS_UPDATE_CHECK_UNSUPPORTED');
      return updater.check({ currentVersion:productVersion });
    },

    async rollback() {
      if (typeof rollback?.execute !== 'function') throw new Error('SETTINGS_ROLLBACK_UNSUPPORTED');
      const operation = await rollback.execute({ currentVersion:productVersion });
      const readback = await runtime.readState();
      return Object.freeze({ operation, readback });
    },

    async backup(options = {}) {
      if (typeof runtime.exportBackup !== 'function') throw new Error('SETTINGS_BACKUP_UNSUPPORTED');
      return runtime.exportBackup(options);
    },

    async restore(backupFile, options = {}) {
      if (typeof runtime.restoreBackup !== 'function') throw new Error('SETTINGS_RESTORE_UNSUPPORTED');
      const operation = await runtime.restoreBackup(backupFile, options);
      const readback = await runtime.readState();
      return Object.freeze({ operation, readback });
    },

    async reset() {
      if (typeof reset?.execute !== 'function') throw new Error('SETTINGS_RESET_UNSUPPORTED');
      const operation = await reset.execute();
      const readback = await runtime.readState();
      return Object.freeze({ operation, readback });
    },
  });
}
