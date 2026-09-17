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
    beforeVersionCode: expected.baselineVersionCode,
    afterVersionCode: expected.targetVersionCode,
    launchedAfterInstall: true,
    readbackVersionCode: expected.targetVersionCode,
    persistenceProbe: {
      key: 'owner-acceptance-probe',
      before: 'preserve-me',
      after: 'preserve-me',
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

test('identity, downgrade, readback and persistence contradictions fail closed', async () => {
  const { evaluateAndroidInstallAcceptance } = await loadModule();

  const wrongSigner = evaluateAndroidInstallAcceptance({
    expected,
    staticEvidence,
    deviceEvidence: deviceEvidence({ installedSignerCertificateSha256: 'b'.repeat(64) }),
  });
  assert.equal(wrongSigner.status, 'FAIL');
  assert.equal(wrongSigner.reasons.includes('DEVICE_SIGNER_MISMATCH'), true);

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
      persistenceProbe: { key: 'owner-acceptance-probe', before: 'preserve-me', after: null },
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
