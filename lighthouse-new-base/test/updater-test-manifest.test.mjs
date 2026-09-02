import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateUpdateManifest } from '../src/updater-contract.mjs';

const manifest = JSON.parse(await readFile(new URL('../../update-test/manifest.json', import.meta.url), 'utf8'));
const mainSource = await readFile(new URL('../main.mjs', import.meta.url), 'utf8');

test('2.0.1 uses the controlled test manifest and does not expose a public release manifest', () => {
  const validated = validateUpdateManifest(manifest, { packageName:'com.yggdrasil.lighthouse' });
  assert.equal(validated.versionName, '2.0.1');
  assert.equal(validated.versionCode, 2001);
  assert.match(mainSource, /update-test\/manifest\.json/);
  assert.doesNotMatch(mainSource, /public[-_/ ]release[-_/ ]manifest/i);
});
