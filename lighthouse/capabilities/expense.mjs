const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

function expenseRequiredResult(request) {
  const effect = request?.requiredResult?.effect;
  const businessDate = request?.fields?.businessDate;
  const businessDateMatches = businessDate == null
    ? effect?.businessDate == null
    : effect?.businessDate === businessDate;
  return request?.action === 'CREATE' &&
    request?.object === 'EXPENSE' &&
    request?.requiredResult?.kind === 'LEDGER_TRANSACTION' &&
    effect?.direction === 'OUT' &&
    effect?.subtype === 'EXPENSE' &&
    effect?.title === request?.fields?.title &&
    effect?.amountSatang === request?.fields?.amountSatang &&
    businessDateMatches;
}

function operationIds(requestId) {
  if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error('EXPENSE_CAPABILITY_INVALID_REQUEST_ID');
  }
  return {
    workflowId:`WF-LH-${requestId}`,
    ledgerTransactionId:`TX-LH-${requestId}`,
  };
}

function duplicateError(error) {
  return String(error?.message || error || '').startsWith('DUPLICATE_COMMAND:');
}

function ledgerRecord(state, recordId) {
  return state?.domains?.LEDGER?.records?.[recordId]?.record || null;
}

function ledgerSubtype(record) {
  const explicit = String(record?.subtype || '').trim();
  if (explicit) return explicit;
  const detail = String(record?.detail || '');
  const separator = detail.indexOf(':');
  return separator >= 0 ? detail.slice(separator + 1) : '';
}

export function createExpenseCapability() {
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

      const { workflowId, ledgerTransactionId } = operationIds(request.requestId);
      const hasBusinessDate = request.fields.businessDate != null;
      try {
        await runtime.expense({
          workflowId,
          ledgerTransactionId,
          title:request.fields.title,
          amountSatang:request.fields.amountSatang,
          ...(hasBusinessDate ? { businessDate:request.fields.businessDate } : {}),
        });
      } catch (error) {
        if (!duplicateError(error)) throw error;
      }

      let state;
      try {
        state = await runtime.readState();
      } catch {
        return Object.freeze({ evidenceStatus:'UNVERIFIED', reason:'LEDGER_READBACK_UNAVAILABLE' });
      }

      const found = ledgerRecord(state, ledgerTransactionId);
      const subtype = ledgerSubtype(found);
      if (
        !found ||
        found.recordId !== ledgerTransactionId ||
        found.type !== 'TRANSACTION' ||
        found.direction !== 'OUT' ||
        subtype !== 'EXPENSE' ||
        found.title !== request.fields.title ||
        found.amountSatang !== request.fields.amountSatang ||
        (hasBusinessDate && found.businessDate !== request.fields.businessDate)
      ) {
        return Object.freeze({ evidenceStatus:'MISMATCH', reason:'LEDGER_READBACK_MISMATCH' });
      }

      return Object.freeze({
        evidenceStatus:'PROVEN',
        readback:Object.freeze({
          recordId:found.recordId,
          direction:found.direction,
          subtype,
          title:found.title,
          amountSatang:found.amountSatang,
          ...(hasBusinessDate ? { businessDate:found.businessDate } : {}),
          revision:state?.revision ?? null,
        }),
      });
    },
  });
}
