function expenseRequiredResult(request) {
  const effect = request?.requiredResult?.effect;
  return request?.action === 'CREATE' &&
    request?.object === 'EXPENSE' &&
    request?.requiredResult?.kind === 'LEDGER_TRANSACTION' &&
    effect?.direction === 'OUT' &&
    effect?.subtype === 'EXPENSE' &&
    effect?.title === request?.fields?.title &&
    effect?.amountSatang === request?.fields?.amountSatang;
}

function nextId(idFactory, prefix) {
  const value = idFactory(prefix);
  if (typeof value !== 'string' || !value.trim()) throw new Error('EXPENSE_CAPABILITY_INVALID_ID');
  return value.trim();
}

function ledgerRecord(state, recordId) {
  return state?.domains?.LEDGER?.records?.[recordId]?.record || null;
}

export function createExpenseCapability({ idFactory } = {}) {
  if (typeof idFactory !== 'function') throw new Error('EXPENSE_CAPABILITY_ID_FACTORY_REQUIRED');

  return Object.freeze({
    id:'EXPENSE_CREATE',

    matches(request) {
      return Boolean(expenseRequiredResult(request));
    },

    async execute({ request, runtime } = {}) {
      if (!expenseRequiredResult(request)) throw new Error('EXPENSE_CAPABILITY_REQUEST_MISMATCH');
      if (!runtime || typeof runtime.expense !== 'function' || typeof runtime.readState !== 'function') {
        throw new Error('EXPENSE_CAPABILITY_RUNTIME_INVALID');
      }

      const workflowId = nextId(idFactory, 'WF-LH');
      const ledgerTransactionId = nextId(idFactory, 'TX-LH');
      await runtime.expense({
        workflowId,
        ledgerTransactionId,
        title:request.fields.title,
        amountSatang:request.fields.amountSatang,
      });

      const state = await runtime.readState();
      const found = ledgerRecord(state, ledgerTransactionId);
      if (
        !found ||
        found.recordId !== ledgerTransactionId ||
        found.type !== 'TRANSACTION' ||
        found.direction !== 'OUT' ||
        found.subtype !== 'EXPENSE' ||
        found.title !== request.fields.title ||
        found.amountSatang !== request.fields.amountSatang
      ) {
        return Object.freeze({ evidenceStatus:'MISMATCH', reason:'LEDGER_READBACK_MISMATCH' });
      }

      return Object.freeze({
        evidenceStatus:'PROVEN',
        readback:Object.freeze({
          recordId:found.recordId,
          direction:found.direction,
          subtype:found.subtype,
          title:found.title,
          amountSatang:found.amountSatang,
          revision:state?.revision ?? null,
        }),
      });
    },
  });
}
