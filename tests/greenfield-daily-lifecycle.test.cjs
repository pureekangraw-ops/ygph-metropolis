"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function fixture() {
  return {
    schema:2, revision:7, commandLog:{}, meta:{dailyGoals:{'2026-08-18':{date:'2026-08-18',goalSatang:50000}}},
    domains:{
      STORE:{records:{S1:{record:{recordId:'S1',type:'SALE',totalSatang:30000,status:'COMPLETED',createdAt:'2026-08-18T03:00:00.000Z'}}}},
      RIDE:{records:{J1:{record:{recordId:'J1',type:'JOB',amountSatang:20000,paymentMode:'CREDIT',status:'COMPLETED',createdAt:'2026-08-18T04:00:00.000Z'}}}},
      LEDGER:{records:{
        I1:{record:{recordId:'I1',type:'TRANSACTION',direction:'IN',amountSatang:12000,status:'COMPLETED',createdAt:'2026-08-18T05:00:00.000Z'}},
        O1:{record:{recordId:'O1',type:'TRANSACTION',direction:'OUT',amountSatang:4000,status:'COMPLETED',createdAt:'2026-08-18T06:00:00.000Z'}},
        A1:{record:{recordId:'A1',type:'TRANSACTION',direction:'IN',amountSatang:99999,subtype:'BALANCE_ADJUSTMENT',status:'COMPLETED',createdAt:'2026-08-18T07:00:00.000Z'}},
        B1:{record:{recordId:'B1',type:'OBLIGATION',remainingSatang:70000,status:'OPEN'}}
      }},
      CALENDAR:{records:{}}
    }
  };
}

test('Bangkok day boundary changes at 00:00 Asia/Bangkok', async () => {
  const { bangkokDayKey } = await import('../greenfield/daily-lifecycle.mjs');
  assert.equal(bangkokDayKey('2026-08-18T16:59:59.999Z'),'2026-08-18');
  assert.equal(bangkokDayKey('2026-08-18T17:00:00.000Z'),'2026-08-19');
});

test('daily summary snapshots four daily metrics and current goal without counting balance adjustment', async () => {
  const { projectDailySummary } = await import('../greenfield/daily-lifecycle.mjs');
  const summary = projectDailySummary(fixture(),'2026-08-18',{closedAt:'2026-08-18T17:00:00.000Z'});
  assert.equal(summary.salesTodaySatang,30000);
  assert.equal(summary.rideGeneratedTodaySatang,20000);
  assert.equal(summary.incomeTodaySatang,12000);
  assert.equal(summary.expenseTodaySatang,4000);
  assert.equal(summary.dailyGoalSatang,50000);
  assert.equal(summary.goalProgressSatang,50000);
  assert.equal(summary.goalAchieved,true);
  assert.equal(summary.goalProgressPercent,100);
});

test('lifecycle bootstraps current day without inventing historical closes', async () => {
  const { applyDailyLifecycle } = await import('../greenfield/daily-lifecycle.mjs');
  const before = fixture();
  const result = applyDailyLifecycle(before,{now:'2026-08-18T10:00:00.000Z'});
  assert.equal(result.changed,true);
  assert.equal(result.state.meta.dailyLifecycle.activeDay,'2026-08-18');
  assert.equal(result.state.meta.dailyLifecycle.lastClosedDay,null);
  assert.deepEqual(result.state.meta.dailySummaries,{});
  assert.equal(result.state.domains.LEDGER.records.B1.record.remainingSatang,70000);
});

test('lifecycle catches up missed days exactly once and preserves outstanding state', async () => {
  const { applyDailyLifecycle } = await import('../greenfield/daily-lifecycle.mjs');
  const seeded = fixture();
  seeded.meta.dailyLifecycle={timeZone:'Asia/Bangkok',activeDay:'2026-08-18',lastClosedDay:null,updatedAt:'2026-08-18T10:00:00.000Z'};
  seeded.meta.dailySummaries={};
  const first = applyDailyLifecycle(seeded,{now:'2026-08-20T03:00:00.000Z'});
  assert.deepEqual(first.closedDays,['2026-08-18','2026-08-19']);
  assert.equal(first.state.meta.dailyLifecycle.lastClosedDay,'2026-08-19');
  assert.equal(first.state.meta.dailyLifecycle.activeDay,'2026-08-20');
  assert.equal(first.state.meta.dailySummaries['2026-08-18'].salesTodaySatang,30000);
  assert.equal(first.state.meta.dailySummaries['2026-08-19'].salesTodaySatang,0);
  assert.equal(first.state.domains.LEDGER.records.B1.record.remainingSatang,70000);
  const second = applyDailyLifecycle(first.state,{now:'2026-08-20T03:00:00.000Z'});
  assert.equal(second.changed,false);
  assert.deepEqual(second.closedDays,[]);
});
