export const LIGHTHOUSE_WORK_CIRCULATION_STORAGE_KEY = 'lighthouse-work-circulation-v1';
export const LIGHTHOUSE_WORK_CIRCULATION_SCHEMA_VERSION = 1;

const TICKET_STATUSES = new Set(['ACTIVE','RECOVERY']);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function optionalText(value) {
  const output = String(value ?? '').trim();
  return output || null;
}

function stringList(value, code) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(code);
  const output = value.map(item => requiredText(item, code));
  if (new Set(output).size !== output.length) throw new Error(code);
  return output;
}

function normalizeTicket(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('LIGHTHOUSE_CIRCULATION_TICKET_INVALID');
  }
  const status = String(value.status ?? 'ACTIVE').trim();
  if (!TICKET_STATUSES.has(status)) throw new Error('LIGHTHOUSE_CIRCULATION_TICKET_STATUS_INVALID');
  const pinIds = stringList(value.pinIds, 'LIGHTHOUSE_CIRCULATION_PIN_IDS_REQUIRED');
  return Object.freeze({
    ticketId:requiredText(value.ticketId, 'LIGHTHOUSE_CIRCULATION_TICKET_ID_REQUIRED'),
    workId:requiredText(value.workId, 'LIGHTHOUSE_CIRCULATION_WORK_ID_REQUIRED'),
    employeeId:requiredText(value.employeeId, 'LIGHTHOUSE_CIRCULATION_EMPLOYEE_ID_REQUIRED'),
    pinIds:Object.freeze([...pinIds]),
    status,
    boardRevision:Number.isSafeInteger(Number(value.boardRevision)) ? Number(value.boardRevision) : null,
    claimReceiptId:optionalText(value.claimReceiptId),
    lastReceiptId:optionalText(value.lastReceiptId),
    emergencyCapsuleId:optionalText(value.emergencyCapsuleId),
    claimedAt:optionalText(value.claimedAt),
    updatedAt:requiredText(value.updatedAt, 'LIGHTHOUSE_CIRCULATION_UPDATED_AT_REQUIRED'),
  });
}

function normalizeHistoryEntry(value = {}) {
  const output = normalizeTicket({
    ...value,
    status:value.status === 'RECOVERY' ? 'RECOVERY' : 'ACTIVE',
  });
  return Object.freeze({
    ...output,
    status:'RETURNED',
    closedAt:requiredText(value.closedAt ?? value.updatedAt, 'LIGHTHOUSE_CIRCULATION_CLOSED_AT_REQUIRED'),
  });
}

function normalizeState(value, at) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const activeSource = source.active && typeof source.active === 'object' && !Array.isArray(source.active)
    ? source.active
    : {};
  const active = {};
  for (const [key, ticket] of Object.entries(activeSource)) {
    const normalized = normalizeTicket(ticket);
    if (key !== normalized.ticketId) throw new Error('LIGHTHOUSE_CIRCULATION_STORAGE_CORRUPT');
    active[key] = normalized;
  }
  const history = Array.isArray(source.history)
    ? source.history.slice(-50).map(normalizeHistoryEntry)
    : [];
  return Object.freeze({
    schemaVersion:LIGHTHOUSE_WORK_CIRCULATION_SCHEMA_VERSION,
    revision:Number.isSafeInteger(Number(source.revision)) && Number(source.revision) >= 0 ? Number(source.revision) : 0,
    updatedAt:optionalText(source.updatedAt) || at,
    active:Object.freeze(active),
    history:Object.freeze(history),
  });
}

export function createMemoryWorkCirculationStorage(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  return Object.freeze({
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    dump() { return Object.fromEntries(values); },
  });
}

