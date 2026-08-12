import { GREENFIELD_DOMAINS, assertGreenfieldState } from './core.mjs';

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

export function createCommandRuntime() {
  const handlers = new Map();

  function register(domain, type, handler) {
    domain = requiredText(domain, 'INVALID_COMMAND_DOMAIN');
    type = requiredText(type, 'INVALID_COMMAND_TYPE');
    if (!GREENFIELD_DOMAINS.includes(domain)) throw new Error(`UNKNOWN_COMMAND_DOMAIN:${domain}`);
    if (!type.startsWith(`${domain}_`)) throw new Error(`COMMAND_DOMAIN_MISMATCH:${domain}/${type}`);
    if (typeof handler !== 'function') throw new TypeError('INVALID_COMMAND_HANDLER');
    if (handlers.has(type)) throw new Error(`COMMAND_ALREADY_REGISTERED:${type}`);
    handlers.set(type, { domain, handler });
  }

  async function execute(state, command) {
    assertGreenfieldState(state);
    const commandId = requiredText(command?.commandId, 'INVALID_COMMAND_ID');
    const idempotencyKey = requiredText(command?.idempotencyKey, 'INVALID_IDEMPOTENCY_KEY');
    const domain = requiredText(command?.domain, 'INVALID_COMMAND_DOMAIN');
    const type = requiredText(command?.type, 'INVALID_COMMAND_TYPE');
    if (!GREENFIELD_DOMAINS.includes(domain)) throw new Error(`UNKNOWN_COMMAND_DOMAIN:${domain}`);
    if (!Number.isSafeInteger(command?.expectedRevision) || command.expectedRevision !== state.revision) throw new Error(`STALE_COMMAND:${command?.expectedRevision}/${state.revision}`);
    if (state.commandLog[idempotencyKey]) throw new Error(`DUPLICATE_COMMAND:${idempotencyKey}`);
    const registration = handlers.get(type);
    if (!registration) throw new Error(`UNKNOWN_COMMAND_TYPE:${type}`);
    if (registration.domain !== domain || !type.startsWith(`${domain}_`)) throw new Error(`COMMAND_DOMAIN_MISMATCH:${domain}/${type}`);
    if (!command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) throw new Error('INVALID_COMMAND_PAYLOAD');

    const next = structuredClone(state);
    await registration.handler({
      domainState: next.domains[domain],
      payload: structuredClone(command.payload),
      command: structuredClone(command),
      context: Object.freeze({ domain, revision: state.revision }),
    });
    const committedAt = new Date().toISOString();
    next.revision = state.revision + 1;
    next.updatedAt = committedAt;
    next.commandLog[idempotencyKey] = { commandId, domain, type, revision: next.revision, committedAt };
    return assertGreenfieldState(next);
  }

  return Object.freeze({ register, execute });
}
