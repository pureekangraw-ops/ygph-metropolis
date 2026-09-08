const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const cssPath = path.join(root, 'lighthouse-next/styles.css');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\{([^}]*)\\}`))?.[1] || '';
}

test('CHAT keeps actions and composer inside the viewport above fixed bottom navigation', () => {
  const css = read(cssPath);
  const page = ruleBody(css, '.chat-page');
  const thread = ruleBody(css, '.chat-thread');

  assert.match(page, /height\s*:\s*calc\(/, 'chat page must have a bounded viewport height');
  assert.match(page, /min-height\s*:\s*0/, 'chat page must be allowed to shrink inside the app shell');
  assert.match(thread, /min-height\s*:\s*0/, 'chat thread must shrink and scroll instead of pushing actions under navigation');
});
