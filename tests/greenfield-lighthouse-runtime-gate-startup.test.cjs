const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const appPath = path.join(repoRoot, 'lighthouse-next', 'app.mjs');

test('LIGHTHOUSE startup invokes bootRuntimeGate exactly once outside its definition', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  const occurrences = source.match(/bootRuntimeGate\(\)/g) || [];

  assert.equal(
    occurrences.length,
    2,
    'expected one bootRuntimeGate definition and one startup invocation',
  );
  assert.match(source, /void\s+bootRuntimeGate\(\);/);
});
