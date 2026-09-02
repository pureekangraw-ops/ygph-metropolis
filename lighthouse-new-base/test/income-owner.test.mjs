import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncomeOwner } from '../src/income-owner.mjs';

function fakeRuntime() {
  const records = {};
  const goals = {};
  let revision = 0;
  return {
    async otherIncome({ ledgerTransactionId, title, amountSatang }) {
      revision += 1;
      records[ledgerTransactionId] = {
        record: {
          recordId: ledgerTransactionId,
          type: 'TRANSACTION',
          direction: 'IN',
          subtype: 'OTHER_INCOME',
          title,
          amountSatang,
        },
      };
    },
    async readState() {
      return { revision, domains: { LEDGER: { records } }, meta: { dailyGoals: goals } };
    },
    async ensureDailyGoal({ date, suggestedSatang }) {
      goals[date] ??= { date, goalSatang: suggestedSatang, source: 'AUTO' };
      return { status: 'CREATED', goal: structuredClone(goals[date]) };
    },
    async overrideDailyGoal({ date, goalSatang }) {
      goals[date] = { ...(goals[date] || { date }), goalSatang, source: 'MANUAL' };
      return { status: 'UPDATED', goal: structuredClone(goals[date]) };
    },
  };
}

test('Income records real incoming cash through Runtime and proves Ledger readback', async () => {
  const owner = createIncomeOwner({ runtime: fakeRuntime(), idFactory: () => 'income-1' });
  const result = await owner.addIncome({ title: 'Lalamove', amountSatang: 42000 });
  assert.equal(result.owner, 'income');
  assert.equal(result.readback.recordId, 'TX-INCOME-income-1');
  assert.equal(result.readback.direction, 'IN');
  assert.equal(result.readback.subtype, 'OTHER_INCOME');
  assert.equal(result.readback.amountSatang, 42000);
});

test('Income daily target changes goal metadata without creating money', async () => {
  const runtime = fakeRuntime();
  const owner = createIncomeOwner({ runtime, idFactory: () => 'goal-1' });
  await owner.ensureDailyTarget({ date: '2026-09-02', suggestedSatang: 100000 });
  const result = await owner.setDailyTarget({ date: '2026-09-02', goalSatang: 150000 });
  assert.equal(result.owner, 'income');
  assert.equal(result.goal.goalSatang, 150000);
  assert.equal(result.goal.source, 'MANUAL');
  const state = await runtime.readState();
  assert.deepEqual(state.domains.LEDGER.records, {});
});

test('Income refuses to claim success when the expected Ledger transaction is absent', async () => {
  const runtime = fakeRuntime();
  runtime.otherIncome = async () => {};
  const owner = createIncomeOwner({ runtime, idFactory: () => 'income-missing' });
  await assert.rejects(
    owner.addIncome({ title: 'Lalamove', amountSatang: 42000 }),
    /INCOME_READBACK_MISMATCH/,
  );
});
