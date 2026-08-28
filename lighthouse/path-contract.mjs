const SOURCES = new Set(['PATTERN', 'AI', 'MANUAL', 'API', 'AUTOMATION']);

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTitle(value) {
  if (typeof value !== 'string') throw new Error('PATH_INVALID_TITLE');
  const output = value.trim();
  if (!output) throw new Error('PATH_INVALID_TITLE');
  return output;
}

function normalizeAmount(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('PATH_INVALID_AMOUNT');
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validatePathRequest(request) {
  if (!plainObject(request)) throw new Error('PATH_INVALID_REQUEST');
  if (request.version !== '1') throw new Error('PATH_UNSUPPORTED_VERSION');
  if (!SOURCES.has(request.source)) throw new Error('PATH_INVALID_SOURCE');
  if (request.action !== 'CREATE') throw new Error('PATH_UNSUPPORTED_ACTION');
  if (request.object !== 'EXPENSE') throw new Error('PATH_UNSUPPORTED_OBJECT');
  if (!plainObject(request.fields)) throw new Error('PATH_INVALID_FIELDS');

  const title = normalizeTitle(request.fields.title);
  const amountSatang = normalizeAmount(request.fields.amountSatang);

  if (!plainObject(request.requiredResult)) throw new Error('PATH_REQUIRED_RESULT_REQUIRED');
  const effect = request.requiredResult.effect;
  if (request.requiredResult.kind !== 'LEDGER_TRANSACTION' || !plainObject(effect)) {
    throw new Error('PATH_REQUIRED_RESULT_MISMATCH');
  }
  if (
    effect.direction !== 'OUT' ||
    effect.subtype !== 'EXPENSE' ||
    effect.title !== title ||
    effect.amountSatang !== amountSatang
  ) {
    throw new Error('PATH_REQUIRED_RESULT_MISMATCH');
  }

  return deepFreeze({
    version:'1',
    source:request.source,
    action:'CREATE',
    object:'EXPENSE',
    fields:{ title, amountSatang },
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{
        direction:'OUT',
        subtype:'EXPENSE',
        title,
        amountSatang,
      },
    },
  });
}

export const PATH_SOURCES = Object.freeze([...SOURCES]);
