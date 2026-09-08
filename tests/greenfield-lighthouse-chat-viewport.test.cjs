const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const cssPath = path.join(root, 'lighthouse-next/styles.css');
const appPath = path.join(root, 'lighthouse-next/app.mjs');

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

test('Android keyboard mode hides fixed bottom navigation and reclaims its height for CHAT', () => {
  const css = read(cssPath);
  const app = read(appPath);
  const keyboardNav = ruleBody(css, '#demo-root.keyboard-open .bottom-nav');
  const keyboardChat = ruleBody(css, '#demo-root.keyboard-open .chat-page');

  assert.match(app, /visualViewport/, 'CHAT must observe the visual viewport so keyboard state follows the real Android viewport');
  assert.match(app, /classList\.toggle\(['"]keyboard-open['"]/, 'CHAT must expose keyboard-open state to layout CSS');
  assert.match(keyboardNav, /display\s*:\s*none/, 'bottom navigation must not ride above the Android keyboard');
  assert.match(keyboardChat, /height\s*:\s*calc\(100dvh\s*-\s*104px/, 'CHAT must reclaim the navigation height while the keyboard is open');
});
