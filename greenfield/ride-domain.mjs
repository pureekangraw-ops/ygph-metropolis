function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function positiveSatang(value, code = 'INVALID_RIDE_AMOUNT') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(code);
  return amount;
}

function provenance(command, at) {
  return { origin:'LIVE_COMMAND', commandId:command.commandId, idempotencyKey:command.idempotencyKey, domain:'RIDE', at };
}

function createEntry(domainState, record, command, at) {
  const id = text(record.recordId, 'INVALID_RIDE_RECORD_ID');
  if (domainState.records[id]) throw new Error(`DUPLICATE_DOMAIN_RECORD:${id}`);
  domainState.records[id] = { record:structuredClone(record), provenance:provenance(command, at), history:[] };
}

function updateEntry(domainState, id, command, at, mutate) {
  const entry = domainState.records[id];
  if (!entry) throw new Error(`RIDE_RECORD_NOT_FOUND:${id}`);
  const history = Array.isArray(entry.history) ? entry.history : [];
  history.push({ record:structuredClone(entry.record), provenance:structuredClone(entry.provenance ?? null), archivedAt:at, commandId:command.commandId });
  const record = structuredClone(entry.record);
  mutate(record);
  domainState.records[id] = { record, provenance:provenance(command, at), history };
}

function activeRound(domainState, roundId) {
  const entry = domainState.records[roundId];
  if (!entry || entry.record?.type !== 'ROUND') throw new Error(`RIDE_ROUND_NOT_FOUND:${roundId}`);
  if (entry.record.status !== 'ACTIVE') throw new Error(`RIDE_ROUND_NOT_ACTIVE:${roundId}`);
  return entry;
}

function pendingCredit(domainState) {
  let earned = 0;
  let withdrawn = 0;
  for (const entry of Object.values(domainState.records)) {
    const record = entry?.record;
    if (!record) continue;
    if (record.type === 'JOB' && record.paymentMode === 'CREDIT') earned += Number(record.amountSatang || 0);
    if (record.type === 'CREDIT_WITHDRAWAL') withdrawn += Number(record.amountSatang || 0);
  }
  return earned - withdrawn;
}

export function registerRideDomainCommands(runtime, { now = () => new Date().toISOString() } = {}) {
  if (!runtime || typeof runtime.register !== 'function') throw new TypeError('INVALID_COMMAND_RUNTIME');

  runtime.register('RIDE', 'RIDE_START_ROUND', ({ domainState, payload, command }) => {
    for (const entry of Object.values(domainState.records)) {
      if (entry?.record?.type === 'ROUND' && entry.record.status === 'ACTIVE') throw new Error(`RIDE_ACTIVE_ROUND_EXISTS:${entry.record.recordId}`);
    }
    const at = now();
    const roundId = text(payload.roundId, 'INVALID_RIDE_ROUND_ID');
    createEntry(domainState, { recordId:roundId, source:'RIDE', type:'ROUND', status:'ACTIVE', startedAt:at, endedAt:null, createdAt:at, updatedAt:at }, command, at);
  });

  runtime.register('RIDE', 'RIDE_END_ROUND', ({ domainState, payload, command }) => {
    const roundId = text(payload.roundId, 'INVALID_RIDE_ROUND_ID');
    activeRound(domainState, roundId);
    const at = now();
    updateEntry(domainState, roundId, command, at, record => { record.status='CLOSED'; record.endedAt=at; record.updatedAt=at; });
  });

  runtime.register('RIDE', 'RIDE_CREATE_JOB', ({ domainState, payload, command }) => {
    const roundId = text(payload.roundId, 'INVALID_RIDE_ROUND_ID');
    activeRound(domainState, roundId);
    const paymentMode = text(payload.paymentMode, 'INVALID_RIDE_PAYMENT_MODE');
    if (paymentMode !== 'CASH' && paymentMode !== 'CREDIT') throw new Error(`INVALID_RIDE_PAYMENT_MODE:${paymentMode}`);
    const at = now();
    createEntry(domainState, {
      recordId:text(payload.jobId, 'INVALID_RIDE_JOB_ID'), source:'RIDE', type:'JOB', roundId,
      amountSatang:positiveSatang(payload.amountSatang), paymentMode, note:String(payload.note || ''), status:'COMPLETED', createdAt:at, updatedAt:at,
    }, command, at);
  });

  runtime.register('RIDE', 'RIDE_CREATE_EXPENSE', ({ domainState, payload, command }) => {
    const roundId = text(payload.roundId, 'INVALID_RIDE_ROUND_ID');
    activeRound(domainState, roundId);
    const at = now();
    createEntry(domainState, {
      recordId:text(payload.expenseId, 'INVALID_RIDE_EXPENSE_ID'), source:'RIDE', type:'EXPENSE', roundId,
      title:text(payload.title, 'INVALID_RIDE_EXPENSE_TITLE'), amountSatang:positiveSatang(payload.amountSatang), status:'COMPLETED', createdAt:at, updatedAt:at,
    }, command, at);
  });

  runtime.register('RIDE', 'RIDE_WITHDRAW_CREDIT', ({ domainState, payload, command }) => {
    const amountSatang = positiveSatang(payload.amountSatang, 'INVALID_RIDE_WITHDRAWAL_AMOUNT');
    const available = pendingCredit(domainState);
    if (amountSatang > available) throw new Error(`RIDE_CREDIT_OVERDRAW:${amountSatang}/${available}`);
    const at = now();
    createEntry(domainState, {
      recordId:text(payload.withdrawalId, 'INVALID_RIDE_WITHDRAWAL_ID'), source:'RIDE', type:'CREDIT_WITHDRAWAL',
      amountSatang, status:'COMPLETED', createdAt:at, updatedAt:at,
    }, command, at);
  });

  return runtime;
}

export function projectRideCredit(domainState) {
  return pendingCredit(domainState || { records:{} });
}
