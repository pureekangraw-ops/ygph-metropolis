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

function normalizeBusinessDate(value) {
  if (typeof value !== 'string') throw new Error('PATH_INVALID_BUSINESS_DATE');
  const input = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) throw new Error('PATH_INVALID_BUSINESS_DATE');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error('PATH_INVALID_BUSINESS_DATE');
  }
  return input;
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
  const requestId = normalizeRequestId(request.requestId);
  if (request.action !== 'CREATE') throw new Error('PATH_UNSUPPORTED_ACTION');
  if (request.object !== 'EXPENSE') throw new Error('PATH_UNSUPPORTED_OBJECT');
  if (!plainObject(request.fields)) throw new Error('PATH_INVALID_FIELDS');

  const title = normalizeTitle(request.fields.title);
  const amountSatang = normalizeAmount(request.fields.amountSatang);
  const hasBusinessDate = request.fields.businessDate != null;
  const businessDate = hasBusinessDate ? normalizeBusinessDate(request.fields.businessDate) : null;

  if (!plainObject(request.requiredResult)) throw new Error('PATH_REQUIRED_RESULT_REQUIRED');
  const effect = request.requiredResult.effect;
  if (request.requiredResult.kind !== 'LEDGER_TRANSACTION' || !plainObject(effect)) {
    throw new Error('PATH_REQUIRED_RESULT_MISMATCH');
  }
  const effectHasBusinessDate = effect.businessDate != null;
  if (
    effect.direction !== 'OUT' ||
    effect.subtype !== 'EXPENSE' ||
    effect.title !== title ||
    effect.amountSatang !== amountSatang ||
    effectHasBusinessDate !== hasBusinessDate ||
    (hasBusinessDate && effect.businessDate !== businessDate)
  ) {
    throw new Error('PATH_REQUIRED_RESULT_MISMATCH');
  }

  return deepFreeze({
    version:'1',
    source:request.source,
    requestId,
    action:'CREATE',
    object:'EXPENSE',
    fields:{ title, amountSatang, ...(hasBusinessDate ? { businessDate } : {}) },
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{
        direction:'OUT',
        subtype:'EXPENSE',
        title,
        amountSatang,
        ...(hasBusinessDate ? { businessDate } : {}),
      },
    },
  });
}

export const PATH_SOURCES = Object.freeze([...SOURCES]);
