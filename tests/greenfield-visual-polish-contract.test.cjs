const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const css = fs.readFileSync('styles.css', 'utf8');

test('visual polish contract is present without changing interaction architecture', () => {
  assert.match(css, /--space-1:/);
  assert.match(css, /--radius-panel:/);
  assert.match(css, /\.page-head h1[^}]*font-size:/);
  assert.match(css, /button\{[^}]*min-height:44px/);
  assert.match(css, /\.modal-dialog[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.bottom-nav-btn\.active[^}]*font-weight:/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.workspace-content/);
});
