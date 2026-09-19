const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const contractUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-contract.mjs')).href;
const sessionUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-session.mjs')).href;
const emergencyUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/emergency-capsule.mjs')).href;
const at = '2026-09-19T03:00:00.000Z';

async function enteredBoard() {
  const { createCentreBoard, createCentrePin } = await import(contractUrl);
  const { enterCentreBoard } = await import(sessionUrl);
  const board = createCentreBoard({
    boardId:'board-1',
    workId:'WORK-1',
    at,
    pins:[createCentrePin({ pinId:'pin-1', workId:'WORK-1', title:'Emergency', status:'OPEN', at })],
  });
  return enterCentreBoard(board, {
    receiptId:'read-emergency', workId:'WORK-1', employeeId:'GO-1',
    pinIds:['pin-1'], expectedRevision:1, at,
  }).board;
}

function capsuleInput(overrides = {}) {
  return {
    capsuleId:'capsule-1',
    workId:'WORK-1',
    employeeId:'GO-1',
    reason:'LIGHTHOUSE_OFFLINE',
    baseBoardRevision:2,
    claimedPinIds:['pin-1'],
    pendingChanges:[{
      pinId:'pin-1',
      status:'PENDING_RECOVERY',
      result:'Transport unavailable',
      nextAction:'Replay after live board read',
      evidence:[{ type:'checkpoint', ref:'cp-1', meta:{ b:2, a:1 } }],
    }],
    evidence:[{ type:'local-snapshot', ref:'snapshot-1' }],
    at,
    ...overrides,
  };
}

test('creates deeply immutable deterministic Emergency Capsule', async () => {
  const { createEmergencyCapsule } = await import(emergencyUrl);
  const firstInput = capsuleInput();
  const first = createEmergencyCapsule(firstInput);
  const second = createEmergencyCapsule(capsuleInput({
    pendingChanges:[{
      evidence:[{ meta:{ a:1, b:2 }, ref:'cp-1', type:'checkpoint' }],
      nextAction:'Replay after live board read',
      result:'Transport unavailable',
      status:'PENDING_RECOVERY',
      pinId:'pin-1',
    }],
  }));

  assert.equal(first.status, 'PENDING_RECOVERY');
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^canonical-v1:/);
  firstInput.pendingChanges[0].result = 'mutated';
  assert.equal(first.pendingChanges[0].result, 'Transport unavailable');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.pendingChanges), true);
  assert.equal(Object.isFrozen(first.pendingChanges[0]), true);
});

test('Emergency Capsule requires reason and rejects secret-shaped payloads', async () => {
  const { createEmergencyCapsule } = await import(emergencyUrl);
  assert.throws(() => createEmergencyCapsule(capsuleInput({ reason:'' })), /CENTRE_BOARD_EMERGENCY_REASON_REQUIRED/);
  assert.throws(() => createEmergencyCapsule(capsuleInput({
    evidence:[{ type:'unsafe', token:'DO-NOT-STORE' }],
  })), /CENTRE_BOARD_EMERGENCY_SECRET_FORBIDDEN/);
});

test('recovery refuses a newer live board without replaying changes', async () => {
  const { createEmergencyCapsule, recoverEmergencyCapsule } = await import(emergencyUrl);
  const board = await enteredBoard();
  const capsule = createEmergencyCapsule(capsuleInput({ baseBoardRevision:1 }));
  const output = recoverEmergencyCapsule(board, capsule, {
    receiptId:'recovery-1',
    at:'2026-09-19T03:01:00.000Z',
  });

  assert.equal(output.status, 'CONFLICT');
  assert.equal(output.reason, 'CENTRE_BOARD_RECOVERY_CONFLICT');
  assert.equal(output.board, board);
  assert.equal(board.pins[0].status, 'DOING');
});

test('matching recovery applies once through return validation and emits RECOVERY receipt', async () => {
  const { createEmergencyCapsule, recoverEmergencyCapsule } = await import(emergencyUrl);
  const board = await enteredBoard();
  const capsule = createEmergencyCapsule(capsuleInput());
  const first = recoverEmergencyCapsule(board, capsule, {
    receiptId:'recovery-1',
    at:'2026-09-19T03:01:00.000Z',
  });
  assert.equal(first.status, 'RECOVERED');
  assert.equal(first.board.revision, 3);
  assert.equal(first.board.pins[0].status, 'PENDING_RECOVERY');
  assert.equal(first.receipt.type, 'RECOVERY');
  assert.equal(first.receipt.capsuleId, 'capsule-1');
  assert.equal(first.receipt.fingerprint, capsule.fingerprint);
  assert.equal(first.receipt.readbackRevision, 3);

  const replay = recoverEmergencyCapsule(first.board, capsule, {
    receiptId:'recovery-1',
    at:'2026-09-19T03:01:00.000Z',
  });
  assert.deepEqual(replay, first);
});
