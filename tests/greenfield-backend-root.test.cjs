"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
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
