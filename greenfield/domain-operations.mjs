const STORE_TYPES = new Set(['SALE', 'PURCHASE', 'STOCK_WITHDRAWAL', 'STOCK_ADJUSTMENT']);
const CALENDAR_STATUSES = new Set(['OPEN', 'COMPLETED', 'CANCELLED']);

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function safeSatang(value, { allowNull = false, allowZero = true, code = 'INVALID_AMOUNT' } = {}) {
  if (value == null && allowNull) return null;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || (!allowZero && amount === 0)) throw new Error(code);
  return amount;
}

function safeQuantity(value, { signed = false, code = 'INVALID_QUANTITY' } = {}) {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity === 0 || (!signed && quantity < 0)) throw new Error(code);
  return quantity;
}

function provenance(command, at) {
  return {
    origin: 'LIVE_COMMAND',
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    domain: command.domain,
    at,
  };
}

function createEntry(domainState, record, command, at) {
  const id = requiredText(record.recordId ?? record.id, 'INVALID_RECORD_ID');
  if (domainState.records[id]) throw new Error(`DUPLICATE_DOMAIN_RECORD:${id}`);
  domainState.records[id] = {
    record: structuredClone(record),
    provenance: provenance(command, at),
    history: [],
  };
  return domainState.records[id];
}

function updateEntry(domainState, id, command, at, mutate) {
  const entry = domainState.records[id];
  if (!entry) throw new Error(`DOMAIN_RECORD_NOT_FOUND:${id}`);
  const history = Array.isArray(entry.history) ? entry.history : [];
  history.push({
    record: structuredClone(entry.record),
    provenance: structuredClone(entry.provenance ?? null),
    archivedAt: at,
    commandId: command.commandId,
  });
  const nextRecord = structuredClone(entry.record);
  mutate(nextRecord);
  domainState.records[id] = {
    record: nextRecord,
    provenance: provenance(command, at),
    history,
  };
  return domainState.records[id];
}

function transactionDirection(record) {
  if (record.direction === 'IN' || record.direction === 'OUT') return record.direction;
  const prefix = String(record.detail || '').split(':', 1)[0];
  if (prefix === 'IN' || prefix === 'OUT') return prefix;
  throw new Error(`LEDGER_DIRECTION_UNKNOWN:${record.recordId || record.id || '?'}`);
}

