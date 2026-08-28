import {
  applyOwnerCorrection,
  applySlotResult,
  classifyIncomingInput,
  nextRecoveryCycle,
  runLocalRecovery,
} from './intent-recovery.mjs';
import { prepareIntentPath } from './intent-path-adapter.mjs';

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

function recoverableSlotIds(session) {
  const recoverableStates = new Set(['AMBIGUOUS', 'INVALID', 'WAITING']);
  return Object.values(session?.slots ?? {})
    .filter(slot => recoverableStates.has(slot?.state))
    .map(slot => slot.slotId);
}

function scalarReplacement(slot) {
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

  if (incoming.type === 'NEW_INPUT') {
    return { status:'NEW_INPUT', payload:incoming.payload, state:cloneSession(session) };
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
