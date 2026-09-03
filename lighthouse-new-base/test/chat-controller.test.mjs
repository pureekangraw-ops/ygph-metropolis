import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatStore } from '../src/chat-store.mjs';
import { createChatController } from '../src/chat-controller.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function ids() {
  let n = 0;
  return prefix => `${prefix}-${++n}`;
}

function expenseDraft(text = 'ข้าว 65') {
  const amountSatang = text.includes('70') ? 7000 : 6500;
  return {
    type:'draft', owner:'outcome', action:'expense', rawText:text,
    fields:{ title:'ข้าว', amountSatang }, summary:`รายจ่าย ข้าว ${amountSatang / 100} บาท`,
    request:{ operationId:'op-fixed', fields:{ title:'ข้าว', amountSatang } },
  };
}

test('send persists raw message before interpretation and stores parsed draft separately', async () => {
  const storage = memoryStorage();
  const store = createChatStore({ storage, idFactory:ids() });
  const observations = [];
  const chat = createChatController({
    store,
    interpret: async text => {
      const document = store.read();
      observations.push(document.messages.some(message => message.rawText === text));
      return expenseDraft(text);
    },
    commit: async () => { throw new Error('must not commit before confirm'); },
    readback: async () => ({ ok:true }),
  });

  const view = await chat.send('ข้าว 65', { submitToken:'gesture-1' });
  assert.deepEqual(observations, [true]);
  assert.equal(view.pending.rawText, 'ข้าว 65');
  assert.equal(view.pending.fields.amountSatang, 6500);
  const document = store.read();
  assert.equal(document.messages[0].rawText, 'ข้าว 65');
  assert.equal(document.drafts[0].messageId, document.messages[0].id);
  assert.equal(document.drafts[0].rawText, 'ข้าว 65');
  assert.equal(document.drafts[0].fields.amountSatang, 6500);
});

test('double submit token reuses one message and work record', async () => {
  const store = createChatStore({ storage:memoryStorage(), idFactory:ids() });
  const chat = createChatController({
    store,
    interpret: async text => expenseDraft(text),
    commit: async () => ({ status:'COMPLETE', readback:{ recordId:'TX-1' } }),
    readback: async result => ({ ok:Boolean(result.readback), evidence:result.readback }),
  });

  await chat.send('ข้าว 65', { submitToken:'gesture-1' });
  await chat.send('ข้าว 65', { submitToken:'gesture-1' });
  assert.equal(store.read().messages.filter(message => message.role === 'user').length, 1);
  assert.equal(store.read().work.length, 1);
});

test('confirm commits once then requires proven readback before SUCCESS', async () => {
  const calls = [];
  const store = createChatStore({ storage:memoryStorage(), idFactory:ids() });
  const chat = createChatController({
    store,
    interpret: async text => expenseDraft(text),
    commit: async draft => { calls.push(['commit', draft.messageId]); return { status:'COMPLETE', readback:{ recordId:'TX-1' } }; },
    readback: async result => { calls.push(['readback', result.readback.recordId]); return { ok:true, evidence:result.readback }; },
  });

  const sent = await chat.send('ข้าว 65');
  assert.equal(calls.length, 0);
  const confirmed = await chat.confirm(sent.pending.messageId);
  assert.deepEqual(calls, [['commit', sent.pending.messageId], ['readback', 'TX-1']]);
  assert.equal(confirmed.pending, null);
  const user = store.read().messages.find(message => message.id === sent.pending.messageId);
  assert.equal(user.executionState, 'SUCCESS');
  assert.equal(user.syncState, 'SUCCESS');
  assert.equal(confirmed.messages.at(-1).text, 'บันทึกแล้ว');
});

test('readback error preserves committed domain execution truth and retry uses same ids', async () => {
  const commits = [];
  let prove = false;
  const store = createChatStore({ storage:memoryStorage(), idFactory:ids() });
  const chat = createChatController({
    store,
    interpret: async text => expenseDraft(text),
    commit: async draft => { commits.push(draft.workId); return { status:'COMPLETE', readback:{ recordId:'TX-1' } }; },
    readback: async () => prove ? ({ ok:true, evidence:{ recordId:'TX-1' } }) : ({ ok:false }),
  });

  const sent = await chat.send('ข้าว 65');
  await chat.confirm(sent.pending.messageId);
  let document = store.read();
  const message = document.messages.find(item => item.id === sent.pending.messageId);
  const originalWorkId = message.workId;
  assert.equal(message.executionState, 'SUCCESS');
  assert.equal(message.syncState, 'ERROR');
  assert.notEqual(chat.snapshot().messages.at(-1).text, 'บันทึกแล้ว');

  prove = true;
  await chat.retry(sent.pending.messageId);
  document = store.read();
  const retried = document.messages.find(item => item.id === sent.pending.messageId);
  assert.equal(retried.id, sent.pending.messageId);
  assert.equal(retried.workId, originalWorkId);
  assert.equal(document.messages.filter(item => item.role === 'user').length, 1);
  assert.equal(retried.executionState, 'SUCCESS');
  assert.equal(retried.syncState, 'SUCCESS');
  assert.deepEqual(commits, [originalWorkId, originalWorkId]);
});

test('edit and cancel change only the pending draft until explicit confirmation', async () => {
  let commits = 0;
  const store = createChatStore({ storage:memoryStorage(), idFactory:ids() });
  const chat = createChatController({
    store,
    interpret: async text => expenseDraft(text),
    commit: async () => { commits += 1; return { status:'COMPLETE', readback:{ recordId:'TX-1' } }; },
    readback: async result => ({ ok:Boolean(result.readback) }),
  });

  const sent = await chat.send('ข้าว 65');
  const edited = await chat.edit(sent.pending.messageId, 'ข้าว 70');
  assert.equal(commits, 0);
  assert.equal(edited.pending.fields.amountSatang, 7000);
  const cancelled = await chat.cancel(sent.pending.messageId);
  assert.equal(commits, 0);
  assert.equal(cancelled.pending, null);
});

test('controller recreation projects persisted messages and pending draft', async () => {
  const storage = memoryStorage();
  const store = createChatStore({ storage, idFactory:ids() });
  const deps = {
    interpret: async text => expenseDraft(text),
    commit: async () => ({ status:'COMPLETE', readback:{ recordId:'TX-1' } }),
    readback: async result => ({ ok:Boolean(result.readback) }),
  };
  const first = createChatController({ store, ...deps });
  await first.send('ข้าว 65');

  const reopened = createChatController({ store:createChatStore({ storage }), ...deps });
  const view = reopened.snapshot();
  assert.equal(view.messages.some(message => message.text === 'ข้าว 65'), true);
  assert.equal(view.pending.rawText, 'ข้าว 65');
});
