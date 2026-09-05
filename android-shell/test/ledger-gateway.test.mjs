import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerGateway } from '../app/public/logic/ledger/ledger-gateway.mjs';

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
