function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function satang(value, { allowZero = false, code = 'INVALID_AMOUNT' } = {}) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || (!allowZero && amount === 0)) throw new Error(code);
  return amount;
}

function signedSatang(value, code = 'INVALID_SIGNED_AMOUNT') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new Error(code);
  return amount;
}

function quantity(value) {
  const output = Number(value);
  if (!Number.isSafeInteger(output) || output <= 0) throw new Error('INVALID_QUANTITY');
  return output;
}

function isoDate(value) {
  const input = text(value, 'INVALID_DUE_DATE');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) throw new Error('INVALID_DUE_DATE');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw new Error('INVALID_DUE_DATE');
  return input;
}

function command(workflowId, index, domain, type, payload, suffix = type) {
  return { commandId: `${workflowId}:${index}`, idempotencyKey: `${workflowId}:${suffix}`, domain, type, payload };
}

export function buildSaleWorkflow({ workflowId, saleId, ledgerTransactionId, calendarQueueId, title, amountSatang, quantity: qty, receivedSatang = 0, storeCostSatang = 0, dueDate }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  saleId = text(saleId, 'INVALID_SALE_ID');
  const total = satang(amountSatang, { code: 'INVALID_SALE_AMOUNT' });
  const received = satang(receivedSatang, { allowZero: true, code: 'INVALID_RECEIVED_AMOUNT' });
  const storeCost = satang(storeCostSatang, { allowZero: true, code: 'INVALID_STORE_COST' });
  if (received > total) throw new Error('RECEIVED_OVER_TOTAL');
  const outstanding = total - received;
  const commands = [command(workflowId, 1, 'STORE', 'STORE_CREATE_RECORD', { record: {
    recordId: saleId, type: 'SALE', title: text(title, 'INVALID_SALE_TITLE'), amountSatang: total, totalSatang: total,
    receivedSatang: received, outstandingSatang: outstanding, storeCostSatang: storeCost, netIncomeSatang: received - storeCost,
    quantity: quantity(qty),
    status: outstanding === 0 ? 'COMPLETED' : received > 0 ? 'PARTIAL' : 'OPEN',
  } }, `STORE:${saleId}`)];
  if (received > 0) {
    ledgerTransactionId = text(ledgerTransactionId, 'LEDGER_TRANSACTION_ID_REQUIRED');
    commands.push(command(workflowId, commands.length + 1, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', {
      recordId: ledgerTransactionId, direction: 'IN', amountSatang: received, title: `รับเงิน ${title}`, subtype: 'SALE', sourceRef: `STORE/${saleId}`,
    }, `LEDGER:${ledgerTransactionId}`));
  }
  if (outstanding > 0) {
    calendarQueueId = text(calendarQueueId, 'CALENDAR_QUEUE_ID_REQUIRED');
    const due = isoDate(dueDate);
    commands.push(command(workflowId, commands.length + 1, 'CALENDAR', 'CALENDAR_CREATE_RECORD', { record: {
      recordId: calendarQueueId, type: 'RECEIVE_CUSTOMER_PAYMENT', title: 'รับเงินลูกค้า', detail: `STORE/${saleId}`,
      amountSatang: outstanding, paidSatang: 0, dueDate: due, status: 'OPEN',
    } }, `CALENDAR:${calendarQueueId}`));
  }
  return { workflowId, commands };
}