export function registerGreenfieldDomainCommands(runtime, { now = () => new Date().toISOString() } = {}) {
  if (!runtime || typeof runtime.register !== 'function') throw new TypeError('INVALID_COMMAND_RUNTIME');

  runtime.register('STORE', 'STORE_CREATE_RECORD', ({ domainState, payload, command }) => {
    const input = payload?.record;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_STORE_RECORD');
    const type = requiredText(input.type, 'INVALID_STORE_TYPE');
    if (!STORE_TYPES.has(type)) throw new Error(`UNSUPPORTED_STORE_TYPE:${type}`);
    const at = now();
    const record = structuredClone(input);
    record.recordId = requiredText(input.recordId ?? input.id, 'INVALID_RECORD_ID');
    record.source = 'STORE';
    record.type = type;
    record.title = requiredText(input.title, 'INVALID_STORE_TITLE');
    record.status = requiredText(input.status ?? (type === 'PURCHASE' ? 'ACTIVE' : 'COMPLETED'), 'INVALID_STORE_STATUS');
    record.amountSatang = safeSatang(input.amountSatang, { allowNull: type === 'STOCK_ADJUSTMENT', code: 'INVALID_STORE_AMOUNT' });
    record.quantity = safeQuantity(input.quantity, { signed: type === 'STOCK_ADJUSTMENT', code: 'INVALID_STORE_QUANTITY' });
    record.createdAt = input.createdAt || at;
    record.updatedAt = at;
    createEntry(domainState, record, command, at);
  });

  runtime.register('LEDGER', 'LEDGER_CREATE_TRANSACTION', ({ domainState, payload, command }) => {
    const at = now();
    const direction = requiredText(payload.direction, 'INVALID_LEDGER_DIRECTION');
    if (direction !== 'IN' && direction !== 'OUT') throw new Error(`INVALID_LEDGER_DIRECTION:${direction}`);
    const subtype = requiredText(payload.subtype, 'INVALID_LEDGER_SUBTYPE');
    const record = {
      recordId: requiredText(payload.recordId, 'INVALID_RECORD_ID'),
      source: 'LEDGER',
      type: 'TRANSACTION',
      title: requiredText(payload.title, 'INVALID_LEDGER_TITLE'),
      detail: `${direction}:${subtype}`,
      direction,
      amountSatang: safeSatang(payload.amountSatang, { allowZero: false, code: 'INVALID_LEDGER_AMOUNT' }),
      status: 'COMPLETED',
      sourceRef: payload.sourceRef ? String(payload.sourceRef) : null,
      createdAt: payload.createdAt || at,
      updatedAt: at,
    };
    createEntry(domainState, record, command, at);
  });

  runtime.register('LEDGER', 'LEDGER_REVERSE_TRANSACTION', ({ domainState, payload, command }) => {
    const originalId = requiredText(payload.originalRecordId, 'INVALID_ORIGINAL_RECORD_ID');
    const originalEntry = domainState.records[originalId];
    if (!originalEntry || originalEntry.record?.type !== 'TRANSACTION') throw new Error(`LEDGER_TRANSACTION_NOT_FOUND:${originalId}`);
    if (originalEntry.record.reversalOf) throw new Error(`REVERSAL_OF_REVERSAL_FORBIDDEN:${originalId}`);
    for (const entry of Object.values(domainState.records)) {
      if (entry?.record?.reversalOf === originalId) throw new Error(`TRANSACTION_ALREADY_REVERSED:${originalId}`);
    }
    const at = now();
    const original = originalEntry.record;
    const opposite = transactionDirection(original) === 'IN' ? 'OUT' : 'IN';
    const record = {
      recordId: requiredText(payload.reversalRecordId, 'INVALID_REVERSAL_RECORD_ID'),
      source: 'LEDGER',
      type: 'TRANSACTION',
      title: `ย้อน ${String(original.title || originalId)}`,
      detail: `${opposite}:REVERSAL`,
      direction: opposite,
      amountSatang: safeSatang(original.amountSatang, { allowZero: false, code: 'INVALID_LEDGER_AMOUNT' }),
      status: 'COMPLETED',
      reversalOf: originalId,
      reversalReason: requiredText(payload.reason, 'INVALID_REVERSAL_REASON'),
      sourceRef: original.sourceRef ?? `LEDGER/${originalId}`,
      createdAt: at,
      updatedAt: at,
    };
    createEntry(domainState, record, command, at);
  });

  runtime.register('CALENDAR', 'CALENDAR_CREATE_RECORD', ({ domainState, payload, command }) => {
    const input = payload?.record;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_CALENDAR_RECORD');
    const at = now();
    const record = structuredClone(input);
    record.recordId = requiredText(input.recordId ?? input.id, 'INVALID_RECORD_ID');
    record.source = 'CALENDAR';
    record.type = requiredText(input.type, 'INVALID_CALENDAR_TYPE');
    record.title = requiredText(input.title, 'INVALID_CALENDAR_TITLE');
    record.status = requiredText(input.status ?? 'OPEN', 'INVALID_CALENDAR_STATUS');
    if (!CALENDAR_STATUSES.has(record.status)) throw new Error(`INVALID_CALENDAR_STATUS:${record.status}`);
    record.amountSatang = safeSatang(input.amountSatang ?? 0, { code: 'INVALID_CALENDAR_AMOUNT' });
    record.createdAt = input.createdAt || at;
    record.updatedAt = at;
    createEntry(domainState, record, command, at);
  });

  runtime.register('CALENDAR', 'CALENDAR_SET_STATUS', ({ domainState, payload, command }) => {
    const id = requiredText(payload.recordId, 'INVALID_RECORD_ID');
    const status = requiredText(payload.status, 'INVALID_CALENDAR_STATUS');
    if (!CALENDAR_STATUSES.has(status)) throw new Error(`INVALID_CALENDAR_STATUS:${status}`);
    const entry = domainState.records[id];
    if (!entry) throw new Error(`DOMAIN_RECORD_NOT_FOUND:${id}`);
    if (entry.record.status === status) throw new Error(`CALENDAR_STATUS_UNCHANGED:${id}/${status}`);
    if (entry.record.status === 'COMPLETED' || entry.record.status === 'CANCELLED') throw new Error(`CALENDAR_RECORD_CLOSED:${id}/${entry.record.status}`);
    const at = now();
    updateEntry(domainState, id, command, at, record => {
      record.status = status;
      record.updatedAt = at;
    });
  });

  return runtime;
}
