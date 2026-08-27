const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');

const load = path => import(pathToFileURL(resolve(path)).href);

test('OUTCOME reaches existing runtime.expense with canonical fields', async () => {
  const { executeManualAppLanguage } = await load('foundation/manual-runtime.mjs');
  const calls = [];
  const runtime = { expense: async input => { calls.push(input); return { status:'OK' }; } };
  const result = await executeManualAppLanguage({
    runtime,
    appLanguage:{ version:'1', action:'CREATE', target:'OUTCOME', fields:{ title:'ข้าว', amountSatang:6500 } },
    makeId: prefix => `${prefix}-TEST`,
  });
  assert.equal(result.area, 'OUTCOME');
  assert.deepEqual(calls, [{ workflowId:'WF-OUTCOME-TEST', ledgerTransactionId:'TX-OUTCOME-TEST', title:'ข้าว', amountSatang:6500 }]);
});

test('INCOME reaches existing runtime.otherIncome', async () => {
  const { executeManualAppLanguage } = await load('foundation/manual-runtime.mjs');
  let input;
  const runtime = { otherIncome: async value => { input = value; return { status:'OK' }; } };
  await executeManualAppLanguage({
    runtime,
    appLanguage:{ version:'1', action:'CREATE', target:'INCOME', fields:{ title:'เงินคืน', amountSatang:50000 } },
    makeId: prefix => `${prefix}-TEST`,
  });
  assert.equal(input.amountSatang, 50000);
});

test('Foundation Manual areas remain surfaces, not new Greenfield domains', async () => {
  const { FOUNDATION_MANUAL_AREAS } = await load('foundation/manual-runtime.mjs');
  const { GREENFIELD_DOMAINS } = await load('greenfield/core.mjs');
  assert.deepEqual(FOUNDATION_MANUAL_AREAS.map(area => area.id), ['INCOME','OUTCOME','LEDGER','CALENDAR']);
  assert.deepEqual([...GREENFIELD_DOMAINS], ['STORE','LEDGER','CALENDAR','RIDE']);
});
