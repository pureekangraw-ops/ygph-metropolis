const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('live LIGHTHOUSE header reuses the owner-approved app artwork as the in-app brand mark', () => {
  const html = read('lighthouse-next/index.html');

  assert.match(
    html,
    /<img\s+class="header-app-icon"\s+src="\.\/assets\/lighthouse-icon\.svg"\s+alt=""\s*>/i,
    'the live app header should reuse the approved LIGHTHOUSE artwork instead of a generic glyph',
  );
  assert.doesNotMatch(html, /class="mini-beacon"[^>]*>✦<\/span>/i);
});

test('MANUAL adopts the approved restrained cosmic card and icon-ring direction', () => {
  const polish = read('lighthouse-next/owner-polish.css');

  assert.match(polish, /#manual-hub\s+\.page-title-block::after\s*\{[^}]*background\s*:\s*linear-gradient/is);
  assert.match(polish, /\.task-card\s*\{[^}]*border-radius\s*:\s*22px[^}]*background\s*:\s*linear-gradient/is);
  assert.match(polish, /\.task-icon\s*\{[^}]*border\s*:\s*1px solid transparent[^}]*conic-gradient/is);
  assert.match(polish, /\.task-icon\s+\.ui-icon\s*\{[^}]*filter\s*:\s*drop-shadow/is);
});

test('bottom navigation has a contained active pill and MANUAL content clears the fixed nav', () => {
  const polish = read('lighthouse-next/owner-polish.css');

  assert.match(polish, /\.bottom-nav\s*\{[^}]*border-radius\s*:\s*28px 28px 0 0/is);
  assert.match(polish, /\.nav-item\.active\s*\{[^}]*border\s*:\s*1px solid[^}]*box-shadow/is);
  assert.match(polish, /#manual-hub\s+\.task-grid\s*\{[^}]*padding-bottom\s*:\s*32px/is);
});
