import { createCentreBoard, createCentrePin } from './board-contract.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function id(value, code) {
  const output = String(value ?? '').trim();
  if (!output || !IDENTIFIER.test(output)) throw new Error(code);
  return output;
}

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function pinFingerprint(pin, workId) {
  return canonical({
    workId,
    pin:{
      pinId:pin.pinId,
      title:pin.title,
      detail:pin.detail,
      status:pin.status,
      ownerEmployeeId:pin.ownerEmployeeId,
      touchedBy:pin.touchedBy,
      result:pin.result,
      nextAction:pin.nextAction,
      evidence:pin.evidence,
      links:pin.links,
    },
  });
}

function assertBoard(board) {
  if (!board || typeof board !== 'object' || Array.isArray(board) || !Array.isArray(board.pins) || !Array.isArray(board.audit)) {
    throw new Error('CENTRE_BOARD_INVALID');
  }
  return board;
}

function assertRevision(board, expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || board.revision !== expectedRevision) {
    throw new Error(`CENTRE_BOARD_REVISION_CONFLICT:${expectedRevision}/${board.revision}`);
  }
}

export function initializeCentreBoard({
  receiptId:receiptValue,
  boardId:boardValue,
  workId:workValue,
  at:atValue,
} = {}) {
  const receiptId = id(receiptValue, 'CENTRE_BOARD_RECEIPT_ID_INVALID');
  const boardId = id(boardValue, 'CENTRE_BOARD_BOARD_ID_INVALID');
  const workId = id(workValue, 'CENTRE_BOARD_WORK_ID_INVALID');
  const at = requiredText(atValue, 'CENTRE_BOARD_AT_REQUIRED');
  const receipt = deepFreeze({
    receiptId,
    type:'BOARD_INITIALIZE',
    boardId,
    workId,
    beforeRevision:0,
    afterRevision:1,
    readbackRevision:1,
    at,
  });
  const board = createCentreBoard({
    boardId,
    workId,
    revision:1,
    at,
    pins:[],
    audit:[deepFreeze({
      type:'BOARD_INITIALIZE',
      receiptId,
      boardId,
      workId,
      beforeRevision:0,
      afterRevision:1,
      at,
      receipt,
    })],
  });
  return deepFreeze({ board, receipt });
}

export function createPinOnCentreBoard(boardValue, {
  receiptId:receiptValue,
  workId:workValue,
  pin:pinValue,
  expectedRevision,
  at:atValue,
} = {}) {
  const board = assertBoard(boardValue);
  const receiptId = id(receiptValue, 'CENTRE_BOARD_RECEIPT_ID_INVALID');
  const workId = id(workValue, 'CENTRE_BOARD_WORK_ID_INVALID');
  const at = requiredText(atValue, 'CENTRE_BOARD_AT_REQUIRED');
  if (board.workId !== workId) throw new Error('CENTRE_BOARD_WORK_ID_MISMATCH');

  const pin = createCentrePin({
    ...(pinValue && typeof pinValue === 'object' && !Array.isArray(pinValue) ? pinValue : {}),
    workId,
    at,
    createdAt:pinValue?.createdAt ?? at,
    updatedAt:at,
  });
  const requestFingerprint = pinFingerprint(pin, workId);
  const previous = board.audit.find(event => event?.receiptId === receiptId);
  if (previous) {
    const same = previous.type === 'BOARD_PIN_CREATE'
      && previous.workId === workId
      && previous.pinId === pin.pinId
      && previous.requestFingerprint === requestFingerprint;
    if (!same) throw new Error(`CENTRE_BOARD_RECEIPT_ID_CONFLICT:${receiptId}`);
    return deepFreeze({ board, receipt:previous.receipt });
  }

  assertRevision(board, expectedRevision);
  if (board.pins.some(item => item.pinId === pin.pinId)) {
    throw new Error(`CENTRE_BOARD_PIN_ID_CONFLICT:${pin.pinId}`);
  }

  const nextRevision = board.revision + 1;
  const receipt = deepFreeze({
    receiptId,
    type:'BOARD_PIN_CREATE',
    boardId:board.boardId,
    workId,
    pinId:pin.pinId,
    beforeRevision:board.revision,
    afterRevision:nextRevision,
    readbackRevision:nextRevision,
    at,
  });
  const nextBoard = createCentreBoard({
    ...board,
    revision:nextRevision,
    updatedAt:at,
    pins:[...board.pins, pin],
    audit:[...board.audit, deepFreeze({
      type:'BOARD_PIN_CREATE',
      receiptId,
      boardId:board.boardId,
      workId,
      pinId:pin.pinId,
      requestFingerprint,
      beforeRevision:board.revision,
      afterRevision:nextRevision,
      at,
      receipt,
    })],
    at,
  });

  const readback = nextBoard.pins.find(item => item.pinId === pin.pinId);
  if (!readback || nextBoard.revision !== nextRevision || readback.title !== pin.title || readback.status !== pin.status) {
    throw new Error('CENTRE_BOARD_READBACK_MISMATCH');
  }
  return deepFreeze({ board:nextBoard, receipt });
}
