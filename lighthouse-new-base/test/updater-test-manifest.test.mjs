import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateUpdateManifest } from '../src/updater-contract.mjs';

const manifest = JSON.parse(await readFile(new URL('../../update-test/manifest.json', import.meta.url), 'utf8'));
const mainSource = await readFile(new URL('../main.mjs', import.meta.url), 'utf8');

test('controlled test manifest delivers the exact current 2.0.2 owner-test candidate', () => {
  const validated = validateUpdateManifest(manifest, { packageName:'com.yggdrasil.lighthouse' });
  assert.equal(validated.versionName, '2.0.2');
  assert.equal(validated.versionCode, 2002);
  assert.equal(validated.apkUrl, 'https://github.com/pureekangraw-ops/ygph-metropolis/releases/download/lighthouse-2.0.2-test/LIGHTHOUSE-2.0.2.apk');
  assert.equal(validated.sha256, 'e5526a8ac6c5be73bf869ab68e9a82635ab3d8772a7c73d38a3e08db82e63a6d');
  assert.equal(validated.sizeBytes, 3356027);
  assert.match(mainSource, /update-test\/manifest\.json/);
  assert.doesNotMatch(mainSource, /public[-_/ ]release[-_/ ]manifest/i);
});
