import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
async function load003Builder(){ return import('../tools/build-front-door-0.0.3-source.mjs'); }
async function load004Builder(){ return import('../tools/build-front-door-0.0.4-source.mjs'); }
async function load004BootstrapBuilder(){ return import('../tools/build-front-door-0.0.4-bootstrap-source.mjs'); }
async function load005Builder(){ return import('../tools/build-front-door-0.0.5-source.mjs'); }
async function load005BootstrapBuilder(){ return import('../tools/build-front-door-0.0.5-bootstrap-source.mjs'); }

test('released 0.0.3 logic remains byte-identical to key-2 signed evidence', async () => {
  const patch = JSON.parse(await readFile(new URL('test/fixtures/front-door-0.0.3-key2.lhpatch', root), 'utf8'));
  const releasedLogic = await readFile(new URL('release/front-door-0.0.3/logic.mjs', root), 'utf8'); assert.equal(releasedLogic, patch.files['logic.mjs'].content);
});
test('integrated 0.0.3 signing source remains historical', async () => {
  const { buildFrontDoor003Source } = await load003Builder(); const source = await buildFrontDoor003Source();
  assert.equal(source.baseVersion,'0.0.1'); assert.equal(source.version,'0.0.3');
});
test('0.0.4 release remains unchanged historical confirmation implementation', async () => {
  const { buildFrontDoor004Source } = await load004Builder(); const source = await buildFrontDoor004Source();
  const logic = await readFile(new URL('release/front-door-0.0.4/logic.mjs', root), 'utf8');
  assert.equal(source.baseVersion,'0.0.3'); assert.equal(source.version,'0.0.4'); assert.deepEqual(Object.keys(source.files), ['logic.mjs']); assert.equal(source.files['logic.mjs'],logic); assert.match(logic,/requestExecution/);
  const { buildFrontDoor004BootstrapSource } = await load004BootstrapBuilder(); assert.equal((await buildFrontDoor004BootstrapSource()).version,'0.0.4');
});
test('0.0.5 incremental source changes UI and logic from 0.0.4 without moving trust anchors', async () => {
  const { buildFrontDoor005Source } = await load005Builder(); const source = await buildFrontDoor005Source();
  assert.equal(source.baseVersion,'0.0.4'); assert.equal(source.version,'0.0.5'); assert.deepEqual(Object.keys(source.files).sort(), ['logic.mjs','ui.html']);
  assert.match(source.files['ui.html'], /data-patch-update[^>]*>Patch</u);
  assert.match(source.files['ui.html'], /เลือกไฟล์ Patch \(Advanced\)/u);
  assert.match(source.files['logic.mjs'], /CONFIRMATION_REQUIRED/u); assert.doesNotMatch(source.files['logic.mjs'], /requestExecution/u);
  assert.doesNotMatch(source.files['logic.mjs'], /trusted-key\.json|TRUSTED_PATCH_MANIFEST_URL|verifyPatchBundle/u);
});
test('0.0.5 bootstrap source can take a clean 0.0.1 key-3 APK directly to current Front Door', async () => {
  const { buildFrontDoor005BootstrapSource } = await load005BootstrapBuilder(); const source = await buildFrontDoor005BootstrapSource();
  assert.equal(source.baseVersion,'0.0.1'); assert.equal(source.version,'0.0.5');
  assert.deepEqual(Object.keys(source.files).sort(), ['logic.mjs','rules.json','ui.css','ui.html','vocabulary.json']);
  assert.match(source.files['ui.html'], /data-patch-update/u); assert.match(source.files['logic.mjs'], /brain\.send\(message/u);
});
test('standard APK workflow builds signs verifies and uploads the current key-3 Patch plus manifest', async () => {
  const workflow = await readFile(new URL('../.github/workflows/lighthouse-apk-debug.yml', root), 'utf8');
  const contract = JSON.parse(await readFile(new URL('release/current-patch.json', root), 'utf8'));
  assert.equal(contract.version, '0.0.5');
  assert.match(workflow, /build-current-patch-source\.mjs/u);
  assert.doesNotMatch(workflow, /build-front-door-0\.0\.5-source\.mjs|build-front-door-0\.0\.5-bootstrap-source\.mjs/u);
  assert.match(workflow, /secrets\.LIGHTHOUSE_PATCH_PRIVATE_KEY_PEM/u); assert.match(workflow, /secrets\.LIGHTHOUSE_PATCH_KEY_PASSPHRASE/u);
  assert.match(workflow, /openssl pkey/u); assert.match(workflow, /patch:sign/u); assert.match(workflow, /verifyPatchBundle/u);
  assert.match(workflow, /lighthouse-current-patch\.lhpatch/u); assert.match(workflow, /lighthouse-current-patch-bootstrap\.lhpatch/u);
  assert.match(workflow, /lighthouse-patch-manifest\.json/u); assert.match(workflow, /name: lighthouse-current-patch/u);
});
