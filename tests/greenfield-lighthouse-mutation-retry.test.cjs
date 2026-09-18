const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '../lighthouse-next/mutation-retry.mjs');

async function load() {
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

test('stable mutation attempt reuses ids for the same payload and rotates before ambiguity', async () => {
  const { createStableMutationAttempt } = await load();
  let serial = 0;
  const attempt = createStableMutationAttempt({
    createId:prefix => `${prefix}-${++serial}`,
    prefixes:{ workflowId:'WF', ledgerTransactionId:'TX' },
  });

  const first = attempt.acquire({ amountBaht:65, title:'ข้าว' });
  const retry = attempt.acquire({ title:'ข้าว', amountBaht:65 });
  assert.deepEqual(retry, first);

  const edited = attempt.acquire({ amountBaht:70, title:'ข้าว' });
  assert.notEqual(edited.workflowId, first.workflowId);
  assert.notEqual(edited.ledgerTransactionId, first.ledgerTransactionId);
});

test('ambiguous mutation locks payload while allowing exact-id readback retry', async () => {
  const { createStableMutationAttempt } = await load();
  let serial = 0;
  const attempt = createStableMutationAttempt({
    createId:prefix => `${prefix}-${++serial}`,
    prefixes:{ workflowId:'WF', ledgerTransactionId:'TX' },
  });
  const ids = attempt.acquire({ amountBaht:65 });
  attempt.markVerificationPending();

  assert.deepEqual(attempt.acquire({ amountBaht:65 }), ids);
  assert.throws(() => attempt.acquire({ amountBaht:70 }), /LIGHTHOUSE_MUTATION_RETRY_PAYLOAD_LOCKED/);

  attempt.clear();
  assert.doesNotThrow(() => attempt.acquire({ amountBaht:70 }));
});

test('mutation error classification fails closed except proven pre-write errors', async () => {
  const { mutationErrorNeedsVerification } = await load();
  assert.equal(mutationErrorNeedsVerification(new Error('LIGHTHOUSE_LEDGER_READBACK_MISMATCH')), true);
  assert.equal(mutationErrorNeedsVerification(new Error('mystery runtime failure')), true);
  assert.equal(mutationErrorNeedsVerification(new Error('RUNTIME_SESSION_LOCKED')), false);
  assert.equal(mutationErrorNeedsVerification(new Error('PAYMENT_OVER_REMAINING')), false);
  assert.equal(mutationErrorNeedsVerification(new Error('LIGHTHOUSE_STORE_INSUFFICIENT_STOCK:1')), false);
  assert.equal(mutationErrorNeedsVerification(new Error('LIGHTHOUSE_AMOUNT_INVALID')), false);
});
