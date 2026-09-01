'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('Patch allowlist targets canonical LIGHTHOUSE web paths, not a second Patch shell', () => {
  const contract = read('android-shell/www/patch/patch-contract.mjs');

  for (const canonicalPath of [
    'app/ui.html',
    'app/ui.css',
    'app/logic.mjs',
    'app/rules.json',
    'app/vocabulary.json',
  ]) {
    assert.match(contract, new RegExp(`['\"]${canonicalPath.replaceAll('.', '\\.') }['\"]`));
  }

  for (const legacyPath of ['ui.html', 'ui.css', 'logic.mjs', 'rules.json', 'vocabulary.json']) {
    const bare = new RegExp(`^\\s*['\"]${legacyPath.replaceAll('.', '\\.') }['\"],?\\s*$`, 'm');
    assert.doesNotMatch(contract, bare, `legacy Patch-shell path must not remain: ${legacyPath}`);
  }
});

test('Patch runtime no longer mounts a Patch-owned ui.html as an independent app', () => {
  const runtime = read('android-shell/www/patch/patch-runtime.mjs');
  assert.doesNotMatch(runtime, /root\.innerHTML\s*=\s*assets\[['\"]ui\.html['\"]\]/);
  assert.doesNotMatch(runtime, /assets\[['\"]logic\.mjs['\"]\]/);
});

test('Patch verification keeps signature, hash, version and unsupported-path rejection', () => {
  const contract = read('android-shell/www/patch/patch-contract.mjs');
  assert.match(contract, /ECDSA-P256-SHA256/);
  assert.match(contract, /SHA-256 hash mismatch/);
  assert.match(contract, /baseVersion must equal the current version/);
  assert.match(contract, /Unsupported patch asset path/);
});

test('Android entry keeps one LIGHTHOUSE app root through trusted bootstrap', () => {
  const index = read('android-shell/www/index.html');
  assert.match(index, /<title>LIGHTHOUSE<\/title>/);
  assert.match(index, /src=['\"]\.\/trusted\/bootstrap\.mjs['\"]/);
  assert.doesNotMatch(index, /YGPH METROPOLIS/i);
});
