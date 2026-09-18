const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const root = process.cwd();

test('syntax gate directly checks every staged LIGHTHOUSE JavaScript runtime module', async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const stage = await import(`${pathToFileURL(path.join(root, 'scripts', 'stage-lighthouse-next-bundle.mjs')).href}?t=${Date.now()}`);
  const command = String(pkg.scripts?.['check:syntax'] || '');

  for (const relative of stage.LIGHTHOUSE_RUNTIME_FILES.filter(file => file.endsWith('.mjs'))) {
    assert.match(
      command,
      new RegExp(`node --check lighthouse-next/${relative.replace(/[.*+?^$\{\}()|[\]\\\\]/g, '\\\\$&')}`),
      `${relative} must be directly syntax checked`,
    );
  }
});
