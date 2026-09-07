const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function expectRule(css, selector, checks) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'is'));
  assert.ok(match, `missing CSS rule: ${selector}`);
  for (const re of checks) assert.match(match[1], re, `${selector} missing ${re}`);
}

test('approved Figma language is carried through every live root surface', () => {
  const css = read('lighthouse-next/owner-polish.css');

  expectRule(css, '.home-hero', [
    /border\s*:\s*1px solid rgba\(71,\s*97,\s*129,/i,
    /background\s*:\s*linear-gradient/i,
    /box-shadow/i,
  ]);

  expectRule(css, '.metric-card', [
    /border\s*:\s*1px solid rgba\(71,\s*97,\s*129,/i,
    /background\s*:\s*linear-gradient/i,
  ]);

  expectRule(css, '.next-step-card', [
    /border\s*:\s*1px solid rgba\(245,\s*158,\s*11,/i,
    /background\s*:\s*linear-gradient/i,
  ]);

  expectRule(css, '.message.app', [
    /border\s*:\s*1px solid rgba\(71,\s*97,\s*129,/i,
    /background\s*:\s*linear-gradient/i,
  ]);

  expectRule(css, '.message.user', [
    /border\s*:\s*1px solid rgba\(245,\s*158,\s*11,/i,
    /background\s*:\s*linear-gradient/i,
  ]);

  expectRule(css, '.chat-composer', [
    /border-radius\s*:\s*18px/i,
    /border\s*:\s*1px solid rgba\(71,\s*97,\s*129,/i,
    /background\s*:\s*linear-gradient/i,
  ]);

  expectRule(css, '.detail-hero', [
    /border\s*:\s*1px solid rgba\(71,\s*97,\s*129,/i,
    /background\s*:\s*linear-gradient/i,
  ]);

  expectRule(css, '.detail-row', [
    /border\s*:\s*1px solid rgba\(71,\s*97,\s*129,/i,
    /background\s*:\s*linear-gradient/i,
  ]);

  expectRule(css, '.settings-row', [
    /border\s*:\s*1px solid rgba\(71,\s*97,\s*129,/i,
    /background\s*:\s*linear-gradient/i,
  ]);

  expectRule(css, '.settings-button', [
    /border\s*:\s*1px solid rgba\(71,\s*97,\s*129,/i,
    /background\s*:\s*linear-gradient/i,
  ]);

  expectRule(css, '.about-card', [
    /border\s*:\s*1px solid rgba\(245,\s*158,\s*11,/i,
    /background\s*:\s*linear-gradient/i,
  ]);
});

test('live app keeps approved lighthouse branding and reserves a clear scroll end above navigation', () => {
  const html = read('lighthouse-next/index.html');
  const css = read('lighthouse-next/owner-polish.css');

  assert.match(html, /class="header-app-icon"\s+src="\.\/assets\/lighthouse-icon\.svg"/i);
  assert.match(css, /#manual-hub\s+\.task-grid\s*\{[^}]*padding-bottom\s*:\s*32px/is);
  assert.match(css, /#page-manual\s*\{[^}]*padding-bottom\s*:\s*calc\(var\(--nav-height\)\s*\+\s*28px\)/is);
  assert.match(css, /\.app-page\s*\{[^}]*scroll-padding-bottom\s*:\s*calc\(var\(--nav-height\)\s*\+\s*24px\)/is);
});
