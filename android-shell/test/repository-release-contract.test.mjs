import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../../',import.meta.url);
const workflowUrl=new URL('.github/workflows/lighthouse-apk-debug.yml',root);

async function workflow(){return readFile(workflowUrl,'utf8');}

test('APK publish contract uses immutable repository assets and never GitHub Release downloads',async()=>{
  const source=await workflow();
  assert.match(source,/permissions:\s*[\s\S]*contents:\s*write/);
  assert.match(source,/ASSET_DIR="release\/assets\/\$\{VERSION_NAME\}"/);
  assert.match(source,/APK_NAME="LIGHTHOUSE-\$\{VERSION_NAME\}-vc\$\{VERSION_CODE\}\.apk"/);
  assert.match(source,/APK_PATH="\$\{ASSET_DIR\}\/\$\{APK_NAME\}"/);
  assert.match(source,/SHA256SUMS\.txt/);
  assert.match(source,/RELEASE-NOTES\.md/);
  assert.match(source,/raw\.githubusercontent\.com/);
  assert.doesNotMatch(source,/releases\/download/);
});

test('APK publish contract verifies Raw bytes before opening lighthouse-update manifest',async()=>{
  const source=await workflow();
  const rawVerify=source.indexOf('Verify immutable Raw APK');
  const manifest=source.indexOf('Publish update manifest');
  assert.ok(rawVerify>=0,'Raw APK verification step is required');
  assert.ok(manifest>rawVerify,'manifest must publish only after Raw APK verification');
  assert.match(source,/sha256sum/);
  assert.match(source,/UPDATE_ASSET_EXISTS_WITH_DIFFERENT_SHA/);
  assert.match(source,/release\/lighthouse-update\.json/);
});
