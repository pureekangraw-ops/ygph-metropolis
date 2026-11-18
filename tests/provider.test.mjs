import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAICompatibleProvider, validateEndpoint } from '../src/core/provider.mjs';

test('validateEndpoint enforces HTTPS without embedded credentials or query strings', () => {
  assert.doesNotThrow(() => validateEndpoint('https://api.example.com/v1/chat/completions'));
  assert.throws(() => validateEndpoint('http://api.example.com/v1/chat/completions'), /ENDPOINT_INVALID/);
  assert.throws(() => validateEndpoint('https://user:pass@api.example.com/v1'), /ENDPOINT_INVALID/);
  assert.throws(() => validateEndpoint('https://api.example.com/v1?key=123'), /ENDPOINT_INVALID/);
});

test('createOpenAICompatibleProvider sends bearer auth and unwraps markdown JSON fences', async () => {
  let captured = null;
  const provider = createOpenAICompatibleProvider({
    endpoint: 'https://api.example.com/v1/chat/completions',
    model: 'gemini-2.5-flash',
    apiKey: 'test-key-123',
    fetchImpl: async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '```json\n{"reply":"สวัสดีครับ"}\n```' } }],
        }),
        { status: 200 },
      );
    },
  });

  const result = await provider({
    system: 'sys',
    text: 'hello',
    context: {},
    policy: { action: 'OBSERVE' },
  });

  assert.equal(captured.init.headers.Authorization, 'Bearer test-key-123');
  assert.equal(captured.body.model, 'gemini-2.5-flash');
  assert.deepEqual(result, { reply: 'สวัสดีครับ' });
});

test('createOpenAICompatibleProvider rejects HTTP errors and oversized payloads', async () => {
  const failingProvider = createOpenAICompatibleProvider({
    endpoint: 'https://api.example.com/v1/chat/completions',
    model: 'gemini-2.5-flash',
    apiKey: 'test-key-123',
    fetchImpl: async () => new Response('upstream error', { status: 502 }),
  });

  await assert.rejects(
    () => failingProvider({ system: 's', text: 'hi', context: {}, policy: {} }),
    /MODEL_HTTP_ERROR_502/,
  );

  const oversizeProvider = createOpenAICompatibleProvider({
    endpoint: 'https://api.example.com/v1/chat/completions',
    model: 'gemini-2.5-flash',
    apiKey: 'test-key-123',
    fetchImpl: async () => new Response('{}', { status: 200 }),
  });

  await assert.rejects(
    () => oversizeProvider({ system: 's'.repeat(70000), text: 'hi', context: {}, policy: {} }),
    /MODEL_REQUEST_TOO_LARGE/,
  );
});
