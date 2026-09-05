function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function provenance(command, domain, at) {
  return { origin:'LIVE_COMMAND', commandId:command.commandId, idempotencyKey:command.idempotencyKey, domain, at };
}

function cancelRecord(domainState, domain, recordId, command, at, allowedTypes) {
  const id = text(recordId, `INVALID_${domain}_RECORD_ID`);
  const entry = domainState.records[id];
  if (!entry) throw new Error(`${domain}_RECORD_NOT_FOUND:${id}`);
  const type = String(entry.record?.type || '');
  if (!allowedTypes.has(type)) throw new Error(`${domain}_RECORD_NOT_REVERSIBLE:${id}/${type || 'UNKNOWN'}`);
  if (entry.record?.status === 'CANCELLED') throw new Error(`${domain}_RECORD_ALREADY_CANCELLED:${id}`);
  const history = Array.isArray(entry.history) ? entry.history : [];
  history.push({ record:structuredClone(entry.record), provenance:structuredClone(entry.provenance ?? null), archivedAt:at, commandId:command.commandId });
  const record = structuredClone(entry.record);
  record.status = 'CANCELLED';
  record.updatedAt = at;
  domainState.records[id] = { record, provenance:provenance(command, domain, at), history };
}

export function registerOwnerCancellationCommands(runtime, { now = () => new Date().toISOString() } = {}) {
  if (!runtime || typeof runtime.register !== 'function') throw new TypeError('INVALID_COMMAND_RUNTIME');

  runtime.register('STORE', 'STORE_CANCEL_RECORD', ({ domainState, payload, command }) => {
    cancelRecord(domainState, 'STORE', payload.recordId, command, now(), new Set(['SALE', 'INCOME']));
  });

  runtime.register('RIDE', 'RIDE_CANCEL_RECORD', ({ domainState, payload, command }) => {
    cancelRecord(domainState, 'RIDE', payload.recordId, command, now(), new Set(['JOB', 'EXPENSE', 'CREDIT_WITHDRAWAL']));
  });

  return runtime;
}
