const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const viewUrl = pathToFileURL(path.join(process.cwd(), 'lighthouse-next', 'view-model.mjs')).href;

test('Ride and Calendar projections preserve unavailable empty and ready truth', async () => {
  const { READ_STATE, projectRideView, projectCalendarView } = await import(viewUrl);

  assert.equal(projectRideView(null).status, READ_STATE.UNAVAILABLE);
  assert.equal(projectRideView({recordCount:0,todayRoundState:'NOT_STARTED',generatedSatang:0,cashJobSatang:0,creditJobSatang:0,expenseSatang:0,pendingCreditSatang:0}).status, READ_STATE.EMPTY);
  const ride = projectRideView({recordCount:1,todayRoundState:'ACTIVE',generatedSatang:100,cashJobSatang:100,creditJobSatang:0,expenseSatang:0,pendingCreditSatang:0});
  assert.equal(ride.status, READ_STATE.READY);
  assert.equal(ride.generatedSatang, 100);

  assert.equal(projectCalendarView(null).status, READ_STATE.UNAVAILABLE);
  assert.equal(projectCalendarView({total:0,byStatus:{},records:[]}).status, READ_STATE.EMPTY);
  const source = {total:1,byStatus:{OPEN:1},records:[{recordId:'C1',title:'item',status:'OPEN'}]};
  const calendar = projectCalendarView(source);
  assert.equal(calendar.status, READ_STATE.READY);
  assert.deepEqual(calendar.records, source.records);
  assert.notEqual(calendar.records, source.records);
  assert.notEqual(calendar.records[0], source.records[0]);
});
