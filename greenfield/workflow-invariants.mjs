function recordsFor(state, domain) {
  return Object.values(state?.domains?.[domain]?.records || {}).map(entry => entry?.record).filter(Boolean);
}

function stockDelta(record) {
  if (!record || typeof record !== 'object' || record.status === 'CANCELLED') return 0;
  const quantity = Number(record.quantity || 0);
  if (!Number.isSafeInteger(quantity)) return 0;
  if (record.type === 'PURCHASE') return quantity;
  if (record.type === 'SALE' || record.type === 'STOCK_WITHDRAWAL') return -quantity;
  if (record.type === 'STOCK_ADJUSTMENT') return quantity;
  return 0;
}

function projectedStockBefore(state) {
  return recordsFor(state, 'STORE').reduce((sum, record) => sum + stockDelta(record), 0);
}

function plannedStoreDelta(commands) {
  let delta = 0;
  for (const command of commands) {
    if (command?.domain !== 'STORE' || command?.type !== 'STORE_CREATE_RECORD') continue;
    delta += stockDelta(command?.payload?.record);
  }
  return delta;
}

function activeProductIds(state) {
  return new Set(recordsFor(state, 'STORE')
    .filter(record => record?.type === 'PRODUCT' && record?.status === 'ACTIVE' && record?.productId)
    .map(record => String(record.productId)));
}

function plannedProductIds(commands) {
  const ids = new Set();
  for (const command of commands) {
    if (command?.domain !== 'STORE' || command?.type !== 'STORE_CREATE_PRODUCT') continue;
    const record = command?.payload?.record;
    const productId = String(record?.productId ?? record?.recordId ?? '').trim();
    if (productId) ids.add(productId);
  }
  return ids;
}

function productStockBefore(state) {
  const byProductId = new Map();
  for (const record of recordsFor(state, 'STORE')) {
    const productId = String(record?.productId || '').trim();
    if (!productId) continue;
    const delta = stockDelta(record);
    if (delta === 0) continue;
    byProductId.set(productId, (byProductId.get(productId) || 0) + delta);
  }
  return byProductId;
}

function validateProductStockInvariant(state, commands) {
  const known = activeProductIds(state);
  for (const productId of plannedProductIds(commands)) known.add(productId);
  const projected = productStockBefore(state);

  for (const command of commands) {
    if (command?.domain !== 'STORE' || command?.type !== 'STORE_CREATE_RECORD') continue;
    const record = command?.payload?.record;
    const productId = String(record?.productId || '').trim();
    if (!productId) continue;
    if (!known.has(productId)) throw new Error(`STORE_PRODUCT_NOT_FOUND:${productId}`);
    const delta = stockDelta(record);
    if (delta !== 0) projected.set(productId, (projected.get(productId) || 0) + delta);
  }

  for (const [productId, quantity] of projected) {
    if (quantity < 0) throw new Error(`STORE_PRODUCT_STOCK_UNDERFLOW:${productId}/${quantity}`);
  }
}

function plannedCalendarQueues(commands) {
  const queues = new Map();
  for (const command of commands) {
    if (command?.domain !== 'CALENDAR' || command?.type !== 'CALENDAR_CREATE_RECORD') continue;
    const record = command?.payload?.record;
    const id = String(record?.recordId ?? record?.id ?? '');
    if (id) queues.set(id, record);
  }
  return queues;
}

function calendarQueue(state, plannedQueues, queueId) {
  return state?.domains?.CALENDAR?.records?.[queueId]?.record ?? plannedQueues.get(queueId) ?? null;
}

function paymentSourceCommands(commands) {
  return commands.filter(command =>
    (command?.domain === 'STORE' && command?.type === 'STORE_APPLY_RECEIVABLE_PAYMENT') ||
    (command?.domain === 'LEDGER' && command?.type === 'LEDGER_APPLY_OBLIGATION_PAYMENT')
  );
}

function expectedQueueRelation(command) {
  if (command.domain === 'STORE') {
    return { owner:'STORE', recordId:String(command?.payload?.recordId || ''), types:new Set(['RECEIVE_CUSTOMER_PAYMENT']) };
  }
  return { owner:'LEDGER', recordId:String(command?.payload?.recordId || ''), types:new Set(['PAY_OBLIGATION', 'PAY_OBLIGATION_INSTALLMENT']) };
}

function obligationPlanOwnsQueue(state, obligationId, queueId) {
  const obligation = state?.domains?.LEDGER?.records?.[obligationId]?.record;
  return obligation?.type === 'OBLIGATION' && Array.isArray(obligation.installmentPlan) && obligation.installmentPlan.some(item => String(item?.queueId || '') === queueId);
}

function relationMatches(state, queue, source, queueId) {
  if (!source.types.has(queue.type)) return false;
  const expectedDetail = `${source.owner}/${source.recordId}`;
  const detail = String(queue.detail || '').trim();
  if (detail) return detail === expectedDetail;
  if (source.owner === 'LEDGER') return obligationPlanOwnsQueue(state, source.recordId, queueId);
  return false;
}

