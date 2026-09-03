import test from 'node:test';
import assert from 'node:assert/strict';
import { appendChatEvent, deriveChatSnapshot, meaningfulChange } from '../src/chat-state.mjs';

function baseDocument() {
  return {
    messages:[{ id:'message-1', executionState:'WAITING', syncState:'WAITING' }],
    work:[{ id:'work-1', messageId:'message-1', status:'WAITING' }],
    events:[],
    changeMarkers:{},
  };
}

test('event history is append-only and current snapshot is derived separately', () => {
  let document = baseDocument();
  document = appendChatEvent(document, {
    id:'event-1', messageId:'message-1', workId:'work-1',
    executionState:'WAITING', syncState:'WAITING', at:'2026-09-03T03:00:00.000Z',
  });
  document = appendChatEvent(document, {
    id:'event-2', messageId:'message-1', workId:'work-1',
    executionState:'SUCCESS', syncState:'SUCCESS', at:'2026-09-03T03:00:01.000Z',
  });

  assert.equal(document.events.length, 2);
  const snapshot = deriveChatSnapshot(document, 'message-1');
  assert.equal(snapshot.executionState, 'SUCCESS');
  assert.equal(snapshot.syncState, 'SUCCESS');
  assert.equal(snapshot.latestEventId, 'event-2');
});

test('WAITING to WAITING is internal evidence only', () => {
  const previous = { executionState:'WAITING', syncState:'WAITING' };
  const next = { executionState:'WAITING', syncState:'WAITING', latestEventId:'event-new' };
  assert.equal(meaningfulChange(previous, next), false);
});

test('WAITING to BLOCKED ERROR or SUCCESS is meaningful', () => {
  const previous = { executionState:'WAITING', syncState:'WAITING' };
  for (const executionState of ['BLOCKED','ERROR','SUCCESS']) {
    assert.equal(meaningfulChange(previous, { executionState, syncState:'SUCCESS' }), true);
  }
});

test('readback failure does not overwrite domain execution truth', () => {
  const previous = { executionState:'SUCCESS', syncState:'WAITING' };
  const next = { executionState:'SUCCESS', syncState:'ERROR' };
  assert.equal(meaningfulChange(previous, next), true);
  assert.equal(next.executionState, 'SUCCESS');
});
