const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const workflow = fs.readFileSync('.github/workflows/prism-owner-build.yml', 'utf8');
test('single PRISM gate checks shell contracts before staging and rejects legacy payload parents', () => {
  const install = workflow.indexOf('Install Android shell dependencies');
  const tests = workflow.indexOf('Run Android shell contracts');
  const stage = workflow.indexOf('Stage owner-approved PRISM');
  const proof = workflow.indexOf('Prove PRISM payload');
  assert.ok(install >= 0 && install < tests && tests < stage && stage < proof);
  assert.match(workflow.slice(tests, stage), /node --test test\/\*\.test\.mjs/);
  assert.match(workflow, /test ! -e www\/lighthouse-next/);
  assert.match(workflow, /test ! -e www\/lighthouse/);
  assert.match(workflow, /PRISM_NATIVE_V1/);
  assert.match(workflow, /m\.sourceCommit!==process\.env\.EXPECTED_SOURCE_COMMIT/);
});
