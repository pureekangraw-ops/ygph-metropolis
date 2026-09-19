const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const contractUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/centre-board/board-contract.mjs')).href;

test('creates immutable Centre Board and Pin V1 records', async () => {
  const { createCentreBoard, createCentrePin } = await import(contractUrl);
  const at = '2026-09-19T01:00:00.000Z';
  const board = createCentreBoard({ boardId:'board-1', workId:'WORK-1', at });
  assert.equal(board.schemaVersion, 1);
  assert.equal(board.revision, 1);
  assert.deepEqual(board.pins, []);
  assert.deepEqual(board.audit, []);
  assert.equal(Object.isFrozen(board), true);
  assert.equal(Object.isFrozen(board.pins), true);

  const evidence = [{ type:'commit', ref:'abc123' }];
  const links = [{ rel:'blocks', pinId:'pin-0' }];
  const pin = createCentrePin({
    pinId:'pin-1',
    workId:'WORK-1',
    title:'Contract',
    detail:'Build V1 contract',
    status:'OPEN',
    evidence,
    links,
    at,
  });
  evidence[0].ref = 'mutated';
  links[0].pinId = 'mutated';
  assert.equal(pin.revision, 1);
  assert.equal(pin.evidence[0].ref, 'abc123');
  assert.equal(pin.links[0].pinId, 'pin-0');
  assert.equal(Object.isFrozen(pin), true);
  assert.equal(Object.isFrozen(pin.evidence), true);
  assert.equal(Object.isFrozen(pin.evidence[0]), true);
});

test('rejects malformed pin identity, status, evidence, and links', async () => {
  const { createCentrePin } = await import(contractUrl);
  const base = { pinId:'pin-1', workId:'WORK-1', title:'x', at:'2026-09-19T01:00:00.000Z' };
  assert.throws(() => createCentrePin({ ...base, workId:'' }), /CENTRE_BOARD_WORK_ID_REQUIRED/);
  assert.throws(() => createCentrePin({ ...base, status:'DONE' }), /CENTRE_BOARD_PIN_STATUS_INVALID/);
  assert.throws(() => createCentrePin({ ...base, evidence:{} }), /CENTRE_BOARD_EVIDENCE_INVALID/);
  assert.throws(() => createCentrePin({ ...base, links:{} }), /CENTRE_BOARD_LINKS_INVALID/);
});

test('checks Employee ID uniqueness only against current live pins', async () => {
  const { createCentreBoard, createCentrePin, assertEmployeeIdAvailable } = await import(contractUrl);
  const at = '2026-09-19T01:00:00.000Z';
  const active = createCentrePin({
    pinId:'pin-active', workId:'WORK-1', title:'active', status:'DOING',
    ownerEmployeeId:'GO-7', touchedBy:['GO-7'], at,
  });
  const archived = createCentrePin({
    pinId:'pin-archived', workId:'WORK-1', title:'archived', status:'ARCHIVED',
    ownerEmployeeId:'GO-8', touchedBy:['GO-8'], at,
  });
  const board = createCentreBoard({ boardId:'board-1', workId:'WORK-1', pins:[active, archived], at });

  assert.throws(() => assertEmployeeIdAvailable(board, 'GO-7'), /CENTRE_BOARD_EMPLOYEE_ID_CONFLICT:GO-7/);
  assert.equal(assertEmployeeIdAvailable(board, 'GO-8'), 'GO-8');
  assert.equal(assertEmployeeIdAvailable(board, 'GO-9'), 'GO-9');
});


test('deploy syntax gate covers every Centre Board V1 module', () => {
  const packageJson = require('../package.json');
  const syntax = packageJson.scripts['check:syntax'];
  assert.match(syntax, /lighthouse-next\/centre-board\/board-contract\.mjs/);
  assert.match(syntax, /lighthouse-next\/centre-board\/board-session\.mjs/);
  assert.match(syntax, /lighthouse-next\/centre-board\/emergency-capsule\.mjs/);
});
