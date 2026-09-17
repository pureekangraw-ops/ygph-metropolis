export const ANDROID_INSTALL_ACCEPTANCE_STATUS = Object.freeze({
  VERIFY: 'VERIFY',
  PASS: 'PASS',
  FAIL: 'FAIL',
});

const HEX_64 = /^[0-9a-f]{64}$/i;

function cleanSigner(value) {
  return String(value ?? '').replaceAll(':', '').trim().toLowerCase();
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function sameValue(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function freezeResult(status, reasons, expected) {
  return Object.freeze({
    status,
    reasons: Object.freeze([...reasons]),
    applicationId: expected.applicationId,
    baselineVersionCode: expected.baselineVersionCode,
    targetVersionCode: expected.targetVersionCode,
    targetVersionName: expected.targetVersionName,
  });
}

function validateExpected(expected) {
  if (!expected || typeof expected !== 'object') throw new TypeError('ANDROID_ACCEPTANCE_EXPECTED_REQUIRED');
  if (typeof expected.applicationId !== 'string' || expected.applicationId.trim() === '') {
    throw new TypeError('ANDROID_ACCEPTANCE_APP_ID_REQUIRED');
  }
  const signer = cleanSigner(expected.signerCertificateSha256);
  if (!HEX_64.test(signer)) throw new TypeError('ANDROID_ACCEPTANCE_SIGNER_REQUIRED');
  if (!isPositiveInteger(expected.baselineVersionCode)) throw new TypeError('ANDROID_ACCEPTANCE_BASELINE_VERSION_INVALID');
  if (!isPositiveInteger(expected.targetVersionCode)) throw new TypeError('ANDROID_ACCEPTANCE_TARGET_VERSION_INVALID');
  if (expected.targetVersionCode <= expected.baselineVersionCode) throw new TypeError('ANDROID_ACCEPTANCE_TARGET_NOT_NEWER');
  if (typeof expected.targetVersionName !== 'string' || expected.targetVersionName.trim() === '') {
    throw new TypeError('ANDROID_ACCEPTANCE_VERSION_NAME_REQUIRED');
  }
  return Object.freeze({ ...expected, signerCertificateSha256: signer });
}

function evaluateStaticEvidence(expected, evidence) {
  if (!evidence || typeof evidence !== 'object') return { status: 'VERIFY', reasons: ['STATIC_EVIDENCE_REQUIRED'] };

  const required = ['applicationId', 'signerCertificateSha256', 'versionCode', 'versionName', 'apkSha256'];
  if (required.some((key) => evidence[key] === undefined || evidence[key] === null || evidence[key] === '')) {
    return { status: 'VERIFY', reasons: ['STATIC_EVIDENCE_INCOMPLETE'] };
  }

  const reasons = [];
  if (evidence.applicationId !== expected.applicationId) reasons.push('STATIC_APP_ID_MISMATCH');
  if (cleanSigner(evidence.signerCertificateSha256) !== expected.signerCertificateSha256) reasons.push('STATIC_SIGNER_MISMATCH');
  if (evidence.versionCode !== expected.targetVersionCode) reasons.push('STATIC_VERSION_CODE_MISMATCH');
  if (evidence.versionName !== expected.targetVersionName) reasons.push('STATIC_VERSION_NAME_MISMATCH');
  if (!HEX_64.test(String(evidence.apkSha256))) reasons.push('STATIC_APK_SHA256_INVALID');

  return reasons.length ? { status: 'FAIL', reasons } : { status: 'PASS', reasons: [] };
}

function evaluateDeviceEvidence(expected, evidence) {
  if (!evidence || typeof evidence !== 'object') return { status: 'VERIFY', reasons: ['DEVICE_EVIDENCE_REQUIRED'] };

  const required = [
    'installMode',
    'installedApplicationId',
    'installedSignerCertificateSha256',
    'beforeVersionCode',
    'afterVersionCode',
    'launchedAfterInstall',
    'readbackVersionCode',
    'persistenceProbe',
  ];
  if (required.some((key) => evidence[key] === undefined || evidence[key] === null)) {
    return { status: 'VERIFY', reasons: ['DEVICE_EVIDENCE_INCOMPLETE'] };
  }

  const probe = evidence.persistenceProbe;
  if (!probe || typeof probe !== 'object' || typeof probe.key !== 'string' || probe.key.trim() === '' ||
      probe.before === undefined || probe.after === undefined) {
    return { status: 'VERIFY', reasons: ['DEVICE_EVIDENCE_INCOMPLETE'] };
  }

  const reasons = [];
  if (evidence.installMode !== 'INSTALL_OVER') reasons.push('DEVICE_NOT_INSTALL_OVER');
  if (evidence.installedApplicationId !== expected.applicationId) reasons.push('DEVICE_APP_ID_MISMATCH');
  if (cleanSigner(evidence.installedSignerCertificateSha256) !== expected.signerCertificateSha256) {
    reasons.push('DEVICE_SIGNER_MISMATCH');
  }
  if (evidence.beforeVersionCode !== expected.baselineVersionCode) reasons.push('DEVICE_BASELINE_VERSION_MISMATCH');
  if (evidence.afterVersionCode !== expected.targetVersionCode) reasons.push('DEVICE_TARGET_VERSION_MISMATCH');
  if (!isPositiveInteger(evidence.beforeVersionCode) || !isPositiveInteger(evidence.afterVersionCode) ||
      evidence.afterVersionCode <= evidence.beforeVersionCode) {
    reasons.push('DEVICE_VERSION_NOT_MONOTONIC');
  }
  if (evidence.launchedAfterInstall !== true) reasons.push('DEVICE_POST_INSTALL_LAUNCH_MISSING');
  if (evidence.readbackVersionCode !== expected.targetVersionCode) reasons.push('DEVICE_VERSION_READBACK_MISMATCH');
  if (!sameValue(probe.before, probe.after)) reasons.push('PERSISTENCE_READBACK_MISMATCH');

  return reasons.length ? { status: 'FAIL', reasons } : { status: 'PASS', reasons: [] };
}

export function evaluateAndroidInstallAcceptance({ expected, staticEvidence, deviceEvidence } = {}) {
  const normalizedExpected = validateExpected(expected);
  const staticResult = evaluateStaticEvidence(normalizedExpected, staticEvidence);
  if (staticResult.status !== 'PASS') {
    return freezeResult(staticResult.status, staticResult.reasons, normalizedExpected);
  }

  const deviceResult = evaluateDeviceEvidence(normalizedExpected, deviceEvidence);
  return freezeResult(deviceResult.status, deviceResult.reasons, normalizedExpected);
}

export function assertAndroidInstallAccepted(result) {
  if (!result || result.status !== ANDROID_INSTALL_ACCEPTANCE_STATUS.PASS) {
    const status = result?.status ?? 'UNKNOWN';
    throw new Error(`ANDROID_INSTALL_NOT_ACCEPTED:${status}`);
  }
  return result;
}
