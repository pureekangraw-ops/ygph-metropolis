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
  'index.html',
  'app.mjs',
  'lighthouse.css',
  'ui/app.mjs',
  'ui/master-input.mjs',
  'ui/manual-finance-ui.mjs',
  'ui/settings-ui.mjs',
  'ui/lighthouse-shell.mjs',
]) {
  test(`staged Android app keeps existing source byte-identical: ${relative}`, async () => {
    assert.equal(
      await text(resolve(wwwRoot, relative)),
      await text(resolve(repoRoot, relative)),
    );
  });
}

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

test('LIGHTHOUSE three-page coastal shell is packaged without replacing domain runtime', async () => {
  const [shell, css, theme] = await Promise.all([
    text(resolve(wwwRoot, 'ui/lighthouse-shell.mjs')),
    text(resolve(wwwRoot, 'lighthouse.css')),
    text(resolve(wwwRoot, 'ui/theme-shell.mjs')),
  ]);
  for (const marker of ['LIGHTHOUSE', 'CHAT', 'MANUAL', 'SETTINGS', 'masterInputShell', 'manualHub']) {
    assert.match(shell, new RegExp(marker));
  }
  assert.match(theme, /lighthouse-shell\.mjs/);
  assert.match(css, /--lh-navy:\s*#0d2b45/i);
  assert.match(css, /--lh-ocean:\s*#1e5a8a/i);
  assert.match(css, /--lh-seafoam:\s*#1fa7a4/i);
  assert.match(css, /\.lighthouse-wave/);
  assert.match(css, /\.lighthouse-bottom-nav/);
  assert.doesNotMatch(shell, /greenfield\//);
  assert.doesNotMatch(shell, /runtime\.mjs/);
  assert.doesNotMatch(shell, /persistence\.mjs/);
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

test('Android entry starts the existing application directly and never waits for snapshot bootstrap', async () => {
  const source = await text(resolve(wwwRoot, 'index.html'));
  assert.match(source, /src="ui\/master-input\.mjs"/);
  assert.match(source, /src="app\.mjs"/);
  assert.doesNotMatch(source, /canonical-bootstrap|CURRENT_SNAPSHOT/);
  assert.doesNotMatch(source, /Foundation Proof/);
  assert.doesNotMatch(source, /trusted\/bootstrap\.mjs/);
});
