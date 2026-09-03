import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatStore } from '../src/chat-store.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('user message is durable local truth before work and survives store recreation', () => {
  const storage = memoryStorage();
  const ids = ['conversation-1', 'message-1', 'work-1'];
  const store = createChatStore({ storage, idFactory:() => ids.shift(), now:() => '2026-09-03T03:00:00.000Z' });
  const created = store.commitUserMessage('ข้าว 65');

  assert.equal(created.message.id, 'message-1');
  assert.equal(created.message.rawText, 'ข้าว 65');
  assert.equal(created.message.executionState, 'WAITING');
  assert.equal(created.work.id, 'work-1');
  assert.equal(created.work.messageId, 'message-1');

  const reopened = createChatStore({ storage });
  const document = reopened.read();
  assert.equal(document.conversation.id, 'conversation-1');
  assert.equal(document.messages[0].id, 'message-1');
  assert.equal(document.messages[0].rawText, 'ข้าว 65');
  assert.equal(document.work[0].messageId, 'message-1');
});

test('same submit token cannot create a duplicate message', () => {
  const storage = memoryStorage();
  let n = 0;
  const store = createChatStore({ storage, idFactory:(prefix) => `${prefix}-${++n}` });
  const first = store.commitUserMessage('งาน 380 เงินสด', { submitToken:'gesture-1' });
  const second = store.commitUserMessage('งาน 380 เงินสด', { submitToken:'gesture-1' });

  assert.equal(second.message.id, first.message.id);
  assert.equal(store.read().messages.length, 1);
  assert.equal(store.read().work.length, 1);
});

test('archive removes a completed item from active projection but does not delete history', () => {
  const storage = memoryStorage();
  const store = createChatStore({ storage });
  const { message } = store.commitUserMessage('ข้าว 65');
  store.updateMessage(message.id, { executionState:'SUCCESS' });
  store.archive(message.id);

  const document = store.read();
  assert.equal(document.messages.length, 1);
  assert.equal(document.messages[0].archived, true);
  assert.equal(store.activeMessages().length, 0);
});
