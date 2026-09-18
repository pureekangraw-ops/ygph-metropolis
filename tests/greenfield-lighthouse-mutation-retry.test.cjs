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

  const first = await attempt.acquire({ amountBaht:65, title:'ข้าว' });
  const retry = await attempt.acquire({ title:'ข้าว', amountBaht:65 });
  assert.deepEqual(retry, first);

  const edited = await attempt.acquire({ amountBaht:70, title:'ข้าว' });
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
  const ids = await attempt.acquire({ amountBaht:65 });
  attempt.markVerificationPending();

  assert.deepEqual(await attempt.acquire({ amountBaht:65 }), ids);
  await assert.rejects(() => attempt.acquire({ amountBaht:70 }), /LIGHTHOUSE_MUTATION_RETRY_PAYLOAD_LOCKED/);

  attempt.clear();
  await assert.doesNotReject(() => attempt.acquire({ amountBaht:70 }));
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


test('MANUAL mutation surfaces reuse stable attempts instead of minting new ids on retry', () => {
  const fs = require('node:fs');
  const surface = fs.readFileSync(path.resolve(__dirname, '../lighthouse-next/surface-contract.mjs'), 'utf8');

  for (const prefix of [
    'WF-LH-MANUAL-RECEIVABLE',
    'TX-LH-MANUAL-RECEIVABLE',
    'WF-LH-MANUAL-INCOME',
    'TX-LH-MANUAL-INCOME',
    'WF-LH-MANUAL-EXPENSE',
    'TX-LH-MANUAL-EXPENSE',
    'WF-LH-MANUAL-OBLIGATION',
    'OB-LH-MANUAL',
    'CAL-LH-MANUAL-OBLIGATION',
    'WF-LH-MANUAL-PAY',
    'TX-LH-MANUAL-PAY',
    'WF-LH-CALENDAR-RESCHEDULE',
    'WF-LH-CALENDAR-STATUS',
    'WF-LH-MANUAL-REVERSAL',
    'TX-LH-MANUAL-REVERSAL',
  ]) {
    assert.match(surface, new RegExp(prefix));
  }

  assert.match(surface, /createManualAttempt/);
  assert.match(surface, /handleManualMutationFailure/);
  assert.match(surface, /paymentAttempt\.acquire/);
  assert.match(surface, /incomeAttempt\.acquire/);
  assert.match(surface, /expenseAttempt\.acquire/);
  assert.match(surface, /obligationAttempt\.acquire/);
  assert.match(surface, /payAttempt\.acquire/);
  assert.match(surface, /rescheduleAttempt\.acquire/);
  assert.match(surface, /statusAttempt\.acquire/);
  assert.match(surface, /attempt\.acquire\(\{ originalRecordId:transaction\.recordId, reason \}\)/);

  for (const forbidden of [
    "workflowId:operationId('WF-LH-MANUAL-INCOME')",
    "workflowId:operationId('WF-LH-MANUAL-EXPENSE')",
    "workflowId:operationId('WF-LH-MANUAL-OBLIGATION')",
    "workflowId:operationId('WF-LH-MANUAL-PAY')",
    "workflowId:operationId('WF-LH-CALENDAR-RESCHEDULE')",
    "workflowId:operationId('WF-LH-CALENDAR-STATUS')",
  ]) {
    assert.equal(surface.includes(forbidden), false, `fresh retry identity remains: ${forbidden}`);
  }
});


function localStorageLike() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    key(index) { return [...data.keys()][index] ?? null; },
    get length() { return data.size; },
    dump(key) { return data.get(key) ?? null; },
  };
}

