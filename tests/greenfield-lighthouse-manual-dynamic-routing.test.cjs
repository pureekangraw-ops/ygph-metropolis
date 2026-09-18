const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('dynamic Income descendants route through one delegated MANUAL task owner', () => {
  const app = read('lighthouse-next/app.mjs');
  const surface = read('lighthouse-next/surface-contract.mjs');

  assert.match(surface, /data-income-target="store" data-task="store"/);
  assert.match(surface, /data-income-target="ride" data-task="ride"/);
  assert.match(surface, /if \(!\['income','outcome','calendar'\]\.includes\(task\)\) return;/);

  assert.match(app, /root\.addEventListener\(['"]click['"],\s*event\s*=>[\s\S]*closest\?\.\(['"]\[data-task\]['"]\)[\s\S]*openManualTask\(task\)/);
  assert.doesNotMatch(app, /querySelectorAll\(['"]\[data-task\]['"]\)\.forEach/);
});

test('delegated MANUAL task owner ignores clicks that are not task controls', () => {
  const app = read('lighthouse-next/app.mjs');
  assert.match(app, /const taskButton\s*=\s*event\.target\.closest\?\.\(['"]\[data-task\]['"]\)/);
  assert.match(app, /if \(!taskButton\) return;/);
});
