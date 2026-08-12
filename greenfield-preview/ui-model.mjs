export function parseBahtToSatang(value) {
  const input = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) throw new Error('INVALID_MONEY');
  const [whole, fraction = ''] = input.split('.');
  const satang = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(satang) || satang < 0) throw new Error('INVALID_MONEY');
  return satang;
}

export function formatSatang(value) {
  const amount = Number(value || 0);
  if (!Number.isSafeInteger(amount)) return '—';
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount / 100);
}

export function makeId(prefix = 'ID') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function sourceRef(queue, expectedOwner) {
  const detail = String(queue?.detail || '');
  const [owner, id] = detail.split('/', 2);
  if (owner !== expectedOwner || !id) throw new Error(`QUEUE_SOURCE_MISMATCH:${expectedOwner}`);
  return id;
}

export function paymentIntentForQueue(queue, amountSatang, { workflowId, transactionId }) {
  const amount = Number(amountSatang);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INVALID_PAYMENT_AMOUNT');
  if (queue?.type === 'RECEIVE_CUSTOMER_PAYMENT') {
    return { method: 'receiveCustomerPayment', input: { workflowId, saleId: sourceRef(queue, 'STORE'), queueId: queue.recordId, ledgerTransactionId: transactionId, amountSatang: amount } };
  }
  if (queue?.type === 'PAY_OBLIGATION' || queue?.type === 'PAY_OBLIGATION_INSTALLMENT') {
    return { method: 'payObligation', input: { workflowId, obligationId: sourceRef(queue, 'LEDGER'), queueId: queue.recordId, ledgerTransactionId: transactionId, amountSatang: amount } };
  }
  throw new Error('QUEUE_IS_NOT_MONEY_ACTION');
}

export function parseInstallments(value) {
  const lines = String(value ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('INSTALLMENTS_REQUIRED');
  return lines.map(line => {
    const match = /^(\d{4}-\d{2}-\d{2})\s*=\s*(\d+(?:\.\d{1,2})?)$/.exec(line);
    if (!match) throw new Error(`INVALID_INSTALLMENT:${line}`);
    return { queueId: null, amountSatang: parseBahtToSatang(match[2]), dueDate: match[1] };
  });
}

export function recordsFor(state, domain) {
  return Object.values(state?.domains?.[domain]?.records || {}).map(entry => entry?.record).filter(Boolean);
}

export function dashboard(state, projection) {
  const store = recordsFor(state, 'STORE');
  const calendar = recordsFor(state, 'CALENDAR');
  return { revision: Number(state?.revision || 0), ledgerBalanceSatang: Number(projection?.ledgerBalanceSatang || 0), storeRecords: store.length, calendarOpen: calendar.filter(record => record.status === 'OPEN').length };
}
