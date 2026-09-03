const REGISTRY_KEY = 'module-registry';
const CONFIRMATION_KEY = 'module-confirmations';
const ACTORS = new Set(['USER', 'GO']);
const SOURCES = new Set(['UI', 'CHAT']);
const MUTATIONS = new Set(['ACTIVATE', 'DISABLE', 'UNINSTALL', 'PURGE']);

export const BUNDLED_MODULES = Object.freeze([
  Object.freeze({ moduleId:'income', name:'Income', version:'1.0.0', state:'ACTIVE', capabilities:['RUN','ACTIVATE','DISABLE','UNINSTALL','PURGE'], dependencies:[], dataOwner:'income', dataSchemaVersion:1, packageHash:'BUNDLED', signerId:'LIGHTHOUSE_APK' }),
  Object.freeze({ moduleId:'outcome', name:'Outcome', version:'1.0.0', state:'ACTIVE', capabilities:['RUN','ACTIVATE','DISABLE','UNINSTALL','PURGE'], dependencies:[], dataOwner:'outcome', dataSchemaVersion:1, packageHash:'BUNDLED', signerId:'LIGHTHOUSE_APK' }),
  Object.freeze({ moduleId:'calendar', name:'Calendar', version:'1.0.0', state:'ACTIVE', capabilities:['RUN','ACTIVATE','DISABLE','UNINSTALL','PURGE'], dependencies:[], dataOwner:'calendar', dataSchemaVersion:1, packageHash:'BUNDLED', signerId:'LIGHTHOUSE_APK' }),
  Object.freeze({ moduleId:'ledger', name:'Ledger', version:'1.0.0', state:'ACTIVE', capabilities:['RUN','ACTIVATE','DISABLE','UNINSTALL','PURGE'], dependencies:[], dataOwner:'ledger', dataSchemaVersion:1, packageHash:'BUNDLED', signerId:'LIGHTHOUSE_APK' }),
]);

function clone(value) { return structuredClone(value); }
function required(value, code) { const out = String(value ?? '').trim(); if (!out) throw new Error(code); return out; }

function validateCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('INVALID_MODULE_COMMAND');
  const normalized = {
    commandId:required(command.commandId, 'MODULE_COMMAND_ID_REQUIRED'),
    actor:required(command.actor, 'MODULE_ACTOR_REQUIRED'),
    source:required(command.source, 'MODULE_SOURCE_REQUIRED'),
    moduleId:required(command.moduleId, 'MODULE_ID_REQUIRED'),
    capability:required(command.capability, 'MODULE_CAPABILITY_REQUIRED'),
    input:command.input && typeof command.input === 'object' ? clone(command.input) : {},
    expectedRevision:Number(command.expectedRevision),
    confirmationToken:command.confirmationToken == null ? null : String(command.confirmationToken),
  };
  if (!ACTORS.has(normalized.actor)) throw new Error('MODULE_ACTOR_NOT_ALLOWED');
  if (!SOURCES.has(normalized.source)) throw new Error('MODULE_SOURCE_NOT_ALLOWED');
  if (!Number.isSafeInteger(normalized.expectedRevision) || normalized.expectedRevision < 1) throw new Error('MODULE_EXPECTED_REVISION_REQUIRED');
  return normalized;
}

function initialRegistry(now) {
  return {
    revision:1,
    updatedAt:now,
    modules:Object.fromEntries(BUNDLED_MODULES.map(item => [item.moduleId, clone(item)])),
    events:[],
    commandLog:{},
  };
}

function transitionState(current, capability) {
  if (capability === 'DISABLE') {
    if (current === 'DISABLED') return 'DISABLED';
    if (current !== 'ACTIVE') throw new Error(`MODULE_TRANSITION_INVALID:${current}/DISABLE`);
    return 'DISABLED';
  }
  if (capability === 'ACTIVATE') {
    if (current === 'ACTIVE') return 'ACTIVE';
    if (current !== 'DISABLED') throw new Error(`MODULE_TRANSITION_INVALID:${current}/ACTIVATE`);
    return 'ACTIVE';
  }
  if (capability === 'UNINSTALL') {
    if (current === 'PURGED') throw new Error('MODULE_TRANSITION_INVALID:PURGED/UNINSTALL');
    return 'UNINSTALLED';
  }
  if (capability === 'PURGE') return 'PURGED';
  throw new Error(`MODULE_CAPABILITY_UNSUPPORTED:${capability}`);
}

