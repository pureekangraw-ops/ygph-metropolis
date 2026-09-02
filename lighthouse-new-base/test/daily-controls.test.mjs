import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDailyControls } from '../src/daily-controls.mjs';

test('วงเงินใช้จ่าย is stored per day inside NEW BASE controls and zero is valid', async () => {
  const controls = createMemoryDailyControls();

  const first = await controls.setSpendingAllowance({ date:'2026-09-02', allowanceSatang:50000 });
  assert.equal(first.date, '2026-09-02');
  assert.equal(first.allowanceSatang, 50000);

  const zero = await controls.setSpendingAllowance({ date:'2026-09-03', allowanceSatang:0 });
  assert.equal(zero.allowanceSatang, 0);
  assert.equal((await controls.getSpendingAllowance('2026-09-02')).allowanceSatang, 50000);
  assert.equal((await controls.getSpendingAllowance('2026-09-03')).allowanceSatang, 0);
});

test('changing one dayวงเงินใช้จ่าย does not move another day', async () => {
  const controls = createMemoryDailyControls({
    '2026-09-02': { date:'2026-09-02', allowanceSatang:50000 },
    '2026-09-03': { date:'2026-09-03', allowanceSatang:30000 },
  });

  await controls.setSpendingAllowance({ date:'2026-09-02', allowanceSatang:45000 });
  assert.equal((await controls.getSpendingAllowance('2026-09-02')).allowanceSatang, 45000);
  assert.equal((await controls.getSpendingAllowance('2026-09-03')).allowanceSatang, 30000);
});
