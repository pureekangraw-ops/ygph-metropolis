const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const shellPath = path.join(root, 'ui', 'lighthouse-shell.mjs');
const cssPath = path.join(root, 'lighthouse.css');
const themeShell = fs.readFileSync(path.join(root, 'ui', 'theme-shell.mjs'), 'utf8');

function readRequired(filePath, label) {
  assert.ok(fs.existsSync(filePath), `${label} must exist`);
  return fs.readFileSync(filePath, 'utf8');
}

test('LIGHT HOUSE is the visible app identity and owns the three-page shell', () => {
  const shell = readRequired(shellPath, 'LIGHT HOUSE shell module');
  assert.match(shell, /LIGHT HOUSE/);
  assert.match(shell, /CHAT/);
  assert.match(shell, /MANUAL/);
  assert.match(shell, /SETTINGS/);
  assert.match(shell, /data-lighthouse-page/);
  assert.match(shell, /manualHub/);
  assert.match(shell, /masterInputShell/);
  assert.match(themeShell, /lighthouse-shell\.mjs/);
});

test('LIGHT HOUSE visual layer uses a calm coastal palette and mobile bottom navigation', () => {
  const css = readRequired(cssPath, 'LIGHT HOUSE stylesheet');
  assert.match(css, /--lh-navy:\s*#0d2b45/i);
  assert.match(css, /--lh-ocean:\s*#1e5a8a/i);
  assert.match(css, /--lh-seafoam:\s*#1fa7a4/i);
  assert.match(css, /--lh-aqua:\s*#7ed6cf/i);
  assert.match(css, /\.lighthouse-bottom-nav/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.lighthouse-wave/);
});

test('Manual routes through existing UI surfaces instead of replacing domain truth', () => {
  const shell = readRequired(shellPath, 'LIGHT HOUSE shell module');
  assert.match(shell, /data-command-destination/);
  assert.match(shell, /finance/);
  assert.match(shell, /store/);
  assert.match(shell, /ride/);
  assert.doesNotMatch(shell, /greenfield\//);
  assert.doesNotMatch(shell, /runtime\.mjs/);
  assert.doesNotMatch(shell, /persistence\.mjs/);
});
