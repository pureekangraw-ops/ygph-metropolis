import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const shellRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(shellRoot, '..');
const wwwRoot = resolve(shellRoot, 'www');

async function text(path) {
  return readFile(path, 'utf8');
}

for (const relative of [
  'app.mjs',
  'ui/app.mjs',
  'ui/master-input.mjs',
  'ui/manual-finance-ui.mjs',
  'ui/settings-ui.mjs',
]) {
  test(`staged Android app keeps existing source byte-identical: ${relative}`, async () => {
    assert.equal(
      await text(resolve(wwwRoot, relative)),
      await text(resolve(repoRoot, relative)),
    );
  });
}

test('staged index differs from existing app only by the protected canonical bootstrap entry', async () => {
  const staged = await text(resolve(wwwRoot, 'index.html'));
  const source = await text(resolve(repoRoot, 'index.html'));
  assert.match(staged, /src="patch\/canonical-bootstrap\.mjs"/);
  assert.doesNotMatch(staged, /src="ui\/master-input\.mjs"/);
  assert.doesNotMatch(staged, /src="app\.mjs"/);
  const restored = staged.replace(
    '  <script type="module" src="patch/canonical-bootstrap.mjs"></script>',
    '  <script type="module" src="ui/master-input.mjs"></script>\n  <script type="module" src="app.mjs"></script>',
  );
  assert.equal(restored, source);
});

test('existing Chat ↔ Manual bridge wiring is packaged', async () => {
  const source = await text(resolve(wwwRoot, 'ui/app.mjs'));
  for (const marker of [
    'openManualFromChat',
    'askFromManual',
    'returnToManual',
    'returnToChat',
    'configureMasterInputBridge',
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test('existing Manual ask action is packaged', async () => {
  const source = await text(resolve(wwwRoot, 'ui/manual-finance-ui.mjs'));
  assert.match(source, /ถามเรื่องนี้/);
  assert.match(source, /onAskAbout/);
});

test('existing Settings utility is packaged', async () => {
  const source = await text(resolve(wwwRoot, 'ui/settings-ui.mjs'));
  assert.match(source, /settingsUtilityIndex/);
  assert.match(source, /การแจ้งเตือนและสิทธิ์/);
  assert.match(source, /ข้อมูลและการสำรอง/);
  assert.match(source, /ความปลอดภัย/);
});

test('Android entry is the existing application behind canonical snapshot bootstrap, not replacement front-door UI', async () => {
  const source = await text(resolve(wwwRoot, 'index.html'));
  assert.match(source, /YGPH METROPOLIS/);
  assert.match(source, /src="patch\/canonical-bootstrap\.mjs"/);
  assert.doesNotMatch(source, /src="ui\/master-input\.mjs"/);
  assert.doesNotMatch(source, /src="app\.mjs"/);
  assert.doesNotMatch(source, /Foundation Proof/);
  assert.doesNotMatch(source, /trusted\/bootstrap\.mjs/);
});
