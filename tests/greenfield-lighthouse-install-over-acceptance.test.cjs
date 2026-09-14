const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const acceptancePath = path.join(ROOT, 'docs/acceptance/lighthouse-install-over-vc1008.json');

test('vc1008 physical install-over evidence is bound to the verified owner-test artifact and preserves truthful device-gate state', () => {
  const record = JSON.parse(fs.readFileSync(acceptancePath, 'utf8'));
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.applicationId, 'com.yggdrasil.lighthouse');
  assert.equal(record.baselineVersionCode, 1007);
  assert.equal(record.candidateVersionCode, 1008);
  assert.equal(record.candidateVersionName, '1.0.0-owner.3');
  assert.equal(record.workflowRunId, '34763014824');
  assert.equal(record.sourceCommit, 'd59718bf1fffbf59ae492c6954b545d7358d0ee0');
  assert.equal(record.apkSha256, '81b7ad2cb18daf0a2862402f99cf127bdf4b98fbcfba4e4289da0fb5ff6cd925');
  assert.equal(record.status, 'VERIFY');
  assert.deepEqual(Object.keys(record.checks).sort(), [
    'androidAcceptedInstallOver',
    'appLaunches',
    'chatManualSettingsSurface',
    'launcherIdentity',
    'localStateSurvives',
    'pinWorks',
  ].sort());
  assert.equal(record.checks.androidAcceptedInstallOver, 'PASS');
  assert.equal(record.checks.appLaunches, 'PASS');
  assert.equal(record.checks.chatManualSettingsSurface, 'PASS');
  assert.equal(record.checks.pinWorks, 'PASS');
  assert.equal(record.checks.launcherIdentity, 'PASS');
  assert.equal(record.checks.localStateSurvives, 'VERIFY');
});
