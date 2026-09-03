import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatService } from '../app/public/logic/chat/chat-service.mjs';

function memoryStore() {
  const map = new Map();
  return {
    async get(key) { return structuredClone(map.get(key) ?? null); },
    async put(key, value) { map.set(key, structuredClone(value)); },
  };
}

test('dispatch dedupes same requestId and persists conversation state', async () => {
  const calls = [];
  const service = createChatService({
    store: memoryStore(),
    modules:{ execute: async command => { calls.push(command); return { status:'VERIFIED', readback:{ state:'DISABLED' }, revision:2, eventId:'evt-1' }; } },
  });

  const intent = { requestId:'req-1', route:'DIRECT_COMMAND', payload:{ commandId:'cmd-1', actor:'GO', source:'CHAT', moduleId:'income', capability:'DISABLE', expectedRevision:1 } };
  const first = await service.dispatch(intent);
  const second = await service.dispatch(intent);
  assert.equal(first.status, 'SUCCESS');
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);
  assert.equal((await service.getState()).requests['req-1'].status, 'SUCCESS');
});

test('routes query, multi-group, recovery and provider through owners', async () => {
  const seen = [];
  const service = createChatService({
    store: memoryStore(),
    modules:{ execute: async () => { throw new Error('UNEXPECTED_DIRECT'); } },
    query: async payload => { seen.push('query'); return { status:'VERIFIED', readback:payload }; },
    multiGroup: async payload => { seen.push('multi'); return { status:'COMMITTED', readback:payload }; },
    recovery:{ retry: async payload => { seen.push('recovery'); return { status:'VERIFIED', readback:payload }; } },
    provider: async payload => { seen.push('provider'); return { status:'VERIFIED', readback:payload }; },
  });

  for (const [route, requestId] of [['LOCAL_QUERY','q'],['LOCAL_MULTI_GROUP','m'],['RECOVERY','r'],['PROVIDER','p']]) {
    const result = await service.dispatch({ requestId, route, payload:{ value:requestId } });
    assert.equal(result.status, 'SUCCESS');
  }
  assert.deepEqual(seen, ['query','multi','recovery','provider']);
});

test('mutation cannot report SUCCESS without durable readback', async () => {
  const service = createChatService({
    store: memoryStore(),
    modules:{ execute: async () => ({ status:'VERIFIED', revision:2, eventId:'evt-2' }) },
  });
  await assert.rejects(
    service.dispatch({ requestId:'req-no-readback', route:'DIRECT_COMMAND', payload:{ commandId:'cmd-x', actor:'GO', source:'CHAT', moduleId:'income', capability:'DISABLE', expectedRevision:1 } }),
    /CHAT_MUTATION_READBACK_REQUIRED/,
  );
  assert.equal((await service.getState()).requests['req-no-readback'].status, 'ERROR');
});
