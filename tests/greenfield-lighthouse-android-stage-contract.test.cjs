const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
test('Android exposes only the PRISM staging command', () => {
  const pkg = JSON.parse(fs.readFileSync('android-shell/package.json'));
  assert.equal(pkg.scripts['app:stage-prism'], 'node ../scripts/stage-prism-native.mjs www');
  assert.equal(Object.keys(pkg.scripts).filter(k => k.startsWith('app:stage')).length, 1);
  assert.equal(fs.existsSync('android-shell/tools/stage-lighthouse-next.mjs'), false);
});
