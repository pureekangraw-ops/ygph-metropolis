import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';

import { createTrustedBrainGate } from '../www/trusted/brain-gate.mjs';
import { initializeTrustedFirstRun, openTrustedBrain } from '../www/trusted/bootstrap.mjs';
import { DB_NAME } from '../../greenfield/browser-store.mjs';
import { deactivateRuntimeSession } from '../../greenfield/runtime-session.mjs';

const RECOVERY_CODE = 'LH-chat-confirmation-recovery-code';
const DEVICE_PIN = '112233';

async function resetVault() {
  deactivateRuntimeSession();
  await new Promise((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('TEST_DB_DELETE_FAILED'));
    request.onblocked = () => reject(new Error('TEST_DB_DELETE_BLOCKED'));
  });
}

function expenseRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records ?? {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION' && record?.direction === 'OUT' && String(record?.detail ?? '').includes('EXPENSE'));
}

test('typed confirmation can hand the prepared request to the app executor without calling the legacy direct executor', async () => {
  let legacyExecutes = 0;
  const executed = [];
  const request = Object.freeze({
    version:'1', requestId:'REQ-CONFIRM-1', action:'CREATE', object:'EXPENSE',
    fields:Object.freeze({ title:'ข้าว', amountSatang:6500 }),
    requiredResult:Object.freeze({ kind:'LEDGER_TRANSACTION', effect:Object.freeze({ direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500 }) }),
  });
  const brain = {
    async send() { return { status:'READY', requiresConfirmation:true, request, preview:{ title:'ข้าว', amountSatang:6500 } }; },
    async execute() { legacyExecutes += 1; return { status:'SUCCESS', readback:{ legacy:true } }; },
  };
  const gate = createTrustedBrainGate({
    brain,
    executeConfirmed:async prepared => {
      executed.push(structuredClone(prepared));
      return { status:'SUCCESS', readback:{ recordId:'TX-CONFIRM-1', amountSatang:6500 } };
    },
  });

  const pending = await gate.send('ข้าว 65');
  assert.equal(pending.status, 'CONFIRMATION_REQUIRED');
  assert.equal(executed.length, 0);

  const confirmed = await gate.send('ยืนยัน');
  assert.equal(confirmed.status, 'SUCCESS');
  assert.equal(confirmed.readback.amountSatang, 6500);
  assert.equal(legacyExecutes, 0);
  assert.equal(executed.length, 1);
  assert.equal(executed[0].object, 'EXPENSE');
  assert.equal(executed[0].requestId, 'REQ-CONFIRM-1');
});

test('confirmed EXPENSE request is translated to the shared Manual Ledger facade instead of direct runtime execution', async () => {
  const { createConfirmedLedgerExecutor } = await import('../app/public/logic/chat/confirmed-ledger-executor.mjs');
  const calls = [];
  const manual = {
    async addExpense(payload) {
      calls.push(structuredClone(payload));
      return { status:'VERIFIED', readback:{ recordId:payload.recordId, direction:'OUT', amountSatang:payload.amountSatang } };
    },
  };
  const execute = createConfirmedLedgerExecutor({ manual });
  const result = await execute({
    version:'1', requestId:'REQ-EXPENSE-42', action:'CREATE', object:'EXPENSE',
    fields:{ title:'ข้าว', amountSatang:6500, businessDate:'2026-09-05' },
    requiredResult:{ kind:'LEDGER_TRANSACTION', effect:{ direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500, businessDate:'2026-09-05' } },
  });

  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(calls, [{
    workflowId:'WF-LH-REQ-EXPENSE-42',
    recordId:'TX-LH-REQ-EXPENSE-42',
    title:'ข้าว',
    amountSatang:6500,
    businessDate:'2026-09-05',
  }]);
  assert.equal(result.readback.recordId, 'TX-LH-REQ-EXPENSE-42');
});

