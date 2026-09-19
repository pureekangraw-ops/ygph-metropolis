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


test('LIGHTHOUSE GO report stays bounded to the Android viewport without horizontal pan', () => {
  const goCssPath = path.join(root, 'lighthouse-next/go-board-live.css');
  const css = read(goCssPath);
  const page = ruleBody(css, '.go-page');
  const card = ruleBody(css, '.go-live-card');
  const rail = ruleBody(css, '.go-route-rail');
  const boardCard = ruleBody(css, '.go-board-card');
  const pending = ruleBody(css, '.go-pending-item');
  const projectCard = ruleBody(css, '.go-project-source-card');

  assert.match(page, /width\s*:\s*100%/, 'GO page must own only the available viewport width');
  assert.match(page, /max-width\s*:\s*100%/, 'GO page must not grow beyond the viewport');
  assert.match(page, /min-width\s*:\s*0/, 'GO page grid must be allowed to shrink on Android');
  assert.match(page, /overflow-x\s*:\s*clip/, 'GO page must clip accidental horizontal overflow');
  assert.match(page, /overscroll-behavior-x\s*:\s*none/, 'GO page must not rubber-band sideways');
  assert.match(page, /touch-action\s*:\s*pan-y/, 'GO report must keep vertical touch scrolling while rejecting horizontal pan');

  for (const [name, body] of [
    ['live card', card],
    ['route rail', rail],
    ['board card', boardCard],
    ['pending row', pending],
    ['project source card', projectCard],
  ]) {
    assert.match(body, /max-width\s*:\s*100%/, `${name} must stay inside the GO report width`);
    assert.match(body, /min-width\s*:\s*0/, `${name} must be shrinkable on narrow Android viewports`);
  }
});
