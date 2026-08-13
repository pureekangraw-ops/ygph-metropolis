import { readEncryptedState, commitEncryptedState } from './persistence.mjs';
import { validateWorkflowInvariants } from './workflow-invariants.mjs';

export async function executeAtomicWorkflow({ store, passphrase, runtime, commands }) {
  if (!runtime || typeof runtime.execute !== 'function') throw new TypeError('INVALID_COMMAND_RUNTIME');
  if (!Array.isArray(commands) || commands.length === 0) throw new Error('EMPTY_WORKFLOW');
  const durableStart = await readEncryptedState({ store, passphrase });
  if (!durableStart) throw new Error('GREENFIELD_NOT_INITIALIZED');
  validateWorkflowInvariants(durableStart, commands);
  let working = durableStart;
  for (const command of commands) {
    working = await runtime.execute(working, {
      ...structuredClone(command),
      expectedRevision: working.revision,
    });
  }
  const commit = await commitEncryptedState({
    store,
    passphrase,
    state: working,
    expectedDurableRevision: durableStart.revision,
  });
  const durableAfter = await readEncryptedState({ store, passphrase });
  return {
    status: commit.status,
    fromRevision: durableStart.revision,
    toRevision: durableAfter.revision,
    appliedCommands: commands.length,
    state: durableAfter,
  };
}
