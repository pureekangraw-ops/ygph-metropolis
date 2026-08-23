export const FINANCE_SEED_FORMAT = 'YGPH_METRO_FINANCE_SEED';
export const FINANCE_SEED_VERSION = 1;

const ALLOWED_COMMANDS = Object.freeze({
  LEDGER: new Set(['LEDGER_CREATE_OBLIGATION']),
  CALENDAR: new Set(['CALENDAR_CREATE_RECORD']),
});

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value;
}

function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function targetRecordId(command) {
  if (command.domain === 'LEDGER') return text(command.payload?.recordId, 'INVALID_FINANCE_SEED_RECORD_ID');
  return text(command.payload?.record?.recordId ?? command.payload?.record?.id, 'INVALID_FINANCE_SEED_RECORD_ID');
}

export function parseFinanceSeedFile(documentPayload) {
  const source = object(documentPayload, 'INVALID_FINANCE_SEED');
  if (source.format !== FINANCE_SEED_FORMAT) throw new Error('INVALID_FINANCE_SEED_FORMAT');
  if (Number(source.formatVersion) !== FINANCE_SEED_VERSION) throw new Error('INVALID_FINANCE_SEED_VERSION');

  const target = object(source.target, 'INVALID_FINANCE_SEED_TARGET');
  if (target.app !== 'YGPH METROPOLIS' || target.architecture !== 'GREENFIELD') throw new Error('INVALID_FINANCE_SEED_TARGET');
  if (Number(target.stateSchema) !== 2) throw new Error('FINANCE_SEED_SCHEMA_MISMATCH');
  if (target.mode !== 'ADDITIVE_FINANCE_SEED') throw new Error('INVALID_FINANCE_SEED_MODE');
  if (target.nativeBackup !== false || source.safety?.doNotUseWithRestore !== true) throw new Error('FINANCE_SEED_RESTORE_BOUNDARY_REQUIRED');
  if (!Array.isArray(source.commands) || source.commands.length === 0) throw new Error('EMPTY_FINANCE_SEED');

  const idempotencyKeys = new Set();
  const recordKeys = new Set();
  const commands = source.commands.map((raw, index) => {
    const command = object(raw, 'INVALID_FINANCE_SEED_COMMAND');
    const domain = text(command.domain, 'INVALID_FINANCE_SEED_DOMAIN');
    const type = text(command.type, 'INVALID_FINANCE_SEED_COMMAND_TYPE');
    if (!ALLOWED_COMMANDS[domain]?.has(type)) throw new Error(`FINANCE_SEED_COMMAND_NOT_ALLOWED:${domain}/${type}`);
    const idempotencyKey = text(command.idempotencyKey, 'INVALID_FINANCE_SEED_IDEMPOTENCY_KEY');
    if (idempotencyKeys.has(idempotencyKey)) throw new Error(`DUPLICATE_FINANCE_SEED_IDEMPOTENCY_KEY:${idempotencyKey}`);
    idempotencyKeys.add(idempotencyKey);
    const payload = structuredClone(object(command.payload, 'INVALID_FINANCE_SEED_PAYLOAD'));
    const normalized = {
      commandId:`FINANCE-SEED-${index + 1}-${idempotencyKey}`,
      idempotencyKey,
      domain,
      type,
      payload,
    };
    const recordKey = `${domain}/${targetRecordId(normalized)}`;
    if (recordKeys.has(recordKey)) throw new Error(`DUPLICATE_FINANCE_SEED_RECORD:${recordKey}`);
    recordKeys.add(recordKey);
    return normalized;
  });

  return {
    format:FINANCE_SEED_FORMAT,
    formatVersion:FINANCE_SEED_VERSION,
    target:structuredClone(target),
    safety:structuredClone(source.safety),
    commands,
    verifyBeforeLedgerMutation:Array.isArray(source.verifyBeforeLedgerMutation) ? structuredClone(source.verifyBeforeLedgerMutation) : [],
  };
}

export function assertFinanceSeedCanApply(state, seed) {
  object(state, 'INVALID_FINANCE_SEED_STATE');
  const parsed = parseFinanceSeedFile(seed);
  for (const command of parsed.commands) {
    if (state.commandLog?.[command.idempotencyKey]) throw new Error(`FINANCE_SEED_ALREADY_APPLIED:${command.idempotencyKey}`);
    const recordId = targetRecordId(command);
    if (state.domains?.[command.domain]?.records?.[recordId]) throw new Error(`FINANCE_SEED_RECORD_ALREADY_EXISTS:${command.domain}/${recordId}`);
  }
  return parsed;
}

export function verifyFinanceSeedReadback(state, seed) {
  object(state, 'INVALID_FINANCE_SEED_STATE');
  const parsed = parseFinanceSeedFile(seed);
  for (const command of parsed.commands) {
    const recordId = targetRecordId(command);
    if (!state.commandLog?.[command.idempotencyKey]) throw new Error(`FINANCE_SEED_READBACK_MISMATCH:COMMAND/${command.idempotencyKey}`);
    if (!state.domains?.[command.domain]?.records?.[recordId]) throw new Error(`FINANCE_SEED_READBACK_MISMATCH:RECORD/${command.domain}/${recordId}`);
  }
  return { status:'VERIFIED', appliedCommands:parsed.commands.length };
}
