const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');

const load = path => import(pathToFileURL(resolve(path)).href);

test('Manual Gate routes by target and keeps areas replaceable', async () => {
  const { createManualGate } = await load('foundation/manual-gate.mjs');
  const gate = createManualGate([
    { id:'INCOME', label:'Income' },
    { id:'OUTCOME', label:'Outcome' },
    { id:'LEDGER', label:'Ledger' },
    { id:'CALENDAR', label:'Calendar' },
  ]);
  assert.equal(gate.route({ version:'1', action:'CREATE', target:'OUTCOME', fields:{} }).id, 'OUTCOME');
  assert.deepEqual(gate.list().map(x => x.id), ['INCOME','OUTCOME','LEDGER','CALENDAR']);
});

test('Manual Gate reports an unknown destination without guessing', async () => {
  const { createManualGate } = await load('foundation/manual-gate.mjs');
  const gate = createManualGate([{ id:'OUTCOME', label:'Outcome' }]);
  assert.throws(() => gate.route({ target:'SAVING' }), /MANUAL_GATE_DESTINATION_NOT_FOUND:SAVING/);
});
