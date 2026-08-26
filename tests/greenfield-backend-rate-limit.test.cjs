"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function workerFetch(request, env = {}) {
  const { default: worker } = await import('../worker/index.mjs');
  return worker.fetch(request, env);
}

function validInterpretRequest(text = 'ข้าว 65') {
  return new Request('https://metro.example/api/v1/interpret', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: '1', text, context: {} }),
  });
}

function makeLimiter(success) {
  const calls = [];
  return {
    calls,
    async limit(input) {
      calls.push(input);
      return { success };
    },
  };
}

test('wrangler config binds a dedicated 10-per-minute interpreter limiter', () => {
  const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));
  assert.deepEqual(config.ratelimits, [{
    name: 'INTERPRET_RATE_LIMITER',
    namespace_id: '926082601',
    simple: { limit: 10, period: 60 },
  }]);
});

test('valid interpret request fails closed when rate limiter binding is absent', async () => {
  const response = await workerFetch(validInterpretRequest());
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'RATE_LIMITER_NOT_CONFIGURED');
});

test('rate-limited interpret request returns 429 before provider work', async () => {
  const limiter = makeLimiter(false);
  const prompt = 'PRIVATE USER TEXT ข้าว 65';
  const response = await workerFetch(validInterpretRequest(prompt), {
    INTERPRET_RATE_LIMITER: limiter,
  });
  assert.equal(response.status, 429);
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(body.code, 'RATE_LIMITED');
  assert.equal(text.includes(prompt), false);
  assert.deepEqual(limiter.calls, [{ key: 'metro-interpreter' }]);
});

test('allowed interpret request reaches the existing closed provider stub', async () => {
  const limiter = makeLimiter(true);
  const response = await workerFetch(validInterpretRequest(), {
    INTERPRET_RATE_LIMITER: limiter,
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'INTERPRETER_NOT_CONFIGURED');
  assert.deepEqual(limiter.calls, [{ key: 'metro-interpreter' }]);
});

test('invalid interpret request is rejected before consuming rate quota', async () => {
  const limiter = makeLimiter(true);
  const response = await workerFetch(new Request('https://metro.example/api/v1/interpret', {
    method: 'GET',
  }), { INTERPRET_RATE_LIMITER: limiter });
  assert.equal(response.status, 405);
  assert.deepEqual(limiter.calls, []);
});

test('health is not rate limited', async () => {
  const limiter = makeLimiter(false);
  const response = await workerFetch(new Request('https://metro.example/api/v1/health'), {
    INTERPRET_RATE_LIMITER: limiter,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(limiter.calls, []);
});