export function buildReceiveCustomerPaymentWorkflow({ workflowId, saleId, queueId, ledgerTransactionId, amountSatang }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  saleId = text(saleId, 'INVALID_SALE_ID');
  queueId = text(queueId, 'INVALID_QUEUE_ID');
  ledgerTransactionId = text(ledgerTransactionId, 'INVALID_LEDGER_TRANSACTION_ID');
  const amount = satang(amountSatang, { code: 'INVALID_PAYMENT_AMOUNT' });
  return { workflowId, commands: [
    command(workflowId, 1, 'STORE', 'STORE_APPLY_RECEIVABLE_PAYMENT', { recordId: saleId, amountSatang: amount }, `STORE:${saleId}:RECEIPT`),
    command(workflowId, 2, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', { recordId: ledgerTransactionId, direction: 'IN', amountSatang: amount, title: `รับชำระ ${saleId}`, subtype: 'SALE_RECEIPT', sourceRef: `STORE/${saleId}` }, `LEDGER:${ledgerTransactionId}`),
    command(workflowId, 3, 'CALENDAR', 'CALENDAR_APPLY_PAYMENT', { recordId: queueId, amountSatang: amount }, `CALENDAR:${queueId}:RECEIPT`),
  ] };
}

export function buildObligationWorkflow({ workflowId, obligationId, title, totalSatang, installments, detail = '' }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  obligationId = text(obligationId, 'INVALID_OBLIGATION_ID');
  const total = satang(totalSatang, { code: 'INVALID_OBLIGATION_TOTAL' });
  if (!Array.isArray(installments) || installments.length === 0) throw new Error('INSTALLMENTS_REQUIRED');
  const seen = new Set();
  const normalized = installments.map((item, index) => {
    const queueId = text(item.queueId, 'INVALID_QUEUE_ID');
    if (seen.has(queueId)) throw new Error(`DUPLICATE_QUEUE_ID:${queueId}`);
    seen.add(queueId);
    return { queueId, amountSatang: satang(item.amountSatang, { code: 'INVALID_INSTALLMENT_AMOUNT' }), dueDate: isoDate(item.dueDate), number: index + 1 };
  });
  const sum = normalized.reduce((acc, item) => acc + item.amountSatang, 0);
  if (sum !== total) throw new Error(`INSTALLMENT_TOTAL_MISMATCH:${sum}/${total}`);
  const commands = [command(workflowId, 1, 'LEDGER', 'LEDGER_CREATE_OBLIGATION', {
    recordId: obligationId, title: text(title, 'INVALID_OBLIGATION_TITLE'), detail: String(detail || ''), totalSatang: total,
    installmentCount: normalized.length, dueDate: normalized[0].dueDate, installmentPlan: normalized,
  }, `LEDGER:${obligationId}`)];
  for (const item of normalized) {
    commands.push(command(workflowId, commands.length + 1, 'CALENDAR', 'CALENDAR_CREATE_RECORD', { record: {
      recordId: item.queueId, type: normalized.length === 1 ? 'PAY_OBLIGATION' : 'PAY_OBLIGATION_INSTALLMENT',
      title: normalized.length === 1 ? 'จ่ายภาระ' : 'จ่ายงวดภาระ', detail: `LEDGER/${obligationId}`,
      amountSatang: item.amountSatang, paidSatang: 0, dueDate: item.dueDate, installmentCount: normalized.length,
      installmentNumber: item.number, status: 'OPEN',
    } }, `CALENDAR:${item.queueId}`));
  }
  return { workflowId, commands };
}

export function buildPayObligationWorkflow({ workflowId, obligationId, queueId, ledgerTransactionId, amountSatang }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  obligationId = text(obligationId, 'INVALID_OBLIGATION_ID');
  queueId = text(queueId, 'INVALID_QUEUE_ID');
  ledgerTransactionId = text(ledgerTransactionId, 'INVALID_LEDGER_TRANSACTION_ID');
  const amount = satang(amountSatang, { code: 'INVALID_PAYMENT_AMOUNT' });
  return { workflowId, commands: [
    command(workflowId, 1, 'LEDGER', 'LEDGER_APPLY_OBLIGATION_PAYMENT', { recordId: obligationId, amountSatang: amount }, `LEDGER:${obligationId}:PAYMENT`),
    command(workflowId, 2, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', { recordId: ledgerTransactionId, direction: 'OUT', amountSatang: amount, title: `ชำระ ${obligationId}`, subtype: 'OBLIGATION_PAYMENT', sourceRef: `LEDGER/${obligationId}` }, `LEDGER:${ledgerTransactionId}`),
    command(workflowId, 3, 'CALENDAR', 'CALENDAR_APPLY_PAYMENT', { recordId: queueId, amountSatang: amount }, `CALENDAR:${queueId}:PAYMENT`),
  ] };
}

export function buildPurchaseWorkflow({ workflowId, purchaseId, ledgerTransactionId, returnQueueId = null, title, amountSatang, quantity: qty, returnDueDate = null }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  purchaseId = text(purchaseId, 'INVALID_PURCHASE_ID');
  ledgerTransactionId = text(ledgerTransactionId, 'INVALID_LEDGER_TRANSACTION_ID');
  const amount = satang(amountSatang, { code: 'INVALID_PURCHASE_AMOUNT' });
  const commands = [
    command(workflowId, 1, 'STORE', 'STORE_CREATE_RECORD', { record: {
      recordId: purchaseId, type: 'PURCHASE', title: text(title, 'INVALID_PURCHASE_TITLE'), amountSatang: amount,
      quantity: quantity(qty), status: 'ACTIVE',
    } }, `STORE:${purchaseId}`),
    command(workflowId, 2, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', {
      recordId: ledgerTransactionId, direction: 'OUT', amountSatang: amount, title: `ซื้อ ${title}`, subtype: 'PURCHASE', sourceRef: `STORE/${purchaseId}`,
    }, `LEDGER:${ledgerTransactionId}`),
  ];
  if (returnQueueId != null || returnDueDate != null) {
    returnQueueId = text(returnQueueId, 'RETURN_QUEUE_ID_REQUIRED');
    const due = isoDate(returnDueDate);
    commands.push(command(workflowId, 3, 'CALENDAR', 'CALENDAR_CREATE_RECORD', { record: {
      recordId: returnQueueId, type: 'PURCHASE_RETURN_WINDOW', title: 'หน้าต่างคืนสินค้า', detail: `STORE/${purchaseId}`,
      amountSatang: 0, dueDate: due, status: 'OPEN',
    } }, `CALENDAR:${returnQueueId}`));
  }
  return { workflowId, commands };
}

export function buildStockWithdrawalWorkflow({ workflowId, recordId, title, quantity: qty }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  recordId = text(recordId, 'INVALID_RECORD_ID');
  return { workflowId, commands: [command(workflowId, 1, 'STORE', 'STORE_CREATE_RECORD', { record: {
    recordId, type: 'STOCK_WITHDRAWAL', title: text(title, 'INVALID_WITHDRAWAL_TITLE'), amountSatang: 0,
    quantity: quantity(qty), status: 'COMPLETED',
  } }, `STORE:${recordId}`)] };
}

export function buildStockAdjustmentWorkflow({ workflowId, recordId, title, deltaQuantity, reason }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  recordId = text(recordId, 'INVALID_RECORD_ID');
  const delta = Number(deltaQuantity);
  if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('INVALID_STOCK_ADJUSTMENT_DELTA');
  return { workflowId, commands: [command(workflowId, 1, 'STORE', 'STORE_CREATE_RECORD', { record: {
    recordId, type: 'STOCK_ADJUSTMENT', title: text(title, 'INVALID_ADJUSTMENT_TITLE'), detail: text(reason, 'INVALID_ADJUSTMENT_REASON'),
    reason: text(reason, 'INVALID_ADJUSTMENT_REASON'), amountSatang: null, quantity: delta, status: 'COMPLETED',
  } }, `STORE:${recordId}`)] };
}

export function buildBalanceAdjustmentWorkflow({ workflowId, ledgerTransactionId, currentBalanceSatang, targetBalanceSatang, reason = 'ปรับให้ตรงกับเงินจริง' }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  ledgerTransactionId = text(ledgerTransactionId, 'INVALID_LEDGER_TRANSACTION_ID');
  const before = signedSatang(currentBalanceSatang, 'INVALID_CURRENT_BALANCE');
  const after = satang(targetBalanceSatang, { allowZero: true, code: 'INVALID_TARGET_BALANCE' });
  if (before === after) throw new Error('BALANCE_ALREADY_MATCHES');
  const delta = after - before;
  return { workflowId, commands: [command(workflowId, 1, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', {
    recordId: ledgerTransactionId,
    direction: delta > 0 ? 'IN' : 'OUT',
    amountSatang: Math.abs(delta),
    title: 'ปรับฐานเงิน',
    subtype: 'BALANCE_ADJUSTMENT',
    sourceRef: 'LEDGER/BALANCE_RECONCILIATION',
    balanceBeforeSatang: before,
    balanceAfterSatang: after,
    adjustmentReason: text(reason, 'INVALID_BALANCE_ADJUSTMENT_REASON'),
  }, `LEDGER:${ledgerTransactionId}`)] };
}

