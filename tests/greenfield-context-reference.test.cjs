"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('record reference carries stable identity only and is immutable', async () => {
  const { createRecordReference } = await import('../greenfield/context-reference.mjs');

  const reference = createRecordReference({ version:1, owner:'LEDGER', recordId:'TX-1' });

  assert.deepEqual(reference, { version:1, owner:'LEDGER', recordId:'TX-1' });
  assert.equal(Object.isFrozen(reference), true);
});

test('record reference rejects copied truth and unsupported identity', async () => {
  const { createRecordReference } = await import('../greenfield/context-reference.mjs');

  assert.throws(
    () => createRecordReference({ version:1, owner:'LEDGER', recordId:'TX-1', amountSatang:6500 }),
    /CONTEXT_REFERENCE_INVALID/,
  );
  assert.throws(
    () => createRecordReference({ version:1, owner:'STORE', recordId:'SALE-1' }),
    /CONTEXT_REFERENCE_INVALID/,
  );
  assert.throws(
    () => createRecordReference({ version:1, owner:'LEDGER', recordId:'   ' }),
    /CONTEXT_REFERENCE_INVALID/,
  );
});

test('record reference resolves current truth from its exact owner', async () => {
  const { resolveRecordReference } = await import('../greenfield/context-reference.mjs');
  const records = {
    'LEDGER/TX-1':{ recordId:'TX-1', type:'TRANSACTION', status:'COMPLETED', amountSatang:6500 },
    'CALENDAR/TX-1':{ recordId:'TX-1', type:'TODO', status:'OPEN' },
  };
  const manual = { getRecord:async (owner, recordId) => structuredClone(records[`${owner}/${recordId}`] || null) };

  const resolved = await resolveRecordReference(manual, { version:1, owner:'LEDGER', recordId:'TX-1' });

  assert.deepEqual(resolved.reference, { version:1, owner:'LEDGER', recordId:'TX-1' });
  assert.equal(resolved.record.amountSatang, 6500);
  assert.equal(resolved.type, 'TRANSACTION');
  assert.equal(Object.isFrozen(resolved.record), true);
});

test('record reference fails closed when the exact owner cannot resolve it', async () => {
  const { resolveRecordReference } = await import('../greenfield/context-reference.mjs');
  const manual = { getRecord:async () => null };

  await assert.rejects(
    resolveRecordReference(manual, { version:1, owner:'CALENDAR', recordId:'TX-1' }),
    /CONTEXT_REFERENCE_NOT_FOUND/,
  );
});
