"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'RELEASE_MANIFEST.json'), 'utf8'));

function expectedAssetRevision() {
  const hash = crypto.createHash('sha256');
  const paths = manifest.productionFiles.map(item => item.path).filter(file => file !== 'sw.js').sort();
  for (const file of paths) {
    hash.update(file);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, file)));
    hash.update('\0');
  }
  return `sha256-${hash.digest('hex').slice(0, 16)}`;
}

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

test('service-worker cache identity is coupled to the actual production asset revision', () => {
  const expected = expectedAssetRevision();
  assert.equal(manifest.serviceWorker.assetRevision, expected, `update release assetRevision to ${expected}`);
  assert.match(sw, new RegExp(`const ASSET_REVISION=['"]${expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}['"]`));
  assert.match(sw, /const CACHE=`ygph-metropolis-\$\{RELEASE\}-\$\{ASSET_REVISION\}`/);
});

test('offline shell is exactly the manifest production asset set except service worker itself', () => {
  const shellMatch = /const SHELL=(\[[^;]+\]);/.exec(sw);
  assert.ok(shellMatch, 'SHELL constant must be statically declared');
  const shell = Function(`"use strict"; return (${shellMatch[1]});`)().map(file => file.replace(/^\.\//,''));
  const expected = manifest.productionFiles.map(item => item.path).filter(file => file !== 'sw.js').sort();
  assert.deepEqual([...shell].sort(), expected);
});
