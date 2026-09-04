import { createAppServices } from './app-services.mjs';
import { createManualFourHouses } from '../logic/manual/manual-four-houses.mjs';
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
  const manual = createManualFourHouses(runtime);
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

  async function multiGroup(payload) {
    const commands = Array.isArray(payload) ? payload : payload?.commands;
    if (!Array.isArray(commands) || commands.length === 0) throw new Error('CHAT_MULTI_GROUP_COMMANDS_REQUIRED');
    const result = await runtime.executeMultiGroupCommands(commands);
    const readback = result?.state ?? await runtime.readState();
    return { ...result, readback:structuredClone(readback) };
  }

  const chat = createChatService({
    store,
    modules,
    query,
    multiGroup,
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