export function buildOtherIncomeWorkflow({ workflowId, ledgerTransactionId, title, amountSatang }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  ledgerTransactionId = text(ledgerTransactionId, 'INVALID_LEDGER_TRANSACTION_ID');
  return { workflowId, commands: [command(workflowId, 1, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', {
    recordId: ledgerTransactionId, direction: 'IN', amountSatang: satang(amountSatang, { code: 'INVALID_INCOME_AMOUNT' }),
    title: text(title, 'INVALID_INCOME_TITLE'), subtype: 'OTHER_INCOME', sourceRef: 'LEDGER/MANUAL',
  }, `LEDGER:${ledgerTransactionId}`)] };
}

export function buildExpenseWorkflow({ workflowId, ledgerTransactionId, title, amountSatang }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  ledgerTransactionId = text(ledgerTransactionId, 'INVALID_LEDGER_TRANSACTION_ID');
  return { workflowId, commands: [command(workflowId, 1, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', {
    recordId: ledgerTransactionId, direction: 'OUT', amountSatang: satang(amountSatang, { code: 'INVALID_EXPENSE_AMOUNT' }),
    title: text(title, 'INVALID_EXPENSE_TITLE'), subtype: 'EXPENSE', sourceRef: 'LEDGER/MANUAL',
  }, `LEDGER:${ledgerTransactionId}`)] };
}

