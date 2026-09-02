const ACTIONS = Object.freeze([
  ['checkUpdate', 'check-update'],
  ['backup', 'backup'],
  ['restore', 'restore'],
  ['reset', 'reset'],
  ['rollback', 'rollback'],
]);

export function projectSettingsSurface({ version = null, capabilities = {} } = {}) {
  const actions = ACTIONS
    .filter(([capability]) => capabilities?.[capability] === true)
    .map(([, action]) => action);

  return Object.freeze({
    version,
    actions: Object.freeze(actions),
  });
}

export function createSettingsControl({ operations = {} } = {}) {
  return Object.freeze({
    async execute(action) {
      const methodName = action === 'check-update'
        ? 'checkUpdate'
        : action;
      const operation = operations?.[methodName];
      if (typeof operation !== 'function') {
        throw new Error('SETTINGS_ACTION_UNAVAILABLE');
      }

      const operationResult = await operation.call(operations);
      const readback = typeof operations.readStatus === 'function'
        ? await operations.readStatus()
        : null;

      return Object.freeze({ operationResult, readback });
    },
  });
}