test('confirmed STORE_SALE request enters the shared Store workflow through Manual Ledger facade', async () => {
  const { createConfirmedLedgerExecutor } = await import('../app/public/logic/chat/confirmed-ledger-executor.mjs');
  const calls = [];
  const manual = {
    async addExpense() { throw new Error('EXPENSE_NOT_EXPECTED'); },
    async storeSale(payload) {
      calls.push(structuredClone(payload));
      return { status:'VERIFIED', readback:{ owner:'STORE', saleId:payload.saleId, amountSatang:payload.amountSatang } };
    },
  };
  const execute = createConfirmedLedgerExecutor({ manual });
  const result = await execute({
    version:'1', requestId:'REQ-STORE-42', action:'CREATE', object:'STORE_SALE',
    fields:{ title:'สบู่', amountSatang:50000, quantity:1, receivedSatang:50000 },
    requiredResult:{ kind:'STORE_SALE_WITH_LEDGER', effect:{ owner:'STORE', ledgerDirection:'IN', title:'สบู่', amountSatang:50000, quantity:1, receivedSatang:50000 } },
  });

  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(calls, [{
    workflowId:'WF-LH-REQ-STORE-42',
    saleId:'SALE-LH-REQ-STORE-42',
    ledgerTransactionId:'TX-LH-REQ-STORE-42',
    title:'สบู่',
    amountSatang:50000,
    quantity:1,
    receivedSatang:50000,
    storeCostSatang:0,
  }]);
  assert.equal(result.readback.owner, 'STORE');
});

test('confirmed RIDE_JOB request enters the shared Ride workflow and stays Ride-owned', async () => {
  const { createConfirmedLedgerExecutor } = await import('../app/public/logic/chat/confirmed-ledger-executor.mjs');
  const calls = [];
  const manual = {
    async addExpense() { throw new Error('EXPENSE_NOT_EXPECTED'); },
    async rideJob(payload) {
      calls.push(structuredClone(payload));
      return { status:'VERIFIED', readback:{ owner:'RIDE', jobId:payload.jobId, amountSatang:payload.amountSatang } };
    },
  };
  const execute = createConfirmedLedgerExecutor({ manual });
  const result = await execute({
    version:'1', requestId:'REQ-RIDE-42', action:'CREATE', object:'RIDE_JOB',
    fields:{ roundId:'ROUND-1', amountSatang:35000, paymentMode:'CASH', note:'' },
    requiredResult:{ kind:'RIDE_JOB_WITH_LEDGER', effect:{ owner:'RIDE', ledgerDirection:'IN', amountSatang:35000, paymentMode:'CASH' } },
  });

  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(calls, [{
    workflowId:'WF-LH-REQ-RIDE-42',
    roundId:'ROUND-1',
    jobId:'JOB-LH-REQ-RIDE-42',
    ledgerTransactionId:'TX-LH-REQ-RIDE-42',
    amountSatang:35000,
    paymentMode:'CASH',
    note:'',
  }]);
  assert.equal(result.readback.owner, 'RIDE');
});

test('stable CHAT shows GO confirmation as conversation, mutates nothing before ยืนยัน, then commits after typed approval', async (t) => {
  await resetVault();
  await initializeTrustedFirstRun({
    recoveryCode:RECOVERY_CODE,
    pin:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    now:() => '2026-09-05T10:50:00.000Z',
  });
  const session = await openTrustedBrain({
    pin:DEVICE_PIN,
    indexedDBImpl:fakeIndexedDB,
    lockManager:null,
    now:() => '2026-09-05T10:50:01.000Z',
    documentRef:null,
  });
  t.after(async () => { session.close(); await resetVault(); });

  const before = await session.runtime.readState();
  const first = await session.services.chat.dispatch({
    requestId:'UI-CONFIRM-FIRST', route:'PROVIDER', payload:{ text:'ข้าว 65' },
  });
  assert.equal(first.status, 'SUCCESS');
  assert.equal(first.result.readback.interactionStatus, 'CONFIRMATION_REQUIRED');
  assert.match(first.result.readback.message, /ข้าว 65 บาท/);
  const pendingState = await session.runtime.readState();
  assert.deepEqual(pendingState.domains, before.domains);
  assert.equal(expenseRecords(pendingState).length, 0);

  const second = await session.services.chat.dispatch({
    requestId:'UI-CONFIRM-SECOND', route:'PROVIDER', payload:{ text:'ยืนยัน' },
  });
  assert.equal(second.status, 'SUCCESS');
  assert.equal(second.result.readback.amountSatang, 6500);
  const durable = await session.runtime.readState();
  assert.equal(expenseRecords(durable).length, 1);
  assert.equal(expenseRecords(durable)[0].amountSatang, 6500);
});
