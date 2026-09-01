import { withRuntimeSession } from './source/greenfield/runtime-session.mjs';
import { createManualFourHouses } from './source/greenfield/manual-four-houses.mjs';
import { createRecordReference, resolveRecordReference } from './source/greenfield/context-reference.mjs';

function frozen(value) { return Object.freeze(value); }
function text(value, fallback = '') { return String(value ?? fallback).trim(); }
function operationId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function createTrustedAppBridge({ runWithRuntime = withRuntimeSession } = {}) {
  if (typeof runWithRuntime !== 'function') throw new TypeError('TRUSTED_APP_BRIDGE_RUNTIME_SESSION_REQUIRED');

  async function resolve(reference) {
    return runWithRuntime(async runtime => {
      const manual = createManualFourHouses(runtime);
      return resolveRecordReference(manual, reference);
    });
  }

  async function reverse(reference, { reason = 'ย้อนรายการจาก LIGHTHOUSE Manual' } = {}) {
    return runWithRuntime(async runtime => {
      const manual = createManualFourHouses(runtime);
      const before = await resolveRecordReference(manual, reference);
      if (before.reference.owner !== 'LEDGER' || before.record.type !== 'TRANSACTION') {
        throw new Error('MANUAL_REVERSAL_NOT_SUPPORTED');
      }
      const reversalId = operationId('TX-LH-REVERSAL');
      const mutation = await manual.reverse({
        workflowId:operationId('WF-LH-MANUAL'),
        originalRecordId:before.reference.recordId,
        recordId:reversalId,
        reason:text(reason, 'ย้อนรายการจาก LIGHTHOUSE Manual'),
      });
      if (mutation?.status !== 'VERIFIED' || mutation?.readback?.recordId !== reversalId) {
        throw new Error('MANUAL_REVERSAL_READBACK_MISMATCH');
      }
      const current = await resolveRecordReference(manual, before.reference);
      const reversal = await resolveRecordReference(manual, createRecordReference({
        version:1,
        owner:'LEDGER',
        recordId:reversalId,
      }));
      return frozen({ status:'VERIFIED', mutation, current, reversal });
    });
  }

  async function permissionStatus() {
    return frozen({ status:'VERIFY', reason:'PERMISSION_OWNER_UNAVAILABLE' });
  }

  return frozen({ resolve, reverse, permissionStatus });
}
