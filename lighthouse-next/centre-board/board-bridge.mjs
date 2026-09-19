import { enterCentreBoard, returnCentreBoard } from './board-session.mjs';
import { recoverEmergencyCapsule } from './emergency-capsule.mjs';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

export function createLighthouseCentreBoardBridge({
  store,
  now = () => new Date().toISOString(),
} = {}) {
  if (!store || typeof store.read !== 'function' || typeof store.write !== 'function') {
    throw new Error('CENTRE_BOARD_BRIDGE_STORE_REQUIRED');
  }

  function readBoard() {
    return store.read();
  }

  function initializeBoard({
    board,
    expectedRevision = 0,
  } = {}) {
    if (readBoard()) throw new Error('CENTRE_BOARD_ALREADY_INITIALIZED');
    if (Number(expectedRevision) !== 0) {
      throw new Error('CENTRE_BOARD_INITIALIZE_EXPECTED_REVISION_INVALID');
    }
    const saved = store.write(board, { expectedRevision:0 });
    if (!saved || saved.revision !== 1) throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
    return verified(saved, null, { initialized:true });
  }

  function verified(board, receipt, extra = {}) {
    return Object.freeze({
      status:'VERIFIED',
      boardRevision:board?.revision ?? null,
      boardUpdatedAt:board?.updatedAt ?? null,
      receipt:clone(receipt),
      ...extra,
    });
  }

  function claimPins({
    receiptId,
    workId,
    employeeId,
    pinIds,
    expectedRevision,
    at = now(),
  } = {}) {
    const current = readBoard();
    if (!current) throw new Error('CENTRE_BOARD_NOT_INITIALIZED');
    const output = enterCentreBoard(current, {
      receiptId,
      workId,
      employeeId,
      pinIds,
      expectedRevision,
      at,
    });
    const saved = store.write(output.board, { expectedRevision:current.revision });
    if (saved.revision !== output.receipt.readbackRevision) {
      throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
    }
    return verified(saved, output.receipt);
  }

  function returnPins({
    receiptId,
    workId,
    employeeId,
    expectedRevision,
    updates,
    at = now(),
  } = {}) {
    const current = readBoard();
    if (!current) throw new Error('CENTRE_BOARD_NOT_INITIALIZED');
    const output = returnCentreBoard(current, {
      receiptId,
      workId,
      employeeId,
      expectedRevision,
      updates,
      at,
    });
    const saved = store.write(output.board, { expectedRevision:current.revision });
    if (saved.revision !== output.receipt.readbackRevision) {
      throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
    }
    return verified(saved, output.receipt);
  }

  function recoverEmergency({
    capsule,
    receiptId,
    at = now(),
  } = {}) {
    const current = readBoard();
    if (!current) throw new Error('CENTRE_BOARD_NOT_INITIALIZED');
    const output = recoverEmergencyCapsule(current, capsule, {
      receiptId:text(receiptId, 'CENTRE_BOARD_RECEIPT_ID_REQUIRED'),
      at,
    });
    if (output.status === 'CONFLICT') {
      throw new Error(output.reason || 'CENTRE_BOARD_RECOVERY_CONFLICT');
    }
    if (output.status !== 'RECOVERED') {
      throw new Error('CENTRE_BOARD_RECOVERY_NOT_VERIFIED');
    }
    const saved = store.write(output.board, { expectedRevision:current.revision });
    if (saved.revision !== output.receipt.readbackRevision) {
      throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
    }
    return verified(saved, output.receipt, {
      recovered:true,
      capsuleId:output.capsule?.capsuleId ?? null,
      fingerprint:output.capsule?.fingerprint ?? null,
    });
  }

  return Object.freeze({
    readBoard,
    initializeBoard,
    claimPins,
    returnPins,
    recoverEmergency,
  });
}
