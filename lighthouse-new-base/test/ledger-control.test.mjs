import test from 'node:test';
import assert from 'node:assert/strict';
import { projectLedgerView, createManualControl } from '../src/ledger-control.mjs';

function stateWithLedger(records = {}) {
  return { domains:{ LEDGER:{ records } } };
}

test('Ledger view derives real balance and history without becoming the owner of Income or Outcome', () => {
  const state = stateWithLedger({
    'TX-IN-1': { record:{ recordId:'TX-IN-1', type:'TRANSACTION', direction:'IN', title:'วิ่งงาน', amountSatang:42000, createdAt:'2026-09-02T03:00:00.000Z' } },
    'TX-OUT-1': { record:{ recordId:'TX-OUT-1', type:'TRANSACTION', direction:'OUT', title:'ข้าว', amountSatang:6500, createdAt:'2026-09-02T04:00:00.000Z' } },
  });

  const before = JSON.stringify(state);
  const view = projectLedgerView(state);

  assert.equal(view.balanceSatang, 35500);
  assert.equal(view.history.length, 2);
  assert.equal(view.history[0].recordId, 'TX-OUT-1');
  assert.equal(view.history[0].owner, 'outcome');
  assert.equal(view.history[1].owner, 'income');
  assert.equal(view.history[0].sourceRecord, state.domains.LEDGER.records['TX-OUT-1'].record);
  assert.equal(JSON.stringify(state), before);
});

test('Manual Control sends edit to the original owner then reads Runtime back before returning result', async () => {
  const calls = [];
  let readbacks = 0;
  const runtime = { async readState(){ readbacks += 1; return stateWithLedger(); } };
  const incomeOwner = { async editRecord(input){ calls.push(['income', input]); return { owner:'income', changed:true }; } };
  const outcomeOwner = { async editRecord(input){ calls.push(['outcome', input]); return { owner:'outcome', changed:true }; } };
  const control = createManualControl({ runtime, owners:{ income:incomeOwner, outcome:outcomeOwner } });

  const result = await control.edit({ item:{ recordId:'TX-OUT-1', owner:'outcome' }, changes:{ title:'ข้าวเย็น' } });

  assert.deepEqual(calls, [['outcome', { recordId:'TX-OUT-1', changes:{ title:'ข้าวเย็น' } }]]);
  assert.equal(readbacks, 1);
  assert.equal(result.ownerResult.owner, 'outcome');
  assert.ok(result.readback);
});

test('Manual Control is also the CHAT-to-MANUAL bridge and fails closed on unknown owner', async () => {
  const control = createManualControl({
    runtime:{ async readState(){ return stateWithLedger(); } },
    owners:{ income:{ async cancelRecord(){ return { owner:'income' }; } } },
  });

  const bridged = await control.fromChat({ action:'cancel', item:{ recordId:'TX-IN-1', owner:'income' } });
  assert.equal(bridged.ownerResult.owner, 'income');

  await assert.rejects(
    control.fromChat({ action:'cancel', item:{ recordId:'X', owner:'ledger' } }),
    /MANUAL_CONTROL_OWNER_UNPROVEN/,
  );
});
