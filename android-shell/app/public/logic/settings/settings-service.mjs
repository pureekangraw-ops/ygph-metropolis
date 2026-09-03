function owner(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`SETTINGS_${name}_OWNER_REQUIRED`);
  return value;
}

function call(target, method, ...args) {
  if (typeof target[method] !== 'function') throw new Error(`SETTINGS_HANDLER_MISSING:${method}`);
  return target[method](...args);
}

export function createSettingsService({ session, backup, modules, identity } = {}) {
  session = owner(session, 'SESSION');
  backup = owner(backup, 'BACKUP');
  modules = owner(modules, 'MODULES');
  identity = owner(identity, 'IDENTITY');

  return Object.freeze({
    setup: input => call(session, 'setup', input),
    unlock: input => call(session, 'unlock', input),
    lock: () => call(session, 'lock'),
    exportBackup: input => call(backup, 'export', input),
    restoreBackup: input => call(backup, 'restore', input),
    modules: () => call(modules, 'list'),
    identity: () => call(identity, 'installed'),
  });
}
