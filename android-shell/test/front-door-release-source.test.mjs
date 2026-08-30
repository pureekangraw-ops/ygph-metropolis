import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function load003Builder() {
  try {
    return await import('../tools/build-front-door-0.0.3-source.mjs');
  } catch (error) {
    assert.fail(`0.0.3 release source builder is required: ${error?.code ?? error?.message ?? error}`);
  }
}

async function load004Builder() {
  try {
    return await import('../tools/build-front-door-0.0.4-source.mjs');
  } catch (error) {
    assert.fail(`0.0.4 release source builder is required: ${error?.code ?? error?.message ?? error}`);
  }
}

test('released 0.0.3 logic remains byte-identical to the key-2 signed evidence', async () => {
  const patch = JSON.parse(await readFile(new URL('test/fixtures/front-door-0.0.3-key2.lhpatch', root), 'utf8'));
  const releasedLogic = await readFile(new URL('release/front-door-0.0.3/logic.mjs', root), 'utf8');
  assert.equal(releasedLogic, patch.files['logic.mjs'].content);
});

test('integrated 0.0.3 signing source reuses audited Front Door UI and released 0.0.3 logic', async () => {
  const { buildFrontDoor003Source } = await load003Builder();
  const source = await buildFrontDoor003Source();
  const fixture = JSON.parse(await readFile(new URL('test/fixtures/front-door-0.0.3-input.json', root), 'utf8'));
  const releasedLogic = await readFile(new URL('release/front-door-0.0.3/logic.mjs', root), 'utf8');

  assert.equal(source.baseVersion, '0.0.1');
  assert.equal(source.version, '0.0.3');
  assert.equal(source.files['ui.html'], fixture.files['ui.html']);
  assert.equal(source.files['ui.css'], fixture.files['ui.css']);
  assert.equal(source.files['logic.mjs'], releasedLogic);
});

test('0.0.4 signing source advances from 0.0.3 and changes only Front Door logic', async () => {
  const { buildFrontDoor004Source } = await load004Builder();
  const source = await buildFrontDoor004Source();
  const logic = await readFile(new URL('release/front-door-0.0.4/logic.mjs', root), 'utf8');

  assert.equal(source.baseVersion, '0.0.3');
  assert.equal(source.version, '0.0.4');
  assert.deepEqual(Object.keys(source.files), ['logic.mjs']);
  assert.equal(source.files['logic.mjs'], logic);
  assert.match(logic, /requestExecution\(\{ appVersion:version \}\)/u);
  assert.doesNotMatch(logic, /data\.brainConfirm|เปิดการยืนยัน/u);
});

test('APK workflow publishes the 0.0.4 signing source for manual key-2 signing', async () => {
  const workflow = await readFile(new URL('../.github/workflows/lighthouse-apk-debug.yml', root), 'utf8');
  assert.match(workflow, /build-front-door-0\.0\.4-source\.mjs/u);
  assert.match(workflow, /lighthouse-front-door-0\.0\.4-signing-source/u);
});
