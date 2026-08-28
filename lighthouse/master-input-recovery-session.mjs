import {
  applyOwnerCorrection,
  applySlotResult,
  classifyIncomingInput,
  nextRecoveryCycle,
  runLocalRecovery,
} from './intent-recovery.mjs';

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

export function createRecoverySession(routed, { inputId } = {}) {
  if (typeof inputId !== 'string' || !inputId.trim()) {
    throw new TypeError('MASTER_INPUT_RECOVERY_INPUT_ID_REQUIRED');
  }

  return {
    inputId:inputId.trim(),
    rawText:routed?.prepared?.parsed?.rawText ?? '',
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
