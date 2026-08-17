const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const storeUi = fs.readFileSync(path.join(root, 'ui', 'store-ui.mjs'), 'utf8');

test('functional UX keeps five labeled bottom destinations', () => {
  const matches = [...html.matchAll(/class="bottom-nav-btn[^\"]*"[^>]*data-destination="([^"]+)"/g)];
  assert.deepEqual(matches.map(match => match[1]), ['home', 'store', 'ride', 'finance', 'calendar']);
});

test('touch and primary action contract remains explicit', () => {
  assert.match(css, /button\{[^}]*min-height:44px/s);
  assert.match(css, /\.primary-action\{[^}]*min-height:48px/s);
});

test('phone metrics remain compact rather than all becoming one column', () => {
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('warning states have a structural warning treatment at their UI owner', () => {
  assert.match(storeUi, /truth-warning/);
  assert.match(css, /\.truth-warning/);
  assert.match(storeUi, /VERIFY_DUPLICATE|UNSCHEDULED/);
});
