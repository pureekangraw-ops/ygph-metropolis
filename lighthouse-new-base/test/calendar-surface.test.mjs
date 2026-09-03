import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCalendarMonth, createCalendarSurface } from '../src/calendar-surface.mjs';

function stateWithCalendar(records = {}) {
  return { domains:{ CALENDAR:{ records } } };
}

test('Calendar month is a read-only 42-cell projection and keeps Outcome as obligation owner', () => {
  const state = stateWithCalendar({
    'Q-10': { record:{ recordId:'Q-10', type:'PAY_OBLIGATION_INSTALLMENT', detail:'LEDGER/OBL-1', title:'ค่าซ่อมห้อง', amountSatang:90000, dueDate:'2026-09-10', status:'OPEN' } },
    'TASK-12': { record:{ recordId:'TASK-12', type:'TASK', title:'โทรหาร้าน', dueDate:'2026-09-12', status:'OPEN' } },
  });

  const before = JSON.stringify(state);
  const month = projectCalendarMonth(state, { year:2026, month:9 });

  assert.equal(month.cells.length, 42);
  const day10 = month.cells.find(cell => cell.date === '2026-09-10');
  assert.equal(day10.items.length, 1);
  assert.equal(day10.items[0].recordId, 'Q-10');
  assert.equal(day10.items[0].owner, 'outcome');
  assert.equal(day10.items[0].sourceRecord, state.domains.CALENDAR.records['Q-10'].record);

  const day12 = month.cells.find(cell => cell.date === '2026-09-12');
  assert.equal(day12.items[0].owner, null);
  assert.equal(JSON.stringify(state), before);
});

test('Calendar obligation payment routes back to Outcome and never becomes a second money owner', async () => {
  const calls = [];
  const outcomeOwner = {
    async payObligation(input) {
      calls.push(input);
      return { owner:'outcome', kind:'obligation-payment', calendar:{ recordId:input.queueId, status:'COMPLETED' } };
    },
  };
  const surface = createCalendarSurface({ outcomeOwner });

  const result = await surface.pay({
    item:{ recordId:'Q-10', type:'PAY_OBLIGATION_INSTALLMENT', owner:'outcome' },
    amountSatang:90000,
  });

  assert.deepEqual(calls, [{ queueId:'Q-10', amountSatang:90000 }]);
  assert.equal(result.owner, 'outcome');
  assert.equal(result.calendar.recordId, 'Q-10');
});

test('Calendar fails closed when source owner is not proven instead of guessing an action route', async () => {
  const surface = createCalendarSurface({ outcomeOwner:{ async payObligation(){ throw new Error('MUST_NOT_CALL'); } } });
  await assert.rejects(
    surface.pay({ item:{ recordId:'UNKNOWN', type:'TASK', owner:null }, amountSatang:100 }),
    /CALENDAR_SOURCE_OWNER_UNPROVEN/,
  );
});
