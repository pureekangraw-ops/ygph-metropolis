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

test('PR safety gate verifies nested LIGHTHOUSE bytes including the runtime gate', () => {
  for (const file of [
    'index.html',
    'app.mjs',
    'runtime-gate.mjs',
    'styles.css',
    'owner-polish.css',
    'assets/lighthouse-icon.svg',
  ]) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(workflow, new RegExp(escaped));
  }
  assert.match(workflow, /join\(['"]android-shell['"],\s*['"]www['"],\s*['"]lighthouse-next['"],\s*file\)/);
  assert.match(workflow, /createHash\(['"]sha256['"]\)/);
  assert.match(workflow, /LIGHTHOUSE_STAGE_HASH_MISMATCH/);
});

test('canonical LIGHTHOUSE bundle is staged before Wrangler validation and PR staging deploy', () => {
  const command = 'node scripts/stage-lighthouse-next-bundle.mjs .lighthouse-production';
  const occurrences = workflow.split(command).length - 1;
  assert.ok(occurrences >= 2, 'canonical bundle builder must run in safety and staging jobs');

  const stage = workflow.indexOf('Stage canonical LIGHTHOUSE production bundle');
  const reject = workflow.indexOf('Reject legacy production shell');
  const validate = workflow.indexOf('Validate Wrangler production config');
  assert.ok(stage >= 0 && reject > stage && validate > reject);
  assert.match(workflow, /\.lighthouse-production/);
  assert.doesNotMatch(workflow, /Deploy isolated LIGHTHOUSE next demo staging/);
});
