import { prepareIntentPath } from './intent-path-adapter.mjs';
import { compileNaturalLanguageMultiGroup } from './multi-group-frontdoor.mjs';
import { FOUNDATION_PATTERN_EXPENSE_TERMS } from './pattern-input.mjs';
import { decideInputRoute } from './intent-dual-route.mjs';
import { interpretIntentInput } from './intent-interpret.mjs';

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

function routedResult(result, context) {
  return freeze({ ...result, ...context });
}

function firstStoppedCommand(compiled) {
  return compiled?.commands?.find(command => command.status !== 'READY') || null;
}

async function providerRoute(rawText, interpretFallback, questionPrepared = null, context = {}) {
  if (typeof interpretFallback !== 'function') throw new TypeError('MASTER_INPUT_INTERPRET_FALLBACK_REQUIRED');
  const intent = await interpretFallback(rawText);
  if (questionPrepared && intent?.status === 'READY' && intent.action !== 'QUERY') {
    return routedResult({ route:'STOP', intent:null, prepared:questionPrepared, status:'UNSUPPORTED', reason:'QUERY_PROVIDER_ACTION_MISMATCH' }, context);
  }
  return routedResult({ route:'PROVIDER', intent, prepared:questionPrepared, status:intent?.status ?? null, reason:null }, context);
}

export async function routeMasterInputText(rawText, options = {}) {
  if (typeof rawText !== 'string' || !rawText.trim()) throw new TypeError('MASTER_INPUT_TEXT_REQUIRED');

  const decision = decideInputRoute(rawText);
  const interpretation = decision.route === 'INTERPRET' ? interpretIntentInput(rawText) : null;
  const routeText = decision.route === 'DIRECT' ? decision.normalizedForProbe : rawText;
  const prepared = prepareIntentPath(routeText, {
    receivedAt:options.receivedAt,
    timeZone:options.timeZone,
    requestIdFactory:options.requestIdFactory,
    ...(options.interpretedAt != null ? { interpretedAt:options.interpretedAt } : {}),
  });
  const context = Object.freeze({ decision, interpretation, sourceText:rawText });
  const hasQuestion = prepared.parsed?.groups?.some(group => group.intent === 'QUERY');

  if (decision.route === 'INTERPRET' && decision.reason === 'MULTI_GROUP') {
    if (!Number.isSafeInteger(options.baseRevision) || options.baseRevision < 0) {
      return routedResult({
        route:'STOP', prepared, intent:null, status:'BLOCKED', reason:'MULTI_GROUP_BASE_REVISION_REQUIRED',
      }, context);
    }
    let compiled;
    try {
      compiled = compileNaturalLanguageMultiGroup(prepared.parsed, {
        baseRevision:options.baseRevision,
        requestIdFactory:options.requestIdFactory,
        ...(options.compileId != null ? { compileId:options.compileId } : {}),
      });
    } catch (error) {
      return routedResult({
        route:'STOP', prepared, intent:null, status:'BLOCKED', reason:String(error?.message || error || 'MULTI_GROUP_FRONTDOOR_FAILED'),
      }, context);
    }
    if (compiled.boxes.length > 0) {
      return routedResult({
        route:'LOCAL_MULTI_GROUP', prepared, intent:null, status:compiled.status, reason:null,
        compileId:compiled.compileId, boxes:compiled.boxes, commands:compiled.commands,
      }, context);
    }
    const stopped = firstStoppedCommand(compiled);
    return routedResult({
      route:'STOP', prepared, intent:null,
      status:stopped?.status || compiled.status || 'BLOCKED',
      reason:stopped?.reason || 'MULTI_GROUP_EXECUTION_NOT_CONNECTED',
      compileId:compiled.compileId, boxes:compiled.boxes, commands:compiled.commands,
    }, context);
  }

  if (decision.route === 'INTERPRET' && interpretation?.capability === 'NOT_CONNECTED') {
    return routedResult({
      route:'STOP', prepared, intent:null, status:'UNSUPPORTED', reason:'INTERPRETED_CAPABILITY_NOT_CONNECTED',
    }, context);
  }

  if (prepared.status === 'QUERY') {
    return routedResult({ route:'LOCAL_QUERY', prepared, intent:prepared.intent, status:'READY', reason:null }, context);
  }

  if (prepared.status === 'READY') {
    return routedResult({ route:'LOCAL_PATH', prepared, intent:null, status:'READY', reason:null }, context);
  }

  if (prepared.status === 'BLOCKED' || prepared.status === 'REFERENCE') {
    return routedResult({ route:'STOP', prepared, intent:null, status:prepared.status, reason:prepared.reason }, context);
  }

  if (prepared.status === 'UNSUPPORTED') {
    if ((hasQuestion && localDirectClaim(prepared)) || LOCAL_STOP_REASONS.has(prepared.reason)) {
      return routedResult({ route:'STOP', prepared, intent:null, status:prepared.status, reason:prepared.reason }, context);
    }
    return providerRoute(rawText, options.interpretFallback, hasQuestion ? prepared : null, context);
  }

  if (prepared.status === 'RECOVERY_REQUIRED') {
    if (localDirectClaim(prepared)) {
      return routedResult({ route:'STOP', prepared, intent:null, status:'RECOVERY_REQUIRED', reason:prepared.reason }, context);
    }
    return providerRoute(rawText, options.interpretFallback, hasQuestion ? prepared : null, context);
  }

  return providerRoute(rawText, options.interpretFallback, hasQuestion ? prepared : null, context);
}
