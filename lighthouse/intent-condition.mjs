function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function freezeCondition(condition) {
  if (!condition) return null;
  const rawSpan = condition.rawSpan ? Object.freeze({ ...condition.rawSpan }) : null;
  const meaning = condition.meaning ? Object.freeze({ ...condition.meaning }) : null;
  return Object.freeze({ ...condition, rawSpan, meaning });
}

function temporalToken(text) {
  for (const token of ['เมื่อวาน', 'วันนี้', 'พรุ่งนี้']) {
    if (text.includes(token)) return token;
  }
  return null;
}

export function extractConditionPrefix(rawText, { start = 0, end = rawText?.length, groupId = null } = {}) {
  if (typeof rawText !== 'string') throw new TypeError('INTENT_CONDITION_TEXT_REQUIRED');
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > rawText.length) {
    throw new TypeError('INTENT_CONDITION_RANGE_INVALID');
  }

  const local = rawText.slice(start, end);
  const match = /^ถ้า(.+?)ค่อย/u.exec(local);
  if (!match) return null;

  const raw = match[0];
  const body = match[1].trim();
  const isRain = body.includes('ฝนตก');
  const meaning = isRain
    ? { kind:'RAIN', temporalRaw:temporalToken(body) }
    : { kind:'CONDITION_TEXT', temporalRaw:temporalToken(body) };

  return freezeCondition({
    state:'RESOLVED',
    groupId,
    rawText:raw,
    rawSpan:{ start, end:start + raw.length },
    meaning,
  });
}

export function evaluateConditionRoute({ condition, capabilities = {} } = {}) {
  if (condition == null) return Object.freeze({ status:'READY', condition:null });
  if (!plainObject(condition)) throw new TypeError('INTENT_CONDITION_INVALID');

  const preserved = freezeCondition(condition);
  if (condition.state === 'SCOPE_UNKNOWN' || !condition.groupId) {
    return Object.freeze({
      status:'RECOVERY_REQUIRED',
      reason:'CONDITION_SCOPE_UNKNOWN',
      condition:preserved,
    });
  }
  if (condition.state !== 'RESOLVED') {
    return Object.freeze({
      status:'RECOVERY_REQUIRED',
      reason:'CONDITION_MEANING_UNRESOLVED',
      condition:preserved,
    });
  }

  if (
    capabilities?.conditionEvaluator !== true ||
    capabilities?.conditionExecutor !== true ||
    capabilities?.proven !== true
  ) {
    return Object.freeze({
      status:'UNSUPPORTED',
      reason:'CONDITION_NOT_SUPPORTED',
      condition:preserved,
    });
  }

  return Object.freeze({ status:'READY', condition:preserved });
}
