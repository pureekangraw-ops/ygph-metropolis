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

  function readEmergencyCapsules() {
    return typeof store.readEmergencyCapsules === 'function'
      ? store.readEmergencyCapsules()
      : [];
  }

  function stageEmergency(capsule) {
    if (typeof store.saveEmergencyCapsule !== 'function') {
      throw new Error('CENTRE_BOARD_EMERGENCY_STORE_UNAVAILABLE');
    }
    return store.saveEmergencyCapsule(capsule);
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
    capsuleId,
    receiptId,
    at = now(),
  } = {}) {
    const current = readBoard();
    if (!current) throw new Error('CENTRE_BOARD_NOT_INITIALIZED');

    let pending = capsule;
    if (pending && typeof store.saveEmergencyCapsule === 'function') {
      pending = store.saveEmergencyCapsule(pending);
    } else if (!pending && capsuleId != null && typeof store.readEmergencyCapsules === 'function') {
      const id = text(capsuleId, 'CENTRE_BOARD_CAPSULE_ID_REQUIRED');
      pending = store.readEmergencyCapsules().find(item => item.capsuleId === id) || null;
      if (!pending) throw new Error(`CENTRE_BOARD_CAPSULE_NOT_FOUND:${id}`);
    }

    const output = recoverEmergencyCapsule(current, pending, {
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
    if (typeof store.removeEmergencyCapsule === 'function' && output.capsule?.capsuleId) {
      store.removeEmergencyCapsule(output.capsule.capsuleId, {
        fingerprint:output.capsule.fingerprint,
      });
    }
    return verified(saved, output.receipt, {
      recovered:true,
      capsuleId:output.capsule?.capsuleId ?? null,
      fingerprint:output.capsule?.fingerprint ?? null,
    });
  }

  return Object.freeze({
    readBoard,
    readEmergencyCapsules,
    stageEmergency,
    claimPins,
    returnPins,
    recoverEmergency,
  });
}
