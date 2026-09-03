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

function ids() { let n = 0; return prefix => `${prefix}-${++n}`; }

function draft(text = 'ข้าว 65') {
  return {
    type:'draft', owner:'outcome', action:'expense', rawText:text,
    fields:{ title:'ข้าว', amountSatang:6500 }, summary:'รายจ่าย ข้าว 65 บาท',
    request:{ operationId:'op-stable', fields:{ title:'ข้าว', amountSatang:6500 } },
  };
}

test('message lifecycle appends durable events while WAITING to WAITING does not duplicate user-facing copy', async () => {
  const store = createChatStore({ storage:memoryStorage(), idFactory:ids() });
  let readbacks = 0;
  const chat = createChatController({
    store,
    interpret:async text => draft(text),
    commit:async () => ({ status:'COMPLETE', readback:{ recordId:'TX-1' } }),
    readback:async () => { readbacks += 1; return readbacks === 1 ? { ok:false } : { ok:true, evidence:{ recordId:'TX-1' } }; },
  });

  const sent = await chat.send('ข้าว 65');
  await chat.confirm(sent.pending.messageId);
  const afterError = store.read();
  const eventStates = afterError.events.filter(event => event.messageId === sent.pending.messageId).map(event => `${event.executionState}/${event.syncState}`);
  assert.deepEqual(eventStates, [
    'WAITING/WAITING',
    'CONFIRMATION_REQUIRED/WAITING',
    'WAITING/WAITING',
    'SUCCESS/WAITING',
    'SUCCESS/ERROR',
  ]);
  const errorReplies = afterError.messages.filter(message => message.relatedMessageId === sent.pending.messageId && message.kind === 'readback-error');
  assert.equal(errorReplies.length, 1);

  await chat.retry(sent.pending.messageId);
  const afterRetry = store.read();
  assert.equal(afterRetry.messages.filter(message => message.relatedMessageId === sent.pending.messageId && message.kind === 'success').length, 1);
  assert.equal(afterRetry.events.at(-1).executionState, 'SUCCESS');
  assert.equal(afterRetry.events.at(-1).syncState, 'SUCCESS');
});

test('recover interprets a committed local message with the same message and work records after process interruption', async () => {
  const storage = memoryStorage();
  const store = createChatStore({ storage, idFactory:ids() });
  const created = store.commitUserMessage('ข้าว 65');
  let interpreted = 0;
  const reopenedStore = createChatStore({ storage });
  const chat = createChatController({
    store:reopenedStore,
    interpret:async text => { interpreted += 1; return draft(text); },
    commit:async () => ({ status:'COMPLETE', readback:{ recordId:'TX-1' } }),
    readback:async result => ({ ok:Boolean(result.readback), evidence:result.readback }),
  });

  await chat.recover();
  const document = reopenedStore.read();
  assert.equal(interpreted, 1);
  assert.equal(document.messages.filter(message => message.role === 'user').length, 1);
  assert.equal(document.messages.find(message => message.role === 'user').id, created.message.id);
  assert.equal(document.work[0].id, created.work.id);
  assert.equal(document.drafts[0].messageId, created.message.id);
});

test('recover retries interrupted confirmed work with the stable draft operation and does not create a new user message', async () => {
  const storage = memoryStorage();
  const store = createChatStore({ storage, idFactory:ids() });
  const created = store.commitUserMessage('ข้าว 65');
  store.updateDocument(document => {
    const message = document.messages.find(item => item.id === created.message.id);
    const work = document.work.find(item => item.id === created.work.id);
    message.executionState = 'WAITING';
    message.syncState = 'WAITING';
    work.kind = 'QUICK_CAPTURE';
    work.status = 'WAITING';
    document.drafts.push({
      messageId:message.id, workId:work.id, rawText:'ข้าว 65', originalRawText:'ข้าว 65',
      owner:'outcome', action:'expense', fields:{ title:'ข้าว', amountSatang:6500 },
      summary:'รายจ่าย ข้าว 65 บาท', request:{ operationId:'op-stable', fields:{ title:'ข้าว', amountSatang:6500 } },
      status:'CONFIRMATION_REQUIRED', revision:1,
    });
    return document;
  });

  const commits = [];
  const reopened = createChatController({
    store:createChatStore({ storage }),
    interpret:async text => draft(text),
    commit:async pending => { commits.push([pending.messageId, pending.workId, pending.request.operationId]); return { status:'COMPLETE', readback:{ recordId:'TX-1' } }; },
    readback:async result => ({ ok:Boolean(result.readback), evidence:result.readback }),
  });
  await reopened.recover();
  const document = createChatStore({ storage }).read();
  assert.deepEqual(commits, [[created.message.id, created.work.id, 'op-stable']]);
  assert.equal(document.messages.filter(message => message.role === 'user').length, 1);
  assert.equal(document.messages.find(message => message.role === 'user').id, created.message.id);
  assert.equal(document.work[0].id, created.work.id);
  assert.equal(document.messages.find(message => message.id === created.message.id).syncState, 'SUCCESS');
});
