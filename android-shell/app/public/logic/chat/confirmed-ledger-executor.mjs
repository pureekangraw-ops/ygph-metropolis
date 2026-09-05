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

function otherIncomeRequest(request) {
  const fields = request?.fields;
  const effect = request?.requiredResult?.effect;
  return request?.version === '1' &&
    request?.action === 'CREATE' &&
    request?.object === 'OTHER_INCOME' &&
    request?.requiredResult?.kind === 'LEDGER_TRANSACTION' &&
    effect?.owner === 'OTHER' &&
    effect?.direction === 'IN' &&
    effect?.subtype === 'OTHER_INCOME' &&
    effect?.title === fields?.title &&
    effect?.amountSatang === fields?.amountSatang &&
    Number.isSafeInteger(fields?.amountSatang) && fields.amountSatang > 0;
}

function storeIncomeRequest(request) {
  const fields = request?.fields;
  const effect = request?.requiredResult?.effect;
  return request?.version === '1' &&
    request?.action === 'CREATE' &&
    request?.object === 'STORE_INCOME' &&
    request?.requiredResult?.kind === 'STORE_INCOME_WITH_LEDGER' &&
    effect?.owner === 'STORE' &&
    effect?.ledgerDirection === 'IN' &&
    effect?.stockEffect === 'NONE' &&
    effect?.title === fields?.title &&
    effect?.amountSatang === fields?.amountSatang &&
    fields?.quantity == null &&
    Number.isSafeInteger(fields?.amountSatang) && fields.amountSatang > 0;
}

function storeSaleRequest(request) {
  const fields = request?.fields;
  const effect = request?.requiredResult?.effect;
  return request?.version === '1' &&
    request?.action === 'CREATE' &&
    request?.object === 'STORE_SALE' &&
    request?.requiredResult?.kind === 'STORE_SALE_WITH_LEDGER' &&
    effect?.owner === 'STORE' &&
    effect?.ledgerDirection === 'IN' &&
    effect?.title === fields?.title &&
    effect?.amountSatang === fields?.amountSatang &&
    effect?.quantity === fields?.quantity &&
    effect?.receivedSatang === fields?.receivedSatang &&
    Number.isSafeInteger(fields?.amountSatang) && fields.amountSatang > 0 &&
    Number.isSafeInteger(fields?.quantity) && fields.quantity > 0 &&
    Number.isSafeInteger(fields?.receivedSatang) && fields.receivedSatang > 0 &&
    fields.receivedSatang <= fields.amountSatang;
}

function rideJobRequest(request) {
  const fields = request?.fields;
  const effect = request?.requiredResult?.effect;
  return request?.version === '1' &&
    request?.action === 'CREATE' &&
    request?.object === 'RIDE_JOB' &&
    request?.requiredResult?.kind === 'RIDE_JOB_WITH_LEDGER' &&
    effect?.owner === 'RIDE' &&
    effect?.ledgerDirection === 'IN' &&
    effect?.amountSatang === fields?.amountSatang &&
    effect?.paymentMode === fields?.paymentMode &&
    typeof fields?.roundId === 'string' && fields.roundId.trim() &&
    Number.isSafeInteger(fields?.amountSatang) && fields.amountSatang > 0 &&
    fields?.paymentMode === 'CASH';
}

function supportedRequest(request) {
  if (expenseRequest(request)) return 'EXPENSE';
  if (otherIncomeRequest(request)) return 'OTHER_INCOME';
  if (storeIncomeRequest(request)) return 'STORE_INCOME';
  if (storeSaleRequest(request)) return 'STORE_SALE';
  if (rideJobRequest(request)) return 'RIDE_JOB';
  return null;
}

function operationIds(requestId) {
  const id = String(requestId ?? '').trim();
  if (!REQUEST_ID_PATTERN.test(id)) throw new Error('CONFIRMED_LEDGER_INVALID_REQUEST_ID');
  return {
    workflowId:`WF-LH-${id}`,
    recordId:`TX-LH-${id}`,
    ledgerTransactionId:`TX-LH-${id}`,
    storeIncomeId:`STORE-INCOME-LH-${id}`,
    saleId:`SALE-LH-${id}`,
    jobId:`JOB-LH-${id}`,
  };
}

function verifiedResult(result) {
  if (!VERIFIED.has(result?.status)) {
    throw new Error(`CONFIRMED_LEDGER_MUTATION_NOT_VERIFIED:${result?.status ?? 'UNKNOWN'}`);
  }
  if (result.readback == null) throw new Error('CONFIRMED_LEDGER_READBACK_REQUIRED');
  return Object.freeze({ status:'SUCCESS', readback:structuredClone(result.readback) });
}

