"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupProductionUi } = require('./master-input-ui-fixture.cjs');

test('Manual subject opens in Chat with identity-only interpretation context', async () => {
  const env = await setupProductionUi('BRIDGE-SUBJECT', {
    fetchResponse:async () => ({
      ok:true,
      async json() {
        return {version:'1',status:'UNSUPPORTED',action:'UNKNOWN',object:'UNKNOWN',fields:{title:null,amountSatang:null,paymentMode:null,note:null},missing:[],manual:false,question:'ยังไม่รองรับ'};
      },
    }),
  });
  try {
    env.ui.setMasterInputSubject({subject:'ค่าบ้าน',reference:{version:1,owner:'LEDGER',recordId:'OBL-HOME'}});

    assert.equal(env.document.getElementById('masterInputSubject').textContent, 'ค่าบ้าน');
    assert.equal(env.document.getElementById('masterInputSubjectBar').hidden, false);
    await env.submit('รายการนี้ต้องทำอะไร');
    const body = JSON.parse(env.requests[0].init.body);
    assert.deepEqual(body.context, {subject:'ค่าบ้าน',reference:{version:1,owner:'LEDGER',recordId:'OBL-HOME'}});
    assert.equal('amountSatang' in body.context.reference, false);
  } finally { env.cleanup(); }
});

test('Chat Peek resolves fresh display data and Open sends only the stable reference', async () => {
  const env = await setupProductionUi('BRIDGE-ACTIONS');
  try {
    let opened = null;
    let currentAmount = 400000;
    env.ui.configureMasterInputBridge({
      peek:async reference => ({reference,record:{recordId:'OBL-HOME',type:'OBLIGATION',title:'ค่าบ้าน',status:'OPEN',remainingSatang:currentAmount}}),
      open:async reference => { opened = reference; },
    });
    env.ui.setMasterInputSubject({subject:'ค่าบ้าน',reference:{version:1,owner:'LEDGER',recordId:'OBL-HOME'}});

    await env.document.getElementById('masterInputSubjectPeek').click();
    assert.match(env.document.getElementById('masterInputPeek').textContent, /4,000/);
    currentAmount = 0;
    await env.document.getElementById('masterInputSubjectPeek').click();
    assert.match(env.document.getElementById('masterInputPeek').textContent, /0/);
    await env.document.getElementById('masterInputSubjectOpen').click();
    assert.deepEqual(opened, {version:1,owner:'LEDGER',recordId:'OBL-HOME'});
  } finally { env.cleanup(); }
});

test('proven durable Chat readback exposes its exact Ledger reference', async () => {
  const env = await setupProductionUi('BRIDGE-READBACK');
  try {
    let opened = null;
    env.ui.configureMasterInputBridge({ open:async reference => { opened = reference; } });
    assert.equal(await env.submit('ข้าว65'), 'READY');
    assert.equal(await env.execute(), 'SUCCESS');

    const open = env.document.getElementById('masterInputActions').children.find(child => child.dataset.bridgeAction === 'open');
    assert.ok(open, 'durable readback must expose Open');
    await open.click();
    assert.equal(opened.owner, 'LEDGER');
    assert.match(opened.recordId, /^TX-LH-/);
    assert.deepEqual(Object.keys(opened).sort(), ['owner','recordId','version']);
  } finally { env.cleanup(); }
});
