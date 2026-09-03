const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const base = path.join(root, 'lighthouse-new-base');

test('LIGHTHOUSE new base exists as its own product boundary', () => {
  assert.equal(fs.existsSync(base), true);
  assert.equal(fs.existsSync(path.join(base, 'package.json')), true);
});

test('LIGHTHOUSE new base source does not import legacy UI/navigation', () => {
  const src = path.join(base, 'src');
  if (!fs.existsSync(src)) return;
  const files = fs.readdirSync(src).filter((name) => name.endsWith('.mjs'));
  for (const file of files) {
    const text = fs.readFileSync(path.join(src, file), 'utf8');
    assert.doesNotMatch(text, /(?:\.\.\/)+ui\//);
    assert.doesNotMatch(text, /(?:\.\.\/)+app\.mjs/);
  }
});
