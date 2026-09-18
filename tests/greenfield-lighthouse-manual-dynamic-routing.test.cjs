const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('dynamic Income descendants route through one MANUAL task owner', () => {
  const app = read('lighthouse-next/app.mjs');
  const surface = read('lighthouse-next/surface-contract.mjs');

  assert.match(surface, /data-income-target="store" data-task="store"/);
  assert.match(surface, /data-income-target="ride" data-task="ride"/);
  assert.match(surface, /\['income','outcome','calendar','ledger','store','ride'\]\.includes\(task\)/);
  assert.match(surface, /task === 'store'[\s\S]*renderStore\(\)/);
  assert.match(surface, /renderRide\(\)/);
  assert.match(surface, /task === 'ledger'[\s\S]*renderLedger\(\)/);
  assert.match(surface, /root\?\.addEventListener\(['"]click['"]/);

  assert.doesNotMatch(app, /closest\?\.\(['"]\[data-task\]['"]\)[\s\S]*openManualTask\(task\)/);
  assert.doesNotMatch(app, /querySelectorAll\(['"]\[data-task\]['"]\)\.forEach/);
});

test('MANUAL navigation owner ignores clicks outside declared task controls', () => {
  const surface = read('lighthouse-next/surface-contract.mjs');
  assert.match(surface, /const task = event\.target\.closest\?\.\(['"]\[data-task\]['"]\)\?\.dataset\.task/);
  assert.match(surface, /if \(!\['income','outcome','calendar','ledger','store','ride'\]\.includes\(task\)\) return;/);
});
