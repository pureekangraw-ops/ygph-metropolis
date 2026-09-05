function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function satang(value, code = 'INVALID_RIDE_AMOUNT') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(code);
  return amount;
}

function command(workflowId, index, domain, type, payload, suffix = type) {
  return { commandId:`${workflowId}:${index}`, idempotencyKey:`${workflowId}:${suffix}`, domain, type, payload };
}

export function buildRideStartRoundWorkflow({ workflowId, roundId }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  roundId = text(roundId, 'INVALID_RIDE_ROUND_ID');
  return { workflowId, commands:[command(workflowId, 1, 'RIDE', 'RIDE_START_ROUND', { roundId }, `RIDE:${roundId}:START`)] };
}

export function buildRideReplaceRoundWorkflow({ workflowId, activeRoundId, roundId }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  activeRoundId = text(activeRoundId, 'INVALID_ACTIVE_RIDE_ROUND_ID');
  roundId = text(roundId, 'INVALID_RIDE_ROUND_ID');
  if (activeRoundId === roundId) throw new Error(`RIDE_REPLACEMENT_SAME_ROUND:${roundId}`);
  return { workflowId, commands:[
    command(workflowId, 1, 'RIDE', 'RIDE_END_ROUND', { roundId:activeRoundId }, `RIDE:${activeRoundId}:END`),
    command(workflowId, 2, 'RIDE', 'RIDE_START_ROUND', { roundId }, `RIDE:${roundId}:START`),
  ] };
}

export function buildRideEndRoundWorkflow({ workflowId, roundId }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  roundId = text(roundId, 'INVALID_RIDE_ROUND_ID');
  return { workflowId, commands:[command(workflowId, 1, 'RIDE', 'RIDE_END_ROUND', { roundId }, `RIDE:${roundId}:END`)] };
}

export function buildRideJobWorkflow({ workflowId, roundId, jobId, ledgerTransactionId, amountSatang, paymentMode, note = '' }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  roundId = text(roundId, 'INVALID_RIDE_ROUND_ID');
  jobId = text(jobId, 'INVALID_RIDE_JOB_ID');
  const amount = satang(amountSatang);
  paymentMode = text(paymentMode, 'INVALID_RIDE_PAYMENT_MODE');
  if (paymentMode !== 'CASH' && paymentMode !== 'CREDIT') throw new Error(`INVALID_RIDE_PAYMENT_MODE:${paymentMode}`);
  const commands = [command(workflowId, 1, 'RIDE', 'RIDE_CREATE_JOB', { roundId, jobId, amountSatang:amount, paymentMode, note:String(note || '') }, `RIDE:${jobId}`)];
  if (paymentMode === 'CASH') {
    ledgerTransactionId = text(ledgerTransactionId, 'LEDGER_TRANSACTION_ID_REQUIRED');
    commands.push(command(workflowId, 2, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', {
      recordId:ledgerTransactionId, direction:'IN', amountSatang:amount, title:'รายได้วิ่งงาน', subtype:'RIDE_CASH', sourceRef:`RIDE/${jobId}`,
    }, `LEDGER:${ledgerTransactionId}`));
  }
  return { workflowId, commands };
}

export function buildRideExpenseWorkflow({ workflowId, roundId, expenseId, ledgerTransactionId, title, amountSatang }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  roundId = text(roundId, 'INVALID_RIDE_ROUND_ID');
  expenseId = text(expenseId, 'INVALID_RIDE_EXPENSE_ID');
  ledgerTransactionId = text(ledgerTransactionId, 'INVALID_LEDGER_TRANSACTION_ID');
  title = text(title, 'INVALID_RIDE_EXPENSE_TITLE');
  const amount = satang(amountSatang, 'INVALID_RIDE_EXPENSE_AMOUNT');
  return { workflowId, commands:[
    command(workflowId, 1, 'RIDE', 'RIDE_CREATE_EXPENSE', { roundId, expenseId, title, amountSatang:amount }, `RIDE:${expenseId}`),
    command(workflowId, 2, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', { recordId:ledgerTransactionId, direction:'OUT', amountSatang:amount, title, subtype:'RIDE_EXPENSE', sourceRef:`RIDE/${expenseId}` }, `LEDGER:${ledgerTransactionId}`),
  ] };
}

export function buildRideWithdrawCreditWorkflow({ workflowId, withdrawalId, ledgerTransactionId, amountSatang }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  withdrawalId = text(withdrawalId, 'INVALID_RIDE_WITHDRAWAL_ID');
  ledgerTransactionId = text(ledgerTransactionId, 'INVALID_LEDGER_TRANSACTION_ID');
  const amount = satang(amountSatang, 'INVALID_RIDE_WITHDRAWAL_AMOUNT');
  return { workflowId, commands:[
    command(workflowId, 1, 'RIDE', 'RIDE_WITHDRAW_CREDIT', { withdrawalId, amountSatang:amount }, `RIDE:${withdrawalId}`),
    command(workflowId, 2, 'LEDGER', 'LEDGER_CREATE_TRANSACTION', { recordId:ledgerTransactionId, direction:'IN', amountSatang:amount, title:'เบิกเครดิตงานวิ่ง', subtype:'RIDE_CREDIT_WITHDRAWAL', sourceRef:`RIDE/${withdrawalId}` }, `LEDGER:${ledgerTransactionId}`),
  ] };
}
