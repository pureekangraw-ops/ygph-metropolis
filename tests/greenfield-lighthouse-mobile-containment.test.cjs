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

test('LIGHTHOUSE mobile chat keeps header bubbles actions and composer inside the viewport width', () => {
  const css = read(cssPath);
  const shell = ruleBody(css, '.app-shell');
  const header = ruleBody(css, '.app-header');
  const chatPage = ruleBody(css, '.chat-page');
  const thread = ruleBody(css, '.chat-thread');
  const message = ruleBody(css, '.message');
  const actions = ruleBody(css, '.chat-actions');
  const composer = ruleBody(css, '.chat-composer');

  assert.match(shell, /width\s*:\s*100%/, 'app shell must own the viewport width explicitly');
  assert.match(header, /min-width\s*:\s*0/, 'header children must be allowed to shrink instead of pushing off-screen');
  assert.match(chatPage, /width\s*:\s*100%/, 'chat page must stay bounded to its parent width');
  assert.match(chatPage, /min-width\s*:\s*0/, 'chat page must be shrinkable on narrow phones');
  assert.match(thread, /width\s*:\s*100%/, 'chat thread must not widen the page');
  assert.match(actions, /width\s*:\s*100%/, 'quick actions must scroll inside their own width');
  assert.match(composer, /width\s*:\s*100%/, 'composer must remain inside the viewport');
  assert.match(message, /overflow-wrap\s*:\s*anywhere/, 'long human text must wrap instead of clipping the bubble');
});
