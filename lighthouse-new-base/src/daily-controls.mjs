function requireDate(value) {
  const date = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('INVALID_DAILY_CONTROL_DATE');
  const probe = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (probe.getUTCFullYear() !== Number(match[1]) || probe.getUTCMonth() !== Number(match[2]) - 1 || probe.getUTCDate() !== Number(match[3])) {
    throw new Error('INVALID_DAILY_CONTROL_DATE');
  }
  return date;
}

function requireAllowance(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('INVALID_DAILY_SPENDING_ALLOWANCE');
  return amount;
}

export function createMemoryDailyControls(initial = {}) {
  const allowances = new Map();
  for (const [key, value] of Object.entries(initial || {})) {
    const date = requireDate(value?.date || key);
    allowances.set(date, Object.freeze({ date, allowanceSatang:requireAllowance(value?.allowanceSatang) }));
  }

  return Object.freeze({
    async setSpendingAllowance({ date, allowanceSatang } = {}) {
      const key = requireDate(date);
      const record = Object.freeze({ date:key, allowanceSatang:requireAllowance(allowanceSatang) });
      allowances.set(key, record);
      return record;
    },
    async getSpendingAllowance(date) {
      const record = allowances.get(requireDate(date));
      return record ? Object.freeze({ ...record }) : null;
    },
  });
}