export function preflightConfirmedLedgerRequest(request) {
  try {
    request = requiredObject(request, 'CONFIRMED_LEDGER_REQUEST_REQUIRED');
    operationIds(request.requestId);
    const object = supportedRequest(request);
    if (!object) {
      return Object.freeze({
        status:'BLOCKED',
        route:null,
        capabilityId:null,
        source:request?.source ?? null,
        reason:`CONFIRMED_LEDGER_REQUEST_UNSUPPORTED:${String(request.action || 'UNKNOWN')}:${String(request.object || 'UNKNOWN')}`,
      });
    }
    return Object.freeze({
      status:'READY',
      route:'LEDGER_GATEWAY',
      capabilityId:`CONFIRMED_LEDGER_${object}`,
      source:request?.source ?? null,
      reason:null,
    });
  } catch (error) {
    return Object.freeze({
      status:'BLOCKED',
      route:null,
      capabilityId:null,
      source:request?.source ?? null,
      reason:String(error?.message || error || 'CONFIRMED_LEDGER_PREFLIGHT_FAILED'),
    });
  }
}

export function createConfirmedLedgerExecutor({ manual } = {}) {
  manual = requiredObject(manual, 'CONFIRMED_LEDGER_MANUAL_REQUIRED');
  if (typeof manual.addExpense !== 'function') throw new TypeError('CONFIRMED_LEDGER_ADD_EXPENSE_REQUIRED');

  return async function executeConfirmedLedgerRequest(request) {
    request = requiredObject(request, 'CONFIRMED_LEDGER_REQUEST_REQUIRED');
    const ids = operationIds(request.requestId);

    if (expenseRequest(request)) {
      const payload = {
        workflowId:ids.workflowId,
        recordId:ids.recordId,
        title:String(request.fields.title),
        amountSatang:Number(request.fields.amountSatang),
        ...(request.fields.businessDate ? { businessDate:String(request.fields.businessDate) } : {}),
      };
      return verifiedResult(await manual.addExpense(payload));
    }

    if (otherIncomeRequest(request)) {
      if (typeof manual.addIncome !== 'function') throw new TypeError('CONFIRMED_LEDGER_ADD_INCOME_REQUIRED');
      return verifiedResult(await manual.addIncome({
        workflowId:ids.workflowId,
        recordId:ids.recordId,
        title:String(request.fields.title),
        amountSatang:Number(request.fields.amountSatang),
        ...(request.fields.businessDate ? { businessDate:String(request.fields.businessDate) } : {}),
      }));
    }

    if (storeIncomeRequest(request)) {
      if (typeof manual.storeIncome !== 'function') throw new TypeError('CONFIRMED_LEDGER_STORE_INCOME_REQUIRED');
      return verifiedResult(await manual.storeIncome({
        workflowId:ids.workflowId,
        storeIncomeId:ids.storeIncomeId,
        ledgerTransactionId:ids.ledgerTransactionId,
        title:String(request.fields.title),
        amountSatang:Number(request.fields.amountSatang),
      }));
    }

    if (storeSaleRequest(request)) {
      if (typeof manual.storeSale !== 'function') throw new TypeError('CONFIRMED_LEDGER_STORE_SALE_REQUIRED');
      return verifiedResult(await manual.storeSale({
        workflowId:ids.workflowId,
        saleId:ids.saleId,
        ledgerTransactionId:ids.ledgerTransactionId,
        title:String(request.fields.title),
        amountSatang:Number(request.fields.amountSatang),
        quantity:Number(request.fields.quantity),
        receivedSatang:Number(request.fields.receivedSatang),
        storeCostSatang:Number(request.fields.storeCostSatang ?? 0),
      }));
    }

    if (rideJobRequest(request)) {
      if (typeof manual.rideJob !== 'function') throw new TypeError('CONFIRMED_LEDGER_RIDE_JOB_REQUIRED');
      return verifiedResult(await manual.rideJob({
        workflowId:ids.workflowId,
        roundId:String(request.fields.roundId),
        jobId:ids.jobId,
        ledgerTransactionId:ids.ledgerTransactionId,
        amountSatang:Number(request.fields.amountSatang),
        paymentMode:'CASH',
        note:String(request.fields.note ?? ''),
      }));
    }

    throw new Error(`CONFIRMED_LEDGER_REQUEST_UNSUPPORTED:${String(request.action || 'UNKNOWN')}:${String(request.object || 'UNKNOWN')}`);
  };
}
