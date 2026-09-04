function cloneStateWithSlots(state) {
  return {
    ...state,
    slots: Object.fromEntries(
      Object.entries(state?.slots ?? {}).map(([slotId, slot]) => [slotId, { ...slot }]),
    ),
  };
}

export function resolveKnownErrorForm(history, rawValue) {
  const candidates = [];
  for (const [correct, errorForms] of Object.entries(history ?? {})) {
    if (errorForms && Object.hasOwn(errorForms, rawValue)) candidates.push(correct);
  }

  if (candidates.length === 1) {
    return { status:'RESOLVED', correct:candidates[0], candidates, needsAI:false };
  }
  if (candidates.length > 1) {
    return { status:'AMBIGUOUS', correct:null, candidates, needsAI:false };
  }
  return { status:'NO_MATCH', correct:null, candidates:[], needsAI:false };
}

export function runLocalRecovery(initialValue, passFns = []) {
  let value = initialValue;
  let localPasses = 0;
  const boundedPasses = passFns.slice(0, 3);

  for (const pass of boundedPasses) {
    localPasses += 1;
    const result = pass(value) ?? { resolved:false, value };
    if (Object.hasOwn(result, 'value')) value = result.value;
    if (result.resolved === true) {
      return { status:'RESOLVED', value, localPasses };
    }
  }

  return { status:'AI_REQUIRED', value, localPasses };
}

export function chooseCorrectionTargets(shownCandidates = [], selection = null) {
  const shown = [...shownCandidates];

  if (selection == null || selection === '') {
    if (shown.length === 1) return { status:'SELECTED', targets:[shown[0]] };
    return { status:'SELECTION_REQUIRED', targets:[] };
  }

  if (selection === 'ทั้งหมด') return { status:'SELECTED', targets:shown };
  if (shown.includes(selection)) return { status:'SELECTED', targets:[selection] };
  return { status:'NO_MATCH', targets:[] };
}

export function applyOwnerCorrection(state, { candidateSlotIds = [], payload, selection = null } = {}) {
  const chosen = chooseCorrectionTargets(candidateSlotIds, selection);
  if (chosen.status !== 'SELECTED') {
    return { ...chosen, state };
  }

  const nextState = cloneStateWithSlots(state);
  for (const slotId of chosen.targets) {
    const slot = nextState.slots[slotId];
    if (!slot) continue;
    nextState.slots[slotId] = {
      ...slot,
      value:payload,
      queueId:null,
      state:'CORRECTED',
    };
  }

  return { status:'APPLIED', targets:chosen.targets, state:nextState };
}

export function applySlotResult(state, { slotId, queueId, value } = {}) {
  const slot = state?.slots?.[slotId];
  if (!slot || !slot.queueId || slot.queueId !== queueId) {
    return { status:'STALE_RESULT', state };
  }

  const nextState = cloneStateWithSlots(state);
  nextState.slots[slotId] = {
    ...nextState.slots[slotId],
    value,
    queueId:null,
    state:'RESOLVED',
  };
  return { status:'APPLIED', state:nextState };
}

export function nextRecoveryCycle({ cycle = 1, unresolved = false } = {}) {
  if (!unresolved) return { status:'COMPLETE', cycle };
  if (cycle <= 1) return { status:'NEW_FLOW', cycle:2 };
  return { status:'REPLACE_REQUIRED', cycle:2, command:'แทนที่' };
}

function switchPayload(input) {
  const match = /^(?:ช่าง(?:อันเดิม|เรื่องเดิม)(?:ก่อน)?|ยกเลิก(?:อันเดิม|เรื่องเดิม)(?:ก่อน)?)[\s,，:：;；-]*(.+)$/u.exec(input);
  return match?.[1]?.trim() || null;
}

export function classifyIncomingInput(text) {
  if (typeof text !== 'string') throw new TypeError('INTENT_RECOVERY_TEXT_REQUIRED');
  const input = text.trim();

  const correction = /^แก้ไข\s+(.+)$/u.exec(input);
  if (correction) return { type:'CORRECTION', payload:correction[1].trim() };

  const replace = /^แทนที่\s+(.+)$/u.exec(input);
  if (replace) return { type:'REPLACE', payload:replace[1].trim() };

  if (/^(?:ยกเลิก(?:อันเดิม|เรื่องเดิม)?|ช่าง(?:อันเดิม|เรื่องเดิม)(?:ก่อน)?)$/u.test(input)) {
    return { type:'CANCEL', payload:null };
  }

  const switched = switchPayload(input);
  if (switched) return { type:'NEW_INPUT', payload:switched };

  return { type:'NEW_INPUT', payload:input };
}

export function recordVerifiedCorrection(history, event = {}) {
  const nextHistory = Object.fromEntries(
    Object.entries(history ?? {}).map(([correct, errors]) => [correct, { ...(errors ?? {}) }]),
  );

  const allowedSource = event.source === 'AI_RECOVERY' || event.source === 'BIG_RECOVERY';
  const learnable = event.verified === true
    && event.kind === 'WORD'
    && allowedSource
    && typeof event.wrong === 'string'
    && typeof event.correct === 'string'
    && event.wrong.trim()
    && event.correct.trim()
    && event.wrong !== event.correct;

  if (!learnable) return nextHistory;

  const correct = event.correct.trim();
  const wrong = event.wrong.trim();
  const parent = { ...(nextHistory[correct] ?? {}) };
  parent[wrong] = (parent[wrong] ?? 0) + 1;
  nextHistory[correct] = parent;
  return nextHistory;
}
