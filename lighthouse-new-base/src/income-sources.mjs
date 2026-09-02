function requirePositiveSatang(value, code = 'INVALID_INCOME_AMOUNT') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(code);
  return amount;
}

function normalizeSubtype(record) {
  const explicit = String(record?.subtype || '').trim();
  if (explicit) return explicit;
  const detail = String(record?.detail || '');
  const split = detail.indexOf(':');
  return split >= 0 ? detail.slice(split + 1) : '';
}

function freezeRecord(record) {
  if (!record) return null;
  return Object.freeze({ ...record, subtype: normalizeSubtype(record) });
}

export function createIncomeSources({ runtime, idFactory } = {}) {
  if (!runtime) throw new Error('INCOME_SOURCES_RUNTIME_REQUIRED');
  if (typeof idFactory !== 'function') throw new Error('INCOME_SOURCES_ID_FACTORY_REQUIRED');

  return Object.freeze({
    async receiveDebtorPayment({ queueId, amountSatang } = {}) {
      const amount = requirePositiveSatang(amountSatang);
      const op = String(idFactory());
      const workflowId = `WF-INCOME-RCV-${op}`;
      const ledgerTransactionId = `TX-INCOME-RCV-${op}`;

      await runtime.receiveCustomerPayment({
        workflowId,
        queueId,
        ledgerTransactionId,
        amountSatang: amount,
      });

      const state = await runtime.readState();
      const record = state?.domains?.LEDGER?.records?.[ledgerTransactionId]?.record;
      if (!record || record.direction !== 'IN' || Number(record.amountSatang) !== amount) {
        throw new Error('INCOME_DEBTOR_READBACK_MISMATCH');
      }

      return Object.freeze({
        owner: 'income',
        kind: 'debtor-payment',
        cashIn: true,
        readback: freezeRecord(record),
      });
    },

    async recordRideIncome({ roundId, amountSatang, paymentMode, note = '' } = {}) {
      const amount = requirePositiveSatang(amountSatang);
      const mode = String(paymentMode || '').toUpperCase();
      if (mode !== 'CASH' && mode !== 'CREDIT') throw new Error('INVALID_RIDE_PAYMENT_MODE');

      const op = String(idFactory());
      const workflowId = `WF-INCOME-RIDE-${op}`;
      const jobId = `JOB-INCOME-${op}`;
      const ledgerTransactionId = `TX-INCOME-RIDE-${op}`;

      await runtime.rideJob({
        workflowId,
        roundId,
        jobId,
        ledgerTransactionId,
        amountSatang: amount,
        paymentMode: mode,
        note,
      });

      const state = await runtime.readState();
      const ride = state?.domains?.RIDE?.records?.[jobId]?.record;
      if (!ride || Number(ride.amountSatang) !== amount || ride.paymentMode !== mode) {
        throw new Error('INCOME_RIDE_READBACK_MISMATCH');
      }

      const ledger = state?.domains?.LEDGER?.records?.[ledgerTransactionId]?.record || null;
      if (mode === 'CASH') {
        if (!ledger || ledger.direction !== 'IN' || Number(ledger.amountSatang) !== amount) {
          throw new Error('INCOME_RIDE_CASH_READBACK_MISMATCH');
        }
      } else if (ledger) {
        throw new Error('INCOME_RIDE_CREDIT_CASH_LEAK');
      }

      return Object.freeze({
        owner: 'income',
        kind: 'ride-income',
        cashIn: mode === 'CASH',
        ride: Object.freeze({ ...ride }),
        ledger: freezeRecord(ledger),
      });
    },
  });
}
