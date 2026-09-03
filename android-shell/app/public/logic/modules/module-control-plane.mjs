import { createModuleControlPlane as createCoreControlPlane, BUNDLED_MODULES } from './module-control-plane-core.mjs';

export { BUNDLED_MODULES };

export function createModuleControlPlane(options = {}) {
  const core = createCoreControlPlane(options);
  const store = options.store;

  async function execute(command) {
    if (command?.capability === 'PURGE' && command?.confirmationToken && store?.get) {
      const confirmations = await store.get('module-confirmations');
      const confirmation = confirmations?.[String(command.confirmationToken)];
      if (confirmation?.used) throw new Error('CONFIRMATION_USED');
    }
    return core.execute(command);
  }

  return Object.freeze({
    initialize:core.initialize,
    snapshot:core.snapshot,
    requestConfirmation:core.requestConfirmation,
    execute,
  });
}
