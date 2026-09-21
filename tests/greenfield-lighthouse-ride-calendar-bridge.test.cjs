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


test('LIGHTHOUSE Ride map projection reads current job geography from RIDE owner without duplicating truth', async () => {
  const { createLighthouseLedgerBridge } = await import(bridgeUrl);
  const state = { revision:7, domains:{
    LEDGER:{records:{}},
    RIDE:{records:{
      R1:{record:{recordId:'R1',type:'ROUND',status:'ACTIVE',startedAt:'2026-09-21T10:00:00.000Z'}},
      J1:{record:{recordId:'J1',type:'JOB',roundId:'R1',status:'COMPLETED',createdAt:'2026-09-21T10:10:00.000Z',pickup:{lat:13.8732,lng:100.5961,label:'รับ'},dropoff:{lat:13.7563,lng:100.5018,address:'ส่ง'}}},
      J0:{record:{recordId:'J0',type:'JOB',roundId:'R1',status:'COMPLETED',createdAt:'2026-09-21T10:05:00.000Z'}},
    }},
    CALENDAR:{records:{}},
  }};
  const runtime = {
    async readState() { return state; },
    project() { return { ride:{todayRoundState:'ACTIVE',generatedSatang:0,cashJobSatang:0,creditJobSatang:0,expenseSatang:0,pendingCreditSatang:0} }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: async fn => fn(runtime),
    projectFinancial: () => ({todayInSatang:0,todayOutSatang:0}),
  });

  const map = await bridge.readRideMapTruth();
  assert.equal(map.revision, 7);
  assert.equal(map.roundId, 'R1');
  assert.equal(map.roundStatus, 'ACTIVE');
  assert.equal(map.jobCount, 2);
  assert.equal(map.currentJob.recordId, 'J1');
  assert.deepEqual(map.currentJob.pickup, {lat:13.8732,lng:100.5961,label:'รับ'});
  assert.deepEqual(map.currentJob.dropoff, {lat:13.7563,lng:100.5018,address:'ส่ง'});
  assert.equal(map.currentJob.hasGeography, true);
  assert.notEqual(map.currentJob.pickup, state.domains.RIDE.records.J1.record.pickup);
});

test('LIGHTHOUSE Ride map projection keeps legacy jobs valid when geography is absent', async () => {
  const { createLighthouseLedgerBridge } = await import(bridgeUrl);
  const state = { revision:8, domains:{
    LEDGER:{records:{}},
    RIDE:{records:{
      R1:{record:{recordId:'R1',type:'ROUND',status:'CLOSED',endedAt:'2026-09-21T11:00:00.000Z'}},
      J1:{record:{recordId:'J1',type:'JOB',roundId:'R1',status:'COMPLETED',createdAt:'2026-09-21T10:10:00.000Z'}},
    }},
    CALENDAR:{records:{}},
  }};
  const runtime = {
    async readState() { return state; },
    project() { return { ride:{todayRoundState:'COMPLETED',generatedSatang:0,cashJobSatang:0,creditJobSatang:0,expenseSatang:0,pendingCreditSatang:0} }; },
  };
  const bridge = createLighthouseLedgerBridge({ withSession: async fn => fn(runtime), projectFinancial: () => ({todayInSatang:0,todayOutSatang:0}) });
  const map = await bridge.readRideMapTruth();
  assert.equal(map.currentJob.recordId, 'J1');
  assert.equal(map.currentJob.pickup, null);
  assert.equal(map.currentJob.dropoff, null);
  assert.equal(map.currentJob.hasGeography, false);
});
