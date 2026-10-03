const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflowPath = '.github/workflows/prism-owner-build.yml';

function readWorkflow() {
  return fs.readFileSync(workflowPath, 'utf8');
}

test('PRISM Owner Build is one-click and locks the event commit', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /workflow_dispatch:\s*\n/);
  assert.doesNotMatch(workflow, /\binputs:\s*\n/);
  assert.doesNotMatch(workflow, /inputs\.target_ref/);
  assert.doesNotMatch(workflow, /feat\/lighthouse-1\.0\.0-rebuild/);
  assert.doesNotMatch(workflow, /app:stage-existing/);

  assert.match(workflow, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
  assert.match(workflow, /APK_SOURCE_REF:.*github\.head_ref/);
  assert.match(workflow, /app:stage-prism/);
  assert.match(workflow, /name:\s*prism-\$\{\{ steps\.release\.outputs\.version_name \}\}/);
  assert.match(workflow, /id: release/);
  assert.match(workflow, /m\.versionCode!==v\.versionCode/);
  assert.match(workflow, /m\.versionName!==v\.versionName/);
});
