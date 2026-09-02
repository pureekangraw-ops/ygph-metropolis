import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../../',import.meta.url);
const workflowUrl=new URL('.github/workflows/lighthouse-apk-debug.yml',root);
const metadataToolUrl=new URL('../tools/build-update-metadata.mjs',import.meta.url);

async function workflow(){return readFile(workflowUrl,'utf8');}

test('APK publish contract uses immutable repository assets and never GitHub Release downloads',async()=>{
  const source=await workflow();
  assert.match(source,/permissions:\s*[\s\S]*contents:\s*write/);
  assert.match(source,/ASSET_DIR="release\/assets\/\$\{VERSION_NAME\}"/);
  assert.match(source,/APK_NAME="LIGHTHOUSE-\$\{VERSION_NAME\}-vc\$\{VERSION_CODE\}\.apk"/);
  assert.match(source,/APK_PATH="\$\{ASSET_DIR\}\/\$\{APK_NAME\}"/);
  assert.match(source,/SHA256SUMS\.txt/);
  assert.match(source,/RELEASE-NOTES\.md/);
  assert.match(source,/CHECKPOINT\.md/);
  assert.match(source,/raw\.githubusercontent\.com/);
  assert.doesNotMatch(source,/releases\/download/);
});

test('candidate workflow verifies Raw bytes and leaves update manifest locked for device acceptance',async()=>{
  const source=await workflow();
  const rawVerify=source.indexOf('Verify immutable Raw APK');
  const activationLock=source.indexOf('Confirm activation remains locked');
  assert.ok(rawVerify>=0,'Raw APK verification step is required');
  assert.ok(activationLock>rawVerify,'activation lock must be checked after Raw APK verification');
  assert.match(source,/sha256sum/);
  assert.match(source,/UPDATE_ASSET_EXISTS_WITH_DIFFERENT_SHA/);
  assert.match(source,/activation: `LOCKED — device acceptance required`/);
  assert.match(source,/lighthouse-update\.json is intentionally unchanged/);
  assert.doesNotMatch(source,/Publish update manifest/);
  assert.doesNotMatch(source,/git add[^\n]*release\/lighthouse-update\.json/);
});

test('manifest metadata CLI requires explicit activation authority',async()=>{
  const source=await readFile(metadataToolUrl,'utf8');
  assert.match(source,/LIGHTHOUSE_ALLOW_MANIFEST_ACTIVATION/);
  assert.match(source,/UPDATE_MANIFEST_ACTIVATION_LOCKED/);
  assert.match(source,/buildUpdateMetadata/);
});
