const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();

function read(relative) {
  const file = path.join(root, relative);
  assert.equal(fs.existsSync(file), true, `missing ${relative}`);
  return fs.readFileSync(file, 'utf8');
}

test('installed LIGHTHOUSE keeps the approved artwork and adds a dedicated mask-safe launcher icon', () => {
  const manifest = JSON.parse(read('lighthouse-next/manifest.webmanifest'));
  const maskable = manifest.icons.find((icon) => String(icon.purpose || '').split(/\s+/).includes('maskable'));

  assert.ok(maskable, 'manifest should declare a maskable launcher icon');
  assert.equal(maskable.src, './assets/lighthouse-icon-maskable.svg');
  assert.equal(maskable.type, 'image/svg+xml');
  assert.equal(maskable.sizes, 'any');

  const svg = read('lighthouse-next/assets/lighthouse-icon-maskable.svg');
  assert.match(svg, /viewBox="0 0 256 256"/i);
  assert.match(svg, /fill="#0B0E14"/i, 'maskable canvas should use the approved cosmic background');
  assert.match(svg, /href="\.\/lighthouse-icon\.svg"/i, 'maskable icon should reuse the owner-approved artwork instead of replacing it');
  assert.match(svg, /x="26"\s+y="26"\s+width="204"\s+height="204"/i, 'approved artwork should stay inside the launcher safe area');
});

test('live LIGHTHOUSE navigation and MANUAL use one coherent outline icon grammar', () => {
  const html = read('lighthouse-next/index.html');
  const polish = read('lighthouse-next/owner-polish.css');

  for (const name of ['chat', 'manual', 'settings', 'income', 'outcome', 'calendar', 'ledger']) {
    assert.match(html, new RegExp(`data-icon="${name}"`), `missing ${name} icon`);
  }

  for (const stale of ['home', 'finance', 'store', 'ride']) {
    assert.doesNotMatch(html, new RegExp(`data-icon="${stale}"`), `${stale} must not remain as a live surface icon`);
  }

  assert.doesNotMatch(html, /<span class="task-icon"[^>]*>[＋−◷≡]<\/span>/, 'MANUAL should not mix text glyphs as icons');
  assert.doesNotMatch(html, /data-root-target="(?:chat|manual|settings)"[^>]*><span[^>]*>[◌▦≡]<\/span>/, 'root navigation should not mix platform glyphs');
  assert.match(polish, /\.ui-icon\s*\{[^}]*width\s*:\s*22px[^}]*height\s*:\s*22px/is);
  assert.match(polish, /\.ui-icon[^}]*fill\s*:\s*none[^}]*stroke\s*:\s*currentColor/is);
});
