const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflowPath = '.github/workflows/lighthouse-owner-build.yml';

function readWorkflow() {
  return fs.readFileSync(workflowPath, 'utf8');
}

test('LIGHTHOUSE Owner Build is one-click and hard-locks the approved release branch', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /workflow_dispatch:\s*\n/);
  assert.doesNotMatch(workflow, /\binputs:\s*\n/);
  assert.doesNotMatch(workflow, /inputs\.target_ref/);
  assert.doesNotMatch(workflow, /feat\/lighthouse-1\.0\.0-rebuild/);
  assert.doesNotMatch(workflow, /app:stage-existing/);

  assert.match(workflow, /ref:\s*work\/metro-new-20260906/);
  assert.match(workflow, /APK_SOURCE_REF:\s*work\/metro-new-20260906/);
  assert.match(workflow, /app:stage-next/);
  assert.match(workflow, /name:\s*lighthouse-1\.0\.0-owner-test/);
});
