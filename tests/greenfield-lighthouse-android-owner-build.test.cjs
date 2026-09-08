const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const workflow = fs.readFileSync('.github/workflows/lighthouse-owner-build.yml', 'utf8');

test('Owner Build packages lighthouse-next and cannot publish production', () => {
  assert.match(workflow, /ref:\s*work\/metro-new-20260906/);
  assert.doesNotMatch(workflow, /\binputs:\s*\n|inputs\.target_ref/);
  assert.match(workflow, /node --test test\/\*\.test\.mjs/);
  assert.match(workflow, /npm run app:stage-next/);
  assert.match(workflow, /npm run android:icons/);
  assert.match(workflow, /set-android-version\.mjs/);
  assert.match(workflow, /android:security:apply/);
  assert.match(workflow, /android:security:verify/);
  assert.match(workflow, /apksigner/);
  assert.match(workflow, /verify-apk-identity\.mjs/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /app:stage-existing|test\/workunit|npm run pretest/);
  assert.doesNotMatch(workflow, /google[-_ ]?play|play[-_ ]?console|create[-_ ]?release|gh\s+release|npm\s+run\s+deploy/i);
});

test('Owner Build signs only after security verification and uploads only after final identity proof', () => {
  for (const name of [
    'LIGHTHOUSE_APK_KEYSTORE_BASE64',
    'LIGHTHOUSE_APK_STORE_PASSWORD',
    'LIGHTHOUSE_APK_KEY_ALIAS',
    'LIGHTHOUSE_APK_KEY_PASSWORD',
  ]) {
    assert.match(workflow, new RegExp(name));
  }

  const stage = workflow.indexOf('Stage owner-approved LIGHTHOUSE next');
  const addAndroid = workflow.indexOf('Generate Android project');
  const syncAndroid = workflow.indexOf('Sync exact staged web assets');
  const version = workflow.indexOf('Apply canonical Android version');
  const icons = workflow.indexOf('Materialize approved Android launcher icons');
  const securityApply = workflow.indexOf('Apply generated Android security baseline');
  const securityVerify = workflow.indexOf('Verify generated Android security');
  const build = workflow.indexOf('Build unsigned release APK');
  const sign = workflow.indexOf('Materialize canonical APK signer');
  const identity = workflow.indexOf('Verify final APK identity and build provenance');
  const upload = workflow.indexOf('Upload owner-test APK');

  for (const [label, index] of Object.entries({ stage, addAndroid, syncAndroid, version, icons, securityApply, securityVerify, build, sign, identity, upload })) {
    assert.ok(index >= 0, `missing workflow stage: ${label}`);
  }
  assert.ok(stage < addAndroid && addAndroid < syncAndroid && syncAndroid < version && version < icons);
  assert.ok(icons < securityApply && securityApply < securityVerify && securityVerify < build);
  assert.ok(build < sign && sign < identity && identity < upload);
  assert.match(workflow, /APK_SOURCE_COMMIT="\$\(git rev-parse HEAD\)"/);
});
