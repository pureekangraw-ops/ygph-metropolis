import { prepareIntentPath } from './intent-path-adapter.mjs';
import { FOUNDATION_PATTERN_EXPENSE_TERMS } from './pattern-input.mjs';

const DIRECT_EXPENSE_TERMS = new Set(FOUNDATION_PATTERN_EXPENSE_TERMS);
const LOCAL_STOP_REASONS = new Set([
  'PROHIBITED_GROUP',
  'CONDITION_NOT_SUPPORTED',
  'CONDITION_SCOPE_UNKNOWN',
  'MULTI_GROUP_EXECUTION_NOT_CONNECTED',
  'REFERENCE_ONLY',
]);

function freeze(value) {
  return Object.freeze(value);
}

function resolvedTarget(group) {
  const target = group?.slots?.find(slot => slot?.role === 'TARGET' && slot?.state === 'RESOLVED');
  return typeof target?.resolvedValue === 'string' ? target.resolvedValue.trim() : '';
}

function localDirectClaim(prepared) {
  if (!prepared?.parsed || !Array.isArray(prepared.parsed.groups)) return false;
  return prepared.parsed.groups.some(group => DIRECT_EXPENSE_TERMS.has(resolvedTarget(group)));
}

async function providerRoute(rawText, interpretFallback) {
  if (typeof interpretFallback !== 'function') throw new TypeError('MASTER_INPUT_INTERPRET_FALLBACK_REQUIRED');
  const intent = await interpretFallback(rawText);
  return freeze({ route:'PROVIDER', intent, prepared:null, status:intent?.status ?? null, reason:null });
}

export async function routeMasterInputText(rawText, options = {}) {
  if (typeof rawText !== 'string' || !rawText.trim()) throw new TypeError('MASTER_INPUT_TEXT_REQUIRED');

  const prepared = prepareIntentPath(rawText, {
    receivedAt:options.receivedAt,
    timeZone:options.timeZone,
    requestIdFactory:options.requestIdFactory,
    ...(options.interpretedAt != null ? { interpretedAt:options.interpretedAt } : {}),
  });

  if (prepared.status === 'READY') {
    return freeze({ route:'LOCAL_PATH', prepared, intent:null, status:'READY', reason:null });
  }

  if (prepared.status === 'BLOCKED' || prepared.status === 'REFERENCE') {
    return freeze({ route:'STOP', prepared, intent:null, status:prepared.status, reason:prepared.reason });
  }

  if (prepared.status === 'UNSUPPORTED') {
    if (LOCAL_STOP_REASONS.has(prepared.reason)) {
      return freeze({ route:'STOP', prepared, intent:null, status:prepared.status, reason:prepared.reason });
    }
    return providerRoute(rawText, options.interpretFallback);
  }

  if (prepared.status === 'RECOVERY_REQUIRED') {
    if (localDirectClaim(prepared)) {
      return freeze({ route:'STOP', prepared, intent:null, status:'RECOVERY_REQUIRED', reason:prepared.reason });
    }
    return providerRoute(rawText, options.interpretFallback);
  }

  return providerRoute(rawText, options.interpretFallback);
}
