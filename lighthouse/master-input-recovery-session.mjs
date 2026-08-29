import {
  applyOwnerCorrection,
  applySlotResult,
  classifyIncomingInput,
  nextRecoveryCycle,
  runLocalRecovery,
} from './intent-recovery.mjs';
import { parseNumericText } from './intent-number.mjs';
import { prepareIntentPath } from './intent-path-adapter.mjs';

export const SEMANTIC_UI_TYPES = Object.freeze([
  'CONFIRM_TEXT',
  'PICK_DATE',
  'SELECT_TARGET',
  'ENTER_VALUE',
  'CONFIRM_ACTION',
]);

const SEMANTIC_UI_TYPE_SET = new Set(SEMANTIC_UI_TYPES);
const RECOVERABLE_STATES = new Set(['AMBIGUOUS', 'INVALID', 'WAITING']);
const NUMERIC_ROLES = new Set(['NUMBER', 'MONEY', 'QUANTITY']);
const DATE_ROLES = new Set(['DATE', 'TIME', 'DATETIME']);

function cloneSession(session) {
  return {
    ...session,
    slots:Object.fromEntries(
      Object.entries(session?.slots ?? {}).map(([slotId, slot]) => [slotId, { ...slot }]),
    ),
  };
}

function recoverySlots(routed) {
  const groups = routed?.prepared?.parsed?.groups;
  if (routed?.status !== 'RECOVERY_REQUIRED' || !Array.isArray(groups)) {
    throw new TypeError('MASTER_INPUT_RECOVERY_ROUTE_REQUIRED');
  }

  const slots = {};
  for (const group of groups) {
    for (const slot of group?.slots ?? []) {
      slots[slot.slotId] = {
        ...slot,
        groupId:group.groupId,
        value:slot.resolvedValue ?? slot.rawValue,
        queueId:null,
      };
    }
  }
  return slots;
}

function recoverableSlots(session) {
  return Object.values(session?.slots ?? {}).filter(slot => RECOVERABLE_STATES.has(slot?.state));
}

function recoverableSlotIds(session) {
  return recoverableSlots(session).map(slot => slot.slotId);
}

function scalarReplacement(slot) {
  // QUESTION stores the interpretation mode, not replacement text.
  if (slot?.role === 'QUESTION') return null;
  if (!slot || !['CORRECTED', 'RESOLVED'].includes(slot.state)) return null;
  if (typeof slot.value === 'string' || typeof slot.value === 'number') return String(slot.value);
  return null;
}

function replacementSpans(session) {
  const rawText = session?.rawText;
  if (typeof rawText !== 'string') throw new TypeError('MASTER_INPUT_RECOVERY_RAW_TEXT_REQUIRED');

  const replacements = [];
  for (const slot of Object.values(session?.slots ?? {})) {
    const replacement = scalarReplacement(slot);
    if (replacement == null) continue;
    const start = slot?.rawSpan?.start;
    const end = slot?.rawSpan?.end;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > rawText.length) {
      throw new TypeError('MASTER_INPUT_RECOVERY_SPAN_INVALID');
    }
    replacements.push({ start, end, replacement, slotId:slot.slotId });
  }

  replacements.sort((left, right) => right.start - left.start || right.end - left.end);
  let lastStart = rawText.length;
  for (const item of replacements) {
    if (item.end > lastStart) throw new TypeError('MASTER_INPUT_RECOVERY_SPAN_OVERLAP');
    lastStart = item.start;
  }
  return replacements;
}

function localRoute(prepared) {
  if (prepared.status === 'QUERY') {
    return Object.freeze({ route:'LOCAL_QUERY', status:'READY', reason:null, prepared, intent:prepared.intent });
  }
  if (prepared.status === 'READY') {
    return Object.freeze({ route:'LOCAL_PATH', status:'READY', reason:null, prepared, intent:null });
  }
  return Object.freeze({
    route:'STOP',
    status:prepared.status,
    reason:prepared.reason ?? null,
    prepared,
    intent:null,
  });
}

function refreshedRecoverySession(session, routed) {
  const refreshed = createRecoverySession(routed, { inputId:session.inputId });
  refreshed.originalRawText = typeof session.originalRawText === 'string'
    ? session.originalRawText
    : session.rawText;
  refreshed.cycle = session?.cycle ?? 1;
  return refreshed;
}

