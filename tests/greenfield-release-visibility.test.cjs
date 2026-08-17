"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('System exposes release and service-worker status instead of stale shell copy', () => {
  const html = source('index.html');
  const app = source('ui/app.mjs');
  assert.match(html, /id="systemVersion">—</);
  assert.match(html, /id="systemServiceWorker">/);
  assert.match(app, /RELEASE_MANIFEST\.json/);
  assert.match(app, /systemVersion/);
  assert.match(app, /systemServiceWorker/);
  assert.doesNotMatch(html, /Production Shell v2/);
  assert.doesNotMatch(app, /register\('\.\/sw\.js'\)\.catch\(\(\)=>\{\}\)/);
});

test('Cloudflare security headers are publication-owned and frame protection is not meta-only', () => {
  const headers = source('_headers');
  const html = source('index.html');
  const manifest = JSON.parse(source('RELEASE_MANIFEST.json'));
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: no-referrer/);
  assert.doesNotMatch(html, /http-equiv="Content-Security-Policy"/);
  assert.ok(manifest.productionFiles.some(entry => entry.path === '_headers'));
});
