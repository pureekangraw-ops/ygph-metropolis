const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const moduleUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/control-port/control-port.mjs')).href;

function fixture() {
  let revision = 7;
  let updatedAt = '2026-09-18T07:00:00.000Z';
  const state = () => ({
    schema:2,
    revision,
    updatedAt,
    createdAt:'2026-09-18T06:00:00.000Z',
    domains:{ LEDGER:{records:{}}, STORE:{records:{}}, CALENDAR:{records:{}}, RIDE:{records:{}} },
  });
  const withSession = async operation => operation({ readState:async () => state() });

  const ledgerBridge = {
    readLedgerTruth:async () => ({ revision, balanceSatang:5000, todayInSatang:1000, todayOutSatang:200, netSatang:800, transactions:[], obligations:[] }),
    readIncomeTruth:async () => ({ revision, receivables:[] }),
    readCalendarTruth:async () => ({ revision, records:[] }),
    readRideTruth:async () => ({ revision, generatedSatang:0 }),
    readPlanningTruth:async () => ({ revision, goalSatang:120000 }),
    setDailyGoal:async () => { revision += 1; updatedAt='2026-09-18T07:01:00.000Z'; return { status:'VERIFIED' }; },
    recordOtherIncome:async () => { revision += 1; updatedAt='2026-09-18T07:02:00.000Z'; return { status:'VERIFIED' }; },
    recordExpense:async () => { revision += 1; updatedAt='2026-09-18T07:03:00.000Z'; return { status:'VERIFIED' }; },
    createObligation:async () => ({ status:'VERIFIED' }),
    rescheduleCalendar:async () => ({ status:'VERIFIED' }),
    payObligation:async () => ({ status:'VERIFIED' }),
    receiveReceivablePayment:async () => ({ status:'VERIFIED' }),
    setCalendarStatus:async () => ({ status:'VERIFIED' }),
  };
  const storeBridge = {
    readStoreTruth:async () => ({ revision, products:[] }),
    createProductWithStock:async () => ({ status:'VERIFIED' }),
    addProductStock:async () => ({ status:'VERIFIED' }),
  };
  let boardRevision = 1;
  let boardState = {
    schemaVersion:1,
    boardId:'board-control-port',
    workId:'WORK-CONTROL-PORT',
    revision:boardRevision,
    updatedAt:'2026-09-18T07:00:00.000Z',
    audit:[],
    pins:[{
      pinId:'pin-control-port',
      workId:'WORK-CONTROL-PORT',
      title:'Control Port',
      detail:'',
      status:'OPEN',
      ownerEmployeeId:null,
      touchedBy:[],
      result:null,
      nextAction:null,
      evidence:[],
      links:[],
      revision:1,
      createdAt:'2026-09-18T07:00:00.000Z',
      updatedAt:'2026-09-18T07:00:00.000Z',
    }],
  };
  const boardBridge = {
    readBoard:async () => structuredClone(boardState),
    claimPins:async ({ employeeId }) => {
      boardRevision += 1;
      boardState = {
        ...boardState,
        revision:boardRevision,
        updatedAt:'2026-09-18T07:04:00.000Z',
        pins:[{ ...boardState.pins[0], status:'DOING', ownerEmployeeId:employeeId, touchedBy:[employeeId], revision:2 }],
      };
      return { status:'VERIFIED', boardRevision, receipt:{ type:'BOARD_READ', readbackRevision:boardRevision } };
    },
    returnPins:async () => ({ status:'VERIFIED', boardRevision }),
    recoverEmergency:async () => ({ status:'VERIFIED', boardRevision, recovered:true }),
  };
  return { withSession, ledgerBridge, storeBridge, boardBridge };
}

test('Control Port read surfaces carry owner revision and updatedAt', async () => {
  const { createLighthouseControlPort } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());

  const money = await port.query({ capabilityId:'finance.balance' });
  assert.equal(money.value, 5000);
  assert.equal(money.revision, 7);
  assert.equal(money.updatedAt, '2026-09-18T07:00:00.000Z');

  const app = await port.query({ capabilityId:'system.appState' });
  assert.equal(app.value.schema, 2);
  assert.equal(app.revision, 7);
});

