const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('Control Port mutation layer cannot bypass Owner Runtime into persistence or raw domain storage', () => {
  const root = process.cwd();
  const core = fs.readFileSync(path.join(root, 'lighthouse-next', 'control-port', 'control-port.mjs'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'lighthouse-next', 'control-port', 'control-port-runtime.mjs'), 'utf8');

  assert.match(core, /runtime-ledger\.mjs/);
  assert.match(core, /runtime-store\.mjs/);
  assert.match(core, /runtime-session\.mjs/);

  for (const source of [core, runtime]) {
    assert.doesNotMatch(source, /greenfield\/persistence\.mjs/);
    assert.doesNotMatch(source, /greenfield\/browser-store\.mjs/);
    assert.doesNotMatch(source, /commitEncryptedState/);
    assert.doesNotMatch(source, /readEncryptedState/);
    assert.doesNotMatch(source, /indexedDB/i);
  }

  assert.doesNotMatch(core, /\.domains\.(LEDGER|STORE|CALENDAR|RIDE)\s*=/);
  assert.doesNotMatch(core, /domains\[['"](LEDGER|STORE|CALENDAR|RIDE)['"]\]\s*=/);
});