test('ambiguous retry ids survive reopen without persisting business payload plaintext', async () => {
  const { MANUAL_MUTATION_ATTEMPT_PREFIX, createStableMutationAttempt } = await load();
  const storage = localStorageLike();
  let serial = 0;
  const persistenceKey = `${MANUAL_MUTATION_ATTEMPT_PREFIX}expense`;
  const first = createStableMutationAttempt({
    createId:prefix => `${prefix}-${++serial}`,
    prefixes:{ workflowId:'WF', ledgerTransactionId:'TX' },
    storage,
    persistenceKey,
  });

  const payload = { title:'secret-lunch-note', amountBaht:987.65 };
  const ids = await first.acquire(payload);
  first.markVerificationPending();

  const persisted = storage.dump(persistenceKey);
  assert.ok(persisted);
  assert.equal(persisted.includes('secret-lunch-note'), false);
  assert.equal(persisted.includes('987.65'), false);
  assert.match(persisted, /"verificationPending":true/);
  assert.match(persisted, /"payloadFingerprint":"sha256:[0-9a-f]{64}"/);
  assert.match(persisted, /"version":2/);

  const reopened = createStableMutationAttempt({
    createId:() => { throw new Error('restored retry must not mint new ids'); },
    prefixes:{ workflowId:'WF', ledgerTransactionId:'TX' },
    storage,
    persistenceKey,
  });
  assert.equal(reopened.snapshot().restored, true);
  assert.deepEqual(await reopened.acquire(payload), ids);
  await assert.rejects(() => reopened.acquire({ ...payload, amountBaht:1000 }), /LIGHTHOUSE_MUTATION_RETRY_PAYLOAD_LOCKED/);

  reopened.clear();
  assert.equal(storage.getItem(persistenceKey), null);
});

test('local reset cleanup removes only persisted MANUAL retry guards', async () => {
  const { MANUAL_MUTATION_ATTEMPT_PREFIX, clearStableMutationAttempts } = await load();
  const storage = localStorageLike();
  storage.setItem(`${MANUAL_MUTATION_ATTEMPT_PREFIX}expense`, '{}');
  storage.setItem(`${MANUAL_MUTATION_ATTEMPT_PREFIX}income`, '{}');
  storage.setItem('unrelated-key', 'keep');

  assert.equal(clearStableMutationAttempts({ storage }), 2);
  assert.equal(storage.getItem(`${MANUAL_MUTATION_ATTEMPT_PREFIX}expense`), null);
  assert.equal(storage.getItem(`${MANUAL_MUTATION_ATTEMPT_PREFIX}income`), null);
  assert.equal(storage.getItem('unrelated-key'), 'keep');
});

test('MANUAL surfaces assign persistent retry scopes instead of storing payload truth', () => {
  const fs = require('node:fs');
  const surface = fs.readFileSync(path.resolve(__dirname, '../lighthouse-next/surface-contract.mjs'), 'utf8');
  assert.match(surface, /MANUAL_MUTATION_ATTEMPT_PREFIX/);
  assert.match(surface, /persistenceKey:/);
  assert.match(surface, /receivable:\$\{item\.saleId\}:\$\{item\.queueId\}/);
  assert.match(surface, /obligation-pay:\$\{obligation\.recordId\}:\$\{queue\.recordId\}/);
  assert.match(surface, /calendar-reschedule:\$\{record\.recordId\}/);
  assert.match(surface, /ledger-reversal:\$\{transaction\.recordId\}/);
});


test('restored ambiguous ids reject a changed payload before any retry command is issued', async () => {
  const { MANUAL_MUTATION_ATTEMPT_PREFIX, createStableMutationAttempt } = await load();
  const storage = localStorageLike();
  let serial = 0;
  const persistenceKey = `${MANUAL_MUTATION_ATTEMPT_PREFIX}income`;
  const original = createStableMutationAttempt({
    createId:prefix => `${prefix}-${++serial}`,
    prefixes:{ workflowId:'WF', ledgerTransactionId:'TX' },
    storage,
    persistenceKey,
  });
  await original.acquire({ source:'งาน A', amountBaht:500 });
  original.markVerificationPending();

  const reopened = createStableMutationAttempt({
    createId:() => { throw new Error('must not mint a new id'); },
    prefixes:{ workflowId:'WF', ledgerTransactionId:'TX' },
    storage,
    persistenceKey,
  });
  await assert.rejects(
    () => reopened.acquire({ source:'งาน B', amountBaht:500 }),
    /LIGHTHOUSE_MUTATION_RETRY_PAYLOAD_LOCKED/,
  );
});
