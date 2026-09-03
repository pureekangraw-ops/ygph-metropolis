import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/lighthouse-owner-build.yml', import.meta.url), 'utf8');

test('owner build publishes only the verified APK to the 2.0.2 test prerelease channel', () => {
  assert.match(workflow, /permissions:\s*\n\s*contents: write/);
  const verifyIndex = workflow.indexOf('- name: Verify final APK identity');
  const publishIndex = workflow.indexOf('- name: Publish 2.0.2 test-channel APK');
  assert.ok(verifyIndex >= 0, 'final APK identity verification must exist');
  assert.ok(publishIndex > verifyIndex, 'publication must happen only after final APK identity verification');
  assert.match(workflow, /lighthouse-2\.0\.2-test/);
  assert.match(workflow, /LIGHTHOUSE-2\.0\.2\.apk/);
  assert.match(workflow, /--prerelease/);
  assert.doesNotMatch(workflow, /gh release create lighthouse-2\.0\.2\s/);
});
