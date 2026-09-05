import { createAppServices } from './app-services.mjs';
import { createManualFourHouses } from '../logic/manual/manual-four-houses.mjs';
import { createManualLedgerFacade } from '../logic/manual/manual-ledger-facade.mjs';
import { createLedgerGateway } from '../logic/ledger/ledger-gateway.mjs';
import { createModuleControlPlane } from '../logic/modules/module-control-plane.mjs';
import { createBundledModuleServices } from '../logic/modules/bundled-module-services.mjs';
import { createChatService } from '../logic/chat/chat-service.mjs';

function owner(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`STABLE_${name}_OWNER_REQUIRED`);
  return value;
}

function requireRuntime(runtime) {
  runtime = owner(runtime, 'RUNTIME');
  for (const method of ['readState', 'executeMultiGroupCommands', 'metadataStore']) {
    if (typeof runtime[method] !== 'function') throw new TypeError(`STABLE_RUNTIME_METHOD_REQUIRED:${method}`);
  }
  return runtime;
}

export async function createStableAppServices({
  runtime,
  session,
  recovery,
  backup,
  updates,
  events,
  query = null,
  provider = null,
  now = () => new Date().toISOString(),
} = {}) {
  runtime = requireRuntime(runtime);
  session = owner(session, 'SESSION');
  recovery = owner(recovery, 'RECOVERY');
  backup = owner(backup, 'BACKUP');
  updates = owner(updates, 'UPDATES');
  events = owner(events, 'EVENTS');
  if (typeof now !== 'function') throw new TypeError('STABLE_NOW_PROVIDER_REQUIRED');

  const store = runtime.metadataStore();
  const manualOwner = createManualFourHouses(runtime);
  const ledgerGateway = createLedgerGateway({ manual:manualOwner, runtime });
  const manual = createManualLedgerFacade({ manual:manualOwner, gateway:ledgerGateway });
  const control = createModuleControlPlane({ store, now });
  await control.initialize();
  const apps = createBundledModuleServices({ manual });

  const modules = Object.freeze({
    initialize: control.initialize,
    snapshot: control.snapshot,
    requestConfirmation: control.requestConfirmation,
    execute: control.execute,
    list: control.list,
    open: control.open,
    apps,
  });

  const chat = createChatService({
    store,
    modules,
    ledger:ledgerGateway,
    query,
    multiGroup:ledgerGateway.executeWorkflow,
    recovery,
    provider,
    now,
  });

  return createAppServices({
    session,
    chat,
    manual,
    modules,
    recovery,
    backup,
    updates,
    events,
  });
}
