"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('service worker fetches navigations from network before offline shell fallback', () => {
  assert.match(sw, /request\.mode\s*===\s*['"]navigate['"]/);
  assert.match(sw, /navigationNetworkFirst\(event\.request\)/);
  assert.match(sw, /fetch\(request,\{cache:['"]no-store['"]\}\)/);
  assert.match(sw, /caches\.match\(['"]\.\/index\.html['"]\)/);

  const helper = sw.indexOf('async function navigationNetworkFirst(request)');
  const network = sw.indexOf("fetch(request,{cache:'no-store'})", helper);
  const fallback = sw.indexOf("caches.match('./index.html')", helper);
  assert.ok(helper >= 0, 'network-first navigation helper must exist');
  assert.ok(network > helper, 'navigation helper must try network');
  assert.ok(fallback > network, 'offline shell lookup must happen only after the network attempt');
});

test('service worker no longer uses generic cache-first handling for every GET', () => {
  assert.doesNotMatch(sw, /caches\.match\(event\.request\)\.then\(cached\s*=>\s*cached\s*\|\|\s*fetch\(event\.request\)/);
});