function replaceRecoverySessionState(session, refreshed) {
  session.inputId = refreshed.inputId;
  session.rawText = refreshed.rawText;
  session.originalRawText = refreshed.originalRawText;
  session.cycle = refreshed.cycle;
  session.status = refreshed.status;
  session.slots = refreshed.slots;
  return session;
}

function normalizedOptions(options) {
  if (!Array.isArray(options)) return Object.freeze([]);
  return Object.freeze(options.map(option => Object.freeze({
    value:String(option?.value ?? ''),
    label:String(option?.label ?? option?.value ?? ''),
  })));
}

export function createWaitingDirective(type, details = {}) {
  const normalizedType = String(type ?? '').trim().toUpperCase();
  if (!SEMANTIC_UI_TYPE_SET.has(normalizedType)) throw new TypeError('WAITING_DIRECTIVE_TYPE_INVALID');
  const telemetryTag = String(details.telemetryTag ?? (
    normalizedType === 'SELECT_TARGET' ? 'WAIT_AMBIGUOUS_TARGET' : 'WAIT_MISSING_PARAM'
  )).trim();
  return Object.freeze({
    status:'WAITING',
    type:normalizedType,
    telemetryTag,
    slotId:details.slotId == null ? null : String(details.slotId),
    groupId:details.groupId == null ? null : String(details.groupId),
    prompt:details.prompt == null ? null : String(details.prompt),
    options:normalizedOptions(details.options),
  });
}

function waitingOption(slot) {
  const raw = slot?.rawValue ?? slot?.value ?? slot?.role ?? slot?.slotId;
  return { value:slot.slotId, label:String(raw ?? slot.slotId) };
}

export function waitingDirectiveForSession(session) {
  const waiting = recoverableSlots(session);
  if (waiting.length === 0) return null;
  if (waiting.length > 1) {
    return createWaitingDirective('SELECT_TARGET', {
      telemetryTag:'WAIT_AMBIGUOUS_TARGET',
      prompt:'มีหลายจุดที่ต้องระบุให้ชัด เลือกจุดที่ต้องการตอบ',
      options:waiting.map(waitingOption),
    });
  }

  const slot = waiting[0];
  if (NUMERIC_ROLES.has(slot.role)) {
    return createWaitingDirective('ENTER_VALUE', {
      telemetryTag:'WAIT_MISSING_PARAM',
      slotId:slot.slotId,
      groupId:slot.groupId,
      prompt:'กรอกค่าที่ขาดเพื่อทำงานเดิมต่อ',
    });
  }
  if (DATE_ROLES.has(slot.role)) {
    return createWaitingDirective('PICK_DATE', {
      telemetryTag:'WAIT_MISSING_PARAM',
      slotId:slot.slotId,
      groupId:slot.groupId,
      prompt:'เลือกวันที่หรือเวลาเพื่อทำงานเดิมต่อ',
    });
  }
  if (slot.role === 'TARGET') {
    return createWaitingDirective('CONFIRM_TEXT', {
      telemetryTag:slot.state === 'AMBIGUOUS' ? 'WAIT_AMBIGUOUS_TARGET' : 'WAIT_MISSING_PARAM',
      slotId:slot.slotId,
      groupId:slot.groupId,
      prompt:'ยืนยันข้อความหรือเป้าหมายเพื่อทำงานเดิมต่อ',
    });
  }
  return createWaitingDirective('CONFIRM_TEXT', {
    telemetryTag:slot.state === 'AMBIGUOUS' ? 'WAIT_AMBIGUOUS_TARGET' : 'WAIT_MISSING_PARAM',
    slotId:slot.slotId,
    groupId:slot.groupId,
    prompt:'ยืนยันข้อมูลเพื่อทำงานเดิมต่อ',
  });
}

function abortSession(session, payload) {
  const state = cloneSession(session);
  state.status = 'ABORTED';
  for (const slot of Object.values(state.slots)) slot.queueId = null;
  return {
    status:'ABORTED',
    reason:'ABORTED_BY_USER_INTERRUPTION',
    payload:payload == null ? null : String(payload),
    state,
  };
}

function directAnswerCandidateIds(session, payload) {
  const text = String(payload ?? '').trim();
  if (!text || /\s/u.test(text)) return [];
  const numeric = parseNumericText(text);
  if (numeric.state !== 'RESOLVED') return [];
  return recoverableSlots(session)
    .filter(slot => NUMERIC_ROLES.has(slot.role))
    .map(slot => slot.slotId);
}

