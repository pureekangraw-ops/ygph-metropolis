import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerGateway } from '../app/public/logic/ledger/ledger-gateway.mjs';
import { createManualLedgerFacade } from '../app/public/logic/manual/manual-ledger-facade.mjs';

function fixture({ manualResult = { status:'VERIFIED', readback:{ recordId:'TX-1' } }, workflowResult = { status:'COMMITTED', state:{ revision:2 } } } = {}) {
  const calls = [];
  const manual = {
    async addIncome(payload) { calls.push(['addIncome', payload]); return structuredClone(manualResult); },
    async addExpense(payload) { calls.push(['addExpense', payload]); return structuredClone(manualResult); },
  };
  const runtime = {
    async executeMultiGroupCommands(commands) { calls.push(['workflow', commands]); return structuredClone(workflowResult); },
    async readState() { calls.push(['readState']); return { revision:3, domains:{} }; },
  };
  return { calls, manual, runtime };
}

test('gateway routes an allowed Manual mutation and returns verified readback', async () => {
  const { calls, manual, runtime } = fixture();
  const gateway = createLedgerGateway({ manual, runtime });
  const result = await gateway.execute({ operation:'addIncome', payload:{ amountSatang:50000 } });
  assert.equal(result.status, 'VERIFIED');
  assert.deepEqual(result.readback, { recordId:'TX-1' });
  assert.deepEqual(calls[0], ['addIncome', { amountSatang:50000 }]);
});

test('gateway rejects an unknown operation instead of falling through', async () => {
  const { manual, runtime } = fixture();
  const gateway = createLedgerGateway({ manual, runtime });
  await assert.rejects(
    () => gateway.execute({ operation:'disableModule', payload:{ moduleId:'ledger' } }),
    /LEDGER_GATEWAY_OPERATION_UNSUPPORTED:disableModule/,
  );
});

test('gateway fails closed on an unverified mutation result', async () => {
  const { manual, runtime } = fixture({ manualResult:{ status:'MYSTERY', readback:{} } });
  const gateway = createLedgerGateway({ manual, runtime });
  await assert.rejects(
    () => gateway.execute({ operation:'addIncome', payload:{} }),
    /LEDGER_GATEWAY_MUTATION_NOT_VERIFIED:MYSTERY/,
  );
});

test('gateway requires mutation readback', async () => {
  const { manual, runtime } = fixture({ manualResult:{ status:'VERIFIED' } });
  const gateway = createLedgerGateway({ manual, runtime });
  await assert.rejects(
    () => gateway.execute({ operation:'addIncome', payload:{} }),
    /LEDGER_GATEWAY_READBACK_REQUIRED/,
  );
});

test('gateway wraps legacy multi-group execution with durable readback', async () => {
  const { calls, manual, runtime } = fixture({ workflowResult:{ status:'COMMITTED' } });
  const gateway = createLedgerGateway({ manual, runtime });
  const result = await gateway.executeWorkflow({ commands:[{ domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION' }] });
  assert.equal(result.status, 'COMMITTED');
  assert.equal(result.readback.revision, 3);
  assert.deepEqual(calls.at(-1), ['readState']);
});

const MUTATIONS = [
  'addIncome', 'setTarget', 'editTarget', 'createReceivable', 'receiveReceivable',
  'addExpense', 'setCeiling', 'editCeiling', 'createObligation', 'payObligation',
  'refund', 'reverse', 'createCalendarItem', 'editCalendar', 'rescheduleCalendar',
  'completeCalendar', 'cancelCalendar', 'editLedgerMetadata', 'cancelExpected',
];

test('Manual facade sends every mutation through Ledger Gateway while reads stay on Manual owner', async () => {
  const routed = [];
  const manual = {
    async dashboard() { return { balanceSatang:1254000 }; },
    ...Object.fromEntries(MUTATIONS.map(name => [name, async () => { throw new Error(`BYPASS:${name}`); }])),
  };
  const gateway = {
    async execute(input) { routed.push(structuredClone(input)); return { status:'VERIFIED', readback:{ operation:input.operation } }; },
  };
  const facade = createManualLedgerFacade({ manual, gateway });

  for (const name of MUTATIONS) {
    const result = await facade[name]({ marker:name });
    assert.equal(result.readback.operation, name);
  }
  assert.deepEqual(await facade.dashboard(), { balanceSatang:1254000 });
  assert.deepEqual(routed.map(item => item.operation), MUTATIONS);
});

test('Ledger Gateway cannot absorb module lifecycle authority', async () => {
  const { manual, runtime } = fixture();
  const gateway = createLedgerGateway({ manual, runtime });
  for (const operation of ['installModule', 'removeModule', 'disableModule', 'enableModule', 'purgeModule']) {
    await assert.rejects(
      () => gateway.execute({ operation, payload:{ moduleId:'ledger' } }),
      new RegExp(`LEDGER_GATEWAY_OPERATION_UNSUPPORTED:${operation}`),
    );
  }
});
