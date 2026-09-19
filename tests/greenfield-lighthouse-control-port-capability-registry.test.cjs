const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const moduleUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/control-port/capability-registry.mjs')).href;

test('LIGHTHOUSE Hub capability registry is fail-closed around derived truth and secrets', async () => {
  const registry = await import(moduleUrl);
  const all = registry.listLighthouseCapabilities();

  assert.ok(all.length > 0);
  assert.equal(new Set(all.map(item => item.id)).size, all.length);

  for (const item of all) {
    assert.equal(typeof item.readable, 'boolean');
    assert.equal(typeof item.editable, 'boolean');
    assert.ok(item.owner);
    if (item.editable) assert.ok(item.action);
    else assert.equal(item.action, null);
    if (item.readable) assert.ok(item.readback);
    if (item.derived) assert.equal(item.editable, false);
  }

  assert.equal(registry.getLighthouseCapability('finance.balance').editable, false);
  assert.equal(registry.getLighthouseCapability('finance.balance').action, null);

  for (const id of ['security.pin', 'security.recoveryCode', 'security.vault']) {
    const item = registry.getLighthouseCapability(id);
    assert.equal(item.readable, false);
    assert.equal(item.editable, false);
    assert.equal(item.action, null);
    assert.equal(item.readback, null);
  }
});

test('LIGHTHOUSE Hub first mutation set maps only to existing owner-safe bridge actions', async () => {
  const registry = await import(moduleUrl);
  const expected = {
    'finance.dailyGoal':'setDailyGoal',
    'finance.income.create':'recordOtherIncome',
    'finance.expense.create':'recordExpense',
    'finance.obligation.create':'createObligation',
    'finance.obligation.dueDate':'rescheduleCalendar',
    'finance.obligation.payment':'payObligation',
    'finance.receivable.payment':'receiveReceivablePayment',
    'store.product.create':'createProductWithStock',
    'store.stock.add':'addProductStock',
  };

  for (const [id, action] of Object.entries(expected)) {
    const capability = registry.getLighthouseCapability(id);
    assert.equal(capability.editable, true, id);
    assert.equal(capability.action, action, id);
  }
});


test('Centre Board capabilities are exposed without device confirmation and remain owner-scoped', async () => {
  const registry = await import(moduleUrl);
  const read = registry.getLighthouseCapability('centreBoard.read');
  assert.equal(read.readable, true);
  assert.equal(read.editable, false);
  assert.equal(read.owner, 'LIGHTHOUSE:CENTRE_BOARD');

  for (const [id, action] of [
    ['centreBoard.initialize','initializeBoard'],
    ['centreBoard.pin.create','createPin'],
    ['centreBoard.claim','claimPins'],
    ['centreBoard.return','returnPins'],
    ['centreBoard.recover','recoverEmergency'],
  ]) {
    const capability = registry.getLighthouseCapability(id);
    assert.equal(capability.editable, true, id);
    assert.equal(capability.owner, 'LIGHTHOUSE:CENTRE_BOARD', id);
    assert.equal(capability.action, action, id);
    assert.equal(capability.confirmationRequired, false, id);
    assert.equal(capability.readback, 'readBoard', id);
  }
});


test('board.* compatibility aliases resolve to the same Centre Board owner contract', async () => {
  const registry = await import(moduleUrl);
  const pairs = [
    ['board.read','centreBoard.read'],
    ['board.initialize','centreBoard.initialize'],
    ['pin.create','centreBoard.pin.create'],
    ['board.claim','centreBoard.claim'],
    ['board.return','centreBoard.return'],
    ['board.recover','centreBoard.recover'],
  ];
  for (const [alias, canonical] of pairs) {
    const left = registry.getLighthouseCapability(alias);
    const right = registry.getLighthouseCapability(canonical);
    assert.ok(left, alias);
    assert.equal(left.owner, right.owner, alias);
    assert.equal(left.readable, right.readable, alias);
    assert.equal(left.editable, right.editable, alias);
    assert.equal(left.action, right.action, alias);
    assert.equal(left.confirmationRequired, right.confirmationRequired, alias);
    assert.equal(left.readback, right.readback, alias);
  }
});