export function createModuleControlPlane({ store, now = () => new Date().toISOString(), confirmationTtlMs = 5 * 60 * 1000 } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') throw new TypeError('MODULE_STORE_REQUIRED');
  if (!Number.isFinite(Number(confirmationTtlMs)) || Number(confirmationTtlMs) <= 0) throw new Error('INVALID_CONFIRMATION_TTL');

  async function initialize() {
    const existing = await store.get(REGISTRY_KEY);
    if (existing) return clone(existing);
    const state = initialRegistry(now());
    await store.put(REGISTRY_KEY, state);
    const readback = await store.get(REGISTRY_KEY);
    if (!readback || readback.revision !== 1) throw new Error('MODULE_REGISTRY_INIT_READBACK_FAILED');
    return clone(readback);
  }

  async function snapshot() {
    return clone((await store.get(REGISTRY_KEY)) || await initialize());
  }

  async function readConfirmations() {
    return clone((await store.get(CONFIRMATION_KEY)) || {});
  }

  async function writeConfirmations(value) {
    await store.put(CONFIRMATION_KEY, value);
    return readConfirmations();
  }

  async function requestConfirmation({ commandId, actor, source, moduleId, capability, input = {} } = {}) {
    commandId = required(commandId, 'MODULE_COMMAND_ID_REQUIRED');
    actor = required(actor, 'MODULE_ACTOR_REQUIRED');
    source = required(source, 'MODULE_SOURCE_REQUIRED');
    moduleId = required(moduleId, 'MODULE_ID_REQUIRED');
    capability = required(capability, 'MODULE_CAPABILITY_REQUIRED');
    if (capability !== 'PURGE') throw new Error('CONFIRMATION_NOT_REQUIRED');
    const state = await snapshot();
    if (!state.modules[moduleId]) throw new Error('MODULE_NOT_FOUND');
    const issuedAt = Date.parse(now());
    const token = `${commandId}:${moduleId}:${state.revision}:${issuedAt}`;
    const confirmations = await readConfirmations();
    confirmations[token] = {
      token, commandId, actor, source, moduleId, capability, input:clone(input),
      baseRevision:state.revision,
      issuedAt:new Date(issuedAt).toISOString(),
      expiresAt:new Date(issuedAt + Number(confirmationTtlMs)).toISOString(),
      used:false,
    };
    await writeConfirmations(confirmations);
    return { token, expiresAt:confirmations[token].expiresAt, revision:state.revision };
  }

  async function consumeConfirmation(command, state) {
    if (command.capability !== 'PURGE') return null;
    if (!command.confirmationToken) throw new Error('CONFIRMATION_REQUIRED');
    const confirmations = await readConfirmations();
    const record = confirmations[command.confirmationToken];
    if (!record) throw new Error('CONFIRMATION_INVALID');
    if (record.used) throw new Error('CONFIRMATION_USED');
    if (Date.parse(now()) > Date.parse(record.expiresAt)) throw new Error('CONFIRMATION_EXPIRED');
    if (record.baseRevision !== state.revision) throw new Error('CONFIRMATION_REVISION_CHANGED');
    if (record.commandId !== command.commandId || record.actor !== command.actor || record.source !== command.source || record.moduleId !== command.moduleId || record.capability !== command.capability) throw new Error('CONFIRMATION_COMMAND_MISMATCH');
    record.used = true;
    record.usedAt = now();
    confirmations[command.confirmationToken] = record;
    await writeConfirmations(confirmations);
    return record;
  }

  async function execute(rawCommand) {
    const command = validateCommand(rawCommand);
    const state = await snapshot();
    const descriptor = state.modules[command.moduleId];
    if (!descriptor) throw new Error('MODULE_NOT_FOUND');
    if (!descriptor.capabilities.includes(command.capability)) throw new Error('MODULE_CAPABILITY_NOT_ALLOWED');

    const recovered = state.commandLog[command.commandId];
    if (recovered) return clone(recovered);
    if (command.expectedRevision !== state.revision) throw new Error(`MODULE_STALE_REVISION:${command.expectedRevision}/${state.revision}`);
    if (!MUTATIONS.has(command.capability)) throw new Error(`MODULE_CAPABILITY_UNSUPPORTED:${command.capability}`);

    await consumeConfirmation(command, state);

    const next = clone(state);
    const nextDescriptor = clone(descriptor);
    nextDescriptor.state = transitionState(descriptor.state, command.capability);
    next.modules[command.moduleId] = nextDescriptor;
    next.revision += 1;
    next.updatedAt = now();
    const eventId = `module-event:${next.revision}:${command.commandId}`;
    const event = {
      eventId,
      commandId:command.commandId,
      moduleId:command.moduleId,
      capability:command.capability,
      actor:command.actor,
      source:command.source,
      fromState:descriptor.state,
      toState:nextDescriptor.state,
      at:next.updatedAt,
    };
    next.events.push(event);

    if (command.capability === 'PURGE') {
      if (typeof store.delete !== 'function') throw new Error('MODULE_STORE_DELETE_REQUIRED');
      await store.delete(`module-data:${command.moduleId}`);
    }

    const result = {
      commandId:command.commandId,
      status:'VERIFIED',
      moduleId:command.moduleId,
      capability:command.capability,
      revision:next.revision,
      readback:clone(nextDescriptor),
      eventId,
      errorCode:null,
    };
    next.commandLog[command.commandId] = clone(result);
    await store.put(REGISTRY_KEY, next);
    const durable = await store.get(REGISTRY_KEY);
    if (!durable || durable.revision !== next.revision || durable.modules?.[command.moduleId]?.state !== nextDescriptor.state || !durable.events?.some(item => item.eventId === eventId)) throw new Error('MODULE_DURABLE_READBACK_FAILED');
    return clone(result);
  }

  return Object.freeze({ initialize, snapshot, requestConfirmation, execute });
}
