"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function expenseRequest(source = 'PATTERN') {
  return {
    version:'1', source, action:'CREATE', object:'EXPENSE',
    fields:{ title:'ข้าว', amountSatang:6500 },
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{ direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500 },
    },
  };
}

function ledgerState({ title = 'ข้าว', amountSatang = 6500 } = {}) {
  return {
    revision:7,
    domains:{
      LEDGER:{
        records:{
          'TX-LH-1':{
            record:{
              recordId:'TX-LH-1', type:'TRANSACTION', direction:'OUT', subtype:'EXPENSE', title, amountSatang,
            },
          },
        },
      },
    },
  };
}

test('expense capability maps normalized request only through runtime.expense and proves exact durable readback', async () => {
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
  const ids = ['WF-LH-1', 'TX-LH-1'];
  const calls = [];
  const accessed = new Set();
  const runtime = new Proxy({
    async expense(input) { calls.push(input); },
    async readState() { return ledgerState(); },
  }, {
    get(target, key) {
      accessed.add(String(key));
      if (!(key in target)) throw new Error(`UNEXPECTED_RUNTIME_ACCESS:${String(key)}`);
      return target[key];
    },
  });

  const capability = createExpenseCapability({ idFactory:() => ids.shift() });
  const request = expenseRequest();

  assert.equal(capability.id, 'EXPENSE_CREATE');
  assert.equal(capability.matches(request), true);

  const result = await capability.execute({ request, runtime });
  assert.deepEqual(calls, [{
    workflowId:'WF-LH-1', ledgerTransactionId:'TX-LH-1', title:'ข้าว', amountSatang:6500,
  }]);
  assert.deepEqual([...accessed].sort(), ['expense', 'readState']);
  assert.equal(result.evidenceStatus, 'PROVEN');
  assert.deepEqual(result.readback, {
    recordId:'TX-LH-1', direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500, revision:7,
  });
});

test('expense capability reports readback mismatch instead of claiming success', async () => {
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
  const ids = ['WF-LH-1', 'TX-LH-1'];
  const runtime = {
    async expense() {},
    async readState() { return ledgerState({ amountSatang:6600 }); },
  };
  const capability = createExpenseCapability({ idFactory:() => ids.shift() });
  const result = await capability.execute({ request:expenseRequest(), runtime });
  assert.deepEqual(result, { evidenceStatus:'MISMATCH', reason:'LEDGER_READBACK_MISMATCH' });
});

test('expense capability matches Required Result semantics independent of source provenance', async () => {
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
  const capability = createExpenseCapability({ idFactory:() => 'unused' });
  assert.equal(capability.matches(expenseRequest('PATTERN')), true);
  assert.equal(capability.matches(expenseRequest('AI')), true);
  const wrong = expenseRequest('AI');
  wrong.requiredResult.effect.direction = 'IN';
  assert.equal(capability.matches(wrong), false);
});
