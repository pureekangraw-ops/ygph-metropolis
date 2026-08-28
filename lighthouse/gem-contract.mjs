const STATUSES = new Set(['RESOLVED', 'NEEDS_SUPPORT', 'UNRESOLVED']);
const ALLOWED_KEYS = new Set(['status', 'proposal', 'supportRequest', 'evidence']);
const FORBIDDEN_AUTHORITY_KEYS = new Set(['runtime', 'runtimeMethod', 'capability', 'execute']);

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export const GEM_MAX_SUPPORT_HOPS = 1;

export function validateGemProcessResult(result) {
  if (!plainObject(result)) throw new Error('GEM_INVALID_RESULT');

  for (const key of Object.keys(result)) {
    if (FORBIDDEN_AUTHORITY_KEYS.has(key)) throw new Error('GEM_EXECUTION_AUTHORITY_FORBIDDEN');
    if (!ALLOWED_KEYS.has(key)) throw new Error('GEM_INVALID_RESULT_FIELD');
  }

  if (!STATUSES.has(result.status)) throw new Error('GEM_INVALID_STATUS');

  const normalized = { status:result.status };
  if (result.proposal !== undefined) normalized.proposal = clone(result.proposal);
  if (result.supportRequest !== undefined) normalized.supportRequest = clone(result.supportRequest);
  if (result.evidence !== undefined) normalized.evidence = clone(result.evidence);
  return deepFreeze(normalized);
}
