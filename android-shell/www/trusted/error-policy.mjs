const ERROR_STATUSES = new Set(['UNSUPPORTED', 'REFERENCE', 'BLOCKED', 'LOCKED', 'VERIFY', 'ERROR']);

function frozen(value) {
  return Object.freeze(value);
}

function text(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function upper(value) {
  return text(value).toUpperCase();
}

function routeLike(status, reason) {
  if (status === 'UNSUPPORTED' || status === 'REFERENCE') return true;
  return [
    'CAPABILITY_NOT_CONNECTED',
    'INTERPRETER_NOT_CONFIGURED',
    'NO_LEGAL_PATH',
    'ROUTE_STOPPED',
    'QUERY_PROVIDER_ACTION_MISMATCH',
    'REFERENCE_ONLY',
  ].some(marker => reason.includes(marker));
}

export function isTrustedFailure(result) {
  return ERROR_STATUSES.has(upper(result?.status));
}

export function classifyTrustedFailure(result) {
  const status = upper(result?.status, 'ERROR');
  const reason = upper(result?.reason, 'UNKNOWN_ERROR');

  let publicCode = 500;
  if (routeLike(status, reason)) publicCode = 404;
  else if (status === 'LOCKED') publicCode = 423;
  else if (status === 'VERIFY') publicCode = 422;
  else if (status === 'BLOCKED') publicCode = 409;

  let stage = 'EXECUTE';
  if (routeLike(status, reason)) stage = 'ROUTE';
  else if (reason.includes('PATCH')) stage = 'PATCH';
  else if (status === 'VERIFY' || reason.includes('VERIFY') || reason.includes('SIGNATURE') || reason.includes('HASH')) stage = 'VERIFY';
  else if (status === 'LOCKED' || reason.includes('PIN') || reason.includes('INDEXEDDB') || reason.includes('DB_') || reason.includes('STORE')) stage = 'STORAGE';

  return frozen({
    publicCode,
    internalReason:text(result?.reason, 'UNKNOWN_ERROR'),
    stage,
  });
}

export function publicErrorResult(result) {
  const { publicCode } = classifyTrustedFailure(result);
  return frozen({
    status:'ERROR',
    publicCode,
    message:`Sorry — error code ${publicCode}`,
  });
}

function bangkokParts(occurredAt) {
  const date = new Date(occurredAt);
  if (!Number.isFinite(date.getTime())) throw new Error('TRUSTED_ERROR_TIME_INVALID');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Bangkok',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
    second:'2-digit',
    hourCycle:'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  );
  return {
    localDate:`${parts.year}-${parts.month}-${parts.day}`,
    localTime:`${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

export function buildTrustedErrorEvent({
  result,
  command,
  appVersion = 'unknown',
  occurredAt,
} = {}) {
  const at = text(occurredAt);
  if (!at) throw new Error('TRUSTED_ERROR_TIME_REQUIRED');
  const { publicCode, internalReason, stage } = classifyTrustedFailure(result);
  const local = bangkokParts(at);
  return frozen({
    occurredAt:at,
    localDate:local.localDate,
    localTime:local.localTime,
    command:text(command),
    publicCode,
    internalReason,
    stage,
    appVersion:text(appVersion, 'unknown'),
  });
}
