const SOURCES = new Set(['PATTERN', 'AI', 'MANUAL', 'API', 'AUTOMATION']);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRequestId(value) {
  if (typeof value !== 'string') throw new Error('PATH_INVALID_REQUEST_ID');
  const output = value.trim();
  if (!REQUEST_ID_PATTERN.test(output)) throw new Error('PATH_INVALID_REQUEST_ID');
  return output;
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

function normalizeQuantity(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('PATH_INVALID_QUANTITY');
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validateExpense(request, base) {
  const title = normalizeTitle(request.fields.title);
  const amountSatang = normalizeAmount(request.fields.amountSatang);
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
    ...base,
    object:'EXPENSE',
    fields:{ title, amountSatang },
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{ direction:'OUT', subtype:'EXPENSE', title, amountSatang },
    },
  });
}

function validateStoreSale(request, base) {
  const title = normalizeTitle(request.fields.title);
  const amountSatang = normalizeAmount(request.fields.amountSatang);
  const quantity = normalizeQuantity(request.fields.quantity);
  const receivedSatang = normalizeAmount(request.fields.receivedSatang);
  if (receivedSatang > amountSatang) throw new Error('PATH_INVALID_RECEIVED_AMOUNT');

  const effect = request.requiredResult.effect;
  if (request.requiredResult.kind !== 'STORE_SALE_WITH_LEDGER' || !plainObject(effect)) {
    throw new Error('PATH_REQUIRED_RESULT_MISMATCH');
  }
  if (
    effect.owner !== 'STORE' ||
    effect.ledgerDirection !== 'IN' ||
    effect.title !== title ||
    effect.amountSatang !== amountSatang ||
    effect.quantity !== quantity ||
    effect.receivedSatang !== receivedSatang
  ) {
    throw new Error('PATH_REQUIRED_RESULT_MISMATCH');
  }

  return deepFreeze({
    ...base,
    object:'STORE_SALE',
    fields:{ title, amountSatang, quantity, receivedSatang },
    requiredResult:{
      kind:'STORE_SALE_WITH_LEDGER',
      effect:{ owner:'STORE', ledgerDirection:'IN', title, amountSatang, quantity, receivedSatang },
    },
  });
}

export function validatePathRequest(request) {
  if (!plainObject(request)) throw new Error('PATH_INVALID_REQUEST');
  if (request.version !== '1') throw new Error('PATH_UNSUPPORTED_VERSION');
  if (!SOURCES.has(request.source)) throw new Error('PATH_INVALID_SOURCE');
  const requestId = normalizeRequestId(request.requestId);
  if (request.action !== 'CREATE') throw new Error('PATH_UNSUPPORTED_ACTION');
  if (!plainObject(request.fields)) throw new Error('PATH_INVALID_FIELDS');
  if (!plainObject(request.requiredResult)) throw new Error('PATH_REQUIRED_RESULT_REQUIRED');

  const base = {
    version:'1',
    source:request.source,
    requestId,
    action:'CREATE',
  };

  if (request.object === 'EXPENSE') return validateExpense(request, base);
  if (request.object === 'STORE_SALE') return validateStoreSale(request, base);
  throw new Error('PATH_UNSUPPORTED_OBJECT');
}

export const PATH_SOURCES = Object.freeze([...SOURCES]);
