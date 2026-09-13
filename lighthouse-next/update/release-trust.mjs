import { assertPackageScopeAllowed } from './package-policy.mjs';

function parseVersion(value) {
  const match = String(value ?? '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) throw new TypeError(`Invalid semantic version: ${value}`);
  return match.slice(1).map(Number);
}

function compareVersion(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(payloadBytes) {
  const bytes = payloadBytes instanceof Uint8Array ? payloadBytes : new Uint8Array(payloadBytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

function assertProvenance(manifest) {
  if (typeof manifest.source_commit !== 'string' || manifest.source_commit.trim() === '') {
    throw new Error('Release provenance is missing source_commit');
  }
  if (!manifest.build_provenance || typeof manifest.build_provenance !== 'object' || Array.isArray(manifest.build_provenance) || Object.keys(manifest.build_provenance).length === 0) {
    throw new Error('Release provenance is missing build_provenance');
  }
}

function assertCompatibility(manifest, currentVersion) {
  if (compareVersion(currentVersion, manifest.min_current_version) < 0) {
    throw new Error('Current version is not compatible with release minimum');
  }
  if (manifest.max_current_version && compareVersion(currentVersion, manifest.max_current_version) > 0) {
    throw new Error('Current version is not compatible with release maximum');
  }
  if (compareVersion(manifest.version, currentVersion) <= 0) {
    throw new Error('Release version must be newer than current version');
  }
}

export async function verifyRelease({ manifest, payloadBytes, expectedAppId, currentVersion, trustedVerifier } = {}) {
  if (!manifest || typeof manifest !== 'object') throw new TypeError('Release manifest is required');
  if (!payloadBytes) throw new TypeError('Release payload is required');
  if (!trustedVerifier || typeof trustedVerifier.verifyManifest !== 'function') throw new TypeError('Release verifier is required');

  if (manifest.app_id !== expectedAppId) throw new Error('Release app identity does not match target app');
  assertCompatibility(manifest, currentVersion);
  assertProvenance(manifest);
  assertPackageScopeAllowed({ packageType: manifest.package_type, requestedScopes: manifest.allowed_scope });

  const actualDigest = await sha256(payloadBytes);
  if (actualDigest !== manifest.payload_hash) throw new Error('Release payload digest mismatch');

  const evidence = await trustedVerifier.verifyManifest(manifest);
  if (!evidence || evidence.verified !== true) throw new Error('Release manifest verification failed');
  if (evidence.signingIdentity !== manifest.signing_identity) throw new Error('Release identity evidence mismatch');

  return Object.freeze({
    verified: true,
    appId: manifest.app_id,
    releaseId: manifest.release_id,
    version: manifest.version,
    channel: manifest.channel,
    packageType: manifest.package_type,
    payloadHash: actualDigest,
    signingIdentity: manifest.signing_identity,
    sourceCommit: manifest.source_commit,
  });
}

export { compareVersion };