export function buildVerifiedExpenseWorkflow({ workflowId, queueId, ledgerTransactionId, title, amountSatang }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  queueId = text(queueId, 'INVALID_QUEUE_ID');
  ledgerTransactionId = text(ledgerTransactionId, 'INVALID_LEDGER_TRANSACTION_ID');
  const amount = satang(amountSatang, { code:'INVALID_EXPENSE_AMOUNT' });
  return { workflowId, commands: [
    command(workflowId, 1, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', {
      recordId:ledgerTransactionId,
      direction:'OUT',
      amountSatang:amount,
      title:text(title, 'INVALID_EXPENSE_TITLE'),
      subtype:'VERIFIED_EXPENSE',
      sourceRef:`CALENDAR/${queueId}`,
    }, `LEDGER:${ledgerTransactionId}`),
    command(workflowId, 2, 'CALENDAR', 'CALENDAR_SET_STATUS', { recordId:queueId, status:'COMPLETED' }, `CALENDAR:${queueId}:VERIFIED_EXPENSE`),
  ] };
}

export function buildCalendarRescheduleWorkflow({ workflowId, queueId, dueDate }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  queueId = text(queueId, 'INVALID_QUEUE_ID');
  const due = isoDate(dueDate);
  return { workflowId, commands: [command(workflowId, 1, 'CALENDAR', 'CALENDAR_RESCHEDULE', { recordId: queueId, dueDate: due }, `CALENDAR:${queueId}:RESCHEDULE:${due}`)] };
}

export function buildCalendarStatusWorkflow({ workflowId, queueId, status }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  queueId = text(queueId, 'INVALID_QUEUE_ID');
  status = text(status, 'INVALID_CALENDAR_STATUS');
  if (status !== 'COMPLETED' && status !== 'CANCELLED') throw new Error(`INVALID_CALENDAR_STATUS:${status}`);
  return { workflowId, commands: [command(workflowId, 1, 'CALENDAR', 'CALENDAR_SET_STATUS', { recordId: queueId, status }, `CALENDAR:${queueId}:${status}`)] };
}