test('Control Port guard is direct for daily goal, confirm-required for money mutation, and forbidden for derived truth/secrets', async () => {
  const { createLighthouseControlPort, CONTROL_PORT_GUARD } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());

  assert.equal(port.propose({ requestId:'r1', capabilityId:'finance.dailyGoal', payload:{goalBaht:1200} }).guard, CONTROL_PORT_GUARD.DIRECT);
  assert.equal(port.propose({ requestId:'r2', capabilityId:'finance.expense.create', payload:{title:'ข้าว',amountBaht:60} }).guard, CONTROL_PORT_GUARD.CONFIRM_REQUIRED);
  assert.equal(port.propose({ requestId:'r3', capabilityId:'finance.balance' }).guard, CONTROL_PORT_GUARD.FORBIDDEN);
  assert.equal(port.propose({ requestId:'r4', capabilityId:'security.pin' }).guard, CONTROL_PORT_GUARD.FORBIDDEN);
});

test('Control Port refuses unconfirmed guarded mutation and commits through owner bridge after confirmation', async () => {
  const { createLighthouseControlPort } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());
  const proposal = port.propose({
    requestId:'income-1',
    capabilityId:'finance.income.create',
    payload:{ source:'งาน', amountBaht:100 },
  });

  const blocked = await port.commit(proposal);
  assert.equal(blocked.status, 'CONFIRMATION_REQUIRED');
  assert.equal(blocked.revision, 7);

  const committed = await port.commit(proposal, { confirmed:true });
  assert.equal(committed.status, 'VERIFIED');
  assert.equal(committed.beforeRevision, 7);
  assert.equal(committed.afterRevision, 8);
  assert.equal(committed.updatedAt, '2026-09-18T07:02:00.000Z');
});


test('Control Port command pack requires one confirmation and commits all validated child commands in order', async () => {
  const { createLighthouseControlPort } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());
  const proposal = port.propose({
    requestId:'pack-1',
    capabilityId:'system.commandPack',
    payload:{
      title:'Finance pack',
      commands:[
        {
          requestId:'pack-1-income',
          capabilityId:'finance.income.create',
          payload:{ source:'งาน', amountBaht:100 },
        },
        {
          requestId:'pack-1-expense',
          capabilityId:'finance.expense.create',
          payload:{ title:'น้ำมัน', amountBaht:50 },
        },
      ],
    },
  });

  assert.equal(proposal.guard, 'CONFIRM_REQUIRED');
  const blocked = await port.commit(proposal);
  assert.equal(blocked.status, 'CONFIRMATION_REQUIRED');

  const result = await port.commit(proposal, { confirmed:true });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.capabilityId, 'system.commandPack');
  assert.equal(result.beforeRevision, 7);
  assert.equal(result.afterRevision, 9);
  assert.equal(result.evidence.kind, 'COMMAND_PACK');
  assert.equal(result.evidence.count, 2);
  assert.deepEqual(result.evidence.items.map(item => item.requestId), ['pack-1-income','pack-1-expense']);
  assert.deepEqual(result.evidence.items.map(item => item.status), ['VERIFIED','VERIFIED']);
});

test('Control Port command pack validates every child before the first mutation', async () => {
  const { createLighthouseControlPort } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());
  const proposal = port.propose({
    requestId:'pack-invalid',
    capabilityId:'system.commandPack',
    payload:{
      commands:[
        {
          requestId:'pack-invalid-income',
          capabilityId:'finance.income.create',
          payload:{ source:'งาน', amountBaht:100 },
        },
        {
          requestId:'pack-invalid-balance',
          capabilityId:'finance.balance',
          payload:{},
        },
      ],
    },
  });

  await assert.rejects(
    () => port.commit(proposal, { confirmed:true }),
    /COMMAND_PACK_CAPABILITY_FORBIDDEN:finance\.balance/,
  );
  const money = await port.query({ capabilityId:'finance.balance' });
  assert.equal(money.revision, 7, 'prevalidation must prevent the first child from mutating owner state');
});

