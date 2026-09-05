import { parseIntentTask1 } from './intent-parser.mjs';
import { evaluateConditionRoute } from './intent-condition.mjs';
import { resolveTemporal } from './intent-temporal.mjs';
import { validatePathRequest } from './path-contract.mjs';
import { FOUNDATION_PATTERN_EXPENSE_TERMS } from './pattern-input.mjs';

const DIRECT_EXPENSE_TERMS = new Set(FOUNDATION_PATTERN_EXPENSE_TERMS);

function frozenResult(value) {
  return Object.freeze(value);
}

function slot(group, role) {
  return group?.slots?.find(item => item.role === role && item.state === 'RESOLVED') || null;
}

function stopped(status, reason, extras = {}) {
  return frozenResult({ status, reason, request:null, ...extras });
}

function requestId(factory) {
  if (typeof factory !== 'function') throw new TypeError('INTENT_PATH_REQUEST_ID_FACTORY_REQUIRED');
  return factory();
}

function storeSaleTitle(target) {
  if (typeof target !== 'string') return null;
  const match = /^ขาย\s*(.+)$/u.exec(target.trim());
  const title = match?.[1]?.trim() ?? '';
  return title || null;
}

function queryMeaningRepresented(rawText, group, temporal) {
  // Remove only owned spans. Any unrepresented unit/time/context must survive
  // this check instead of being silently discarded to produce a search match.
  let remainder = rawText.slice(group.rawSpan.start, group.rawSpan.end);
  for (const item of [...group.slots].sort((a, b) => b.rawSpan.start - a.rawSpan.start)) {
    const start = item.rawSpan.start - group.rawSpan.start;
    const end = item.rawSpan.end - group.rawSpan.start;
    remainder = remainder.slice(0, start) + ' '.repeat(end - start) + remainder.slice(end);
  }
  if (temporal?.rawText) remainder = remainder.replace(temporal.rawText, '');
  return /^(?:ลง)?\s*(?:บาท)?\s*(?:แล้ว)?\s*(?:ครับ|ค่ะ|คะ|นะครับ|นะคะ)?\s*[?？]*\s*$/u.test(remainder.trim());
}

