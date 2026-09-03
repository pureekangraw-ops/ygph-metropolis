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

  async function list() {
    const state = await core.snapshot();
    return Object.values(state.modules || {})
      .filter(descriptor => descriptor.state === 'ACTIVE')
      .map(descriptor => structuredClone(descriptor));
  }

  async function open({ moduleId, actor = 'USER', source = 'UI' } = {}) {
    const id = String(moduleId || '').trim();
    if (!id) throw new Error('MODULE_ID_REQUIRED');
    if (!['USER','GO'].includes(actor)) throw new Error('MODULE_ACTOR_NOT_ALLOWED');
    if (!['UI','CHAT'].includes(source)) throw new Error('MODULE_SOURCE_NOT_ALLOWED');
    const state = await core.snapshot();
    const descriptor = state.modules?.[id];
    if (!descriptor) throw new Error('MODULE_NOT_FOUND');
    if (descriptor.state !== 'ACTIVE') throw new Error(`MODULE_NOT_OPENABLE:${descriptor.state}`);
    return Object.freeze({ opened:true, moduleId:id, revision:state.revision, descriptor:structuredClone(descriptor) });
  }

  return Object.freeze({
    initialize:core.initialize,
    snapshot:core.snapshot,
    requestConfirmation:core.requestConfirmation,
    execute,
    list,
    open,
  });
}
