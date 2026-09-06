function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function positiveSatang(value, code) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(code);
  return amount;
}

export function registerStoreIncomeDomainCommand(runtime, { now = () => new Date().toISOString() } = {}) {
  if (!runtime || typeof runtime.register !== 'function') throw new TypeError('INVALID_COMMAND_RUNTIME');
  runtime.register('STORE', 'STORE_CREATE_INCOME', ({ domainState, payload, command }) => {
    const input = payload?.record;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_STORE_INCOME_RECORD');
    const recordId = requiredText(input.recordId ?? input.id, 'INVALID_RECORD_ID');
    if (domainState.records[recordId]) throw new Error(`DUPLICATE_DOMAIN_RECORD:${recordId}`);
    const at = now();
    const record = {
      recordId,
      source:'STORE',
      type:'INCOME',
      title:requiredText(input.title, 'INVALID_STORE_INCOME_TITLE'),
      amountSatang:positiveSatang(input.amountSatang, 'INVALID_STORE_INCOME_AMOUNT'),
      status:'COMPLETED',
      createdAt:input.createdAt || at,
      updatedAt:at,
    };
    domainState.records[recordId] = {
      record,
      provenance:{ origin:'LIVE_COMMAND', commandId:command.commandId, idempotencyKey:command.idempotencyKey, domain:command.domain, at },
      history:[],
    };
  });
}
