function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function satang(value, code) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(code);
  return amount;
}

function command(workflowId, index, domain, type, payload, suffix) {
  return { commandId:`${workflowId}:${index}`, idempotencyKey:`${workflowId}:${suffix}`, domain, type, payload };
}

export function buildStoreIncomeWorkflow({ workflowId, storeIncomeId, ledgerTransactionId, title, amountSatang } = {}) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  storeIncomeId = text(storeIncomeId, 'INVALID_STORE_INCOME_ID');
  ledgerTransactionId = text(ledgerTransactionId, 'INVALID_LEDGER_TRANSACTION_ID');
  const normalizedTitle = text(title, 'INVALID_STORE_INCOME_TITLE');
  const amount = satang(amountSatang, 'INVALID_STORE_INCOME_AMOUNT');

  return {
    workflowId,
    commands:[
      command(workflowId, 1, 'STORE', 'STORE_CREATE_INCOME', { record:{
        recordId:storeIncomeId,
        type:'INCOME',
        title:normalizedTitle,
        amountSatang:amount,
        status:'COMPLETED',
      } }, `STORE:${storeIncomeId}`),
      command(workflowId, 2, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', {
        recordId:ledgerTransactionId,
        direction:'IN',
        amountSatang:amount,
        title:normalizedTitle,
        subtype:'STORE_INCOME',
        sourceRef:`STORE/${storeIncomeId}`,
      }, `LEDGER:${ledgerTransactionId}`),
    ],
  };
}
