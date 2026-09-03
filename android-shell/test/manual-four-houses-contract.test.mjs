import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualFourHouses } from '../app/public/logic/manual/manual-four-houses.mjs';

function stateWithCalendar(dueDate) {
  return {
    revision: 1,
    domains: {
      STORE: { records: {} },
      LEDGER: { records: {} },
      CALENDAR: { records: { q1: { record: { recordId:'q1', status:'OPEN', dueDate } } } },
      RIDE: { records: {} },
    },
  };
}

test('manual rejects unknown mutation status instead of treating it as success', async () => {
  const runtime = {
    async readState() { return stateWithCalendar('2026-09-03'); },
    async executeMultiGroupCommands() { return { status:'MYSTERY' }; },
  };
  const manual = createManualFourHouses(runtime, { todayProvider: () => '2026-09-03' });
  await assert.rejects(
    () => manual.createCalendarItem({ workflowId:'wf1', recordId:'q2', type:'VERIFY', title:'x', dueDate:'2026-09-03' }),
    /MANUAL_MUTATION_NOT_VERIFIED:MYSTERY/,
  );
});

test('manual calendar resolves today from provider on every call', async () => {
  let today = '2026-09-03';
  const runtime = {
    async readState() { return stateWithCalendar('2026-09-04'); },
    async executeMultiGroupCommands() { return { status:'VERIFIED' }; },
  };
  const manual = createManualFourHouses(runtime, { todayProvider: () => today });
  assert.equal((await manual.calendarUpcoming()).length, 1);
  today = '2026-09-04';
  assert.equal((await manual.calendarToday()).length, 1);
  assert.equal((await manual.calendarUpcoming()).length, 0);
});
