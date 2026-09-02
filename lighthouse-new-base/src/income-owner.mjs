function ledgerSubtype(record) {
  const explicit = String(record?.subtype || '').trim();
  if (explicit) return explicit;
  const detail = String(record?.detail || '');
  const split = detail.indexOf(':');
  return split >= 0 ? detail.slice(split + 1) : '';
}

function requireMoney(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INVALID_INCOME_AMOUNT');
  return amount;
}

export function createIncomeOwner({ runtime, idFactory } = {}) {
  if (!runtime) throw new Error('INCOME_RUNTIME_REQUIRED');
  if (typeof idFactory !== 'function') throw new Error('INCOME_ID_FACTORY_REQUIRED');

  return Object.freeze({
    async addIncome({ title, amountSatang } = {}) {
      const amount = requireMoney(amountSatang);
      const operationId = String(idFactory());
      const workflowId = `WF-INCOME-${operationId}`;
      const ledgerTransactionId = `TX-INCOME-${operationId}`;

      await runtime.otherIncome({ workflowId, ledgerTransactionId, title, amountSatang: amount });
      const state = await runtime.readState();
      const record = state?.domains?.LEDGER?.records?.[ledgerTransactionId]?.record;
      if (!record || record.direction !== 'IN' || ledgerSubtype(record) !== 'OTHER_INCOME' || Number(record.amountSatang) !== amount) {
        throw new Error('INCOME_READBACK_MISMATCH');
      }

      return Object.freeze({
        owner: 'income',
        readback: Object.freeze({
          ...record,
          subtype: ledgerSubtype(record),
        }),
      });
    },

    async ensureDailyTarget(input) {
      const result = await runtime.ensureDailyGoal(input);
      return Object.freeze({ owner: 'income', goal: Object.freeze({ ...result.goal }) });
    },

    async setDailyTarget(input) {
      const result = await runtime.overrideDailyGoal(input);
      return Object.freeze({ owner: 'income', goal: Object.freeze({ ...result.goal }) });
    },
  });
}
