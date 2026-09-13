const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const shellRoot = path.join(root, 'android-shell');
const stageTool = path.join(shellRoot, 'tools', 'stage-lighthouse-next.mjs');

const runtimeFiles = [
  'index.html',
  'setup.html',
  'styles.css',
  'owner-polish.css',
  'app.mjs',
  'surface-contract.mjs',
  'settings-operations.mjs',
  'setup.mjs',
  'view-model.mjs',
  'runtime-gate.mjs',
  'runtime-ledger.mjs',
  'runtime-store.mjs',
  'send-control.mjs',
  'general-income.mjs',
  'store-product.mjs',
  'store-sale.mjs',
  'chat-intent.mjs',
  'chat-intent-recovery.mjs',
  'bangkok-date.mjs',
  'manifest.webmanifest',
];

test('Android stage is owned by the shared LIGHTHOUSE bundle and preserves runtime bytes', async () => {
  assert.equal(fs.existsSync(stageTool), true, 'missing android-shell/tools/stage-lighthouse-next.mjs');
  const mod = await import(pathToFileURL(stageTool).href);
  assert.deepEqual([...mod.RUNTIME_FILES], runtimeFiles);

  await mod.stageLighthouseNext({ repoRoot: root, shellRoot });

  for (const relative of runtimeFiles) {
    const source = await fsp.readFile(path.join(root, 'lighthouse-next', relative));
    const staged = await fsp.readFile(path.join(shellRoot, 'www', 'lighthouse-next', relative));
    assert.deepEqual(staged, source, `staged bytes drifted for ${relative}`);
  }

  for (const relative of [
    'assets/lighthouse-icon.svg',
    'assets/lighthouse-icon-maskable.svg',
  ]) {
    const source = await fsp.readFile(path.join(root, 'lighthouse-next', relative));
    const staged = await fsp.readFile(path.join(shellRoot, 'www', 'lighthouse-next', relative));
    assert.deepEqual(staged, source, `staged bytes drifted for ${relative}`);
  }

  for (const relative of ['runtime.mjs', 'runtime-session.mjs', 'calculation-authority.mjs', 'first-run.mjs']) {
    const source = await fsp.readFile(path.join(root, 'greenfield', relative));
    const staged = await fsp.readFile(path.join(shellRoot, 'www', 'greenfield', relative));
    assert.deepEqual(staged, source, `staged Greenfield bytes drifted for ${relative}`);
  }

  assert.equal(fs.existsSync(path.join(shellRoot, 'www', 'app.mjs')), false, 'legacy flat app must not ship');
  assert.equal(fs.existsSync(path.join(shellRoot, 'www', 'preview.html')), false, 'preview must not ship in the APK runtime');
  assert.equal(fs.existsSync(path.join(shellRoot, 'www', 'lighthouse')), false, 'legacy lighthouse donor runtime must not ship in the APK runtime');
});
