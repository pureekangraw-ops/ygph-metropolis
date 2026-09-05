const VERIFIED = new Set(['COMMITTED', 'RECOVERED', 'VERIFIED']);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

function requiredObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function expenseRequest(request) {
  const effect = request?.requiredResult?.effect;
  return request?.version === '1' &&
    request?.action === 'CREATE' &&
    request?.object === 'EXPENSE' &&
    request?.requiredResult?.kind === 'LEDGER_TRANSACTION' &&
    effect?.direction === 'OUT' &&
    effect?.subtype === 'EXPENSE' &&
    effect?.title === request?.fields?.title &&
    effect?.amountSatang === request?.fields?.amountSatang &&
    (effect?.businessDate ?? null) === (request?.fields?.businessDate ?? null);
}

function operationIds(requestId) {
  const id = String(requestId ?? '').trim();
  if (!REQUEST_ID_PATTERN.test(id)) throw new Error('CONFIRMED_LEDGER_INVALID_REQUEST_ID');
  return {
    workflowId:`WF-LH-${id}`,
    recordId:`TX-LH-${id}`,
  };
}

function verifiedResult(result) {
  if (!VERIFIED.has(result?.status)) {
    throw new Error(`CONFIRMED_LEDGER_MUTATION_NOT_VERIFIED:${result?.status ?? 'UNKNOWN'}`);
  }
  if (result.readback == null) throw new Error('CONFIRMED_LEDGER_READBACK_REQUIRED');
  return Object.freeze({ status:'SUCCESS', readback:structuredClone(result.readback) });
}

export function createConfirmedLedgerExecutor({ manual } = {}) {
  manual = requiredObject(manual, 'CONFIRMED_LEDGER_MANUAL_REQUIRED');
  if (typeof manual.addExpense !== 'function') throw new TypeError('CONFIRMED_LEDGER_ADD_EXPENSE_REQUIRED');

  return async function executeConfirmedLedgerRequest(request) {
    request = requiredObject(request, 'CONFIRMED_LEDGER_REQUEST_REQUIRED');
    if (!expenseRequest(request)) {
      throw new Error(`CONFIRMED_LEDGER_REQUEST_UNSUPPORTED:${String(request.action || 'UNKNOWN')}:${String(request.object || 'UNKNOWN')}`);
    }

    const { workflowId, recordId } = operationIds(request.requestId);
    const payload = {
      workflowId,
      recordId,
      title:String(request.fields.title),
      amountSatang:Number(request.fields.amountSatang),
      ...(request.fields.businessDate ? { businessDate:String(request.fields.businessDate) } : {}),
    };
    return verifiedResult(await manual.addExpense(payload));
  };
}
