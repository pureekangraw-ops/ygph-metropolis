"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('golden deterministic Pattern normalizes ข้าว 65', async () => {
  const { normalizePatternInput } = await import('../lighthouse/pattern-input.mjs');
  const result = normalizePatternInput('ข้าว 65');
  assert.equal(result.status, 'MATCH');
  assert.equal(result.request.source, 'PATTERN');
  assert.equal(result.request.object, 'EXPENSE');
  assert.equal(result.request.fields.title, 'ข้าว');
  assert.equal(result.request.fields.amountSatang, 6500);
  assert.equal(result.request.requiredResult.effect.amountSatang, 6500);
});

test('unknown title plus amount is NO_MATCH, not guessed expense', async () => {
  const { normalizePatternInput } = await import('../lighthouse/pattern-input.mjs');
  assert.deepEqual(normalizePatternInput('foo 65'), { status:'NO_MATCH', source:'PATTERN' });
  assert.deepEqual(normalizePatternInput('ขาย 800'), { status:'NO_MATCH', source:'PATTERN' });
});

test('unsafe or ambiguous money is NO_MATCH', async () => {
  const { normalizePatternInput } = await import('../lighthouse/pattern-input.mjs');
  for (const input of ['ข้าว 0', 'ข้าว -5', 'ข้าว nope', 'ข้าว 1.234']) {
    assert.deepEqual(normalizePatternInput(input), { status:'NO_MATCH', source:'PATTERN' });
  }
});
