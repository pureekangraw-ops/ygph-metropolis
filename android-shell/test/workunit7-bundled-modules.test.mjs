import test from 'node:test';
import assert from 'node:assert/strict';
import { createBundledModuleServices } from '../app/public/logic/modules/bundled-module-services.mjs';

function fixture() {
  const calls = [];
  const manual = {
    addIncome: async input => (calls.push(['addIncome', input]), { status:'VERIFIED', readback:{ recordId:input.recordId, direction:'IN' } }),
    viewIncome: async () => [{ recordId:'IN-1', direction:'IN' }],
    incomeSummary: async () => ({ actualSatang:12000, target:null }),
    addExpense: async input => (calls.push(['addExpense', input]), { status:'VERIFIED', readback:{ recordId:input.recordId, direction:'OUT' } }),
    viewExpense: async () => [{ recordId:'OUT-1', direction:'OUT' }],
    outcomeSummary: async () => ({ actualSatang:3000, ceiling:null }),
    createCalendarItem: async input => (calls.push(['createCalendarItem', input]), { status:'VERIFIED', readback:{ recordId:input.recordId, status:'OPEN' } }),
    calendarToday: async () => [{ recordId:'CAL-1' }],
    calendarUpcoming: async () => [{ recordId:'CAL-2' }],
    calendarOverdue: async () => [],
    searchLedger: async input => (calls.push(['searchLedger', input]), [{ recordId:'LED-1' }]),
    ledgerSummary: async () => ({ incomeActualSatang:12000, expenseActualSatang:3000, netActualSatang:9000 }),
    dashboard: async () => ({ balanceSatang:9000 }),
    related: async (domain, recordId) => (calls.push(['related', domain, recordId]), [{ recordId:'REL-1' }]),
  };
  return { calls, services:createBundledModuleServices({ manual }) };
}

test('bundled module services expose Income Outcome Calendar and Ledger only once', () => {
  const { services } = fixture();
  assert.deepEqual(Object.keys(services).sort(), ['CALENDAR','INCOME','LEDGER','OUTCOME']);
});

test('Income and Outcome mutations delegate to Manual owner and return verified readback', async () => {
  const { calls, services } = fixture();
  assert.equal((await services.INCOME.add({ workflowId:'W1', recordId:'IN-2', title:'งาน', amountSatang:5000 })).status, 'VERIFIED');
  assert.equal((await services.OUTCOME.add({ workflowId:'W2', recordId:'OUT-2', title:'น้ำมัน', amountSatang:1000 })).status, 'VERIFIED');
  assert.deepEqual(calls.slice(0,2).map(item => item[0]), ['addIncome','addExpense']);
});

test('Calendar uses the same Manual calendar truth instead of a duplicate calendar owner', async () => {
  const { calls, services } = fixture();
  const snapshot = await services.CALENDAR.snapshot();
  assert.deepEqual(snapshot, { today:[{recordId:'CAL-1'}], upcoming:[{recordId:'CAL-2'}], overdue:[] });
  const result = await services.CALENDAR.add({ workflowId:'W3', recordId:'CAL-3', type:'TASK', title:'จ่ายบิล', dueDate:'2026-09-04' });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(calls.at(-1)[0], 'createCalendarItem');
});

test('Ledger exposes summary dashboard search and cross-module related records through Manual truth', async () => {
  const { calls, services } = fixture();
  assert.equal((await services.LEDGER.summary()).netActualSatang, 9000);
  assert.equal((await services.LEDGER.dashboard()).balanceSatang, 9000);
  assert.deepEqual(await services.LEDGER.search({ text:'งาน' }), [{ recordId:'LED-1' }]);
  assert.deepEqual(await services.LEDGER.related('STORE','SALE-1'), [{ recordId:'REL-1' }]);
  assert.deepEqual(calls.at(-1), ['related','STORE','SALE-1']);
});
