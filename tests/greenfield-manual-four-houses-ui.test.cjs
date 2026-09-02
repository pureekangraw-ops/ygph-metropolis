"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = path => readFile(join(root, path), 'utf8');

test('MANUAL Finance surface exposes only the missing lifecycle controls while reusing existing income expense obligation flows', async () => {
  const html = await read('index.html');
  const manualUi = await read('ui/manual-finance-ui.mjs');
  for (const id of [
    'incomeTargetForm','incomeTargetProgress','receivableForm','receivableList',
    'outcomeCeilingForm','outcomeCeilingProgress',
    'calendarItemForm','manualCalendarDetail',
    'ledgerSearchForm','ledgerSearchResults','ledgerDetail',
  ]) assert.match(manualUi, new RegExp(`["']${id}["']`), `missing mounted ${id}`);

  assert.match(html, /id="financeSchedule"/, 'Calendar list and selected-day surface stays Finance-hosted');
  assert.doesNotMatch(manualUi, /manualCalendarViews/, 'MANUAL must not create a second Calendar list');
  assert.match(html, /id="incomeForm"/);
  assert.match(html, /id="expenseForm"/);
  assert.match(html, /id="obligationForm"/);
  assert.doesNotMatch(`${html}\n${manualUi}`, /id="manualIncomeForm"|id="manualExpenseForm"|id="manualObligationForm"/, 'must reuse existing actual-money forms');
});

test('MANUAL UI is wired through the shared four-house facade instead of a second mutation engine', async () => {
  const app = await read('ui/app.mjs');
  const manualUi = await read('ui/manual-finance-ui.mjs');
  assert.match(app, /createManualFourHouses/);
  assert.match(app, /createManualFinanceUi/);
  assert.match(manualUi, /getManual/);
  assert.match(manualUi, /setTarget/);
  assert.match(manualUi, /setCeiling/);
  assert.match(manualUi, /createReceivable/);
  assert.match(manualUi, /receiveReceivable/);
  assert.match(manualUi, /createCalendarItem/);
  assert.match(manualUi, /searchLedger/);
  assert.match(manualUi, /history/);
  assert.match(manualUi, /related/);
  assert.match(manualUi, /refund/);
  assert.match(manualUi, /reverse/);
  assert.match(manualUi, /editLedgerMetadata/);
  assert.match(manualUi, /cancelExpected/);
  assert.doesNotMatch(manualUi, /createGreenfieldRuntime|createCommandRuntime|openGreenfieldRuntime/, 'UI must not own a second runtime');
});

test('MANUAL production modules are release-gated and offline-cached once wired', async () => {
  const pkg = await read('package.json');
  const manifest = await read('RELEASE_MANIFEST.json');
  const sw = await read('sw.js');
  for (const path of ['greenfield/manual-four-houses.mjs','ui/manual-finance-ui.mjs']) {
    assert.match(pkg, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(manifest, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(sw, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
