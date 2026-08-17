"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('Calendar executable money buttons are gated by the state-aware action contract',()=>{
  const source=read('ui/app.mjs');
  assert.match(source,/resolveCalendarAction\(state,record\)/);
  assert.doesNotMatch(source,/paymentIntentForQueue/);
  assert.match(source,/action\.available/);
  assert.match(source,/action\.maxAmountSatang/);
});

test('Finance UI reads cash truth and does not present Ledger balance as spendable truth',()=>{
  const app=read('ui/app.mjs');
  const financeUi=read('ui/finance-ui.mjs');
  const shell=read('app.mjs');
  assert.match(app,/financeUi\.renderFinance\(context\)/);
  assert.match(financeUi,/view\.cashBalanceSatang/);
  assert.doesNotMatch(`${app}\n${financeUi}`,/finance\.spendableBalanceSatang/);
  assert.doesNotMatch(`${app}\n${financeUi}`,/view\.spendableBalanceSatang/);
  assert.match(shell,/เงินสดคงเหลือ/);
});

test('unproven Calendar money action renders a verify message rather than an executable payment action',()=>{
  const source=read('ui/app.mjs');
  assert.match(source,/else if\(!action\.available\)/);
  assert.match(source,/ต้องตรวจสอบรายการก่อนดำเนินการ/);
});
