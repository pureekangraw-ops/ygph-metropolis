"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function expenseRequest(source = 'PATTERN', requestId = 'REQ-expense-1') {
  return {
    version:'1', source, requestId, action:'CREATE', object:'EXPENSE',
    fields:{ title:'ข้าว', amountSatang:6500 },
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{ direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500 },
    },
  };
}

function ledgerState({ title = 'ข้าว', amountSatang = 6500, requestId = 'REQ-expense-1' } = {}) {
  const recordId = `TX-LH-${requestId}`;
  return {
    revision:7,
    domains:{
      LEDGER:{
        records:{
          [recordId]:{
            record:{
              recordId, type:'TRANSACTION', direction:'OUT', detail:'OUT:EXPENSE', title, amountSatang,
            },
          },
        },
      },
    },
  };
}

test('expense capability maps operation identity through runtime.expense and proves canonical durable Ledger readback', async () => {
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
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

  const capability = createExpenseCapability();
  const request = expenseRequest();

  assert.equal(capability.id, 'EXPENSE_CREATE');
  assert.equal(capability.matches(request), true);

  const result = await capability.execute({ request, runtime });
  assert.deepEqual(calls, [{
    workflowId:'WF-LH-REQ-expense-1', ledgerTransactionId:'TX-LH-REQ-expense-1', title:'ข้าว', amountSatang:6500,
  }]);
  assert.deepEqual([...accessed].sort(), ['expense', 'readState']);
  assert.equal(result.evidenceStatus, 'PROVEN');
  assert.deepEqual(result.readback, {
    recordId:'TX-LH-REQ-expense-1', direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500, revision:7,
  });
});

test('expense capability reports readback mismatch instead of claiming success', async () => {
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
  const runtime = {
    async expense() {},
    async readState() { return ledgerState({ amountSatang:6600 }); },
  };
  const capability = createExpenseCapability();
  const result = await capability.execute({ request:expenseRequest(), runtime });
  assert.deepEqual(result, { evidenceStatus:'MISMATCH', reason:'LEDGER_READBACK_MISMATCH' });
});

test('expense capability reports unavailable readback as unverified after possible mutation', async () => {
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
  const runtime = {
    async expense() {},
    async readState() { throw new Error('READBACK_OFFLINE'); },
  };
  const capability = createExpenseCapability();
  const result = await capability.execute({ request:expenseRequest(), runtime });
  assert.deepEqual(result, { evidenceStatus:'UNVERIFIED', reason:'LEDGER_READBACK_UNAVAILABLE' });
});

test('expense capability matches Required Result semantics independent of source provenance', async () => {
  const { createExpenseCapability } = await import('../lighthouse/capabilities/expense.mjs');
  const capability = createExpenseCapability();
  assert.equal(capability.matches(expenseRequest('PATTERN')), true);
  assert.equal(capability.matches(expenseRequest('AI')), true);
  const wrong = expenseRequest('AI');
  wrong.requiredResult.effect.direction = 'IN';
  assert.equal(capability.matches(wrong), false);
});
