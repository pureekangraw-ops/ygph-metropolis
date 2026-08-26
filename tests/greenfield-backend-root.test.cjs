"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

async function workerFetch(request, env = {}) {
  const { default: worker } = await import('../worker/index.mjs');
  assert.equal(typeof worker.fetch, 'function', 'Worker must expose fetch(request, env)');
  return worker.fetch(request, env);
}

test('backend root config declares a selective Worker spine for API routes', () => {
  const config = JSON.parse(read('wrangler.jsonc'));
  assert.equal(config.main, 'worker/index.mjs');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.deepEqual(config.assets.run_worker_first, ['/api/*']);
  assert.ok(fs.existsSync('worker/index.mjs'));
});

test('backend root keeps browser network access same-origin only', () => {
  const headers = read('_headers');
  assert.match(headers, /connect-src 'self'/);
  assert.doesNotMatch(headers, /connect-src 'none'/);
});

test('deploy syntax gate includes the Worker entrypoint', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['check:syntax'], /worker\/index\.mjs/);
});

test('GET /api/v1/health returns a secret-free no-store health response', async () => {
  const sentinel = 'SENTINEL_SECRET_MUST_NOT_LEAK';
  const response = await workerFetch(
    new Request('https://metro.example/api/v1/health', { method: 'GET' }),
    { OPENAI_API_KEY: sentinel, OTHER_SECRET: `${sentinel}_2` },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^application\/json\b/i);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const body = await response.json();
  assert.equal(body.version, '1');
  assert.equal(body.status, 'ok');
  assert.match(body.requestId, /^req_[0-9a-f-]{36}$/i);
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes(sentinel), false);
});

test('unknown /api/v1 route fails closed with normalized JSON', async () => {
  const response = await workerFetch(new Request('https://metro.example/api/v1/nope'));
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.version, '1');
  assert.equal(body.status, 'ERROR');
  assert.equal(body.code, 'NOT_FOUND');
  assert.match(body.requestId, /^req_[0-9a-f-]{36}$/i);
});
