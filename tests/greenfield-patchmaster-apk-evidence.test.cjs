const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const verifierPath = path.join(ROOT, 'android-shell', 'tools', 'verify-apk-identity.mjs');
const workflowPath = path.join(ROOT, '.github', 'workflows', 'lighthouse-owner-build.yml');

test('APK provenance contract binds a release channel', async () => {
  const source = fs.readFileSync(verifierPath, 'utf8');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(source, /releaseChannel\s*=\s*process\.env\.APK_RELEASE_CHANNEL/);
  assert.match(source, /channel:\s*releaseChannel/);
  assert.match(source, /sourceRepository[^\]]*sourceRef[^\]]*sourceCommit[^\]]*workflowRunId[^\]]*builtAt[^\]]*releaseChannel/s);
  assert.match(workflow, /APK_RELEASE_CHANNEL:\s*owner-test/);
});
