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

function calendarQueue(state, queueId) {
  return state?.domains?.CALENDAR?.records?.[queueId]?.record ?? null;
}

function paymentSourceCommands(commands) {
  return commands.filter(command =>
    (command?.domain === 'STORE' && command?.type === 'STORE_APPLY_RECEIVABLE_PAYMENT') ||
    (command?.domain === 'LEDGER' && command?.type === 'LEDGER_APPLY_OBLIGATION_PAYMENT')
  );
}

function expectedQueueRelation(command) {
  if (command.domain === 'STORE') {
    return {
      owner:'STORE',
      recordId:String(command?.payload?.recordId || ''),
      types:new Set(['RECEIVE_CUSTOMER_PAYMENT']),
    };
  }
  return {
    owner:'LEDGER',
    recordId:String(command?.payload?.recordId || ''),
    types:new Set(['PAY_OBLIGATION', 'PAY_OBLIGATION_INSTALLMENT']),
  };
}

function validatePaymentRelations(state, commands) {
  const calendarPayments = commands.filter(command => command?.domain === 'CALENDAR' && command?.type === 'CALENDAR_APPLY_PAYMENT');
  if (calendarPayments.length === 0) return;

  const sources = paymentSourceCommands(commands);
  if (sources.length !== calendarPayments.length) throw new Error('WORKFLOW_PAYMENT_RELATION_AMBIGUOUS');

  for (let index = 0; index < calendarPayments.length; index += 1) {
    const source = expectedQueueRelation(sources[index]);
    const queueId = String(calendarPayments[index]?.payload?.recordId || '');
    const queue = calendarQueue(state, queueId);
    if (!queue) continue;
    const expectedDetail = `${source.owner}/${source.recordId}`;
    if (!source.types.has(queue.type) || String(queue.detail || '') !== expectedDetail) {
      throw new Error(`WORKFLOW_QUEUE_SOURCE_MISMATCH:${queueId}/${expectedDetail}`);
    }
  }
}

function validateStockInvariant(state, commands) {
  const finalStock = projectedStockBefore(state) + plannedStoreDelta(commands);
  if (finalStock < 0) throw new Error(`STORE_STOCK_UNDERFLOW:${finalStock}`);
}

export function validateWorkflowInvariants(state, commands) {
  if (!state || typeof state !== 'object') throw new TypeError('INVALID_WORKFLOW_STATE');
  if (!Array.isArray(commands)) throw new TypeError('INVALID_WORKFLOW_COMMANDS');
  validatePaymentRelations(state, commands);
  validateStockInvariant(state, commands);
  return { status:'PASS' };
}
