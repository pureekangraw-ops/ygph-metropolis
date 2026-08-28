"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

const base = (source, requestId = 'REQ-test-1') => ({
  version:'1', source, requestId, action:'CREATE', object:'EXPENSE',
  fields:{ title:'ข้าว', amountSatang:6500 },
  requiredResult:{
    kind:'LEDGER_TRANSACTION',
    effect:{ direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500 },
  },
});

test('PATH Contract accepts the same required result from Pattern or AI without source authority', async () => {
  const { validatePathRequest } = await import('../lighthouse/path-contract.mjs');
  const pattern = validatePathRequest(base('PATTERN', 'REQ-pattern-1'));
  const ai = validatePathRequest(base('AI', 'REQ-ai-1'));
  assert.equal(pattern.source, 'PATTERN');
  assert.equal(ai.source, 'AI');
  assert.deepEqual(pattern.requiredResult, ai.requiredResult);
  assert.deepEqual(pattern.fields, ai.fields);
});

test('PATH Contract requires an explicit local operation identity instead of inventing one', async () => {
  const { validatePathRequest } = await import('../lighthouse/path-contract.mjs');
  const input = base('PATTERN');
  delete input.requestId;
  assert.throws(() => validatePathRequest(input), /PATH_INVALID_REQUEST_ID/);
});

test('PATH Contract rejects missing Required Result instead of inferring one', async () => {
  const { validatePathRequest } = await import('../lighthouse/path-contract.mjs');
  const input = base('PATTERN');
  delete input.requiredResult;
  assert.throws(() => validatePathRequest(input), /PATH_REQUIRED_RESULT_REQUIRED/);
});

test('PATH Contract rejects a required effect that disagrees with normalized fields', async () => {
  const { validatePathRequest } = await import('../lighthouse/path-contract.mjs');
  const input = base('PATTERN');
  input.requiredResult.effect.amountSatang = 6600;
  assert.throws(() => validatePathRequest(input), /PATH_REQUIRED_RESULT_MISMATCH/);
});