function validatePaymentRelations(state, commands) {
  const calendarPayments = commands.filter(command => command?.domain === 'CALENDAR' && command?.type === 'CALENDAR_APPLY_PAYMENT');
  if (calendarPayments.length === 0) return;

  const sources = paymentSourceCommands(commands);
  if (calendarPayments.length !== 1 || sources.length !== 1) throw new Error('WORKFLOW_PAYMENT_RELATION_AMBIGUOUS');

  const plannedQueues = plannedCalendarQueues(commands);
  const source = expectedQueueRelation(sources[0]);
  const queueId = String(calendarPayments[0]?.payload?.recordId || '');
  const queue = calendarQueue(state, plannedQueues, queueId);
  if (!queue) throw new Error(`WORKFLOW_QUEUE_NOT_FOUND:${queueId}`);
  const expectedDetail = `${source.owner}/${source.recordId}`;
  if (!relationMatches(state, queue, source, queueId)) throw new Error(`WORKFLOW_QUEUE_SOURCE_MISMATCH:${queueId}/${expectedDetail}`);
}

function ledgerSubtype(record) {
  const explicit = String(record?.subtype || '').trim();
  if (explicit) return explicit;
  const detail = String(record?.detail || '');
  const separator = detail.indexOf(':');
  return separator >= 0 ? detail.slice(separator + 1) : '';
}

function validateVerifiedExpenseRelation(state, commands) {
  const ledgerWrites = commands.filter(command =>
    command?.domain === 'LEDGER' &&
    command?.type === 'LEDGER_CREATE_TRANSACTION' &&
    command?.payload?.subtype === 'VERIFIED_EXPENSE'
  );
  if (ledgerWrites.length === 0) return;
  const completions = commands.filter(command =>
    command?.domain === 'CALENDAR' &&
    command?.type === 'CALENDAR_SET_STATUS' &&
    command?.payload?.status === 'COMPLETED'
  );
  if (ledgerWrites.length !== 1 || completions.length > 1) throw new Error('WORKFLOW_VERIFIED_EXPENSE_RELATION_AMBIGUOUS');

  const sourceRef = String(ledgerWrites[0]?.payload?.sourceRef || '');
  const match = /^CALENDAR\/(.+)$/.exec(sourceRef);
  const queueId = String(match?.[1] || '');
  if (!queueId) throw new Error(`WORKFLOW_VERIFIED_EXPENSE_SOURCE_MISMATCH:${queueId}/${sourceRef}`);
  if (completions.length === 1 && String(completions[0]?.payload?.recordId || '') !== queueId) {
    throw new Error(`WORKFLOW_VERIFIED_EXPENSE_SOURCE_MISMATCH:${String(completions[0]?.payload?.recordId || '')}/${sourceRef}`);
  }

  const queue = state?.domains?.CALENDAR?.records?.[queueId]?.record;
  if (!queue) throw new Error(`WORKFLOW_QUEUE_NOT_FOUND:${queueId}`);
  const amount = Number(queue.amountSatang ?? 0);
  if (queue.type !== 'VERIFY' || String(queue.ownerRef || '').toUpperCase() !== 'LEDGER' || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`WORKFLOW_VERIFIED_EXPENSE_QUEUE_INVALID:${queueId}`);
  }
  if (completions.length === 0 && queue.status !== 'COMPLETED') {
    throw new Error(`WORKFLOW_VERIFIED_EXPENSE_COMPLETION_REQUIRED:${queueId}`);
  }
  if (completions.length === 1 && (queue.status === 'COMPLETED' || queue.status === 'CANCELLED')) {
    throw new Error(`WORKFLOW_VERIFIED_EXPENSE_QUEUE_CLOSED:${queueId}/${queue.status}`);
  }

  const alreadyLinked = recordsFor(state, 'LEDGER').some(record =>
    record?.type === 'TRANSACTION' &&
    record?.direction === 'OUT' &&
    ledgerSubtype(record) === 'VERIFIED_EXPENSE' &&
    record?.sourceRef === `CALENDAR/${queueId}` &&
    record?.status !== 'REVERSED'
  );
  if (alreadyLinked) throw new Error(`WORKFLOW_VERIFIED_EXPENSE_ALREADY_RECORDED:${queueId}`);
}

function validateStockInvariant(state, commands) {
  const finalStock = projectedStockBefore(state) + plannedStoreDelta(commands);
  if (finalStock < 0) throw new Error(`STORE_STOCK_UNDERFLOW:${finalStock}`);
  validateProductStockInvariant(state, commands);
}

export function validateWorkflowInvariants(state, commands) {
  if (!state || typeof state !== 'object') throw new TypeError('INVALID_WORKFLOW_STATE');
  if (!Array.isArray(commands)) throw new TypeError('INVALID_WORKFLOW_COMMANDS');
  validatePaymentRelations(state, commands);
  validateVerifiedExpenseRelation(state, commands);
  validateStockInvariant(state, commands);
  return { status:'PASS' };
}
