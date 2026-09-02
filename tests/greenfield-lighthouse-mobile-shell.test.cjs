const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'lighthouse.css'), 'utf8');

test('LIGHTHOUSE brand is present before JavaScript bootstrap', () => {
  assert.match(html, /<title>LIGHTHOUSE<\/title>/);
  assert.match(html, /<strong>LIGHTHOUSE<\/strong>/);
  assert.doesNotMatch(html, /YGPH METROPOLIS/);
});

test('mobile shell owns a dynamic viewport and safe areas', () => {
  assert.match(css, /min-height\s*:\s*100dvh/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-bottom/);
});

test('primary mobile navigation keeps touch targets at least 44 CSS px', () => {
  assert.match(css, /\.lighthouse-bottom-nav button\s*\{[^}]*min-height\s*:\s*(?:4[4-9]|[5-9]\d|\d{3,})px/s);
});

test('CHAT uses the remaining shell height with its own scroll region', () => {
  assert.match(css, /#workspace\[data-lighthouse-view="chat"\][^{]*\{[^}]*min-height/s);
  assert.match(css, /master-input[^}]*overflow-y\s*:\s*auto/s);
});
