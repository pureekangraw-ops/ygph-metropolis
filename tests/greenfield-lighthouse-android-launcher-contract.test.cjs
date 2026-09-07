const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const packagePath = path.join(ROOT, 'android-shell', 'package.json');
const toolPath = path.join(ROOT, 'android-shell', 'tools', 'materialize-android-icons.mjs');

test('Android launcher command invokes the real icon materializer', () => {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.equal(pkg.scripts['android:icon'], 'node tools/materialize-android-icons.mjs');
  assert.equal(fs.existsSync(toolPath), true, 'launcher materializer must exist');
});

test('native launcher resources are derived only from the approved LIGHTHOUSE artwork', () => {
  const source = fs.readFileSync(toolPath, 'utf8');
  assert.match(source, /APPROVED_ICON_SOURCE\s*=\s*'lighthouse-next\/assets\/lighthouse-icon\.svg'/);
  assert.match(source, /APPROVED_MASKABLE_ICON_SOURCE\s*=\s*'lighthouse-next\/assets\/lighthouse-icon-maskable\.svg'/);
  assert.match(source, /LAUNCHER_BACKGROUND\s*=\s*'#0B0E14'/);
  assert.match(source, /mipmap-anydpi-v26/);
  assert.match(source, /ic_launcher_foreground/);
  assert.match(source, /ic_launcher_round/);
});
