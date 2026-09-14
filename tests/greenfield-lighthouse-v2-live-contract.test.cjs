const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'lighthouse-next', 'index.html'), 'utf8');
const css = readFileSync(join(root, 'lighthouse-next', 'owner-polish.css'), 'utf8');

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('LIGHTHOUSE V2 keeps PIN outside a three-root live shell', () => {
  assert.match(html, /<section id="auth-screen"/);
  assert.match(html, /<section id="app-shell"/);
  assert.ok(html.indexOf('id="auth-screen"') < html.indexOf('id="app-shell"'));
  assert.equal(count(html, 'data-root-target="chat"'), 1);
  assert.equal(count(html, 'data-root-target="manual"'), 1);
  assert.equal(count(html, 'data-root-target="settings"'), 1);
  assert.equal(count(html, 'data-root-target="home"'), 0);
});

test('LIGHTHOUSE V2 exposes the Figma-approved semantic visual tokens', () => {
  for (const token of [
    '--lh-v2-bg-deep',
    '--lh-v2-panel',
    '--lh-v2-gold',
    '--lh-v2-cyan',
    '--lh-v2-success',
    '--lh-v2-danger',
    '--lh-v2-radius-shell',
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('LIGHTHOUSE V2 has explicit visual state hooks for CHAT truth flow', () => {
  for (const state of ['confirm', 'edit', 'committing', 'verified-success', 'failed']) {
    assert.match(css, new RegExp(`\\.chat-state-${state}\\b`));
  }
});