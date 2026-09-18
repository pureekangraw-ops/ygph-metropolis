const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function loadModule() {
  return import(pathToFileURL(path.resolve(__dirname, '../lighthouse-next/update/android-install-acceptance.mjs')).href);
}

const expected = Object.freeze({
  applicationId: 'com.yggdrasil.lighthouse',
  signerCertificateSha256: 'aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce',
  baselineVersionCode: 1007,
  targetVersionCode: 1008,
  targetVersionName: '1.0.0-owner.3',
});

const staticEvidence = Object.freeze({
  applicationId: expected.applicationId,
  signerCertificateSha256: expected.signerCertificateSha256,
  versionCode: expected.targetVersionCode,
  versionName: expected.targetVersionName,
  apkSha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
});

function deviceEvidence(overrides = {}) {
  return {
    installMode: 'INSTALL_OVER',
    installedApplicationId: expected.applicationId,
    installedSignerCertificateSha256: expected.signerCertificateSha256,
    installedApkSha256: staticEvidence.apkSha256,
    beforeVersionCode: expected.baselineVersionCode,
    afterVersionCode: expected.targetVersionCode,
    afterVersionName: expected.targetVersionName,
    launchedAfterInstall: true,
    launchEvidence: {
      source:'ADB_AM_START_WAIT',
      capturedAt:'2026-09-18T01:20:00.000Z',
      applicationId:expected.applicationId,
      component:`${expected.applicationId}/.MainActivity`,
      launched:true,
      processId:'4242',
    },
    readbackVersionCode: expected.targetVersionCode,
    persistenceProbe: {
      key:'GREENFIELD_DATABASE_VAULT_SHA256',
      before:'sha256:' + 'a'.repeat(64),
      after:'sha256:' + 'a'.repeat(64),
    },
    ...overrides,
  };
}

test('static APK proof alone remains VERIFY until physical install-over readback exists', async () => {
  const { evaluateAndroidInstallAcceptance } = await loadModule();
  const result = evaluateAndroidInstallAcceptance({ expected, staticEvidence });
  assert.equal(result.status, 'VERIFY');
  assert.equal(result.reasons.includes('DEVICE_EVIDENCE_REQUIRED'), true);
  assert.equal(Object.isFrozen(result), true);
});

test('complete matching device evidence passes install-over acceptance', async () => {
  const { evaluateAndroidInstallAcceptance, assertAndroidInstallAccepted } = await loadModule();
  const result = evaluateAndroidInstallAcceptance({ expected, staticEvidence, deviceEvidence: deviceEvidence() });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.reasons, []);
  assert.doesNotThrow(() => assertAndroidInstallAccepted(result));
});

test('identity, installed APK, downgrade, readback and persistence contradictions fail closed', async () => {
  const { evaluateAndroidInstallAcceptance } = await loadModule();

  const wrongSigner = evaluateAndroidInstallAcceptance({
    expected,
    staticEvidence,
    deviceEvidence: deviceEvidence({ installedSignerCertificateSha256: 'b'.repeat(64) }),
  });
  assert.equal(wrongSigner.status, 'FAIL');
  assert.equal(wrongSigner.reasons.includes('DEVICE_SIGNER_MISMATCH'), true);

  const wrongApk = evaluateAndroidInstallAcceptance({
    expected,
    staticEvidence,
    deviceEvidence: deviceEvidence({ installedApkSha256: 'f'.repeat(64) }),
  });
  assert.equal(wrongApk.status, 'FAIL');
  assert.equal(wrongApk.reasons.includes('DEVICE_APK_SHA256_MISMATCH'), true);

  const wrongReadback = evaluateAndroidInstallAcceptance({
    expected,
    staticEvidence,
    deviceEvidence: deviceEvidence({ readbackVersionCode: 1007 }),
  });
  assert.equal(wrongReadback.status, 'FAIL');
  assert.equal(wrongReadback.reasons.includes('DEVICE_VERSION_READBACK_MISMATCH'), true);

  const lostData = evaluateAndroidInstallAcceptance({
    expected,
    staticEvidence,
    deviceEvidence: deviceEvidence({
      persistenceProbe: {
        key:'GREENFIELD_DATABASE_VAULT_SHA256',
        before:'sha256:' + 'a'.repeat(64),
        after:'sha256:' + 'b'.repeat(64),
      },
    }),
  });
  assert.equal(lostData.status, 'FAIL');
  assert.equal(lostData.reasons.includes('PERSISTENCE_READBACK_MISMATCH'), true);
});

test('missing device fields stay VERIFY rather than being promoted to PASS', async () => {
  const { evaluateAndroidInstallAcceptance, assertAndroidInstallAccepted } = await loadModule();
  const result = evaluateAndroidInstallAcceptance({
    expected,
    staticEvidence,
    deviceEvidence: { installMode: 'INSTALL_OVER' },
  });
  assert.equal(result.status, 'VERIFY');
  assert.equal(result.reasons.includes('DEVICE_EVIDENCE_INCOMPLETE'), true);
  assert.throws(() => assertAndroidInstallAccepted(result), /ANDROID_INSTALL_NOT_ACCEPTED:VERIFY/);
});


test('Android shell exposes one command lane for physical install-over evidence', () => {
  const fs = require('node:fs');
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../android-shell/package.json'), 'utf8'));
  assert.equal(pkg.scripts['acceptance:capture-installed'], 'node tools/capture-installed-apk-evidence.mjs');
  assert.equal(pkg.scripts['acceptance:capture-launch'], 'node tools/capture-app-launch-evidence.mjs');
  assert.equal(pkg.scripts['acceptance:persistence-probe'], 'node tools/create-install-over-persistence-probe.mjs');
  assert.equal(pkg.scripts['acceptance:assemble'], 'node tools/create-install-over-device-evidence.mjs');
  assert.equal(pkg.scripts['acceptance:evaluate'], 'node tools/evaluate-install-over-acceptance.mjs');
});


test('hand-authored launch booleans cannot pass without valid ADB launch evidence', async () => {
  const { evaluateAndroidInstallAcceptance } = await loadModule();

  const missingReceipt = deviceEvidence({ launchEvidence:null });
  const missing = evaluateAndroidInstallAcceptance({ expected, staticEvidence, deviceEvidence:missingReceipt });
  assert.equal(missing.status, 'VERIFY');
  assert.equal(missing.reasons.includes('DEVICE_EVIDENCE_INCOMPLETE'), true);

  const forgedReceipt = deviceEvidence({
    launchEvidence: {
      source:'MANUAL_BOOLEAN',
      capturedAt:'2026-09-18T01:20:00.000Z',
      applicationId:expected.applicationId,
      component:`${expected.applicationId}/.MainActivity`,
      launched:true,
      processId:'4242',
    },
  });
  const forged = evaluateAndroidInstallAcceptance({ expected, staticEvidence, deviceEvidence:forgedReceipt });
  assert.equal(forged.status, 'FAIL');
  assert.equal(forged.reasons.includes('DEVICE_LAUNCH_EVIDENCE_INVALID'), true);
});

test('installed version name must match the Android target', async () => {
  const { evaluateAndroidInstallAcceptance } = await loadModule();
  const result = evaluateAndroidInstallAcceptance({
    expected,
    staticEvidence,
    deviceEvidence:deviceEvidence({ afterVersionName:'wrong-version' }),
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.reasons.includes('DEVICE_TARGET_VERSION_NAME_MISMATCH'), true);
});