export function createRecoverySession(routed, { inputId } = {}) {
  if (typeof inputId !== 'string' || !inputId.trim()) {
    throw new TypeError('MASTER_INPUT_RECOVERY_INPUT_ID_REQUIRED');
  }

  const rawText = routed?.prepared?.parsed?.rawText ?? '';
  return {
    inputId:inputId.trim(),
    rawText,
    originalRawText:rawText,
    cycle:1,
    status:'RECOVERY_REQUIRED',
    slots:recoverySlots(routed),
  };
}

export function runSessionLocalRecovery(session, { slotId, passFns = [], queueIdFactory } = {}) {
  const slot = session?.slots?.[slotId];
  if (!slot) throw new TypeError('MASTER_INPUT_RECOVERY_SLOT_REQUIRED');

  const recovered = runLocalRecovery(slot.value, passFns);
  const state = cloneSession(session);

  if (recovered.status === 'RESOLVED') {
    state.slots[slotId] = {
      ...state.slots[slotId],
      value:recovered.value,
      queueId:null,
      state:'RESOLVED',
    };
    return { ...recovered, state };
  }

  if (typeof queueIdFactory !== 'function') {
    throw new TypeError('MASTER_INPUT_RECOVERY_QUEUE_ID_FACTORY_REQUIRED');
  }
  const queueId = queueIdFactory();
  if (typeof queueId !== 'string' || !queueId.trim()) {
    throw new TypeError('MASTER_INPUT_RECOVERY_QUEUE_ID_REQUIRED');
  }

  state.slots[slotId] = {
    ...state.slots[slotId],
    value:recovered.value,
    queueId:queueId.trim(),
    state:'WAITING',
  };
  return { ...recovered, state };
}

export function applySessionOwnerInput(session, text, { selection = null } = {}) {
  const incoming = classifyIncomingInput(text);

  if (incoming.type === 'CANCEL') return abortSession(session, null);

  if (incoming.type === 'NEW_INPUT') {
    const directCandidates = directAnswerCandidateIds(session, incoming.payload);
    if (directCandidates.length > 0) {
      return applyOwnerCorrection(session, {
        candidateSlotIds:directCandidates,
        payload:incoming.payload,
        selection:directCandidates.length === 1 ? directCandidates[0] : selection,
      });
    }
    return abortSession(session, incoming.payload);
  }

  if (incoming.type === 'REPLACE') {
    const state = cloneSession(session);
    state.status = 'REPLACED';
    for (const slot of Object.values(state.slots)) {
      slot.queueId = null;
    }
    return { status:'REPLACE', payload:incoming.payload, state };
  }

  return applyOwnerCorrection(session, {
    candidateSlotIds:recoverableSlotIds(session),
    payload:incoming.payload,
    selection,
  });
}

export function applySessionResult(session, result = {}) {
  return applySlotResult(session, result);
}

export function advanceSessionCycle(session, { unresolved = false } = {}) {
  const next = nextRecoveryCycle({ cycle:session?.cycle ?? 1, unresolved });
  const state = cloneSession(session);
  state.cycle = next.cycle;
  if (next.status === 'COMPLETE' || next.status === 'REPLACE_REQUIRED') {
    state.status = next.status;
  }
  return { ...next, state };
}

export function reassembleRecoverySession(session) {
  if (typeof session?.inputId !== 'string' || !session.inputId.trim()) {
    throw new TypeError('MASTER_INPUT_RECOVERY_INPUT_ID_REQUIRED');
  }
  const sourceRawText = session.rawText;
  const originalRawText = typeof session.originalRawText === 'string'
    ? session.originalRawText
    : sourceRawText;
  let text = sourceRawText;
  for (const item of replacementSpans(session)) {
    text = `${text.slice(0, item.start)}${item.replacement}${text.slice(item.end)}`;
  }
  return Object.freeze({ inputId:session.inputId, originalRawText, text });
}

export async function rejoinRecoverySession(session, options = {}) {
  const reassembled = reassembleRecoverySession(session);
  const prepared = prepareIntentPath(reassembled.text, options);
  const routed = localRoute(prepared);
  const recoverySession = routed.status === 'RECOVERY_REQUIRED'
    ? replaceRecoverySessionState(session, refreshedRecoverySession(session, routed))
    : null;
  return Object.freeze({
    ...reassembled,
    routed,
    ...(recoverySession ? { recoverySession } : {}),
  });
}
