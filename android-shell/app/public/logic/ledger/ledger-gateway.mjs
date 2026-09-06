import { buildSaleWorkflow } from '../domains/business-workflows.mjs';
import { buildStoreIncomeWorkflow } from '../domains/store-income-workflow.mjs';
import { buildRideStartRoundWorkflow, buildRideReplaceRoundWorkflow, buildRideJobWorkflow, buildRideEndRoundWorkflow } from '../domains/ride-workflows.mjs';
import { buildOwnerAwareReverseWorkflow } from '../domains/reverse-workflow.mjs';

const VERIFIED = new Set(['COMMITTED', 'RECOVERED', 'VERIFIED']);

export const MANUAL_MUTATION_OPERATIONS = Object.freeze([
  'addIncome', 'setTarget', 'editTarget', 'createReceivable', 'receiveReceivable',
  'addExpense', 'setCeiling', 'editCeiling', 'createObligation', 'payObligation',
  'refund', 'reverse', 'createCalendarItem', 'editCalendar', 'rescheduleCalendar',
  'completeCalendar', 'cancelCalendar', 'editLedgerMetadata', 'cancelExpected',
]);

export const GATEWAY_WORKFLOW_OPERATIONS = Object.freeze([
  'storeSale', 'storeIncome', 'rideStartRound', 'rideJob', 'rideEndRound',
]);

const WORKFLOW_BUILDERS = Object.freeze({
  storeSale:buildSaleWorkflow,
  storeIncome:buildStoreIncomeWorkflow,
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

function activeRideRoundIds(state) {
  return Object.values(state?.domains?.RIDE?.records || {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'ROUND' && record.status === 'ACTIVE')
    .map(record => String(record.recordId));
}

function ledgerRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records || {}).map(entry => entry?.record).filter(Boolean);
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

  async function executeRideStartRound(payload) {
    const state = await runtime.readState();
    if (state == null) throw new Error('LEDGER_GATEWAY_READBACK_REQUIRED');
    const activeIds = activeRideRoundIds(state);
    if (activeIds.length > 1) throw new Error(`LEDGER_GATEWAY_RIDE_ACTIVE_ROUND_INVARIANT:${activeIds.join(',')}`);
    const plan = activeIds.length === 1
      ? buildRideReplaceRoundWorkflow({ ...structuredClone(payload), activeRoundId:activeIds[0] })
      : buildRideStartRoundWorkflow(structuredClone(payload));
    return executeWorkflow(plan);
  }

  async function executeReverse(payload) {
    const state = await runtime.readState();
    if (state == null) throw new Error('LEDGER_GATEWAY_READBACK_REQUIRED');
    const originalRecordId = String(payload?.originalRecordId || '').trim();
    const originalRecord = state?.domains?.LEDGER?.records?.[originalRecordId]?.record;
    if (!originalRecord || originalRecord.type !== 'TRANSACTION') throw new Error(`TRANSACTION_NOT_FOUND:${originalRecordId}`);
    if (originalRecord.reversalOf) throw new Error(`CANNOT_REVERSE_REVERSAL:${originalRecordId}`);
    if (ledgerRecords(state).some(record => record?.reversalOf === originalRecordId)) throw new Error(`TRANSACTION_ALREADY_REVERSED:${originalRecordId}`);
    return executeWorkflow(buildOwnerAwareReverseWorkflow({
      workflowId:payload.workflowId,
      originalRecord,
      reversalRecordId:payload.recordId,
      reason:payload.reason,
    }));
  }

  async function execute({ operation, payload = {} } = {}) {
    const name = String(operation || '').trim();
    if (name === 'rideStartRound') return executeRideStartRound(payload);
    if (name === 'reverse') return executeReverse(payload);
    const builder = WORKFLOW_BUILDERS[name];
    if (builder) return executeWorkflow(builder(structuredClone(payload)));
    if (!MANUAL_MUTATION_OPERATIONS.includes(name)) throw new Error(`LEDGER_GATEWAY_OPERATION_UNSUPPORTED:${name || 'EMPTY'}`);
    if (typeof manual[name] !== 'function') throw new Error(`LEDGER_GATEWAY_HANDLER_MISSING:${name}`);
    return verifyMutation(await manual[name](structuredClone(payload)));
  }

  return Object.freeze({ execute, executeWorkflow });
}