export function createLighthouseWorkCirculation({
  boardBridge,
  storage = globalThis.localStorage,
  storageKey = LIGHTHOUSE_WORK_CIRCULATION_STORAGE_KEY,
  now = () => new Date().toISOString(),
  eventTarget = globalThis,
} = {}) {
  if (!boardBridge
    || typeof boardBridge.readBoard !== 'function'
    || typeof boardBridge.claimPins !== 'function'
    || typeof boardBridge.returnPins !== 'function'
    || typeof boardBridge.recoverEmergency !== 'function') {
    throw new Error('LIGHTHOUSE_CIRCULATION_BOARD_BRIDGE_REQUIRED');
  }
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('LIGHTHOUSE_CIRCULATION_STORAGE_UNAVAILABLE');
  }

  function load() {
    const at = now();
    const raw = storage.getItem(storageKey);
    if (!raw) return normalizeState(null, at);
    try {
      return normalizeState(JSON.parse(raw), at);
    } catch {
      throw new Error('LIGHTHOUSE_CIRCULATION_STORAGE_CORRUPT');
    }
  }

  function publish(state) {
    if (!eventTarget || typeof eventTarget.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') return;
    try {
      eventTarget.dispatchEvent(new CustomEvent('lighthouse:work-circulation', { detail:clone(state) }));
    } catch {}
  }

  function persist(mutator) {
    const current = load();
    const next = {
      schemaVersion:LIGHTHOUSE_WORK_CIRCULATION_SCHEMA_VERSION,
      revision:current.revision + 1,
      updatedAt:now(),
      active:clone(current.active),
      history:clone(current.history),
    };
    mutator(next);
    next.history = (next.history || []).slice(-50);
    const normalized = normalizeState(next, next.updatedAt);
    storage.setItem(storageKey, JSON.stringify(normalized));
    const readback = load();
    if (JSON.stringify(readback) !== JSON.stringify(normalized)) {
      throw new Error('LIGHTHOUSE_CIRCULATION_READBACK_MISMATCH');
    }
    publish(readback);
    return readback;
  }

  function ticketFor(workIdValue, employeeIdValue) {
    const workId = requiredText(workIdValue, 'LIGHTHOUSE_CIRCULATION_WORK_ID_REQUIRED');
    const employeeId = requiredText(employeeIdValue, 'LIGHTHOUSE_CIRCULATION_EMPLOYEE_ID_REQUIRED');
    return Object.values(load().active).find(ticket =>
      ticket.workId === workId && ticket.employeeId === employeeId,
    ) || null;
  }

  function sameActive(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function boardWorkingTickets() {
    const board = readBoard();
    const capsules = readEmergencyCapsules();
    const groups = new Map();

    if (board && Array.isArray(board.pins)) {
      for (const pin of board.pins) {
        const employeeId = optionalText(pin?.ownerEmployeeId);
        if (!employeeId || !['DOING','PENDING_RECOVERY'].includes(String(pin?.status || ''))) continue;
        const key = `${board.workId}::${employeeId}`;
        const group = groups.get(key) || {
          workId:board.workId,
          employeeId,
          pinIds:[],
          hasPendingRecovery:false,
          boardRevision:board.revision,
          updatedAt:board.updatedAt,
          capsule:null,
        };
        if (!group.pinIds.includes(pin.pinId)) group.pinIds.push(pin.pinId);
        if (pin.status === 'PENDING_RECOVERY') group.hasPendingRecovery = true;
        groups.set(key, group);
      }
    }

    for (const capsule of capsules) {
      const key = `${capsule.workId}::${capsule.employeeId}`;
      const group = groups.get(key) || {
        workId:capsule.workId,
        employeeId:capsule.employeeId,
        pinIds:[],
        hasPendingRecovery:true,
        boardRevision:board?.workId === capsule.workId ? board.revision : capsule.baseBoardRevision,
        updatedAt:board?.workId === capsule.workId ? board.updatedAt : capsule.at,
        capsule:null,
      };
      for (const pinId of capsule.claimedPinIds || []) {
        if (!group.pinIds.includes(pinId)) group.pinIds.push(pinId);
      }
      group.hasPendingRecovery = true;
      group.capsule = capsule;
      groups.set(key, group);
    }

    const expected = {};
    const current = load();
    for (const group of groups.values()) {
      if (!group.pinIds.length) continue;
      const existing = Object.values(current.active).find(ticket =>
        ticket.workId === group.workId && ticket.employeeId === group.employeeId,
      ) || null;
      const ticketId = existing?.ticketId || `board:${group.workId}:${group.employeeId}`;
      expected[ticketId] = normalizeTicket({
        ticketId,
        workId:group.workId,
        employeeId:group.employeeId,
        pinIds:group.pinIds,
        status:group.capsule || group.hasPendingRecovery ? 'RECOVERY' : 'ACTIVE',
        boardRevision:group.boardRevision,
        claimReceiptId:existing?.claimReceiptId ?? null,
        lastReceiptId:existing?.lastReceiptId ?? null,
        emergencyCapsuleId:group.capsule?.capsuleId ?? existing?.emergencyCapsuleId ?? null,
        claimedAt:existing?.claimedAt ?? group.capsule?.at ?? group.updatedAt ?? now(),
        updatedAt:group.updatedAt ?? group.capsule?.at ?? now(),
      });
    }
    return expected;
  }

  function reconcile() {
    const current = load();
    const expected = boardWorkingTickets();
    if (sameActive(current.active, expected)) return current;
    return persist(next => {
      const previous = next.active || {};
      for (const [ticketId, ticket] of Object.entries(previous)) {
        if (expected[ticketId]) continue;
        next.history.push({
          ...ticket,
          status:'RETURNED',
          updatedAt:now(),
          closedAt:now(),
        });
      }
      next.active = clone(expected);
    });
  }

  function readBoard() {
    return boardBridge.readBoard();
  }

  function readEmergencyCapsules() {
    return typeof boardBridge.readEmergencyCapsules === 'function'
      ? boardBridge.readEmergencyCapsules()
      : [];
  }

  function claimPins(input = {}) {
    const verified = boardBridge.claimPins(input);
    if (!verified || verified.status !== 'VERIFIED') {
      throw new Error('LIGHTHOUSE_CIRCULATION_CLAIM_NOT_VERIFIED');
    }
    const receipt = verified.receipt || {};
    const ticketId = requiredText(receipt.receiptId ?? input.receiptId, 'LIGHTHOUSE_CIRCULATION_TICKET_ID_REQUIRED');
    const ticket = normalizeTicket({
      ticketId,
      workId:receipt.workId ?? input.workId,
      employeeId:receipt.employeeId ?? input.employeeId,
      pinIds:receipt.claimedPinIds ?? input.pinIds,
      status:'ACTIVE',
      boardRevision:verified.boardRevision ?? receipt.readbackRevision ?? null,
      claimReceiptId:ticketId,
      lastReceiptId:ticketId,
      emergencyCapsuleId:null,
      claimedAt:receipt.at ?? input.at ?? now(),
      updatedAt:receipt.at ?? input.at ?? now(),
    });

    const state = persist(next => {
      const existing = next.active[ticketId];
      if (existing && JSON.stringify(existing) !== JSON.stringify(ticket)) {
        throw new Error(`LIGHTHOUSE_CIRCULATION_TICKET_ID_CONFLICT:${ticketId}`);
      }
      next.active[ticketId] = ticket;
    });
    return Object.freeze({
      ...verified,
      circulation:Object.freeze({ ticket:clone(state.active[ticketId]), state }),
    });
  }

  function assertReturnTicket(input = {}) {
    const ticket = ticketFor(input.workId, input.employeeId);
    if (!ticket) throw new Error('LIGHTHOUSE_CIRCULATION_ACTIVE_TICKET_REQUIRED');
    const updateIds = stringList(
      Array.isArray(input.updates) ? input.updates.map(update => update?.pinId) : [],
      'LIGHTHOUSE_CIRCULATION_RETURN_PIN_IDS_REQUIRED',
    );
    const claimed = new Set(ticket.pinIds);
    if (updateIds.some(pinId => !claimed.has(pinId))) {
      throw new Error('LIGHTHOUSE_CIRCULATION_RETURN_PIN_NOT_CLAIMED');
    }
    return ticket;
  }

  function closeTicket(ticket, verified) {
    const receipt = verified?.receipt || {};
    return persist(next => {
      delete next.active[ticket.ticketId];
      next.history.push({
        ...ticket,
        status:'RETURNED',
        boardRevision:verified?.boardRevision ?? receipt.readbackRevision ?? ticket.boardRevision,
        lastReceiptId:receipt.receiptId ?? ticket.lastReceiptId,
        emergencyCapsuleId:null,
        updatedAt:receipt.at ?? now(),
        closedAt:receipt.at ?? now(),
      });
    });
  }

  function returnPins(input = {}) {
    const ticket = assertReturnTicket(input);
    try {
      const verified = boardBridge.returnPins(input);
      if (!verified || verified.status !== 'VERIFIED') {
        throw new Error('LIGHTHOUSE_CIRCULATION_RETURN_NOT_VERIFIED');
      }
      const state = closeTicket(ticket, verified);
      return Object.freeze({
        ...verified,
        circulation:Object.freeze({ ticketId:ticket.ticketId, status:'RETURNED', state }),
      });
    } catch (error) {
      const code = String(error?.message || error || 'LIGHTHOUSE_CIRCULATION_RETURN_FAILED');
      if (/CENTRE_BOARD_REVISION_CONFLICT:/.test(code) && typeof boardBridge.stageEmergency === 'function') {
        try {
          stageEmergency({
            capsuleId:optionalText(input.capsuleId) || requiredText(input.receiptId, 'CENTRE_BOARD_CAPSULE_ID_REQUIRED'),
            workId:ticket.workId,
            employeeId:ticket.employeeId,
            reason:'CENTRE_BOARD_REVISION_CONFLICT',
            baseBoardRevision:Number(input.expectedRevision),
            claimedPinIds:ticket.pinIds,
            pendingChanges:clone(input.updates),
            evidence:[],
            at:optionalText(input.at) || now(),
          });
        } catch {}
      }
      throw error;
    }
  }

  function stageEmergency(capsule) {
    if (typeof boardBridge.stageEmergency !== 'function') {
      throw new Error('LIGHTHOUSE_CIRCULATION_EMERGENCY_UNAVAILABLE');
    }
    const stored = boardBridge.stageEmergency(capsule);
    const workId = requiredText(stored.workId, 'LIGHTHOUSE_CIRCULATION_WORK_ID_REQUIRED');
    const employeeId = requiredText(stored.employeeId, 'LIGHTHOUSE_CIRCULATION_EMPLOYEE_ID_REQUIRED');
    const existing = ticketFor(workId, employeeId);
    const ticketId = existing?.ticketId || `emergency:${stored.capsuleId}`;
    const pinIds = existing?.pinIds?.length ? existing.pinIds : stored.claimedPinIds;
    const state = persist(next => {
      next.active[ticketId] = normalizeTicket({
        ticketId,
        workId,
        employeeId,
        pinIds,
        status:'RECOVERY',
        boardRevision:stored.baseBoardRevision,
        claimReceiptId:existing?.claimReceiptId ?? null,
        lastReceiptId:existing?.lastReceiptId ?? null,
        emergencyCapsuleId:stored.capsuleId,
        claimedAt:existing?.claimedAt ?? stored.at,
        updatedAt:stored.at ?? now(),
      });
    });
    return Object.freeze({
      capsule:clone(stored),
      circulation:Object.freeze({ ticket:clone(state.active[ticketId]), state }),
    });
  }

  function recoverEmergency(input = {}) {
    let capsule = input.capsule || null;
    if (!capsule && input.capsuleId && typeof boardBridge.readEmergencyCapsules === 'function') {
      capsule = boardBridge.readEmergencyCapsules().find(item => item.capsuleId === String(input.capsuleId)) || null;
    }
    const existing = capsule ? ticketFor(capsule.workId, capsule.employeeId) : null;
    try {
      const verified = boardBridge.recoverEmergency(input);
      if (!verified || verified.status !== 'VERIFIED') {
        throw new Error('LIGHTHOUSE_CIRCULATION_RECOVERY_NOT_VERIFIED');
      }
      let state = load();
      if (existing) state = closeTicket(existing, verified);
      return Object.freeze({
        ...verified,
        circulation:Object.freeze({
          ticketId:existing?.ticketId ?? null,
          status:'RETURNED',
          state,
        }),
      });
    } catch (error) {
      const code = String(error?.message || error || 'LIGHTHOUSE_CIRCULATION_RECOVERY_FAILED');
      if (existing && /REVISION|RECOVERY_CONFLICT/.test(code)) {
        persist(next => {
          next.active[existing.ticketId] = normalizeTicket({
            ...existing,
            status:'RECOVERY',
            emergencyCapsuleId:capsule?.capsuleId ?? existing.emergencyCapsuleId,
            updatedAt:now(),
          });
        });
      }
      throw error;
    }
  }

  function state() {
    return load();
  }

  function activeTickets() {
    return Object.values(load().active).map(clone);
  }

  function history() {
    return load().history.map(clone);
  }

  return Object.freeze({
    storageKey,
    readBoard,
    readEmergencyCapsules,
    claimPins,
    returnPins,
    stageEmergency,
    recoverEmergency,
    state,
    activeTickets,
    history,
    reconcile,
  });
}
