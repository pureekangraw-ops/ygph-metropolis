import { scanIntentVocabulary } from './intent-vocabulary.mjs';

function freeze(value) {
  return Object.freeze(value);
}

function first(tokens, predicate) {
  return tokens.find(predicate) ?? null;
}

function amountFrom(tokens) {
  const numeric = first(tokens, token => token.role === 'NUMBER' && token.state === 'KNOWN' && token.resolvedValue?.amountSatang > 0);
  return numeric?.resolvedValue?.amountSatang ?? null;
}

function isOwnerPronoun(rawText, token) {
  if (token.role !== 'PRONOUN') return false;
  return rawText.slice(0, token.rawSpan.start).endsWith('ของ');
}

function semanticIntent(tokens) {
  if (tokens.some(token => token.role === 'QUESTION')) return 'QUERY';
  if (tokens.some(token => token.role === 'PROHIBITION')) return 'PROHIBITED';
  if (tokens.some(token => token.role === 'CONDITION_MARKER')) return 'CONDITIONAL';
  return 'COMMAND';
}

function capabilityFor(target) {
  if (target?.canonical === 'ปฏิทิน') return 'NOT_CONNECTED';
  if (target?.canonical === 'ข้าว') return 'CONNECTED_LOCAL';
  if (target?.canonical === 'น้ำมัน') return 'INTERPRET_ONLY';
  return 'UNKNOWN';
}

function actionFor(intent) {
  if (intent === 'QUERY') return 'QUERY';
  if (intent === 'PROHIBITED') return 'STOP';
  if (intent === 'CONDITIONAL') return 'CONDITIONAL';
  return 'CREATE';
}

function normalizedTarget(target) {
  return target?.canonical ?? target?.raw ?? 'UNKNOWN';
}

export function interpretIntentInput(rawText) {
  if (typeof rawText !== 'string') throw new TypeError('INTENT_INTERPRET_TEXT_REQUIRED');
  const tokens = scanIntentVocabulary(rawText);
  const pending = tokens.filter(token => token.state === 'UNKNOWN' || token.state === 'AMBIGUOUS');
  const omittable = tokens.filter(token => token.optional === true || (token.role === 'PRONOUN' && !isOwnerPronoun(rawText, token)));
  const target = first(tokens, token => token.role === 'TARGET');
  const temporal = tokens.filter(token => token.role === 'TEMPORAL');
  const amountSatang = amountFrom(tokens);
  const intent = semanticIntent(tokens);
  const action = actionFor(intent);
  const capability = capabilityFor(target);
  const conditionToken = first(tokens, token => token.role === 'CONDITION_MARKER');
  const condition = conditionToken ? rawText.slice(conditionToken.rawSpan.start) : null;

  let status = 'PENDING';
  if (target?.canonical === 'ปฏิทิน') status = temporal.length ? 'NEEDS_DATA' : 'PENDING';
  else if (intent === 'QUERY' && target && amountSatang) status = 'READY_QUERY';
  else if (intent === 'PROHIBITED') status = 'BLOCKED_SEMANTIC';
  else if (intent === 'CONDITIONAL') status = 'CONDITIONAL_PENDING';
  else if (target && amountSatang && pending.length === 0) status = 'READY_LANGUAGE';

  const semanticKey = [
    intent,
    normalizedTarget(target),
    amountSatang ?? 'NONE',
    condition ?? 'NO_CONDITION',
  ].join('|');

  return freeze({
    rawText,
    status,
    intent,
    action,
    capability,
    tokens,
    pending:freeze([...pending]),
    omittable:freeze([...omittable]),
    temporal:freeze([...temporal]),
    target,
    amountSatang,
    semanticKey,
    request:null,
  });
}