export function prepareIntentPath(rawText, options = {}) {
  if (typeof rawText !== 'string') throw new TypeError('INTENT_PATH_TEXT_REQUIRED');

  const parsed = parseIntentTask1(rawText);
  if (parsed.status === 'REFERENCE') {
    return stopped('REFERENCE', 'REFERENCE_ONLY', { parsed, group:null, condition:null, temporal:null });
  }
  if (parsed.status === 'RECOVERY_REQUIRED') {
    return stopped('RECOVERY_REQUIRED', 'INTENT_RECOVERY_REQUIRED', { parsed, group:null, condition:null, temporal:null });
  }
  if (parsed.groups.length !== 1) {
    return stopped('UNSUPPORTED', 'MULTI_GROUP_EXECUTION_NOT_CONNECTED', { parsed, group:null, condition:null, temporal:null });
  }

  const group = parsed.groups[0];
  if (group.prohibited) {
    return stopped('BLOCKED', 'PROHIBITED_GROUP', { parsed, group, condition:group.condition ?? null, temporal:null });
  }

  const conditionRoute = evaluateConditionRoute({ condition:group.condition, capabilities:{} });
  if (conditionRoute.status !== 'READY') {
    return stopped(conditionRoute.status, conditionRoute.reason, {
      parsed,
      group,
      condition:conditionRoute.condition,
      temporal:null,
    });
  }

  const temporalResult = resolveTemporal(rawText, {
    receivedAt:options.receivedAt,
    timeZone:options.timeZone,
    ...(options.interpretedAt != null ? { interpretedAt:options.interpretedAt } : {}),
  });
  if (temporalResult.status === 'RECOVERY_REQUIRED') {
    return stopped('RECOVERY_REQUIRED', 'TEMPORAL_RECOVERY_REQUIRED', {
      parsed,
      group,
      condition:group.condition ?? null,
      temporal:null,
    });
  }
  const temporal = temporalResult.temporal ?? null;

  const targetSlot = slot(group, 'TARGET');
  const moneySlot = slot(group, 'MONEY');
  const quantitySlot = slot(group, 'QUANTITY');
  const rawTitle = typeof targetSlot?.resolvedValue === 'string' ? targetSlot.resolvedValue.trim() : '';
  const amountSatang = moneySlot?.resolvedValue?.amountSatang;
  if (!rawTitle || !Number.isSafeInteger(amountSatang) || amountSatang <= 0) {
    return stopped('RECOVERY_REQUIRED', 'INTENT_REQUIRED_SLOT_UNRESOLVED', {
      parsed,
      group,
      condition:group.condition ?? null,
      temporal,
    });
  }

  const storeTitle = storeSaleTitle(rawTitle);
  if (storeTitle) {
    if (group.intent !== 'COMMAND') {
      return stopped('UNSUPPORTED', 'STORE_QUERY_NOT_CONNECTED', {
        parsed,
        group,
        condition:group.condition ?? null,
        temporal,
      });
    }
    const quantity = quantitySlot?.resolvedValue?.value;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return stopped('RECOVERY_REQUIRED', 'STORE_QUANTITY_REQUIRED', {
        parsed,
        group,
        condition:group.condition ?? null,
        temporal,
      });
    }
    const request = validatePathRequest({
      version:'1',
      source:'PATTERN',
      requestId:requestId(options.requestIdFactory),
      action:'CREATE',
      object:'STORE_SALE',
      fields:{
        title:storeTitle,
        amountSatang,
        quantity,
        receivedSatang:amountSatang,
      },
      requiredResult:{
        kind:'STORE_SALE_WITH_LEDGER',
        effect:{
          owner:'STORE',
          ledgerDirection:'IN',
          title:storeTitle,
          amountSatang,
          quantity,
          receivedSatang:amountSatang,
        },
      },
    });
    return frozenResult({
      status:'READY',
      reason:null,
      request,
      parsed,
      group,
      condition:group.condition ?? null,
      temporal,
    });
  }

  if (!DIRECT_EXPENSE_TERMS.has(rawTitle)) {
    return stopped('UNSUPPORTED', 'NO_CONNECTED_DIRECT_CAPABILITY', {
      parsed,
      group,
      condition:group.condition ?? null,
      temporal,
    });
  }

  const businessDate = temporal?.businessDate ?? null;
  if (group.intent === 'QUERY') {
    if (!queryMeaningRepresented(rawText, group, temporal)) {
      return stopped('UNSUPPORTED', 'QUERY_CONTEXT_NOT_REPRESENTED', { parsed, group, condition:null, temporal });
    }
    return frozenResult({
      status:'QUERY', reason:null, request:null, parsed, group, condition:null, temporal,
      intent:Object.freeze({
        version:'1', status:'READY', action:'QUERY', object:'EXPENSE',
        fields:Object.freeze({ title:rawTitle, amountSatang, ...(businessDate ? { businessDate } : {}) }),
      }),
    });
  }
  const request = validatePathRequest({
    version:'1',
    source:'PATTERN',
    requestId:requestId(options.requestIdFactory),
    action:'CREATE',
    object:'EXPENSE',
    fields:{
      title:rawTitle,
      amountSatang,
      ...(businessDate ? { businessDate } : {}),
    },
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{
        direction:'OUT',
        subtype:'EXPENSE',
        title:rawTitle,
        amountSatang,
        ...(businessDate ? { businessDate } : {}),
      },
    },
  });

  return frozenResult({
    status:'READY',
    reason:null,
    request,
    parsed,
    group,
    condition:group.condition ?? null,
    temporal,
  });
}
