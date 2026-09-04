import { canonicalStringify } from './core.mjs';
import { readEncryptedState, commitEncryptedState } from './persistence.mjs';
import { openGreenfieldVaultStore } from './browser-store.mjs';
import { unlockVaultPassphrase } from './device-unlock.mjs';
import { createGreenfieldRuntime } from './runtime.mjs';
import { createCommandRuntime } from './command-runtime.mjs';
import { registerGreenfieldDomainCommands } from './domain-operations.mjs';
import { registerRideDomainCommands } from './ride-domain.mjs';
import { executeAtomicWorkflow } from './workflow-runtime.mjs';
import { createMutationCoordinator } from './mutation-coordinator.mjs';

const METADATA_ROOT = 'canonicalServices';

function keyOf(value) {
  const key = String(value ?? '').trim();
  if (!key) throw new Error('CANONICAL_METADATA_KEY_REQUIRED');
  return key;
}

function browserLifecycleSyncEnabled() {
  return typeof globalThis.window !== 'undefined';
}

function workflowEnvelope(input) {
  if (Array.isArray(input)) return { commands:input, baseRevision:null };
  const commands = input?.commands;
  const baseRevision = input?.baseRevision ?? null;
  if (!Array.isArray(commands) || commands.length === 0) throw new Error('EMPTY_WORKFLOW');
  if (baseRevision != null && !Number.isSafeInteger(baseRevision)) throw new Error('INVALID_BASE_REVISION');
  return { commands, baseRevision };
}

export function createCanonicalGreenfieldRuntime({
  store,
  passphrase,
  lockManager = globalThis.navigator?.locks ?? null,
  now = () => new Date().toISOString(),
  closeStore = null,
} = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') throw new TypeError('INVALID_GREENFIELD_STORE');
  if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('PASSPHRASE_TOO_SHORT');

  const runtime = createGreenfieldRuntime({ store, passphrase, lockManager, now, closeStore });
  const commandRuntime = createCommandRuntime();
  registerGreenfieldDomainCommands(commandRuntime, { now });
  registerRideDomainCommands(commandRuntime, { now });
  const coordinator = createMutationCoordinator({ lockManager });

  async function executeMultiGroupCommands(input) {
    const { commands, baseRevision } = workflowEnvelope(input);
    return coordinator.run(async () => {
      if (baseRevision != null) {
        const durable = await readEncryptedState({ store, passphrase });
        if (!durable) throw new Error('GREENFIELD_NOT_INITIALIZED');
        if (durable.revision !== baseRevision) throw new Error(`STALE_DURABLE_STATE:${baseRevision}/${durable.revision}`);
      }
      return executeAtomicWorkflow({
        store,
        passphrase,
        runtime:commandRuntime,
        commands:structuredClone(commands),
      });
    });
  }

  function metadataStore() {
    async function get(key) {
      key = keyOf(key);
      const state = await readEncryptedState({ store, passphrase });
      if (!state) throw new Error('GREENFIELD_NOT_INITIALIZED');
      return structuredClone(state.meta?.[METADATA_ROOT]?.[key] ?? null);
    }

    async function mutate(key, value, remove = false) {
      key = keyOf(key);
      return coordinator.run(async () => {
        const current = await readEncryptedState({ store, passphrase });
        if (!current) throw new Error('GREENFIELD_NOT_INITIALIZED');
        const next = structuredClone(current);
        next.meta = next.meta && typeof next.meta === 'object' ? next.meta : {};
        next.meta[METADATA_ROOT] = next.meta[METADATA_ROOT] && typeof next.meta[METADATA_ROOT] === 'object'
          ? next.meta[METADATA_ROOT]
          : {};
        if (remove) delete next.meta[METADATA_ROOT][key];
        else next.meta[METADATA_ROOT][key] = structuredClone(value);
        next.revision = current.revision + 1;
        next.updatedAt = now();
        await commitEncryptedState({ store, passphrase, state:next, expectedDurableRevision:current.revision });
        const durable = await readEncryptedState({ store, passphrase });
        if (!durable || durable.revision !== next.revision) throw new Error('CANONICAL_METADATA_READBACK_FAILED');
        const readback = durable.meta?.[METADATA_ROOT]?.[key];
        if (remove) {
          if (readback !== undefined) throw new Error('CANONICAL_METADATA_DELETE_READBACK_FAILED');
          return null;
        }
        if (canonicalStringify(readback) !== canonicalStringify(value)) throw new Error('CANONICAL_METADATA_READBACK_FAILED');
        return structuredClone(readback);
      });
    }

    return Object.freeze({
      get,
      put: (key, value) => mutate(key, value, false),
      delete: key => mutate(key, null, true),
    });
  }

  return Object.freeze({
    ...runtime,
    executeMultiGroupCommands,
    metadataStore,
  });
}

export async function openCanonicalGreenfieldRuntimeWithDevicePin({
  pin,
  indexedDBImpl = globalThis.indexedDB,
  lockManager = globalThis.navigator?.locks ?? null,
  now,
} = {}) {
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  try {
    const passphrase = await unlockVaultPassphrase({ store, pin });
    const runtime = createCanonicalGreenfieldRuntime({
      store,
      passphrase,
      lockManager,
      now,
      closeStore:() => store.close(),
    });
    if (browserLifecycleSyncEnabled()) await runtime.syncDailyLifecycle();
    return runtime;
  } catch (error) {
    store.close();
    throw error;
  }
}
