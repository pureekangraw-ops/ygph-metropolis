import { buildSaleWorkflow } from '../domains/business-workflows.mjs';
import { buildRideStartRoundWorkflow, buildRideJobWorkflow, buildRideEndRoundWorkflow } from '../domains/ride-workflows.mjs';

const VERIFIED = new Set(['COMMITTED', 'RECOVERED', 'VERIFIED']);

export const MANUAL_MUTATION_OPERATIONS = Object.freeze([
  'addIncome', 'setTarget', 'editTarget', 'createReceivable', 'receiveReceivable',
  'addExpense', 'setCeiling', 'editCeiling', 'createObligation', 'payObligation',
  'refund', 'reverse', 'createCalendarItem', 'editCalendar', 'rescheduleCalendar',
  'completeCalendar', 'cancelCalendar', 'editLedgerMetadata', 'cancelExpected',
]);

export const GATEWAY_WORKFLOW_OPERATIONS = Object.freeze([
  'storeSale', 'rideStartRound', 'rideJob', 'rideEndRound',
]);

const WORKFLOW_BUILDERS = Object.freeze({
  storeSale:buildSaleWorkflow,
  rideStartRound:buildRideStartRoundWorkflow,
  rideJob:buildRideJobWorkflow,
  rideEndRound:buildRideEndRoundWorkflow,
});

function requiredObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function verifyMutation(result) {
  if (!VERIFIED.has(result?.status)) throw new Error(`LEDGER_GATEWAY_MUTATION_NOT_VERIFIED:${result?.status ?? 'UNKNOWN'}`);
  if (result.readback == null) throw new Error('LEDGER_GATEWAY_READBACK_REQUIRED');
  return result;
}

export function createLedgerGateway({ manual, runtime } = {}) {
  manual = requiredObject(manual, 'LEDGER_GATEWAY_MANUAL_REQUIRED');
  runtime = requiredObject(runtime, 'LEDGER_GATEWAY_RUNTIME_REQUIRED');
  if (typeof runtime.readState !== 'function' || typeof runtime.executeMultiGroupCommands !== 'function') {
    throw new TypeError('LEDGER_GATEWAY_RUNTIME_METHOD_REQUIRED');
  }

  async function executeWorkflow(value) {
    const commands = Array.isArray(value) ? value : value?.commands;
    if (!Array.isArray(commands) || commands.length === 0) throw new Error('LEDGER_GATEWAY_COMMANDS_REQUIRED');
    const raw = await runtime.executeMultiGroupCommands(structuredClone(commands));
    if (!VERIFIED.has(raw?.status)) throw new Error(`LEDGER_GATEWAY_MUTATION_NOT_VERIFIED:${raw?.status ?? 'UNKNOWN'}`);
    const readback = raw?.state ?? await runtime.readState();
    if (readback == null) throw new Error('LEDGER_GATEWAY_READBACK_REQUIRED');
    return { ...raw, readback:structuredClone(readback) };
  }

  async function execute({ operation, payload = {} } = {}) {
    const name = String(operation || '').trim();
    const builder = WORKFLOW_BUILDERS[name];
    if (builder) return executeWorkflow(builder(structuredClone(payload)));
    if (!MANUAL_MUTATION_OPERATIONS.includes(name)) throw new Error(`LEDGER_GATEWAY_OPERATION_UNSUPPORTED:${name || 'EMPTY'}`);
    if (typeof manual[name] !== 'function') throw new Error(`LEDGER_GATEWAY_HANDLER_MISSING:${name}`);
    return verifyMutation(await manual[name](structuredClone(payload)));
  }

  return Object.freeze({ execute, executeWorkflow });
}
