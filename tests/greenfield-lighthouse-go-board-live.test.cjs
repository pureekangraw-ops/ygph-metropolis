const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { readFileSync } = require('node:fs');

const moduleUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/go-board-live.mjs')).href;

test('GO live view projects Hub realtime, LIGHTHOUSE truth, Board ownership, and Control Port queue without rewriting IDs', async () => {
  const { createGoBoardView } = await import(moduleUrl);
  const view = createGoBoardView({
    hubStatus:{
      pairing:{ status:'PAIRED' },
      realtime:{ status:'LIVE' },
      report:{ transport:'ONLINE' },
    },
    runtimeState:{
      work:{
        pendingRequestId:'request-2',
        blocker:'CONFIRMATION_REQUIRED',
        nextAction:'AWAIT_CONFIRMATION',
        lastSuccessfulReadback:{
          requestId:'request-1',
          capabilityId:'finance.income.create',
          revision:24,
          readbackAt:'2026-09-19T01:03:34.833Z',
        },
      },
      inbox:{
        a:{ requestId:'request-1', capabilityId:'finance.income.create', status:'COMPLETE', owner:'GREENFIELD:LEDGER' },
        b:{ requestId:'request-2', capabilityId:'finance.expense.create', status:'CONFIRMATION_REQUIRED', owner:'GREENFIELD:LEDGER' },
      },
      outbox:{
        a:{ requestId:'request-1', capabilityId:'finance.income.create', status:'DONE' },
      },
    },
    snapshotStatus:{
      freshness:'LIVE',
      revision:24,
      updatedAt:'2026-09-19T01:03:33.307Z',
      appVersion:'1.0.0-owner.8',
      mainSha:'abc123',
    },
    boardState:{
      revision:7,
      updatedAt:'2026-09-19T01:03:35.000Z',
      cards:[{
        workId:'WORK-BOARD-1',
        employeeId:'GO-EMP-7',
        owner:'GO-EMP-7',
        title:'เชื่อม Centre Board',
        status:'AWAY',
        phase:'AWAY',
        checkpointId:'CENTRE-BOARD-1',
        returnAddress:'CENTRE-BOARD-1',
      }],
    },
  });

  assert.equal(view.route.mode, 'LIVE');
  assert.equal(view.truth.revision, 24);
  assert.equal(view.work.workId, 'WORK-BOARD-1');
  assert.equal(view.work.employeeId, 'GO-EMP-7');
  assert.equal(view.work.pendingRequestId, 'request-2');
  assert.equal(view.queue.pending, 1);
  assert.equal(view.queue.confirmations, 1);
  assert.equal(view.queue.receipts, 1);
  assert.equal(view.board.cards[0].workId, 'WORK-BOARD-1');
  assert.equal(view.board.cards[0].checkpointId, 'CENTRE-BOARD-1');
});

test('GO live view exposes fallback, emergency, and recovery from existing transport/runtime facts', async () => {
  const { createGoBoardView } = await import(moduleUrl);

  const fallback = createGoBoardView({
    hubStatus:{ pairing:{ status:'PAIRED' }, report:{ transport:'ONLINE' } },
    runtimeState:{ work:{ nextAction:'WAITING_COMMAND' }, inbox:{}, outbox:{} },
    snapshotStatus:{ freshness:'LIVE' },
  });
  assert.equal(fallback.route.mode, 'FALLBACK');

  const emergency = createGoBoardView({
    hubStatus:{ pairing:{ status:'PAIRED' }, report:{ transport:'OFFLINE' } },
    runtimeState:{
      work:{ nextAction:'WAITING_COMMAND' },
      inbox:{ a:{ requestId:'r1', status:'PROCESSING' } },
      outbox:{},
    },
    snapshotStatus:{ freshness:'STALE' },
  });
  assert.equal(emergency.route.mode, 'EMERGENCY');

  const recovery = createGoBoardView({
    hubStatus:{ pairing:{ status:'PAIRED' }, realtime:{ status:'RECONNECT_WAIT', retryInMs:1000 } },
    runtimeState:{ work:{ nextAction:'WAITING_COMMAND' }, inbox:{}, outbox:{} },
  });
  assert.equal(recovery.route.mode, 'RECOVERY');
  assert.equal(recovery.route.retryInMs, 1000);
});

test('GO page is a fourth LIGHTHOUSE root and consumes live facts without creating a Board truth store', () => {
  const html = readFileSync(path.resolve(__dirname, '../lighthouse-next/index.html'), 'utf8');
  const app = readFileSync(path.resolve(__dirname, '../lighthouse-next/app.mjs'), 'utf8');
  const css = readFileSync(path.resolve(__dirname, '../lighthouse-next/go-board-live.css'), 'utf8');
  const projection = readFileSync(path.resolve(__dirname, '../lighthouse-next/go-board-live.mjs'), 'utf8');

  assert.match(html, /id="page-go"[^>]+data-root="go"/);
  assert.match(html, /data-root-target="go"/);
  assert.match(html, /id="go-board-list"/);
  assert.match(html, /id="go-route-mode"/);
  assert.match(app, /const allowed = \['chat','manual','go','settings'\]/);
  assert.match(app, /activeRoot:\['chat','manual','go','settings'\]\.includes/);
  assert.match(app, /createGoBoardView\(/);
  assert.match(app, /lighthouse:centre-board/);
  assert.match(app, /controlPortRuntime\.snapshotStatus\(\)/);
  assert.match(css, /grid-template-columns:repeat\(4,1fr\)/);
  assert.doesNotMatch(projection, /localStorage|sessionStorage|indexedDB/i);
});
