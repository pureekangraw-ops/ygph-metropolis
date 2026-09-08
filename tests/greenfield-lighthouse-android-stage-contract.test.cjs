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
  'styles.css',
  'owner-polish.css',
  'app.mjs',
  'send-control.mjs',
  'general-income.mjs',
  'store-sale.mjs',
  'bangkok-date.mjs',
  'manifest.webmanifest',
];

test('Android stage is owned by lighthouse-next and preserves runtime bytes', async () => {
  assert.equal(fs.existsSync(stageTool), true, 'missing android-shell/tools/stage-lighthouse-next.mjs');
  const mod = await import(pathToFileURL(stageTool).href);
  assert.deepEqual([...mod.RUNTIME_FILES], runtimeFiles);

  await mod.stageLighthouseNext({ repoRoot: root, shellRoot });

  for (const relative of runtimeFiles) {
    const source = await fsp.readFile(path.join(root, 'lighthouse-next', relative));
    const staged = await fsp.readFile(path.join(shellRoot, 'www', relative));
    assert.deepEqual(staged, source, `staged bytes drifted for ${relative}`);
  }

  for (const relative of [
    'assets/lighthouse-icon.svg',
    'assets/lighthouse-icon-maskable.svg',
  ]) {
    const source = await fsp.readFile(path.join(root, 'lighthouse-next', relative));
    const staged = await fsp.readFile(path.join(shellRoot, 'www', relative));
    assert.deepEqual(staged, source, `staged bytes drifted for ${relative}`);
  }

  assert.equal(fs.existsSync(path.join(shellRoot, 'www', 'preview.html')), false, 'preview must not ship in the APK runtime');
  assert.equal(fs.existsSync(path.join(shellRoot, 'www', 'greenfield')), false, 'legacy greenfield must not ship in the APK runtime');
  assert.equal(fs.existsSync(path.join(shellRoot, 'www', 'lighthouse')), false, 'legacy lighthouse donor runtime must not ship in the APK runtime');
});
