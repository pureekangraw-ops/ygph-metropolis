import { MANUAL_MUTATION_OPERATIONS, GATEWAY_WORKFLOW_OPERATIONS } from '../ledger/ledger-gateway.mjs';

function owner(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

export function createManualLedgerFacade({ manual, gateway } = {}) {
  manual = owner(manual, 'MANUAL_LEDGER_FACADE_OWNER_REQUIRED');
  gateway = owner(gateway, 'MANUAL_LEDGER_FACADE_GATEWAY_REQUIRED');
  if (typeof gateway.execute !== 'function') throw new TypeError('MANUAL_LEDGER_FACADE_EXECUTE_REQUIRED');

  const facade = { ...manual };
  for (const operation of MANUAL_MUTATION_OPERATIONS) {
    if (typeof manual[operation] !== 'function') throw new Error(`MANUAL_LEDGER_FACADE_METHOD_REQUIRED:${operation}`);
    facade[operation] = payload => gateway.execute({ operation, payload });
  }
  for (const operation of GATEWAY_WORKFLOW_OPERATIONS) {
    facade[operation] = payload => gateway.execute({ operation, payload });
  }
  return Object.freeze(facade);
}
