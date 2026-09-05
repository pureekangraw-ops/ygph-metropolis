function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function command(workflowId, index, domain, type, payload, suffix = type) {
  return { commandId:`${workflowId}:${index}`, idempotencyKey:`${workflowId}:${suffix}`, domain, type, payload };
}

function ownerCancellation(sourceRef) {
  const match = /^(STORE|RIDE)\/(.+)$/.exec(String(sourceRef || '').trim());
  if (!match) return null;
  const [, domain, recordId] = match;
  return {
    domain,
    type:domain === 'STORE' ? 'STORE_CANCEL_RECORD' : 'RIDE_CANCEL_RECORD',
    payload:{ recordId },
    suffix:`${domain}:${recordId}:CANCEL`,
  };
}

export function buildOwnerAwareReverseWorkflow({ workflowId, originalRecord, reversalRecordId, reason = '' } = {}) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  if (!originalRecord || typeof originalRecord !== 'object' || Array.isArray(originalRecord)) throw new Error('ORIGINAL_LEDGER_RECORD_REQUIRED');
  const originalRecordId = text(originalRecord.recordId, 'INVALID_ORIGINAL_LEDGER_RECORD_ID');
  reversalRecordId = text(reversalRecordId, 'INVALID_REVERSAL_LEDGER_RECORD_ID');
  const commands = [];
  const cancel = ownerCancellation(originalRecord.sourceRef);
  if (cancel) commands.push(command(workflowId, commands.length + 1, cancel.domain, cancel.type, cancel.payload, cancel.suffix));
  commands.push(command(workflowId, commands.length + 1, 'LEDGER', 'LEDGER_REVERSE_TRANSACTION', {
    originalRecordId,
    reversalRecordId,
    reason:String(reason || ''),
  }, `LEDGER:${reversalRecordId}`));
  return { workflowId, commands };
}
