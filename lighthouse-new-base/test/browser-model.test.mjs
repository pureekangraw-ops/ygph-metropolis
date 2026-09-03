import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserModel } from '../src/browser-model.mjs';

function runtimeState() {
  return {
    domains:{
      LEDGER:{ records:{
        'TX-IN':{ record:{ recordId:'TX-IN', type:'TRANSACTION', direction:'IN', title:'วิ่งงาน', amountSatang:42000, createdAt:'2026-09-02T03:00:00.000Z' } },
        'TX-OUT':{ record:{ recordId:'TX-OUT', type:'TRANSACTION', direction:'OUT', title:'ข้าว', amountSatang:6500, createdAt:'2026-09-02T04:00:00.000Z' } },
      } },
      CALENDAR:{ records:{
        'Q-1':{ record:{ recordId:'Q-1', type:'PAY_OBLIGATION_INSTALLMENT', title:'ค่าซ่อมห้อง', dueDate:'2026-09-02', status:'OPEN' } },
      } },
      RIDE:{ records:{} },
    },
  };
}

test('browser model reads one real Runtime snapshot and projects current NEW BASE surfaces without mutation', async () => {
  let reads = 0;
  const runtime = { async readState(){ reads += 1; return runtimeState(); } };
  const dailyControls = { async getSpendingAllowance(date){ assert.equal(date, '2026-09-02'); return { date, allowanceSatang:10000 }; } };
  const model = createBrowserModel({ runtimeProvider:async operation => operation(runtime), dailyControls });

  const snapshot = await model.read({ date:'2026-09-02', year:2026, month:9 });

  assert.equal(reads, 1);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.manual.summary.moneyInSatang, 42000);
  assert.equal(snapshot.manual.summary.moneyOutSatang, 6500);
  assert.equal(snapshot.manual.summary.dueCount, 1);
  assert.equal(snapshot.income.cashInSatang, 42000);
  assert.equal(snapshot.outcome.spentSatang, 6500);
  assert.equal(snapshot.outcome.remainingSatang, 3500);
  assert.equal(snapshot.ledger.balanceSatang, 35500);
  assert.equal(snapshot.calendar.cells.length, 42);
});

test('browser model reports unavailable when Runtime session is locked instead of fabricating zero money', async () => {
  const locked = new Error('RUNTIME_SESSION_LOCKED');
  const model = createBrowserModel({
    runtimeProvider:async () => { throw locked; },
    dailyControls:{ async getSpendingAllowance(){ throw new Error('MUST_NOT_READ_CONTROLS'); } },
  });

  const snapshot = await model.read({ date:'2026-09-02', year:2026, month:9 });
  assert.deepEqual(snapshot, { available:false, reason:'locked' });
});

test('browser model propagates unexpected Runtime failures instead of disguising them as a locked session', async () => {
  const model = createBrowserModel({
    runtimeProvider:async () => { throw new Error('STORE_CORRUPT'); },
    dailyControls:{ async getSpendingAllowance(){ return null; } },
  });
  await assert.rejects(model.read({ date:'2026-09-02', year:2026, month:9 }), /STORE_CORRUPT/);
});
