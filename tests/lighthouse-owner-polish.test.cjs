const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const htmlPath = path.join(root, 'lighthouse-next/index.html');
const polishPath = path.join(root, 'lighthouse-next/owner-polish.css');

test('owner-locked app icon is deliberately sized and polished on the PIN surface', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /owner-polish\.css/);
  assert.equal(fs.existsSync(polishPath), true, 'missing lighthouse-next/owner-polish.css');
  const css = fs.readFileSync(polishPath, 'utf8');
  assert.match(css, /\.pin-app-icon\s*\{/);
  assert.match(css, /aspect-ratio\s*:\s*1/);
  assert.match(css, /object-fit\s*:\s*cover/);
});

test('dynamic transaction history controls remain touch-friendly', () => {
  assert.equal(fs.existsSync(polishPath), true, 'missing lighthouse-next/owner-polish.css');
  const css = fs.readFileSync(polishPath, 'utf8');
  assert.match(css, /\.history-cancel\s*\{/);
  assert.match(css, /min-height\s*:\s*44px/);
});
