"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('Gem contract fixes Foundation support depth at one hop', async () => {
  const { GEM_MAX_SUPPORT_HOPS } = await import('../lighthouse/gem-contract.mjs');
  assert.equal(GEM_MAX_SUPPORT_HOPS, 1);
});

test('Gem result rejects execution authority fields', async () => {
  const { validateGemProcessResult } = await import('../lighthouse/gem-contract.mjs');
  assert.throws(() => validateGemProcessResult({
    status:'RESOLVED', proposal:{ object:'EXPENSE' }, runtimeMethod:'expense',
  }), /GEM_EXECUTION_AUTHORITY_FORBIDDEN/);
});
