const ACTIONABLE = new Set(['OPEN','PARTIAL']);
const OBLIGATION_TYPES = new Set(['PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT']);

function recordsFor(state, domain) {
  return Object.values(state?.domains?.[domain]?.records || {}).map(entry => entry?.record).filter(Boolean);
}

function explicitSource(queue) {
  const detail = String(queue?.detail || '').trim();
  const match = /^(STORE|LEDGER)\/(.+)$/.exec(detail);
  return match ? { owner:match[1], sourceId:match[2] } : null;
}

function obligationPlanClaimsQueue(obligation, queueId) {
  return obligation?.type === 'OBLIGATION' && Array.isArray(obligation.installmentPlan) && obligation.installmentPlan.some(item => String(item?.queueId || '') === String(queueId || ''));
}

function resolveObligationSource(state, queue) {
  const queueId = String(queue?.recordId || '');
  const obligations = recordsFor(state, 'LEDGER').filter(record => obligationPlanClaimsQueue(record, queueId));
  const explicit = explicitSource(queue);
  if (explicit && explicit.owner !== 'LEDGER') return { error:'SOURCE_OWNER_CONFLICT' };
  if (obligations.length > 1) return { error:'SOURCE_AMBIGUOUS' };
  if (obligations.length === 1) {
    const source = obligations[0];
    if (explicit && explicit.sourceId !== source.recordId) return { error:'SOURCE_RELATION_CONFLICT' };
    return { owner:'LEDGER', source };
  }
  if (!explicit) return { error:'SOURCE_NOT_FOUND' };
  const source = recordsFor(state, 'LEDGER').find(record => record?.recordId === explicit.sourceId && record?.type === 'OBLIGATION');
  return source ? { owner:'LEDGER', source } : { error:'SOURCE_NOT_FOUND' };
}

function resolveSaleSource(state, queue) {
  const explicit = explicitSource(queue);
  if (!explicit || explicit.owner !== 'STORE') return { error:explicit ? 'SOURCE_OWNER_CONFLICT' : 'SOURCE_NOT_FOUND' };
  const source = recordsFor(state, 'STORE').find(record => record?.recordId === explicit.sourceId && record?.type === 'SALE');
  return source ? { owner:'STORE', source } : { error:'SOURCE_NOT_FOUND' };
}

function remainingFor(source, owner) {
  if (owner === 'LEDGER') return Number(source?.remainingSatang ?? source?.amountSatang ?? 0);
  return Number(source?.outstandingSatang ?? Math.max(0, Number(source?.totalSatang ?? source?.amountSatang ?? 0) - Number(source?.receivedSatang ?? 0)));
}

export function resolveCalendarAction(state, queue) {
  if (!queue || typeof queue !== 'object' || !String(queue.recordId || '')) return { available:false, reason:'ACTION_RECORD_INVALID' };
  if (!ACTIONABLE.has(queue.status)) return { available:false, reason:'ACTION_NOT_OPEN' };

  if (OBLIGATION_TYPES.has(queue.type)) {
    const relation = resolveObligationSource(state, queue);
    if (relation.error) return { available:false, reason:relation.error };
    const queueRemaining = Number(queue.amountSatang ?? 0);
    const sourceRemaining = remainingFor(relation.source, relation.owner);
    if (!Number.isSafeInteger(queueRemaining) || queueRemaining <= 0 || !Number.isSafeInteger(sourceRemaining) || sourceRemaining <= 0) return { available:false, reason:'SOURCE_AMOUNT_INVALID' };
    return {
      available:true, kind:'PAY_OBLIGATION', owner:'LEDGER', sourceId:relation.source.recordId,
      method:'payObligation', maxAmountSatang:Math.min(queueRemaining, sourceRemaining), queueId:queue.recordId,
    };
  }

  if (queue.type === 'RECEIVE_CUSTOMER_PAYMENT') {
    const relation = resolveSaleSource(state, queue);
    if (relation.error) return { available:false, reason:relation.error };
    const queueRemaining = Number(queue.amountSatang ?? 0);
    const sourceRemaining = remainingFor(relation.source, relation.owner);
    if (!Number.isSafeInteger(queueRemaining) || queueRemaining <= 0 || !Number.isSafeInteger(sourceRemaining) || sourceRemaining <= 0) return { available:false, reason:'SOURCE_AMOUNT_INVALID' };
    return {
      available:true, kind:'RECEIVE_CUSTOMER_PAYMENT', owner:'STORE', sourceId:relation.source.recordId,
      method:'receiveCustomerPayment', maxAmountSatang:Math.min(queueRemaining, sourceRemaining), queueId:queue.recordId,
    };
  }

  return { available:true, kind:'COMPLETE_CALENDAR', owner:'CALENDAR', sourceId:queue.recordId, method:'calendarStatus', queueId:queue.recordId };
}

export function buildCalendarActionIntent(state, queue, amountSatang, { workflowId, transactionId } = {}) {
  const action = resolveCalendarAction(state, queue);
  if (!action.available) throw new Error(action.reason);
  if (action.kind === 'COMPLETE_CALENDAR') {
    return { method:'calendarStatus', input:{ workflowId, queueId:queue.recordId, status:'COMPLETED' } };
  }
  const amount = Number(amountSatang);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INVALID_PAYMENT_AMOUNT');
  if (amount > action.maxAmountSatang) throw new Error(`PAYMENT_OVER_REMAINING:${action.queueId}`);
  if (!String(workflowId || '') || !String(transactionId || '')) throw new Error('PAYMENT_ID_REQUIRED');
  if (action.kind === 'PAY_OBLIGATION') {
    return { method:action.method, input:{ workflowId, obligationId:action.sourceId, queueId:action.queueId, ledgerTransactionId:transactionId, amountSatang:amount } };
  }
  return { method:action.method, input:{ workflowId, saleId:action.sourceId, queueId:action.queueId, ledgerTransactionId:transactionId, amountSatang:amount } };
}
