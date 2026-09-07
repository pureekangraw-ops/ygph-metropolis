const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const workflow = fs.readFileSync('.github/workflows/greenfield-deploy-gate.yml', 'utf8');

test('PR safety gate executes the Android shell suite before staging deploy', () => {
  const install = workflow.indexOf('Install Android shell dependencies');
  const tests = workflow.indexOf('Run Android shell tests');
  const stage = workflow.indexOf('Stage LIGHTHOUSE Android payload');
  const hashes = workflow.indexOf('Verify staged LIGHTHOUSE byte identity');

  for (const [label, index] of Object.entries({ install, tests, stage, hashes })) {
    assert.ok(index >= 0, `missing Android PR gate stage: ${label}`);
  }
  assert.ok(install < tests && tests < stage && stage < hashes);
  assert.match(workflow.slice(install, hashes), /working-directory:\s*android-shell/);
  assert.match(workflow.slice(install, hashes), /npm install --no-audit --no-fund/);
  assert.match(workflow.slice(tests, hashes), /npm test/);
  assert.match(workflow.slice(stage, hashes), /npm run app:stage-next/);
});

test('PR safety gate verifies representative staged bytes against lighthouse-next', () => {
  for (const file of [
    'index.html',
    'app.mjs',
    'styles.css',
    'owner-polish.css',
    'assets/lighthouse-icon.svg',
  ]) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(workflow, new RegExp(escaped));
  }
  assert.match(workflow, /createHash\(['"]sha256['"]\)/);
  assert.match(workflow, /LIGHTHOUSE_STAGE_HASH_MISMATCH/);
});
