"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');

function baseState(){return {schema:2,revision:1,domains:{STORE:{records:{}},LEDGER:{records:{O1:{record:{recordId:'O1',type:'OBLIGATION',remainingSatang:50000,status:'PARTIAL',installmentPlan:[{queueId:'Q1',amountSatang:30000,dueDate:'2026-08-17'}]}}}},CALENDAR:{records:{Q1:{record:{recordId:'Q1',type:'PAY_OBLIGATION_INSTALLMENT',detail:'LEDGER/O1',amountSatang:20000,paidSatang:10000,dueDate:'2026-08-17',status:'PARTIAL'}}}},RIDE:{records:{}}}};}

test('reconciliation permits Calendar installment remainder to differ from Ledger obligation exposure',async()=>{
  const {reconcileSystemState}=await import('../greenfield/system-reconciliation.mjs');
  const result=reconcileSystemState(baseState(),{ledgerBalanceSatang:100000,today:'2026-08-16'});
  assert.equal(result.errors.some(item=>/OBLIGATION.*MISMATCH/.test(item.code)),false);
  assert.equal(result.status,'PASS');
});

test('orphan money queue becomes VERIFY and is not silently repaired',async()=>{
  const {reconcileSystemState}=await import('../greenfield/system-reconciliation.mjs');
  const state=baseState();delete state.domains.LEDGER.records.O1;
  const before=structuredClone(state);
  const result=reconcileSystemState(state,{ledgerBalanceSatang:100000,today:'2026-08-16'});
  assert.equal(result.status,'VERIFY');
  assert.equal(result.warnings.some(item=>item.code==='CALENDAR_ACTION_VERIFY'),true);
  assert.deepEqual(state,before);
});

test('negative calculated stock is a hard reconciliation failure',async()=>{
  const {reconcileSystemState}=await import('../greenfield/system-reconciliation.mjs');
  const state=baseState();state.domains.STORE.records.S1={record:{recordId:'S1',type:'SALE',quantity:2,totalSatang:10000,status:'COMPLETED',createdAt:'2026-08-16T01:00:00Z'}};
  const result=reconcileSystemState(state,{ledgerBalanceSatang:0,today:'2026-08-16'});
  assert.equal(result.status,'FAIL');
  assert.equal(result.errors.some(item=>item.code==='STORE_STOCK_UNDERFLOW'),true);
});
