import { createCentreBoard } from './board-contract.mjs';
import { enterCentreBoard, returnCentreBoard } from './board-session.mjs';
import { createEmergencyCapsule, recoverEmergencyCapsule } from './emergency-capsule.mjs';

export const CENTRE_BOARD_STORAGE_KEY = 'lighthouse-centre-board-v1';
export const CENTRE_BOARD_EMERGENCY_STORAGE_KEY = 'lighthouse-centre-board-emergency-v1';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function boardFrom(value) {
  if (value == null) return null;
  return createCentreBoard({ ...clone(value), at:value.updatedAt });
}

function parseObject(raw, fallback) {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function capsuleRecord(value) {
  const capsule = createEmergencyCapsule(value);
  return clone(capsule);
}

export function createMemoryCentreBoardStorage(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  return Object.freeze({
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    dump() { return Object.fromEntries(values); },
  });
}

export function createCentreBoardStore({
  storage = globalThis.localStorage,
  boardKey = CENTRE_BOARD_STORAGE_KEY,
  emergencyKey = CENTRE_BOARD_EMERGENCY_STORAGE_KEY,
  now = () => new Date().toISOString(),
} = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('CENTRE_BOARD_STORAGE_UNAVAILABLE');
  }

  function read() {
    const raw = storage.getItem(boardKey);
    if (!raw) return null;
    const parsed = parseObject(raw, null);
    if (!parsed) throw new Error('CENTRE_BOARD_STORAGE_CORRUPT');
    return boardFrom(parsed);
  }

  function persist(boardValue) {
    const board = boardFrom(boardValue);
    storage.setItem(boardKey, JSON.stringify(board));
    const readback = read();
    if (!readback || readback.revision !== board.revision || readback.updatedAt !== board.updatedAt) {
      throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
    }
    return readback;
  }

  function initialize(boardValue, { ifAbsent = true } = {}) {
    const current = read();
    if (current && ifAbsent) return current;
    return persist(boardValue);
  }

  function requireBoard() {
    const board = read();
    if (!board) throw new Error('CENTRE_BOARD_NOT_INITIALIZED');
    return board;
  }

  function claim(input = {}) {
    const current = requireBoard();
    const result = enterCentreBoard(current, input);
    const board = persist(result.board);
    const pins = new Set(result.receipt.claimedPinIds || []);
    const matches = board.revision === result.receipt.readbackRevision
      && board.pins.filter(pin => pins.has(pin.pinId)).every(pin =>
        pin.status === 'DOING' && pin.ownerEmployeeId === result.receipt.employeeId,
      );
    if (!matches) throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
    return Object.freeze({ status:'VERIFIED', board, receipt:clone(result.receipt) });
  }

  function returnWork(input = {}) {
    const current = requireBoard();
    const result = returnCentreBoard(current, input);
    const board = persist(result.board);
    if (board.revision !== result.receipt.readbackRevision) {
      throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
    }
    return Object.freeze({ status:'VERIFIED', board, receipt:clone(result.receipt) });
  }

  function emergencyMap() {
    return parseObject(storage.getItem(emergencyKey), {});
  }

  function writeEmergencyMap(value) {
    storage.setItem(emergencyKey, JSON.stringify(value));
    return emergencyMap();
  }

  function saveEmergency(input = {}) {
    const capsule = createEmergencyCapsule({
      ...clone(input),
      at:input.at || now(),
    });
    const current = emergencyMap();
    const previous = current[capsule.capsuleId];
    if (previous && previous.fingerprint !== capsule.fingerprint) {
      throw new Error(`CENTRE_BOARD_CAPSULE_ID_CONFLICT:${capsule.capsuleId}`);
    }
    current[capsule.capsuleId] = clone(capsule);
    const persisted = writeEmergencyMap(current)[capsule.capsuleId];
    if (!persisted || persisted.fingerprint !== capsule.fingerprint) {
      throw new Error('CENTRE_BOARD_EMERGENCY_READBACK_MISMATCH');
    }
    return capsuleRecord(persisted);
  }

  function emergencyCapsules() {
    return Object.values(emergencyMap()).map(capsuleRecord);
  }

  function recover({ capsuleId, capsule:inputCapsule, receiptId, at } = {}) {
    const current = requireBoard();
    let capsule = inputCapsule ? saveEmergency(inputCapsule) : null;
    if (!capsule) {
      const id = String(capsuleId ?? '').trim();
      if (!id) throw new Error('CENTRE_BOARD_CAPSULE_ID_REQUIRED');
      const stored = emergencyMap()[id];
      if (!stored) throw new Error(`CENTRE_BOARD_CAPSULE_NOT_FOUND:${id}`);
      capsule = capsuleRecord(stored);
    }

    const result = recoverEmergencyCapsule(current, capsule, {
      receiptId,
      at:at || now(),
    });
    if (result.status === 'CONFLICT') {
      return Object.freeze({
        status:'CONFLICT',
        reason:result.reason,
        board:clone(result.board),
        capsule:clone(capsule),
      });
    }

    const board = persist(result.board);
    if (board.revision !== result.receipt.readbackRevision) {
      throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
    }
    const map = emergencyMap();
    delete map[capsule.capsuleId];
    writeEmergencyMap(map);
    return Object.freeze({
      status:'VERIFIED',
      board,
      capsule:clone(capsule),
      receipt:clone(result.receipt),
    });
  }

  function deferReturn({
    capsuleId,
    workId,
    employeeId,
    reason,
    claimedPinIds,
    pendingChanges,
    evidence = [],
    baseBoardRevision,
    at,
  } = {}) {
    const board = requireBoard();
    const expected = baseBoardRevision == null ? board.revision : Number(baseBoardRevision);
    return saveEmergency({
      capsuleId,
      workId,
      employeeId,
      reason,
      baseBoardRevision:expected,
      claimedPinIds,
      pendingChanges,
      evidence,
      at:at || now(),
    });
  }

  return Object.freeze({
    read,
    initialize,
    claim,
    returnWork,
    deferReturn,
    saveEmergency,
    emergencyCapsules,
    recover,
  });
}
