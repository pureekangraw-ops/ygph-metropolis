function requirePositiveSatang(value, code = 'INVALID_OUTCOME_AMOUNT') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(code);
  return amount;
}

function requireNonNegativeSatang(value, code = 'INVALID_DAILY_SPENDING_ALLOWANCE') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(code);
  return amount;
}

function freezeRecord(record) {
  return record ? Object.freeze({ ...record }) : null;
}

export function createOutcomeOwner({ runtime, idFactory, dailyControls = null } = {}) {
  if (!runtime) throw new Error('OUTCOME_RUNTIME_REQUIRED');
  if (typeof idFactory !== 'function') throw new Error('OUTCOME_ID_FACTORY_REQUIRED');

  return Object.freeze({
    async addExpense({ title, amountSatang } = {}) {
      const amount = requirePositiveSatang(amountSatang);
      const op = String(idFactory());
      const workflowId = `WF-OUTCOME-EXP-${op}`;
      const ledgerTransactionId = `TX-OUTCOME-EXP-${op}`;

      await runtime.expense({ workflowId, ledgerTransactionId, title, amountSatang: amount });
      const state = await runtime.readState();
      const record = state?.domains?.LEDGER?.records?.[ledgerTransactionId]?.record;
      if (!record || record.direction !== 'OUT' || Number(record.amountSatang) !== amount) {
        throw new Error('OUTCOME_EXPENSE_READBACK_MISMATCH');
      }

      return Object.freeze({
        owner: 'outcome',
        kind: 'expense',
        cashOut: true,
        readback: freezeRecord(record),
      });
    },

    async addObligation({ title, totalSatang, installments } = {}) {
      const total = requirePositiveSatang(totalSatang, 'INVALID_OBLIGATION_TOTAL');
      const op = String(idFactory());
      const workflowId = `WF-OUTCOME-OBL-${op}`;
      const obligationId = `OBL-OUTCOME-${op}`;

      await runtime.obligation({ workflowId, obligationId, title, totalSatang: total, installments });
      const state = await runtime.readState();
      const obligation = state?.domains?.LEDGER?.records?.[obligationId]?.record;
      if (!obligation || obligation.type !== 'OBLIGATION' || Number(obligation.totalSatang) !== total) {
        throw new Error('OUTCOME_OBLIGATION_READBACK_MISMATCH');
      }

      const calendar = (installments || []).map(item => state?.domains?.CALENDAR?.records?.[item.queueId]?.record);
      if (calendar.some(record => !record)) {
        throw new Error('OUTCOME_OBLIGATION_CALENDAR_READBACK_MISMATCH');
      }

      return Object.freeze({
        owner: 'outcome',
        kind: 'obligation',
        cashOut: false,
        obligation: freezeRecord(obligation),
        calendar: Object.freeze(calendar.map(freezeRecord)),
      });
    },

    async recordRideExpense({ roundId, title, amountSatang } = {}) {
      const amount = requirePositiveSatang(amountSatang);
      const op = String(idFactory());
      const workflowId = `WF-OUTCOME-RIDE-${op}`;
      const expenseId = `EXP-OUTCOME-${op}`;
      const ledgerTransactionId = `TX-OUTCOME-RIDE-${op}`;

      await runtime.rideExpense({ workflowId, roundId, expenseId, ledgerTransactionId, title, amountSatang: amount });
      const state = await runtime.readState();
      const ride = state?.domains?.RIDE?.records?.[expenseId]?.record;
      const ledger = state?.domains?.LEDGER?.records?.[ledgerTransactionId]?.record;
      if (!ride || Number(ride.amountSatang) !== amount) {
        throw new Error('OUTCOME_RIDE_READBACK_MISMATCH');
      }
      if (!ledger || ledger.direction !== 'OUT' || Number(ledger.amountSatang) !== amount) {
        throw new Error('OUTCOME_RIDE_LEDGER_READBACK_MISMATCH');
      }

      return Object.freeze({
        owner: 'outcome',
        kind: 'ride-expense',
        cashOut: true,
        ride: freezeRecord(ride),
        ledger: freezeRecord(ledger),
      });
    },

    async payObligation({ queueId, amountSatang } = {}) {
      const amount = requirePositiveSatang(amountSatang);
      const op = String(idFactory());
      const workflowId = `WF-OUTCOME-PAY-${op}`;
      const ledgerTransactionId = `TX-OUTCOME-PAY-${op}`;

      await runtime.payObligation({ workflowId, queueId, ledgerTransactionId, amountSatang: amount });
      const state = await runtime.readState();
      const ledger = state?.domains?.LEDGER?.records?.[ledgerTransactionId]?.record;
      const calendar = state?.domains?.CALENDAR?.records?.[queueId]?.record;
      if (!ledger || ledger.direction !== 'OUT' || Number(ledger.amountSatang) !== amount) {
        throw new Error('OUTCOME_PAYMENT_READBACK_MISMATCH');
      }
      if (!calendar || !['PARTIAL', 'COMPLETED'].includes(calendar.status)) {
        throw new Error('OUTCOME_PAYMENT_CALENDAR_READBACK_MISMATCH');
      }

      return Object.freeze({
        owner: 'outcome',
        kind: 'obligation-payment',
        cashOut: true,
        ledger: freezeRecord(ledger),
        calendar: freezeRecord(calendar),
      });
    },

    async setDailySpendingAllowance({ date, allowanceSatang } = {}) {
      if (!dailyControls || typeof dailyControls.setSpendingAllowance !== 'function' || typeof dailyControls.getSpendingAllowance !== 'function') {
        throw new Error('OUTCOME_DAILY_CONTROLS_REQUIRED');
      }
      const allowance = requireNonNegativeSatang(allowanceSatang);
      await dailyControls.setSpendingAllowance({ date, allowanceSatang:allowance });
      const readback = await dailyControls.getSpendingAllowance(date);
      if (!readback || Number(readback.allowanceSatang) !== allowance) {
        throw new Error('OUTCOME_DAILY_SPENDING_ALLOWANCE_READBACK_MISMATCH');
      }
      return Object.freeze({
        owner:'outcome',
        kind:'daily-spending-allowance',
        allowance:Object.freeze({ ...readback }),
      });
    },
  });
}
