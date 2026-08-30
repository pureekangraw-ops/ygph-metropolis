import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function loadBuilder() {
  try {
    return await import('../tools/build-front-door-0.0.3-source.mjs');
  } catch (error) {
    assert.fail(`0.0.3 release source builder is required: ${error?.code ?? error?.message ?? error}`);
  }
}

test('integrated 0.0.3 signing source reuses audited Front Door UI and trusted-brain integration logic', async () => {
  const { buildFrontDoor003Source } = await loadBuilder();
  const source = await buildFrontDoor003Source();
  const fixture = JSON.parse(await readFile(new URL('test/fixtures/front-door-0.0.3-input.json', root), 'utf8'));
  const integrationLogic = await readFile(new URL('release/front-door-0.0.3/logic.mjs', root), 'utf8');

  assert.equal(source.baseVersion, '0.0.1');
  assert.equal(source.version, '0.0.3');
  assert.equal(source.files['ui.html'], fixture.files['ui.html']);
  assert.equal(source.files['ui.css'], fixture.files['ui.css']);
  assert.equal(source.files['logic.mjs'], integrationLogic);
  assert.match(source.files['logic.mjs'], /requestExecution\(/u);
  assert.doesNotMatch(source.files['logic.mjs'], /export function disconnectedReply/u);
});
