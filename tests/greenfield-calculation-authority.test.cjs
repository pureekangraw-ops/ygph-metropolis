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
        J2:{record:{recordId:'J2',type:'JOB',paymentMode:'CREDIT',amountSatang:8000,status:'COMPLETED',createdAt:'2026-08-16T03:00:00.000Z'}},
        W1:{record:{recordId:'W1',type:'CREDIT_WITHDRAWAL',amountSatang:3000,status:'COMPLETED',createdAt:'2026-08-16T04:00:00.000Z'}},
      }},
    }
  };
}

test('calculation authority separates generated activity from realized cash and future claims', async () => {
  const { projectCalculationAuthority } = await import('../greenfield/calculation-authority.mjs');
  const truth = projectCalculationAuthority(state(), { ledgerBalanceSatang:45000, today:'2026-08-16', nearDays:7 });
  assert.equal(truth.cash.balanceSatang, 45000);
  assert.equal(truth.cash.todayInSatang, 20000);
  assert.equal(truth.generated.storeSatang, 100000);
  assert.equal(truth.generated.rideSatang, 20000);
  assert.equal(truth.generated.totalSatang, 120000);
  assert.equal(truth.receivables.totalSatang, 80000);
  assert.equal(truth.ride.pendingCreditSatang, 5000);
  assert.equal(truth.obligations.remainingSatang, 50000);
  assert.equal(truth.planning.nearTermDueSatang, 20000);
  assert.equal(truth.planning.reservedNearTermSatang, 20000);
  assert.equal(truth.planning.safeToSpendSatang, 25000);
  assert.equal(truth.planning.shortfallSatang, 0);
});

test('safe-to-spend never becomes negative and shortfall is the uncovered near-term amount', async () => {
  const { projectCalculationAuthority } = await import('../greenfield/calculation-authority.mjs');
  const truth = projectCalculationAuthority(state(), { ledgerBalanceSatang:5000, today:'2026-08-16', nearDays:7 });
  assert.equal(truth.planning.safeToSpendSatang, 0);
  assert.equal(truth.planning.shortfallSatang, 15000);
});

test('generated credit is never silently counted as realized Ledger cash', async () => {
  const { projectCalculationAuthority } = await import('../greenfield/calculation-authority.mjs');
  const truth = projectCalculationAuthority(state(), { ledgerBalanceSatang:45000, today:'2026-08-16' });
  assert.notEqual(truth.generated.totalSatang, truth.cash.todayInSatang);
  assert.equal(truth.ride.pendingCreditSatang, 5000);
});