test('Control Port command pack forbids nested packs and duplicate child request ids', async () => {
  const { createLighthouseControlPort } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());

  await assert.rejects(
    () => port.commit(port.propose({
      requestId:'pack-nested',
      capabilityId:'system.commandPack',
      payload:{ commands:[{
        requestId:'nested-child',
        capabilityId:'system.commandPack',
        payload:{ commands:[] },
      }] },
    }), { confirmed:true }),
    /COMMAND_PACK_NESTING_FORBIDDEN/,
  );

  await assert.rejects(
    () => port.commit(port.propose({
      requestId:'pack-duplicate',
      capabilityId:'system.commandPack',
      payload:{ commands:[
        { requestId:'same-child', capabilityId:'finance.income.create', payload:{ source:'A', amountBaht:1 } },
        { requestId:'same-child', capabilityId:'finance.expense.create', payload:{ title:'B', amountBaht:1 } },
      ] },
    }), { confirmed:true }),
    /COMMAND_PACK_REQUEST_ID_DUPLICATE:same-child/,
  );
});

test('Control Port derived balance cannot be committed', async () => {
  const { createLighthouseControlPort } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());
  const proposal = port.propose({ requestId:'balance-1', capabilityId:'finance.balance' });
  await assert.rejects(() => port.commit(proposal), /MUTATION_FORBIDDEN/);
});


test('Control Port exposes Centre Board read and direct claim with board readback evidence', async () => {
  const { createLighthouseControlPort, CONTROL_PORT_GUARD } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());

  const read = await port.query({ capabilityId:'centreBoard.read' });
  assert.equal(read.status, 'OK');
  assert.equal(read.value.boardId, 'board-control-port');
  assert.equal(read.value.revision, 1);

  const proposal = port.propose({
    requestId:'board-claim-1',
    capabilityId:'centreBoard.claim',
    payload:{
      workId:'WORK-CONTROL-PORT',
      employeeId:'GO-BOARD-1',
      pinIds:['pin-control-port'],
      expectedRevision:1,
    },
  });
  assert.equal(proposal.guard, CONTROL_PORT_GUARD.DIRECT);
  assert.equal(proposal.owner, 'LIGHTHOUSE:CENTRE_BOARD');

  const result = await port.commit(proposal);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.evidence.revision, 2);
  assert.equal(result.evidence.pins[0].ownerEmployeeId, 'GO-BOARD-1');
  assert.equal(result.beforeRevision, 7, 'runtime owner revision remains independent from board revision');
  assert.equal(result.afterRevision, 7);
});

test('Command Pack preserves per-item readback evidence', async () => {
  const { createLighthouseControlPort } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());
  const result = await port.commit(port.propose({
    requestId:'pack-evidence',
    capabilityId:'system.commandPack',
    payload:{
      commands:[{
        requestId:'pack-evidence-board',
        capabilityId:'centreBoard.claim',
        payload:{
          workId:'WORK-CONTROL-PORT',
          employeeId:'GO-BOARD-2',
          pinIds:['pin-control-port'],
          expectedRevision:1,
        },
      }],
    },
  }), { confirmed:true });

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.evidence.items[0].evidence.revision, 2);
  assert.equal(result.evidence.items[0].evidence.pins[0].ownerEmployeeId, 'GO-BOARD-2');
});


test('board.* Control Port aliases read and claim the same authoritative Centre Board', async () => {
  const { createLighthouseControlPort, CONTROL_PORT_GUARD } = await import(moduleUrl);
  const port = createLighthouseControlPort(fixture());

  const canonical = await port.query({ capabilityId:'centreBoard.read' });
  const alias = await port.query({ capabilityId:'board.read' });
  assert.deepEqual(alias.value, canonical.value);

  const result = await port.commit(port.propose({
    requestId:'board-alias-claim-1',
    capabilityId:'board.claim',
    payload:{
      workId:'WORK-CONTROL-PORT',
      employeeId:'GO-BOARD-ALIAS-1',
      pinIds:['pin-control-port'],
      expectedRevision:1,
    },
  }));
  assert.equal(result.guard, CONTROL_PORT_GUARD.DIRECT);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.evidence.revision, 2);
  assert.equal(result.evidence.pins[0].ownerEmployeeId, 'GO-BOARD-ALIAS-1');
});
