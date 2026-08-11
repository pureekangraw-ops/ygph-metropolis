const test = require('node:test');
const assert = require('node:assert/strict');
const metro = require('../metropolis-r5-5.js');

test('daily target progress uses store + ride earnings and pass-game thresholds', () => {
  const state = { store: { sales: [{ date:'2026-08-10', totalSatang:40000, status:'COMPLETED' }, { date:'2026-08-10', totalSatang:5000, status:'CANCELLED' }] }, ride: { jobs: [{ date:'2026-08-10', amountSatang:32000, status:'SETTLED' }] } };
  assert.equal(metro.r55DailyEarningsSatang(state, '2026-08-10'), 72000);
  assert.deepEqual(metro.r55DailyTargetProgress({ earnedSatang:72000, targetSatang:100000, passPercent:70 }), { percent:72, status:'PASS', passPercent:70, nearPercent:60, gapToPassSatang:0, gapToTargetSatang:28000 });
});

test('daily comparison reports change versus yesterday and avoids divide-by-zero fiction', () => {
  assert.equal(metro.r55PercentDelta(105000,90000),16.7);
  assert.equal(metro.r55PercentDelta(70000,100000),-30);
  assert.equal(metro.r55PercentDelta(50000,0),null);
});

test('end-day obligations rank overdue then due-soon then later and keep five', () => {
  const rows=[{id:'later',due:'2026-08-30',remainingSatang:10000},{id:'soon2',due:'2026-08-12',remainingSatang:10000},{id:'over2',due:'2026-08-08',remainingSatang:10000},{id:'soon1',due:'2026-08-11',remainingSatang:10000},{id:'over1',due:'2026-08-01',remainingSatang:10000},{id:'later2',due:'2026-09-01',remainingSatang:10000}];
  assert.deepEqual(metro.r55RankObligations(rows,'2026-08-10',7).map(x=>[x.id,x.bucket]), [['over1','OVERDUE'],['over2','OVERDUE'],['soon1','DUE_SOON'],['soon2','DUE_SOON'],['later','LATER']]);
});

test('payment preview subtracts selected obligations without mutating real balance', () => {
  assert.deepEqual(metro.r55PaymentPreview(400000,[{remainingSatang:150000},{remainingSatang:50000}]),{selectedSatang:200000,afterSatang:200000});
});

test('release layer is 4.2.5', () => {
  assert.equal(metro.METROPOLIS_425_PRODUCT_VERSION,'4.2.5');
});
