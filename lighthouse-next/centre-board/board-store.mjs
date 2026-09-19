import { createCentreBoard } from './board-contract.mjs';

export const CENTRE_BOARD_STORAGE_KEY = 'lighthouse-centre-board-live-v1';

function normalizeBoard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('CENTRE_BOARD_STORE_BOARD_REQUIRED');
  }
  return createCentreBoard({
    ...structuredClone(value),
    at:value.updatedAt,
  });
}

function sameBoard(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createLighthouseCentreBoardStore({
  storage = globalThis.localStorage,
  storageKey = CENTRE_BOARD_STORAGE_KEY,
  eventTarget = globalThis,
} = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('CENTRE_BOARD_STORE_STORAGE_UNAVAILABLE');
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

  function publish(board) {
    if (!eventTarget || typeof eventTarget.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') return;
    try {
      eventTarget.dispatchEvent(new CustomEvent('lighthouse:centre-board', { detail:board }));
    } catch {}
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
        publish(current);
        return current;
      }
      if (board.revision !== current.revision + 1) {
        throw new Error(`CENTRE_BOARD_REVISION_CONFLICT:${current.revision + 1}/${board.revision}`);
      }
    }

    storage.setItem(storageKey, JSON.stringify(board));
    const readback = read();
    if (!readback || !sameBoard(readback, board)) throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
    publish(readback);
    return readback;
  }

  return Object.freeze({
    storageKey,
    read,
    write,
  });
}
