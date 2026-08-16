"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function state() {
  return {
    schema:2, revision:1, commandLog:{}, meta:{},
    domains:{
      STORE:{records:{
        S1:{record:{recordId:'S1',type:'SALE',title:'ขายเชื่อ',totalSatang:100000,receivedSatang:20000,outstandingSatang:80000,quantity:1,status:'PARTIAL',createdAt:'2026-08-16T01:00:00.000Z'}},
      }},
      LEDGER:{records:{
        T1:{record:{recordId:'T1',type:'TRANSACTION',direction:'IN',amountSatang:20000,status:'COMPLETED',createdAt:'2026-08-16T01:00:00.000Z'}},
        O1:{record:{recordId:'O1',type:'OBLIGATION',title:'ค่าเช่า',totalSatang:60000,paidSatang:10000,remainingSatang:50000,status:'PARTIAL',installmentPlan:[{queueId:'Q1',amountSatang:30000,dueDate:'2026-08-17'},{queueId:'Q2',amountSatang:30000,dueDate:'2026-09-17'}]}},
      }},
      CALENDAR:{records:{
        R1:{record:{recordId:'R1',type:'RECEIVE_CUSTOMER_PAYMENT',title:'รับเงินลูกค้า',detail:'STORE/S1',amountSatang:80000,paidSatang:0,dueDate:'2026-08-20',status:'OPEN'}},
        Q1:{record:{recordId:'Q1',type:'PAY_OBLIGATION_INSTALLMENT',title:'จ่ายงวด',detail:'LEDGER/O1',amountSatang:20000,paidSatang:10000,dueDate:'2026-08-17',status:'PARTIAL'}},
        Q2:{record:{recordId:'Q2',type:'PAY_OBLIGATION_INSTALLMENT',title:'จ่ายงวด',detail:'LEDGER/O1',amountSatang:30000,paidSatang:0,dueDate:'2026-09-17',status:'OPEN'}},
      }},
      RIDE:{records:{
        J1:{record:{recordId:'J1',type:'JOB',paymentMode:'CASH',amountSatang:12000,status:'COMPLETED',createdAt:'2026-08-16T02:00:00.000Z'}},
      }},
    }
  };
}

test('calculation authority keeps Ledger cash separate from generated sale and receivable truth', async () => {
  const { projectCalculationAuthority } = await import('../greenfield/calculation-authority.mjs');
  const truth = projectCalculationAuthority(state(), { ledgerBalanceSatang:45000, today:'2026-08-16', nearDays:7 });
  assert.equal(truth.cash.balanceSatang, 45000);
  assert.equal(truth.cash.todayInSatang, 20000);
  assert.equal(truth.generated.storeSatang, 100000);
  assert.equal(truth.receivables.totalSatang, 80000);
  assert.equal(truth.obligations.remainingSatang, 50000);
  assert.equal(truth.calendar.nearTermDueSatang, 20000);
  assert.equal(truth.calendar.shortfallSatang, 0);
  assert.equal('safeToSpendSatang' in (truth.planning || {}), false);
});

test('shortfall is an informational comparison and does not mutate or redefine Ledger balance', async () => {
  const { projectCalculationAuthority } = await import('../greenfield/calculation-authority.mjs');
  const truth = projectCalculationAuthority(state(), { ledgerBalanceSatang:5000, today:'2026-08-16', nearDays:7 });
  assert.equal(truth.cash.balanceSatang, 5000);
  assert.equal(truth.calendar.nearTermDueSatang, 20000);
  assert.equal(truth.calendar.shortfallSatang, 15000);
});

test('Ride implementation presence is not promoted into current semantic cash ownership', async () => {
  const { projectCalculationAuthority } = await import('../greenfield/calculation-authority.mjs');
  const truth = projectCalculationAuthority(state(), { ledgerBalanceSatang:45000, today:'2026-08-16' });
  assert.equal(truth.semanticWarnings.includes('RIDE_OWNER_SCOPE_VERIFY'), true);
  assert.equal(truth.cash.balanceSatang, 45000);
});
