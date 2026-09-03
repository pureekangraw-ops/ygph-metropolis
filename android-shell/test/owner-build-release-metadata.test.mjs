import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../.github/workflows/lighthouse-owner-build.yml', import.meta.url), 'utf8');
const version = JSON.parse(await readFile(new URL('../version.json', import.meta.url), 'utf8'));

test('owner-build artifact name matches the canonical Android version', () => {
  const expected = `name: lighthouse-${version.versionName}-owner-test`;
  assert.match(workflow, new RegExp(expected.replaceAll('.', '\\.')));
  assert.doesNotMatch(workflow, /name:\s*lighthouse-2\.0\.1-owner-test/);
});
