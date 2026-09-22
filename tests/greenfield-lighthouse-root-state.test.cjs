const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const appPath = path.join(process.cwd(), 'lighthouse-next', 'app.mjs');

test('LIGHTHOUSE internal root state matches the four visible roots and has no ghost HOME root', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /DEFAULT_STATE\s*=\s*Object\.freeze\(\{\s*activeRoot:\s*['"]manual['"]/);
  assert.match(app, /const allowed\s*=\s*\[['"]chat['"],['"]manual['"],['"]go['"],['"]settings['"]\]/);
  assert.match(app, /state\.activeRoot\s*=\s*['"]manual['"]/);
  assert.doesNotMatch(app, /activeRoot:\s*['"]home['"]/);
  assert.doesNotMatch(app, /selectRoot\(['"]home['"]\)/);
  assert.doesNotMatch(app, /\[['"]home['"],['"]chat['"],['"]manual['"],['"]go['"],['"]settings['"]\]/);
});


test('Android bottom nav owns touch activation above page overlays', () => {
  assert.match(app, /bottomNav\?\.addEventListener\(['"]pointerup['"],\s*activateRootTarget\)/);
  assert.match(app, /bottomNav\?\.addEventListener\(['"]click['"],\s*activateRootTarget\)/);
  assert.match(app, /closest\(['"]\[data-root-target\]['"]\)/);
  assert.match(app, /root\.classList\.remove\(['"]keyboard-open['"]\)/);
});
