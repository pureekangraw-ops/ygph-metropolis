import {
  assertEmployeeIdAvailable,
  createCentrePin,
} from './board-contract.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function id(value, requiredCode, invalidCode = requiredCode) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(requiredCode);
  if (!IDENTIFIER.test(output)) throw new Error(invalidCode);
  return output;
}

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function pinIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('CENTRE_BOARD_PIN_IDS_REQUIRED');
  }
  const output = value.map(item => id(
    item,
    'CENTRE_BOARD_PIN_ID_REQUIRED',
    'CENTRE_BOARD_PIN_ID_INVALID',
  ));
  if (new Set(output).size !== output.length) throw new Error('CENTRE_BOARD_PIN_ID_CONFLICT');
  return output;
}

function boardInput(board) {
  if (!board || typeof board !== 'object' || Array.isArray(board)) {
    throw new Error('CENTRE_BOARD_INVALID');
  }
  if (!Number.isSafeInteger(board.revision) || board.revision < 1) {
    throw new Error('CENTRE_BOARD_REVISION_INVALID');
  }
  if (!Array.isArray(board.pins) || !Array.isArray(board.audit)) {
    throw new Error('CENTRE_BOARD_INVALID');
  }
  return board;
}

function assertWork(board, workId) {
  const expected = id(workId, 'CENTRE_BOARD_WORK_ID_REQUIRED', 'CENTRE_BOARD_WORK_ID_INVALID');
  if (board.workId !== expected) throw new Error('CENTRE_BOARD_WORK_ID_MISMATCH');
  return expected;
}

function assertRevision(board, expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || board.revision !== expectedRevision) {
    throw new Error(`CENTRE_BOARD_REVISION_CONFLICT:${expectedRevision}/${board.revision}`);
  }
}

function entryReplay(board, receiptId, workId, employeeId, claimedPinIds) {
  const previous = board.audit.find(event => event?.receiptId === receiptId);
  if (!previous) return null;
  const same = previous.type === 'BOARD_READ'
    && previous.workId === workId
    && previous.employeeId === employeeId
    && JSON.stringify(previous.pinIds) === JSON.stringify(claimedPinIds);
  if (!same) throw new Error(`CENTRE_BOARD_RECEIPT_ID_CONFLICT:${receiptId}`);
  return deepFreeze({ board, receipt:previous.receipt });
}

export function enterCentreBoard(boardValue, {
  receiptId:receiptValue,
  workId:workValue,
  employeeId:employeeValue,
  pinIds:pinValues,
  expectedRevision,
  at:atValue,
} = {}) {
  const board = boardInput(boardValue);
  const receiptId = id(receiptValue, 'CENTRE_BOARD_RECEIPT_ID_REQUIRED', 'CENTRE_BOARD_RECEIPT_ID_INVALID');
  const workId = assertWork(board, workValue);
  const employeeId = id(employeeValue, 'CENTRE_BOARD_EMPLOYEE_ID_REQUIRED', 'CENTRE_BOARD_EMPLOYEE_ID_INVALID');
  const claimedPinIds = pinIds(pinValues);
  const at = requiredText(atValue, 'CENTRE_BOARD_AT_REQUIRED');

  const replay = entryReplay(board, receiptId, workId, employeeId, claimedPinIds);
  if (replay) return replay;

  assertRevision(board, expectedRevision);
  assertEmployeeIdAvailable(board, employeeId);

  const selected = new Set(claimedPinIds);
  for (const pinId of selected) {
    const pin = board.pins.find(item => item.pinId === pinId);
    if (!pin) throw new Error(`CENTRE_BOARD_PIN_NOT_FOUND:${pinId}`);
    if (!['OPEN', 'REOPENED'].includes(pin.status)) {
      throw new Error(`CENTRE_BOARD_PIN_NOT_CLAIMABLE:${pinId}`);
    }
  }

  const nextRevision = board.revision + 1;
  const nextPins = board.pins.map(pin => {
    if (!selected.has(pin.pinId)) return pin;
    return createCentrePin({
      ...pin,
      status:'DOING',
      ownerEmployeeId:employeeId,
      touchedBy:[...new Set([...(pin.touchedBy || []), employeeId])],
      revision:pin.revision + 1,
      updatedAt:at,
      at,
    });
  });

  const receipt = deepFreeze({
    receiptId,
    type:'BOARD_READ',
    workId,
    employeeId,
    beforeRevision:board.revision,
    afterRevision:nextRevision,
    claimedPinIds:[...claimedPinIds],
    readbackRevision:nextRevision,
    at,
  });
  const event = deepFreeze({
    type:'BOARD_READ',
    receiptId,
    workId,
    employeeId,
    pinIds:[...claimedPinIds],
    beforeRevision:board.revision,
    afterRevision:nextRevision,
    at,
    receipt,
  });
  const nextBoard = deepFreeze({
    ...board,
    revision:nextRevision,
    updatedAt:at,
    pins:nextPins,
    audit:[...board.audit, event],
  });

  const readbackPins = nextBoard.pins.filter(pin => selected.has(pin.pinId));
  if (
    nextBoard.revision !== nextRevision
    || readbackPins.length !== selected.size
    || readbackPins.some(pin => pin.status !== 'DOING' || pin.ownerEmployeeId !== employeeId)
  ) {
    throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
  }

  return deepFreeze({ board:nextBoard, receipt });
}
