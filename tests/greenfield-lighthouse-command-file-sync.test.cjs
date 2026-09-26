const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const syncUrl = pathToFileURL(path.resolve(
  __dirname,
  '../lighthouse-next/control-port/control-port-sync.mjs',
)).href;

test('file sync receives a command package and emits output plus read-only board projection', async () => {
  const { createLighthouseControlPortSync } = await import(syncUrl);
  const received = [];
  const pushed = { output:null, board:null };
  const runtime = {
    receive(command) { received.push(command); },
    async processPending() { return [{ requestId:'r1', status:'DONE' }]; },
    async refreshSnapshot() { return { freshness:'LIVE', revision:2 }; },
    outbox() { return [{ requestId:'r1', capabilityId:'finance.transactions', status:'DONE', readback:{ count:1 } }]; },
    workState() { return { nextAction:'WAITING_COMMAND' }; },
  };
  const sync = createLighthouseControlPortSync({ runtime, now:() => '2026-09-20T06:00:00.000Z' });
  const report = await sync.reconcile({
    pullInputFile:async () => ({
      schema:'lighthouse-command-file-v1',
      fileId:'LH-IN-1',
      packageId:'PKG-1',
      workId:'WORK-1',
      commands:[{ requestId:'r1', code:'FI-05', capabilityId:'finance.transactions', payload:{} }],
    }),
    pushOutputFile:async value => { pushed.output = value; },
    pushBoardProjection:async value => { pushed.board = value; },
  });
  assert.equal(report.inputFileId, 'LH-IN-1');
  assert.equal(report.outputFileId, 'LH-OUT-LH-IN-1');
  assert.equal(received[0].capabilityId, 'finance.transactions');
  assert.equal(pushed.output.schema, 'lighthouse-result-file-v1');
  assert.equal(pushed.output.workId, 'WORK-1');
  assert.equal(pushed.board.schema, 'lighthouse-command-board-projection-v1');
  assert.equal(pushed.board.readOnly, true);
});
