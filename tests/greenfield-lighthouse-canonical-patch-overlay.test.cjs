'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

test('Patchable vocabulary contains only explicit known typo corrections', () => {
  const vocabulary = JSON.parse(read('android-shell/www/app/vocabulary.json'));
  assert.equal(vocabulary.appName, 'LIGHTHOUSE');
  assert.deepEqual(vocabulary.intentCorrections, {
    'ปติธิน':'ปฏิทิน',
    'ปฏิธิน':'ปฏิทิน',
    'ปติทิน':'ปฏิทิน',
    'ปฎิทิน':'ปฏิทิน',
    'ปฎิธิน':'ปฏิทิน',
    'น้ามัน':'น้ำมัน',
  });
});

test('Chat normalizes explicit known typos before Trusted Brain and leaves ambiguous text alone', async () => {
  const logicPath = path.join(ROOT, 'android-shell/www/app/logic.mjs');
  const logic = await import(`${pathToFileURL(logicPath).href}?test=${Date.now()}`);
  const vocabulary = JSON.parse(read('android-shell/www/app/vocabulary.json'));

  assert.equal(logic.normalizeChatInput('ลง ปติธิน พรุ่งนี้', vocabulary), 'ลง ปฏิทิน พรุ่งนี้');
  assert.equal(logic.normalizeChatInput('น้ามัน 300', vocabulary), 'น้ำมัน 300');
  assert.equal(logic.normalizeChatInput('ขาว 65', vocabulary), 'ขาว 65');
  assert.equal(logic.normalizeChatInput('น้ำมัน 300', vocabulary), 'น้ำมัน 300');
});
