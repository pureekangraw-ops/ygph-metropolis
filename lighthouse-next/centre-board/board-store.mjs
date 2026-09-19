import { createCentreBoard } from './board-contract.mjs';
import { createEmergencyCapsule } from './emergency-capsule.mjs';

export const CENTRE_BOARD_STORAGE_KEY = 'lighthouse-centre-board-live-v1';
export const CENTRE_BOARD_EMERGENCY_STORAGE_KEY = 'lighthouse-centre-board-emergency-v1';

function normalizeBoard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('CENTRE_BOARD_STORE_BOARD_REQUIRED');
  }
  return createCentreBoard({
    ...structuredClone(value),
    at:value.updatedAt,
  });
}

function normalizeCapsule(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('CENTRE_BOARD_EMERGENCY_CAPSULE_INVALID');
  }
  return createEmergencyCapsule(structuredClone(value));
}

function sameBoard(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameCapsule(left, right) {
  return left?.fingerprint === right?.fingerprint
    && left?.capsuleId === right?.capsuleId
    && left?.status === right?.status;
}

export function createLighthouseCentreBoardStore({
  storage = globalThis.localStorage,
  storageKey = CENTRE_BOARD_STORAGE_KEY,
  emergencyStorageKey = CENTRE_BOARD_EMERGENCY_STORAGE_KEY,
  eventTarget = globalThis,
} = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('CENTRE_BOARD_STORE_STORAGE_UNAVAILABLE');
  }

  function publish(name, detail) {
    if (!eventTarget || typeof eventTarget.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') return;
    try {
      eventTarget.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {}
  }

  function read() {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error('CENTRE_BOARD_STORE_CORRUPT'); }
    try { return normalizeBoard(parsed); }
    catch { throw new Error('CENTRE_BOARD_STORE_CORRUPT'); }
  }

  function write(boardValue, { expectedRevision = null } = {}) {
    const board = normalizeBoard(boardValue);
    const current = read();

    if (!current) {
      if (expectedRevision != null && Number(expectedRevision) !== 0) {
        throw new Error(`CENTRE_BOARD_REVISION_CONFLICT:${expectedRevision}/0`);
      }
      if (board.revision !== 1) throw new Error(`CENTRE_BOARD_REVISION_CONFLICT:0/${board.revision}`);
    } else {
      const expected = Number(expectedRevision);
      if (!Number.isSafeInteger(expected)) throw new Error('CENTRE_BOARD_STORE_EXPECTED_REVISION_REQUIRED');
      if (current.revision !== expected) {
        throw new Error(`CENTRE_BOARD_REVISION_CONFLICT:${expected}/${current.revision}`);
      }
      if (board.boardId !== current.boardId || board.workId !== current.workId) {
        throw new Error('CENTRE_BOARD_STORE_IDENTITY_CONFLICT');
      }
      if (board.revision === current.revision && sameBoard(board, current)) {
        publish('lighthouse:centre-board', current);
        return current;
      }
      if (board.revision !== current.revision + 1) {
        throw new Error(`CENTRE_BOARD_REVISION_CONFLICT:${current.revision + 1}/${board.revision}`);
      }
    }

    storage.setItem(storageKey, JSON.stringify(board));
    const readback = read();
    if (!readback || !sameBoard(readback, board)) throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
    publish('lighthouse:centre-board', readback);
    return readback;
  }

  function readEmergencyCapsules() {
    const raw = storage.getItem(emergencyStorageKey);
    if (!raw) return [];
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error('CENTRE_BOARD_EMERGENCY_STORE_CORRUPT'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('CENTRE_BOARD_EMERGENCY_STORE_CORRUPT');
    }
    try {
      return Object.values(parsed).map(normalizeCapsule);
    } catch {
      throw new Error('CENTRE_BOARD_EMERGENCY_STORE_CORRUPT');
    }
  }

  function writeEmergencyMap(map) {
    storage.setItem(emergencyStorageKey, JSON.stringify(map));
    const readback = readEmergencyCapsules();
    publish('lighthouse:centre-board-emergency', readback);
    return readback;
  }

  function saveEmergencyCapsule(capsuleValue) {
    const capsule = normalizeCapsule(capsuleValue);
    const current = Object.fromEntries(readEmergencyCapsules().map(item => [item.capsuleId, item]));
    const previous = current[capsule.capsuleId];
    if (previous && !sameCapsule(previous, capsule)) {
      throw new Error(`CENTRE_BOARD_CAPSULE_ID_CONFLICT:${capsule.capsuleId}`);
    }
    current[capsule.capsuleId] = capsule;
    const readback = writeEmergencyMap(current).find(item => item.capsuleId === capsule.capsuleId);
    if (!readback || !sameCapsule(readback, capsule)) {
      throw new Error('CENTRE_BOARD_EMERGENCY_READBACK_MISMATCH');
    }
    return readback;
  }

  function removeEmergencyCapsule(capsuleIdValue, { fingerprint = null } = {}) {
    const capsuleId = String(capsuleIdValue ?? '').trim();
    if (!capsuleId) throw new Error('CENTRE_BOARD_CAPSULE_ID_REQUIRED');
    const current = Object.fromEntries(readEmergencyCapsules().map(item => [item.capsuleId, item]));
    const existing = current[capsuleId];
    if (!existing) return false;
    if (fingerprint != null && existing.fingerprint !== fingerprint) {
      throw new Error(`CENTRE_BOARD_CAPSULE_ID_CONFLICT:${capsuleId}`);
    }
    delete current[capsuleId];
    const readback = writeEmergencyMap(current);
    if (readback.some(item => item.capsuleId === capsuleId)) {
      throw new Error('CENTRE_BOARD_EMERGENCY_READBACK_MISMATCH');
    }
    return true;
  }

  return Object.freeze({
    storageKey,
    emergencyStorageKey,
    read,
    write,
    readEmergencyCapsules,
    saveEmergencyCapsule,
    removeEmergencyCapsule,
  });
}
