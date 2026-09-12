const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const bridgeUrl = pathToFileURL(path.join(process.cwd(), 'lighthouse-next', 'runtime-ledger.mjs')).href;

test('LIGHTHOUSE bridge reads Ride and Calendar from the owner runtime', async () => {
  const { createLighthouseLedgerBridge } = await import(bridgeUrl);
  const state = { revision:3, domains:{
    LEDGER:{records:{}},
    RIDE:{records:{R1:{record:{recordId:'R1',type:'ROUND',status:'ACTIVE'}}}},
    CALENDAR:{records:{C1:{record:{recordId:'C1',title:'item',status:'OPEN',dueDate:'2026-09-12'}}}},
  }};
  const runtime = {
    async readState() { return state; },
    project() { return {
      ledgerBalanceSatang:0,
      ride:{todayRoundState:'ACTIVE',generatedSatang:100,cashJobSatang:100,creditJobSatang:0,expenseSatang:0,pendingCreditSatang:0},
      calendar:{total:1,byStatus:{OPEN:1}},
    }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: async fn => fn(runtime),
    projectFinancial: () => ({todayInSatang:0,todayOutSatang:0}),
  });
  const ride = await bridge.readRideTruth();
  assert.equal(ride.recordCount, 1);
  assert.equal(ride.generatedSatang, 100);
  const calendar = await bridge.readCalendarTruth();
  assert.equal(calendar.total, 1);
  assert.equal(calendar.records[0].recordId, 'C1');
  assert.notEqual(calendar.records[0], state.domains.CALENDAR.records.C1.record);
});
