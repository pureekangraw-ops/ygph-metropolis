import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');

test('SETTINGS version comes from installed Android identity instead of a duplicated UI literal', () => {
  assert.doesNotMatch(main, /const\s+APP_VERSION\s*=/);
  assert.doesNotMatch(main, /version\s*:\s*['"]2\.0\.2['"]/);
  assert.match(main, /updaterStatus\?\.installed\?\.versionName/);
});
